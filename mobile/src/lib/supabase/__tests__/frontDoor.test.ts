/**
 * Front-door unit tests: payload shaping + error mapping against a scripted
 * mock client. The client is UNTYPED, so column-name truth lives in the
 * staging probe (scripts/movement-model/probe_front_door.sh) — these tests
 * pin the module's behavior around it.
 */
import {
  createCatalogExercise,
  updateCatalogExercise,
  clientFingerprint,
  DuplicateExerciseError,
  CoreValidationError,
  CatalogDeadlockError,
  CatalogInputError,
  CatalogTransientCollisionError,
  CatalogNotFoundOrForbiddenError,
  fetchCatalogExerciseDetail,
  type CreateCatalogExerciseInput,
} from '../frontDoor';
import { supabase } from '../../supabase';

// ../supabase transitively imports expo-secure-store / react-native, which the
// pure-TS jest environment cannot load — replace it with a scripted stub.
jest.mock('../../supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

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
}

const fromMock = supabase.from as jest.Mock;
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
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

const CORE = '81b5afdb-461c-4563-8b0c-a9cdeb2bb124';
const INCLINE = '25fd6396-ff57-463f-b402-0e60cb0ded1e';
const BARBELL = '70a94e9e-d8fd-4f57-9c59-0104fde6305b';
const STRICT = '3f6a2a44-9d5e-4a37-8f76-6f1f2b8f0a11'; // identity style
const TEMPO = '5b8a1c02-77e3-4a0e-b1cd-9e4f6d2a3c55'; // modifier style
const DIST = 'a1e2c3d4-5f60-4718-9a2b-3c4d5e6f7081'; // Distance scoring type
const REPS = 'b2f3d4e5-6071-4829-ab3c-4d5e6f708192';
const USER = '9e0c7ab5-f3d5-4953-9e50-5d4cc5f60538';

const baseInput: CreateCatalogExerciseInput = {
  name: null,
  core_movement_id: CORE,
  bench_angle_id: INCLINE,
  is_movement: false,
  created_by: USER,
};

const storedRow = (over: Record<string, unknown> = {}) => ({
  id: 'new-id',
  name: 'Incline Bench Press',
  slug: 'incline-bench-press',
  generated_name: 'Incline Bench Press',
  identity_fingerprint: INCLINE,
  tier: 1,
  parent_exercise_id: CORE,
  name_is_custom: false,
  core_movement_id: CORE,
  variant_label_id: null,
  ...over,
});

const fpError = (fingerprint: string) => ({
  code: '23505',
  message: 'duplicate key value violates unique constraint "exercises_fingerprint_key"',
  details: `Key (core_movement_id, identity_fingerprint)=(${CORE}, ${fingerprint}) already exists.`,
});

