export type NormalizedRect = {
  pageIndex: number; // 0-based
  x: number; // 0..1 (left)
  y: number; // 0..1 (top)
  width: number; // 0..1
  height: number; // 0..1
  id: string;
  source?: "server" | "fallback";
};

