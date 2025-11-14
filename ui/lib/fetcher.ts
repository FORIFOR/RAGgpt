export async function apiFetch(path: string, init: RequestInit = {}) {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE || "/api";
    const url = base.startsWith("/") ? `${base}${path}` : `${base}${path}`;
    const apiKey = process.env.NEXT_PUBLIC_API_KEY || '';
    const headers = { "Content-Type": "application/json", ...(apiKey ? { 'x-api-key': apiKey } : {}), ...(init.headers || {}) } as HeadersInit;
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upstream ${res.status}: ${text.slice(0, 500)}`);
    }
    return res;
  } catch (e: any) {
    // ENOTFOUND, ECONNREFUSED 等を明示
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'upstream_unreachable',
        detail: e?.message || String(e),
        target: path,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
