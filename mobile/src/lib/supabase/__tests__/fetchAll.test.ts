import { fetchAll, FETCH_ALL_PAGE_SIZE } from '../fetchAll';

describe('fetchAll', () => {
  it('pages until a short page and concatenates in order', async () => {
    const total = FETCH_ALL_PAGE_SIZE * 2 + 5;
    const rows = Array.from({ length: total }, (_, i) => i);
    const ranges: [number, number][] = [];
    const out = await fetchAll<number>((from, to) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    });
    expect(out.error).toBeNull();
    expect(out.data).toEqual(rows);
    expect(ranges).toEqual([
      [0, FETCH_ALL_PAGE_SIZE - 1],
      [FETCH_ALL_PAGE_SIZE, FETCH_ALL_PAGE_SIZE * 2 - 1],
      [FETCH_ALL_PAGE_SIZE * 2, FETCH_ALL_PAGE_SIZE * 3 - 1],
    ]);
  });

  it('asks once more after an exactly-full page and stops on the empty one', async () => {
    let calls = 0;
    const out = await fetchAll<number>((from) => {
      calls++;
      const data = from === 0 ? Array.from({ length: FETCH_ALL_PAGE_SIZE }, (_, i) => i) : [];
      return Promise.resolve({ data, error: null });
    });
    expect(calls).toBe(2);
    expect(out.data).toHaveLength(FETCH_ALL_PAGE_SIZE);
  });

  it('returns the error and no partial rows when a page fails', async () => {
    const boom = { message: 'boom' };
    const out = await fetchAll<number>((from) =>
      Promise.resolve(from === 0
        ? { data: Array.from({ length: FETCH_ALL_PAGE_SIZE }, (_, i) => i), error: null }
        : { data: null, error: boom }));
    expect(out).toEqual({ data: null, error: boom });
  });
});
