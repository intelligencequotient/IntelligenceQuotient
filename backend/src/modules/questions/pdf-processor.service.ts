import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase.config';
import { insertInBatches } from '../../common/db/query.util';
import { QUESTION_TYPES } from './dto/question.dto';
import { UploadsGateway, UploadStage } from './uploads.gateway';

const execFileAsync = promisify(execFile);

/**
 * Exam taxonomies the Python classifier accepts (`EXAM_TAXONOMY` in classify.py).
 * The value reaches a child process, so it is matched against this list rather
 * than sanitised — an allow-list cannot be escaped.
 */
const SUPPORTED_EXAM_TYPES = ['jee', 'neet', 'cbse', 'general'] as const;
type ExamType = (typeof SUPPORTED_EXAM_TYPES)[number];

/** A large scanned paper takes a few minutes; beyond this something is wrong. */
const EXTRACT_TIMEOUT_MS = 5 * 60 * 1000;
const CLASSIFY_TIMEOUT_MS = 10 * 60 * 1000;

/** Cap on child-process stdout so a runaway script cannot exhaust memory. */
const MAX_CHILD_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Refuse absurd manifests rather than inserting tens of thousands of rows. */
const MAX_QUESTIONS_PER_RUN = 500;

/** Temp run directories older than this are orphans from a crashed process. */
const STALE_TEMP_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * The classifier files every question as Subject/Topic/QuestionType, and that
 * last level is the one the exam UI renders from: `numerical` gets a keypad,
 * `multi_correct` gets checkboxes, `single_correct` gets radio buttons. It used
 * to be hardcoded to `single_correct`, so every numerical question extracted
 * from a paper reached students as a four-option MCQ with placeholder options.
 */
const DEFAULT_QUESTION_TYPE = 'single_correct';

/** Placeholder options for the MCQ shapes; a reviewer replaces them. */
const PLACEHOLDER_OPTIONS = ['A', 'B', 'C', 'D'];

@Injectable()
export class PdfProcessorService implements OnModuleInit {
  private readonly logger = new Logger(PdfProcessorService.name);
  private readonly scriptsDir = path.resolve(process.cwd(), 'scripts', 'pdf-processor');

  /** `python3` on the container image; plain `python` is what Windows dev boxes have. */
  private readonly pythonBin =
    process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  constructor(private readonly uploadsGateway: UploadsGateway) {}

  /**
   * Clears run directories left behind by a crash or a hard restart.
   *
   * The happy path deletes its own workspace, but a killed process leaves a full
   * PDF plus every extracted page image on disk — a few hundred megabytes per
   * abandoned run, and nothing was ever removing them.
   */
  async onModuleInit(): Promise<void> {
    const tempRoot = path.resolve(process.cwd(), 'temp');
    let entries: string[];
    try {
      entries = await fs.readdir(tempRoot);
    } catch {
      return; // No temp directory yet — nothing to clean.
    }

    const cutoff = Date.now() - STALE_TEMP_AGE_MS;
    let removed = 0;

    for (const entry of entries) {
      const target = path.join(tempRoot, entry);
      try {
        const stat = await fs.stat(target);
        if (!stat.isDirectory() || stat.mtimeMs > cutoff) continue;
        await fs.rm(target, { recursive: true, force: true });
        removed += 1;
      } catch {
        // A run that is still in flight, or a permissions problem — skip it.
      }
    }

    if (removed) this.logger.log(`Cleared ${removed} stale PDF run director(ies).`);
  }

