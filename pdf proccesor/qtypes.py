"""
qtypes.py — Question-type vocabulary shared by extract.py and classify.py.

The pipeline files questions as Subject -> Topic -> Question Type, and the
`questions.q_type` column stores the same value, so both scripts have to agree
on the vocabulary and on how a type is decided. Keeping that in one module is
what stops the extractor and the classifier drifting apart.

Values match `QUESTION_TYPES` in
backend/src/modules/questions/dto/question.dto.ts — anything else is rejected
by the API's write contract and, on the live database, by the column itself.
"""

import re

# ─────────────────────────────────────────────────────────────────────────────
# Vocabulary
# ─────────────────────────────────────────────────────────────────────────────

SINGLE_CORRECT = "single_correct"
MULTI_CORRECT  = "multi_correct"
NUMERICAL      = "numerical"
ASSERTION      = "assertion"

QUESTION_TYPES: tuple[str, ...] = (SINGLE_CORRECT, MULTI_CORRECT, NUMERICAL, ASSERTION)

# Most exam questions are plain MCQs, and a wrong single-correct guess is the
# cheapest one for a reviewer to fix — the options are already on the image.
DEFAULT_QUESTION_TYPE = SINGLE_CORRECT

# Wording the AI and the source papers use for the same four things.
TYPE_ALIASES: dict[str, str] = {
    "mcq": SINGLE_CORRECT,
    "scq": SINGLE_CORRECT,
    "single": SINGLE_CORRECT,
    "single_correct": SINGLE_CORRECT,
    "single correct": SINGLE_CORRECT,
    "singlecorrect": SINGLE_CORRECT,
    "one_correct": SINGLE_CORRECT,
    "msq": MULTI_CORRECT,
    "multi": MULTI_CORRECT,
    "multiple": MULTI_CORRECT,
    "multi_correct": MULTI_CORRECT,
    "multi correct": MULTI_CORRECT,
    "multicorrect": MULTI_CORRECT,
    "multiple_correct": MULTI_CORRECT,
    "multiple correct": MULTI_CORRECT,
    "nat": NUMERICAL,
    "int": NUMERICAL,
    "integer": NUMERICAL,
    "numeric": NUMERICAL,
    "numerical": NUMERICAL,
    "numerical_value": NUMERICAL,
    "numerical value": NUMERICAL,
    "fill_in_the_blank": NUMERICAL,
    "assertion": ASSERTION,
    "assertion_reason": ASSERTION,
    "assertion reason": ASSERTION,
    "reasoning": ASSERTION,
    "statement": ASSERTION,
}


def normalise_question_type(value) -> str | None:
    """Map a loose label ('MCQ', 'Multiple Correct', 'NAT') to a canonical type."""
    key = str(value or "").strip().lower().replace("-", "_")
    if not key:
        return None
    if key in QUESTION_TYPES:
        return key
    return TYPE_ALIASES.get(key) or TYPE_ALIASES.get(key.replace("_", " "))


# ─────────────────────────────────────────────────────────────────────────────
# Instruction wording
# ─────────────────────────────────────────────────────────────────────────────
#
# Papers state the answer format in prose, either in a section banner ("SECTION
# 2 ... ONE OR MORE THAN ONE of these four options is(are) correct") or inside
# the question itself. These patterns read that prose. Ordering matters: the
# multi-correct phrasings are checked first because "one or more than one of
# these four options is correct" also contains "one option is correct".

_INSTRUCTION_PATTERNS: list[tuple[str, re.Pattern]] = [
    (MULTI_CORRECT, re.compile(
        r"one\s+or\s+more\s+than\s+one"
        r"|more\s+than\s+one\s+(?:of\s+the\s+)?(?:given\s+)?option"
        r"|one\s+or\s+more\s+(?:of\s+the\s+)?(?:given\s+)?(?:four\s+)?option"
        r"|multiple\s+correct"
        r"|multi[\s\-]correct"
        r"|may\s+be\s+correct"
        r"|is\s*\(\s*are\s*\)\s*correct"
        r"|are\s+correct\s+answer",
        re.IGNORECASE)),
    (NUMERICAL, re.compile(
        r"numerical\s+value"
        r"|non[\s\-]?negative\s+integer"
        r"|integer\s+(?:answer|type|value)"
        r"|answer\s+is\s+an?\s+integer"
        r"|decimal\s+place"
        r"|round(?:ed)?\s+off\s+to"
        r"|correct\s+up\s+to\s+the",
        re.IGNORECASE)),
    (ASSERTION, re.compile(
        r"assertion\s*[\-–:(]"
        r"|assertion\s+and\s+reason"
        r"|assertion\s*\(\s*a\s*\)"
        r"|statement[\s\-]?(?:1|i)\b.{0,80}?statement[\s\-]?(?:2|ii)\b"
        r"|reason\s*\(\s*r\s*\)",
        re.IGNORECASE | re.DOTALL)),
    (SINGLE_CORRECT, re.compile(
        r"only\s+one\s+(?:of\s+these\s+)?(?:four\s+)?option"
        r"|only\s+one\s+is\s+correct"
        r"|exactly\s+one\s+option"
        r"|single\s+correct"
        r"|one\s+option\s+is\s+correct",
        re.IGNORECASE)),
]

# A section banner is a short run of prose. Anything longer is a question that
# happens to quote the instruction, and dropping it would lose real content.
MAX_SECTION_BANNER_CHARS = 400


