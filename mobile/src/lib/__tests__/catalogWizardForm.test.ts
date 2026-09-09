/**
 * Pure form logic behind the catalog wizard: payload construction and the
 * core-inheritance decision. Extracted to lib level precisely so these two
 * past failure modes stay pinned:
 *  - the old Exercise wizard silently dropped half its form on save;
 *  - inheritance re-running on a step remount clobbered saved classification.
 */
import {
  EMPTY_WIZARD_FORM,
  buildCreateInput,
  buildUpdatePatch,
  computeCoreInheritance,
  wantsCustomName,
  type WizardFormData,
  type CoreClassification,
  type OverridableInheritField,
} from '../catalogWizardForm';

const form = (over: Partial<WizardFormData> = {}): WizardFormData => ({
  ...EMPTY_WIZARD_FORM,
  ...over,
});

const CORE = 'core-1';
const USER = 'user-1';

describe('wantsCustomName', () => {
  it('is forced on for cores and outliers, toggle-driven for derivations', () => {
    expect(wantsCustomName(form({ kind: 'core' }))).toBe(true);
    expect(wantsCustomName(form({ kind: 'outlier' }))).toBe(true);
    expect(wantsCustomName(form({ kind: 'derivation', use_custom_name: false }))).toBe(false);
    expect(wantsCustomName(form({ kind: 'derivation', use_custom_name: true }))).toBe(true);
  });
});

describe('buildCreateInput', () => {
  it('engine-named derivation: null name, core carried, secondaries derived', () => {
    const input = buildCreateInput(
      form({
        kind: 'derivation',
        core_movement_id: CORE,
        bench_angle_id: 'incline',
        muscle_region_ids: ['m1', 'm2'],
        primary_muscle_region_ids: ['m1'],
        equipment_ids: ['eq1'],
        movement_style_ids: ['s1'],
        scoring_type_ids: ['sc1'],
        goal_type_ids: ['g1'],
        modality_id: 'mod1',
        movement_family_id: 'fam1',
        short_name: '  ',
        description: ' desc ',
      }),
      false,
      USER,
    );
    expect(input.name).toBeNull();
    expect(input.is_core).toBe(false);
    expect(input.core_movement_id).toBe(CORE);
    expect(input.bench_angle_id).toBe('incline');
    expect(input.primary_muscle_region_ids).toEqual(['m1']);
    expect(input.secondary_muscle_region_ids).toEqual(['m2']);
    expect(input.equipment_ids).toEqual(['eq1']);
    expect(input.movement_style_ids).toEqual(['s1']);
    expect(input.scoring_type_ids).toEqual(['sc1']);
    expect(input.goal_type_ids).toEqual(['g1']);
    expect(input.movement_category_id).toBe('mod1');
    expect(input.movement_family_id).toBe('fam1');
    expect(input.short_name).toBeNull(); // whitespace-only trims to null
    expect(input.description).toBe('desc');
    expect(input.is_movement).toBe(false);
    expect(input.created_by).toBe(USER);
  });

  it('custom-named derivation carries the trimmed name', () => {
    const input = buildCreateInput(
      form({ kind: 'derivation', core_movement_id: CORE, use_custom_name: true, name: ' My Press ' }),
      true,
      USER,
    );
    expect(input.name).toBe('My Press');
    expect(input.is_movement).toBe(true);
  });

  it('core: is_core true, no core reference, variant label stripped', () => {
    const input = buildCreateInput(
      form({ kind: 'core', name: 'Pressdown', core_movement_id: CORE, variant_label_id: 'v1' }),
      true,
      USER,
    );
    expect(input.is_core).toBe(true);
    expect(input.core_movement_id).toBeNull();
    expect(input.variant_label_id).toBeNull(); // G4: cores carry no variant
    expect(input.name).toBe('Pressdown');
  });

  it('outlier: no core, no variant, name required by the wizard gate', () => {
    const input = buildCreateInput(
      form({ kind: 'outlier', name: 'Odd Thing', core_movement_id: CORE, variant_label_id: 'v1' }),
      false,
      USER,
    );
    expect(input.is_core).toBe(false);
    expect(input.core_movement_id).toBeNull();
    expect(input.variant_label_id).toBeNull();
  });
});

