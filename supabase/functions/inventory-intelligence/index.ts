// Inventory intelligence (critique E1 + E2): match grocery items to the
// EXISTING concept catalog and the EXISTING category taxonomy with an LLM,
// replacing the suffix-heuristic that can't even match "Rice".
//
// Contract:
//   POST { inventoryIds?: string[], savedFoodIds?: string[] }
//   → { results: [{ kind, id, name, concept, category, applied }] }
//
// Doctrine (mirrors the app's honesty rules):
// - The model NEVER invents catalog entries — it picks an id from the lists
//   we hand it, or null. Under-linking stays the honest failure mode.
// - High-confidence proposals are applied (link rows matched_by='ai';
//   category maps only added where the item has NONE — existing human
//   categorization is never overwritten here).
// - Low-confidence proposals are returned but NOT applied; the item stays in
//   FoodMatchingScreen's "Needs review", which remains the human override.
// - Owner-declined pairs are hard exclusions (see 20260731110000's review):
//   the model may not re-propose what the owner already rejected.
//
// Model: gpt-5.6-luna — high-volume tier; this is exactly the mechanical
// catalog-matching work it's priced for (owner ruling 2026-08-11).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Owner-reviewed declines (20260731110000_link_stocked_staples.sql): these
// pairs were considered and rejected by the owner; the matcher must not
// resurrect them. Names, not ids — stable across environments.
const DECLINED_PAIRS: Array<[string, string]> = [
  ['Oikos PRO', 'Greek Yogurt'],
  ['Chicken Crumbles with Mandu Sauce', 'Chicken Breast'],
  ['Strawberry Protein Shake', 'Protein Shakes'],
];

interface Proposal {
  key: string;
  conceptId: string | null;
  conceptConfidence: 'high' | 'low' | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryConfidence: 'high' | 'low' | null;
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

    // Resolve the caller. Two legal shapes:
    // 1. A user JWT (the app) — writes scope to that user's rows.
    // 2. The service-role key itself (operational backfills / agents), which
    //    must name the target user in the body — service-key holders already
    //    have full DB access, so this grants nothing new.
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

