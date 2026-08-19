// The daily recommender's AI tier: ONE judgment call — compose today's
// session from pre-filtered, pre-ranked candidates. Two modes:
//
//   (default) exercise-level { splitDay, minutes, budget, candidates,
//       capturedWorkouts } → { composition: { items, sectionMinutes,
//       servedWorkoutId } }. Picks individual exercises against a push/pull/
//       legs split and the slot budget. The older engine; still live.
//
//   mode: "blocks" { minutes, energy, soreness, coverage, relaxedMain,
//       shortlists } → { composition: { blocks: [{ block, id, reason }] } }.
//       Picks ONE WHOLE captured workout per block of a five-block day
//       (warmup → mobility → main → conditioning → cooldown) from the
//       per-block shortlists the rules tier already ranked.
//
// Doctrine (fuel-plan), the same in both modes:
// - SUGGEST ONLY: writes nothing, ever.
// - The model may use only ids given; the client re-validates independently
//   (dailyCompose.ts / dailyBlockCompose.ts) and falls back to the rules
//   tier's own picks on any violation. You always get a session.
// - Rules keep the numbers: slot counts, default sets/reps, block minutes and
//   round adjustments arrive as constraints; the model selects and explains.
// Model: gpt-5.6-terra — judgment tier.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** A failure that came from OpenAI rather than from us, carrying its status
 *  instead of flattening it to 500 (same as capture-post, where a catalog-wide
 *  backfill loop already reads it). Nothing here reads it yet — the daily ask
 *  retries once on any failure and then stands on the rules tier. */
class UpstreamError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`openai ${status}: ${detail.slice(0, 300)}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

const SYSTEM = `You are composing one person's gym session for today. The
deterministic engine has already filtered every candidate for split day,
available equipment, soreness, and skill level — your job is selection,
ordering, and pairing, the judgment a good coach applies.

Rules:
- Use ONLY exercise ids from the candidate list, by exact "id". Never invent.
- Respect the slot budget per section. Fewer is fine; more is not.
- The budget already spent the person's stated time for them, so a long
  warm-up or cooldown next to little loaded work is deliberate: their re-entry
  ramp caps hard sets, and the leftover time went to mobility and to longer
  rests. Fill the warm-up and cooldown slots you are offered instead of
  trimming them — the time is theirs, and the mobility is what it is for.
- Higher-ranked candidates are preferred (the list is ordered), but you may
  reach past one when it makes the session cohere: complementary movement
  patterns, sensible push/pull pairing within the day, equipment flow so the
  person isn't walking across the gym between every set.
- "EQUIPMENT UNVERIFIED" means the catalog never recorded what that movement
  needs, so nobody has checked it against today's gym. Prefer verified
  candidates; reach for an unverified one only to fill a gap, and never when
  its usual form clearly needs kit this gym lacks (no barbell lifts at a
  bodyweight gym).
- A "captured workout" (if any are offered) may be served WHOLE instead of a
  composed list, but only when it genuinely fits today's focus, equipment,
  and time — then return its id as servedWorkoutId and an empty items array.
- sets/reps/restSeconds default to the section's stated defaults; deviate
  only with reason (e.g. heavier compound → fewer reps).
- "reason" is ONE short sentence to the athlete, plain and specific — "first
  time back on pressing, so it leads while you're fresh", not marketing.
- Order items warmup → main → accessory → bfr → cooldown.
- "sectionMinutes" is how long each section you filled will actually take, in
  whole minutes: the working sets you prescribed, the rests between them, and
  the walking-and-loading gap between one exercise and the next. Give an entry
  for every section you put work in, and none for the sections you left empty.
  The total must fit inside the minutes available.

