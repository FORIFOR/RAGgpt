export function normalizeJa(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .replace(/[\u00A0\u200B\u200C\u200D]/g, "")
    .replace(/[\s\t\r\n]+/g, " ")
    .trim();
}

export function splitSentencesJa(text: string): string[] {
  if (!text) return [];
  try {
    if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
      const segmenter = new Intl.Segmenter("ja", { granularity: "sentence" });
      return Array.from(segmenter.segment(text))
        .map((segment) => segment.segment.trim())
        .filter(Boolean);
    }
  } catch {
    // ignore and fallback
  }
  return text
    .split(/(?<=[。．.！!？?])/)
    .map((part) => part.trim())
    .filter(Boolean);
}