    const { inventoryIds = [], savedFoodIds = [] } = body;
    if (inventoryIds.length === 0 && savedFoodIds.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- Catalogs (the model may only pick from these) ----
    const [conceptsRes, categoriesRes, subcatsRes] = await Promise.all([
      admin.from('food_concepts').select('id, name'),
      admin.from('food_categories').select('id, name, slug'),
      admin.from('food_subcategories').select('id, name, category_id'),
    ]);
    const concepts = conceptsRes.data ?? [];
    // Pseudo-categories are navigation, not taxonomy — the model must not
    // file anything under them.
    const categories = (categoriesRes.data ?? []).filter(
      (c) => c.slug !== 'all-products' && c.slug !== 'out-of-stock',
    );
    const subcats = subcatsRes.data ?? [];

    // ---- Targets (ownership enforced) ----
    const [invRes, sfRes, linksRes] = await Promise.all([
      inventoryIds.length
        ? admin.from('food_inventory').select('id, name, brand, flavor, user_id').in('id', inventoryIds).eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      savedFoodIds.length
        ? admin.from('saved_foods').select('id, name, user_id').in('id', savedFoodIds).eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      admin.from('food_concept_links').select('saved_food_id, food_inventory_id').eq('user_id', userId),
    ]);
    const already = new Set(
      (linksRes.data ?? []).flatMap((l: { saved_food_id: string | null; food_inventory_id: string | null }) =>
        [l.saved_food_id, l.food_inventory_id].filter(Boolean) as string[]),
    );

    const catMapRes = inventoryIds.length
      ? await admin.from('food_inventory_category_map').select('food_inventory_id').in('food_inventory_id', inventoryIds)
      : { data: [] };
    const hasCategory = new Set((catMapRes.data ?? []).map((r: { food_inventory_id: string }) => r.food_inventory_id));

    // Link-need and category-need are INDEPENDENT: an item can carry a
    // concept link but no category (Bananas did exactly this in prod). An
    // inventory row stays a target if EITHER is missing; the apply step
    // below re-checks each independently.
    const invTargets = (invRes.data ?? []).filter(
      (r: { id: string }) => !already.has(r.id) || !hasCategory.has(r.id));
    const sfTargets = (sfRes.data ?? []).filter((r: { id: string }) => !already.has(r.id));

    const items = [
      ...invTargets.map((r: { id: string; name: string; brand: string | null; flavor: string | null }) => ({
        key: `inv:${r.id}`, name: r.name, brand: r.brand, flavor: r.flavor, kind: 'inventory',
      })),
      ...sfTargets.map((r: { id: string; name: string }) => ({
        key: `sf:${r.id}`, name: r.name, brand: null, flavor: null, kind: 'saved_food',
      })),
    ];
    if (items.length === 0) {
      return new Response(JSON.stringify({ results: [], note: 'all targets already linked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- The model call ----
    const system = [
      'You match grocery products to a fixed catalog. Rules:',
      '- conceptId MUST be an id from CONCEPTS, or null. A concept is a generic',
      '  ingredient identity ("Peanut Butter"), matched when the product IS that',
      '  ingredient — not when it merely contains it.',
      '- categoryId/subcategoryId MUST be ids from CATEGORIES/SUBCATEGORIES',
      '  (subcategory must belong to the category), or null.',
      '- confidence "high" only when a shopper would find the match obvious.',
      '- DECLINED lists pairs a human reviewed and rejected: never propose them.',
      '- Answer ONLY with JSON: {"proposals":[{"key","conceptId","conceptConfidence","categoryId","subcategoryId","categoryConfidence"}]}',
    ].join('\n');
    const user = JSON.stringify({
      CONCEPTS: concepts,
      CATEGORIES: categories.map((c) => ({
        id: c.id, name: c.name,
        subcategories: subcats.filter((s) => s.category_id === c.id).map((s) => ({ id: s.id, name: s.name })),
      })),
      DECLINED: DECLINED_PAIRS.map(([item, concept]) => ({ item, concept })),
      ITEMS: items.map(({ key, name, brand, flavor }) => ({ key, name, brand, flavor })),
    });

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
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
    const proposals: Proposal[] = JSON.parse(aiJson.choices[0].message.content).proposals ?? [];

    // ---- Validate + apply ----
    const conceptIds = new Set(concepts.map((c) => c.id));
    const conceptName = new Map(concepts.map((c) => [c.id, c.name]));
    const categoryIds = new Set(categories.map((c) => c.id));
    const subcatById = new Map(subcats.map((s) => [s.id, s]));
    const declined = new Set(DECLINED_PAIRS.map(([i, c]) => `${i}::${c}`));

    const results = [];
    for (const item of items) {
      const p = proposals.find((x) => x.key === item.key);
      const [kind, id] = item.key.split(':');
      const out: Record<string, unknown> = {
        kind, id, name: item.name,
        concept: null as unknown, category: null as unknown, applied: { link: false, category: false },
      };
      if (p) {
        // Concept link — only when the row doesn't already have one (a row
        // can be a target purely for categorization).
        if (p.conceptId && conceptIds.has(p.conceptId)
            && !already.has(id)
            && !declined.has(`${item.name}::${conceptName.get(p.conceptId)}`)) {
          out.concept = {
            id: p.conceptId, name: conceptName.get(p.conceptId), confidence: p.conceptConfidence,
          };
          if (p.conceptConfidence === 'high') {
            const row = kind === 'inv'
              ? { user_id: userId, concept_id: p.conceptId, food_inventory_id: id, matched_by: 'ai' }
              : { user_id: userId, concept_id: p.conceptId, saved_food_id: id, matched_by: 'ai' };
            const { error } = await admin.from('food_concept_links').insert(row);
            if (!error) (out.applied as Record<string, boolean>).link = true;
            else console.error('link insert failed:', error);
          }
        }
        // Category (inventory only; never overwrite an existing categorization)
        if (kind === 'inv' && p.categoryId && categoryIds.has(p.categoryId) && !hasCategory.has(id)) {
          const sub = p.subcategoryId ? subcatById.get(p.subcategoryId) : null;
          out.category = {
            id: p.categoryId, subcategoryId: sub?.category_id === p.categoryId ? p.subcategoryId : null,
            confidence: p.categoryConfidence,
          };
          if (p.categoryConfidence === 'high') {
            const { error } = await admin.from('food_inventory_category_map')
              .insert({ food_inventory_id: id, category_id: p.categoryId, user_id: userId });
            if (!error) {
              (out.applied as Record<string, boolean>).category = true;
              if (sub && sub.category_id === p.categoryId) {
                await admin.from('food_inventory_subcategory_map')
                  .insert({ food_inventory_id: id, subcategory_id: sub.id, user_id: userId });
              }
            } else console.error('category insert failed:', error);
          }
        }
      }
      results.push(out);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('inventory-intelligence error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
