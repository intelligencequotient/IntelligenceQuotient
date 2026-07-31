# 📄 AI PDF Exam Processor & Classifier

A high-performance pipeline for extracting individual exam questions from PDFs (as aggressively-compressed images) and classifying them by Subject and Topic using local parsing and the free Groq AI API.

## 🚀 The Working Engine
This repository contains the completely optimized, working two-step engine:

1. **`extract.py`** 
   - Uses PyMuPDF to analyze the geometric layout of the PDF and slice out individual questions.
   - Ignores page numbers, headers, and orphan text blocks.
   - **Extreme Compression**: Automatically drops images to 1-bit Black & White (Dithered) PNGs, shrinking file sizes by 95% (e.g., from 130KB down to ~8KB per image) while preserving diagrams perfectly.
   - Exports the images and generates a `manifest.json`.

2. **`classify.py`**
   - Reads the extracted text associated with each image.
   - Connects to the **Groq API** (`llama-3.3-70b-versatile`) to classify the question into its exact Subject and Topic folder.
   - **Seamless Key Rotation**: Allows you to pass multiple free-tier Groq API keys to distribute limits automatically. If a rate limit (HTTP 429) occurs, it instantly jumps to the next key.

---

## 🛠️ Installation

You only need standard Python libraries. Install them via pip:

```bash
pip install PyMuPDF Pillow requests
```

*(Note: We do not need heavy AI or OCR models locally, saving massive amounts of RAM/storage).*

---

## ⚙️ How to Run the Pipeline

### Step 1: Set your Groq API Keys
You can use a single API key, or pass a comma-separated list of keys if you have multiple free-tier accounts. The engine will automatically round-robin them to bypass rate limits!

**Windows (PowerShell):**
```powershell
$env:GROQ_API_KEY = "gsk_key1,gsk_key2,gsk_key3"
```
**Mac / Linux:**
```bash
export GROQ_API_KEY="gsk_key1,gsk_key2,gsk_key3"
```

### Step 2: Run Extraction
Feed your exam PDF into the extractor. It will instantly dump the highly-compressed cropped images and the manifest into the output folder.

```bash
python extract.py ".\English_2024_QP.pdf" --output-dir .\output --dpi 200
```
*(You can adjust `--dpi` if you want higher resolution, but 200 is optimal for database storage).*

### Step 3: Run Classification
Run the classification script. It will send the text to Groq, organize the PNGs into Subject/Topic folders, and generate `manifest_classified.json`.

```bash
python classify.py .\output --pdf ".\English_2024_QP.pdf" --exam jee
```
*(Replace `--exam jee` with `--exam cbse` depending on your taxonomy).*

---

## 📁 Output Structure

After running both scripts, your `output` folder will look like this:

```
output/
├── manifest.json                  # Raw extraction data
├── manifest_classified.json       # Final classified data for your database
├── image_questions/               # Original extracted images (temporary)
└── classified/                    # 🎯 FINAL FOLDER
    ├── Physics/
    │   ├── Thermodynamics/
    │   │   ├── q9_p13.png
    │   ├── Electrostatics/
    │   │   ├── q6_p12.png
    ├── Chemistry/
    │   ├── Solutions/
    │   │   ├── q12_p26.png
    └── Mathematics/
        ├── Conic Sections/
        │   ├── q2_p0.png
```

## 💡 Cloud & Database Ready
Since the image payloads are mathematically compressed to ~8KB per question and the logic relies on serverless API calls, this entire engine can be deployed for virtually **$0.00/month** on platforms like Google Cloud Run or AWS Lambda using a free storage bucket (like Cloudflare R2).
