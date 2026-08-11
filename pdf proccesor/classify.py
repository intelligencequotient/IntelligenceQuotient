"""
classify.py — Subject, Topic & Question-Type Classifier (Groq-only, NO Gemini)

Pipeline:
  PDF -> extract.py (PyMuPDF, no AI) -> question images + manifest.json
       -> classify.py (Groq text AI)  -> Subject/Topic/QuestionType folders

Questions are filed three levels deep — Subject -> Topic -> Question Type —
because that is how the question bank is browsed and how a test's sections are
filled: a JEE Advanced Physics section needs six *multi-correct* Rotational
Motion questions, not six Rotational Motion questions of any shape.

How it handles image questions WITHOUT a vision API:
  PyMuPDF reads the text on the question's PDF page at the stored bounding box.
  That extracted text is sent to Groq llama-3.3-70b for classification.
  This means ZERO vision API calls — 100% Groq text, which IS available free.

Usage:
    python classify.py ./output --pdf ./English_2024_QP.pdf --exam cbse
    python classify.py ./output --pdf ./paper.pdf --exam jee
    python classify.py ./output --pdf ./paper.pdf --no-api   # keyword fallback

Requires: pip install requests PyMuPDF
API key:  GROQ_API_KEY environment variable (free at console.groq.com)
"""

import argparse
import base64
import json
import os
import re
import shutil
import sys
import time

from qtypes import (
    DEFAULT_QUESTION_TYPE,
    QUESTION_TYPES,
    answer_key_letters,
    answer_key_value,
    resolve_question_type,
)

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False
    print("Warning: requests not installed. Run: pip install requests", file=sys.stderr)

try:
    import fitz  # PyMuPDF — for extracting text from PDF pages
    _HAS_FITZ = True
except ImportError:
    _HAS_FITZ = False

# ─────────────────────────────────────────────────────────────────────────────
# Groq API constants
# ─────────────────────────────────────────────────────────────────────────────

GROQ_URL        = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TEXT_MODEL = "llama-3.3-70b-versatile"   # confirmed available on free tier
# Vision fallback for questions PyMuPDF cannot read (scans, pure-diagram items).
# Override with VISION_MODEL if the account has access to a different one.
GROQ_VISION_MODEL = os.environ.get(
    "VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"
)
# Below this many characters, extracted text is treated as unusable.
MIN_USABLE_TEXT_CHARS = 25


# ─────────────────────────────────────────────────────────────────────────────
# Subject / topic taxonomies
# ─────────────────────────────────────────────────────────────────────────────

