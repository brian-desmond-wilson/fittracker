// Read a delivery menu off a photograph (E4).
//
// A delivery is entered by hand off the lid: eight meals, each with a name, a
// slot and three numbers, twice a week. The vendor prints all of it on the
// packing slip or the menu card that comes in the box.
//
// Doctrine, the same as the Nutrition Facts reader this is modelled on:
// - Transcription, never inference. Every field must be legibly printed. A
//   figure that is cut off, blurred or absent comes back null, and a null
//   simply leaves that box empty in the form for a human to fill.
// - It reads a PHOTOGRAPH the owner took. It does not visit the vendor's
//   site, sign in anywhere, or fetch anything.
// - It writes nothing. The output prefills a form the owner reviews and
//   saves; the delivery is still written by their tap.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';

const SYSTEM = `You transcribe a prepared-meal delivery menu from a photograph.

Return ONLY what is legibly printed. Rules:
- Every meal you list must appear in the image. Never invent a dish, and
  never complete a partially visible one from what it looks like it might be.
- "name" is the dish name as printed, without the vendor's name.
- "slot" is one of breakfast, lunch, dinner, snack — taken from how the menu
  labels the dish. If the menu does not say, use null; do not guess from the
  food.
- calories, protein and fiber are per meal, as printed. Any that is not
  shown is null. Never derive one from another or from the food type.
- "quantity" is how many of that dish the box contains, if the menu says so;
  otherwise null.
- If the image is not a food menu at all, return an empty meals array and
  explain in "note".

Respond as JSON:
{"meals": [{"name": string, "slot": string|null, "quantity": number|null,
 "calories": number|null, "protein": number|null, "fiber": number|null}],
 "note": string|null}

"note" is one short human sentence only when something is worth flagging —
"the third dish is cut off", "this looks like a receipt". Otherwise null.`;

const SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
    if (!req.headers.get('Authorization')) throw new Error('missing Authorization header');

    const { imageBase64 } = await req.json();
    if (!imageBase64) throw new Error('imageBase64 is required');

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
            content: [
              { type: 'text', text: 'Transcribe this delivery menu.' },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
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

    // Coerce defensively: these values land in numeric form fields, and a
    // model returning "440 cal" as a string would poison one.
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const meals = (Array.isArray(parsed.meals) ? parsed.meals : [])
      .map((m: Record<string, unknown>) => ({
        name: typeof m.name === 'string' ? m.name.trim() : '',
        // An unrecognised slot becomes null rather than a default: the form
        // shows lunch as its own default, and silently relabelling a
        // breakfast is worse than leaving the owner to pick.
        slot: typeof m.slot === 'string' && SLOTS.has(m.slot) ? m.slot : null,
        quantity: num(m.quantity),
        calories: num(m.calories),
        protein: num(m.protein),
        fiber: num(m.fiber),
      }))
      .filter((m: { name: string }) => m.name.length > 0)
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        meals,
        note: typeof parsed.note === 'string' ? parsed.note : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('delivery-menu:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error', meals: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
