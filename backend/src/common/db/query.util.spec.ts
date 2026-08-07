import { chunk, fetchAll, fetchAllIn, insertInBatches, runInChunks } from './query.util';

/**
 * Minimal stand-in for a supabase-js builder: records the ranges it was asked
 * for and returns pre-seeded pages.
 */
function pagedBuilder(pages: any[][], calls: [number, number][]) {
  let call = 0;
  return () => ({
    range(from: number, to: number) {
      calls.push([from, to]);
      const page = pages[call] ?? [];
      call += 1;
      return Promise.resolve({ data: page, error: null });
    },
  });
}

const rows = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `row-${offset + i}` }));

describe('chunk', () => {
  it('splits into consecutive slices of at most `size`', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('rejects a non-positive size rather than looping forever', () => {
    expect(() => chunk([1], 0)).toThrow(/positive/i);
  });
});

describe('fetchAll', () => {
  // The bug this exists to prevent: PostgREST caps a response at db-max-rows
  // (1000) and does not say it truncated, so an unbounded select silently
  // returns a partial table once the platform outgrows a single page.
  it('keeps paging until a short page arrives', async () => {
    const calls: [number, number][] = [];
    const result = await fetchAll(
      pagedBuilder([rows(1000), rows(1000, 1000), rows(37, 2000)], calls) as any,
    );

    expect(result).toHaveLength(2037);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops after one request when the first page is short', async () => {
    const calls: [number, number][] = [];
    const result = await fetchAll(pagedBuilder([rows(3)], calls) as any);

    expect(result).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it('treats a null data payload as the end of the set', async () => {
    const result = await fetchAll(
      (() => ({ range: () => Promise.resolve({ data: null, error: null }) })) as any,
    );
    expect(result).toEqual([]);
  });

  it('surfaces query errors instead of returning a partial result', async () => {
    await expect(
      fetchAll(
        (() => ({
          range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        })) as any,
      ),
    ).rejects.toThrow('boom');
  });

  it('honours maxRows so a runaway table cannot exhaust memory', async () => {
    const calls: [number, number][] = [];
    const result = await fetchAll(
      pagedBuilder([rows(10), rows(10), rows(10)], calls) as any,
      { pageSize: 10, maxRows: 20 },
    );

    expect(calls).toHaveLength(2);
    expect(result).toHaveLength(20);
  });
});

describe('fetchAllIn', () => {
  // A thousand UUIDs is ~37 KB of query string: past what PostgREST and most
  // proxies accept, so the request 414s rather than returning anything.
  it('splits the id list so no single request URL grows unbounded', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const seen: string[][] = [];

    const result = await fetchAllIn(
      ids,
      (idChunk) => {
        seen.push(idChunk);
        return {
          range: () => Promise.resolve({ data: idChunk.map((id) => ({ id })), error: null }),
        } as any;
      },
      { chunkSize: 100 },
    );

    expect(seen.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(result).toHaveLength(250);
  });

  it('de-duplicates ids before chunking', async () => {
    const seen: string[][] = [];
    await fetchAllIn(
      ['a', 'b', 'a', 'b'],
      (idChunk) => {
        seen.push(idChunk);
        return { range: () => Promise.resolve({ data: [], error: null }) } as any;
      },
      { chunkSize: 100 },
    );

    expect(seen).toEqual([['a', 'b']]);
  });

  it('issues no request at all for an empty id list', async () => {
    const run = jest.fn();
    await expect(fetchAllIn([], run as any)).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('runInChunks', () => {
  it('runs one write per chunk', async () => {
    const seen: string[][] = [];
    await runInChunks(
      Array.from({ length: 120 }, (_, i) => `id-${i}`),
      (idChunk) => {
        seen.push(idChunk);
        return Promise.resolve({ error: null });
      },
      50,
    );

    expect(seen.map((c) => c.length)).toEqual([50, 50, 20]);
  });

  it('throws on the first failing chunk', async () => {
    await expect(
      runInChunks(['a', 'b'], () => Promise.resolve({ error: { message: 'nope' } }), 1),
    ).rejects.toThrow('nope');
  });
});

describe('insertInBatches', () => {
  it('splits large writes and reports how many rows went in', async () => {
    const sizes: number[] = [];
    const written = await insertInBatches(
      rows(1200),
      (batch) => {
        sizes.push(batch.length);
        return Promise.resolve({ error: null });
      },
      500,
    );

    expect(sizes).toEqual([500, 500, 200]);
    expect(written).toBe(1200);
  });

  it('writes nothing for an empty list', async () => {
    const run = jest.fn();
    await expect(insertInBatches([], run as any)).resolves.toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});
