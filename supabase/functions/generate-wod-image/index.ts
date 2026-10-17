// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper function to mark WOD image generation as failed
async function markImageGenerationFailed(supabaseUrl, supabaseServiceKey, wodId, userId) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  await supabase.from('wods').update({
    image_generation_failed: true
  }).eq('id', wodId).eq('user_id', userId);
}
// Helper function to upload image and update WOD
async function uploadAndUpdateWOD(supabaseUrl, supabaseServiceKey, userId, wodId, imageBuffer, contentType) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const fileName = `${userId}/${wodId}_${Date.now()}.${contentType === 'image/svg+xml' ? 'svg' : 'png'}`;
  const { data: uploadData, error: uploadError } = await supabase.storage.from('wod-images').upload(fileName, imageBuffer, {
    contentType,
    upsert: false
  });
  if (uploadError) {
    console.error('Upload error:', uploadError);
    throw new Error(`Failed to upload image: ${uploadError.message}`);
  }
  console.log('Image uploaded successfully:', uploadData.path);
  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from('wod-images').getPublicUrl(uploadData.path);
  // Update WOD record with image URL
  const { error: updateError } = await supabase.from('wods').update({
    image_url: publicUrl,
    image_generated_at: new Date().toISOString(),
    image_generation_failed: false
  }).eq('id', wodId).eq('user_id', userId);
  if (updateError) {
    console.error('Database update error:', updateError);
  // Don't throw - image is uploaded successfully
  }
  return publicUrl;
}
const MAX_PROMPT_CHARS = 4000;
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  // Known once the caller and WOD are verified; the catch below uses them to
  // mark the WOD failed (the request body can't be re-read there).
  let wodId = null;
  let userId = null;
  try {
    // Get Gemini API key from environment
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not configured - skipping image generation');
      return new Response(JSON.stringify({
        success: false,
        error: 'API key not configured'
      }), {
        status: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get Supabase credentials
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured');
    }
    const respond = (status: number, payload: unknown)=>new Response(JSON.stringify(payload), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    // Parse request body
    const body = await req.json();
    const prompt = body.prompt;
    if (!body.wodId || typeof prompt !== 'string' || !prompt) {
      return respond(400, {
        error: 'Missing required fields: wodId, prompt'
      });
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return respond(400, {
        error: `prompt exceeds ${MAX_PROMPT_CHARS} characters`
      });
    }
    // Resolve the caller from the JWT — never from the body. verify_jwt only
    // proves the caller holds the (public) anon key, and every write below
    // runs under the service role. The service-role key itself may act for a
    // named user (operational backfills), as in inventory-capture.
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    let callerId = null;
    if (bearer === supabaseServiceKey) {
      callerId = body.userId ?? null;
    } else {
      const { data: userData } = await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }).auth.getUser();
      callerId = userData?.user?.id ?? null;
    }
    if (!callerId) {
      return respond(401, {
        error: 'unauthorized'
      });
    }
    // The WOD must belong to the caller before any Gemini spend or upload.
    const { data: wod, error: wodError } = await createClient(supabaseUrl, supabaseServiceKey).from('wods').select('id').eq('id', body.wodId).eq('user_id', callerId).maybeSingle();
    if (wodError) throw new Error(`WOD lookup failed: ${wodError.message}`);
    if (!wod) {
      return respond(404, {
        error: 'WOD not found'
      });
    }
    wodId = wod.id;
    userId = callerId;
    console.log(`Generating image for WOD ${wodId} (prompt ${prompt.length} chars)...`);
    // Use Gemini 2.5 Flash Image API for image generation
    // Model: gemini-2.5-flash-image (aka Nano Banana)
    const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';
    const geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          response_modalities: [
            'IMAGE'
          ],
          image_config: {
            aspect_ratio: '1:1'
          }
        }
      })
    });
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      // Mark generation as failed - no placeholder image
      await markImageGenerationFailed(supabaseUrl, supabaseServiceKey, wodId, userId);
      return new Response(JSON.stringify({
        success: false,
        error: `Gemini API error: ${geminiResponse.status}`,
        message: 'Image generation failed'
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const geminiData = await geminiResponse.json();
    // Never log the response body: it carries the whole image as base64.
    // Extract image data from Gemini 2.5 Flash Image response
    // Response format: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
    // Note: Gemini uses camelCase (inlineData, mimeType) not snake_case
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      throw new Error('No images generated by Gemini');
    }
    const imagePart = geminiData.candidates[0]?.content?.parts?.find((part)=>part.inlineData || part.inline_data);
    if (!imagePart) {
      throw new Error('No inline image data in Gemini response');
    }
    // Support both camelCase (inlineData) and snake_case (inline_data)
    const inlineData = imagePart.inlineData || imagePart.inline_data;
    if (!inlineData) {
      throw new Error('No inline image data found');
    }
    const imageBase64 = inlineData.data;
    const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
    console.log(`Gemini image: ${mimeType}, ${imageBase64?.length ?? 0} base64 chars`);
    const imageBuffer = Uint8Array.from(atob(imageBase64), (c)=>c.charCodeAt(0));
    // Upload to Supabase Storage and update WOD
    const publicUrl = await uploadAndUpdateWOD(supabaseUrl, supabaseServiceKey, userId, wodId, imageBuffer, mimeType);
    console.log(`Image generation complete for WOD ${wodId}`);
    return new Response(JSON.stringify({
      success: true,
      imageUrl: publicUrl,
      wodId
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in generate-wod-image function:', error);
    // Try to mark as failed if we have the necessary info
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey && wodId && userId) {
        await markImageGenerationFailed(supabaseUrl, supabaseServiceKey, wodId, userId);
      }
    } catch (markError) {
      console.error('Failed to mark image generation as failed:', markError);
    }
    return new Response(JSON.stringify({
      error: error.message || 'Failed to generate image',
      success: false
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
