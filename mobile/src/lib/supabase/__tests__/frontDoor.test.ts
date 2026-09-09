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
  type CreateCatalogExerciseInput,
} from '../frontDoor';
import { supabase } from '../../supabase';

// ../supabase transitively imports expo-secure-store / react-native, which the
// pure-TS jest environment cannot load — replace it with a scripted stub.
jest.mock('../../supabase', () => ({ supabase: { from: jest.fn() } }));

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

beforeEach(() => fromMock.mockReset());

const CORE = '81b5afdb-461c-4563-8b0c-a9cdeb2bb124';
const INCLINE = '25fd6396-ff57-463f-b402-0e60cb0ded1e';
const BARBELL = '70a94e9e-d8fd-4f57-9c59-0104fde6305b';
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

describe('createCatalogExercise payload shaping', () => {
  it('engine-named create: placeholder name, name_is_custom false, no engine-owned columns', async () => {
    script([
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercises', data: storedRow() }, // readback for final slug
      { table: 'exercises', data: null }, // slug probe (free)
      { table: 'exercises', data: null }, // slug update
      { table: 'exercises', data: storedRow() }, // final readback
    ]);

    const row = await createCatalogExercise(baseInput);

    const payload = issued[0].firstArg('insert') as Record<string, unknown>;
    expect(payload.name).toBe('(pending engine name)');
    expect(payload.name_is_custom).toBe(false);
    expect(payload.core_movement_id).toBe(CORE);
    expect(payload.bench_angle_id).toBe(INCLINE);
    expect(payload.is_official).toBe(false);
    // Engine-owned columns must never be written.
    for (const col of ['generated_name', 'identity_fingerprint', 'tier', 'parent_exercise_id']) {
      expect(payload).not.toHaveProperty(col);
    }
    // The engine's name comes from the readback, and the slug is re-probed from it.
    expect(row.name).toBe('Incline Bench Press');
    expect((issued[3].firstArg('update') as Record<string, unknown>).slug).toBe(
      'incline-bench-press',
    );
  });

  it('custom name is written with name_is_custom true and a probing slug', async () => {
    script([
      { table: 'exercises', data: null }, // slug probe: base free
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercises', data: storedRow({ name: 'My Special Press', name_is_custom: true }) },
    ]);

    await createCatalogExercise({ ...baseInput, name: 'My Special Press' });

    const payload = issued[1].firstArg('insert') as Record<string, unknown>;
    expect(payload.name).toBe('My Special Press');
    expect(payload.name_is_custom).toBe(true);
    expect(payload.slug).toBe('my-special-press');
  });

  it('legacy compat: equipment_types names, requires_weight, goal_type_id first, junctions inserted', async () => {
    script([
      { table: 'equipment', data: [{ id: BARBELL, name: 'Barbell' }] },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert
      { table: 'exercise_equipment', data: null },
      { table: 'exercise_muscle_regions', data: null },
      { table: 'exercise_goal_types', data: null },
      { table: 'exercises', data: storedRow() },
    ]);

    await createCatalogExercise({
      ...baseInput,
      name: 'Named Row',
      equipment_ids: [BARBELL],
      primary_muscle_region_ids: ['m1'],
      secondary_muscle_region_ids: ['m1', 'm2'], // m1 stays primary
      goal_type_ids: ['g1', 'g2'],
      skill_level: 'Intermediate',
    });

    const payload = issued[2].firstArg('insert') as Record<string, unknown>;
    expect(payload.equipment_types).toEqual(['Barbell']);
    expect(payload.requires_weight).toBe(true);
    expect(payload.skill_level).toBe('Intermediate');
    expect(payload.goal_type_id).toBe('g1');

    expect(issued[3].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', equipment_id: BARBELL },
    ]);
    expect(issued[4].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', muscle_region_id: 'm1', is_primary: true },
      { exercise_id: 'new-id', muscle_region_id: 'm2', is_primary: false },
    ]);
    expect(issued[5].firstArg('insert')).toEqual([
      { exercise_id: 'new-id', goal_type_id: 'g1' },
      { exercise_id: 'new-id', goal_type_id: 'g2' },
    ]);
  });

  it('rejects an outlier without a custom name', async () => {
    script([]);
    await expect(
      createCatalogExercise({ ...baseInput, core_movement_id: null }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });

  it('rejects a variant label scoped to a different core (G2)', async () => {
    script([
      { table: 'variant_labels', data: { id: 'v1', core_movement_id: 'other-core' } },
    ]);
    await expect(
      createCatalogExercise({ ...baseInput, variant_label_id: 'v1' }),
    ).rejects.toBeInstanceOf(CatalogInputError);
  });
});