def detect_type_from_instructions(text: str | None) -> str | None:
    """Read the answer format out of instruction prose, or None if it says nothing."""
    if not text:
        return None
    for q_type, pattern in _INSTRUCTION_PATTERNS:
        if pattern.search(text):
            return q_type
    return None


def looks_like_section_banner(text: str | None) -> bool:
    """
    True for a standalone block that only announces a section's answer format.

    Such a block belongs to no question: appended to the preceding one it both
    corrupts that question's text and stretches its crop rectangle down over
    the banner.
    """
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) > MAX_SECTION_BANNER_CHARS:
        return False
    if detect_type_from_instructions(stripped) is None:
        return False
    # "SECTION", "PART", "Q.1-6", or an explicit "... TYPE" heading — a banner
    # says what is coming, it does not ask anything.
    return bool(re.search(
        r"\bsection\b|\bpart\b|\bthis\s+(?:section|part)\b|type\s*$|questions?\b",
        stripped, re.IGNORECASE))


# ─────────────────────────────────────────────────────────────────────────────
# Answer keys
# ─────────────────────────────────────────────────────────────────────────────

_SEPARATORS = r"[\s\(\)\[\]\.,;:&/+-]"
_ANSWER_LETTERS_RE = re.compile(rf"^{_SEPARATORS}*(?:[abcd]{_SEPARATORS}*)+$", re.IGNORECASE)
_LETTER_RE = re.compile(r"[abcd]", re.IGNORECASE)
_NUMBER_RE = re.compile(r"^[\s\(\)\[\]]*[-+]?\d+(?:\.\d+)?[\s\(\)\[\]]*$")


def answer_key_letters(raw_answer) -> list[int]:
    """
    Option indices named by an answer key such as 'A', '(B)', 'A,C' or 'BCD'.

    Returns [] when the key is not a set of option letters — a numerical answer,
    a word, or nothing at all.
    """
    text = str(raw_answer or "").strip()
    if not text:
        return []
    # 'B and D' is two options, not three: the 'a' in 'and' is a joining word.
    cleaned = re.sub(r"\band\b", " ", text, flags=re.IGNORECASE)
    if not _ANSWER_LETTERS_RE.match(cleaned):
        return []
    seen: list[int] = []
    for match in _LETTER_RE.finditer(cleaned):
        idx = ord(match.group(0).lower()) - ord("a")
        if idx not in seen:
            seen.append(idx)
    return sorted(seen)


def answer_key_value(raw_answer) -> str | None:
    """The bare number in an answer key like '4', '(2.50)' or '-3', else None."""
    text = str(raw_answer or "").strip()
    if not text or not _NUMBER_RE.match(text):
        return None
    return text.strip("()[] \t")


# ─────────────────────────────────────────────────────────────────────────────
# Option labels
# ─────────────────────────────────────────────────────────────────────────────

_LETTER_LABEL_RE = re.compile(r"[\(\[]?\s*([ABCD])\s*[\)\].]", re.IGNORECASE)
_DIGIT_LABEL_RE  = re.compile(r"[\(\[]\s*([1-4])\s*[\)\]]")


def count_option_labels(text: str | None) -> int:
    """
    How many distinct option labels — (A)…(D) or (1)…(4) — the question shows.

    Digit labels need three of the four before they count: a lone "(2)" is far
    more often a numbered clause or an equation reference than an option.
    """
    if not text:
        return 0
    letters = {m.group(1).upper() for m in _LETTER_LABEL_RE.finditer(text)}
    digits  = {m.group(1) for m in _DIGIT_LABEL_RE.finditer(text)}
    return max(len(letters), len(digits) if len(digits) >= 3 else 0)


# ─────────────────────────────────────────────────────────────────────────────
# Resolver
# ─────────────────────────────────────────────────────────────────────────────

def resolve_question_type(
    question_text: str | None,
    raw_answer=None,
    section_type: str | None = None,
    ai_type=None,
) -> tuple[str, str]:
    """
    Decide a question's type from every signal the pipeline collected.

    Returns (question_type, evidence). The order below is a confidence ranking,
    strongest first:

      1. instruction wording inside the question — the paper stating its own rule
      2. an answer key naming two or more options — a single-correct question
         cannot have two answers, whatever any banner claims
      3. the section banner this question sits under
      4. an answer key that is a bare number, but only where the question shows
         no option list (papers that label options (1)-(4) answer with a digit)
      5. the classifier AI's reading of the question
      6. a visible option list — an MCQ of some kind, and single is the norm
      7. the default

    Nothing here is authoritative, which is why extracted questions land in the
    review queue as `pending` for a human to confirm.
    """
    option_count = count_option_labels(question_text)

    stated = detect_type_from_instructions(question_text)
    if stated:
        return stated, "question-text"

    letters = answer_key_letters(raw_answer)
    if len(letters) >= 2:
        return MULTI_CORRECT, "answer-key"

    section = normalise_question_type(section_type)
    if section:
        return section, "section-header"

    if answer_key_value(raw_answer) is not None and option_count < 2:
        return NUMERICAL, "answer-key"

    ai = normalise_question_type(ai_type)
    if ai:
        return ai, "ai"

    if option_count >= 2:
        return SINGLE_CORRECT, "options"

    return DEFAULT_QUESTION_TYPE, "default"
