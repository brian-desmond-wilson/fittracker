/**
 * Match-review helper tests: payload shaping, resolution ordering and
 * degradation against a scripted mock client (the frontDoor.test.ts harness
 * pattern). Column-name truth lives in the staging probe
 * (scripts/movement-model/probe_capture.sh); these tests pin the module's
 * behavior around it.
 */
import {
  resolveNameByAlias,
  fetchMatchCandidates,
  fetchPendingReviews,
  createMatchReview,
  resolveMatchReview,
  type PendingMatchReview,
} from '../matchReviews';
import { supabase } from '../../supabase';
import { addWildAliases } from '../frontDoor';

// ../supabase transitively imports expo-secure-store / react-native, which the
// pure-TS jest environment cannot load — replace it with a scripted stub.
jest.mock('../../supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
// The alias write path is frontDoor's, already tested there.
jest.mock('../frontDoor', () => ({ addWildAliases: jest.fn() }));

type Result = { data: unknown; error: unknown };

/** Chainable, thenable stand-in for a PostgREST query builder. */
class FakeQuery implements PromiseLike<Result> {
  calls: { method: string; args: unknown[] }[] = [];
  constructor(
    public table: string,
    private result: Result,
  ) {}
  private chain(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...a: unknown[]) { return this.chain('select', a); }
  insert(...a: unknown[]) { return this.chain('insert', a); }
  upsert(...a: unknown[]) { return this.chain('upsert', a); }
  update(...a: unknown[]) { return this.chain('update', a); }
  delete(...a: unknown[]) { return this.chain('delete', a); }
  eq(...a: unknown[]) { return this.chain('eq', a); }
  in(...a: unknown[]) { return this.chain('in', a); }
  or(...a: unknown[]) { return this.chain('or', a); }
  ilike(...a: unknown[]) { return this.chain('ilike', a); }
  order(...a: unknown[]) { return this.chain('order', a); }
  limit(...a: unknown[]) { return this.chain('limit', a); }
  single(...a: unknown[]) { return this.chain('single', a); }
  maybeSingle(...a: unknown[]) { return this.chain('maybeSingle', a); }
  then<T1, T2>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
  firstArg(method: string): unknown {
    return this.calls.find((c) => c.method === method)?.args[0];
  }
  argsOf(method: string): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }
}

const fromMock = supabase.from as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;
const aliasMock = addWildAliases as jest.Mock;
let issued: FakeQuery[];

/** Queue the results the next from() calls will resolve to, in order. */
function script(steps: { table: string; data?: unknown; error?: unknown }[]) {
  issued = [];
  const queue = [...steps];
  fromMock.mockImplementation((table: string) => {
    const step = queue.shift();
    if (!step) throw new Error(`unscripted from('${table}')`);
    if (step.table !== table) {
      throw new Error(`expected from('${step.table}'), got from('${table}')`);
    }
    const q = new FakeQuery(table, { data: step.data ?? null, error: step.error ?? null });
    issued.push(q);
    return q;
  });
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  aliasMock.mockReset();
  aliasMock.mockResolvedValue({ written: [], failed: [] });
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

const EX = 'e1000000-0000-0000-0000-000000000001';
const SRC = 'a1000000-0000-0000-0000-000000000001';
const WKT = 'c1000000-0000-0000-0000-000000000001';
const USER = '9e0c7ab5-f3d5-4953-9e50-5d4cc5f60538';

describe('resolveNameByAlias', () => {
  it('resolves through the normalize_alias RPC and the alias_normalized column', async () => {
    rpcMock.mockResolvedValue({ data: 'pull up', error: null });
    script([{ table: 'exercise_aliases', data: { exercise_id: EX } }]);

    const id = await resolveNameByAlias('Pullups');

    expect(id).toBe(EX);
    expect(rpcMock).toHaveBeenCalledWith('normalize_alias', { raw: 'Pullups' });
    expect(issued[0].argsOf('eq')[0]).toEqual(['alias_normalized', 'pull up']);
  });

  it('alias miss falls back to case-insensitive display-name equality', async () => {
    rpcMock.mockResolvedValue({ data: 'flying widget press', error: null });
    script([
      { table: 'exercise_aliases', data: null },
      { table: 'exercises', data: [{ id: EX }] },
    ]);

    const id = await resolveNameByAlias('Flying Widget Press');

    expect(id).toBe(EX);
    // The name is matched as ITSELF: ilike metacharacters escaped, no wildcards.
    expect(issued[1].argsOf('ilike')[0]).toEqual(['name', 'Flying Widget Press']);
  });

  it('escapes ilike metacharacters in the display-name leg', async () => {
    rpcMock.mockResolvedValue({ data: 'x', error: null });
    script([
      { table: 'exercise_aliases', data: null },
      { table: 'exercises', data: [] },
    ]);

    await resolveNameByAlias('100% Rows_and\\Curls');

    expect(issued[1].argsOf('ilike')[0]).toEqual(['name', '100\\% Rows\\_and\\\\Curls']);
  });

  it('both legs miss -> null; empty normalization skips the alias leg', async () => {
    rpcMock.mockResolvedValue({ data: '', error: null });
    script([{ table: 'exercises', data: [] }]);

    expect(await resolveNameByAlias('...')).toBeNull();
    expect(issued[0].table).toBe('exercises'); // never touched exercise_aliases
  });

  it('an RPC failure throws (the caller degrades, not this function)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(resolveNameByAlias('Pullups')).rejects.toThrow('boom');
  });
});

