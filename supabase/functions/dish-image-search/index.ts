// Find a picture of a dish on the web, and keep the one that gets chosen.
//
// A delivered meal's photo drives recognition all over the loop — the box
// card, the inventory grid, the library — but nobody photographs eight lids
// while unpacking a box. The vendor has already photographed every dish; this
// searches for that picture.
//
// Two actions, deliberately split around the moment of choice:
//
//   search  { query, vendor }   → candidate thumbnails from Google image
//                                 search, scoped by the vendor's name. Shown,
//                                 never stored: a candidate is a suggestion.
//   pick    { imageUrl, name }  → the chosen image, downloaded HERE and
//                                 re-uploaded to the app's own bucket. The
//                                 public URL of that copy is what gets saved.
//
// Re-hosting on pick is the load-bearing decision. A hot-linked search result
// is a claim about someone else's server staying up: vendors redesign their
// sites, CDNs expire signed URLs, and the inventory would quietly shed its
// pictures. The copy also means the app never re-fetches from the source —
// one download, at the moment of choice, and never again.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_KEY = Deno.env.get('GOOGLE_SEARCH_API_KEY');
const GOOGLE_CX = Deno.env.get('GOOGLE_SEARCH_CX');

/** The bucket every food and meal photograph lives in — the same one
 *  `imageUpload.ts` writes camera shots into, under the same per-user folder,
 *  so a picked web image and a photographed lid are indistinguishable to
 *  everything downstream. */
const BUCKET = 'food-inventory';

interface Candidate {
  /** Small, fast, for the strip the user picks from. */
  thumbUrl: string;
  /** Full-size, what `pick` downloads if this one is chosen. */
  imageUrl: string;
  /** The page the image came from, for nothing but honesty in the UI. */
  sourcePage: string | null;
}

/**
 * Fetch the picture, with a second address to fall back on.
 *
 * Three things make a straight fetch of a search result unreliable, and all
 * three are about who is asking rather than what is being asked for:
 *
 *   1. Plenty of publishers refuse anything that does not look like a browser
 *      — a self-identifying bot UA gets a 403 from most CDN edge rules.
 *   2. Some serve a picture only to requests that appear to come from their
 *      own page, which is what the Referer is for.
 *   3. Some answer 200 with a PAGE — an anti-hotlinking redirect to the
 *      product listing, or a bot-check interstitial. This is the common one,
 *      and it is why "did the fetch succeed" is the wrong question: the status
 *      is fine and the bytes are HTML.
 *
 * So a response only counts if it IS an image, and anything else — refused,
 * unreachable, or a page wearing a 200 — falls through to the thumbnail. That
 * lives on the search engine's own CDN, which exists to be fetched.
 *
 * The body is read here rather than by the caller because the content type is
 * not always honest either: a lazy server sends `application/octet-stream` for
 * a real JPEG, so the first bytes get the final say.
 */
interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
  from: 'source' | 'thumbnail';
}

/** JPEG, PNG, GIF, WebP and BMP by their first bytes. What a file says it is
 *  matters less than what it starts with. */
function sniffImageType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return null;
}

async function fetchOne(target: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };
  try {
    headers.Referer = new URL(target).origin + '/';
  } catch {
    // An unparseable URL fails the fetch below on its own terms.
  }

  const res = await fetch(target, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`refused (${res.status})`);

  const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error('empty response');
  // 8 MB cap: a picked photo decorates a list row, and anything bigger is a
  // wallpaper, not a product shot. Also bounds what a hostile URL can cost.
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('image too large');

  const sniffed = sniffImageType(bytes);
  if (sniffed) return { bytes, contentType: sniffed };
  if (declared.startsWith('image/')) return { bytes, contentType: declared };
  throw new Error(`returned ${declared || 'unknown content'}, not an image`);
}