describe('error mapping', () => {
  const fpError = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "exercises_fingerprint_key"',
    details: `Key (core_movement_id, identity_fingerprint)=(${CORE}, ${INCLINE}) already exists.`,
  };

  it('23505 on exercises_fingerprint_key -> DuplicateExerciseError carrying the existing row', async () => {
    const existing = storedRow({ id: 'existing-id' });
    script([
      { table: 'exercises', error: fpError }, // insert rejected
      { table: 'exercises', data: existing }, // lookup by parsed core+fingerprint
    ]);

    const err = await createCatalogExercise(baseInput).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateExerciseError);
    expect((err as DuplicateExerciseError).existing).toEqual(existing);
    // The lookup used the collision key parsed from the Postgres detail.
    const eqCalls = issued[1].calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['core_movement_id', CORE] },
      { method: 'eq', args: ['identity_fingerprint', INCLINE] },
    ]);
  });

  it('a duplicate surfacing from a junction insert cleans up the half-created row', async () => {
    script([
      { table: 'equipment', data: [{ id: BARBELL, name: 'Barbell' }] },
      { table: 'exercises', data: null }, // slug probe
      { table: 'exercises', data: { id: 'new-id' } }, // insert ok
      { table: 'exercise_equipment', error: fpError }, // AFTER-trigger recompute collides
      { table: 'exercises', data: storedRow({ id: 'existing-id' }) }, // duplicate lookup
      { table: 'exercises', data: null }, // cleanup delete
    ]);

    await expect(
      createCatalogExercise({ ...baseInput, name: 'Doomed', equipment_ids: [BARBELL] }),
    ).rejects.toBeInstanceOf(DuplicateExerciseError);
    const cleanup = issued[5];
    expect(cleanup.table).toBe('exercises');
    expect(cleanup.calls.map((c) => c.method)).toEqual(['delete', 'eq']);
    expect(cleanup.calls[1].args).toEqual(['id', 'new-id']);
  });

  it('40P01 is retried once, then succeeds silently', async () => {
    script([
      { table: 'exercises', error: { code: '40P01', message: 'deadlock detected' } },
      { table: 'exercises', data: { id: 'new-id' } }, // retry succeeds
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

  it('engine core rejection -> CoreValidationError', async () => {
    script([
      {
        table: 'exercises',
        error: {
          code: 'P0001',
          message:
            'core_movement_id abc on zz does not reference a core movement (is_core row required)',
        },
      },
    ]);
    await expect(createCatalogExercise(baseInput)).rejects.toBeInstanceOf(CoreValidationError);
  });
});

describe('updateCatalogExercise', () => {
  it('diffs the equipment junction: deletes and inserts only changed rows', async () => {
    const current = storedRow({ id: 'x1' });
    script([
      { table: 'exercises', data: current }, // current row
      { table: 'equipment', data: [{ id: 'eq-b', name: 'Dumbbell' }] }, // names for compat
      { table: 'exercises', data: { id: 'x1' } }, // column update (equipment_types)
      { table: 'exercise_equipment', data: [{ equipment_id: 'eq-a' }, { equipment_id: 'eq-b' }] },
      { table: 'exercise_equipment', data: null }, // delete eq-a
      { table: 'exercises', data: storedRow({ id: 'x1' }) }, // final readback
    ]);

    await updateCatalogExercise('x1', { equipment_ids: ['eq-b'] });

    const del = issued[4];
    expect(del.calls.map((c) => c.method)).toEqual(['delete', 'eq', 'in']);
    expect(del.calls[2].args).toEqual(['equipment_id', ['eq-a']]);
    // eq-b already present: no insert statement was issued for it.
    expect(issued.filter((q) => q.table === 'exercise_equipment')).toHaveLength(2);
    // Legacy compat array follows the junction.
    const cols = issued[2].firstArg('update') as Record<string, unknown>;
    expect(cols.equipment_types).toEqual(['Dumbbell']);
    expect(cols.requires_weight).toBe(true);
  });

  it('attribute patch writes the FK column and never engine-owned columns', async () => {
    script([
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
      { table: 'exercises', data: { id: 'x1' } }, // update
      { table: 'exercises', data: storedRow({ id: 'x1' }) },
    ]);
    await updateCatalogExercise('x1', { bench_angle_id: 'decline-id' });
    const cols = issued[1].firstArg('update') as Record<string, unknown>;
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
