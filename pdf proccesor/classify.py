"""
classify.py — Subject & Topic Classifier (Groq-only, NO Gemini)

Pipeline:
  PDF -> extract.py (PyMuPDF, no AI) -> question images + manifest.json
       -> classify.py (Groq text AI)  -> sorted subject/topic folders

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
import json
import os
import re
import shutil
import sys
import time

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
            return res.json()["choices"][0]["message"]["content"].strip()
        except _requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 0
            if code == 429 and len(api_keys) > 1:
                call_groq.key_idx = (call_groq.key_idx + 1) % len(api_keys)
                print(f"\n    Groq HTTP 429 - rotating to API key {call_groq.key_idx + 1}/{len(api_keys)}...", end="", flush=True)
                time.sleep(1.0) # minimal wait before trying next key
                continue
            wait = 8 * (2 ** attempt)
            print(f"\n    Groq HTTP {code} - retrying in {wait}s...", end="", flush=True)
            time.sleep(wait)
        except Exception as e:
            print(f"\n    Groq error: {e}", file=sys.stderr)
            return None
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Classification prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def build_classify_prompt(exam_taxonomy: dict, question_text: str) -> str:
    taxonomy_lines = []
    for subj, topics in exam_taxonomy.items():
        taxonomy_lines.append(f"  {subj}: {', '.join(topics)}")

    return f"""You are classifying an exam question by subject and topic.

Available subjects and topics:
{chr(10).join(taxonomy_lines)}

Question text:
{question_text[:1500]}

Return ONLY valid JSON (no markdown, no explanation):
{{
  "subject": "<one of the subject names above>",
  "topic": "<one of the topics for that subject>",
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

def closest_key(query: str, keys: list[str]) -> str | None:
    q = query.lower()
    for k in keys:
        if q in k.lower() or k.lower() in q:
            return k
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Single question classifier
# ─────────────────────────────────────────────────────────────────────────────

def classify_question(entry: dict, output_dir: str, pdf_path: str | None,
                      exam_taxonomy: dict, groq_keys: list[str],
                      use_api: bool, delay: float) -> dict:
    """
    Classify one question using Groq text API only.

    For image questions: extract text from the PDF page using PyMuPDF,
                         then send to Groq for classification.
    For text questions:  use the content field directly with Groq.
    """
    q_type   = entry.get("type", "text")
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

    # ── Groq classification ───────────────────────────────────────────────────
    if use_api and groq_keys and question_text:
        prompt = build_classify_prompt(exam_taxonomy, question_text)
        raw = call_groq(groq_keys, prompt)
        classification = parse_classification(raw)
        if classification:
            classification["method"] = "groq-text"
            method = "groq-text"
        time.sleep(delay)

    # ── Keyword fallback ──────────────────────────────────────────────────────
    if classification is None:
        classification = classify_by_keywords(question_text, exam_taxonomy)
        method = "keyword"

    # ── Validate against taxonomy ─────────────────────────────────────────────
    subject = classification.get("subject", "Other")
    topic   = classification.get("topic",   "General")

    if subject not in exam_taxonomy:
        subject = closest_key(subject, list(exam_taxonomy.keys())) or "Other"

    valid_topics = exam_taxonomy.get(subject, ["General"])
    if topic not in valid_topics:
        topic = closest_key(topic, valid_topics) or valid_topics[0]

    txt_preview = (question_text[:60].replace("\n", " ") if question_text else "(no text)").encode("ascii", "replace").decode()
    print(f"   Q{str(q_num):>4} ({q_type:5}) -> {subject} / {topic}  [{method}]")
    print(f"          text: \"{txt_preview}...\"")

    enriched = dict(entry)
    enriched["subject"]               = subject
    enriched["topic"]                 = topic
    enriched["confidence"]            = round(float(classification.get("confidence", 0.5)), 2)
    enriched["classification_method"] = method
    enriched["extracted_text"]        = question_text[:300] if question_text else None
    return enriched


# ─────────────────────────────────────────────────────────────────────────────
# File organiser
# ─────────────────────────────────────────────────────────────────────────────

def organise_files(classified: list[dict], output_dir: str) -> list[dict]:
    """Copy each question file into output/classified/<Subject>/<Topic>/."""
    updated = []
    for entry in classified:
        rel_path = entry.get("path")
        subject  = re.sub(r'[<>:"/\\|?*]', "_", entry.get("subject", "Other"))
        topic    = re.sub(r'[<>:"/\\|?*]', "_", entry.get("topic",   "General"))

        if rel_path:
            src      = os.path.join(output_dir, rel_path)
            filename = os.path.basename(rel_path)
            dst_dir  = os.path.join(output_dir, "classified", subject, topic)
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, filename)

            if os.path.exists(src):
                shutil.copy2(src, dst)
                entry["classified_path"] = f"classified/{subject}/{topic}/{filename}"
            else:
                entry["classified_path"] = None

        updated.append(entry)
    return updated


# ─────────────────────────────────────────────────────────────────────────────
# Summary printer
# ─────────────────────────────────────────────────────────────────────────────

def print_summary(classified: list[dict]) -> None:
    from collections import Counter
    subject_counts: Counter = Counter()
    topic_counts: dict[str, Counter] = {}

    for e in classified:
        s = e.get("subject", "Other")
        t = e.get("topic",   "General")
        subject_counts[s] += 1
        topic_counts.setdefault(s, Counter())[t] += 1

    sep = "-" * 60
    print("\n" + sep)
    print("  CLASSIFICATION SUMMARY")
    print(sep)
    for subject, count in sorted(subject_counts.items()):
        print(f"\n  [{subject}]  ({count} questions)")
        for topic, tc in sorted(topic_counts[subject].items()):
            print(f"       - {topic}: {tc}")
    print(sep + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Classify extracted questions using Groq (text only, no vision API needed)",
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
                        help="Only enrich manifest, don't copy files into subject folders")
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
    print(f"Exam: {args.exam.upper()} | Subjects: {', '.join(exam_taxonomy.keys())}\n")

    # ── Classify ───────────────────────────────────────────────────────────────
    classified: list[dict] = []
    for idx, entry in enumerate(manifest):
        q_num = entry.get("question_number", "?")
        print(f"[{idx+1:3d}/{len(manifest)}] Q{q_num}...", end="  ")
        enriched = classify_question(
            entry        = entry,
            output_dir   = output_dir,
            pdf_path     = pdf_path,
            exam_taxonomy= exam_taxonomy,
            groq_keys    = groq_keys,
            use_api      = use_api,
            delay        = args.delay,
        )
        classified.append(enriched)

    # ── Organise files ─────────────────────────────────────────────────────────
    if not args.no_copy:
        print("\nOrganising files into subject/topic folders...")
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
