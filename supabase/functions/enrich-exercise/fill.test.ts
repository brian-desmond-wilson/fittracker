// supabase/functions/enrich-exercise/fill.test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  planFill, validateDescription, isFillable, isPipelineVideoUrl,
  pickSingleExerciseSource, extractionDescriptionFor, normaliseName,
} from './fill.ts';
import type { EnrichRow, Candidate, RunFlags, SourceCandidate } from './fill.ts';

const AT = '2026-09-11T10:00:00.000Z';

const row = (o: Partial<EnrichRow> = {}): EnrichRow => ({
  id: 'e1', name: 'Kettlebell Swing', description: null, video_url: null, image_url: null,
  enrichment: {}, ...o,
});
const none: Candidate = { extractionDescription: null, singleExerciseSourceUrl: null };
const flags = (o: Partial<RunFlags> = {}): RunFlags => ({ images: false, forceImage: false, ...o });
const NAMES = ['Deadlift', 'Goblet Squat', 'KB Swing'];

Deno.test('isFillable: null or blank with no user provenance', () => {
  assertEquals(isFillable(row(), 'description'), true);
  assertEquals(isFillable(row({ description: '   ' }), 'description'), true);
  assertEquals(isFillable(row({ description: 'text' }), 'description'), false);
  assertEquals(isFillable(row({ enrichment: { description: { by: 'user', at: AT } } }), 'description'), false);
  // A model stamp on an empty field (image cleared by an identity edit) is fillable again.
  assertEquals(isFillable(row({ enrichment: { image_url: { by: 'model', at: AT } } }), 'image_url'), true);
});

Deno.test('planFill: a full row plans nothing (idempotent)', () => {
  const full = row({
    description: 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.',
    video_url: 'https://www.instagram.com/p/abc/', image_url: 'https://x/y.png',
    enrichment: {
      description: { by: 'model', at: AT }, video_url: { by: 'capture', at: AT }, image_url: { by: 'model', at: AT },
    },
  });
  assertEquals(planFill(full, none, flags({ images: true }), NAMES), {});
});

Deno.test('planFill: user provenance is never filled, even when blank', () => {
  const r = row({ enrichment: { description: { by: 'user', at: AT }, video_url: { by: 'user', at: AT } } });
  const c: Candidate = {
    extractionDescription: 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.',
    singleExerciseSourceUrl: 'https://www.instagram.com/p/abc/',
  };
  assertEquals(planFill(r, c, flags({ images: true }), NAMES), { image_url: { by: 'model' } });
});

Deno.test('planFill: extraction description before model', () => {
  const text = 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.';
  assertEquals(
    planFill(row(), { ...none, extractionDescription: text }, flags(), NAMES),
    { description: { by: 'extraction', text } },
  );
  assertEquals(planFill(row(), none, flags(), NAMES), { description: { by: 'model' } });
});

Deno.test('planFill: an extraction description that fails validation falls back to the model', () => {
  assertEquals(
    planFill(row(), { ...none, extractionDescription: 'Too short.' }, flags(), NAMES),
    { description: { by: 'model' } },
  );
});

Deno.test('planFill: video only from a single-exercise capture', () => {
  assertEquals(
    planFill(row({ description: 'x'.repeat(50), enrichment: { description: { by: 'user', at: AT } } }),
      { ...none, singleExerciseSourceUrl: 'https://www.tiktok.com/@a/video/1' }, flags(), NAMES),
    { video_url: { by: 'capture', url: 'https://www.tiktok.com/@a/video/1' } },
  );
  assertEquals(
    planFill(row({ description: 'x'.repeat(50), enrichment: { description: { by: 'user', at: AT } } }), none, flags(), NAMES),
    {},
  );
});

Deno.test('planFill: images only when the run enables them', () => {
  const r = row({ description: 'x'.repeat(50), enrichment: { description: { by: 'user', at: AT } } });
  assertEquals(planFill(r, none, flags(), NAMES), {});
  assertEquals(planFill(r, none, flags({ images: true }), NAMES), { image_url: { by: 'model' } });
});

Deno.test('planFill: forceImage overwrites an existing image, even a user one; nothing else', () => {
  const r = row({
    description: 'x'.repeat(50), image_url: 'https://x/y.png',
    enrichment: { description: { by: 'user', at: AT }, image_url: { by: 'user', at: AT } },
  });
  assertEquals(planFill(r, none, flags({ images: true, forceImage: true }), NAMES), { image_url: { by: 'model' } });
  // forceImage implies images.
  assertEquals(planFill(r, none, flags({ forceImage: true }), NAMES), { image_url: { by: 'model' } });
});

