// Read a Nutrition Facts panel off a photograph.
//
// Distinct from `inventory-capture`, which reads GROCERIES off a shelf or a
// receipt. This reads the regulated panel on the back of one packet, and the
// difference matters: the panel is a fixed layout with fixed field names, so
// the model's job is transcription, not identification. It is told to return
// null for anything it cannot actually read rather than infer a plausible
// figure — a nutrition panel is the one artifact people read literally, and a
// hallucinated sodium value would flow into the day's targets as fact.
//
// Never writes. It returns what it read; the edit form fills its fields and
// the human presses Save.
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
const MODEL = "gpt-5.6-terra"; // vision + judgment tier

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You transcribe US Nutrition Facts panels from photographs.

Return ONLY what is legibly printed on the panel. Rules:
- Every figure must be read off the label. If a value is cut off, blurred,
  covered, or simply absent from this panel, return null for it. Never infer a
  value from the food type, from another figure, or from a typical product.
- "serving_size" is the text beside "Serving size", verbatim, including the
  parenthetical weight if printed: "1 bowl (210g)", "2 tbsp (32g)".
- "calories" is the large number beside "Calories", per serving.
- protein/carbs/fats/sugars/fiber/saturated_fat are grams per serving as
  printed. fats means "Total Fat"; saturated_fat means the "Saturated Fat"
  sub-row beneath it, NOT "Trans Fat" and not the two added together; carbs
  means "Total Carbohydrate"; sugars means "Total Sugars"; fiber means
  "Dietary Fiber" (not "Soluble Fiber" or "Insoluble Fiber", which are
  sub-rows some panels print beneath it).
- "sodium" is MILLIGRAMS per serving, the number printed beside "Sodium".
  Return the milligram figure, never the % Daily Value beside it, and never a
  gram conversion.
- If the panel shows two columns (per serving / per container), read the PER
  SERVING column.
- If the image is not a Nutrition Facts panel at all, set "found" to false and
  every field to null.

Respond as JSON:
{"found": boolean, "serving_size": string|null, "calories": number|null,
 "protein": number|null, "carbs": number|null, "fats": number|null,
 "sugars": number|null, "fiber": number|null, "saturated_fat": number|null,
 "sodium": number|null, "note": string|null}

"note" is a short human sentence only when something is worth flagging —
"the fat row is cut off", "this looks like an ingredients list". Otherwise null.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const { imageBase64 } = await req.json();
    if (!imageBase64) throw new Error("imageBase64 is required");

    // Auth is enforced by verify_jwt on the function; this call reads nothing
    // from the database and writes nothing to it, so no client is needed
    // beyond confirming the caller is who the gateway says they are.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) throw new Error("missing Authorization header");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this Nutrition Facts panel." },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
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
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    // Coerce defensively: the form writes these straight into numeric columns,
    // and a model returning "310 kcal" as a string would poison the field.
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : Number.parseFloat(String(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    return new Response(
      JSON.stringify({
        found: parsed.found === true,
        servingSize: typeof parsed.serving_size === "string" ? parsed.serving_size : null,
        calories: num(parsed.calories),
        protein: num(parsed.protein),
        carbs: num(parsed.carbs),
        fats: num(parsed.fats),
        sugars: num(parsed.sugars),
        fiber: num(parsed.fiber),
        saturatedFat: num(parsed.saturated_fat),
        sodium: num(parsed.sodium),
        note: typeof parsed.note === "string" ? parsed.note : null,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("nutrition-label:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
