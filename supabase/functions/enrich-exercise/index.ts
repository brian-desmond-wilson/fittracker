// supabase/functions/enrich-exercise/index.ts
// Fill-only enrichment for catalog exercises. Two actions:
//
//   enrich { exerciseId, images?: boolean, force_image?: boolean }
//       → { filled: string[], skipped: Record<string, string>, imageUrl: string | null }
//       Fills description (capture extraction, else capture-post describe),
//       video_url (the single-exercise capture's post) and image_url (the
//       shared generator) — each only when null/blank and not by="user".
//       force_image regenerates over an existing image: the ONE overwrite.
//       Any signed-in user.
//
//   sweep { images: boolean, limit: number, dryRun: boolean }
//       → { dryRun, candidates, wouldFill | filled, skipped, processed, remaining }
//       Rows with any fillable field, newest first, up to `limit`; the enrich
//       logic per row. Admin profiles only (or the service role: the backfill).
//       A real run stops early when describe answers 429 or 401 — the rest of
//       the batch would only repeat the failure — and says so in stoppedEarly.
//
// Every field is its own try/catch: a failure leaves the slot empty for the
// next sweep, never fails the call. Decisions are in fill.ts (pure, tested);
// this file only reads, calls out and writes.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5–§8
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndStoreImage } from '../_shared/exerciseImage.ts';
import {
  planFill, validateDescription, pickSingleExerciseSource, extractionDescriptionFor, hasWork,
} from './fill.ts';
import type { EnrichRow, Enrichment, FillPlan, RunFlags, SourceCandidate } from './fill.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? null;

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ROW_SELECT =
  'id, name, description, video_url, image_url, enrichment, is_movement, created_at, ' +
  'source_exercises(source:captured_sources(id, source_url, platform, captured_at, extraction_status, raw_extraction, captured_workouts(id)))';

/** The row as read, with its captures flattened for fill.ts. */
interface LoadedRow extends EnrichRow {
  isMovement: boolean;
  sources: SourceCandidate[];
}

// deno-lint-ignore no-explicit-any
function toLoadedRow(raw: any): LoadedRow {
  const sources: SourceCandidate[] = ((raw.source_exercises ?? []) as { source: Record<string, unknown> | null }[])
    .map((se) => se.source)
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({
      sourceUrl: String(s.source_url ?? ''),
      platform: String(s.platform ?? 'other'),
      capturedAt: String(s.captured_at ?? ''),
      extractionStatus: String(s.extraction_status ?? 'pending'),
      hasWorkout: Array.isArray(s.captured_workouts) && s.captured_workouts.length > 0,
      rawExtraction: s.raw_extraction ?? null,
    }));
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ?? null,
    video_url: raw.video_url ?? null,
    image_url: raw.image_url ?? null,
    enrichment: (raw.enrichment ?? {}) as Enrichment,
    isMovement: raw.is_movement === true,
    sources,
  };
}

async function loadRow(service: SupabaseClient, exerciseId: string): Promise<LoadedRow> {
  const { data, error } = await service.from('exercises').select(ROW_SELECT).eq('id', exerciseId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('exercise not found');
  return toLoadedRow(data);
}

/** Every catalog name and alias except this row's own, for validation. */
async function otherNamesFor(service: SupabaseClient, exerciseId: string): Promise<string[]> {
  const [names, aliases] = await Promise.all([
    service.from('exercises').select('id, name'),
    service.from('exercise_aliases').select('exercise_id, alias'),
  ]);
  if (names.error) throw new Error(names.error.message);
  if (aliases.error) throw new Error(aliases.error.message);
  return [
    ...((names.data ?? []) as { id: string; name: string }[]).filter((r) => r.id !== exerciseId).map((r) => r.name),
    ...((aliases.data ?? []) as { exercise_id: string; alias: string }[]).filter((r) => r.exercise_id !== exerciseId).map((r) => r.alias),
  ];
}

/** capture-post's describe answered with a non-2xx; the status decides whether a sweep goes on. */
class DescribeError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`describe ${status}: ${detail}`);
    this.name = 'DescribeError';
    this.status = status;
  }
}

