import { normalizeJa, splitSentencesJa } from "./text-normalize";

export type NotebookCitation = {
  id?: string;
  doc_id?: string;
  page?: number;
  text?: string;
  snippet?: string;
  title?: string;
  uri?: string;
  quote?: string;
};

export type SentenceSegment = {
  text: string;
  citationIndices: number[];
};

export type SentenceAttribution = {
  segments: SentenceSegment[];
  citations: NotebookCitation[];
};

function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const rows = a.length;
  const cols = b.length;
  const dp = new Array(cols + 1).fill(0);
  let max = 0;
  for (let i = 1; i <= rows; i += 1) {
    let prev = 0;
    for (let j = 1; j <= cols; j += 1) {
      const tmp = dp[j];
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        dp[j] = prev + 1;
        if (dp[j] > max) {
          max = dp[j];
        }
      } else {
        dp[j] = 0;
      }
      prev = tmp;
    }
  }
  return max;
}

function scoreMatch(sentence: string, snippet: string): number {
  if (!sentence || !snippet) return 0;
  const normalizedSentence = normalizeJa(sentence);
  const normalizedSnippet = normalizeJa(snippet);
  if (!normalizedSentence || !normalizedSnippet) return 0;
  if (normalizedSentence.includes(normalizedSnippet)) {
    return normalizedSnippet.length / normalizedSentence.length;
  }
  const overlap = longestCommonSubstring(normalizedSentence, normalizedSnippet);
  return overlap / Math.min(normalizedSnippet.length, normalizedSentence.length);
}

export function buildSentenceAttribution(
  content: string,
  citations: NotebookCitation[]
): SentenceAttribution {
  const sentences = splitSentencesJa(content);
  if (sentences.length === 0 && content.trim().length > 0) {
    sentences.push(content.trim());
  }
  const normalizedCitations = citations.map((citation, index) => ({
    citation: {
      ...citation,
      id: citation.id ? String(citation.id) : undefined,
    },
    normalized: normalizeJa(
      citation.snippet || citation.text || citation.title || ""
    ),
    index,
  }));

  const citationUsage = new Map<number, number>();
  const registerCitation = (citationIndex: number) => {
    citationUsage.set(
      citationIndex,
      (citationUsage.get(citationIndex) ?? 0) + 1,
    );
  };

  const citationOrder = new Map<number, number>();
  const orderedCitations: NotebookCitation[] = [];
  const segments: SentenceSegment[] = sentences.map((sentence) => {
    const ranked = normalizedCitations
      .map(({ citation, normalized, index }) => ({
        index,
        score: normalized ? scoreMatch(sentence, normalized) : 0,
      }))
      .filter((item) => item.score > 0.15)
      .sort((a, b) => b.score - a.score);

    const chosen: number[] = [];
    for (const item of ranked) {
      if (chosen.length >= 2) break;
      chosen.push(item.index);
      registerCitation(item.index);
    }

    if (chosen.length === 0 && normalizedCitations.length > 0) {
      const fallback = normalizedCitations
        .map(({ index }) => ({
          index,
          used: citationUsage.get(index) ?? 0,
        }))
        .sort((a, b) => a.used - b.used)
        .slice(0, Math.min(2, normalizedCitations.length))
        .map((item) => item.index);
      fallback.forEach((idx) => registerCitation(idx));
      chosen.push(
        ...fallback.filter((idx) => !chosen.includes(idx)).slice(0, 2)
      );
    }

    chosen.forEach((idx) => {
      if (!citationOrder.has(idx)) {
        citationOrder.set(idx, orderedCitations.length);
        orderedCitations.push(normalizedCitations[idx].citation);
      }
    });

    const citationIndices = chosen
      .map((idx) => citationOrder.get(idx))
      .filter((value): value is number => typeof value === "number")
      .slice(0, 2);

    return {
      text: sentence,
      citationIndices,
    };
  });

  return {
    segments,
    citations: orderedCitations,
  };
}
