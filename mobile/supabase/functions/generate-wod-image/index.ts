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
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inline_data?: {
          mime_type: string;
          data: string; // base64 encoded image
        };
      }>;
    };
  }>;
}

// Helper function to mark WOD image generation as failed
async function markImageGenerationFailed(
  supabaseUrl: string,
  supabaseServiceKey: string,
  wodId: string,
  userId: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await supabase
    .from('wods')
    .update({
      image_generation_failed: true,
    })
    .eq('id', wodId)
    .eq('user_id', userId);
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
      console.error('GEMINI_API_KEY not configured - skipping image generation');
      return new Response(
        JSON.stringify({ success: false, error: 'API key not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    // Use Gemini 2.5 Flash Image API for image generation
    // Model: gemini-2.5-flash-image (aka Nano Banana)
    const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

    const geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          response_modalities: ['IMAGE'],
          image_config: {
            aspect_ratio: '1:1',  // Square image for WOD cards
          }
        }
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);

      // Mark generation as failed - no placeholder image
      await markImageGenerationFailed(supabaseUrl, supabaseServiceKey, wodId, userId);

      return new Response(
        JSON.stringify({
          success: false,
          error: `Gemini API error: ${geminiResponse.status}`,
          message: 'Image generation failed'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini response:', JSON.stringify(geminiData, null, 2));

    // Extract image data from Gemini 2.5 Flash Image response
    // Response format: { candidates: [{ content: { parts: [{ inline_data: { mime_type, data } }] } }] }
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      throw new Error('No images generated by Gemini');
    }

    const imagePart = geminiData.candidates[0]?.content?.parts?.find(
      (part: any) => part.inline_data
    );

    if (!imagePart || !imagePart.inline_data) {
      throw new Error('No inline image data in Gemini response');
    }

    const imageBase64 = imagePart.inline_data.data;
    const mimeType = imagePart.inline_data.mime_type || 'image/png';

    console.log('Image mime type:', mimeType);
    const imageBuffer = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

    // Upload to Supabase Storage and update WOD
    const publicUrl = await uploadAndUpdateWOD(
      supabaseUrl,
      supabaseServiceKey,
      userId,
      wodId,
      imageBuffer,
      mimeType
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

    // Try to mark as failed if we have the necessary info
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const body = await req.clone().json();

      if (supabaseUrl && supabaseServiceKey && body.wodId && body.userId) {
        await markImageGenerationFailed(supabaseUrl, supabaseServiceKey, body.wodId, body.userId);
      }
    } catch (markError) {
      console.error('Failed to mark image generation as failed:', markError);
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to generate image',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
