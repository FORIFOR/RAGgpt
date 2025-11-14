export const UTF8_DEBUG = process.env.NEXT_PUBLIC_DEBUG_UTF8 === '1';

export function dumpBytes(label: string, buf: Uint8Array) {
  if (!UTF8_DEBUG) return;
  try {
    const head = Array.from(buf.slice(0, 32));
    // eslint-disable-next-line no-console
    console.debug(`[utf8] ${label} bytes[0:32]=`, head);
  } catch {}
}

