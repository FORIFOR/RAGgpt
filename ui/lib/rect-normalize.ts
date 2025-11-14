import type { NormalizedRect } from "@/types/highlight";

type ViewportLike = {
  convertToViewportRectangle: (rect: number[]) => Float32Array | number[];
  width: number;
  height: number;
};

const sanitizePdfTuple = (rect: ArrayLike<number> | number[]): [number, number, number, number] | null => {
  if (!rect) return null;
  const tuple = Array.from(rect).slice(0, 4).map((value) => Number(value));
  if (tuple.length < 4) return null;
  if (!tuple.every((value) => Number.isFinite(value))) {
    return null;
  }
  return tuple as [number, number, number, number];
};

const flattenRectList = (
  rects: ArrayLike<number>[][] | ArrayLike<number>[],
): ArrayLike<number>[] => {
  if (!Array.isArray(rects) || rects.length === 0) {
    return [];
  }
  const first = rects[0];
  if (Array.isArray(first) && Array.isArray((first as any)[0])) {
    return (rects as Array<ArrayLike<number>[]>).flat();
  }
  return rects as ArrayLike<number>[];
};

// PDF座標(左下原点) -> viewport CSS座標 -> 正規化
export function pdfRectsToNormalized(
  pdfRects: ArrayLike<number>[][] | ArrayLike<number>[],
  viewport: ViewportLike,
  pageIndex: number,
  source: "server" | "fallback" = "server",
): NormalizedRect[] {
  const flattened = flattenRectList(pdfRects);
  const tuples = flattened
    .map((rect) => sanitizePdfTuple(rect))
    .filter((rect): rect is [number, number, number, number] => Boolean(rect));
  if (!tuples.length) {
    return [];
  }

  const boxes = tuples.map((rect) => {
    const converted = viewport.convertToViewportRectangle(rect as number[]);
    return Array.from(converted);
  });

  const w = viewport.width || 1;
  const h = viewport.height || 1;

  return boxes.map((box, idx) => {
    const [x1, y1, x2, y2] = box;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return {
      pageIndex,
      x: left / w,
      y: top / h,
      width: width / w,
      height: height / h,
      id: `${pageIndex}-${idx}`,
      source,
    };
  });
}

// 正規化 -> ピクセル
export function denormalizeRects(
  rects: NormalizedRect[],
  viewport: { width: number; height: number },
): Array<NormalizedRect & { abs: { left: number; top: number; width: number; height: number } }> {
  const w = viewport.width || 1;
  const h = viewport.height || 1;
  return rects.map((rect) => ({
    ...rect,
    abs: {
      left: rect.x * w,
      top: rect.y * h,
      width: rect.width * w,
      height: rect.height * h,
    },
  }));
}