Respond as JSON:
{"items": [{"exerciseId": string, "section": "warmup"|"main"|"accessory"|"bfr"|"cooldown",
  "sets": number, "reps": string, "restSeconds": number, "reason": string}],
 "sectionMinutes": [{"section": "warmup"|"main"|"accessory"|"bfr"|"cooldown",
  "minutes": number}],
 "servedWorkoutId": string | null}`;

// ---------------------------------------------------------------------------
// blocks mode
// ---------------------------------------------------------------------------

/** The day in the order it is performed. Mirrors BLOCK_ORDER in
 *  mobile/src/lib/dailyBlockCompose.ts — the client's validator accepts these
 *  five names and nothing else. */
const BLOCK_ORDER = ['warmup', 'mobility', 'main', 'conditioning', 'cooldown'] as const;

const BLOCKS_SYSTEM = `You are picking one person's training day from
pre-filtered shortlists — one pick per block, five blocks at most, performed
in this order: warmup, mobility, main, conditioning, cooldown. The
deterministic engine already handled soreness, time, recency and skill; your
job is the judgment call of which combination makes the most coherent day.

Rules:
- Pick EXACTLY ONE candidate for each block you are shown — conditioning
  aside, which is the one block you may drop, when dropping it makes a better
  day or when the minutes don't allow it. Every other block you are shown
  appears exactly once, main above all.
- Take each pick from that block's own list and name it by its exact "id" —
  the text before the first " · " on the candidate's line, copied character
  for character. Never invent an id, never answer with a name where an id
  belongs, and never give one block a candidate from another block's list.
- Name ONLY blocks you were shown. A block with no section below is not part
  of today: leave it out of your answer entirely rather than naming it to say
  you skipped it. Days come up short a block on purpose — a day with no MAIN
  section has no main workout in it at all, and the blocks listed are the
  whole of it. Compose that day as it stands; never mourn the missing block.
- Conditioning is the ONE block you may drop, when dropping it makes a better
  day or the minutes don't allow it. Every other block you are shown must
  appear exactly once, main above all.
- The day should hang together: the warmup, mobility and cooldown you pick
  should prepare and unwind the main workout you pick (matching body focus).
- Prefer neglected muscles over yesterday's muscles. Higher score = the
  engine's preference; you may reach past it when cohesion says so.
- Candidates marked BUILT-IN are shipped generics. Prefer the person's own
  captures when one fits; a built-in is the fallback, not the default.
- Each candidate's minutes are fixed and yours to add up, never to change.
  The minutes of the candidates you pick should total the minutes available or
  less. When even the shortest candidate in every block won't fit inside them,
  take the short ones, keep the day complete, and say so in a reason — never
  drop a block you were shown to make the number work.
- A "(note: ...)" is a round adjustment already computed — repeat it in your
  reason if it matters.
- "reason" is ONE short sentence to the athlete, plain and specific.
- Some blocks may arrive ALREADY FIXED — the athlete pinned them. They are
  context, not choices: build a day that coheres around them, and never name
  a fixed block in your answer.
- The athlete's own instructions, when present, outrank every preference
  above. Honor each one within the candidates offered; when no candidate in a
  block satisfies an instruction aimed at it, pick the closest thing and say
  plainly in that block's reason what couldn't be honored and why this is the
  nearest. Never ignore an instruction silently.
- A debrief line, when present, is how their last finished session landed.
  "too_much" means bias toward shorter and lower intensity today; "too_easy"
  means they had more in the tank — bias the other way.
- "dayReason" is ONE sentence to the athlete about the day's overall shape —
  what it trains and why today, given their energy, soreness, and what's been
  neglected. Plain and specific, like the block reasons. Not a summary of the
  blocks; the WHY of the day.

An id that wasn't offered, or a block that wasn't shown, costs the athlete the
WHOLE answer: the day falls back to a mechanical pick with no reasoning at all.

