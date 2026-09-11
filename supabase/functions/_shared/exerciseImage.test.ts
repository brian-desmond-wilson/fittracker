// supabase/functions/_shared/exerciseImage.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildImagePrompt, equipmentListOf } from './exerciseImage.ts';
import type { ImageRow } from './exerciseImage.ts';

const row = (o: Partial<ImageRow> = {}): ImageRow => ({
  id: 'e1', name: 'Kettlebell Swing', description: null, core_default_equipment: null,
  exercise_equipment: [], ...o,
});

Deno.test('equipmentListOf: junction names first, then the core default, else bodyweight', () => {
  assertEquals(equipmentListOf(row({ exercise_equipment: [{ equipment: { name: 'Kettlebell' } }, { equipment: null }] })), 'Kettlebell');
  assertEquals(equipmentListOf(row({ core_default_equipment: 'Barbell, Rack' })), 'Barbell, Rack');
  assertEquals(equipmentListOf(row({ exercise_equipment: [{ equipment: { name: 'Box' } }], core_default_equipment: 'Barbell' })), 'Box');
  assertEquals(equipmentListOf(row()), 'bodyweight');
  assertEquals(equipmentListOf(row({ exercise_equipment: null })), 'bodyweight');
});

Deno.test('buildImagePrompt: name, equipment, optional movement line, optional discipline', () => {
  const p = buildImagePrompt(row({ description: 'Hinge and swing.', exercise_equipment: [{ equipment: { name: 'Kettlebell' } }] }), null);
  assertStringIncludes(p, 'demonstrating the "Kettlebell Swing" exercise');
  assertStringIncludes(p, '- Equipment: Kettlebell');
  assertStringIncludes(p, '- Movement: Hinge and swing.');
  assertStringIncludes(p, 'an athletic person');
  const bare = buildImagePrompt(row(), null);
  assertEquals(bare.includes('- Movement:'), false);
  const cf = buildImagePrompt(row(), 'CrossFit');
  assertStringIncludes(cf, 'an athletic CrossFit athlete');
  assertStringIncludes(cf, 'Modern CrossFit gym environment');
});
