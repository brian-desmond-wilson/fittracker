// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WODImageRequest {
  wodId: string;
  prompt: string;
  userId: string;
}

interface GeminiImageResponse {
  images?: Array<{
    image: string; // base64 encoded image
    mimeType?: string;
  }>;
}

// Helper function to create placeholder SVG
function createPlaceholderSvg(): string {
  return `
    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(10,132,255);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(99,102,241);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#grad)" />
      <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="48" font-family="Arial, sans-serif" font-weight="bold">
        CrossFit WOD
      </text>
    </svg>
  `;
}

// Helper function to upload image and update WOD
async function uploadAndUpdateWOD(
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
  wodId: string,
  imageBuffer: Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const fileName = `${userId}/${wodId}_${Date.now()}.${contentType === 'image/svg+xml' ? 'svg' : 'png'}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('wod-images')
    .upload(fileName, imageBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    throw new Error(`Failed to upload image: ${uploadError.message}`);
  }

  console.log('Image uploaded successfully:', uploadData.path);

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('wod-images')
    .getPublicUrl(uploadData.path);

  // Update WOD record with image URL
  const { error: updateError } = await supabase
    .from('wods')
    .update({
      image_url: publicUrl,
      image_generated_at: new Date().toISOString(),
      image_generation_failed: false,
    })
    .eq('id', wodId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('Database update error:', updateError);
    // Don't throw - image is uploaded successfully
  }

  return publicUrl;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Gemini API key from environment
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Get Supabase credentials
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured');
    }

    // Parse request body
    const { wodId, prompt, userId }: WODImageRequest = await req.json();

    if (!wodId || !prompt || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: wodId, prompt, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating image for WOD ${wodId}...`);
    console.log('Prompt:', prompt);

    //  Use Gemini's Imagen API for image generation
    // API endpoint: https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages
    const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages';

    const geminiResponse = await fetch(`${geminiEndpoint}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        number_of_images: 1,
        aspect_ratio: '1:1',
        safety_filter_level: 'block_some',
        person_generation: 'allow_adult',
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);

      // Fallback to placeholder on error
      console.log('Falling back to placeholder image due to API error');
      const placeholderSvg = createPlaceholderSvg();
      const imageBuffer = new TextEncoder().encode(placeholderSvg);

      await uploadAndUpdateWOD(supabaseUrl, supabaseServiceKey, userId, wodId, imageBuffer, 'image/svg+xml');

      return new Response(
        JSON.stringify({ success: true, message: 'Placeholder image generated', usedFallback: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();

    // Extract image data (base64 encoded)
    if (!geminiData.images || geminiData.images.length === 0) {
      throw new Error('No images generated by Gemini');
    }

    const imageBase64 = geminiData.images[0].image;
    const imageBuffer = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

    // Upload to Supabase Storage and update WOD
    const publicUrl = await uploadAndUpdateWOD(
      supabaseUrl,
      supabaseServiceKey,
      userId,
      wodId,
      imageBuffer,
      'image/png'
    );

    console.log(`Image generation complete for WOD ${wodId}`);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: publicUrl,
        wodId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-wod-image function:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to generate image',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
