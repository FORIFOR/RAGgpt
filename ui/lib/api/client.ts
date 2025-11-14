/**
 * HTTP/SSE Client wrapper with timeout, cancellation, and retry support
 */

export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Generic POST JSON request with timeout and retry
 */
export async function postJSON<T>(
  url: string,
  body: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const {
    timeout = 30000,
    retries = 0,
    retryDelay = 1000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        },
        body: JSON.stringify(body),
        signal: fetchOptions.signal || controller.signal,
        ...fetchOptions,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new APIError(
          `HTTP ${response.status}: ${errorText || response.statusText}`,
          response.status
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof APIError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          lastError = new APIError(`Request timeout after ${timeout}ms`);
        } else {
          lastError = new APIError(
            `Network error: ${error.message}`,
            undefined,
            "NETWORK_ERROR"
          );
        }
      } else {
        lastError = new APIError("Unknown error occurred");
      }

      if (attempt === retries) {
        throw lastError;
      }
    }
  }

  throw lastError || new APIError("Request failed after retries");
}

/**
 * Server-Sent Events stream generator
 * Yields parsed SSE events with proper error handling
 */
export async function* sseStream<T = any>(
  url: string,
  body: unknown,
  options: RequestOptions = {}
): AsyncGenerator<{ event: string; data: T }> {
  const {
    timeout = 120000, // 2 minutes for SSE
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...fetchOptions.headers,
      },
      body: JSON.stringify(body),
      signal: fetchOptions.signal || controller.signal,
      ...fetchOptions,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new APIError(
        `HTTP ${response.status}: ${errorText || response.statusText}`,
        response.status
      );
    }

    if (!response.body) {
      throw new APIError("No response body for SSE stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue; // ping/keep-alive

            try {
              const data = JSON.parse(dataStr) as T;
              yield { event: currentEvent, data };
              currentEvent = "message"; // Reset to default
            } catch (parseError) {
              // If JSON parse fails, yield as plain text
              yield { event: currentEvent, data: dataStr as T };
              currentEvent = "message";
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}

/**
 * GET request wrapper
 */
export async function getJSON<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...fetchOptions.headers,
      },
      signal: fetchOptions.signal || controller.signal,
      ...fetchOptions,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new APIError(
        `HTTP ${response.status}: ${errorText || response.statusText}`,
        response.status
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof APIError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new APIError(`Request timeout after ${timeout}ms`);
    }

    throw new APIError(
      `Network error: ${error instanceof Error ? error.message : "Unknown"}`,
      undefined,
      "NETWORK_ERROR"
    );
  }
}
