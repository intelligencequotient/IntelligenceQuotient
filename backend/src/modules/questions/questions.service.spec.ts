import { QuestionsService } from './questions.service';
import { supabase } from '../../config/supabase.config';

jest.mock('../../config/supabase.config', () => ({
  supabase: { from: jest.fn() },
}));

/**
 * Supabase query builders are chainable and thenable. This stands in for one:
 * every chain method returns the builder, and awaiting it yields `result`.
 */
function makeBuilder(result: any) {
  const builder: any = {};
  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'ilike', 'in', 'range', 'order', 'limit', 'single',
  ];
  for (const m of chainMethods) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return builder;
}

const csvOf = (...lines: string[]) =>
  Buffer.from(
    ['question,optA,optB,optC,optD,correct,difficulty,subject,topic,marks', ...lines].join('\n'),
  );

describe('QuestionsService', () => {
  let service: QuestionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuestionsService();
  });

  // ─── parseCSV ─────────────────────────────────────────────────────────────

  describe('parseCSV', () => {
    it('accepts a well-formed row and maps the correct answer to an index', async () => {
      const rows = await service.parseCSV(
        csvOf('What is 2+2?,3,4,5,6,B,easy,Mathematics,Arithmetic,4'),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        question_text: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correct_answer: { index: 1 },
        difficulty: 'easy',
        subject: 'Mathematics',
        topic: 'Arithmetic',
        q_type: 'single_correct',
        marks: 4,
        valid: true,
        errorMsg: null,
      });
    });

    it('defaults marks to 4 when the column is missing or unparseable', async () => {
      const rows = await service.parseCSV(
        csvOf('Q?,a,b,c,d,A,medium,Physics,Optics,'),
      );
      expect(rows[0].marks).toBe(4);
    });

    it('rejects a correct-answer letter outside A-D', async () => {
      const rows = await service.parseCSV(
        csvOf('Q?,a,b,c,d,X,easy,Physics,Optics,4'),
      );
      expect(rows[0].valid).toBe(false);
      expect(rows[0].errorMsg).toContain('correct answer must be A, B, C or D');
      expect(rows[0].correct_answer.index).toBe(-1);
    });

    it('rejects an unrecognised difficulty', async () => {
      const rows = await service.parseCSV(
        csvOf('Q?,a,b,c,d,A,extreme,Physics,Optics,4'),
      );
      expect(rows[0].valid).toBe(false);
      expect(rows[0].errorMsg).toContain('difficulty must be easy, medium or hard');
    });

    it('rejects a row whose designated correct option is blank', async () => {
      const rows = await service.parseCSV(
        csvOf('Q?,a,b,,d,C,easy,Physics,Optics,4'),
      );
      expect(rows[0].valid).toBe(false);
      expect(rows[0].errorMsg).toContain('option C is empty');
    });

    it('reports every problem on a row at once', async () => {
      const rows = await service.parseCSV(csvOf(',a,b,c,d,Z,nope,,,4'));
      expect(rows[0].valid).toBe(false);
      expect(rows[0].errorMsg).toContain('missing question text');
      expect(rows[0].errorMsg).toContain('missing subject');
      expect(rows[0].errorMsg).toContain('missing topic');
    });

    it('parses multiple rows independently', async () => {
      const rows = await service.parseCSV(
        csvOf(
          'Good?,a,b,c,d,A,easy,Physics,Optics,4',
          'Bad?,a,b,c,d,Q,easy,Physics,Optics,4',
        ),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].valid).toBe(true);
      expect(rows[1].valid).toBe(false);
    });
  });

  // ─── bulkInsert ───────────────────────────────────────────────────────────

  describe('bulkInsert', () => {
    const validRow = {
      question_text: 'Q?',
      options: ['a', 'b', 'c', 'd'],
      correct_answer: { index: 0 },
      difficulty: 'easy',
      subject: 'Physics',
      topic: 'Optics',
      q_type: 'single_correct',
      marks: 4,
      valid: true,
      errorMsg: null,
    };

    it('inserts only valid rows and stamps the creating teacher', async () => {
      const builder = makeBuilder({ data: [{ id: 'q1' }], error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      const res = await service.bulkInsert(
        [validRow, { ...validRow, valid: false }],
        'teacher-1',
      );

      expect(res).toEqual({ inserted: 1 });
      const inserted = builder.insert.mock.calls[0][0];
      expect(inserted).toHaveLength(1);
      expect(inserted[0].created_by).toBe('teacher-1');
      expect(inserted[0].is_active).toBe(true);
    });

    it('strips client-supplied fields that are not on the whitelist', async () => {
      const builder = makeBuilder({ data: [{ id: 'q1' }], error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.bulkInsert(
        [{ ...validRow, created_by: 'somebody-else', id: 'forced-id', is_admin: true }],
        'teacher-1',
      );

      const row = builder.insert.mock.calls[0][0][0];
      expect(row.created_by).toBe('teacher-1');
      expect(row).not.toHaveProperty('id');
      expect(row).not.toHaveProperty('is_admin');
      expect(row).not.toHaveProperty('valid');
      expect(row).not.toHaveProperty('errorMsg');
    });

    it('falls back to medium for an out-of-range difficulty', async () => {
      const builder = makeBuilder({ data: [{ id: 'q1' }], error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.bulkInsert([{ ...validRow, difficulty: 'impossible' }], 'teacher-1');

      expect(builder.insert.mock.calls[0][0][0].difficulty).toBe('medium');
    });

    it('skips rows whose correct answer never resolved', async () => {
      const res = await service.bulkInsert(
        [{ ...validRow, correct_answer: { index: -1 } }],
        'teacher-1',
      );
      expect(res).toEqual({ inserted: 0 });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('does not hit the database when there is nothing valid to insert', async () => {
      const res = await service.bulkInsert([{ ...validRow, valid: false }], 'teacher-1');
      expect(res).toEqual({ inserted: 0 });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('tolerates a null payload', async () => {
      const res = await service.bulkInsert(null as any, 'teacher-1');
      expect(res).toEqual({ inserted: 0 });
    });
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes rather than hard-deleting', async () => {
      const builder = makeBuilder({ error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.remove('q1');

      expect(builder.update).toHaveBeenCalledWith({ is_active: false });
      expect(builder.delete).not.toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'q1');
    });
  });

  describe('create', () => {
    it('marks new questions active and attributes them to the teacher', async () => {
      const builder = makeBuilder({ data: { id: 'q1' }, error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.create({ question_text: 'Q?', subject: 'Physics' }, 'teacher-1');

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true, created_by: 'teacher-1' }),
      );
    });

    it('does not let the payload override the creating teacher', async () => {
      const builder = makeBuilder({ data: { id: 'q1' }, error: null });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.create({ created_by: 'someone-else' }, 'teacher-1');

      expect(builder.insert.mock.calls[0][0].created_by).toBe('teacher-1');
    });
  });

  describe('findAll', () => {
    it('only returns active questions and applies the supplied filters', async () => {
      const builder = makeBuilder({ data: [], error: null, count: 0 });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      await service.findAll({ subject: 'Physics', difficulty: 'easy', search: 'newton' });

      expect(builder.eq).toHaveBeenCalledWith('is_active', true);
      expect(builder.eq).toHaveBeenCalledWith('subject', 'Physics');
      expect(builder.eq).toHaveBeenCalledWith('difficulty', 'easy');
      expect(builder.ilike).toHaveBeenCalledWith('question_text', '%newton%');
    });

    it('paginates with a sane default page size', async () => {
      const builder = makeBuilder({ data: [], error: null, count: 0 });
      (supabase.from as jest.Mock).mockReturnValue(builder);

      const res = await service.findAll({ page: 3, limit: 20 });

      expect(builder.range).toHaveBeenCalledWith(40, 59);
      expect(res).toMatchObject({ page: 3, limit: 20 });
    });
  });
});