describe('createCatalogExercise payload shaping', () => {
  it('engine-named create: placeholder name, CORE-LAST sequencing, no engine-owned columns', async () => {
    script([
      { table: 'exercises', data: { id: 'new-id' } }, // insert (coreless)
      { table: 'exercises', data: { id: 'new-id' } }, // core-last update
      { table: 'exercises', data: storedRow() }, // readback for final slug
      { table: 'exercises', data: null }, // slug probe (free)
      { table: 'exercises', data: null }, // slug update
      { table: 'exercises', data: storedRow() }, // final readback
    ]);

    const row = await createCatalogExercise(baseInput);

    const payload = issued[0].firstArg('insert') as Record<string, unknown>;
    expect(payload.name).toBe('(pending engine name)');
    expect(payload.name_is_custom).toBe(false);
    // Resequenced create: the INSERT is coreless; the core lands LAST so the
    // one recompute that matters sees the complete identity.
    expect(payload.core_movement_id).toBeNull();
    expect(payload.is_core).toBe(false);
    expect(payload.bench_angle_id).toBe(INCLINE);
    expect(payload.is_official).toBe(false);
    // Engine-owned columns must never be written.
    for (const col of ['generated_name', 'identity_fingerprint', 'tier', 'parent_exercise_id']) {
      expect(payload).not.toHaveProperty(col);
    }
    expect(issued[1].firstArg('update')).toEqual({ core_movement_id: CORE });
    // The engine's name comes from the readback, and the slug is re-probed from it.
    expect(row.name).toBe('Incline Bench Press');
    expect((issued[4].firstArg('update') as Record<string, unknown>).slug).toBe(
      'incline-bench-press',
    );
    // Stored fingerprint matched the client mirror: no drift alarm.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('custom name is written with name_is_custom true and a probing slug', async () => {
    script([
      { table: 'exercises', data: null }, // slug probe: base free
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercises', data: { id: 'new-id' } }, // core-last update
      { table: 'exercises', data: storedRow({ name: 'My Special Press', name_is_custom: true }) },
    ]);

    await createCatalogExercise({ ...baseInput, name: 'My Special Press' });

    const payload = issued[1].firstArg('insert') as Record<string, unknown>;
    expect(payload.name).toBe('My Special Press');
    expect(payload.name_is_custom).toBe(true);
    expect(payload.slug).toBe('my-special-press');
  });

  it('is_core create: no core-last update (the DB trigger self-references)', async () => {
    script([
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      {
        table: 'exercises',
        data: storedRow({
          name: 'Pressdown',
          name_is_custom: true,
          is_core: true,
          core_movement_id: 'new-id',
          identity_fingerprint: INCLINE,
          tier: 0,
        }),
      },
    ]);

    await createCatalogExercise({
      ...baseInput,
      core_movement_id: null,
      is_core: true,
      name: 'Pressdown',
    });

    const payload = issued[1].firstArg('insert') as Record<string, unknown>;
    expect(payload.is_core).toBe(true);
    expect(payload.core_movement_id).toBeNull();
    // Exactly three statements: probe, insert, readback — no core update.
    expect(issued).toHaveLength(3);
  });

  it('rejects a core that also names a core_movement_id, and a core without a name', async () => {
    script([]);
    await expect(
      createCatalogExercise({ ...baseInput, is_core: true }),
    ).rejects.toBeInstanceOf(CatalogInputError);
    await expect(
      createCatalogExercise({ ...baseInput, core_movement_id: null, is_core: true }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });

  it('legacy compat + follow-ups: junctions (styles, scoring included) all land BEFORE the core', async () => {
    script([
      { table: 'equipment', data: [{ id: BARBELL, name: 'Barbell' }] },
      {
        table: 'movement_styles',
        data: [
          { id: STRICT, is_identity: true },
          { id: TEMPO, is_identity: false },
        ],
      },
      {
        table: 'scoring_types',
        data: [
          { id: DIST, name: 'Distance' },
          { id: REPS, name: 'Reps' },
        ],
      },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercise_equipment', data: null },
      { table: 'exercise_movement_styles', data: null },
      { table: 'exercise_muscle_regions', data: null },
      { table: 'exercise_goal_types', data: null },
      { table: 'exercise_scoring_types', data: null },
      { table: 'exercises', data: { id: 'new-id' } }, // core-last update
      {
        table: 'exercises',
        data: storedRow({
          identity_fingerprint: [INCLINE, BARBELL, STRICT].sort().join('|'),
        }),
      },
    ]);

    await createCatalogExercise({
      ...baseInput,
      name: 'Named Row',
      equipment_ids: [BARBELL],
      movement_style_ids: [STRICT, TEMPO],
      scoring_type_ids: [DIST, REPS],
      primary_muscle_region_ids: ['m1'],
      secondary_muscle_region_ids: ['m1', 'm2'], // m1 stays primary
      goal_type_ids: ['g1', 'g2'],
      skill_level: 'Intermediate',
      short_name: 'NR',
    });

    const payload = issued[4].firstArg('insert') as Record<string, unknown>;
    expect(payload.equipment_types).toEqual(['Barbell']);
    expect(payload.requires_weight).toBe(true);
    expect(payload.requires_distance).toBe(true); // Distance scoring included
    expect(payload.skill_level).toBe('Intermediate');
    expect(payload.short_name).toBe('NR');
    expect(payload.goal_type_id).toBe('g1');
    expect(payload.core_movement_id).toBeNull();

    expect(issued[5].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', equipment_id: BARBELL },
    ]);
    expect(issued[6].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', movement_style_id: STRICT },
      { exercise_id: 'new-id', movement_style_id: TEMPO },
    ]);
    expect(issued[7].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', muscle_region_id: 'm1', is_primary: true },
      { exercise_id: 'new-id', muscle_region_id: 'm2', is_primary: false },
    ]);
    expect(issued[8].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', goal_type_id: 'g1' },
      { exercise_id: 'new-id', goal_type_id: 'g2' },
    ]);
    expect(issued[9].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', scoring_type_id: DIST },
      { exercise_id: 'new-id', scoring_type_id: REPS },
    ]);
    // The core arrives AFTER every junction (the resequencing under test).
    expect(issued[10].firstArg('update')).toEqual({ core_movement_id: CORE });
    // Identity styles counted, modifier styles not: fingerprints agree.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('requires_distance is false without a Distance scoring type', async () => {
    script([
      { table: 'scoring_types', data: [{ id: REPS, name: 'Reps' }] },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercise_scoring_types', data: null },
      { table: 'exercises', data: { id: 'new-id' } }, // core update
      { table: 'exercises', data: storedRow() },
    ]);
    await createCatalogExercise({ ...baseInput, name: 'No Distance', scoring_type_ids: [REPS] });
    const payload = issued[2].firstArg('insert') as Record<string, unknown>;
    expect(payload.requires_distance).toBe(false);
  });

  it('rejects an outlier without a custom name', async () => {
    script([]);
    await expect(
      createCatalogExercise({ ...baseInput, core_movement_id: null }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });

  it('rejects a whitespace-only name', async () => {
    script([]);
    await expect(createCatalogExercise({ ...baseInput, name: '   ' })).rejects.toBeInstanceOf(
      CatalogInputError,
    );
  });

  it('rejects a variant label scoped to a different core (G2)', async () => {
    script([
      { table: 'variant_labels', data: { id: 'v1', core_movement_id: 'other-core' } },
    ]);
    await expect(
      createCatalogExercise({ ...baseInput, variant_label_id: 'v1' }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });

  it('rejects unknown movement style / scoring type ids', async () => {
    script([{ table: 'movement_styles', data: [] }]);
    await expect(
      createCatalogExercise({ ...baseInput, name: 'X', movement_style_ids: [STRICT] }),
    ).rejects.toBeInstanceOf(CatalogInputError);

    script([{ table: 'scoring_types', data: [] }]);
    await expect(
      createCatalogExercise({ ...baseInput, name: 'X', scoring_type_ids: [DIST] }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });

  it('retries a lost slug race with the next suffix (bounded)', async () => {
    const slugError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "exercises_slug_key"',
    };
    script([
      { table: 'exercises', data: null }, // slug probe: 'twice' free
      { table: 'exercises', error: slugError }, // insert loses the race
      { table: 'exercises', data: { slug: 'twice' } }, // re-probe: base now taken
      { table: 'exercises', data: null }, // 'twice-2' free
      { table: 'exercises', data: { id: 'new-id' } }, // retry insert
      { table: 'exercises', data: { id: 'new-id' } }, // core-last update
      { table: 'exercises', data: storedRow({ name: 'Twice', name_is_custom: true }) },
    ]);

    await createCatalogExercise({ ...baseInput, name: 'Twice' });

    expect((issued[1].firstArg('insert') as Record<string, unknown>).slug).toBe('twice');
    expect((issued[4].firstArg('insert') as Record<string, unknown>).slug).toBe('twice-2');
  });
});

describe('error mapping', () => {
  it('23505 at the core-last update -> DuplicateExerciseError with cleanup (never transient)', async () => {
    const existing = storedRow({ id: 'existing-id' });
    script([
      { table: 'exercises', data: { id: 'new-id' } }, // insert ok (coreless)
      { table: 'exercises', error: fpError(INCLINE) }, // core-last update rejected
      { table: 'exercises', data: existing }, // lookup by parsed core+fingerprint
      { table: 'exercises', data: null }, // cleanup delete
    ]);

    const err = await createCatalogExercise(baseInput).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateExerciseError);
    expect((err as DuplicateExerciseError).existing).toEqual(existing);
    // The lookup used the collision key parsed from the Postgres detail.
    const eqCalls = issued[2].calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['core_movement_id', CORE] },
      { method: 'eq', args: ['identity_fingerprint', INCLINE] },
    ]);
    const cleanup = issued[3];
    expect(cleanup.calls.map((c) => c.method)).toEqual(['delete', 'eq']);
    expect(cleanup.calls[1].args).toEqual(['id', 'new-id']);
  });

  it('a duplicate WITH equipment also lands at the core update, on the FINAL fingerprint', async () => {
    const finalFp = [INCLINE, BARBELL].sort().join('|');
    const existing = storedRow({ id: 'existing-id' });
    script([
      { table: 'equipment', data: [{ id: BARBELL, name: 'Barbell' }] },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert ok
      { table: 'exercise_equipment', data: null }, // junction ok (fingerprint NULL: no collision)
      { table: 'exercises', error: fpError(finalFp) }, // core update -> duplicate
      { table: 'exercises', data: existing }, // duplicate lookup
      { table: 'exercises', data: null }, // cleanup delete
    ]);

    const err = await createCatalogExercise({
      ...baseInput,
      name: 'Doomed',
      equipment_ids: [BARBELL],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateExerciseError);
    expect((err as DuplicateExerciseError).existing).toEqual(existing);
  });

  it('a junction failure cleans up the half-created row', async () => {
    script([
      { table: 'equipment', data: [{ id: BARBELL, name: 'Barbell' }] },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert ok
      { table: 'exercise_equipment', error: { code: '23503', message: 'fk violation' } },
      { table: 'exercises', data: null }, // cleanup delete
    ]);
    await expect(
      createCatalogExercise({ ...baseInput, name: 'Doomed', equipment_ids: [BARBELL] }),
    ).rejects.toThrow('fk violation');
    const cleanup = issued[4];
    expect(cleanup.calls.map((c) => c.method)).toEqual(['delete', 'eq']);
    expect(cleanup.calls[1].args).toEqual(['id', 'new-id']);
  });

  it('40P01 is retried once, then succeeds silently', async () => {
    script([
      { table: 'exercises', error: { code: '40P01', message: 'deadlock detected' } },
      { table: 'exercises', data: { id: 'new-id' } }, // retry succeeds
      { table: 'exercises', data: { id: 'new-id' } }, // core-last update
      { table: 'exercises', data: storedRow() }, // readback
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: null }, // slug update
      { table: 'exercises', data: storedRow() }, // final readback
    ]);
    const row = await createCatalogExercise(baseInput);
    expect(row.id).toBe('new-id');
  });

  it('40P01 twice -> CatalogDeadlockError', async () => {
    const deadlock = { code: '40P01', message: 'deadlock detected' };
    script([
      { table: 'exercises', error: deadlock },
      { table: 'exercises', error: deadlock },
    ]);
    await expect(createCatalogExercise(baseInput)).rejects.toBeInstanceOf(CatalogDeadlockError);
  });

  it('engine core rejection (at the core-last update) -> CoreValidationError with cleanup', async () => {
    script([
      { table: 'exercises', data: { id: 'new-id' } }, // insert ok
      {
        table: 'exercises',
        error: {
          code: 'P0001',
          message:
            'core_movement_id abc on zz does not reference a core movement (is_core row required)',
        },
      },
      { table: 'exercises', data: null }, // cleanup delete
    ]);
    await expect(createCatalogExercise(baseInput)).rejects.toBeInstanceOf(CoreValidationError);
  });

  it('fingerprint drift between client mirror and stored value raises the console alarm', async () => {
    script([
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercises', data: { id: 'new-id' } }, // core update
      { table: 'exercises', data: storedRow({ identity_fingerprint: 'something-else' }) },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: null }, // slug update
      { table: 'exercises', data: storedRow({ identity_fingerprint: 'something-else' }) },
    ]);
    await createCatalogExercise(baseInput);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('fingerprint drift'));
  });
});

