// Resolve a shared social post, then read what it prescribes. Four actions:
//
//   resolve { url }  → { platform, posterHandle, captionText, thumbnailUrl,
//                        needsCaption }
//       TikTok: public oEmbed. Instagram: fetch the page and read OpenGraph
//       tags (best effort — IG's oEmbed requires a Graph API token we don't
//       have). Either way the thumbnail is downloaded HERE and rehosted to
//       the capture-thumbs bucket: a platform CDN URL is exactly the kind
//       that vanishes (same doctrine as dish-image-search).
//       If nothing usable comes back, needsCaption:true — the sheet asks the
//       user to paste the caption, and the capture still works.
//
//   summarize { caption, handle }  → { summary }
//       The one-line description on its own, for a workout captured before
//       the extraction learned to write one, or when the owner wants another.
//
//   extract { caption, handle, platform, library, muscles, equipment }
//       → the model's structured read of the post. The model may only use
//       muscle/equipment names and library ids given in the request; the
//       client re-validates all of it again (captureReview.ts).
//
//   classify { name, rounds, caption, rawProtocol, muscles, items }
//       → { tags }: the block roles, muscles, minutes, intensity and skill
//       the daily recommender selects on. Same vocabulary rule as extract;
//       the client re-validates against it (workoutTagValidate.ts).
//
// SUGGEST ONLY: no action here writes a row, ever. The one thing this
// function does own is the rehosted thumbnail, which is a file, not a row.
//
// Model: gpt-5.6-terra — judgement/vision tier, same split as the rest of the app.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';
const BUCKET = 'capture-thumbs';
const UA = 'Mozilla/5.0 (compatible; FitTracker/1.0)';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** A failure that came from OpenAI rather than from us, carrying its status so
 *  the caller can tell "retry later" from "stop". The backfill classifies a
 *  whole catalog in a row: flattened to one generic failure it re-hammers a
 *  rate limit, and repeats a doomed call N times on a bad key. */
