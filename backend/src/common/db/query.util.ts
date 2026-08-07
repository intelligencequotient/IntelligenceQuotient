/**
 * Query helpers for the two PostgREST limits that bite hard once the platform
 * carries a real cohort (~1000 students):
 *
 *  1. **The row cap.** Supabase applies `db-max-rows` (1000 by default) to every
 *     response and does *not* signal that it truncated. A plain
 *     `select().eq('status','submitted')` over `attempts` therefore starts
 *     silently returning a partial table the moment the platform has more than
 *     1000 submitted attempts — leaderboards, analytics and result screens all
 *     quietly go wrong rather than fail loudly. `fetchAll` pages instead.
 *
 *  2. **The URL length cap.** `.in('id', ids)` is serialised into the query
 *     string. A thousand UUIDs is ~37 KB, well past what PostgREST (and most
 *     proxies) accept, so the request fails with 414 rather than returning
 *     anything. `fetchAllIn` / `runInChunks` slice the id list instead.
 *
 * Every helper takes a *builder factory* rather than a builder, because a
 * supabase-js query builder is single-use: awaiting it fires the request.
 */

/** PostgREST's default `db-max-rows`. Pages are requested at exactly this size. */
export const PAGE_SIZE = 1000;

/**
 * How many ids to put in one `.in(...)` filter. 100 UUIDs is ~3.7 KB of query
 * string — comfortably inside every proxy default while keeping round-trips low.
 */
export const ID_CHUNK_SIZE = 100;

/** Hard ceiling so a runaway table can never exhaust the process's memory. */
const DEFAULT_MAX_ROWS = 200_000;

type QueryResult<T> = { data: T[] | null; error: any };

/** Splits `items` into consecutive slices of at most `size`. */
export function chunk<T>(items: readonly T[], size: number = ID_CHUNK_SIZE): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Runs a query repeatedly with an advancing `.range()` until the table is
 * exhausted, so the caller sees every row rather than the first thousand.
 *
 * `buildQuery` must return a *fresh* builder on each call.
 */
export async function fetchAll<T>(
  buildQuery: () => PromiseLike<QueryResult<T>> & { range(from: number, to: number): any },
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message ?? String(error));

    const page = data ?? [];
    rows.push(...page);

    // A short page means we have reached the end of the result set.
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * `fetchAll`, but for a query filtered by a potentially huge id list. The ids
 * are sliced so no single request URL grows unbounded, and each slice is itself
 * paged in case one chunk matches more than `PAGE_SIZE` rows (one batch of 100
 * students can easily own more than 1000 answers).
 */
export async function fetchAllIn<T>(
  ids: readonly string[],
  buildQuery: (idChunk: string[]) => PromiseLike<QueryResult<T>> & { range(from: number, to: number): any },
  options: { chunkSize?: number; pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  if (!ids.length) return [];

  const rows: T[] = [];
  for (const idChunk of chunk(dedupe(ids), options.chunkSize)) {
    rows.push(...(await fetchAll<T>(() => buildQuery(idChunk), options)));
  }
  return rows;
}

/**
 * Runs a write (insert / delete / update) once per chunk of ids and throws on
 * the first failure. Used where a single statement would otherwise carry a
 * whole cohort's worth of identifiers.
 */
export async function runInChunks(
  ids: readonly string[],
  run: (idChunk: string[]) => PromiseLike<{ error: any }>,
  chunkSize: number = ID_CHUNK_SIZE,
): Promise<void> {
  for (const idChunk of chunk(dedupe(ids), chunkSize)) {
    const { error } = await run(idChunk);
    if (error) throw new Error(error.message ?? String(error));
  }
}

/**
 * Inserts rows in batches. A cohort-wide assignment is ~1000 rows, which is a
 * large enough request body to be worth splitting.
 */
export async function insertInBatches<T>(
  rows: readonly T[],
  run: (batch: T[]) => PromiseLike<{ error: any }>,
  batchSize = 500,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await run(batch);
    if (error) throw new Error(error.message ?? String(error));
    written += batch.length;
  }
  return written;
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