describe('updateCatalogExercise', () => {
  it('maps a missing or RLS-hidden row to CatalogNotFoundOrForbiddenError', async () => {
    script([{ table: 'exercises', data: null }]);
    await expect(updateCatalogExercise('ghost', { description: 'x' })).rejects.toBeInstanceOf(
      CatalogNotFoundOrForbiddenError,
    );
  });

  it('rejects a whitespace-only rename', async () => {
    script([]);
    await expect(updateCatalogExercise('x1', { name: '  ' })).rejects.toBeInstanceOf(
      CatalogInputError,
    );
  });

  it('diffs the equipment junction and writes compat columns AFTER the junctions', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) }, // current row
      { table: 'exercise_movement_styles', data: [] }, // identity styles for final fp
      { table: 'exercise_equipment', data: [{ equipment_id: 'eq-a' }, { equipment_id: 'eq-b' }] },
      { table: 'exercise_equipment', data: null }, // delete eq-a (insert-first, nothing to insert)
      { table: 'equipment', data: [{ id: 'eq-b', name: 'Dumbbell' }] }, // compat names
      { table: 'exercises', data: { id: 'x1' } }, // compat update
      { table: 'exercises', data: storedRow({ id: 'x1', identity_fingerprint: 'eq-b' }) },
    ]);

    await updateCatalogExercise('x1', { equipment_ids: ['eq-b'] });

    const del = issued[3];
    expect(del.calls.map((c) => c.method)).toEqual(['delete', 'eq', 'in']);
    expect(del.calls[2].args).toEqual(['equipment_id', ['eq-a']]);
    // eq-b already present: no insert statement was issued for it.
    expect(issued.filter((q) => q.table === 'exercise_equipment')).toHaveLength(2);
    // Legacy compat columns land in their own UPDATE after the junction diff (I2).
    const compat = issued[5].firstArg('update') as Record<string, unknown>;
    expect(compat).toEqual({ equipment_types: ['Dumbbell'], requires_weight: true });
    expect(consoleError).not.toHaveBeenCalled(); // fingerprints agree: no drift alarm
  });

  it('diffs the movement-styles junction (identity members move the fingerprint)', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) }, // current row
      {
        table: 'movement_styles',
        data: [{ id: STRICT, is_identity: true }, { id: TEMPO, is_identity: false }],
      }, // validate patched ids + identity split
      { table: 'exercise_equipment', data: [] }, // current equipment for final fp
      { table: 'exercise_movement_styles', data: [{ movement_style_id: 'old-style' }] }, // current
      { table: 'exercise_movement_styles', data: null }, // insert STRICT+TEMPO (insert-first)
      { table: 'exercise_movement_styles', data: null }, // delete old-style
      // storedRow carries no single-select identity columns, so the merged
      // final identity is exactly the one identity style.
      { table: 'exercises', data: storedRow({ id: 'x1', identity_fingerprint: STRICT }) },
    ]);

    await updateCatalogExercise('x1', { movement_style_ids: [STRICT, TEMPO] });

    expect(issued[4].firstArg('insert')).toEqual([
      { exercise_id: 'x1', movement_style_id: STRICT },
      { exercise_id: 'x1', movement_style_id: TEMPO },
    ]);
    const del = issued[5];
    expect(del.calls.map((c) => c.method)).toEqual(['delete', 'eq', 'in']);
    expect(del.calls[2].args).toEqual(['movement_style_id', ['old-style']]);
    // The final fingerprint counted STRICT (identity) but not TEMPO (modifier):
    // matching stored value means no drift alarm.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('diffs the scoring junction and re-derives requires_distance in the compat phase', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) }, // current row
      { table: 'exercise_scoring_types', data: [{ scoring_type_id: REPS }] }, // current
      { table: 'exercise_scoring_types', data: null }, // delete REPS
      { table: 'exercise_scoring_types', data: null }, // insert DIST
      { table: 'scoring_types', data: [{ id: DIST, name: 'Distance' }] }, // derivation
      { table: 'exercises', data: { id: 'x1' } }, // compat update
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
    ]);

    await updateCatalogExercise('x1', { scoring_type_ids: [DIST] });

    expect(issued[3].firstArg('insert')).toEqual([{ exercise_id: 'x1', scoring_type_id: DIST }]);
    const compat = issued[5].firstArg('update') as Record<string, unknown>;
    expect(compat).toEqual({ requires_distance: true });
  });

  it('C1: a transient collision in insert-first order is retried delete-first and succeeds', async () => {
    // Swap eq-a -> eq-b. Final fp = 'eq-b'; the union transient 'eq-a|eq-b'
    // collides (an exact union-child exists), the subset order is free.
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
      { table: 'exercise_movement_styles', data: [] },
      { table: 'exercise_equipment', data: [{ equipment_id: 'eq-a' }] },
      { table: 'exercise_equipment', error: fpError('eq-a|eq-b') }, // insert-first collides
      { table: 'exercise_equipment', data: null }, // delete-first: delete eq-a
      { table: 'exercise_equipment', data: null }, // then insert eq-b
      { table: 'equipment', data: [{ id: 'eq-b', name: 'Bands' }] },
      { table: 'exercises', data: { id: 'x1' } }, // compat update
      { table: 'exercises', data: storedRow({ id: 'x1', identity_fingerprint: 'eq-b' }) },
    ]);

    await updateCatalogExercise('x1', { equipment_ids: ['eq-b'] });

    expect(issued[4].calls.map((c) => c.method)).toEqual(['delete', 'eq', 'in']);
    expect(issued[5].firstArg('insert')).toEqual([{ exercise_id: 'x1', equipment_id: 'eq-b' }]);
  });

  it('C1: both orders colliding transiently -> CatalogTransientCollisionError', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
      { table: 'exercise_movement_styles', data: [] },
      { table: 'exercise_equipment', data: [{ equipment_id: 'eq-a' }] },
      { table: 'exercise_equipment', error: fpError('eq-a|eq-b') }, // union child exists
      { table: 'exercise_equipment', error: fpError('') }, // subset == the parent
    ]);
    await expect(updateCatalogExercise('x1', { equipment_ids: ['eq-b'] })).rejects.toBeInstanceOf(
      CatalogTransientCollisionError,
    );
  });

  it('C1: a collision on the FINAL fingerprint is a real duplicate (with compensation)', async () => {
    const existing = storedRow({ id: 'winner' });
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
      { table: 'exercise_movement_styles', data: [] },
      { table: 'exercise_equipment', data: [{ equipment_id: 'eq-a' }] },
      { table: 'exercise_equipment', data: null }, // insert eq-b ok (union transient free)
      { table: 'exercise_equipment', error: fpError('eq-b') }, // delete lands on final fp -> dup
      { table: 'exercises', data: existing }, // duplicate lookup
      { table: 'exercise_equipment', data: null }, // compensation: remove inserted eq-b
    ]);

    const err = await updateCatalogExercise('x1', { equipment_ids: ['eq-b'] }).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateExerciseError);
    expect((err as DuplicateExerciseError).existing).toEqual(existing);
    const comp = issued[6];
    expect(comp.calls.map((c) => c.method)).toEqual(['delete', 'eq', 'in']);
    expect(comp.calls[2].args).toEqual(['equipment_id', ['eq-b']]);
  });

  it('attribute patch writes the FK column and never engine-owned columns', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
      { table: 'exercise_equipment', data: [] }, // current equipment for final fp
      { table: 'exercise_movement_styles', data: [] }, // identity styles for final fp
      { table: 'exercises', data: { id: 'x1' } }, // update
      { table: 'exercises', data: storedRow({ id: 'x1', identity_fingerprint: 'decline-id' }) },
    ]);
    await updateCatalogExercise('x1', { bench_angle_id: 'decline-id' });
    const cols = issued[3].firstArg('update') as Record<string, unknown>;
    expect(cols).toEqual({ bench_angle_id: 'decline-id' });
  });

  it('clear_custom_name flips name_is_custom off (engine renames on recompute)', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1', name_is_custom: true }) },
      { table: 'exercises', data: { id: 'x1' } },
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
    ]);
    await updateCatalogExercise('x1', { clear_custom_name: true });
    const cols = issued[1].firstArg('update') as Record<string, unknown>;
    expect(cols).toEqual({ name_is_custom: false });
  });

  it('refuses clear_custom_name on an outlier', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1', core_movement_id: null }) },
    ]);
    await expect(
      updateCatalogExercise('x1', { clear_custom_name: true }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });
});