  /**
   * Main entrypoint for processing an uploaded PDF exam paper.
   *
   * `examType` is caller-supplied and used to be interpolated straight into a
   * shell string (`--exam ${examType}` passed to `exec`), which let any
   * authenticated teacher run arbitrary commands on the API host. Arguments are
   * now passed as an argv array to `execFile` — no shell is involved — and the
   * value is additionally checked against a fixed list.
   */
  async processPdf(fileBuffer: Buffer, teacherId: string, examType: string = 'jee') {
    if (!fileBuffer?.length) throw new BadRequestException('No PDF file provided.');
    if (!this.looksLikePdf(fileBuffer)) {
      throw new BadRequestException('That file is not a PDF.');
    }

    const exam = this.resolveExamType(examType);
    const runId = randomUUID();

    // Real progress, pushed to the teacher's own socket room.
    const report = (
      stage: UploadStage,
      message: string,
      percent: number,
      extra: Record<string, any> = {},
    ) => {
      try {
        this.uploadsGateway.emitProgress(teacherId, { runId, stage, message, percent, ...extra });
      } catch {
        // Progress reporting must never break the pipeline.
      }
    };

    const tempDir = path.resolve(process.cwd(), 'temp', runId);
    const outputDir = path.join(tempDir, 'output');
    const pdfPath = path.join(tempDir, 'exam.pdf');

    try {
      // 1. Setup temp workspace. Async throughout — the previous sync writes
      //    blocked the event loop for every other request on the instance.
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(pdfPath, fileBuffer);

      this.logger.log(`Starting PDF Processing Run: ${runId}`);
      report('queued', 'Preparing your document…', 2);

      // 2. Extraction
      report('extracting', 'Slicing question images from the PDF…', 10);
      await this.runScript(
        'extract.py',
        [pdfPath, '--output-dir', outputDir, '--dpi', '200'],
        EXTRACT_TIMEOUT_MS,
      );

      // 3. Classification (needs GROQ_API_KEY in the API process environment)
      report('classifying', 'Classifying subjects and topics with AI…', 35);
      await this.runScript(
        'classify.py',
        [outputDir, '--pdf', pdfPath, '--exam', exam],
        CLASSIFY_TIMEOUT_MS,
      );

      // 4. Parse results
      const manifestPath = path.join(outputDir, 'manifest_classified.json');
      const manifest = await this.readManifest(manifestPath);
      this.logger.log(`Parsed ${manifest.length} questions from manifest.`);

      // 5. Upload images to Supabase Storage & prepare DB inserts
      const dbRows: any[] = [];
      const typeCounts: Record<string, number> = {};
      const bucket = 'question-images';
      const uploadable = manifest.filter((m: any) => m.classified_path).length || 1;
      let uploadedSoFar = 0;

      report('uploading-images', `Uploading ${uploadable} question image(s)…`, 55, {
        processed: manifest.length,
      });

      for (const item of manifest) {
        if (!item.classified_path) continue; // Skip failed extractions

        // The manifest is produced by our own script, but it is still a file on
        // disk: resolve it and confirm it stayed inside the run's output dir.
        const absoluteImagePath = this.resolveInside(outputDir, item.classified_path);
        if (!absoluteImagePath) {
          this.logger.warn(`Skipping manifest entry with suspicious path: ${item.classified_path}`);
          continue;
        }
        if (!(await this.exists(absoluteImagePath))) continue;

        // E.g. "classified/Physics/Mechanics/q1_p1.png" -> "runId/Physics/Mechanics/q1_p1.png"
        const storagePath = `${runId}/${item.classified_path.replace('classified/', '')}`;
        const imageBuffer = await fs.readFile(absoluteImagePath);

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(storagePath, imageBuffer, {
            contentType: 'image/png',
            // Question images are immutable once extracted — let the CDN keep them for a year.
            cacheControl: '31536000',
            upsert: false,
          });

        if (uploadError) {
          this.logger.error(`Failed to upload ${storagePath}: ${uploadError.message}`);
          continue; // Skip if we can't upload the image
        }

        // Images occupy the 55-85% band of the overall progress bar.
        uploadedSoFar += 1;
        report(
          'uploading-images',
          `Uploaded ${uploadedSoFar} of ${uploadable} images…`,
          55 + Math.round((uploadedSoFar / uploadable) * 30),
        );

        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);

        // Prepare row for `questions` table. Defaults to marks=4, medium.
        const qType = this.resolveQuestionType(item.question_type);
        typeCounts[qType] = (typeCounts[qType] || 0) + 1;

        dbRows.push({
          subject: item.subject,
          topic: item.topic,
          subtopic: null,
          difficulty: item.difficulty || 'medium',
          q_type: qType,
          question_text: item.extracted_text || 'See attached image.',
          image_url: publicUrlData.publicUrl,
          options: qType === 'numerical' ? [] : PLACEHOLDER_OPTIONS,
          correct_answer: this.buildCorrectAnswer(qType, item),
          marks: 4,
          is_active: true,
          created_by: teacherId,
          // Extraction infers text, topic, type and answers — a human confirms
          // before these can be pulled into a live test.
          source: 'pdf',
          review_status: 'pending',
        });
      }

      // 6. Bulk insert into DB, batched so one paper never sends a single
      //    multi-megabyte request body.
      report('saving', 'Saving questions to the review queue…', 90);
      const insertedCount = await insertInBatches(dbRows, (batch) =>
        supabase.from('questions').insert(batch),
      );

      this.logger.log(
        `Run ${runId} complete. Inserted ${insertedCount} questions. ` +
          `Types: ${JSON.stringify(typeCounts)}`,
      );
      report('complete', `Done — ${insertedCount} question(s) added to the review queue.`, 100, {
        processed: manifest.length,
        inserted: insertedCount,
        byType: typeCounts,
      });
      return {
        success: true,
        processed: manifest.length,
        inserted: insertedCount,
        byType: typeCounts,
        runId,
      };
    } catch (error: any) {
      this.logger.error(`PDF Processing failed: ${error?.message}`);
      report('failed', 'Processing failed.', -1, { error: error?.message });
      // Client-facing validation problems keep their own status; anything else
      // is an internal failure and must not echo the underlying message back.
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to process PDF.');
    } finally {
      // 7. Cleanup temp files; never let a cleanup failure mask the real result.
      fs.rm(tempDir, { recursive: true, force: true }).catch((err) =>
        this.logger.warn(`Failed to cleanup temp dir ${tempDir}: ${err?.message}`),
      );
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Matches the caller's exam type against the taxonomies classify.py knows. */
  private resolveExamType(value: string): ExamType {
    const normalised = String(value ?? '').trim().toLowerCase();
    if (!normalised) return 'jee';
    if (!(SUPPORTED_EXAM_TYPES as readonly string[]).includes(normalised)) {
      throw new BadRequestException(
        `Unsupported exam type. Expected one of: ${SUPPORTED_EXAM_TYPES.join(', ')}.`,
      );
    }
    return normalised as ExamType;
  }

  /** `%PDF-` magic bytes. Filenames and declared MIME types are not evidence. */
  private looksLikePdf(buffer: Buffer): boolean {
    return buffer.length > 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  }

  /**
   * Maps the classifier's `question_type` onto a value the question bank
   * accepts. The manifest is written by our own script, but it is still a file
   * a run produced: an unrecognised value would fail the whole insert batch, so
   * anything unexpected falls back to the commonest shape for a reviewer to fix.
   */
  private resolveQuestionType(value: unknown): string {
    const normalised = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if ((QUESTION_TYPES as readonly string[]).includes(normalised)) return normalised;
    if (normalised) {
      this.logger.warn(
        `Unrecognised question_type "${normalised}"; storing as ${DEFAULT_QUESTION_TYPE}.`,
      );
    }
    return DEFAULT_QUESTION_TYPE;
  }

  /**
   * Builds the `correct_answer` in the shape the grader matches on for this
   * type — `{ indices }` for multi-select, `{ value }` for numerical, `{ index }`
   * otherwise. classify.py already parsed the paper's answer key where it
   * printed one; where it did not, the placeholder is a marker for the reviewer,
   * and `review_status: 'pending'` keeps the question out of live tests until
   * they have set it.
   */
  private buildCorrectAnswer(qType: string, item: any): Record<string, any> {
    const indices: number[] = Array.isArray(item?.answer_indices) ? item.answer_indices : [];
    const value = item?.answer_value ?? null;

    if (qType === 'multi_correct') return { indices };
    if (qType === 'numerical') return { value: value ?? item?.raw_answer ?? null };
    return { index: indices.length ? indices[0] : 0 };
  }

  /**
   * Spawns a pipeline script with an argv array — no shell, so nothing in the
   * arguments can be interpreted as a command — under a timeout.
   */
  private async runScript(script: string, args: string[], timeoutMs: number): Promise<void> {
    const scriptPath = path.join(this.scriptsDir, script);
    this.logger.log(`Executing: ${script} ${args.join(' ')}`);

    try {
      await execFileAsync(this.pythonBin, [scriptPath, ...args], {
        timeout: timeoutMs,
        maxBuffer: MAX_CHILD_OUTPUT_BYTES,
        // Belt and braces: execFile does not use a shell, and this makes that explicit.
        shell: false,
        windowsHide: true,
      });
    } catch (e: any) {
      if (e?.killed || e?.signal === 'SIGTERM') {
        throw new Error(`${script} timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      // stderr carries the Python traceback — useful in our logs, never to the client.
      this.logger.error(`${script} failed: ${e?.stderr || e?.message}`);
      throw new Error(`${script} failed`);
    }
  }

  private async readManifest(manifestPath: string): Promise<any[]> {
    if (!(await this.exists(manifestPath))) {
      throw new Error('Classification manifest not found. Python script failed.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch (e: any) {
      throw new Error(`Classification manifest is not valid JSON: ${e?.message}`);
    }

    if (!Array.isArray(parsed)) throw new Error('Classification manifest is not an array.');
    if (parsed.length > MAX_QUESTIONS_PER_RUN) {
      throw new BadRequestException(
        `That paper produced ${parsed.length} questions, above the ${MAX_QUESTIONS_PER_RUN} per-upload limit. Split it into smaller files.`,
      );
    }
    return parsed;
  }

  /** Resolves `relative` under `root`, or null if it would escape the directory. */
  private resolveInside(root: string, relative: string): string | null {
    const resolved = path.resolve(root, relative);
    const prefix = path.resolve(root) + path.sep;
    return resolved.startsWith(prefix) ? resolved : null;
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}