describe('buildUpdatePatch', () => {
  it('derivation with engine naming: core carried, no name keys when it never had one', () => {
    const patch = buildUpdatePatch(
      form({ kind: 'derivation', core_movement_id: CORE, use_custom_name: false }),
      false,
    );
    expect(patch.core_movement_id).toBe(CORE);
    expect(patch).not.toHaveProperty('name');
    expect(patch).not.toHaveProperty('clear_custom_name');
  });

  it('custom naming switched OFF on a custom-named row -> clear_custom_name', () => {
    const patch = buildUpdatePatch(
      form({ kind: 'derivation', core_movement_id: CORE, use_custom_name: false }),
      true, // the row HAD a custom name
    );
    expect(patch.clear_custom_name).toBe(true);
    expect(patch).not.toHaveProperty('name');
  });

  it('custom name in force -> trimmed name written, never clear_custom_name', () => {
    const patch = buildUpdatePatch(
      form({ kind: 'derivation', core_movement_id: CORE, use_custom_name: true, name: ' X ' }),
      true,
    );
    expect(patch.name).toBe('X');
    expect(patch).not.toHaveProperty('clear_custom_name');
  });

  it('a core row NEVER patches core_movement_id (trigger owns the self-ref)', () => {
    const patch = buildUpdatePatch(form({ kind: 'core', name: 'Squat' }), true);
    expect(patch).not.toHaveProperty('core_movement_id');
    expect(patch.name).toBe('Squat');
  });

  it('derivation -> outlier switch nulls the core and the variant', () => {
    const patch = buildUpdatePatch(
      form({ kind: 'outlier', name: 'Freestanding', core_movement_id: CORE, variant_label_id: 'v1' }),
      false,
    );
    expect(patch.core_movement_id).toBeNull();
    expect(patch.variant_label_id).toBeNull();
  });
});

describe('computeCoreInheritance', () => {
  const classification: CoreClassification = {
    movement_family_id: 'fam1',
    movement_category_id: 'mod1',
    skill_level: 'Advanced',
    goal_type_ids: ['g1', 'g2'], // junction set, not the legacy single
    scoring_type_ids: ['sc1'],
    muscle_region_ids: ['m1', 'm2'],
    primary_muscle_region_ids: ['m1'],
  };

  it('inherits the full classification, goals from the junction set', () => {
    const { updates, inherited } = computeCoreInheritance(classification, new Set());
    expect(updates).toEqual({
      movement_family_id: 'fam1',
      modality_id: 'mod1',
      goal_type_ids: ['g1', 'g2'],
      muscle_region_ids: ['m1', 'm2'],
      primary_muscle_region_ids: ['m1'],
      skill_level: 'Advanced',
      scoring_type_ids: ['sc1'],
    });
    expect(inherited.sort()).toEqual([
      'goal_type_ids',
      'modality_id',
      'movement_family_id',
      'muscle_region_ids',
      'scoring_type_ids',
      'skill_level',
    ]);
  });

  it('honors explicit overrides: overridden fields are not re-clobbered', () => {
    const overridden = new Set<OverridableInheritField>(['skill_level', 'scoring_type_ids']);
    const { updates, inherited } = computeCoreInheritance(classification, overridden);
    expect(updates).not.toHaveProperty('skill_level');
    expect(updates).not.toHaveProperty('scoring_type_ids');
    expect(inherited).not.toContain('skill_level');
    expect(inherited).not.toContain('scoring_type_ids');
    expect(updates.movement_family_id).toBe('fam1'); // locked fields still flow
  });

  it('empty core values leave the form untouched (no null clobbering)', () => {
    const { updates, inherited } = computeCoreInheritance(
      {
        movement_family_id: null,
        movement_category_id: null,
        skill_level: null,
        goal_type_ids: [],
        scoring_type_ids: [],
        muscle_region_ids: [],
        primary_muscle_region_ids: [],
      },
      new Set(),
    );
    expect(updates).toEqual({});
    expect(inherited).toEqual([]);
  });
});
