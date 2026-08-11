// Bulk capture (critique E5): photograph a fridge shelf, a pantry, or a
// receipt; a vision model extracts the groceries; the caller gets a DIFF
// against current inventory to confirm — the "audit in two minutes" answer
// to inventory data going stale.
//
// Doctrine:
// - The model extracts FOOD ITEMS ONLY, with conservative quantities (a
//   visible six-pack is 6; "some spinach" is 1). It never invents brands.
// - This function never writes inventory. It returns proposals; the client
//   applies only what the user confirms. Capture is a suggestion engine,
//   not an author — the confirmation step is what keeps the inventory the
//   user's own record.
// - Matching against existing rows is name-based and conservative: exact
//   (case-folded) name or containment either way = "update" proposal;
//   anything else = "new". Wrong merges corrupt stock, wrong "new" rows are
//   merely duplicates the user can decline — so under-matching wins again.
//
// Model: gpt-5.6-terra — vision + judgment tier (owner ruling 2026-08-11:
// luna for mechanical volume, terra for vision/judgment).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedItem {
  name: string;
  brand: string | null;
  quantity: number;
  unit: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    const body = await req.json();
    let userId: string;
    if (bearer === serviceKey) {
      if (!body.userId) {
        return new Response(JSON.stringify({ error: 'service-role calls must pass userId' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = body.userId;
    } else {
      const { data: userData, error: userErr } = await createClient(
        supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      ).auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = userData.user.id;
    }

    const imageBase64: string | undefined = body.imageBase64;
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const system = [
      'You read a photo of groceries — a fridge/pantry shelf or a store receipt —',
      'and list the FOOD AND DRINK items visible or listed. Rules:',
      '- Food and drink only: skip non-food receipt lines (tax, bags, soap).',
      '- name: the generic product name a shopper would say ("Whole Milk",',
      '  "Tortilla Chips"). brand: only if clearly visible/printed, else null.',
      '- quantity: count of discrete units you can actually see or the receipt',
      '  states. When unsure, 1. unit: "count" unless obviously servings.',
      '- Answer ONLY JSON: {"items":[{"name","brand","quantity","unit"}]}.',
      '- An empty photo or non-grocery image returns {"items":[]}.',
    ].join('\n');

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [{
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            }],
          },
        ],
      }),
    });
    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error('OpenAI error:', aiRes.status, detail);
      return new Response(JSON.stringify({ error: `model call failed (${aiRes.status})` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiRes.json();
    const extracted: ExtractedItem[] =
      JSON.parse(aiJson.choices[0].message.content).items ?? [];

    // Diff against the caller's current inventory.
    const { data: existing } = await admin
      .from('food_inventory')
      .select('id, name, brand')
      .eq('user_id', userId);
    const fold = (s: string) => s.trim().toLowerCase();
    const proposals = extracted
      .filter((e) => e.name && e.quantity > 0)
      .map((e) => {
        const match = (existing ?? []).find((x) => {
          const a = fold(x.name); const b = fold(e.name);
          return a === b || a.includes(b) || b.includes(a);
        });
        return {
          kind: match ? 'update' as const : 'new' as const,
          matchId: match?.id ?? null,
          matchName: match?.name ?? null,
          name: e.name,
          brand: e.brand,
          quantity: Math.max(1, Math.round(e.quantity)),
          unit: e.unit ?? 'count',
        };
      });

    return new Response(JSON.stringify({ proposals }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('inventory-capture error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