Deno.test('validateDescription: length, plain text, other names', () => {
  const ok = validateDescription(
    '  Hinge at the hips and swing the bell to chest height with a hard glute squeeze.  ', 'Kettlebell Swing', NAMES,
  );
  assertEquals(ok, { ok: true, text: 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.' });
  assertEquals(validateDescription('Swing it.', 'Kettlebell Swing', NAMES), { ok: false, reason: 'too short (9 < 40 chars)' });
  assertEquals(validateDescription('x'.repeat(601), 'Kettlebell Swing', NAMES), { ok: false, reason: 'too long (601 > 600 chars)' });
  assertEquals(
    validateDescription('<b>Hinge</b> at the hips and swing the bell to chest height with a squeeze.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'not plain text' },
  );
  assertEquals(
    validateDescription('- Hinge at the hips and swing the bell to chest height with a squeeze.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'not plain text' },
  );
  assertEquals(
    validateDescription('Deadlift the bell from the floor, then swing it to chest height with a squeeze.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'starts with another catalog name: Deadlift' },
  );
  // Its own name is fine; a prefix that is only part of a word is not a name.
  assertEquals(
    validateDescription('Kettlebell Swing: hinge at the hips and drive the bell to chest height with the glutes.', 'Kettlebell Swing', NAMES).ok,
    true,
  );
  assertEquals(
    validateDescription('Deadlifting is not this. Hinge at the hips and swing the bell to chest height.', 'Kettlebell Swing', NAMES).ok,
    true,
  );
});

Deno.test('validateDescription: other-name match is case-insensitive', () => {
  assertEquals(
    validateDescription('kb swing the bell to chest height with a hard glute squeeze and neutral spine.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'starts with another catalog name: KB Swing' },
  );
});

Deno.test('validateDescription: the longest name at the head wins, so an own name that extends another catalog name is fine', () => {
  assertEquals(
    validateDescription(
      'Lunge With Reach: step forward and reach both arms overhead as you sink into the lunge.', 'Lunge With Reach', ['Lunge'],
    ).ok,
    true,
  );
  assertEquals(
    validateDescription(
      'Box Jump Over the box and land softly on the other side with knees bent.', 'Box Jump', ['Box Jump Over'],
    ),
    { ok: false, reason: 'starts with another catalog name: Box Jump Over' },
  );
  // Punctuation directly after the match still counts as a word boundary.
  assertEquals(
    validateDescription(
      'Deadlift, then swing the bell to chest height with a hard glute squeeze and neutral spine.', 'Kettlebell Swing', ['Deadlift'],
    ),
    { ok: false, reason: 'starts with another catalog name: Deadlift' },
  );
});

Deno.test('isPipelineVideoUrl: https instagram.com / tiktok.com only', () => {
  assertEquals(isPipelineVideoUrl('https://www.instagram.com/reel/abc/'), true);
  assertEquals(isPipelineVideoUrl('https://vm.tiktok.com/ZM1/'), true);
  assertEquals(isPipelineVideoUrl('http://www.instagram.com/reel/abc/'), false);
  assertEquals(isPipelineVideoUrl('https://youtube.com/watch?v=1'), false);
  assertEquals(isPipelineVideoUrl('https://notinstagram.com/x'), false);
  assertEquals(isPipelineVideoUrl(''), false);
});

const src = (o: Partial<SourceCandidate> = {}): SourceCandidate => ({
  sourceUrl: 'https://www.instagram.com/p/one/', platform: 'instagram', capturedAt: '2026-09-01T00:00:00Z',
  extractionStatus: 'reviewed', hasWorkout: false, rawExtraction: null, ...o,
});

Deno.test('pickSingleExerciseSource: most recent reviewed capture with no workout row', () => {
  const older = src({ sourceUrl: 'https://www.instagram.com/p/old/', capturedAt: '2026-08-01T00:00:00Z' });
  const newer = src({ sourceUrl: 'https://www.instagram.com/p/new/', capturedAt: '2026-09-05T00:00:00Z' });
  assertEquals(pickSingleExerciseSource([older, newer]), 'https://www.instagram.com/p/new/');
  assertEquals(pickSingleExerciseSource([newer, older]), 'https://www.instagram.com/p/new/');
});

Deno.test('pickSingleExerciseSource: skips workouts, pending captures, and non-platform URLs', () => {
  assertEquals(pickSingleExerciseSource([src({ hasWorkout: true })]), null);
  assertEquals(pickSingleExerciseSource([src({ extractionStatus: 'pending' })]), null);
  assertEquals(pickSingleExerciseSource([src({ sourceUrl: 'https://example.com/x' })]), null);
  assertEquals(pickSingleExerciseSource([src({ sourceUrl: '' })]), null);
  assertEquals(pickSingleExerciseSource([]), null);
});

Deno.test('normaliseName: case and spacing', () => {
  assertEquals(normaliseName('  Kettlebell   swing '), 'kettlebell swing');
  assertEquals(normaliseName('KETTLEBELL SWING'), 'kettlebell swing');
});

Deno.test('extractionDescriptionFor: matches the reviewed name across sources, newest first', () => {
  const raw = (name: string, description: string | null) => ({
    post_type: 'single_exercise',
    exercises: [{ name, description, category: 'strength', skill_level: 'Beginner',
      primary_muscles: [], secondary_muscles: [], equipment: [], library_match_id: null }],
    workout: null,
  });
  const a = src({ capturedAt: '2026-08-01T00:00:00Z', rawExtraction: raw('kettlebell  swing', 'Older text that is long enough to count as a description here.') });
  const b = src({ capturedAt: '2026-09-01T00:00:00Z', rawExtraction: raw('Kettlebell Swing', 'Newer text that is long enough to count as a description here.') });
  assertEquals(extractionDescriptionFor([a, b], 'Kettlebell Swing'), 'Newer text that is long enough to count as a description here.');
  assertEquals(extractionDescriptionFor([a], 'Goblet Squat'), null);
  assertEquals(extractionDescriptionFor([src({ rawExtraction: raw('Kettlebell Swing', null) })], 'Kettlebell Swing'), null);
  assertEquals(extractionDescriptionFor([src({ rawExtraction: 'garbage' })], 'Kettlebell Swing'), null);
  // A pending capture's extraction is not trusted.
  assertEquals(extractionDescriptionFor([src({ extractionStatus: 'pending', rawExtraction: raw('Kettlebell Swing', 'x'.repeat(50)) })], 'Kettlebell Swing'), null);
});