EXAM_TAXONOMY: dict[str, dict[str, list[str]]] = {
    "jee": {
        "Physics": [
            "Mechanics", "Kinematics", "Laws of Motion", "Work Energy Power",
            "Rotational Motion", "Gravitation", "Properties of Matter",
            "Thermal Physics", "Thermodynamics", "Waves and Oscillations",
            "Electrostatics", "Current Electricity", "Magnetism",
            "Electromagnetic Induction", "Alternating Current", "Optics",
            "Modern Physics", "Nuclear Physics", "Semiconductors",
            "Communication Systems", "Units and Measurements",
        ],
        "Chemistry": [
            "Some Basic Concepts", "Atomic Structure", "Chemical Bonding",
            "States of Matter", "Thermodynamics", "Equilibrium",
            "Redox Reactions", "Electrochemistry", "Chemical Kinetics",
            "Surface Chemistry", "Periodic Table", "Hydrogen",
            "s-Block Elements", "p-Block Elements", "d-Block Elements",
            "f-Block Elements", "Coordination Compounds",
            "Organic Chemistry Basics", "Hydrocarbons", "Haloalkanes",
            "Alcohols Phenols Ethers", "Aldehydes Ketones Acids",
            "Nitrogen Compounds", "Biomolecules", "Polymers",
            "Environmental Chemistry", "Solid State", "Solutions",
        ],
        "Mathematics": [
            "Sets Relations Functions", "Complex Numbers", "Quadratic Equations",
            "Sequences and Series", "Binomial Theorem", "Permutations Combinations",
            "Matrices and Determinants", "Straight Lines", "Conic Sections",
            "3D Geometry", "Vectors", "Limits Continuity Differentiability",
            "Differentiation", "Applications of Derivatives", "Indefinite Integration",
            "Definite Integration", "Area Under Curves", "Differential Equations",
            "Probability", "Statistics", "Trigonometry",
            "Inverse Trigonometry", "Mathematical Reasoning",
        ],
    },
    "neet": {
        "Physics": [
            "Physical World", "Units and Measurements", "Motion in a Straight Line",
            "Motion in a Plane", "Laws of Motion", "Work Energy Power",
            "System of Particles", "Gravitation", "Mechanical Properties of Solids",
            "Mechanical Properties of Fluids", "Thermal Properties",
            "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves",
            "Electric Charges", "Electrostatic Potential", "Current Electricity",
            "Moving Charges and Magnetism", "Magnetism and Matter",
            "Electromagnetic Induction", "Alternating Current",
            "Electromagnetic Waves", "Ray Optics", "Wave Optics",
            "Dual Nature of Radiation", "Atoms", "Nuclei",
            "Semiconductor Electronics",
        ],
        "Chemistry": [
            "Some Basic Concepts", "Structure of Atom", "Classification of Elements",
            "Chemical Bonding", "States of Matter", "Thermodynamics",
            "Equilibrium", "Redox Reactions", "Hydrogen", "s-Block Elements",
            "p-Block Elements", "Organic Chemistry", "Hydrocarbons",
            "Environmental Chemistry", "Solid State", "Solutions",
            "Electrochemistry", "Chemical Kinetics", "Surface Chemistry",
            "d-Block Elements", "Coordination Compounds", "Haloalkanes",
            "Alcohols and Phenols", "Aldehydes and Ketones", "Carboxylic Acids",
            "Amines", "Biomolecules", "Polymers", "Chemistry in Everyday Life",
        ],
        "Biology": [
            "The Living World", "Biological Classification", "Plant Kingdom",
            "Animal Kingdom", "Morphology of Flowering Plants",
            "Anatomy of Flowering Plants", "Structural Organisation in Animals",
            "Cell and Cell Cycle", "Biomolecules", "Cell Division",
            "Transport in Plants", "Mineral Nutrition", "Photosynthesis",
            "Respiration in Plants", "Plant Growth and Development",
            "Digestion and Absorption", "Breathing and Exchange of Gases",
            "Body Fluids and Circulation", "Excretory Products",
            "Locomotion and Movement", "Neural Control and Coordination",
            "Chemical Coordination", "Reproduction in Organisms",
            "Sexual Reproduction in Flowering Plants",
            "Human Reproduction", "Reproductive Health",
            "Principles of Inheritance", "Molecular Basis of Inheritance",
            "Evolution", "Human Health and Disease",
            "Strategies for Enhancement in Food Production",
            "Microbes in Human Welfare", "Biotechnology Principles",
            "Biotechnology Applications", "Organisms and Populations",
            "Ecosystem", "Biodiversity and Conservation", "Environmental Issues",
        ],
    },
    "cbse": {
        "Physics": ["Mechanics", "Thermodynamics", "Optics", "Electromagnetism",
                    "Modern Physics", "Electronics"],
        "Chemistry": ["Physical Chemistry", "Inorganic Chemistry", "Organic Chemistry"],
        "Mathematics": ["Algebra", "Calculus", "Geometry", "Statistics",
                        "Trigonometry", "Probability"],
        "Biology": ["Cell Biology", "Genetics", "Ecology", "Human Physiology",
                    "Plant Physiology", "Evolution", "Biotechnology"],
        "English": ["Literature", "Grammar", "Writing Skills", "Reading Comprehension"],
        "History": ["Ancient History", "Medieval History", "Modern History"],
        "Geography": ["Physical Geography", "Human Geography", "Indian Geography"],
        "Political Science": ["Indian Constitution", "Government", "International Relations"],
        "Economics": ["Microeconomics", "Macroeconomics", "Statistics"],
        "Computer Science": ["Programming", "Data Structures", "Databases",
                             "Networking", "Operating Systems"],
        "Other": ["General"],
    },
    "general": {
        "Physics": ["Mechanics", "Thermodynamics", "Electromagnetism", "Optics",
                    "Modern Physics"],
        "Chemistry": ["Physical Chemistry", "Inorganic Chemistry", "Organic Chemistry"],
        "Mathematics": ["Algebra", "Calculus", "Geometry", "Statistics", "Trigonometry"],
        "Biology": ["Cell Biology", "Genetics", "Ecology", "Physiology", "Evolution"],
        "English": ["Literature", "Grammar", "Writing"],
        "Computer Science": ["Programming", "Data Structures", "Algorithms"],
        "Other": ["General"],
    },
}

# Keyword fallback dictionaries
SUBJECT_KEYWORDS: dict[str, list[str]] = {
    "Physics": ["velocity", "acceleration", "force", "momentum", "energy", "power",
                "friction", "gravity", "newton", "electric", "current", "voltage",
                "resistance", "magnetic", "flux", "wave", "frequency", "optic",
                "lens", "photon", "electron", "nucleus", "radioact", "quantum",
                "thermal", "entropy", "pressure", "density", "torque", "rotation"],
    "Chemistry": ["reaction", "molecule", "atom", "element", "compound", "acid",
                  "base", "salt", "pH", "oxidation", "reduction", "mole", "molarity",
                  "equilibrium", "catalyst", "hydrocarbon", "alkane", "benzene",
                  "organic", "ionic", "covalent", "enthalpy", "electrode", "polymer"],
    "Mathematics": ["integral", "derivative", "limit", "function", "matrix", "vector",
                    "determinant", "polynomial", "equation", "probability", "statistics",
                    "circle", "ellipse", "parabola", "tangent", "logarithm", "binomial",
                    "permutation", "combination", "series", "sequence"],
    "Biology": ["cell", "nucleus", "dna", "rna", "chromosome", "gene", "protein",
                "enzyme", "photosynthesis", "respiration", "mitosis", "meiosis",
                "evolution", "ecosystem", "organ", "tissue", "blood", "neuron"],
    "English": ["passage", "comprehension", "grammar", "vocabulary", "sentence",
                "paragraph", "essay", "poem", "literature", "tense", "verb", "noun"],
    "Computer Science": ["algorithm", "program", "variable", "loop", "array",
                         "database", "network", "binary", "stack", "queue"],
}

