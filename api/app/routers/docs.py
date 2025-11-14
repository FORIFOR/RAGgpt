import logging
import os
import re
import unicodedata
from pathlib import Path
from typing import List, Optional, Sequence, Tuple
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, Response

try:  # pragma: no cover - optional dependency in some environments
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover
    fitz = None
    FITZ_IMPORT_ERROR = exc
else:  # pragma: no cover
    FITZ_IMPORT_ERROR = None

try:  # External dependency for Unicode-aware regex
    import regex as regex
except ImportError as exc:  # pragma: no cover
    regex = None
    REGEX_IMPORT_ERROR = exc
else:  # pragma: no cover
    REGEX_IMPORT_ERROR = None

router = APIRouter(prefix="/docs", tags=["docs"])
logger = logging.getLogger(__name__)
RECTS_IMPL_VERSION = "chars-v2025-11-18"


def _extract_text_context(text: str, needle: str, radius: int = 80) -> str | None:
    if not text or not needle:
        return None
    idx = text.find(needle)
    if idx == -1:
        return None
    start = max(0, idx - radius)
    end = min(len(text), idx + len(needle) + radius)
    snippet = text[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet += "…"
    return snippet


def _log_rect_debug(
    *,
    doc_id: str,
    page: int,
    engine: str,
    phrase: str,
    normalized_phrase: str,
    raw_terms: Sequence[str],
    normalized_terms: Sequence[str],
    rects: Sequence[Sequence[float]],
    page_text: str,
) -> None:
    rect_preview = [
        {
            "bbox": [
                round(float(rect[0]), 1),
                round(float(rect[1]), 1),
                round(float(rect[2]), 1),
                round(float(rect[3]), 1),
            ],
            "area": round(float(rect[2] - rect[0]) * float(rect[3] - rect[1]), 1),
        }
        for rect in (rects or [])[:5]
    ]
    context = (
        _extract_text_context(page_text, phrase)
        or _extract_text_context(page_text, normalized_phrase)
        or next(
            (
                snippet
                for term in list(raw_terms) + list(normalized_terms)
                if term
                for snippet in [_extract_text_context(page_text, term)]
                if snippet
            ),
            None,
        )
    )
    logger.info(
        "[RectsDebug] doc=%s page=%s engine=%s rect_count=%s phrase=%r terms=%s normalized_terms=%s",
        doc_id,
        page,
        engine,
        len(rects or []),
        phrase,
        list(raw_terms),
        list(normalized_terms),
    )
    if context:
        logger.info("[RectsDebug] context=%s", context)
    if rect_preview:
        logger.info("[RectsDebug] rect_preview=%s", rect_preview)

CHAR_TEXT_FLAGS = 0
if fitz is not None:  # pragma: no cover - depends on optional dependency
    CHAR_TEXT_FLAGS = (
        getattr(fitz, "TEXT_PRESERVE_LIGATURES", 0)
        | getattr(fitz, "TEXT_PRESERVE_WHITESPACE", 0)
    )

_REGEX_SPACE_PUNCT = regex.compile(r"[\s\u3000\p{P}]+") if regex else None
if regex:
    _JAPANESE_CHAR_PATTERN = regex.compile(r"[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ーｰ々〆ヵヶ]")
else:
    _JAPANESE_CHAR_PATTERN = re.compile(
        r"["
        r"\u3005\u3007\u303B"
        r"\u3040-\u309F"
        r"\u30A0-\u30FF"
        r"\u31F0-\u31FF"
        r"\u3400-\u4DBF"
        r"\u4E00-\u9FFF"
        r"\uFF66-\uFF9F"
        r"々〆ヵヶーｰ"
        r"]"
    )


def _nfkc(value: str | None) -> str:
    if not value:
        return ""
    return unicodedata.normalize("NFKC", value).replace(" ", "").replace("\u3000", "")


_DASH_PATTERN = re.compile(r"[‐\-–—−]")
_SPACE_PATTERN = re.compile(r"\s+")
RELAXED_WINDOWS = (96, 80, 64, 56, 48, 40, 32, 28, 24, 20, 16, 12)


def _norm(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    if _REGEX_SPACE_PUNCT:
        normalized = _REGEX_SPACE_PUNCT.sub("", normalized)
    else:
        normalized = _SPACE_PATTERN.sub("", normalized)
    normalized = _DASH_PATTERN.sub("-", normalized)
    return normalized.lower()


def _normalize_for_match(value: str | None) -> str:
    if not value:
        return ""
    if regex is None:  # pragma: no cover - dependency missing
        raise HTTPException(
            status_code=500,
            detail=f"'regex' module is required for PDF highlighting: {REGEX_IMPORT_ERROR}",
        )
    normalized = unicodedata.normalize("NFKC", value or "")
    return _REGEX_SPACE_PUNCT.sub("", normalized) if _REGEX_SPACE_PUNCT else normalized


def _iter_chars(page: "fitz.Page") -> List[Tuple[str, Optional[Tuple[float, float, float, float]]]]:
    if fitz is None:
        return []
    try:
        text_page = page.get_textpage(flags=CHAR_TEXT_FLAGS or 0)
        raw = text_page.extractDICT()
    except Exception as exc:  # pragma: no cover
        logger.debug("char extraction failed on page %s: %s", getattr(page, "number", "?"), exc)
        return []

    height = float(page.rect.height)
    chars: List[Tuple[str, Optional[Tuple[float, float, float, float]]]] = []
    for block in raw.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                span_chars = span.get("chars")
                if span_chars:
                    for ch in span_chars:
                        glyph = ch.get("c", "")
                        bbox = ch.get("bbox")
                        rect = None
                        if glyph and bbox and len(bbox) == 4:
                            x0, y0, x1, y1 = bbox
                            rect = (
                                float(x0),
                                float(height - y1),
                                float(x1),
                                float(height - y0),
                            )
                        chars.append((glyph, rect))
                else:
                    text = span.get("text", "")
                    bbox = span.get("bbox")
                    if not text or not bbox:
                        continue
                    x0, y0, x1, y1 = bbox
                    width = (x1 - x0) / max(1, len(text))
                    for idx, glyph in enumerate(text):
                        rect = (
                            float(x0 + idx * width),
                            float(height - y1),
                            float(x0 + (idx + 1) * width),
                            float(height - y0),
                        )
                        chars.append((glyph, rect))
            chars.append(("\n", None))
    return chars


def _prepare_char_stream(
    chars: Sequence[Tuple[str, Optional[Tuple[float, float, float, float]]]],
) -> Tuple[str, List[Tuple[float, float, float, float]]]:
    stream_chars: List[str] = []
    boxes: List[Tuple[float, float, float, float]] = []
    for glyph, bbox in chars:
        if glyph == "\n" or not glyph or bbox is None:
            continue
        normalized = _normalize_for_match(glyph)
        if not normalized:
            continue
        for _ in normalized:
            stream_chars.append(_)
            boxes.append(bbox)
    return "".join(stream_chars), boxes


def _find_char_term_rects(
    stream: str,
    boxes: Sequence[Tuple[float, float, float, float]],
    normalized_term: str,
    *,
    pad: float = 0.5,
) -> List[List[float]]:
    if not stream or not boxes or not normalized_term:
        return []
    rects: List[List[float]] = []
    idx = 0
    length = len(normalized_term)
    while True:
        pos = stream.find(normalized_term, idx)
        if pos < 0:
            break
        end = min(len(boxes), pos + length)
        segment = boxes[pos:end]
        if segment:
            x0 = min(box[0] for box in segment)
            y0 = min(box[1] for box in segment)
            x1 = max(box[2] for box in segment)
            y1 = max(box[3] for box in segment)
            rects.append([x0 - pad, y0 - pad, x1 + pad, y1 + pad])
        idx = pos + 1
    return rects


def _extract_spans(page: "fitz.Page") -> List[Tuple[str, "fitz.Rect"]]:
    try:
        raw = page.get_text("rawdict") or {}
    except Exception as exc:  # pragma: no cover - PyMuPDF internals
        logger.debug("span extraction failed on page %s: %s", getattr(page, "number", "?"), exc)
        return []

    spans: List[Tuple[str, "fitz.Rect"]] = []
    for block in raw.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                bbox = span.get("bbox")
                if not text or not text.strip() or not bbox:
                    continue
                spans.append((text, fitz.Rect(bbox)))
    return spans


def _extract_chars(page: "fitz.Page") -> List[Tuple[str, List[float]]]:
    """
    Char-level extraction fallback for Japanese CID fonts / ligatures / Type3
    that return empty from rawdict/spans. Extracts each character with its bbox.
    Returns: [(char, [x0, y0, x1, y1]), ...]
    """
    if fitz is None:
        return []
    try:
        tp = page.get_textpage(flags=CHAR_TEXT_FLAGS or 0)
        dd = tp.extractDICT()
    except Exception as exc:  # pragma: no cover
        logger.debug("char extraction fallback failed on page %s: %s", getattr(page, "number", "?"), exc)
        return []

    chars: List[Tuple[str, List[float]]] = []
    for block in dd.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                for ch in span.get("chars", []):
                    c = ch.get("c")
                    bbox = ch.get("bbox")
                    if c and bbox:
                        chars.append((c, list(bbox)))
    return chars


def _build_char_norm_index(
    chars: Sequence[Tuple[str, Sequence[float]]],
) -> Tuple[str, List[int]]:
    if not chars:
        return "", []
    raw = "".join(ch for ch, _ in chars)
    norm_text = _norm(raw)
    positions: List[int] = []
    acc = 0
    for ch, _ in chars:
        delta = len(_norm(ch))
        acc += delta
        positions.append(acc)
    return norm_text, positions


def _find_rects_by_terms(
    chars: Sequence[Tuple[str, Sequence[float]]],
    positions: Sequence[int],
    norm_text: str,
    page_height: float,
    terms: Sequence[str],
    *,
    y_tolerance: float = 2.5,
    x_gap: float = 2.0,
) -> List[List[float]]:
    if not chars or not norm_text or not terms:
        return []

    ranges: List[Tuple[int, int]] = []
    for raw in terms or []:
        target = _norm(raw)
        if not target:
            continue
        start = 0
        while True:
            idx = norm_text.find(target, start)
            if idx == -1:
                break
            ranges.append((idx, idx + len(target)))
            start = idx + 1
    if not ranges:
        return []

    def idx_of(norm_idx: int) -> int:
        if not positions:
            return 0
        lo, hi = 0, len(positions) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if positions[mid] >= norm_idx:
                hi = mid
            else:
                lo = mid + 1
        return lo

    rects: List[List[float]] = []
    for start, end in ranges:
        if end <= start:
            continue
        i0 = idx_of(max(start, 0))
        i1 = idx_of(max(end - 1, 0)) + 1
        boxes = [
            [float(coord) for coord in chars[i][1]]
            for i in range(max(i0, 0), min(i1, len(chars)))
        ]
        if not boxes:
            continue

        line_clusters: List[Tuple[float, List[List[float]]]] = []
        for x0, y0, x1, y1 in boxes:
            yc = (y0 + y1) / 2.0
            bucket = None
            for idx, (line_y, _) in enumerate(line_clusters):
                if abs(line_y - yc) <= y_tolerance:
                    bucket = idx
                    break
            if bucket is None:
                line_clusters.append((yc, [[x0, y0, x1, y1]]))
            else:
                line_clusters[bucket][1].append([x0, y0, x1, y1])

        for _, segments in line_clusters:
            segments.sort(key=lambda rect: rect[0])
            current = segments[0]
            for segment in segments[1:]:
                if segment[0] - current[2] <= x_gap:
                    current[2] = max(current[2], segment[2])
                    current[3] = max(current[3], segment[3])
                    current[1] = min(current[1], segment[1])
                else:
                    rects.append(current)
                    current = segment
            rects.append(current)

    for rect in rects:
        rect[1], rect[3] = page_height - rect[3], page_height - rect[1]
    return rects


def _derive_terms_from_phrase(phrase: str | None) -> List[str]:
    normalized = _nfkc(phrase or "")
    if not normalized:
        return []
    units = re.findall(r"[一-龥ぁ-んァ-ンー]{2,}|[A-Za-z0-9_]{2,}", normalized)
    keep: List[str] = []
    for unit in units:
        if len(keep) >= 6:
            break
        if unit and unit not in keep:
            keep.append(unit)
    return keep


def _dedupe_rect_lists(rects: Sequence[Sequence[float]]) -> List[List[float]]:
    seen: set[Tuple[float, float, float, float]] = set()
    uniq: List[List[float]] = []
    for rect in rects or []:
        if not rect or len(rect) < 4:
            continue
        x0, y0, x1, y1 = (float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3]))
        key = (round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1))
        if key in seen:
            continue
        seen.add(key)
        uniq.append([x0, y0, x1, y1])
    return uniq