class UpstreamError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`openai ${status}: ${detail.slice(0, 300)}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

type Platform = 'instagram' | 'tiktok' | 'other';

function detectPlatform(url: string): Platform {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // Exact domain or a true subdomain — a bare endsWith would also accept
    // lookalikes ("notinstagram.com") and hand them a server-side fetch.
    const isDomain = (h: string, domain: string) =>
      h === domain || h.endsWith(`.${domain}`);
    if (isDomain(host, 'instagram.com')) return 'instagram';
    if (isDomain(host, 'tiktok.com')) return 'tiktok';
    return 'other';
  } catch {
    return 'other';
  }
}

/** Decode the handful of HTML entities OG tag content actually contains. */
const decodeEntities = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

function ogTag(html: string, property: string): string | null {
  // content before property and property before content both occur in the wild.
  const a = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
  );
  const b = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i'),
  );
  const raw = a?.[1] ?? b?.[1] ?? null;
  return raw ? decodeEntities(raw) : null;
}

/** Download an image and keep our own copy. Returns the copy's public URL,
 *  or null — a missing thumbnail never fails a capture. */
async function rehostThumb(imageUrl: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) return null;

    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';
    const filePath = `${userId}/${Date.now()}.${ext}`;
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await service.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType, upsert: false });
    if (error) return null;
    return service.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
  } catch {
    return null;
  }
}

async function resolveTikTok(url: string) {
  const res = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const handle = typeof data.author_unique_id === 'string' && data.author_unique_id !== ''
    ? `@${data.author_unique_id}`
    : typeof data.author_name === 'string' && data.author_name !== ''
      ? data.author_name
      : null;
  return {
    posterHandle: handle,
    captionText: typeof data.title === 'string' && data.title.trim() !== '' ? data.title : null,
    thumbSource: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
  };
}

async function resolveInstagram(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const description = ogTag(html, 'og:description');
  const image = ogTag(html, 'og:image');
  // og:description looks like: `123 likes, 4 comments - handle on August 1,
  // 2026: "the caption"`. Both pieces are best-effort.
  let handle: string | null = null;
  let caption: string | null = null;
  if (description) {
    const m = description.match(/-\s*([A-Za-z0-9_.]+)\s+on\s+.*?:\s*"([\s\S]*)"?$/);
    if (m) {
      handle = `@${m[1]}`;
      caption = m[2]?.trim() || null;
    } else {
      caption = description;
    }
  }
  if (!caption && !image) return null;
  return { posterHandle: handle, captionText: caption, thumbSource: image };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('missing Authorization header');

    // Establish WHO is calling before any storage write — the thumb path is
    // scoped by the verified user id, never by anything the client claims.
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userError } = await anon.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );
    if (userError || !userData?.user) throw new Error('not authenticated');
    const userId = userData.user.id;

    const body = await req.json();

    if (body.action === 'resolve') {
      const url = String(body.url ?? '').trim();
      if (!/^https?:\/\//.test(url)) throw new Error('url must be an http(s) address');
      const platform = detectPlatform(url);

      const meta = platform === 'tiktok'
        ? await resolveTikTok(url)
        : platform === 'instagram'
          ? await resolveInstagram(url)
          : null;

      if (!meta || (!meta.captionText && !meta.posterHandle)) {
        return json({
          platform, posterHandle: meta?.posterHandle ?? null, captionText: null,
          thumbnailUrl: meta?.thumbSource ? await rehostThumb(meta.thumbSource, userId) : null,
          needsCaption: true,
        });
      }

      return json({
        platform,
        posterHandle: meta.posterHandle,
        captionText: meta.captionText,
        thumbnailUrl: meta.thumbSource ? await rehostThumb(meta.thumbSource, userId) : null,
        needsCaption: meta.captionText === null,
      });
    }

    // Just the one-line description, for a workout captured before the
    // extraction learned to write one — or when the owner wants a different
    // one. Suggest only: it returns text for a field the user still has to
    // save, and writes nothing itself.
    if (body.action === 'summarize') {
      if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
      const caption = String(body.caption ?? '').trim();
      if (!caption) throw new Error('caption is required');
      const handle = String(body.handle ?? '').trim();

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Write ONE sentence saying what this workout is, for
someone scanning a list of saved workouts. Name the equipment, the part of the
body or quality it trains, and the creator if the caption names them: "A
kettlebell full body strength session from Dr. Colin."

Do NOT restate the movements, the reps or the rounds — those are already on
the page. No hashtags, no calls to action, no marketing, no quoting the
caption back.

Respond as JSON: {"summary": string}`,
            },
            { role: 'user', content: `Poster: ${handle}\nCaption:\n${caption}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('empty model response');
      const parsed = JSON.parse(content);
      const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
      return json({ summary: summary === '' ? null : summary });
    }

    // Block-recommender tags for one captured workout. Suggest only: returns
    // tags the client validates (workoutTagValidate.ts) and saves itself.
    // Used at capture time, from the edit screen, and by the lazy backfill.
    if (body.action === 'classify') {
      if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
      const name = String(body.name ?? '').trim();
      if (!name) throw new Error('name is required');
      const rounds = String(body.rounds ?? '').trim();
      const caption = String(body.caption ?? '').trim();
      const rawProtocol = String(body.rawProtocol ?? '').trim();
      const muscles = (Array.isArray(body.muscles) ? body.muscles : []) as string[];
      // Without a vocabulary the model has nothing to name a primary muscle
      // from, and the validator rejects an answer with none — so an empty list
      // is a guaranteed-wasted model call. Fail before spending it.
      if (muscles.length === 0) throw new Error('muscles is required');
      const items = (Array.isArray(body.items) ? body.items : []) as {
        name?: string; sets?: number | null; reps?: string | null; duration?: string | null;
      }[];

      const SYSTEM = `You classify one saved workout for a daily session
recommender that assembles five-phase days: warmup -> mobility -> main ->
conditioning -> cooldown.

Rules:
- "block_roles": every phase this workout could serve, from exactly that
  vocabulary, lowercase. Multi-role is normal (a stretching routine serves
  mobility and cooldown). A loaded strength or metcon piece is "main"; short
  high-heart-rate finishers are "conditioning". NEVER empty — every workout
  serves at least one phase, and "main" is the answer when nothing else fits.
- "primary_muscles"/"secondary_muscles": use ONLY names from the provided
  muscle list, spelled exactly as they appear there. Primary = what the
  workout is for; secondary = what assists. Never put the same muscle in both.
  "primary_muscles" must NEVER be empty: when the caption is vague, or the
  workout is full-body, judge from the movement names and list the regions the
  work plainly loads.
- "est_minutes": how long one honest pass takes, INCLUDING the written rounds
  and sensible rests. A whole number between 1 and 240 — not a range, not a
  string. Rounds repeat the WHOLE movement list; a movement's own set count is
  its own, so never multiply the two together. Given a range of rounds
  ("3-4"), estimate the TOP of the range: the number must describe the full
  prescription as written, because the app trims rounds down from it and needs
  the two to agree.
- "intensity": low | moderate | high — systemic effort of the workout as
  written, not of its hardest movement.
- "skill_level": Beginner | Intermediate | Advanced — the technical demand of
  its hardest movement.

Respond as JSON:
{"block_roles": string[], "primary_muscles": string[],
 "secondary_muscles": string[], "est_minutes": number,
 "intensity": string, "skill_level": string}`;

      const movementLines = items
        .map((i) => [i.name, i.sets ? `${i.sets} sets` : null, i.reps, i.duration]
          .filter(Boolean).join(' · '))
        .filter((l) => l !== '')
        .join('\n');
      const user = [
        `Workout: ${name}`,
        rounds ? `Rounds: ${rounds}` : '',
        `Movements:\n${movementLines || '(none listed)'}`,
        rawProtocol ? `Prescription as written:\n${rawProtocol}` : '',
        caption ? `Original caption:\n${caption.slice(0, 2000)}` : '',
      ].filter((l) => l !== '')
        // Appended after the filter so this separator survives it.
        .concat('', `Allowed muscles: ${muscles.join(', ')}`)
        .join('\n');

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) throw new UpstreamError(res.status, await res.text());
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('empty model response');
      // Parsed only to fail fast; the client validates every field.
      return json({ tags: JSON.parse(content) });
    }

    if (body.action === 'extract') {
      if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
      const caption = String(body.caption ?? '').trim();
      if (!caption) throw new Error('caption is required');
      const handle = String(body.handle ?? '').trim() || 'unknown';
      const platform = String(body.platform ?? 'other');
      const library = (Array.isArray(body.library) ? body.library : []) as
        { id: string; name: string }[];
      const muscles = (Array.isArray(body.muscles) ? body.muscles : []) as string[];
      const equipment = (Array.isArray(body.equipment) ? body.equipment : []) as string[];

      const SYSTEM = `You index one social-media fitness post into a personal
exercise catalog. Read the caption and report what exercise(s) the post shows.

Rules:
- Muscle names: use ONLY names from the provided muscle list.
- Equipment: use ONLY names from the provided equipment list.
- If an exercise is the same movement as a library entry, set
  "library_match_id" to that entry's exact id; otherwise null. Same movement
  means same exercise — a variation (deficit, paused, banded) is NOT a match.
- "category": one of strength | conditioning | mobility | stretching | warmup | skill.
- "skill_level": Beginner | Intermediate | Advanced — how hard the movement is
  to perform correctly, not how hard the workout is.
- "post_type": "full_workout" only when the caption lays out multiple
  exercises with a prescription (sets/reps/rounds); then fill "workout" with
  one item per exercise, "exercise_index" pointing into your exercises array.
  Otherwise "single_exercise" and workout: null.
- Names in Title Case, the way a coach would say them. No hashtags.

RECORD THE PRESCRIPTION EXACTLY AS WRITTEN. You are transcribing, not
programming. In particular:
- "rounds" belongs to the WORKOUT: use it when the caption says to repeat the
  whole list ("REPEAT 3-4x rounds" -> rounds: "3-4"). Copy the range as
  written; never collapse "3-4" to a single number.
- "sets" belongs to an EXERCISE, and ONLY when the caption gives that exercise
  its own set count ("4x8 press"). If the repetition comes from rounds, sets
  MUST be null. Never convert rounds into sets — "8x Halos, repeat 3-4 rounds"
  is reps "8" with sets null and rounds "3-4". It is NOT 3 sets of 8.
- "reps" is a verbatim string: "8", "8R/8L", "21-15-9", "AMRAP". Do not
  normalise or average it.
- "weight" and "duration" are verbatim too: "24kg", "bodyweight", "2x24kg",
  "30-45s", "hold to failure". Null when unstated.
- Never fill a field the caption does not state. Null is the correct answer.
- "raw_protocol": copy the caption's prescription lines verbatim, newline
  separated, exactly as the creator wrote them.
- "summary": ONE sentence saying what this workout is, for someone scanning a
  list of saved workouts. Name the equipment, the part of the body or quality
  it trains, and the creator if the caption names them: "A kettlebell full
  body strength session from Dr. Colin." Do NOT restate the movements, the
  reps or the rounds — those are already on the page. No hashtags, no calls to
  action, no marketing ("crush your goals"), no quoting the caption back.

Respond as JSON:
{"post_type": "single_exercise" | "full_workout",
 "exercises": [{"name": string, "description": string | null,
   "category": string, "skill_level": string,
   "primary_muscles": string[], "secondary_muscles": string[],
   "equipment": string[], "library_match_id": string | null}],
 "workout": {"name": string, "rounds": string | null,
   "summary": string | null,
   "raw_protocol": string | null,
   "items": [{"exercise_index": number,
   "sets": number | null, "reps": string | null,
   "weight": string | null, "duration": string | null,
   "rest_seconds": number | null, "notes": string | null}]} | null}`;

      const user = [
        `Platform: ${platform}`,
        `Poster: ${handle}`,
        `Caption:\n${caption}`,
        ``,
        `Allowed muscles: ${muscles.join(', ')}`,
        `Allowed equipment: ${equipment.join(', ')}`,
        ``,
        `Library index (id · name):`,
        ...library.map((e) => `${e.id} · ${e.name}`),
      ].join('\n');

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
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('empty model response');
      // Parsed here only to fail fast on malformed JSON; the client
      // re-validates every field and id against its own vocabulary.
      return json({ extraction: JSON.parse(content) });
    }

    throw new Error(`unknown action: ${String(body.action)}`);
  } catch (e) {
    console.error('capture-post:', e);
    // An upstream failure answers with the upstream's own status, so a caller
    // looping over a catalog can back off on a 429 and give up on a bad key.
    // Ours stay 500: this function has no other status to confuse them with.
    const status = e instanceof UpstreamError && e.status >= 400 && e.status <= 599
      ? e.status
      : 500;
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, status);
  }
});