describe('fetchMatchCandidates', () => {
  it('combines the alias leg and the name leg', async () => {
    script([
      { table: 'exercise_aliases', data: [{ exercise_id: EX }] },
      { table: 'exercises', data: [{ id: EX, name: 'Pull-Up' }] },
    ]);

    const out = await fetchMatchCandidates('pull');

    expect(out).toEqual([{ exerciseId: EX, name: 'Pull-Up' }]);
    expect(issued[1].firstArg('or')).toBe(`name.ilike.%pull%,id.in.(${EX})`);
  });

  it('retries on the last word when the full name finds nothing', async () => {
    script([
      { table: 'exercise_aliases', data: [] },
      { table: 'exercises', data: [] }, // full term: nothing
      { table: 'exercise_aliases', data: [] },
      { table: 'exercises', data: [{ id: EX, name: 'Squat' }] }, // last word
    ]);

    const out = await fetchMatchCandidates('Cyclist Squat');

    expect(out).toEqual([{ exerciseId: EX, name: 'Squat' }]);
    expect(issued[3].argsOf('ilike')[0]).toEqual(['name', '%Squat%']);
  });

  it('degrades to [] on error — candidates never fail a capture', async () => {
    script([{ table: 'exercise_aliases', error: { message: 'down' } }]);
    expect(await fetchMatchCandidates('pull')).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('createMatchReview', () => {
  it('writes the row WITHOUT raw_name_normalized (the DB trigger owns it)', async () => {
    script([{ table: 'exercise_match_reviews', data: { id: 'r1' } }]);

    const id = await createMatchReview({
      userId: USER,
      sourceId: SRC,
      rawName: 'Flying Widget Press',
      context: 'Upper pump',
      candidates: [{ exerciseId: EX, name: 'Pull-Up' }],
      draft: { exercise: null, capturedWorkoutId: WKT, items: [] },
    });

    expect(id).toBe('r1');
    const payload = issued[0].firstArg('insert') as Record<string, unknown>;
    expect(payload).toEqual({
      user_id: USER,
      source_id: SRC,
      raw_name: 'Flying Widget Press',
      context: 'Upper pump',
      candidates: [{ exerciseId: EX, name: 'Pull-Up' }],
      draft: { exercise: null, capturedWorkoutId: WKT, items: [] },
    });
    expect(payload).not.toHaveProperty('raw_name_normalized');
  });

  it('throws on failure — a lost name is never silent', async () => {
    script([{ table: 'exercise_match_reviews', error: { message: 'rls' } }]);
    await expect(
      createMatchReview({
        userId: USER, sourceId: null, rawName: 'X', context: null,
        candidates: [], draft: { exercise: null, capturedWorkoutId: null, items: [] },
      }),
    ).rejects.toThrow('rls');
  });
});

describe('fetchPendingReviews', () => {
  it('parses candidates and draft, dropping malformed entries', async () => {
    script([
      {
        table: 'exercise_match_reviews',
        data: [
          {
            id: 'r1', raw_name: 'Pullups', context: null, source_id: SRC,
            created_at: '2026-09-08',
            candidates: [{ exerciseId: EX, name: 'Pull-Up' }, { bogus: true }, 'junk'],
            draft: {
              exercise: { name: 'Pullups' },
              capturedWorkoutId: WKT,
              items: [{ exerciseOrder: 2, reps: '10', sets: 3 }],
            },
          },
        ],
      },
    ]);

    const out = await fetchPendingReviews(USER);

    expect(out).toHaveLength(1);
    expect(out[0].candidates).toEqual([{ exerciseId: EX, name: 'Pull-Up' }]);
    expect(out[0].draft?.capturedWorkoutId).toBe(WKT);
    expect(out[0].draft?.items).toEqual([
      {
        exerciseOrder: 2, sets: 3, reps: '10', weight: null,
        duration: null, restSeconds: null, notes: null,
      },
    ]);
  });
});

describe('resolveMatchReview', () => {
  const review: PendingMatchReview = {
    id: 'r1',
    rawName: 'Flying Widget Press',
    context: null,
    candidates: [],
    sourceId: SRC,
    draft: {
      exercise: null,
      capturedWorkoutId: WKT,
      items: [
        { exerciseOrder: 1, sets: 3, reps: '10', weight: null, duration: null, restSeconds: 60, notes: null },
        { exerciseOrder: 4, sets: null, reps: null, weight: null, duration: '30s', restSeconds: null, notes: null },
      ],
    },
    createdAt: '2026-09-08',
  };

  it('link path: provenance upsert, item insert (skipping taken slots), review closed LAST', async () => {
    script([
      { table: 'source_exercises', data: null }, // upsert
      {
        table: 'captured_workout_exercises',
        data: [{ exercise_id: EX, exercise_order: 1 }], // retry leftovers: order 1 taken
      },
      { table: 'captured_workout_exercises', data: null }, // insert the missing one
      { table: 'exercise_match_reviews', data: null }, // close
    ]);

    const out = await resolveMatchReview({
      review, exerciseId: EX, minted: false, saveAlias: false,
    });

    expect(out).toEqual({ ok: true, aliasFailed: false });
    expect(issued[0].firstArg('upsert')).toEqual({
      source_id: SRC, exercise_id: EX, was_created: false,
    });
    expect(issued[0].argsOf('upsert')[0][1]).toEqual({
      onConflict: 'source_id,exercise_id', ignoreDuplicates: true,
    });
    const inserted = issued[2].firstArg('insert') as any[];
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual({
      captured_workout_id: WKT, exercise_id: EX, exercise_order: 4,
      target_sets: null, target_reps: null, target_weight: null,
      target_duration: '30s', rest_seconds: null, notes: null,
    });
    // Close: status/resolved fields, double-tap-guarded on status='pending'.
    const close = issued[3].firstArg('update') as Record<string, unknown>;
    expect(close.status).toBe('linked');
    expect(close.resolved_exercise_id).toBe(EX);
    expect(typeof close.resolved_at).toBe('string');
    expect(issued[3].argsOf('eq')).toEqual([['id', 'r1'], ['status', 'pending']]);
    expect(aliasMock).not.toHaveBeenCalled();
  });

  it('minted path: was_created true and status minted; saveAlias teaches the dictionary', async () => {
    aliasMock.mockResolvedValue({ written: ['Flying Widget Press'], failed: [] });
    script([
      { table: 'source_exercises', data: null },
      { table: 'captured_workout_exercises', data: [] },
      { table: 'captured_workout_exercises', data: null },
      { table: 'exercise_match_reviews', data: null },
    ]);

    const out = await resolveMatchReview({
      review, exerciseId: EX, minted: true, saveAlias: true,
    });

    expect(out).toEqual({ ok: true, aliasFailed: false });
    expect((issued[0].firstArg('upsert') as any).was_created).toBe(true);
    expect((issued[3].firstArg('update') as any).status).toBe('minted');
    expect(aliasMock).toHaveBeenCalledWith(EX, ['Flying Widget Press']);
  });

  it('a deleted workout (FK 23503) does not fail the resolution', async () => {
    script([
      { table: 'source_exercises', data: null },
      { table: 'captured_workout_exercises', data: [] },
      { table: 'captured_workout_exercises', error: { code: '23503', message: 'fk' } },
      { table: 'exercise_match_reviews', data: null },
    ]);

    const out = await resolveMatchReview({
      review, exerciseId: EX, minted: false, saveAlias: false,
    });

    expect(out.ok).toBe(true);
    expect((issued[3].firstArg('update') as any).status).toBe('linked');
  });

  it('an alias miss is reported but never fails the resolution', async () => {
    aliasMock.mockResolvedValue({ written: [], failed: ['Flying Widget Press'] });
    script([
      { table: 'source_exercises', data: null },
      { table: 'captured_workout_exercises', data: [] },
      { table: 'captured_workout_exercises', data: null },
      { table: 'exercise_match_reviews', data: null },
    ]);

    const out = await resolveMatchReview({
      review, exerciseId: EX, minted: false, saveAlias: true,
    });

    expect(out).toEqual({ ok: true, aliasFailed: true });
  });

  it('a failure before the close leaves the review pending (ok: false)', async () => {
    script([{ table: 'source_exercises', error: { message: 'down' } }]);

    const out = await resolveMatchReview({
      review, exerciseId: EX, minted: false, saveAlias: false,
    });

    expect(out).toEqual({ ok: false, aliasFailed: false });
    expect(issued).toHaveLength(1); // never reached the review update
  });

  it('a review without a workout draft only links provenance and closes', async () => {
    const bare: PendingMatchReview = { ...review, draft: { exercise: null, capturedWorkoutId: null, items: [] } };
    script([
      { table: 'source_exercises', data: null },
      { table: 'exercise_match_reviews', data: null },
    ]);

    const out = await resolveMatchReview({
      review: bare, exerciseId: EX, minted: false, saveAlias: false,
    });

    expect(out.ok).toBe(true);
    expect(issued.map((q) => q.table)).toEqual(['source_exercises', 'exercise_match_reviews']);
  });
});