describe('fetchCatalogExerciseDetail', () => {
  it('loads the row and every junction in one fetch, input-shaped', async () => {
    script([
      {
        table: 'exercises',
        data: {
          ...storedRow({ id: 'x1' }),
          exercise_equipment: [{ equipment_id: BARBELL }],
          exercise_movement_styles: [{ movement_style_id: STRICT }],
          exercise_scoring_types: [{ scoring_type_id: REPS }],
          exercise_goal_types: [{ goal_type_id: 'g1' }],
          exercise_muscle_regions: [
            { muscle_region_id: 'm1', is_primary: true },
            { muscle_region_id: 'm2', is_primary: false },
          ],
        },
      },
    ]);

    const detail = await fetchCatalogExerciseDetail('x1');
    expect(detail.equipment_ids).toEqual([BARBELL]);
    expect(detail.movement_style_ids).toEqual([STRICT]);
    expect(detail.scoring_type_ids).toEqual([REPS]);
    expect(detail.goal_type_ids).toEqual(['g1']);
    expect(detail.primary_muscle_region_ids).toEqual(['m1']);
    expect(detail.secondary_muscle_region_ids).toEqual(['m2']);
    expect(detail.core_movement_id).toBe(CORE);
    expect(detail).not.toHaveProperty('exercise_equipment');
  });

  it('maps a hidden row to CatalogNotFoundOrForbiddenError', async () => {
    script([{ table: 'exercises', data: null }]);
    await expect(fetchCatalogExerciseDetail('ghost')).rejects.toBeInstanceOf(
      CatalogNotFoundOrForbiddenError,
    );
  });
});

describe('clientFingerprint', () => {
  it('matches the engine: sorted lowercase uuid set joined by |', () => {
    expect(
      clientFingerprint(
        { bench_angle_id: 'BBBB', load_position_id: 'aaaa' },
        ['cccc'],
      ),
    ).toBe('aaaa|bbbb|cccc');
  });
});
