// A week of eating, read rather than summed (E5).
//
// The weekly summary adds up columns: total calories, days hit, best day.
// True, and none of it is an observation. The questions worth asking of a
// week — which meals actually kept you on pace, which one got logged once and
// abandoned, what a good day looked like — are patterns across rows, and they
// are already sitting in `meal_logs`.
//
// Doctrine, matching the rest of the app's AI:
// - READ ONLY. This function writes nothing, ever. It is an opinion about
//   history, not an edit to it.
// - The model sees only the caller's own logged meals for the window, passed
//   in the prompt. No tools, no database access of its own.
// - It is told to say less rather than invent: with a thin week the honest
//   output is one observation or none, and an empty list renders nothing.
//
// Model: gpt-5.6-terra — this is judgement about a pattern, not mechanical
// extraction, which is the split the app already draws between the two tiers.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';

const SYSTEM = `You read one person's week of logged meals and say what you
notice. You are talking to the person whose week it is.

Rules:
- Ground EVERY observation in the rows given. Never infer a meal, a day or a
  number that is not there.
- Say less rather than more. Two or three observations is the target; one is
  fine; none is correct when the week is too thin to support any.
- Prefer patterns over totals. The person can already see their totals — they
  are printed on the same screen. "Your three highest-protein days all
  included the oatmeal bowl" is worth saying; "you ate 14,600 calories" is
  not.
- Each observation is ONE sentence, plain and specific, no preamble, no
  encouragement, no exclamation marks. Name meals and days where you can.
- Never give medical or nutritional advice. Describe what happened.

Respond as JSON: {"observations": string[]}`;

interface LogRow {
  date: string;
  meal_type: string;
  name: string;
  calories: number | null;
  protein: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
    // Auth is enforced by verify_jwt. This function reads no database of its
    // own — the caller passes the rows it already has on screen — so there is
    // nothing here to scope beyond confirming the caller is who the gateway
    // says they are.
    if (!req.headers.get('Authorization')) throw new Error('missing Authorization header');

    const { logs = [], calorieGoal = null, proteinGoal = null } = await req.json();
    const rows = logs as LogRow[];
    // Below a few days there is no pattern to find, and asking anyway invites
    // the model to manufacture one.
    const distinctDays = new Set(rows.map((r) => r.date)).size;
    if (rows.length < 5 || distinctDays < 3) {
      return new Response(JSON.stringify({ observations: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const table = rows
      .map((r) => `${r.date} ${r.meal_type}: ${r.name} (${r.calories ?? '?'} cal, ${r.protein ?? '?'}g protein)`)
      .join('\n');
    const goals = [
      calorieGoal ? `daily calorie target ${calorieGoal}` : null,
      proteinGoal ? `daily protein target ${proteinGoal}g` : null,
    ].filter(Boolean).join(', ');

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
            content: `${goals ? `Targets: ${goals}.\n\n` : ''}Logged meals:\n${table}`,
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
    const observations = Array.isArray(parsed.observations)
      ? parsed.observations
          .filter((o: unknown): o is string => typeof o === 'string' && o.trim().length > 0)
          .slice(0, 3)
      : [];

    return new Response(JSON.stringify({ observations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meal-week-insight:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error', observations: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
