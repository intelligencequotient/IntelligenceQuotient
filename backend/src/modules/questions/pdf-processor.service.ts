import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../config/supabase.config';
import { UploadsGateway, UploadStage } from './uploads.gateway';

const execAsync = promisify(exec);

@Injectable()
export class PdfProcessorService {
  private readonly logger = new Logger(PdfProcessorService.name);
  private readonly scriptsDir = path.resolve(process.cwd(), 'scripts', 'pdf-processor');

  constructor(private readonly uploadsGateway: UploadsGateway) {}

  /**
   * Main entrypoint for processing an uploaded PDF exam paper.
   */
  async processPdf(fileBuffer: Buffer, teacherId: string, examType: string = 'jee') {
    const runId = uuidv4();

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
      // 1. Setup temp workspace
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(pdfPath, fileBuffer);

      this.logger.log(`Starting PDF Processing Run: ${runId}`);
      report('queued', 'Preparing your document…', 2);

      // 2. Run Extraction Script
      const extractCmd = `python "${path.join(this.scriptsDir, 'extract.py')}" "${pdfPath}" --output-dir "${outputDir}" --dpi 200`;
      this.logger.log(`Executing: ${extractCmd}`);
      report('extracting', 'Slicing question images from the PDF…', 10);
      await execAsync(extractCmd);

      // 3. Run Classification Script
      // Note: GROQ_API_KEY must be in the environment running this NestJS app
      const classifyCmd = `python "${path.join(this.scriptsDir, 'classify.py')}" "${outputDir}" --pdf "${pdfPath}" --exam ${examType}`;
      this.logger.log(`Executing: ${classifyCmd}`);
      report('classifying', 'Classifying subjects and topics with AI…', 35);
      await execAsync(classifyCmd);

      // 4. Parse Results
      const manifestPath = path.join(outputDir, 'manifest_classified.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Classification manifest not found. Python script failed.');
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      this.logger.log(`Parsed ${manifest.length} questions from manifest.`);

      // 5. Upload Images to Supabase Storage & Prepare DB Inserts
      const dbRows: any[] = [];
      const bucket = 'question-images';
      const uploadable = manifest.filter((m: any) => m.classified_path).length || 1;
      let uploadedSoFar = 0;

      report(
        'uploading-images',
        `Uploading ${uploadable} question image(s)…`,
        55,
        { processed: manifest.length },
      );

      for (const item of manifest) {
        if (!item.classified_path) continue; // Skip failed extractions

        const absoluteImagePath = path.join(outputDir, item.classified_path);
        if (!fs.existsSync(absoluteImagePath)) continue;

        // E.g. "classified/Physics/Mechanics/q1_p1.png" -> "runId/Physics/Mechanics/q1_p1.png"
        const storagePath = `${runId}/${item.classified_path.replace('classified/', '')}`;

        const imageBuffer = fs.readFileSync(absoluteImagePath);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(storagePath, imageBuffer, {
            contentType: 'image/png',
            // Question images are immutable once extracted — let the CDN keep them for a year.
            cacheControl: '31536000',
            upsert: false
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

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(storagePath);

        // Prepare row for `questions` table
        // Defaults to marks=4, difficulty=medium, q_type=single_correct
        dbRows.push({
          subject: item.subject,
          topic: item.topic,
          subtopic: null,
          difficulty: item.difficulty || 'medium',
          q_type: 'single_correct',
          question_text: item.extracted_text || 'See attached image.',
          image_url: publicUrlData.publicUrl,
          options: ['A', 'B', 'C', 'D'], // Placeholder for image questions
          correct_answer: item.raw_answer ? { value: item.raw_answer } : { index: 0 },
          marks: 4,
          is_active: true,
          created_by: teacherId,
          // Extraction infers text, topic and answers — a human confirms before
          // these can be pulled into a live test.
          source: 'pdf',
          review_status: 'pending',
        });
      }

      // 6. Bulk Insert into DB
      report('saving', 'Saving questions to the review queue…', 90);
      let insertedCount = 0;
      if (dbRows.length > 0) {
        const { data: insertedData, error: insertError } = await supabase
          .from('questions')
          .insert(dbRows)
          .select('id');

        if (insertError) {
          throw new Error(`Failed to insert into DB: ${insertError.message}`);
        }
        insertedCount = insertedData?.length || 0;
      }

      this.logger.log(`Run ${runId} complete. Inserted ${insertedCount} questions.`);
      report(
        'complete',
        `Done — ${insertedCount} question(s) added to the review queue.`,
        100,
        { processed: manifest.length, inserted: insertedCount },
      );
      return { success: true, processed: manifest.length, inserted: insertedCount, runId };

    } catch (error) {
      this.logger.error(`PDF Processing failed: ${error.message}`);
      report('failed', 'Processing failed.', -1, { error: error?.message });
      throw new InternalServerErrorException('Failed to process PDF.');
    } finally {
      // 7. Cleanup temp files asynchronously so we don't block
      fs.rm(tempDir, { recursive: true, force: true }, (err) => {
        if (err) this.logger.warn(`Failed to cleanup temp dir ${tempDir}: ${err.message}`);
      });
    }
  }
}
