// The Fuel picker: which meal fills which window (the hybrid engine's AI
// tier).
//
// The rules tier already did the arithmetic before this function is called:
// window targets, portion factors, rescue rankings — all deterministic, all
// client-side, all instant. What rules cannot do is weigh taste against
// variety against "you've had that three days running" the way a person
// would. That judgement call is the ONLY thing asked of the model here.
//
// Doctrine, matching the rest of the app's AI:
// - SUGGEST ONLY. This function writes nothing, ever. Its output prefills
//   the rail; every log is still the owner's tap.
// - The model may choose only from the candidate ids given. The client
//   validates that again on its side; an id not in the input is dropped.
// - Rules keep the numbers: portions and targets are recomputed by the
//   client's engine. A reason string is the model's whole contribution
//   beyond the assignment itself.
// - Model: gpt-5.6-terra — judgement tier, same split as the rest of the app.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';

const SYSTEM = `You assign meals to the remaining eating windows of one
person's day. You are choosing for the person whose day it is.

Rules:
- Choose ONLY from the candidate meals given, by their exact "mealId". Never
  invent a meal. A window may also be left unassigned when nothing suits it.
- Each meal may be used at most once across all windows.
- Priorities, in order: (1) food that is about to expire gets eaten first;
  (2) come as close as you can to each window's calorie and protein target;
  (3) the right kind of meal for the slot (breakfast food at breakfast);
  (4) variety — avoid a meal eaten within the last day unless it is expiring;
  (5) higher score wins ties.
- "reason" is ONE short sentence, plain and specific, addressed to the eater
  — "closes your protein gap and the pasta goes tomorrow", not marketing
  copy. No exclamation marks.

Respond as JSON:
{"picks": [{"windowId": string, "mealId": string, "reason": string}]}`;

interface WindowInput {
  windowId: string;
  label: string;
  mealType: string;
  targetCalories: number;
  targetProtein: number;
}

interface CandidateInput {
  mealId: string;
  name: string;
  calories: number;
  protein: number;
  prepMinutes: number;
  score: number;
  mealType: string;
  assemblable: boolean;
  expiresInDays: number | null;
  lastLoggedDaysAgo: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
    if (!req.headers.get('Authorization')) throw new Error('missing Authorization header');

    const { windows = [], candidates = [] } = await req.json();
    const wins = windows as WindowInput[];
    const cands = candidates as CandidateInput[];
    // Nothing to assign or nothing to assign from: succeed with no picks
    // rather than asking the model to invent an answer.
    if (wins.length === 0 || cands.length === 0) {
      return new Response(JSON.stringify({ picks: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const windowTable = wins
      .map(
        (w) =>
          `${w.windowId} · ${w.label} (${w.mealType}) — target ${w.targetCalories} cal, ${w.targetProtein}g protein`,
      )
      .join('\n');
    const candidateTable = cands
      .map((c) => {
        const bits = [
          `${c.mealId} · ${c.name}`,
          `${c.calories} cal`,
          `${c.protein}g protein`,
          `${c.prepMinutes} min prep`,
          `score ${c.score}`,
          `slot ${c.mealType}`,
          c.assemblable ? 'in stock' : 'NOT fully in stock',
          c.expiresInDays == null
            ? null
            : c.expiresInDays === 0
              ? 'EXPIRES TODAY'
              : `expires in ${c.expiresInDays}d`,
          c.lastLoggedDaysAgo == null
            ? 'never eaten'
            : `last eaten ${c.lastLoggedDaysAgo}d ago`,
        ].filter(Boolean);
        return bits.join(' · ');
      })
      .join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Remaining windows:\n${windowTable}\n\nCandidate meals:\n${candidateTable}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 400)}`);
    }

    const completion = await res.json();
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}');

    // Validate hard: only known ids, each window and each meal at most once.
    // The client re-validates, but a function should not return garbage and
    // rely on its caller's manners.
    const windowIds = new Set(wins.map((w) => w.windowId));
    const mealIds = new Set(cands.map((c) => c.mealId));
    const seenWindows = new Set<string>();
    const seenMeals = new Set<string>();
    const picks = (Array.isArray(parsed.picks) ? parsed.picks : [])
      .filter(
        (p: Record<string, unknown>) =>
          typeof p.windowId === 'string' &&
          typeof p.mealId === 'string' &&
          windowIds.has(p.windowId) &&
          mealIds.has(p.mealId),
      )
      .filter((p: { windowId: string; mealId: string }) => {
        if (seenWindows.has(p.windowId) || seenMeals.has(p.mealId)) return false;
        seenWindows.add(p.windowId);
        seenMeals.add(p.mealId);
        return true;
      })
      .map((p: { windowId: string; mealId: string; reason?: unknown }) => ({
        windowId: p.windowId,
        mealId: p.mealId,
        reason:
          typeof p.reason === 'string' && p.reason.trim().length > 0
            ? p.reason.trim().slice(0, 160)
            : null,
      }));

    return new Response(JSON.stringify({ picks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('fuel-plan:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error', picks: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
