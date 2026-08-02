/**
 * Minimal chainable stub of the supabase-js query builder.
 *
 * The services build queries like:
 *   supabase.from('t').select('...').eq('a', 1).order('x').single()
 * so every method must return `this` until a terminal call resolves. Terminal
 * results are registered per-table with `queueResult`, in call order.
 */

export interface QueuedResult {
  data?: any;
  error?: any;
  count?: number;
}

export class SupabaseMock {
  /** table -> queued results, consumed FIFO. */
  private results = new Map<string, QueuedResult[]>();
  /** Every terminal operation, for assertions. */
  public calls: { table: string; op: string; payload?: any }[] = [];

  reset() {
    this.results.clear();
    this.calls = [];
  }

  /** Registers the next result the given table should return. */
  queueResult(table: string, result: QueuedResult) {
    if (!this.results.has(table)) this.results.set(table, []);
    this.results.get(table)!.push(result);
    return this;
  }

  private nextResult(table: string): QueuedResult {
    const queue = this.results.get(table);
    if (!queue?.length) return { data: null, error: null };
    return queue.shift()!;
  }

  from(table: string) {
    const self = this;
    let currentOp = 'select';
    let payload: any;

    const settle = () => {
      self.calls.push({ table, op: currentOp, payload });
      const result = self.nextResult(table);
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      });
    };

    // Chainable no-ops that record intent and return the same builder.
    const builder: any = {
      select: (_cols?: any, opts?: any) => {
        if (opts?.head) currentOp = 'count';
        return builder;
      },
      insert: (rows: any) => { currentOp = 'insert'; payload = rows; return builder; },
      update: (row: any) => { currentOp = 'update'; payload = row; return builder; },
      upsert: (rows: any) => { currentOp = 'upsert'; payload = rows; return builder; },
      delete: () => { currentOp = 'delete'; return builder; },

      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: () => builder,
      or: () => builder,
      ilike: () => builder,
      lte: () => builder,
      gte: () => builder,
      order: () => builder,
      range: () => builder,
      limit: () => builder,

      single: () => settle(),
      maybeSingle: () => settle(),
      // Awaiting the builder directly (no .single()) also settles.
      then: (resolve: any, reject: any) => settle().then(resolve, reject),
    };

    return builder;
  }

  storage = {
    from: () => ({
      upload: jest.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.test/x.png' } }),
    }),
  };

  auth = {
    admin: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      updateUserById: jest.fn().mockResolvedValue({ error: null }),
      createUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      deleteUser: jest.fn().mockResolvedValue({ error: null }),
    },
    signInWithPassword: jest.fn(),
    refreshSession: jest.fn(),
    resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
    getUser: jest.fn(),
  };
}

export const supabaseMock = new SupabaseMock();
