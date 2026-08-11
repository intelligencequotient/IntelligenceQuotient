# 📄 AI PDF Exam Processor & Classifier

A pipeline for slicing individual exam questions out of a PDF (as
aggressively-compressed images) and filing them by **Subject → Topic → Question
Type** using local parsing plus the free Groq API.

> **This folder is a standalone copy for experimenting on papers.** The version
> the platform actually runs lives in `backend/scripts/pdf-processor/` and is
> invoked by `PdfProcessorService`. Keep the two in sync — they are the same
> three files.

## 🚀 The Working Engine

1. **`extract.py`**
   - Uses PyMuPDF to analyse the geometric layout of the PDF and slice out
     individual questions.
   - Ignores page numbers, headers, and orphan text blocks.
   - Reads the section banners a paper prints above each block of questions
     ("MULTIPLE CORRECT ANSWERS TYPE", "SUBJECTIVE INTEGER TYPE") and records
     which one each question sits under. A banner is never glued onto the
     question above it — doing so both corrupted that question's text and
     stretched its crop rectangle down over the banner.
   - Pulls out the printed answer key (`Ans: AC`) and crops just above it, so
     the answer never appears in the student-facing image.
   - **Extreme compression**: drops images to 1-bit black & white (dithered)
     PNGs, roughly 95% smaller than RGB (~8 KB per question) while preserving
     diagrams.
   - Exports the images and a `manifest.json`.

2. **`classify.py`**
   - Reads the text associated with each image, and falls back to a Groq vision
     model for questions PyMuPDF cannot read (scans, pure-diagram items).
   - Classifies each question into Subject, Topic **and Question Type**.
   - **Seamless key rotation**: pass a comma-separated list of free-tier Groq
     keys and a rate limit (HTTP 429) moves straight to the next one.

3. **`qtypes.py`**
   - The question-type vocabulary both scripts share, and the rules that decide
     a type. Values match `QUESTION_TYPES` in the API's
     `dto/question.dto.ts`, because they are written straight into
     `questions.q_type`.

## 🏷️ Question types

| Value | What it is |
|---|---|
| `single_correct` | Four options, exactly one right |
| `multi_correct` | Options where one **or more** may be right |
| `numerical` | A number to write in — no options |
| `assertion` | An Assertion/Reason or Statement-1/Statement-2 pair |

The type is decided from every signal the pipeline collected, strongest first:

1. instruction wording inside the question itself
2. an answer key naming two or more options — a single-correct question cannot
   have two answers, whatever a banner claims
3. the section banner the question sits under
4. an answer key that is a bare number, where the question shows no option list
   (papers that label options `(1)`–`(4)` answer with a digit)
5. the classifier AI's reading
6. a visible option list
7. the default, `single_correct`

Nothing here is authoritative, which is why questions land in the platform's
Review Queue as `pending` for a human to confirm.

---

## 🛠️ Installation

```bash
pip install -r requirements.txt
```

*(No local AI or OCR models — the heavy lifting is a serverless API call.)*

---

## ⚙️ How to Run the Pipeline

### Step 1: Set your Groq API keys
One key, or a comma-separated list if you have several free-tier accounts — the
engine round-robins them to dodge rate limits.

**Windows (PowerShell):**
```powershell
$env:GROQ_API_KEY = "gsk_key1,gsk_key2,gsk_key3"
```
**Mac / Linux:**
```bash
export GROQ_API_KEY="gsk_key1,gsk_key2,gsk_key3"
```

### Step 2: Run extraction

```bash
python extract.py "./PHYSICS ASSIGNMENTS.pdf" --output-dir ./output --dpi 200
```
*(200 DPI is the sweet spot for database storage; raise it if you need finer
diagrams.)*

### Step 3: Run classification

```bash
python classify.py ./output --pdf "./PHYSICS ASSIGNMENTS.pdf" --exam jee
```
*(`--exam` picks the taxonomy: `jee`, `neet`, `cbse` or `general`. Add
`--no-api` to skip Groq entirely and use keyword matching.)*

---

## 📁 Output Structure

```
output/
├── manifest.json                  # Raw extraction data
├── manifest_classified.json       # Final classified data for your database
├── image_questions/               # Original extracted images (temporary)
└── classified/                    # 🎯 FINAL FOLDER
    ├── Physics/
    │   ├── Thermodynamics/
    │   │   ├── single_correct/
    │   │   │   └── q9_p13.png
    │   │   └── numerical/
    │   │       └── q11_p13.png
    │   └── Electrostatics/
    │       └── multi_correct/
    │           └── q6_p12.png
    └── Mathematics/
        └── Conic Sections/
            └── single_correct/
                └── q2_p0.png
```

`PdfProcessorService` mirrors that path into the `question-images` Supabase
bucket verbatim, so the bucket is browsable by the same hierarchy the question
bank filters on.

## 💡 Cloud & Database Ready
With ~8 KB image payloads and serverless API calls, this engine runs for
virtually **$0.00/month** on Google Cloud Run or AWS Lambda with a free storage
bucket such as Cloudflare R2.