TOPIC_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "Physics": {
        "Mechanics": ["force", "motion", "velocity", "acceleration", "momentum",
                      "newton", "friction", "collision", "projectile", "torque",
                      "rotation", "angular", "pulley", "inclined"],
        "Thermodynamics": ["heat", "temperature", "entropy", "enthalpy", "carnot",
                           "isothermal", "adiabatic", "specific heat"],
        "Waves and Oscillations": ["wave", "oscillat", "frequency", "amplitude",
                                    "harmonic", "resonance", "doppler", "sound"],
        "Electrostatics": ["electric field", "coulomb", "capacitor", "potential", "gauss"],
        "Current Electricity": ["current", "resistance", "ohm", "kirchhoff", "circuit"],
        "Magnetism": ["magnetic", "flux", "faraday", "lenz", "solenoid", "biot"],
        "Optics": ["lens", "mirror", "refraction", "reflection", "prism", "focal"],
        "Modern Physics": ["photoelectric", "photon", "quantum", "bohr", "de broglie"],
        "Nuclear Physics": ["nucleus", "radioactive", "half-life", "decay", "fission"],
    },
    "Mathematics": {
        "Calculus": ["limit", "derivative", "integral", "differentiation",
                     "integration", "maxima", "minima"],
        "Algebra": ["polynomial", "quadratic", "roots", "determinant", "matrix"],
        "Trigonometry": ["sine", "cosine", "tangent", "identity", "inverse trig"],
        "Vectors": ["vector", "dot product", "cross product", "magnitude"],
        "Probability": ["probability", "event", "bayes", "conditional", "distribution"],
        "Sequences and Series": ["arithmetic", "geometric", "sum", "a.p.", "g.p."],
        "Conic Sections": ["circle", "ellipse", "parabola", "hyperbola", "focus"],
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# PyMuPDF text extractor for image questions
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_page(pdf_path: str, page_num: int,
                            bbox: list | None = None) -> str:
    """
    Use PyMuPDF to extract text from a PDF page (or a specific bounding box).
    This runs locally — no API, no internet needed.
    """
    if not _HAS_FITZ or not pdf_path or not os.path.exists(pdf_path):
        return ""
    try:
        with fitz.open(pdf_path) as doc:
            if page_num >= len(doc):
                return ""
            page = doc[page_num]
            if bbox and len(bbox) == 4:
                clip = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
                text = page.get_text("text", clip=clip)
            else:
                text = page.get_text("text")
            return text.strip()
    except Exception as e:
        print(f"    PyMuPDF text extract error: {e}", file=sys.stderr)
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# Groq text API
# ─────────────────────────────────────────────────────────────────────────────

def call_groq(api_keys: list[str], prompt: str, max_retries: int = 15) -> str | None:
    """Send a text prompt to Groq llama-3.3-70b and return the response with round-robin rotation."""
    if not _HAS_REQUESTS or not api_keys:
        return None
    if not hasattr(call_groq, "key_idx"):
        call_groq.key_idx = 0

    for attempt in range(max_retries):
        current_key = api_keys[call_groq.key_idx]
        headers = {
            "Authorization": f"Bearer {current_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": GROQ_TEXT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": 300,
        }
        try:
            res = _requests.post(GROQ_URL, headers=headers, json=payload, timeout=30)
            res.raise_for_status()
        except _requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 0
            if code == 429:
                if len(api_keys) > 1:
                    call_groq.key_idx = (call_groq.key_idx + 1) % len(api_keys)
                    print(f"\n    Groq HTTP 429 - rotating to API key {call_groq.key_idx + 1}/{len(api_keys)}...", end="", flush=True)
                    time.sleep(1.0) # minimal wait before trying next key
                    continue
                else:
                    print(f"\n    Groq HTTP 429 - Rate limit reached. Gracefully falling back to keyword classification...", end="", flush=True)
                    return None # Give up immediately to use fallback instead of locking up
            
            wait = min(60, 2 * (2 ** attempt)) # Cap other error waits at 60s
            print(f"\n    Groq HTTP {code} - retrying in {wait}s...", end="", flush=True)
            time.sleep(wait)
        except Exception as e:
            print(f"\n    Groq error: {e}", file=sys.stderr)
            return None
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Groq vision API — fallback for questions PyMuPDF cannot read
# ─────────────────────────────────────────────────────────────────────────────

def call_groq_vision(api_keys: list[str], prompt: str, image_path: str,
                     max_retries: int = 4) -> str | None:
    """
    Send a cropped question image to a Groq vision model.

    Used when text extraction yields nothing usable — scanned pages, questions
    that are entirely a diagram, or chemistry structures drawn as vectors. The
    model transcribes what it can see and classifies in the same call, so one
    request replaces the OCR step we do not have.

    Returns the raw response, or None so the caller can fall back to keywords.
    """
    if not _HAS_REQUESTS or not api_keys or not os.path.exists(image_path):
        return None

    try:
        with open(image_path, "rb") as fh:
            encoded = base64.b64encode(fh.read()).decode("ascii")
    except Exception as e:
        print(f"    Vision: could not read {image_path}: {e}", file=sys.stderr)
        return None

    # Guard against oversized crops — the API rejects very large payloads and a
    # single bad image should not stall the whole run.
    if len(encoded) > 4 * 1024 * 1024:
        print("    Vision: image too large, skipping.", file=sys.stderr)
        return None

    if not hasattr(call_groq_vision, "key_idx"):
        call_groq_vision.key_idx = 0

    for attempt in range(max_retries):
        current_key = api_keys[call_groq_vision.key_idx]
        payload = {
            "model": GROQ_VISION_MODEL,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/png;base64,{encoded}"}},
                ],
            }],
            "temperature": 0.0,
            "max_tokens": 500,
        }
        try:
            res = _requests.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {current_key}",
                         "Content-Type": "application/json"},
                json=payload,
                timeout=60,          # vision is slower than text
            )
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"]
        except _requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 0
            if code == 429 and len(api_keys) > 1:
                call_groq_vision.key_idx = (call_groq_vision.key_idx + 1) % len(api_keys)
                time.sleep(1.0)
                continue
            if code in (400, 404, 422):
                # Model unavailable or payload rejected — retrying will not help.
                print(f"\n    Vision unavailable (HTTP {code}); using keyword fallback.",
                      end="", flush=True)
                return None
            time.sleep(min(30, 2 * (2 ** attempt)))
        except Exception as e:
            print(f"\n    Vision error: {e}", file=sys.stderr)
            return None
    return None