Respond as JSON, block names lowercase and spelled exactly as below:
{"dayReason": string,
 "blocks": [{"block": "warmup"|"mobility"|"main"|"conditioning"|"cooldown",
  "id": string, "reason": string}]}`;

/** The candidates in one shortlist the model can actually pick. An entry with
 *  no usable id can only produce an id the client never offered, and the
 *  client throws away the whole answer for one of those — so it is never worth
 *  showing. */
function usableCandidates(list: unknown): any[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (c) => c !== null && typeof c === 'object'
      && typeof c.id === 'string' && c.id.trim() !== '',
  );
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

async function composeBlocks(body: any): Promise<Response> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const minutes = Number(body.minutes);
  // The client refuses to validate an answer against a budget that isn't a
  // positive number — it can't tell an overrun from a fit — so every answer we
  // could return would be discarded unread. Refuse before spending the call.
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('minutes must be a positive number');
  }
  const energy = Number(body.energy);
  const soreness = (body.soreness ?? {}) as Record<string, unknown>;
  const coverage = (body.coverage ?? {}) as Record<string, unknown>;
  const relaxedMain = body.relaxedMain === true;
  const overrodeRecovery = body.overrodeRecovery === true;
  const shortlists = (body.shortlists ?? {}) as Record<string, unknown>;
  // The athlete's one-shot instructions ([{block|null, text}]), how the last
  // session landed, and the blocks they pinned — all optional, all context.
  const instructions = (Array.isArray(body.instructions) ? body.instructions : [])
    .filter((i: any) => i && typeof i.text === 'string' && i.text.trim() !== '');
  const debrief = body.debrief && typeof body.debrief.verdict === 'string'
    ? body.debrief : null;
  const fixedBlocks = (Array.isArray(body.fixedBlocks) ? body.fixedBlocks : [])
    .filter((b: any) => b && typeof b.block === 'string' && typeof b.name === 'string');

  // Presented in the order the day is performed, not the order the client
  // happened to serialise: Object.entries follows insertion order and the
  // shortlist builder inserts main first, which would show the model a day
  // that starts with its main workout. Blocks outside the five are dropped
  // rather than shown — the client rejects the whole answer for a block it
  // never offered, so a name the model can only misuse is worse than absent.
  const offered = BLOCK_ORDER
    .map((block) => [block, usableCandidates(shortlists[block])] as const)
    .filter(([, list]) => list.length > 0);
  if (offered.length === 0) {
    // Shaped like a composition so the client validates it like any other and
    // lands on its rules fallback, which for empty shortlists is an empty day
    // too. Not an error: a catalog with nothing to offer is a real state.
    return json({ composition: { blocks: [] } });
  }
  const hasMain = offered.some(([block]) => block === 'main');

  const soreLines = Object.entries(soreness)
    .map(([m, s]) => `${m}: ${s}/3`).join(', ') || 'none';
  const tables = offered.map(([block, list]) => {
    const rows = list.map((c: any) => [
      `${c.id} · ${c.name}`,
      `~${c.minutes} min`,
      c.builtin ? 'BUILT-IN' : null,
      `focus ${c.focus}`,
      Array.isArray(c.muscles) && c.muscles.length > 0 ? `muscles ${c.muscles.join('/')}` : null,
      // Only for the person's own captures. A built-in has no history to have,
      // and "never done" on one reads as freshness — an argument for the
      // generic over a capture, which is backwards.
      c.builtin ? null
        : c.lastPerformedDaysAgo == null ? 'never done'
        : `last done ${c.lastPerformedDaysAgo}d ago`,
      typeof c.score === 'number' ? `score ${c.score.toFixed(2)}` : null,
      c.roundsNote ? `(note: ${c.roundsNote})` : null,
    ].filter(Boolean).join(' · ')).join('\n');
    return `${block.toUpperCase()}:\n${rows}`;
  }).join('\n\n');

  const verdictLine: Record<string, string> = {
    too_easy: 'their last finished session landed TOO EASY — they had more in the tank',
    just_right: 'their last finished session landed just right',
    too_much: 'their last finished session landed TOO MUCH — ease today off',
  };
  const head = [
    `Minutes available: ${minutes}.`
      + (Number.isFinite(energy) ? ` Energy: ${energy}/10.` : '')
      + ` Soreness: ${soreLines}.`,
    `Most neglected muscles this week: ${stringList(coverage.neglected).join(', ') || 'no history yet'}.`,
    `Hit yesterday: ${stringList(coverage.yesterday).join(', ') || 'nothing'}.`,
    fixedBlocks.length > 0
      ? 'ALREADY FIXED by the athlete (context only — do not name these blocks, '
        + 'and their minutes are already spent):\n'
        + fixedBlocks.map((b: any) =>
            `  ${String(b.block)} — ${String(b.name)} (~${Number(b.minutes) || '?'} min)`,
          ).join('\n')
      : '',
    instructions.length > 0
      ? "The athlete's instructions for today (newest first — honor them):\n"
        + instructions.map((i: any) =>
            `  ${i.block ? `[${String(i.block)}] ` : '[whole day] '}"${String(i.text).trim()}"`,
          ).join('\n')
      : '',
    debrief
      ? `Debrief: ${verdictLine[String(debrief.verdict)] ?? String(debrief.verdict)}.`
        + (typeof debrief.note === 'string' && debrief.note.trim() !== ''
            ? ` Their note: "${debrief.note.trim()}"`
            : '')
      : '',
    overrodeRecovery
      ? 'NOTE: the engine recommended a RECOVERY day and the athlete overrode '
        + 'it — they want to train. Compose a real day, but keep intensity '
        + 'conservative and steer wide of the sore areas above; say in the '
        + 'dayReason that today is deliberately careful.'
      : '',
    hasMain
      ? ''
      : 'NOTE: there is no main workout today — the blocks below are the whole '
        + 'day. Compose them, and do not name a main.',
    // True of both rungs of the relaxation ladder: recency is relaxed first,
    // then soreness dominance, so a candidate here fails one or the other.
    relaxedMain
      ? 'NOTE: the main shortlist only exists because the usual exclusions were '
        + 'relaxed — every candidate was either trained in the last few days or '
        + "works a muscle that's still sore. Say in the main reason that today's "
        + 'main is a compromise.'
      : '',
  ].filter((l) => l !== '').join('\n');
  const user = `${head}\n\nShortlists (ranked, best first):\n${tables}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: BLOCKS_SYSTEM },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new UpstreamError(res.status, await res.text());
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('empty model response');
  // Parsed only to fail fast on malformed JSON — the client re-validates every
  // block and id against what it offered, and keeps its own minutes.
  return json({ composition: JSON.parse(content) });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
    if (!req.headers.get('Authorization')) throw new Error('missing Authorization header');

    const bodyIn = await req.json();
    if (bodyIn?.mode === 'blocks') return await composeBlocks(bodyIn);

    const { splitDay, minutes, budget = [], candidates = [], capturedWorkouts = [] } = bodyIn;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(JSON.stringify({ items: [], servedWorkoutId: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const budgetTable = (budget as any[])
      .map((b) => `${b.section}: ${b.slots} slots · default ${b.targetSets}×${b.targetReps}${b.restSeconds ? ` · rest ${b.restSeconds}s` : ''}`)
      .join('\n');

    const candidateTable = (candidates as any[])
      .map((c) => [
        `${c.id} · ${c.name}`,
        `pool ${c.pool}`,
        c.isCapture ? 'CAPTURED' : 'stock',
        c.skillLevel ?? 'unrated',
        `muscles ${Array.isArray(c.muscles) ? c.muscles.join('/') : ''}`,
        c.lastPerformedDaysAgo == null ? 'never done' : `last done ${c.lastPerformedDaysAgo}d ago`,
        c.equipmentUnknown ? 'EQUIPMENT UNVERIFIED' : null,
        c.regressedFrom ? `regression of ${c.regressedFrom}` : null,
      ].filter(Boolean).join(' · '))
      .join('\n');

    const workoutTable = (capturedWorkouts as any[])
      .map((w) => `${w.id} · "${w.name}" · ${w.itemCount} movements · muscles ${w.muscles}`)
      .join('\n');

    const user = [
      `Split day: ${splitDay}. Minutes available: ${minutes}.`,
      ``, `Slot budget:`, budgetTable,
      ``, `Candidates (ranked, best first):`, candidateTable,
      workoutTable ? `\nCaptured workouts servable whole:\n${workoutTable}` : '',
    ].join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('empty model response');
    // Parsed only to fail fast on malformed JSON — the client re-validates
    // every id and field against what it offered.
    return new Response(JSON.stringify({ composition: JSON.parse(content) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('compose-session:', e);
    // An upstream failure answers with the upstream's own status, preserved
    // for a caller that learns to back off — today's client retries once on
    // any failure and then falls back, and reads no status at all. Only blocks
    // mode raises one; the exercise path throws plain Errors and still answers
    // 500, unchanged.
    const status = e instanceof UpstreamError && e.status >= 400 && e.status <= 599
      ? e.status
      : 500;
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, status);
  }
});
