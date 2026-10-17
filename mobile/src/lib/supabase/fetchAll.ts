/**
 * Every row of a query, not just the first page. PostgREST caps a response at
 * `max_rows` (1000, supabase/config.toml) and answers a truncated page with no
 * error, so a read that must see all of a user's history pages through it.
 * `page(from, to)` must apply `.range(from, to)` over a stable total order
 * (end the ORDER BY on a unique column) or rows can repeat or go missing.
 */
export const FETCH_ALL_PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: any }>;

export async function fetchAll<T>(
  page: (from: number, to: number) => PageResult<T>,
): Promise<{ data: T[] | null; error: any }> {
  const rows: T[] = [];
  for (let from = 0; ; from += FETCH_ALL_PAGE_SIZE) {
    const { data, error } = await page(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < FETCH_ALL_PAGE_SIZE) return { data: rows, error: null };
  }
}
