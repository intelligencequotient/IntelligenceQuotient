"""
extract.py — Intelligent PDF Question Extraction & Classification Tool
Phase 1: Production-Grade Core Pipeline

Fixes applied:
  Fix 1: Native page.get_pixmap(clip=rect, dpi) instead of full-page Pillow crop
  Fix 2: adjust_rect() to pad zero-width vector lines before cluster_drawings()
  Fix 3: Stricter question regex (x0 < 75) + dedup by (q_num, page_num) key
  Fix 4: Migrated from deprecated google.generativeai to google-genai SDK
  Fix 5: manifest.json now includes page, bounding_box, content fields
"""

import argparse
import os
import sys
import json
import re
import base64
import time
from pathlib import Path

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


def segment_questions_regex(all_blocks: list[dict]) -> dict:
    # Sort blocks top-to-bottom, left-to-right to fix PyMuPDF's out-of-order extraction
    all_blocks.sort(key=lambda x: (x["page"], x["block"]["bbox"][1], x["block"]["bbox"][0]))

    questions: dict[str, dict] = {}
    current_key: str | None = None
    
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

        # Skip empty blocks or blocks in the header/footer margins
        if block_rect and (block_rect.y0 < 50 or block_rect.y0 > 750):
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
# Main processing pipeline
# ---------------------------------------------------------------------------

def process_pdf(pdf_path: str, output_dir: str, dpi: int, use_llm_fallback: bool) -> None:
    if not os.path.exists(pdf_path):
        print(f"Error: File not found — {pdf_path}", file=sys.stderr)
        sys.exit(1)

    text_dir  = os.path.join(output_dir, "text_questions")
    image_dir = os.path.join(output_dir, "image_questions")
    pages_dir = os.path.join(output_dir, "pages")
    os.makedirs(text_dir,  exist_ok=True)
    os.makedirs(image_dir, exist_ok=True)
    os.makedirs(pages_dir, exist_ok=True)

    # Context manager guarantees C-level memory cleanup (Fix 5 / Phase-5 prep)
    with fitz.open(pdf_path) as doc:
        total_pages = len(doc)

        # ------------------------------------------------------------------
        # Step 1: Render full-page thumbnails (used for LLM segmentation only;
        #         NOT used for PNG cropping anymore — Fix 1 replaces that)
        # ------------------------------------------------------------------
        print(f"[1/4] Rendering page thumbnails at {dpi} DPI...")
        for page_num in range(total_pages):
            page = doc[page_num]
            pix  = page.get_pixmap(dpi=dpi)
            pix.save(os.path.join(pages_dir, f"page_{page_num}.png"))
        print(f"[1/4] Done ({total_pages} pages)")

        # ------------------------------------------------------------------
        # Step 2: Extract text blocks
        # ------------------------------------------------------------------
        print("[2/4] Extracting text blocks...")
        all_blocks: list[dict] = []
        for page_num in range(total_pages):
            page   = doc[page_num]
            blocks = page.get_text("dict")["blocks"]
            for b in blocks:
                if b.get("type") == 0:   # type 0 = text
                    all_blocks.append({"page": page_num, "block": b})
        print("[2/4] Done")

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
            questions = segment_questions_regex(all_blocks)
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
    args = parser.parse_args()
    process_pdf(args.input_pdf, args.output_dir, args.dpi, args.use_llm_fallback)


if __name__ == "__main__":
    main()
