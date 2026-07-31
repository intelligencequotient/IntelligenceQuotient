import { UsersService } from './users.service';
import { supabase } from '../../config/supabase.config';

jest.mock('../../config/supabase.config', () => ({
  supabase: { from: jest.fn() },
}));

function makeBuilder(result: any) {
  const builder: any = {};
  for (const m of [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'ilike', 'in', 'range', 'order', 'limit', 'single',
  ]) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return builder;
}

function mockTables(map: Record<string, any>) {
  const seen: string[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    seen.push(table);
    return map[table] ?? makeBuilder({ data: [], error: null });
  });
  return seen;
}

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService();
  });

  describe('listStudents', () => {
    it('merges attempt stats onto each student without per-student queries', async () => {
      const seen = mockTables({
        users: makeBuilder({
          data: [{ id: 's1', full_name: 'A' }, { id: 's2', full_name: 'B' }],
          error: null,
        }),
        attempts: makeBuilder({
          data: [
            { student_id: 's1', total_score: 50, submitted_at: '2026-01-02T00:00:00Z', tests: { total_marks: 100 } },
            { student_id: 's1', total_score: 80, submitted_at: '2026-01-05T00:00:00Z', tests: { total_marks: 100 } },
          ],
          error: null,
        }),
        predictions: makeBuilder({ data: [{ student_id: 's2' }], error: null }),
      });

      const res = await service.listStudents({});
      const s1 = res.find((s: any) => s.id === 's1');
      const s2 = res.find((s: any) => s.id === 's2');

      expect(s1).toMatchObject({
        testsTaken: 2,
        avgPercentage: 65,
        lastActive: '2026-01-05T00:00:00Z',
        status: 'Active',
      });
      expect(s2).toMatchObject({
        testsTaken: 0,
        avgPercentage: null,
        status: 'At Risk',
      });

      // Three queries total, regardless of how many students come back
      expect(seen).toEqual(['users', 'attempts', 'predictions']);
    });

    it('skips the stats queries entirely when there are no students', async () => {
      const seen = mockTables({ users: makeBuilder({ data: [], error: null }) });

      const res = await service.listStudents({});

      expect(res).toEqual([]);
      expect(seen).toEqual(['users']);
    });

    it('filters by name when a search term is given', async () => {
      const users = makeBuilder({ data: [], error: null });
      mockTables({ users });

      await service.listStudents({ search: 'alex' });

      expect(users.ilike).toHaveBeenCalledWith('full_name', '%alex%');
      expect(users.eq).toHaveBeenCalledWith('role', 'student');
    });

    it('narrows to a single batch when batchId is given', async () => {
      mockTables({
        users: makeBuilder({
          data: [
            { id: 's1', full_name: 'A', batch_students: [{ batch_id: 'b1' }] },
            { id: 's2', full_name: 'B', batch_students: [{ batch_id: 'b2' }] },
          ],
          error: null,
        }),
        attempts: makeBuilder({ data: [], error: null }),
        predictions: makeBuilder({ data: [], error: null }),
      });

      const res = await service.listStudents({ batchId: 'b1' });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('s1');
    });
  });
});
