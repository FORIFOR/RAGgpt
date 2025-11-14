// Heuristic fixer for typical UTF-8-as-latin1 mojibake (e.g. "ããŒ").
// If the string looks mojibake'd, reinterpret its codepoints as latin1 bytes and decode as UTF-8.
export function fixMojibake(s: string): string {
  if (!s) return s;
  // Quick reject: if it does not contain typical markers, skip
  if (s.indexOf('ã') === -1 && s.indexOf('â') === -1) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Accept only if it reduces mojibake markers
    const score = (t: string) => (t.match(/ã|â/g) || []).length;
    return score(decoded) < score(s) ? decoded : s;
  } catch {
    return s;
  }
}