async function fetchImage(imageUrl: string, fallbackUrl: string): Promise<FetchedImage> {
  let firstProblem = 'unreachable';
  try {
    const got = await fetchOne(imageUrl);
    return { ...got, from: 'source' };
  } catch (e) {
    firstProblem = e instanceof Error ? e.message : String(e);
    console.error('source image fetch failed:', firstProblem);
  }

  if (fallbackUrl && /^https?:\/\//.test(fallbackUrl) && fallbackUrl !== imageUrl) {
    try {
      const got = await fetchOne(fallbackUrl);
      return { ...got, from: 'thumbnail' };
    } catch (e) {
      const second = e instanceof Error ? e.message : String(e);
      throw new Error(`the publisher ${firstProblem}, and the preview ${second}`);
    }
  }

  throw new Error(`that address ${firstProblem}`);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('missing Authorization header');

    const body = await req.json();
    const action = body.action === 'pick' ? 'pick' : 'search';

    if (action === 'search') {
      if (!GOOGLE_KEY || !GOOGLE_CX) {
        // A named, catchable condition rather than a bare 500: the client
        // shows "search isn't set up" instead of "something went wrong".
        return json({ error: 'image search is not configured', configured: false }, 501);
      }
      const query = String(body.query ?? '').trim();
      if (!query) throw new Error('query is required');
      const vendor = String(body.vendor ?? '').trim();

      // The vendor's name in the query is what turns "chicken salad" from a
      // recipe hunt into a product lookup. Their dish pages dominate the
      // first results when the brand is present.
      const q = vendor ? `${vendor} ${query}` : query;

      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', GOOGLE_KEY);
      url.searchParams.set('cx', GOOGLE_CX);
      url.searchParams.set('q', q);
      url.searchParams.set('searchType', 'image');
      url.searchParams.set('num', '8');
      url.searchParams.set('safe', 'active');
      // Square-ish product shots suit a square image well better than banners.
      url.searchParams.set('imgSize', 'large');
      // Photographs only. Without this the top results for a brand query are
      // the brand's furniture — logos, app badges, social share cards — none
      // of which is a picture of food.
      url.searchParams.set('imgType', 'photo');

      const res = await fetch(url);
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`google search ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      const candidates: Candidate[] = (Array.isArray(data.items) ? data.items : [])
        .map((item: Record<string, any>) => ({
          thumbUrl: item.image?.thumbnailLink ?? item.link ?? '',
          imageUrl: item.link ?? '',
          sourcePage: item.image?.contextLink ?? null,
        }))
        .filter((c: Candidate) => c.imageUrl !== '');

      return json({ candidates, configured: true });
    }

    // ---- pick: download the chosen image and keep our own copy ----

    const imageUrl = String(body.imageUrl ?? '').trim();
    // The thumbnail, when the caller has one. See `fetchImage` below.
    const fallbackUrl = String(body.fallbackUrl ?? '').trim();
    const name = String(body.name ?? 'dish').trim() || 'dish';
    if (!/^https?:\/\//.test(imageUrl)) throw new Error('imageUrl must be an http(s) URL');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // The storage write uses the service role, so WHO is writing has to be
    // established first — the path is scoped by the verified user id, never
    // by anything the client claims.
    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userError } = await anon.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );
    if (userError || !userData?.user) throw new Error('not authenticated');
    const userId = userData.user.id;

    // Validation, the size cap and the fallback all live in fetchImage: what
    // comes back here is bytes that ARE an image.
    const { bytes: buffer, contentType, from } = await fetchImage(imageUrl, fallbackUrl);

    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : contentType.includes('gif') ? 'gif'
      : 'jpg';
    // Same folder convention as the client's own uploader, so one cleanup
    // policy covers both.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dish';
    const filePath = `food-images/${userId}/${Date.now()}_${slug}.${ext}`;

    const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType, upsert: false });
    if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = service.storage.from(BUCKET).getPublicUrl(filePath);
    // `from` tells the caller whether it got the publisher's picture or the
    // search engine's smaller copy of it — the difference is visible on a
    // large tile, and a silent downgrade is the kind of thing that gets
    // noticed months later and blamed on the camera.
    return json({ imageUrl: publicUrl, from });
  } catch (e) {
    console.error('dish-image-search:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