async function describeViaCapturePost(exerciseId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/capture-post`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'describe', exerciseId }),
  });
  const body = await res.json().catch(() => ({})) as { description?: string | null; error?: string };
  if (!res.ok) throw new DescribeError(res.status, body.error ?? 'failed');
  if (typeof body.description !== 'string' || body.description.trim() === '') throw new Error('describe returned no text');
  return body.description;
}

/** One column plus its provenance stamp, in one statement. */
async function writeField(
  service: SupabaseClient, row: LoadedRow, field: 'description' | 'video_url' | 'image_url',
  value: string, by: 'extraction' | 'model' | 'capture',
): Promise<void> {
  const enrichment: Enrichment = { ...row.enrichment, [field]: { by, at: new Date().toISOString() } };
  const { error } = await service.from('exercises').update({ [field]: value, enrichment }).eq('id', row.id);
  if (error) throw new Error(error.message);
  row.enrichment = enrichment;
  row[field] = value;
}

export interface EnrichResult {
  filled: string[];
  skipped: Record<string, string>;
  imageUrl: string | null;
  /** Set when describe failed with an HTTP status; a sweep stops on 429/401. */
  describeStatus?: number;
}

function planFor(row: LoadedRow, flags: RunFlags, otherNames: string[]): FillPlan {
  return planFill(row, {
    extractionDescription: extractionDescriptionFor(row.sources, row.name),
    singleExerciseSourceUrl: pickSingleExerciseSource(row.sources),
  }, flags, otherNames);
}

/** Fill one row per its plan. Never throws for a field; the reason lands in skipped. */
async function enrichRow(service: SupabaseClient, row: LoadedRow, plan: FillPlan, otherNames: string[]): Promise<EnrichResult> {
  const result: EnrichResult = { filled: [], skipped: {}, imageUrl: null };

  if (plan.description) {
    try {
      const text = plan.description.by === 'extraction' ? plan.description.text : await describeViaCapturePost(row.id);
      const check = validateDescription(text, row.name, otherNames);
      if (!check.ok) {
        result.skipped.description = `rejected: ${check.reason}`;
      } else {
        await writeField(service, row, 'description', check.text, plan.description.by);
        result.filled.push('description');
      }
    } catch (e) {
      result.skipped.description = e instanceof Error ? e.message : 'failed';
      if (e instanceof DescribeError) result.describeStatus = e.status;
      console.error('enrich description', row.id, e);
    }
  } else {
    result.skipped.description = row.enrichment.description?.by === 'user' ? 'user' : 'filled';
  }

  if (plan.video_url) {
    try {
      await writeField(service, row, 'video_url', plan.video_url.url, 'capture');
      result.filled.push('video_url');
    } catch (e) {
      result.skipped.video_url = e instanceof Error ? e.message : 'failed';
      console.error('enrich video', row.id, e);
    }
  } else {
    result.skipped.video_url = row.enrichment.video_url?.by === 'user' ? 'user'
      : row.video_url && row.video_url.trim() !== '' ? 'filled'
      : 'no single-exercise capture';
  }

  if (plan.image_url) {
    try {
      if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY is not configured');
      const url = await generateAndStoreImage(service, row.id, {
        geminiApiKey: GEMINI_KEY, discipline: row.isMovement ? 'CrossFit' : null,
      });
      await writeField(service, row, 'image_url', url, 'model');
      result.filled.push('image_url');
      result.imageUrl = url;
    } catch (e) {
      result.skipped.image_url = e instanceof Error ? e.message : 'failed';
      console.error('enrich image', row.id, e);
    }
  } else {
    result.skipped.image_url = row.enrichment.image_url?.by === 'user' ? 'user'
      : row.image_url && row.image_url.trim() !== '' ? 'filled'
      : 'images off';
  }

  return result;
}

const flagsFrom = (body: Record<string, unknown>): RunFlags => ({
  images: body.images === true || body.force_image === true,
  forceImage: body.force_image === true,
});

async function runEnrich(body: Record<string, unknown>): Promise<Response> {
  const exerciseId = String(body.exerciseId ?? '').trim();
  if (!exerciseId) throw new Error('exerciseId is required');
  const service = serviceClient();
  const row = await loadRow(service, exerciseId);
  const otherNames = await otherNamesFor(service, exerciseId);
  const plan = planFor(row, flagsFrom(body), otherNames);
  const { filled, skipped, imageUrl } = await enrichRow(service, row, plan, otherNames);
  return json({ filled, skipped, imageUrl });
}

type FieldCounts = { description: number; video_url: number; image_url: number };
const zero = (): FieldCounts => ({ description: 0, video_url: 0, image_url: 0 });

/** Describe statuses that mean the rest of the batch would fail the same way. */
const STOP_ON_DESCRIBE_STATUS = new Set([429, 401]);

async function runSweep(body: Record<string, unknown>): Promise<Response> {
  const images = body.images === true;
  const dryRun = body.dryRun === true;
  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 20;
  const flags: RunFlags = { images, forceImage: false };
  const service = serviceClient();

  const { data, error } = await service.from('exercises').select(ROW_SELECT).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown[]).map(toLoadedRow);

  // Names once for the whole sweep; each row excludes its own below.
  const [namesRes, aliasRes] = await Promise.all([
    service.from('exercises').select('id, name'),
    service.from('exercise_aliases').select('exercise_id, alias'),
  ]);
  if (namesRes.error) throw new Error(namesRes.error.message);
  if (aliasRes.error) throw new Error(aliasRes.error.message);
  const allNames = (namesRes.data ?? []) as { id: string; name: string }[];
  const allAliases = (aliasRes.data ?? []) as { exercise_id: string; alias: string }[];
  const othersFor = (id: string): string[] => [
    ...allNames.filter((r) => r.id !== id).map((r) => r.name),
    ...allAliases.filter((r) => r.exercise_id !== id).map((r) => r.alias),
  ];

  const candidates = rows
    .map((row) => ({ row, otherNames: othersFor(row.id) }))
    .map(({ row, otherNames }) => ({ row, otherNames, plan: planFor(row, flags, otherNames) }))
    .filter(({ plan }) => hasWork(plan));
  const batch = candidates.slice(0, limit);
  let remaining = candidates.length - batch.length;

  if (dryRun) {
    const wouldFill = zero();
    for (const { plan } of batch) {
      if (plan.description) wouldFill.description++;
      if (plan.video_url) wouldFill.video_url++;
      if (plan.image_url) wouldFill.image_url++;
    }
    return json({ dryRun: true, candidates: candidates.length, processed: batch.length, wouldFill, remaining });
  }

  const filled = zero();
  const skipped = zero();
  const errors: { id: string; name: string; skipped: Record<string, string> }[] = [];
  let processed = 0;
  let stoppedEarly: string | null = null;
  for (const { row, plan, otherNames } of batch) {
    const r = await enrichRow(service, row, plan, otherNames);
    processed++;
    for (const f of r.filled) filled[f as keyof FieldCounts]++;
    const failed: Record<string, string> = {};
    for (const f of ['description', 'video_url', 'image_url'] as const) {
      if (plan[f] && !r.filled.includes(f)) { skipped[f]++; failed[f] = r.skipped[f]; }
    }
    if (Object.keys(failed).length > 0) errors.push({ id: row.id, name: row.name, skipped: failed });
    if (r.describeStatus !== undefined && STOP_ON_DESCRIBE_STATUS.has(r.describeStatus)) {
      // Rate-limited or shut out: the rows not yet visited wait for the next sweep.
      stoppedEarly = `describe ${r.describeStatus}`;
      remaining += batch.length - processed;
      break;
    }
  }
  return json({
    dryRun: false, candidates: candidates.length, processed, filled, skipped, remaining, errors,
    ...(stoppedEarly !== null ? { stoppedEarly } : {}),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('missing Authorization header');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');

    // The backfill script holds the service role: both actions.
    const isServiceRole = token === SERVICE_ROLE_KEY;
    let isAdmin = isServiceRole;
    if (!isServiceRole) {
      const anon = createClient(SUPABASE_URL, ANON_KEY);
      const { data: userData, error: userError } = await anon.auth.getUser(token);
      if (userError || !userData?.user) throw new Error('not authenticated');
      if (action === 'sweep') {
        const { data: profile } = await serviceClient()
          .from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
        isAdmin = profile?.is_admin === true;
      }
    }

    if (action === 'enrich') return await runEnrich(body);
    if (action === 'sweep') {
      if (!isAdmin) return json({ error: 'sweep requires an admin profile' }, 403);
      return await runSweep(body);
    }
    throw new Error(`unknown action: ${action}`);
  } catch (e) {
    console.error('enrich-exercise:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
