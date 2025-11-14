import { fixMojibake } from './utf8';
import { UTF8_DEBUG, dumpBytes } from '@/lib/debug';

export async function readSSE(
  res: Response,
  h: {
    onOpen?: () => void;
    onStatus?: (j: any) => void;
    onToken?: (t: string) => void;
    onCitations?: (c: any[]) => void;
    onError?: (m: string) => void;
    onDone?: (meta?: any) => void;
  }
) {
  if (!res.ok || !res.body) { h.onError?.(`upstream ${res.status}`); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  h.onOpen?.();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && UTF8_DEBUG) dumpBytes('sse:chunk', value);
    buf += dec.decode(value, { stream: true });
    if (UTF8_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[utf8] sse:decoded.tail=', buf.slice(Math.max(0, buf.length-120)).replace(/\n/g,'⏎'))
    }
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!frame) continue;
      const lines = frame.split("\n");
      let ev = "message", data = "";
      for (const ln of lines) {
        if (ln.startsWith("event:")) ev = ln.slice(6).trim();
        else if (ln.startsWith("data:")) data += ln.slice(5).trim();
      }
      try {
        // 2系統サポート: (A) data={type:..}、(B) event + data={...}
        const obj = data ? JSON.parse(data) : {};
        const inferred = (obj.type || ev || "").toLowerCase();
        if (inferred === "status") {
          h.onStatus?.(obj);
        } else if (inferred === "token") {
          const raw = obj.delta ?? obj.text ?? obj.payload ?? "";
          const delta = typeof raw === 'string' ? fixMojibake(raw) : String(raw || '');
          if (UTF8_DEBUG) {
            // eslint-disable-next-line no-console
            console.debug('[utf8] sse:event.raw=', String(raw).slice(0,60));
            // eslint-disable-next-line no-console
            console.debug('[utf8] sse:event.fixed=', delta.slice(0,60));
          }
          if (delta) h.onToken?.(delta);
        } else if (inferred === "citations") {
          h.onCitations?.(obj.citations || obj.payload || []);
        } else if (inferred === "error") {
          h.onError?.(obj.message || obj.error || "error");
        } else if (inferred === "final" || inferred === "done") {
          h.onDone?.(obj);
        } else if (inferred === "meta") {
          h.onStatus?.(obj);
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  h.onDone?.();
}
