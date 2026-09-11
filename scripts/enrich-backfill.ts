// Fill every empty description and demo video in the catalog, once. Calls
// enrich-exercise's sweep with images OFF (decision 5: no image backfill):
// first a dry run that only counts, then — unless --dry-run was passed —
// batches of 25 until the function reports nothing remaining. Idempotent:
// a second run finds nothing to fill.
//
// Run from repo root:
//   deno run --allow-net --allow-read scripts/enrich-backfill.ts            # dry run, then real
//   deno run --allow-net --allow-read scripts/enrich-backfill.ts --dry-run  # counts only
// Reads mobile/.env (EXPO_PUBLIC_SUPABASE_URL, SERVICE_ROLE).
const envText = await Deno.readTextFile(new URL('../mobile/.env', import.meta.url));
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SERVICE_ROLE;
if (!BASE || !KEY) {
  console.error('mobile/.env needs EXPO_PUBLIC_SUPABASE_URL and SERVICE_ROLE');
  Deno.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const dryRunOnly = Deno.args.includes('--dry-run');
const BATCH = 25;

type Counts = { description: number; video_url: number; image_url: number };
interface SweepResponse {
  dryRun: boolean;
  candidates: number;
  processed: number;
  remaining: number;
  wouldFill?: Counts;
  filled?: Counts;
  skipped?: Counts;
  errors?: { id: string; name: string; skipped: Record<string, string> }[];
  // Set when the function ended a batch before visiting every row: its
  // 100-second time budget ran out, or the describer answered 429.
  stoppedEarly?: string;
  error?: string;
}

async function sweep(limit: number, dryRun: boolean): Promise<SweepResponse> {
  const res = await fetch(`${BASE}/functions/v1/enrich-exercise`, {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'sweep', images: false, limit, dryRun }),
  });
  const body = await res.json().catch(() => ({})) as SweepResponse;
  if (!res.ok || body.error) throw new Error(`sweep ${res.status}: ${body.error ?? 'failed'}`);
  return body;
}

const fmt = (c: Counts | undefined) =>
  c ? `${c.description} descriptions, ${c.video_url} videos, ${c.image_url} images` : '-';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Dry run: what a full sweep would touch.
const dry = await sweep(1000, true);
console.log(`dry run: ${dry.candidates} rows with something to fill; would fill ${fmt(dry.wouldFill)}`);
if (dryRunOnly) Deno.exit(0);

// 2. Real run, batched so one slow model call cannot time the function out.
const total: Counts = { description: 0, video_url: 0, image_url: 0 };
const skippedTotal: Counts = { description: 0, video_url: 0, image_url: 0 };
let processed = 0;
let batchNo = 0;
let remaining = dry.candidates;
// A row whose description keeps failing validation is re-selected every
// batch; the loop stops when a batch fills nothing rather than spinning.
while (remaining > 0) {
  batchNo++;
  const r = await sweep(BATCH, false);
  processed += r.processed;
  for (const f of ['description', 'video_url', 'image_url'] as const) {
    total[f] += r.filled?.[f] ?? 0;
    skippedTotal[f] += r.skipped?.[f] ?? 0;
  }
  console.log(`batch ${batchNo}: processed ${r.processed}, filled ${fmt(r.filled)}, skipped ${fmt(r.skipped)}, remaining ${r.remaining}`);
  if (r.stoppedEarly) console.log(`  stopped early: ${r.stoppedEarly}`);
  for (const e of r.errors ?? []) console.log(`  skip ${e.name} (${e.id}): ${JSON.stringify(e.skipped)}`);
  const filledThisBatch = (r.filled?.description ?? 0) + (r.filled?.video_url ?? 0) + (r.filled?.image_url ?? 0);
  remaining = r.remaining;
  if (r.stoppedEarly === 'describe 429') {
    // The describer is rate-limited, not broken: wait it out and carry on.
    console.log('  describer rate-limited; sleeping 60s before the next batch');
    await sleep(60_000);
    continue;
  }
  if (filledThisBatch === 0) {
    console.log('batch filled nothing; stopping (the rows left are retried by the weekly sweep)');
    break;
  }
}
console.log(`done: processed ${processed} rows; filled ${fmt(total)}; skipped ${fmt(skippedTotal)}`);
