"""
extract.py — Intelligent PDF Question Extraction & Classification Tool
Phase 1: Production-Grade Core Pipeline

Fixes applied:
  Fix 1: Native page.get_pixmap(clip=rect, dpi) instead of full-page Pillow crop
  Fix 2: adjust_rect() to pad zero-width vector lines before cluster_drawings()
  Fix 3: Stricter question regex (x0 < 75) + dedup by (q_num, page_num) key
  Fix 4: Migrated from deprecated google.generativeai to google-genai SDK
  Fix 5: manifest.json now includes page, bounding_box, content fields
  Fix 6: section banners are tracked, not glued onto the previous question
"""

import argparse
import os
import sys
import json
import re
import base64
import time
from pathlib import Path

from qtypes import detect_type_from_instructions, looks_like_section_banner

try:
    import fitz  # PyMuPDF
    from PIL import Image
except ImportError:
    print("Error: PyMuPDF or Pillow is not installed. Please run: pip install PyMuPDF Pillow", file=sys.stderr)
    sys.exit(1)

# Fix 4: Migrate to google-genai SDK (replaces deprecated google.generativeai)
try:
    from google import genai as google_genai
    from google.genai import types as genai_types
    _HAS_GOOGLE_GENAI = True
except ImportError:
    _HAS_GOOGLE_GENAI = False

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


# ---------------------------------------------------------------------------
# Fix 2: Zero-width line padding for vector clustering
# ---------------------------------------------------------------------------

def adjust_rect(rect, stroke_width=1.0):
    """
    Expand zero-area rectangles by the line's stroke width so that
    cluster_drawings() doesn't silently discard thin horizontal/vertical
    lines (table grids, axis lines, underlines).
    """
    stroke_width = stroke_width or 1.0
    pad = max(stroke_width / 2.0, 0.5)
    x0, y0, x1, y1 = rect.x0, rect.y0, rect.x1, rect.y1

    if abs(x1 - x0) < 0.5:        # Vertical line — zero width
        x0 -= pad
        x1 += pad
    if abs(y1 - y0) < 0.5:        # Horizontal line — zero height
        y0 -= pad
        y1 += pad

    return fitz.Rect(x0, y0, x1, y1)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def union_rect(r1: fitz.Rect, r2: fitz.Rect) -> fitz.Rect:
    """Return the smallest rectangle that encloses both r1 and r2."""
    return fitz.Rect(
        min(r1.x0, r2.x0),
        min(r1.y0, r2.y0),
        max(r1.x1, r2.x1),
        max(r1.y1, r2.y1),
    )


def rect_from_bbox(bbox) -> fitz.Rect:
    """Convert a (x0, y0, x1, y1) tuple to a fitz.Rect."""
    return fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])


def is_significant_drawing(d) -> bool:
    """
    Heuristic filter: ignore trivially small marks, pure underlines, and
    thin vertical rules that are almost certainly decorative formatting.
    """
    rect = d.get("rect")
    if not rect:
        return False
    width  = rect[2] - rect[0]
    height = rect[3] - rect[1]

    if width < 5 and height < 5:   # Tiny dot / artifact
        return False
    if height < 2 and width > 50:  # Horizontal underline / table rule
        return False
    if width < 2 and height > 50:  # Thin vertical rule
        return False
    return True


# ---------------------------------------------------------------------------
# Fix 4: LLM clients using the new google-genai SDK
# ---------------------------------------------------------------------------

def _gemini_client():
    """Return a configured google-genai Client if the API key is present."""
    if _HAS_GOOGLE_GENAI and "GEMINI_API_KEY" in os.environ:
        return google_genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return None


def _groq_client():
    """Return an OpenAI-compatible Groq client if the API key is present."""
    if OpenAI and "GROQ_API_KEY" in os.environ:
        return OpenAI(
            api_key=os.environ["GROQ_API_KEY"],
            base_url="https://api.groq.com/openai/v1",
        )
    return None