# Spelled out for the model in both the text and the vision prompt: without it,
# every question comes back "single_correct" because that is the common case.
QUESTION_TYPE_GUIDANCE = (
    "  single_correct — four options, exactly one is right\n"
    "  multi_correct  — options where one OR MORE may be right\n"
    "  numerical      — the answer is a number to write in, no options\n"
    "  assertion      — an Assertion/Reason or Statement-1/Statement-2 pair\n"
)


def build_vision_prompt(exam_taxonomy: dict) -> str:
    taxonomy_lines = [f"  {subj}: {', '.join(topics)}"
                      for subj, topics in exam_taxonomy.items()]
    return (
        "This image is a single exam question.\n"
        "Read it and reply with ONLY a JSON object, no prose:\n"
        '{"subject": "...", "topic": "...", "question_type": "...", '
        '"confidence": 0.0, "text": "..."}\n\n'
        '"text" must be your transcription of the question (max 300 chars).\n'
        f'"question_type" must be one of: {", ".join(QUESTION_TYPES)}.\n'
        + QUESTION_TYPE_GUIDANCE +
        "Choose subject and topic strictly from this taxonomy:\n"
        + "\n".join(taxonomy_lines)
    )


# ─────────────────────────────────────────────────────────────────────────────
# Classification prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def build_classify_prompt(exam_taxonomy: dict, question_text: str) -> str:
    taxonomy_lines = []
    for subj, topics in exam_taxonomy.items():
        taxonomy_lines.append(f"  {subj}: {', '.join(topics)}")

    return f"""You are classifying an exam question by subject, topic and answer format.

Available subjects and topics:
{chr(10).join(taxonomy_lines)}

Question types:
{QUESTION_TYPE_GUIDANCE}
Question text:
{question_text[:1500]}

Return ONLY valid JSON (no markdown, no explanation):
{{
  "subject": "<one of the subject names above>",
  "topic": "<one of the topics for that subject>",
  "question_type": "<one of: {', '.join(QUESTION_TYPES)}>",
  "confidence": <0.0 to 1.0>
}}"""


# ─────────────────────────────────────────────────────────────────────────────
# JSON response parser
# ─────────────────────────────────────────────────────────────────────────────

def parse_classification(raw: str | None) -> dict | None:
    if not raw:
        return None
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw.strip())
        if isinstance(data, dict) and "subject" in data and "topic" in data:
            return data
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Keyword fallback
# ─────────────────────────────────────────────────────────────────────────────