def _resolve_pdf_path(tenant: str, notebook_id: str, doc_id: str) -> Path:
    """Resolve the on-disk PDF path for the provided identifiers."""

    env_candidates = [
        os.getenv("RAG_DOCS_DIR"),
        os.getenv("RAG_SOURCE_DIR"),
        os.getenv("DOCS_DIR"),
    ]
    default_candidates = [
        "data/docs",
        "../data/docs",
        "../mcp-rag-server/data/source",
    ]

    parts = doc_id.split(":", 2)
    if len(parts) == 3:
        _, _, filename = parts
    else:
        filename = Path(doc_id).name

    bases: List[Path] = []
    for raw in env_candidates + default_candidates:
        if not raw:
            continue
        base = Path(raw).expanduser().resolve()
        bases.append(base)

    for base in bases:
        candidate = base / tenant / notebook_id / filename
        if candidate.exists():
            return candidate

    fallback_path = Path(doc_id).expanduser()
    if fallback_path.exists():
        return fallback_path.resolve()

    first_base = bases[0] if bases else Path("data/docs").resolve()
    return first_base / tenant / notebook_id / filename


def _ensure_backend_ready() -> None:
    if fitz is None:
        raise HTTPException(
            status_code=500,
            detail=f"PyMuPDF (fitz) is not installed: {FITZ_IMPORT_ERROR}",
        )