# ---------------------------------------------------------------------------
# Vision confirmation: is this crop really a diagram?
# ---------------------------------------------------------------------------

def confirm_diagram(image_path: str) -> bool:
    """
    Ask a multimodal LLM whether the cropped question image actually
    contains a meaningful diagram, figure, or graph.

    Returns True if the image should be kept as PNG output,
            False if the LLM determines it is plain text / decorative borders.
    """
    PROMPT = (
        "Does this exam question contain a diagram, figure, graph, chart, image, "
        "or geometric drawing that is necessary to understand or answer the question? "
        "Ignore simple table borders or text formatting. Respond with only: YES or NO"
    )

    # --- Attempt 1: New google-genai SDK ---
    gclient = _gemini_client()
    if gclient:
        try:
            with open(image_path, "rb") as f:
                img_bytes = f.read()

            response = gclient.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    PROMPT,
                    genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                ],
                config=genai_types.GenerateContentConfig(temperature=0.0),
            )
            return response.text.strip().upper() == "YES"
        except Exception as e:
            print(f"Warning: Gemini Vision API failed ({e}). Trusting local detection.", file=sys.stderr)
            return True

    # --- Attempt 2: Groq vision ---
    gclient_groq = _groq_client()
    if gclient_groq:
        try:
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()

            response = gclient_groq.chat.completions.create(
                model="llama-3.2-11b-vision-preview",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    ],
                }],
            )
            return response.choices[0].message.content.strip().upper() == "YES"
        except Exception as e:
            print(f"Warning: Groq Vision API failed ({e}). Trusting local detection.", file=sys.stderr)
            return True

    print("Warning: No LLM vision API available. Trusting local diagram detection.", file=sys.stderr)
    return False


# ---------------------------------------------------------------------------
# LLM-based question segmentation (fallback for complex layouts)
# ---------------------------------------------------------------------------