def classify_by_keywords(text: str, exam_taxonomy: dict) -> dict:
    text_lower = text.lower()
    best_subject, best_score = "Other", 0

    for subject, keywords in SUBJECT_KEYWORDS.items():
        if subject not in exam_taxonomy:
            continue
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > best_score:
            best_score, best_subject = score, subject

    best_topic = exam_taxonomy.get(best_subject, ["General"])[0]
    best_topic_score = 0
    for topic, keywords in TOPIC_KEYWORDS.get(best_subject, {}).items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > best_topic_score:
            best_topic_score, best_topic = score, topic

    return {
        "subject": best_subject,
        "topic": best_topic,
        "confidence": round(min(0.4, best_score * 0.1), 2),
        "method": "keyword",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Closest match helper
# ─────────────────────────────────────────────────────────────────────────────

def console_safe(text) -> str:
    """
    Printable on a cp1252 Windows console.

    Chapter names and question text out of these books contain symbols the
    default console encoding cannot represent, and an unencodable progress line
    raises UnicodeEncodeError — killing a run that had otherwise succeeded.
    """
    return str(text if text is not None else "").encode("ascii", "replace").decode()


def closest_key(query: str, keys: list[str]) -> str | None:
    q = query.lower()
    for k in keys:
        if q in k.lower() or k.lower() in q:
            return k
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Chapter name from the book's running line
# ─────────────────────────────────────────────────────────────────────────────
#
# Assignment books print a running line on every page naming the chapter:
#     "APP | Physics 101 Electrostatics"
#     "APP | Differential Calculus-1 100 M athematics"
# That is the topic, stated by the book itself. It beats anything a model can
# infer from one question's wording, and it costs no API call — which is what
# makes a 1400-page batch feasible on a rate-limited free tier.

# Publisher boilerplate that prefixes the running line.
_RUNNING_PREFIX_RE = re.compile(r"^\s*APP\s*[|:\-–—]*\s*", re.IGNORECASE)
# The page number splits the line into {subject, chapter}, in either order.
_PAGE_NUMBER_SPLIT_RE = re.compile(r"\s+\d{1,4}\s+")

MIN_CHAPTER_CHARS = 3
MAX_CHAPTER_CHARS = 80

# Scanned copies of these books carry a redistributor's watermark on every page,
# which repeats exactly like a chapter line does. A chapter name is prose: it has
# no handle, no URL, and more letters than punctuation.
_CHAPTER_REJECT_RE = re.compile(
    # Watermarks and handles.
    r"@|https?://|www\.|~|\bTG\b"
    # Section instructions, which repeat above every section and so look just as
    # much like a running line as the chapter footer does. "NUM ERICAL" allows
    # for the stray spaces this typesetting puts inside words.
    r"|\btypes?\b|\bcorrect\b|\bchoices?\b|\bmarks\b|\bsection\b|\bnum\s*erical\b",
    re.IGNORECASE,
)


def _squash(text: str) -> str:
    """Lowercase with all whitespace removed — 'M athematics' == 'Mathematics'."""
    return re.sub(r"\s+", "", text or "").lower()


def chapter_from_running_line(header: str | None, subject: str | None,
                              known_subjects: list[str] | None = None) -> str | None:
    """Pull the chapter name out of a running header/footer, or None."""
    if not header:
        return None

    text = _RUNNING_PREFIX_RE.sub("", header).strip()
    parts = [p.strip(" |:-–—\t") for p in _PAGE_NUMBER_SPLIT_RE.split(text)]

    # Everything that is not the subject and not a bare number is a candidate.
    skip = {_squash(s) for s in ([subject] if subject else []) + (known_subjects or []) if s}
    candidates = [
        p for p in parts
        if p and _squash(p) not in skip and not p.strip().isdigit()
    ]
    if not candidates:
        return None

    for candidate in sorted(candidates, key=len, reverse=True):
        chapter = re.sub(r"\s+", " ", candidate).strip(" |:-–—.")
        if not (MIN_CHAPTER_CHARS <= len(chapter) <= MAX_CHAPTER_CHARS):
            continue
        if _CHAPTER_REJECT_RE.search(chapter):
            continue
        if sum(c.isalpha() for c in chapter) < MIN_CHAPTER_CHARS:
            continue
        return chapter
    return None


def chapter_for_page(headers, subject: str | None,
                     known_subjects: list[str] | None = None) -> str | None:
    """First of a page's running lines that reads as a chapter name."""
    if isinstance(headers, str):
        headers = [headers]
    for header in headers or []:
        chapter = chapter_from_running_line(header, subject, known_subjects)
        if chapter:
            return chapter
    return None


def chapters_by_page(manifest: list[dict], subject: str | None,
                     known_subjects: list[str] | None = None) -> dict[int, str]:
    """
    Chapter name per page, with gaps filled from the page before.

    Front matter, a full-page diagram or a page whose footer failed to extract
    leaves a hole. Chapters run in contiguous blocks, so the previous page's
    chapter is the right answer for a hole — much better than dropping those
    questions into a generic bucket.
    """
    headers_by_page: dict[int, object] = {}
    for entry in manifest:
        page = int(entry.get("page", 0))
        headers_by_page.setdefault(
            page, entry.get("page_headers") or entry.get("page_header")
        )

    pages = sorted(headers_by_page)
    found = {
        page: chapter_for_page(headers_by_page[page], subject, known_subjects)
        for page in pages
    }

    resolved: dict[int, str] = {}
    carried: str | None = None
    for page in pages:
        carried = found.get(page) or carried
        if carried:
            resolved[page] = carried

    # A page before the first chapter heading inherits from the page after it.
    carried = None
    for page in reversed(pages):
        carried = resolved.get(page) or carried
        if carried:
            resolved.setdefault(page, carried)
    return resolved


# ─────────────────────────────────────────────────────────────────────────────
# Single question classifier
# ─────────────────────────────────────────────────────────────────────────────

def classify_question(entry: dict, output_dir: str, pdf_path: str | None,
                      exam_taxonomy: dict, groq_keys: list[str],
                      use_api: bool, delay: float,
                      forced_subject: str | None = None,
                      page_chapters: dict[int, str] | None = None) -> dict:
    """
    Classify one question into subject, topic and question type.

    Signals are used in order of how directly the paper states them: a forced
    subject (a single-subject book), the chapter in the page's running line, and
    the section banner, before anything a model infers.

    For image questions: extract text from the PDF page using PyMuPDF,
                         then send to Groq for classification.
    For text questions:  use the content field directly with Groq.
    """
    media    = entry.get("type", "text")
    content  = entry.get("content") or ""
    rel_path = entry.get("path", "")
    page_num = entry.get("page", 0)
    bbox     = entry.get("bounding_box")
    q_num    = entry.get("question_number", "?")

    # ── Get question text ─────────────────────────────────────────────────────
    question_text = content.strip()

    if not question_text:
        # For image questions (no content field): extract text from PDF page
        if pdf_path:
            question_text = extract_text_from_page(pdf_path, page_num, bbox)

        # If still empty, try reading the text file at the path
        if not question_text and rel_path.endswith(".txt"):
            abs_txt = os.path.join(output_dir, rel_path)
            if os.path.exists(abs_txt):
                with open(abs_txt, encoding="utf-8") as f:
                    question_text = f.read().strip()

    classification: dict | None = None
    method = "keyword"

    # ── What the paper already tells us ───────────────────────────────────────
    # A single-subject book plus a chapter running line plus a section banner
    # covers subject, topic and type between them, with no model involved. Where
    # all three are present the question needs no API call at all — which is the
    # difference between minutes and days on a whole textbook.
    header_topic = (page_chapters or {}).get(page_num) or chapter_for_page(
        entry.get("page_headers") or entry.get("page_header"),
        forced_subject, list(exam_taxonomy.keys())
    )
    paper_type, paper_type_evidence = resolve_question_type(
        question_text,
        raw_answer=entry.get("raw_answer"),
        section_type=entry.get("section_type"),
        ai_type=None,
    )
    paper_knows_type = paper_type_evidence in ("question-text", "answer-key", "section-header")

    if forced_subject and header_topic and paper_knows_type:
        use_api = False
        method = "paper"

    # ── Groq text classification ──────────────────────────────────────────────
    if use_api and groq_keys and len(question_text) >= MIN_USABLE_TEXT_CHARS:
        prompt = build_classify_prompt(exam_taxonomy, question_text)
        raw = call_groq(groq_keys, prompt)
        classification = parse_classification(raw)
        if classification:
            classification["method"] = "groq-text"
            method = "groq-text"
        time.sleep(delay)

    # ── Vision fallback ───────────────────────────────────────────────────────
    # Text extraction returns nothing usable for scanned pages and questions that
    # are entirely a diagram. Send the cropped image to a vision model instead —
    # it transcribes and classifies in one call.
    needs_vision = (
        use_api
        and groq_keys
        and classification is None
        and len(question_text) < MIN_USABLE_TEXT_CHARS
        and rel_path.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    )

    if needs_vision:
        abs_image = os.path.join(output_dir, rel_path)
        raw = call_groq_vision(groq_keys, build_vision_prompt(exam_taxonomy), abs_image)
        vision_result = parse_classification(raw)
        if vision_result:
            classification = vision_result
            classification["method"] = "groq-vision"
            method = "groq-vision"
            # Keep the transcription — it is often the only text this question has.
            transcribed = str(vision_result.get("text") or "").strip()
            if transcribed:
                question_text = transcribed
        time.sleep(delay)

    # ── Keyword fallback ──────────────────────────────────────────────────────
    if classification is None:
        classification = classify_by_keywords(question_text, exam_taxonomy)
        method = "keyword"

    # ── Subject ───────────────────────────────────────────────────────────────
    if forced_subject:
        subject = forced_subject
        subject_source = "forced"
    else:
        subject = classification.get("subject", "Other")
        if subject not in exam_taxonomy:
            subject = closest_key(subject, list(exam_taxonomy.keys())) or "Other"
        subject_source = method

    # ── Topic ─────────────────────────────────────────────────────────────────
    if header_topic:
        # The book's own chapter name, kept verbatim: "IOC & Hydrocarbons" is
        # more useful to a teacher browsing the bank than the nearest entry in a
        # generic taxonomy, and coercing it would only lose information.
        topic = header_topic
        topic_source = "page-header"
    else:
        topic = classification.get("topic", "General")
        valid_topics = exam_taxonomy.get(subject, ["General"])
        if topic not in valid_topics:
            topic = closest_key(topic, valid_topics) or valid_topics[0]
        topic_source = method

    # ── Question type ─────────────────────────────────────────────────────────
    # The paper's own wording and its answer key outrank the model here; see
    # resolve_question_type for the full ranking.
    raw_answer = entry.get("raw_answer")
    question_type, type_evidence = resolve_question_type(
        question_text,
        raw_answer=raw_answer,
        section_type=entry.get("section_type"),
        ai_type=classification.get("question_type"),
    )

    txt_preview = console_safe(question_text[:60].replace("\n", " ") if question_text else "(no text)")
    print(f"   Q{str(q_num):>4} ({media:5}) -> {console_safe(subject)} / {console_safe(topic)}"
          f" / {question_type}  [{method}, type:{type_evidence}]")
    print(f"          text: \"{txt_preview}...\"")

    enriched = dict(entry)
    enriched["subject"]               = subject
    enriched["subject_source"]        = subject_source
    enriched["topic"]                 = topic
    enriched["topic_source"]          = topic_source
    enriched["question_type"]         = question_type
    enriched["question_type_source"]  = type_evidence
    enriched["confidence"]            = round(float(classification.get("confidence", 0.5)), 2)
    enriched["classification_method"] = method
    enriched["extracted_text"]        = question_text[:300] if question_text else None
    # Pre-parsed answer key, so the API layer does not repeat the parsing.
    # Both are None when the paper printed no answer — the reviewer fills it in.
    enriched["answer_indices"]        = answer_key_letters(raw_answer) or None
    enriched["answer_value"]          = answer_key_value(raw_answer)
    return enriched


# ─────────────────────────────────────────────────────────────────────────────
# File organiser
# ─────────────────────────────────────────────────────────────────────────────

def safe_segment(value: str, fallback: str) -> str:
    """A single path segment: no separators, no Windows-reserved characters."""
    cleaned = re.sub(r'[<>:"/\\|?*]', "_", str(value or "").strip())
    cleaned = cleaned.strip(". ")           # Trailing dots/spaces are illegal on Windows.
    return cleaned or fallback


def organise_files(classified: list[dict], output_dir: str) -> list[dict]:
    """
    Copy each question into output/classified/<Subject>/<Topic>/<QuestionType>/.

    The API mirrors this path into Supabase Storage verbatim, so the bucket ends
    up browsable by the same hierarchy the question bank filters on.
    """
    updated = []
    for entry in classified:
        rel_path = entry.get("path")
        subject  = safe_segment(entry.get("subject"), "Other")
        topic    = safe_segment(entry.get("topic"), "General")
        q_type   = safe_segment(entry.get("question_type"), DEFAULT_QUESTION_TYPE)

        if rel_path:
            src      = os.path.join(output_dir, rel_path)
            filename = os.path.basename(rel_path)
            dst_dir  = os.path.join(output_dir, "classified", subject, topic, q_type)
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, filename)

            if os.path.exists(src):
                shutil.copy2(src, dst)
                entry["classified_path"] = f"classified/{subject}/{topic}/{q_type}/{filename}"
            else:
                entry["classified_path"] = None

        updated.append(entry)
    return updated


