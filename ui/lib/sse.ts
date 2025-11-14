/**
 * Server-Sent Events (SSE) utility for streaming responses
 * Replaces Axios calls that cannot handle SSE properly in browsers
 */

export interface SSEHandlers<T = any> {
  onToken?: (token: string) => void;
  onStatus?: (status: any) => void;
  onDone?: (final?: T) => void;
  onError?: (message: string) => void;
}

/**
 * Post JSON payload and handle SSE response stream
 * @param url API endpoint URL
 * @param payload Request payload
 * @param handlers Event handlers for different SSE event types
 */
export async function postSSE<T = any>(
  url: string,
  payload: any,
  handlers: SSEHandlers<T>
): Promise<void> {
  try {
    console.log(`[sse] Starting SSE request to ${url}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const errorText = await res.text().catch(() => `HTTP ${res.status}`);
      console.error(`[sse] Request failed:`, errorText);
      handlers.onError?.(`HTTP ${res.status}: ${errorText}`);
      return;
    }

    console.log(`[sse] Response received, starting stream processing`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`[sse] Stream completed`);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            console.log(`[sse] Received completion signal`);
            handlers.onDone?.();
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'status') {
              console.log(`[sse] Status:`, parsed);
              handlers.onStatus?.(parsed);
            } else if (parsed.type === 'token' && parsed.delta) {
              handlers.onToken?.(parsed.delta);
            } else if (parsed.citations) {
              console.log(`[sse] Final result with citations:`, parsed.citations.length);
              handlers.onDone?.(parsed as T);
            } else if (parsed.delta) {
              // Handle direct delta tokens
              handlers.onToken?.(parsed.delta);
            }
          } catch (parseError) {
            // Non-JSON data might be raw token
            if (data && data !== '') {
              handlers.onToken?.(data);
            }
          }
        } else if (line.startsWith('event: ')) {
          // Handle event types if needed
          const eventType = line.slice(7).trim();
          console.log(`[sse] Event type:`, eventType);
        }
      }
    }

    // Final completion call if not already called
    handlers.onDone?.();

  } catch (error: any) {
    console.error(`[sse] Network or processing error:`, error);
    handlers.onError?.(error?.message || 'Network error occurred');
  }
}

/**
 * Parse SSE event data line
 * @param line SSE data line 
 * @returns Parsed event data or null
 */
export function parseSSELine(line: string): any | null {
  if (!line.startsWith('data: ')) return null;
  
  const data = line.slice(6).trim();
  if (data === '[DONE]') return { type: 'done' };
  
  try {
    return JSON.parse(data);
  } catch {
    return { type: 'token', delta: data };
  }
}