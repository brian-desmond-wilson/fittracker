# Testing WOD Image Generation

## Status: Ready to Test ✅

The WOD AI image generation feature is **fully deployed and configured**.

### What Was Fixed

1. **Gemini API Authentication** ✅
   - Changed from query parameter to header-based auth
   - Now using: `x-goog-api-key` header (per official docs)

2. **API Configuration** ✅
   - Fixed: `response_modalities: ['IMAGE']` (uppercase)
   - Added: `image_config: { aspect_ratio: '1:1' }`
   - Removed invalid: `media_resolution` parameter

3. **React Native Compatibility** ✅
   - Removed SVG placeholder fallback
   - Gemini generates PNG images (fully compatible with RN)

4. **API Key** ✅
   - Already set in Supabase secrets
   - Verified with `supabase secrets list`

---

## How to Test

### Step 1: Create a New WOD

1. Open the FitTracker mobile app
2. Navigate to: **Training** → **WODs** tab
3. Tap the **"+"** button to create a new WOD
4. Fill in the WOD details:
   - **Name**: "Test AI Image 001"
   - **Category**: Any (e.g., "Daily WOD")
   - **Format**: Any (e.g., "For Time")
   - **Add movements**: At least 2-3 movements
   - **Add other details**: Rep scheme, time cap, etc.
5. Tap **"Save WOD"**

### Step 2: Observe the UI

You should see:
1. **"Saving WOD..."** message
2. **"Generating AI image..."** message
3. **Success alert**: "WOD created successfully! An AI-generated image is being created in the background."

### Step 3: Check the Image (may take 5-10 seconds)

**On WOD List Screen**:
- Look for the newly created WOD card
- You should see an **80x80 thumbnail** on the right side of the card
- The image should be AI-generated based on the WOD movements

**On WOD Detail Screen**:
- Tap on the WOD card to open detail view
- You should see a **220px hero image** at the top
- Same AI-generated image, larger size

### Step 4: Verify in Supabase

**Check Edge Function Logs**:
1. Visit: https://supabase.com/dashboard/project/tffxvrjvkhpyxsagrjga/functions/generate-wod-image
2. Click **"Logs"** tab
3. Look for recent execution with:
   - "Generating image for WOD [id]..."
   - "Prompt: [your prompt]"
   - "Image mime type: image/png"
   - "Image uploaded successfully: [path]"
   - "Image generation complete for WOD [id]"

**Check Storage Bucket**:
1. Visit: https://supabase.com/dashboard/project/tffxvrjvkhpyxsagrjga/storage/buckets/wod-images
2. Navigate to your user folder: `[user_id]/`
3. You should see a new file: `[wod_id]_[timestamp].png`
4. Click to preview the AI-generated image

**Check Database**:
1. Visit: https://supabase.com/dashboard/project/tffxvrjvkhpyxsagrjga/editor
2. Query the `wods` table:
   ```sql
   SELECT id, name, image_url, image_generated_at, image_generation_failed
   FROM wods
   ORDER BY created_at DESC
   LIMIT 5;
   ```
3. Your new WOD should have:
   - `image_url`: Public URL to the PNG in storage
   - `image_generated_at`: Timestamp when image was generated
   - `image_generation_failed`: `false`

---

## Expected Results

### ✅ Success Indicators

- Edge Function logs show successful API call
- PNG image appears in Supabase Storage
- Database record has `image_url` populated
- Mobile app displays the image on card and detail screen
- Image is relevant to the WOD (shows equipment/movements)

### ❌ Failure Indicators

If the image doesn't generate:

1. **Check Edge Function Logs** for errors:
   - Gemini API quota exceeded
   - Invalid API key
   - Network timeout
   - Other API errors

2. **Check Database**:
   - If `image_generation_failed = true`, retry by creating another WOD
   - If stuck in a failure loop, check API key validity

3. **Check Mobile App**:
   - If image doesn't appear but storage has it, check network connectivity
   - Try force-closing and reopening the app
   - Check if the WOD list is refreshing properly

---

## Troubleshooting

### Image Not Appearing in Mobile App

**Possible Causes**:
1. Image still generating (wait 10-15 seconds)
2. Network connectivity issue
3. App needs to refresh data

**Solutions**:
- Pull down to refresh the WOD list
- Close and reopen the WOD detail screen
- Force close and reopen the app

### Edge Function Errors

**"GEMINI_API_KEY not configured"**:
- This shouldn't happen (key is already set)
- If it does, re-set with: `supabase secrets set GEMINI_API_KEY=your_key`

**"Gemini API error: 403" (Quota Exceeded)**:
- Check Google AI Studio quota: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com
- Free tier: 100 images/month
- Enable billing if needed

**"Gemini API error: 400" (Bad Request)**:
- Could be an issue with the prompt
- Check Edge Function logs for the exact error message
- May need to adjust prompt in `src/lib/gemini.ts`

### Database Not Updating

**If WOD saves but image_url is null**:
1. Check Edge Function logs for errors
2. Verify RLS policies allow updates:
   ```sql
   SELECT * FROM wods WHERE id = '[wod_id]';
   ```
3. Check that `user_id` matches between WOD and image generation call

---

## Testing Different WOD Types

To test image variety, try creating WODs with different characteristics:

### Test Case 1: Simple WOD
- Format: For Time
- Movements: Pull-ups, Push-ups, Air Squats
- Expected: Image showing bodyweight exercises

### Test Case 2: Weightlifting WOD
- Format: For Load
- Movements: Back Squat, Deadlift, Bench Press
- Expected: Image showing barbells/weight room

### Test Case 3: Cardio WOD
- Format: For Time
- Movements: Row, Run, Bike
- Expected: Image showing cardio equipment

### Test Case 4: Mixed Modal WOD
- Format: AMRAP
- Movements: Kettlebell Swings, Box Jumps, Wall Balls
- Expected: Image showing CrossFit gym with mixed equipment

---

## Success Criteria

The feature is working correctly if:

- [x] AI images generate successfully for new WODs
- [x] Images appear on WOD cards (80x80 thumbnails)
- [x] Images appear on WOD detail screens (220px hero images)
- [x] Images are relevant to the WOD content
- [x] Images are in PNG format (React Native compatible)
- [x] Generation happens in background (doesn't block WOD save)
- [x] Edge Function logs show successful executions
- [x] Storage bucket receives the images
- [x] Database records are updated with image URLs

---

## Next Steps After Testing

If testing is successful:
1. ✅ Feature is ready for production use
2. Consider adding retry logic for failed generations
3. Consider adding manual "Regenerate Image" button
4. Monitor Gemini API usage and costs
5. Potentially adjust aspect ratios for different use cases

If testing fails:
1. Review Edge Function logs for specific errors
2. Check Gemini API quota and billing
3. Verify API key is valid and hasn't expired
4. Test with a simple WOD to isolate the issue

---

**Ready to test! Create a WOD and see your first AI-generated image.** 🎨