def segment_questions_llm(blocks: list, page_num: int) -> list:
    """
    Ask an LLM to identify question boundaries from raw text blocks with
    their bounding box coordinates. Returns a list of question dicts.
    """
    text_lines = []
    for b in blocks:
        if b.get("type") != 0:
            continue
        spans_text = []
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                spans_text.append(span["text"])
        text = " ".join(spans_text).strip()
        text_lines.append(f"bbox:{b['bbox']} text:{text}")

    raw_text = "\n".join(text_lines)

    prompt = f"""You are given raw text extracted from an exam page, with each line prefixed by its
(x0,y0,x1,y1) bounding box coordinates. Identify each distinct question and sub-question
(e.g., 4a, 4b, 10(ii)). Return JSON:
[
  {{
    "question_number": "1a",
    "start_bbox": [x0,y0,x1,y1],
    "end_bbox": [x0,y0,x1,y1],
    "page": {page_num},
    "text": "The full text of the question"
  }}
]
Only output valid JSON, nothing else.

Raw Text:
{raw_text}
"""

    max_retries = 5

    def _call_llm(attempt: int) -> str | None:
        # Try google-genai first
        gclient = _gemini_client()
        if gclient:
            response = gclient.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=genai_types.GenerateContentConfig(temperature=0.0),
            )
            return response.text

        # Fall back to Groq
        gclient_groq = _groq_client()
        if gclient_groq:
            response = gclient_groq.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content

        print("Warning: No LLM API available for segmentation.", file=sys.stderr)
        return None

    print(f"  Segmenting questions on page {page_num} via LLM...")
    content = None
    for attempt in range(max_retries):
        try:
            content = _call_llm(attempt)
            if content is not None:
                break
        except Exception as e:
            print(f"  LLM API error (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(10)

    if content is None:
        return []

    # Strip markdown code fences if present
    if content.startswith("```json"):
        content = content.split("```json", 1)[1].split("```", 1)[0]
    elif content.startswith("```"):
        content = content.split("```", 1)[1].split("```", 1)[0]

    try:
        return json.loads(content.strip())
    except Exception as e:
        print(f"  Failed to parse LLM JSON: {e}", file=sys.stderr)
        return []


# ---------------------------------------------------------------------------
# Fix 2 + core visual detection
# ---------------------------------------------------------------------------

def collect_visual_rects(page: fitz.Page) -> list[fitz.Rect]:
    """
    Gather all raster image bounding boxes and all significant vector graphic
    cluster bounding boxes on the page. Zero-width lines are padded before
    clustering so they are not silently dropped.
    """
    visual_rects = []

    # 1. Raster images
    for img in page.get_images(full=True):
        for rect in page.get_image_rects(img):
            visual_rects.append(rect)

    # 2. Vector graphics — pad zero-area paths before clustering (Fix 2)
    drawings = page.get_drawings()
    padded = []
    for d in drawings:
        d = dict(d)  # shallow copy so we don't mutate the original
        d["rect"] = adjust_rect(d["rect"], d.get("width", 1.0))
        if is_significant_drawing(d):
            padded.append(d)

    if padded:
        clusters = page.cluster_drawings(drawings=padded, x_tolerance=10, y_tolerance=10)
        visual_rects.extend(clusters)

    return visual_rects


# ---------------------------------------------------------------------------
# Fix 3: Regex segmentation with strict margin guard + deduplication
# ---------------------------------------------------------------------------

# Matches: "1", "Q1", "1.", "1)", "Q.1" — but not "100" or numbers in the
# middle of a sentence.  The number must start the stripped text.
QUESTION_PATTERN = re.compile(
    r"^\s*(?:Q\.?\s*)?([1-9]\d{0,2})\s*[\.\):]?\s",
    re.IGNORECASE,
)

# Only treat a text block as a question header if its left edge is within
# this many PDF points from the left margin (typically 50–72 pt for exam PDFs).
LEFT_MARGIN_THRESHOLD = 75.0

# Margins are a fraction of page height, not a fixed point count: the old
# hardcoded 50/750 was measured on Letter (792 pt), so on an A4 page (842 pt)
# it discarded 50 pt of real question text at the bottom of every page.
TOP_MARGIN_FRACTION    = 0.063
BOTTOM_MARGIN_FRACTION = 0.94

# ---------------------------------------------------------------------------
# Running headers and footers
# ---------------------------------------------------------------------------
#
# Textbooks print a running line on every page — "APP | Physics 101
# Electrostatics". It is not part of any question, but it sits in the text flow,
# so it was being appended to whichever question came before it: the question's
# text ended with the book's own footer, and its crop rectangle stretched down
# to include it.
#
# The line is found by repetition rather than by position, because position
# alone cannot tell a footer from the last question on the page. Numbers are
# masked before comparing so a per-page page number does not make every
# occurrence unique.

# A band at each edge of the page, generous because the repetition check is what
# actually does the work.
RUNNING_TOP_BAND    = 0.15
RUNNING_BOTTOM_BAND = 0.80

# How many pages must share a line before it counts as a running one. A chapter
# footer repeats on every page of its chapter; a question repeats on none.
RUNNING_MIN_PAGES = 3

_DIGITS_RE = re.compile(r"\d+")


def running_line_key(text: str) -> str:
    """Page-number-insensitive form of a line, for spotting repeats."""
    return _DIGITS_RE.sub("#", re.sub(r"\s+", " ", text)).strip().lower()


def find_running_lines(all_blocks: list[dict]) -> dict[int, list[str]]:
    """
    Return every running header/footer line for each page that has one.

    A block qualifies if it sits in an edge band and its page-number-masked text
    also appears in the edge band of at least RUNNING_MIN_PAGES pages.

    All of them are returned, longest first, rather than one: a page commonly
    carries several — the chapter line, a bare page number, and in these scanned
    books a distributor's watermark — and only the reader knows which is
    meaningful. Deciding here would mean guessing.
    """
    candidates: dict[str, set[int]] = {}
    per_page: dict[int, list[tuple[str, str]]] = {}

    for item in all_blocks:
        height = item.get("height") or 0
        if not height:
            continue
        y0 = item["block"]["bbox"][1]
        if not (y0 < height * RUNNING_TOP_BAND or y0 > height * RUNNING_BOTTOM_BAND):
            continue

        text = " ".join(
            "".join(span["text"] for span in line.get("spans", []))
            for line in item["block"].get("lines", [])
        ).strip()
        if not text:
            continue

        key = running_line_key(text)
        candidates.setdefault(key, set()).add(item["page"])
        per_page.setdefault(item["page"], []).append((key, text))

    running_keys = {k for k, pages in candidates.items() if len(pages) >= RUNNING_MIN_PAGES}

    headers: dict[int, list[str]] = {}
    for page_num, entries in per_page.items():
        seen: list[str] = []
        for key, text in entries:
            if key in running_keys and text not in seen:
                seen.append(text)
        if seen:
            headers[page_num] = sorted(seen, key=len, reverse=True)
    return headers


def segment_questions_regex(all_blocks: list[dict], running_keys: set[str] | None = None) -> dict:
    # Sort blocks top-to-bottom, left-to-right to fix PyMuPDF's out-of-order extraction
    all_blocks.sort(key=lambda x: (x["page"], x["block"]["bbox"][1], x["block"]["bbox"][0]))
    running_keys = running_keys or set()

    questions: dict[str, dict] = {}
    current_key: str | None = None
    # A paper states its answer format once per section ("ONE OR MORE THAN ONE
    # of these four options is(are) correct") and every question below inherits
    # it, so the banner has to be carried forward until the next one replaces it.
    current_section_type: str | None = None

    for item in all_blocks:
        page_num: int = item["page"]
        b: dict = item["block"]

        valid_lines_rects = []
        spans_text = []
        answer_found = None
        answer_y0 = None

        for line in b.get("lines", []):
            line_text = "".join(span["text"] for span in line.get("spans", [])).strip()
            
            # Check if this specific line is an answer
            ans_match = re.match(r"^\s*(?:answer|ans)\s*[:\.=\-]?\s*(.*)", line_text, re.IGNORECASE)
            
            if ans_match:
                answer_found = ans_match.group(1).strip()
                answer_y0 = line["bbox"][1] # y0 of the answer line
            else:
                spans_text.append(line_text)
                valid_lines_rects.append(rect_from_bbox(line["bbox"]))

        text = " ".join(spans_text).replace("\n", " ").strip()
        
        # If the block was entirely empty or only contained an answer, we handle it carefully
        if not text and not answer_found:
            continue
            
        if valid_lines_rects:
            block_rect = valid_lines_rects[0]
            for r in valid_lines_rects[1:]:
                block_rect = union_rect(block_rect, r)
        else:
            block_rect = None

        # A banner announces the section below it and belongs to no question.
        # Checked before the running-line filter: a book that repeats the same
        # instruction above every section makes it look like a running line, and
        # discarding it there would lose the only statement of the answer format.
        if text and not QUESTION_PATTERN.match(text) and looks_like_section_banner(text):
            current_section_type = detect_type_from_instructions(text)
            continue

        # The book's own running header/footer — never part of a question.
        if text and running_line_key(text) in running_keys:
            continue

        # Skip blocks in the header/footer margins, measured against this page's
        # own height so an A4 paper is not cropped like a Letter one.
        height = item.get("height") or 0
        if block_rect and height and (
            block_rect.y0 < height * TOP_MARGIN_FRACTION
            or block_rect.y0 > height * BOTTOM_MARGIN_FRACTION
        ):
            continue

        match = QUESTION_PATTERN.match(text) if text else None
        is_left_anchored = block_rect.x0 < LEFT_MARGIN_THRESHOLD if block_rect else False

        if match and is_left_anchored:
            q_num = match.group(1)
            key = f"{q_num}_{page_num}"

            if key not in questions:
                questions[key] = {
                    "number": q_num,
                    "page": page_num,
                    "bbox": block_rect,
                    "text_parts": [text] if text else [],
                    "has_diagram": False,
                    "raw_answer": answer_found,
                    "answer_y0": answer_y0,
                    "section_type": current_section_type,
                }
            else:
                if block_rect:
                    questions[key]["bbox"] = union_rect(questions[key]["bbox"], block_rect)
                if text:
                    questions[key]["text_parts"].append(text)
                if answer_found:
                    questions[key]["raw_answer"] = answer_found
                if answer_y0 is not None:
                    questions[key]["answer_y0"] = answer_y0
            current_key = key

        elif current_key is not None and questions[current_key]["page"] == page_num:
            q = questions[current_key]
            if block_rect:
                q["bbox"] = union_rect(q["bbox"], block_rect)
            if text:
                q["text_parts"].append(text)
            if answer_found:
                q["raw_answer"] = answer_found
            if answer_y0 is not None:
                q["answer_y0"] = answer_y0

    return questions


# ---------------------------------------------------------------------------
# Worked-solutions sections
# ---------------------------------------------------------------------------
#
# An assignment book is two halves: the questions, then the worked solutions for
# every one of them. The solutions half is numbered exactly like the questions
# half ("23.(ABC)", "73.(1.57)"), so segmentation happily turns it into
# thousands of "questions" whose text is an answer. On these three books that
# was a quarter of every page in the file.
#
# A solutions page gives itself away: its numbered items open with the answer.

SOLUTION_ITEM_RE = re.compile(
    r"^\s*\d{1,3}\s*[\.\)]?\s*\(\s*(?:[A-Da-d]{1,4}|[-+]?[\d.]+)\s*\)"
)
NUMBERED_ITEM_RE = re.compile(r"^\s*\d{1,3}\s*[\.\)]\s")

# Between the questions and the worked solutions sit the answer-key grids: one
# bare table of question number to answer per chapter. They carry almost no
# prose, and segmentation turns each table row into a "question" whose text is
# the next few numbers in the table.
_LONG_WORD_RE  = re.compile(r"[A-Za-z]{4,}")
_TOKEN_LINE_RE = re.compile(r"^[\s\(\)\[\]\.,;:0-9A-Da-d]+$")

GRID_MIN_LINES   = 20
GRID_TOKEN_SHARE = 0.8
# Prose per line separates the two cleanly: an answer grid runs about 0.02 long
# words per line, a question page — even a formula-heavy one — runs well over 1.
GRID_MAX_WORDS_PER_LINE = 0.15


def page_is_answer_grid(text: str) -> bool:
    """True for a bare answer-key table — numbers and option letters, no prose."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if len(lines) < GRID_MIN_LINES:
        return False
    token_lines = sum(1 for l in lines if _TOKEN_LINE_RE.match(l))
    words_per_line = len(_LONG_WORD_RE.findall(text)) / len(lines)
    return (
        token_lines >= GRID_TOKEN_SHARE * len(lines)
        and words_per_line <= GRID_MAX_WORDS_PER_LINE
    )

# One page of answers proves nothing — an answer key can follow a question set.
# A run of them is a section.
SOLUTION_ITEM_MAX_CHARS = 20
SOLUTION_MIN_ITEMS  = 3
SOLUTION_MIN_SHARE  = 0.6
SOLUTION_RUN_PAGES  = 3
# Worked solutions that run to prose or pure algebra carry none of the giveaway
# numbering, so the answer section is only required to be mostly answer pages.
SOLUTION_SECTION_SHARE = 0.6
# Answer grids and section title pages sit just before the worked solutions and
# carry no numbered items at all, so the boundary is walked back over them.
def page_is_solutions(text: str) -> bool:
    """True when a page's numbered items are mostly answers rather than questions."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    # The whole line has to be the number and its answer. A question that opens
    # "7. If (A) ..." matches the pattern too, and only the length tells them
    # apart: "23.(ABC)" is a solution heading, anything longer is a question.
    answers = sum(1 for l in lines
                  if SOLUTION_ITEM_RE.match(l) and len(l) <= SOLUTION_ITEM_MAX_CHARS)
    numbered = sum(1 for l in lines if NUMBERED_ITEM_RE.match(l))
    return answers >= SOLUTION_MIN_ITEMS and answers >= SOLUTION_MIN_SHARE * max(numbered, 1)


def find_solutions_start(doc) -> int | None:
    """
    First page of the book's answer section, or None if it has none.

    The answer section is the answer-key grids plus the worked solutions that
    follow them. Everything from there to the end of these books is answers, so
    the caller can simply stop extracting at that page.
    """
    flags = []
    for page in doc:
        text = page.get_text()
        flags.append(page_is_solutions(text) or page_is_answer_grid(text))

    # The boundary is the first page from which the *rest of the book* is
    # overwhelmingly answers. Judging it on the remainder rather than on a local
    # run is what makes it robust in both directions: a dense table in the
    # middle of the questions fails the test because hundreds of question pages
    # follow it, and a worked solution written as prose cannot pull the boundary
    # forward because its neighbours still carry the section.
    total = len(flags)
    suffix_answers = [0] * (total + 1)
    for i in range(total - 1, -1, -1):
        suffix_answers[i] = suffix_answers[i + 1] + (1 if flags[i] else 0)

    for start in range(total):
        remaining = total - start
        if remaining < SOLUTION_RUN_PAGES:
            break
        if suffix_answers[start] >= SOLUTION_SECTION_SHARE * remaining and flags[start]:
            break
    else:
        return None

    if not flags[start] or suffix_answers[start] < SOLUTION_SECTION_SHARE * (total - start):
        return None
    return start


# ---------------------------------------------------------------------------
# Main processing pipeline
# ---------------------------------------------------------------------------

def process_pdf(pdf_path: str, output_dir: str, dpi: int, use_llm_fallback: bool,
                max_page: int | None = None, keep_solutions: bool = False) -> None:
    if not os.path.exists(pdf_path):
        print(f"Error: File not found — {pdf_path}", file=sys.stderr)
        sys.exit(1)

    text_dir  = os.path.join(output_dir, "text_questions")
    image_dir = os.path.join(output_dir, "image_questions")
    pages_dir = os.path.join(output_dir, "pages")
    os.makedirs(text_dir,  exist_ok=True)
    os.makedirs(image_dir, exist_ok=True)

    # Context manager guarantees C-level memory cleanup (Fix 5 / Phase-5 prep)
    with fitz.open(pdf_path) as doc:
        total_pages = len(doc)

        # ------------------------------------------------------------------
        # Step 0: Where do the questions stop and the answers begin?
        # ------------------------------------------------------------------
        if max_page is not None:
            total_pages = min(total_pages, max_page)
            print(f"[0/4] Limited to the first {total_pages} page(s) by --max-page")
        elif not keep_solutions:
            solutions_start = find_solutions_start(doc)
            if solutions_start is not None and solutions_start > 0:
                skipped = total_pages - solutions_start
                total_pages = solutions_start
                print(f"[0/4] Worked solutions start at page {solutions_start} — "
                      f"skipping {skipped} page(s) of answers")
            else:
                print("[0/4] No worked-solutions section detected")

        # ------------------------------------------------------------------
        # Step 1: Render full-page thumbnails — only the LLM segmenter reads
        #         them, and cropping stopped using them at Fix 1. Rendering
        #         them regardless cost a full-page PNG per page: on a
        #         500-page textbook that is gigabytes written and thrown away.
        # ------------------------------------------------------------------
        if use_llm_fallback:
            os.makedirs(pages_dir, exist_ok=True)
            print(f"[1/4] Rendering page thumbnails at {dpi} DPI...")
            for page_num in range(total_pages):
                page = doc[page_num]
                pix  = page.get_pixmap(dpi=dpi)
                pix.save(os.path.join(pages_dir, f"page_{page_num}.png"))
            print(f"[1/4] Done ({total_pages} pages)")
        else:
            print("[1/4] Skipping page thumbnails (only the LLM segmenter needs them)")

        # ------------------------------------------------------------------
        # Step 2: Extract text blocks
        # ------------------------------------------------------------------
        print("[2/4] Extracting text blocks...")
        all_blocks: list[dict] = []
        for page_num in range(total_pages):
            page   = doc[page_num]
            height = page.rect.height
            blocks = page.get_text("dict")["blocks"]
            for b in blocks:
                if b.get("type") == 0:   # type 0 = text
                    all_blocks.append({"page": page_num, "block": b, "height": height})
        print("[2/4] Done")

        # The book's running header/footer, per page. Excluded from every
        # question, and kept in the manifest because it names the chapter.
        page_headers = find_running_lines(all_blocks)
        running_keys = {running_line_key(t) for texts in page_headers.values() for t in texts}
        if page_headers:
            # The console is cp1252 on Windows and these books contain symbols
            # it cannot encode; a progress line must never kill the run.
            sample = next(iter(page_headers.values()))[0].encode("ascii", "replace").decode()
            print(f"      Running lines found on {len(page_headers)} page(s), e.g. {sample!r}")

        # ------------------------------------------------------------------
        # Step 3: Question segmentation
        # ------------------------------------------------------------------
        if use_llm_fallback:
            print("[3/4] Segmenting questions via LLM...")
            blocks_by_page: dict[int, list] = {}
            for item in all_blocks:
                blocks_by_page.setdefault(item["page"], []).append(item["block"])

            # Build questions dict in the same {key: {}} schema as regex path
            questions: dict[str, dict] = {}
            for p_num in range(total_pages):
                if p_num not in blocks_by_page:
                    continue
                llm_qs = segment_questions_llm(blocks_by_page[p_num], p_num)
                for lq in llm_qs:
                    q_num = str(lq["question_number"])
                    key   = f"{q_num}_{p_num}"
                    sb    = lq.get("start_bbox", [0, 0, 0, 0])
                    questions[key] = {
                        "number":     q_num,
                        "page":       lq.get("page", p_num),
                        "bbox":       fitz.Rect(sb[0], sb[1], sb[2], sb[3]),
                        "text_parts": [lq.get("text", "")],
                        "has_diagram": False,
                    }
            print(f"[3/4] LLM segmentation done — {len(questions)} question(s) found")
        else:
            print("[3/4] Segmenting questions via regex...")
            questions = segment_questions_regex(all_blocks, running_keys)
            print(f"[3/4] Regex segmentation done — {len(questions)} question(s) found")
            if not questions:
                print("Warning: No questions found. Check LEFT_MARGIN_THRESHOLD or try --use-llm-fallback.", file=sys.stderr)

        # ------------------------------------------------------------------
        # Step 4: Visual detection, diagram confirmation, and output export
        # ------------------------------------------------------------------
        print("[4/4] Detecting diagrams & exporting...")
        manifest: list[dict] = []
        PADDING = 8  # PDF-point padding around each crop rectangle

        for key, q in questions.items():
            q_num    = q["number"]
            page_num = q["page"]
            q_rect   = q["bbox"]
            page     = doc[page_num]

            # Collect all visual bounding boxes on this page
            visual_rects = collect_visual_rects(page)

            # Check overlap with question bbox
            has_visual = False
            for v_rect in visual_rects:
                if not q_rect.intersects(v_rect):
                    continue
                # Expand question bbox to fully contain the visual element
                q_rect = union_rect(q_rect, v_rect)
                has_visual = True

            # Clamping: Forcibly prevent the crop from including the Answer block.
            # (PyMuPDF's cluster_drawings sometimes merges the answer's drawing box with the question's).
            ans_y0 = q.get("answer_y0")
            if ans_y0 is not None and q_rect.y1 > (ans_y0 - PADDING):
                q_rect.y1 = ans_y0 - PADDING - 2 # Crop just above the answer text, accounting for padding

            q["has_diagram"] = has_visual

            # Fix 1: Native get_pixmap(clip=...) — no Pillow, no scaling math
            # Use page-scoped filename to avoid multi-section overwrite collisions
            file_stem = f"q{q_num}_p{page_num}"
            padded = fitz.Rect(
                q_rect.x0 - PADDING,
                q_rect.y0 - PADDING,
                q_rect.x1 + PADDING,
                q_rect.y1 + PADDING,
            )
            # Clamp to page bounds
            padded = padded & page.rect

            out_path = os.path.join(image_dir, f"{file_stem}.png")
            # Using GRAY colorspace as the base
            pix = page.get_pixmap(clip=padded, dpi=dpi, colorspace=fitz.csGRAY)
            
            # Extreme Compression: Convert to 1-bit Black and White with Dithering.
            # This preserves gray gradients in diagrams via dot patterns while dropping
            # the file size to roughly ~8 KB per image (an incredible 95% reduction vs RGB).
            try:
                img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
                img_bw = img.convert("1")  # 1-bit dithered
                img_bw.save(out_path, optimize=True)
            except Exception as e:
                print(f"Warning: Pillow extreme compression failed ({e}), falling back to standard PyMuPDF export.", file=sys.stderr)
                pix.save(out_path)

            # Fix 5: Richer manifest schema (bounding_box + content fields)
            bbox_list = [
                round(q_rect.x0, 2),
                round(q_rect.y0, 2),
                round(q_rect.x1, 2),
                round(q_rect.y1, 2),
            ]

            # We ALWAYS save an image now, but we also include the parsed text
            # in the manifest so the classifier doesn't have to re-extract it.
            clean = re.sub(r"\s+", " ", " ".join(q["text_parts"])).strip()
            rel_path = f"image_questions/{file_stem}.png"
            
            print(f"   Q{q_num} (p{page_num})  -> image  ({rel_path})")
            manifest.append({
                "question_number": q_num,
                "type":           "image",
                "page":           page_num,
                "bounding_box":   bbox_list,
                "content":        clean,
                "path":           rel_path,
                "raw_answer":     q.get("raw_answer"),
                # Answer format announced by the section this question sits
                # under; classify.py weighs it against the question's own text.
                "section_type":   q.get("section_type"),
                # The book's running lines for this page. In a chapter-organised
                # assignment book one of them names the chapter, which is a far
                # better topic than anything inferred from the question wording.
                "page_headers":   page_headers.get(page_num) or [],
            })

        manifest_path = os.path.join(output_dir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

        print(f"\nDone. {len(manifest)} question(s) exported.")
        print(f"manifest.json -> {manifest_path}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="PDF Question Extraction Tool — Phase 1 (production-grade core)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "input_pdf",
        help="Path to the source PDF file",
    )
    parser.add_argument(
        "--output-dir",
        default="./output",
        help="Directory where output files are written",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="Render resolution used for PNG crops and page thumbnails",
    )
    parser.add_argument(
        "--use-llm-fallback",
        action="store_true",
        help=(
            "Enable LLM-based question segmentation and diagram confirmation. "
            "Requires GEMINI_API_KEY or GROQ_API_KEY environment variable."
        ),
    )
    parser.add_argument(
        "--max-page",
        type=int,
        default=None,
        help="Stop after this many pages — overrides solutions detection",
    )
    parser.add_argument(
        "--keep-solutions",
        action="store_true",
        help="Extract the worked-solutions section too (off by default: its items "
             "are numbered like questions but are answers)",
    )
    args = parser.parse_args()
    process_pdf(args.input_pdf, args.output_dir, args.dpi, args.use_llm_fallback,
                args.max_page, args.keep_solutions)


if __name__ == "__main__":
    main()
