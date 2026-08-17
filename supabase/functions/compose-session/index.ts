// The daily recommender's AI tier: ONE judgment call — compose today's
// session from pre-filtered, pre-ranked candidates. Doctrine (fuel-plan):
// - SUGGEST ONLY: writes nothing, ever.
// - The model may use only ids given; the client re-validates independently.
// - Rules keep the numbers: slot counts and default sets/reps arrive as
//   constraints; the model orders, pairs, and explains.
// Model: gpt-5.6-terra — judgment tier.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';

const SYSTEM = `You are composing one person's gym session for today. The
deterministic engine has already filtered every candidate for split day,
available equipment, soreness, and skill level — your job is selection,
ordering, and pairing, the judgment a good coach applies.

Rules:
- Use ONLY exercise ids from the candidate list, by exact "id". Never invent.
- Respect the slot budget per section. Fewer is fine; more is not.
- Higher-ranked candidates are preferred (the list is ordered), but you may
  reach past one when it makes the session cohere: complementary movement
  patterns, sensible push/pull pairing within the day, equipment flow so the
  person isn't walking across the gym between every set.
- A "captured workout" (if any are offered) may be served WHOLE instead of a
  composed list, but only when it genuinely fits today's focus, equipment,
  and time — then return its id as servedWorkoutId and an empty items array.
- sets/reps/restSeconds default to the section's stated defaults; deviate
  only with reason (e.g. heavier compound → fewer reps).
- "reason" is ONE short sentence to the athlete, plain and specific — "first
  time back on pressing, so it leads while you're fresh", not marketing.
- Order items warmup → main → accessory → bfr → cooldown.

Respond as JSON:
{"items": [{"exerciseId": string, "section": "warmup"|"main"|"accessory"|"bfr"|"cooldown",
  "sets": number, "reps": string, "restSeconds": number, "reason": string}],
 "servedWorkoutId": string | null}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
    if (!req.headers.get('Authorization')) throw new Error('missing Authorization header');

    const { splitDay, minutes, budget = [], candidates = [], capturedWorkouts = [] } =
      await req.json();

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
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
