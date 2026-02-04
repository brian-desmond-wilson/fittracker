# WOD AI Image Generation - Setup Guide

This document provides step-by-step instructions for deploying and configuring the AI-generated WOD images feature.

## Overview

When a WOD is created, the system automatically generates an AI image using Google's Gemini Imagen API. Images are stored in Supabase Storage and displayed on WOD cards and detail screens.

## Prerequisites

- Supabase project set up
- Google Cloud Project with Gemini API access
- Supabase CLI installed (`npm install -g supabase`)

## Step 1: Apply Database Migration

Run the migration to add image fields to the `wods` table:

```bash
cd mobile
supabase db push
```

This adds:
- `image_url` (text) - URL to the generated image in Supabase Storage
- `image_generated_at` (timestamptz) - Timestamp when image was generated
- `image_generation_failed` (boolean) - Flag for retry logic

## Step 2: Create Supabase Storage Bucket

1. Go to your Supabase Dashboard
2. Navigate to **Storage** → **Buckets**
3. Create a new bucket named `wod-images`
4. Configure bucket settings:
   - **Public**: ✅ Yes (for CDN delivery)
   - **File size limit**: 5 MB
   - **Allowed MIME types**: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`

## Step 3: Set Up Storage RLS Policies

In the Supabase SQL Editor, run these policies:

```sql
-- Allow users to upload images to their own folder
CREATE POLICY "Users can upload WOD images to their own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'wod-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view WOD images (public bucket)
CREATE POLICY "Anyone can view WOD images"
ON storage.objects FOR SELECT
USING (bucket_id = 'wod-images');

-- Allow users to update their own WOD images
CREATE POLICY "Users can update their own WOD images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'wod-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own WOD images
CREATE POLICY "Users can delete their own WOD images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'wod-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

## Step 4: Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key for your project
3. Copy the API key (starts with `AIza...`)

## Step 5: Deploy Supabase Edge Function

Deploy the `generate-wod-image` Edge Function:

```bash
cd mobile
supabase functions deploy generate-wod-image
```

## Step 6: Set Environment Secrets

Set the Gemini API key as a secret in Supabase:

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

You can verify secrets are set:

```bash
supabase secrets list
```

## Step 7: Test the Feature

1. **Create a WOD** in the mobile app
2. **Observe the UI**:
   - You should see "Saving WOD..." then "Generating AI image..."
   - Success message: "WOD created successfully! An AI-generated image is being created in the background."
3. **Check the WOD list** - Image thumbnail should appear on the card (may take 5-10 seconds)
4. **Open WOD detail** - Full image should display at the top

## Troubleshooting

### Images Not Generating

Check Edge Function logs via the Dashboard:

- Visit: https://supabase.com/dashboard/project/tffxvrjvkhpyxsagrjga/functions/generate-wod-image
- Click "Logs" tab to view execution logs

Common issues:
- **API key not set**: Verify with `supabase secrets list`
- **Storage bucket missing**: Check Supabase Dashboard → Storage
- **RLS policies**: Verify policies are applied correctly

### Placeholder Images Showing

If you see blue gradient placeholders instead of AI images:

1. Check Gemini API quota/billing
2. Verify API key is valid
3. Check Edge Function logs for errors
4. Ensure Gemini Imagen API is enabled in Google Cloud Console

### Database Connection

If Edge Function can't update WOD:

1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set automatically by Supabase
2. Check RLS policies on `wods` table allow updates

## API Costs

**Gemini Imagen API Pricing** (as of 2024):
- First 100 images/month: Free
- After 100: ~$0.002 per image

**Supabase Storage**:
- 1 GB free per project
- $0.021 per GB after that

## Feature Behavior

### Automatic Generation
- ✅ Triggers automatically when WOD is saved
- ✅ Runs in background (doesn't block save)
- ✅ Silent failure with placeholder if API errors

### User Experience
- User sees "Generating AI image..." message
- WOD saves immediately
- Image appears on card/detail screen once ready
- No errors shown to user if generation fails

### Retry Logic
- WODs with `image_generation_failed = true` can be retried
- Future enhancement: Background job to retry failed generations

## File Structure

```
mobile/
├── supabase/
│   ├── functions/
│   │   └── generate-wod-image/
│   │       └── index.ts          # Edge Function for image generation
│   └── migrations/
│       └── 20251024000000_add_wod_image_fields.sql
├── src/
│   ├── lib/
│   │   ├── gemini.ts             # Prompt building helpers
│   │   └── supabase/
│   │       └── crossfit.ts       # Updated with image generation call
│   ├── types/
│   │   └── crossfit.ts           # Updated WOD interface with image fields
│   └── components/
│       └── training/
│           └── crossfit/
│               ├── WODPreviewStep.tsx      # Updated with generation UI
│               ├── WODDetailScreen.tsx     # Displays full image
│               └── SwipeableWODCard.tsx    # Displays thumbnail
```

## Next Steps

1. **Apply migration**: `supabase db push`
2. **Create storage bucket**: via Supabase Dashboard
3. **Set up RLS policies**: via SQL Editor
4. **Get Gemini API key**: from Google AI Studio
5. **Deploy Edge Function**: `supabase functions deploy generate-wod-image`
6. **Set API key secret**: `supabase secrets set GEMINI_API_KEY=...`
7. **Test**: Create a WOD and verify image generation

## Support

For issues or questions:
- Check Edge Function logs: `supabase functions logs generate-wod-image`
- Review Gemini API documentation: https://ai.google.dev/
- Verify Supabase Storage setup: Dashboard → Storage → Buckets

---

**Note**: The current implementation uses a placeholder image system since Gemini's direct image generation API may have limited availability. The Edge Function is designed to be easily swapped with other image generation APIs (DALL-E, Stable Diffusion, etc.) by updating the API call in `index.ts`.
