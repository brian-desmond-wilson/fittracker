// Legacy entry point, kept so nothing breaks while callers move to
// enrich-exercise: same request ({ exerciseId, userId }) and response
// ({ success, imageUrl, exerciseId }) as before. The prompt and the Gemini
// call live in _shared/exerciseImage.ts now; this file only reads the
// request, runs the shared generator and records the URL with model
// provenance through enrich_fill (forced: a tap here is the one permitted
// overwrite, and the stamp merges so no other field's provenance is lost).
// The mobile wrapper stops calling this in Task 7 of the catalog-enrichment
// plan; it can be deleted once nothing else does.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndStoreImage, ImageGenerationError } from '../_shared/exerciseImage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not configured');
      return json({ success: false, error: 'API key not configured' });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase credentials not configured');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { exerciseId, userId } = await req.json();
    if (!exerciseId || !userId) {
      return json({ error: 'Missing required fields: exerciseId, userId' }, 400);
    }

    let publicUrl: string;
    try {
      publicUrl = await generateAndStoreImage(supabase, String(exerciseId), { geminiApiKey, discipline: null });
    } catch (e) {
      if (e instanceof Error && e.message === 'Exercise not found') return json({ error: 'Exercise not found' }, 404);
      if (e instanceof ImageGenerationError && e.message.startsWith('Gemini API error')) {
        console.error(e.message);
        return json({ success: false, error: e.message.split(' ').slice(0, 4).join(' ') });
      }
      throw e;
    }

    // One conditional statement in the database, never a read-modify-write
    // of the provenance object from here: the stamp is merged server-side.
    const { error: updateError } = await supabase.rpc('enrich_fill', {
      p_id: String(exerciseId), p_field: 'image_url', p_value: publicUrl, p_by: 'model', p_force: true,
    });
    if (updateError) {
      console.error('Database update error:', updateError);
      return json({ success: false, error: 'Database update error', imageUrl: publicUrl, exerciseId });
    }

    return json({ success: true, imageUrl: publicUrl, exerciseId });
  } catch (error) {
    console.error('Error in generate-exercise-image function:', error);
    return json({ error: error instanceof Error ? error.message : 'Failed to generate image', success: false }, 500);
  }
});