# ─────────────────────────────────────────────────────────────────────────────
# Summary printer
# ─────────────────────────────────────────────────────────────────────────────

def print_summary(classified: list[dict]) -> None:
    """Print the Subject -> Topic -> Question Type tree the run produced."""
    from collections import Counter
    subject_counts: Counter = Counter()
    topic_counts: dict[str, Counter] = {}
    type_counts: dict[tuple[str, str], Counter] = {}

    for e in classified:
        s = e.get("subject", "Other")
        t = e.get("topic",   "General")
        q = e.get("question_type", DEFAULT_QUESTION_TYPE)
        subject_counts[s] += 1
        topic_counts.setdefault(s, Counter())[t] += 1
        type_counts.setdefault((s, t), Counter())[q] += 1

    sep = "-" * 60
    print("\n" + sep)
    print("  CLASSIFICATION SUMMARY")
    print(sep)
    for subject, count in sorted(subject_counts.items()):
        print(f"\n  [{console_safe(subject)}]  ({count} questions)")
        for topic, tc in sorted(topic_counts[subject].items()):
            print(f"       - {console_safe(topic)}: {tc}")
            for q_type, qc in sorted(type_counts[(subject, topic)].items()):
                print(f"           * {q_type}: {qc}")
    print(sep + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Classify extracted questions by subject, topic and question type using Groq",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("output_dir",
                        help="Path to output directory containing manifest.json")
    parser.add_argument("--pdf",
                        default=None,
                        help="Path to the original PDF (needed to extract text from image questions)")
    parser.add_argument("--exam",
                        choices=list(EXAM_TAXONOMY.keys()),
                        default="jee",
                        help="Exam type (determines subject/topic list)")
    parser.add_argument("--subject",
                        default=None,
                        help="Force every question to this subject — correct and much "
                             "faster for a single-subject paper, and it lets the "
                             "classifier skip the API whenever the page's chapter "
                             "heading and section banner cover the rest")
    parser.add_argument("--groq-key",
                        default=None,
                        help="Groq API key (overrides GROQ_API_KEY env variable)")
    parser.add_argument("--no-api",
                        action="store_true",
                        help="Keyword fallback only — no API calls at all")
    parser.add_argument("--delay",
                        type=float, default=1.0,
                        help="Seconds between Groq API calls")
    parser.add_argument("--no-copy",
                        action="store_true",
                        help="Only enrich manifest, don't copy files into Subject/Topic/Type folders")
    args = parser.parse_args()

    # ── Load manifest ──────────────────────────────────────────────────────────
    output_dir    = os.path.abspath(args.output_dir)
    manifest_path = os.path.join(output_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Error: manifest.json not found in {output_dir}", file=sys.stderr)
        sys.exit(1)

    with open(manifest_path, encoding="utf-8") as f:
        manifest: list[dict] = json.load(f)

    print(f"Loaded {len(manifest)} question(s) from manifest.json")

    # ── PDF path ───────────────────────────────────────────────────────────────
    pdf_path = args.pdf
    if pdf_path and not os.path.exists(pdf_path):
        print(f"Warning: PDF not found at {pdf_path}. Image questions may fall back to keyword.", file=sys.stderr)
        pdf_path = None

    if pdf_path:
        print(f"PDF for text extraction: {pdf_path}")
    else:
        print("Warning: --pdf not provided. Image questions will use keyword fallback.")

    # ── API key ────────────────────────────────────────────────────────────────
    use_api  = not args.no_api
    groq_key_str = (args.groq_key or os.environ.get("GROQ_API_KEY", "")).strip()
    groq_keys = [k.strip() for k in groq_key_str.split(",") if k.strip()]

    if use_api:
        if groq_keys:
            print(f"Provider: Groq ({GROQ_TEXT_MODEL}) | Keys loaded: {len(groq_keys)} | delay: {args.delay}s")
        else:
            print("Warning: GROQ_API_KEY not set. Using keyword fallback.", file=sys.stderr)
            use_api = False

    # ── Taxonomy ───────────────────────────────────────────────────────────────
    exam_taxonomy = EXAM_TAXONOMY.get(args.exam, EXAM_TAXONOMY["general"])
    print(f"Exam: {args.exam.upper()} | Subjects: {', '.join(exam_taxonomy.keys())}")
    if args.subject:
        print(f"Subject forced to: {args.subject}")
    print()

    # ── Chapter per page ───────────────────────────────────────────────────────
    page_chapters = chapters_by_page(manifest, args.subject, list(exam_taxonomy.keys()))
    if page_chapters:
        distinct = len(set(page_chapters.values()))
        print(f"Chapters from running lines: {distinct} across "
              f"{len(page_chapters)} page(s)\n")

    # ── Classify ───────────────────────────────────────────────────────────────
    classified: list[dict] = []
    for idx, entry in enumerate(manifest):
        q_num = entry.get("question_number", "?")
        print(f"[{idx+1:3d}/{len(manifest)}] Q{q_num}...", end="  ")
        enriched = classify_question(
            entry         = entry,
            output_dir    = output_dir,
            pdf_path      = pdf_path,
            exam_taxonomy = exam_taxonomy,
            groq_keys     = groq_keys,
            use_api       = use_api,
            delay         = args.delay,
            forced_subject= args.subject,
            page_chapters = page_chapters,
        )
        classified.append(enriched)

    # ── Organise files ─────────────────────────────────────────────────────────
    if not args.no_copy:
        print("\nOrganising files into Subject/Topic/QuestionType folders...")
        classified = organise_files(classified, output_dir)
        print(f"Done -> {os.path.join(output_dir, 'classified')}")

    # ── Write manifest ─────────────────────────────────────────────────────────
    out_path = os.path.join(output_dir, "manifest_classified.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(classified, f, indent=2, ensure_ascii=False)
    print(f"\nClassified manifest -> {out_path}")

    # ── Summary ────────────────────────────────────────────────────────────────
    print_summary(classified)


if __name__ == "__main__":
    main()