def nfkc_ja(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    normalized = normalized.replace("```", "")
    normalized = normalized.replace("$begin:math:display$", "").replace("$end:math:display$", "")
    normalized = re.sub(r"\s+", "", normalized)
    normalized = normalized.replace("‐", "-").replace("–", "-").replace("—", "-")
    return normalized


def _extract_japanese_chars(value: str | None) -> str:
    if not value:
        return ""
    normalized = nfkc_ja(value)
    if not normalized or _JAPANESE_CHAR_PATTERN is None:
        return ""
    return "".join(_JAPANESE_CHAR_PATTERN.findall(normalized))


def page_char_map(page: "fitz.Page") -> Tuple[List[Tuple[str, "fitz.Rect"]], str]:
    """Return [(normalized_char, rect)] along with concatenated normalized text."""

    sequence: List[Tuple[str, "fitz.Rect"]] = []
    try:
        rawdict = page.get_text("rawdict") or {}
    except Exception as exc:  # pragma: no cover - PyMuPDF internals
        logger.debug("rawdict extraction failed on page %s: %s", getattr(page, "number", "?"), exc)
        rawdict = {}

    for block in rawdict.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text:
                    continue
                chars = span.get("chars")
                if chars:
                    for ch in chars:
                        glyph = ch.get("c", "")
                        bbox = ch.get("bbox")
                        if not glyph or not bbox:
                            continue
                        rect = fitz.Rect(bbox)
                        normalized = nfkc_ja(glyph)
                        if normalized:
                            sequence.append((normalized, rect))
                else:
                    bbox = span.get("bbox")
                    if not bbox:
                        continue
                    rect = fitz.Rect(bbox)
                    width = rect.width / max(1, len(text))
                    cursor = rect.x0
                    for glyph in text:
                        sub_rect = fitz.Rect(cursor, rect.y0, cursor + width, rect.y1)
                        cursor += width
                        normalized = nfkc_ja(glyph)
                        if normalized:
                            sequence.append((normalized, sub_rect))

    if not sequence:
        fallback_chars = _extract_chars(page)
        if fallback_chars:
            for glyph, bbox in fallback_chars:
                if not glyph or not bbox or len(bbox) != 4:
                    continue
                try:
                    rect = fitz.Rect(bbox)
                except Exception:
                    continue
                normalized = nfkc_ja(glyph)
                if normalized:
                    sequence.append((normalized, rect))

    norm_text = "".join(char for char, _ in sequence)
    return sequence, norm_text


def _rect_to_list(rect: "fitz.Rect") -> List[float]:
    return [
        float(rect.x0),
        float(rect.y0),
        float(rect.x1),
        float(rect.y1),
    ]


def _build_relaxed_sequence(
    sequence: Sequence[Tuple[str, "fitz.Rect"]],
) -> Tuple[List[str], List["fitz.Rect"]]:
    if not sequence or _JAPANESE_CHAR_PATTERN is None:
        return [], []
    chars: List[str] = []
    rects: List["fitz.Rect"] = []
    for normalized, rect in sequence:
        if not normalized or rect is None:
            continue
        extracted = _extract_japanese_chars(normalized)
        if not extracted:
            continue
        for ch in extracted:
            chars.append(ch)
            rects.append(rect)
    return chars, rects


def _find_relaxed_ranges(
    text: str,
    target: str,
    *,
    max_matches: int = 16,
) -> List[Tuple[int, int, int]]:
    if not text or not target:
        return []

    matches: List[Tuple[int, int, int]] = []
    seen: set[Tuple[int, int]] = set()

    def _record(idx: int, length: int) -> bool:
        if idx < 0 or length <= 0:
            return False
        key = (idx, length)
        if key in seen:
            return False
        seen.add(key)
        matches.append((idx, idx + length, length))
        return len(matches) >= max_matches

    idx = text.find(target)
    if idx >= 0 and _record(idx, len(target)):
        return matches

    target_len = len(target)
    for window in RELAXED_WINDOWS:
        if window > target_len:
            continue
        step = max(6, window // 2)
        end_limit = target_len - window
        if end_limit < 0:
            continue
        starts = list(range(0, end_limit + 1, step))
        if starts[-1] != end_limit:
            starts.append(end_limit)
        chunk_seen: set[str] = set()
        for start in starts:
            chunk = target[start : start + window]
            if not chunk or chunk in chunk_seen:
                continue
            chunk_seen.add(chunk)
            search_pos = 0
            hit_count = 0
            while True:
                pos = text.find(chunk, search_pos)
                if pos < 0:
                    break
                hit_count += 1
                if _record(pos, len(chunk)):
                    return matches
                if hit_count >= 3:
                    break
                search_pos = pos + 1

    for size in (max(8, target_len // 2), 4):
        if target_len < size:
            continue
        chunk = target[:size]
        search_pos = 0
        while True:
            pos = text.find(chunk, search_pos)
            if pos < 0:
                break
            if _record(pos, len(chunk)):
                return matches
            search_pos = pos + 1

    matches.sort(key=lambda entry: (-entry[2], entry[0]))
    return matches[:max_matches]


def _merge_line_rects(
    rects: Sequence["fitz.Rect"],
    *,
    y_tolerance: float = 1.6,
) -> List["fitz.Rect"]:
    if not rects:
        return []
    rows: dict[int, List["fitz.Rect"]] = {}
    denom = max(0.5, y_tolerance)
    for rect in rects:
        mid = (rect.y0 + rect.y1) / 2.0
        key = int(round(mid / denom))
        rows.setdefault(key, []).append(rect)
    merged: List["fitz.Rect"] = []
    for entries in rows.values():
        entries.sort(key=lambda r: r.x0)
        current = fitz.Rect(entries[0])
        for nxt in entries[1:]:
            if nxt.x0 <= current.x1 + 1.0:
                current |= nxt
            else:
                merged.append(fitz.Rect(current))
                current = fitz.Rect(nxt)
        merged.append(fitz.Rect(current))
    return merged


def _merge_line_rects_horizontal(
    rects: Sequence["fitz.Rect"],
    *,
    y_tolerance: float = 2.0,
    x_gap_tolerance: float = 6.0,
) -> List["fitz.Rect"]:
    if not rects:
        return []
    sorted_rects = sorted(
        (fitz.Rect(r) for r in rects),
        key=lambda r: (round(((r.y0 + r.y1) / 2) / max(0.1, y_tolerance)), r.x0),
    )
    merged: List["fitz.Rect"] = []
    current = sorted_rects[0]
    for rect in sorted_rects[1:]:
        same_line = abs(((rect.y0 + rect.y1) / 2) - ((current.y0 + current.y1) / 2)) <= y_tolerance
        close_x = rect.x0 <= current.x1 + x_gap_tolerance
        if same_line and close_x:
            current |= rect
        else:
            merged.append(fitz.Rect(current))
            current = fitz.Rect(rect)
    merged.append(fitz.Rect(current))
    return merged


def rects_from_phrase(
    sequence: Sequence[Tuple[str, "fitz.Rect"]],
    norm_text: str,
    phrase: str | None,
) -> List[List[float]]:
    if not phrase:
        return []
    target = nfkc_ja(phrase)
    if not target:
        return []
    if not sequence or not norm_text:
        return []

    rects: List[List[float]] = []
    phrase_len = len(target)
    start = 0
    seq_len = len(sequence)
    while True:
        idx = norm_text.find(target, start)
        if idx < 0:
            break
        end = min(idx + phrase_len, seq_len)
        glyph_rects = [sequence[pos][1] for pos in range(idx, end)]
        if glyph_rects:
            for merged in _merge_line_rects(glyph_rects):
                rects.append(_rect_to_list(merged))
        start = idx + 1
    return rects


def rects_from_phrase_relaxed(
    sequence: Sequence[Tuple[str, "fitz.Rect"]],
    phrase: str | None,
    *,
    page_height: float | None = None,
) -> List[List[float]]:
    target = _extract_japanese_chars(phrase)
    if not target or not sequence:
        return []

    loose_chars, loose_rects = _build_relaxed_sequence(sequence)
    if not loose_chars:
        return []

    loose_text = "".join(loose_chars)
    if not loose_text:
        return []

    ranges = _find_relaxed_ranges(loose_text, target)
    if not ranges:
        return []

    best_rects: List[List[float]] = []
    best_score = float("-inf")
    target_len = len(target)
    top_limit = page_height * 0.08 if page_height else None
    bottom_limit = page_height * 0.92 if page_height else None

    for start, end, length in ranges:
        start = max(0, min(start, len(loose_rects)))
        end = max(start + 1, min(end, len(loose_rects)))
        span = loose_rects[start:end]
        if not span:
            continue
        merged = _merge_line_rects(span)
        if not merged:
            continue

        penalty = 0.0
        if page_height and top_limit is not None and bottom_limit is not None:
            centers = [float((rect.y0 + rect.y1) / 2.0) for rect in merged]
            avg_center = sum(centers) / len(centers)
            if avg_center < top_limit or avg_center > bottom_limit:
                penalty = length * 0.5
        score = length - penalty
        if score > best_score:
            best_score = score
            best_rects = [_rect_to_list(rect) for rect in merged]
            if penalty == 0.0 and length >= max(16, target_len * 0.4):
                break

    return best_rects


def rects_from_phrase_slices(
    sequence: Sequence[Tuple[str, "fitz.Rect"]],
    norm_text: str,
    phrase: str | None,
    *,
    windows: Sequence[int] = (32, 28, 24),
) -> List[List[float]]:
    normalized = nfkc_ja(phrase)
    if not normalized:
        return []
    for size in windows:
        if len(normalized) < size:
            continue
        step = max(6, size // 2)
        end_limit = len(normalized) - size
        starts = list(range(0, end_limit + 1, step))
        if starts[-1] != end_limit:
            starts.append(end_limit)
        for start in starts:
            sub = normalized[start : start + size]
            rects = rects_from_phrase(sequence, norm_text, sub)
            if rects:
                return rects
    return []


def _normalize_terms(terms: Sequence[str]) -> List[str]:
    normalized: List[str] = []
    for raw in terms or []:
        value = _nfkc(raw)
        if value:
            normalized.append(value)
    return normalized


def _textpage_flags() -> int:
    flags = 0
    if hasattr(fitz, "TEXT_PRESERVE_LIGATURES"):
        flags |= getattr(fitz, "TEXT_PRESERVE_LIGATURES")
    if hasattr(fitz, "TEXT_PRESERVE_WHITESPACE"):
        flags |= getattr(fitz, "TEXT_PRESERVE_WHITESPACE")
    if hasattr(fitz, "TEXT_DEHYPHENATE"):
        flags |= getattr(fitz, "TEXT_DEHYPHENATE")
    return flags


def _build_clip_rect(
    base: "fitz.Rect",
    page_rect: "fitz.Rect",
    *,
    pad_x: float = 12.0,
    pad_y: float = 28.0,
) -> "fitz.Rect":
    return fitz.Rect(
        max(page_rect.x0, base.x0 - pad_x),
        max(page_rect.y0, base.y0 - pad_y),
        min(page_rect.x1, base.x1 + pad_x),
        min(page_rect.y1, base.y1 + pad_y),
    )


def _filter_tokens(tokens: Sequence[str], *, min_len: int = 2, max_len: int = 12) -> List[str]:
    filtered: List[str] = []
    for token in tokens:
        t = (token or "").strip()
        if not t:
            continue
        if min_len <= len(t) <= max_len:
            filtered.append(t)
    return filtered


def _generate_phrase_tokens(
    phrase: str | None,
    lengths: Sequence[int] = (32, 28, 24, 20, 16, 12, 8, 6, 4),
) -> List[str]:
    text = nfkc_ja(phrase or "")
    if not text:
        return []
    for size in lengths:
        if len(text) < size or size <= 1:
            continue
        tokens: List[str] = []
        step = max(1, size // 2)
        for idx in range(0, len(text) - size + 1, step):
            tokens.append(text[idx : idx + size])
        if tokens:
            return tokens
    return [text] if text else []


def _rects_from_textpage(
    pdf_page: "fitz.Page",
    text_page: "fitz.TextPage",
    phrase: str | None,
    terms: Sequence[str],
) -> List[List[float]]:
    flags = _textpage_flags()
    page_rect = pdf_page.rect

    def _search(query: str, clip: "fitz.Rect" | None = None):
        if not query:
            return []
        try:
            return text_page.search(query, flags=flags, quads=True, clip=clip)
        except TypeError:
            hits = text_page.search(query, flags=flags, quads=True)
            if clip is None:
                return hits
            return [h for h in hits if fitz.Rect(h.rect).intersects(clip)]
        except Exception:
            return []

    phrase_candidates: List[str] = []
    if phrase:
        phrase_candidates.append(phrase.strip())
    normalized_phrase = nfkc_ja(phrase or "")
    if normalized_phrase and normalized_phrase not in phrase_candidates:
        phrase_candidates.append(normalized_phrase)

    for candidate in phrase_candidates:
        candidate = candidate.strip()
        if not candidate:
            continue
        hits = _search(candidate)
        if hits:
            merged = _merge_line_rects_horizontal(fitz.Rect(hit.rect) for hit in hits)
            return [
                [float(r.x0), float(r.y0), float(r.x1), float(r.y1)]
                for r in merged
                if r.width > 0 and r.height > 0
            ]

    filtered_terms = _filter_tokens(terms)
    if not filtered_terms and normalized_phrase:
        filtered_terms = _generate_phrase_tokens(normalized_phrase)[:6]

    found_rects: List["fitz.Rect"] = []
    for token in filtered_terms[:10]:
        hits = _search(token)
        if hits:
            found_rects.extend(fitz.Rect(hit.rect) for hit in hits)

    if not found_rects and normalized_phrase:
        for token in _generate_phrase_tokens(normalized_phrase):
            hits = _search(token)
            if hits:
                found_rects.extend(fitz.Rect(hit.rect) for hit in hits)
            if found_rects:
                break

    if found_rects:
        top_limit = page_rect.y0 + page_rect.height * 0.08
        bottom_limit = page_rect.y0 + page_rect.height * 0.92
        found_rects = [
            rect
            for rect in found_rects
            if rect.y0 >= top_limit and rect.y1 <= bottom_limit
        ]

    merged = _merge_line_rects_horizontal(found_rects)
    return [
        [float(r.x0), float(r.y0), float(r.x1), float(r.y1)]
        for r in merged
        if r.width > 0 and r.height > 0
    ]


@router.get("/{doc_id:path}/pdf")
def get_pdf(
    doc_id: str,
    tenant: str = Query(...),
    notebook_id: str = Query(...),
    user_id: str = Query(""),
    include_global: bool = Query(False),
    range_header: str | None = Header(default=None, alias="Range"),
) -> Response:
    _ = user_id, include_global
    pdf_path = _resolve_pdf_path(tenant, notebook_id, doc_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="pdf not found")

    size = pdf_path.stat().st_size
    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Type": "application/pdf",
    }

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d+)?", range_header.strip())
        if not match:
            raise HTTPException(status_code=416, detail="invalid range")
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else size - 1
        if start > end or end >= size:
            raise HTTPException(status_code=416, detail="range out of bounds")
        length = end - start + 1
        with open(pdf_path, "rb") as fh:
            fh.seek(start)
            data = fh.read(length)
        headers = {
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
        }
        return Response(data, status_code=206, headers=headers)

    headers = {**base_headers, "Content-Length": str(size)}
    return FileResponse(pdf_path, media_type="application/pdf", headers=headers)


def _empty_rect_payload(
    *,
    doc_id: str,
    page: int,
    reason: str,
    terms: Sequence[str] | None = None,
) -> JSONResponse:
    payload = {
        "doc_id": doc_id,
        "page": page,
        "w": None,
        "h": None,
        "rects": [],
        "pages": [],
        "terms": list(terms or []),
        "rid": uuid4().hex,
        "reason": reason,
        "engine": "none",
        "items": [],
        "tried_pages": [page],
        "impl": RECTS_IMPL_VERSION,
    }
    return JSONResponse(payload, status_code=200)


def _load_rect_payload(
    *,
    pdf_path: Path,
    doc_id: str,
    page: int,
    terms: Sequence[str],
    phrase: str = "",
    debug: int = 0,
    engine: str = "chars",
    include_items: bool = False,
) -> dict:
    if page < 1:
        raise HTTPException(status_code=400, detail="invalid page")

    _ensure_backend_ready()
    if regex is None:
        raise HTTPException(
            status_code=500,
            detail=f"'regex' module is required for PDF highlighting: {REGEX_IMPORT_ERROR}",
        )

    raw_terms = list(terms or [])
    normalized_terms = _normalize_terms(raw_terms)
    normalized_phrase = nfkc_ja(phrase or "")
    include_text = bool(include_items) or debug == 1
    active_engine = (engine or "chars").strip().lower()
    if active_engine not in {"chars"}:
        raise HTTPException(status_code=400, detail="unsupported_engine")
    combined_search_terms = []
    if phrase:
        combined_search_terms.append(phrase)
    combined_search_terms.extend(raw_terms)
    combined_search_terms = list(dict.fromkeys([term for term in combined_search_terms if term]))
    include_items = debug == 1

    if not pdf_path.exists():
        logger.warning("rects: pdf not found at %s", pdf_path)
        return _empty_rect_payload(
            doc_id=doc_id,
            page=page,
            reason="doc_not_in_notebook",
            terms=normalized_terms,
        )

    try:
        with fitz.open(pdf_path) as doc:
            if page > doc.page_count:
                raise HTTPException(status_code=400, detail="invalid page")
            pdf_page = doc.load_page(page - 1)
            page_height = float(pdf_page.rect.height)
            page_width = float(pdf_page.rect.width)
            tried_pages = [page]

            rect_entries: List[List[float]] = []
            engine_value = active_engine

            chars = _iter_chars(pdf_page)
            stream_text = "".join(glyph for glyph, _ in chars if glyph not in (None, "\n"))
            match_stream, match_boxes = _prepare_char_stream(chars) if chars else ("", [])
            char_rects: List[List[float]] = []
            if match_stream and match_boxes:
                phrase_candidates: List[str] = []
                if phrase:
                    phrase_candidates.append(phrase)
                if normalized_phrase and normalized_phrase not in phrase_candidates:
                    phrase_candidates.append(normalized_phrase)

                for candidate in phrase_candidates:
                    normalized_term = _normalize_for_match(candidate)
                    if not normalized_term:
                        continue
                    hits = _find_char_term_rects(match_stream, match_boxes, normalized_term)
                    if hits:
                        char_rects = hits
                        break

                if not char_rects and combined_search_terms:
                    phrase_exclusions = set(phrase_candidates)
                    for term in combined_search_terms:
                        if term in phrase_exclusions:
                            continue
                        normalized_term = _normalize_for_match(term)
                        if not normalized_term:
                            continue
                        char_rects.extend(_find_char_term_rects(match_stream, match_boxes, normalized_term))
            rect_entries = _dedupe_rect_lists(char_rects)

            if not rect_entries:
                text_page = pdf_page.get_textpage()
                sequence, norm_text = page_char_map(pdf_page)
                fallback_rects: List[Sequence[float]] = []
                search_terms = list(normalized_terms)
                derived_terms = _derive_terms_from_phrase(phrase or "")
                for token in derived_terms:
                    if token not in search_terms:
                        search_terms.append(token)
                if not search_terms and normalized_phrase:
                    search_terms = [normalized_phrase]

                if not fallback_rects and sequence and norm_text:
                    fallback_rects = rects_from_phrase(sequence, norm_text, phrase)
                if not fallback_rects and sequence and norm_text and normalized_phrase:
                    fallback_rects = rects_from_phrase(sequence, norm_text, normalized_phrase)
                if not fallback_rects and sequence:
                    fallback_rects = rects_from_phrase_relaxed(sequence, phrase, page_height=page_height)
                if not fallback_rects and sequence and normalized_phrase:
                    fallback_rects = rects_from_phrase_relaxed(sequence, normalized_phrase, page_height=page_height)
                if not fallback_rects and sequence and norm_text and normalized_phrase:
                    fallback_rects = rects_from_phrase_slices(sequence, norm_text, normalized_phrase)

                used_word_engine = False
                if not fallback_rects:
                    fallback_rects = _rects_from_textpage(pdf_page, text_page, phrase, search_terms)
                    if fallback_rects:
                        used_word_engine = True

                if not fallback_rects and sequence and norm_text and search_terms:
                    for term in search_terms[:6]:
                        fallback_rects = rects_from_phrase(sequence, norm_text, term)
                        if fallback_rects:
                            break

                rect_entries = [
                    [
                        float(entry[0]),
                        float(entry[1]),
                        float(entry[2]),
                        float(entry[3]),
                    ]
                    for entry in fallback_rects
                    if len(entry) >= 4
                ]
                if rect_entries and used_word_engine:
                    engine_value = "words"

            page_text = stream_text or pdf_page.get_text("text") or ""
            items_payload = [page_text] if include_text else []

            if debug == 1:
                _log_rect_debug(
                    doc_id=doc_id,
                    page=page,
                    engine=engine_value,
                    phrase=phrase or "",
                    normalized_phrase=normalized_phrase,
                    raw_terms=raw_terms,
                    normalized_terms=normalized_terms,
                    rects=rect_entries,
                    page_text=page_text,
                )

            payload: dict = {
                "doc_id": doc_id,
                "page": page,
                "w": page_width,
                "h": page_height,
                "rects": rect_entries,
                "pages": [
                    {
                        "page": page,
                        "w": page_width,
                        "h": page_height,
                        "rects": rect_entries,
                        "engine": engine_value,
                        "impl": RECTS_IMPL_VERSION,
                    }
                ],
                "terms": list(normalized_terms),
                "rid": uuid4().hex,
                "engine": engine_value,
                "tried_pages": tried_pages,
                "items": items_payload if include_text else [],
                "impl": RECTS_IMPL_VERSION,
            }
            return payload
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "rects: failed to process %s page %s: %s", pdf_path, page, exc
        )
        raise HTTPException(status_code=500, detail=f"{exc.__class__.__name__}: {exc}")


def _rects_core(
    *,
    doc_id: str,
    tenant: str,
    notebook_id: str,
    page: int,
    terms: Sequence[str],
    phrase: str | None = "",
    debug: int = 0,
    engine: str = "chars",
    include_items: bool = False,
) -> dict:
    pdf_path = _resolve_pdf_path(tenant, notebook_id, doc_id)
    return _load_rect_payload(
        pdf_path=pdf_path,
        doc_id=doc_id,
        page=page or 1,
        terms=terms,
        phrase=phrase or "",
        debug=debug,
        engine=engine,
        include_items=include_items,
    )


@router.get("/__rects_ping")
def rects_ping() -> dict:
    return {"ok": True, "impl": RECTS_IMPL_VERSION}


@router.get("/rects")
def get_rects_query(
    doc_id: str = Query(...),
    terms: List[str] = Query(default=[]),
    page: int = Query(default=1, ge=1),
    tenant: str = Query(...),
    user_id: str = Query(...),
    notebook_id: str = Query(...),
    include_global: bool = Query(False),
    phrase: str | None = Query(None),
    debug: int = Query(default=0, ge=0, le=1),
    engine: str = Query(default="chars"),
    include_items: bool = Query(default=False),
) -> dict:
    _ = user_id, include_global  # unused but accepted for compatibility
    return _rects_core(
        doc_id=doc_id,
        tenant=tenant,
        notebook_id=notebook_id,
        page=page,
        terms=terms,
        phrase=phrase,
        debug=debug,
        engine=engine,
        include_items=include_items,
    )


@router.get("/{doc_id:path}/rects")
def get_rects(
    doc_id: str,
    tenant: str = Query(...),
    notebook_id: str = Query(...),
    page: int = Query(default=1, ge=1),
    terms: List[str] = Query(default=[]),
    user_id: str = Query(""),
    include_global: bool = Query(False),
    phrase: str | None = Query(None),
    debug: int = Query(default=0, ge=0, le=1),
    engine: str = Query(default="chars"),
    include_items: bool = Query(default=False),
) -> dict:
    _ = user_id, include_global
    return _rects_core(
        doc_id=doc_id,
        tenant=tenant,
        notebook_id=notebook_id,
        page=page,
        terms=terms,
        phrase=phrase,
        debug=debug,
        engine=engine,
        include_items=include_items,
    )
