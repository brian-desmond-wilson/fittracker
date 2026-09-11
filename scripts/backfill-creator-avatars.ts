// Give every creator already in the library an avatar. Lists the distinct
// (platform, handle) pairs on captured_sources; for Instagram, reads the
// profile page from THIS machine (a home address, which Instagram serves —
// the edge runtime gets a login wall) and passes the picture links along;
// then asks capture-post's refresh-creator action for each, one second
// apart to be polite. Idempotent: the function skips anything fresh.
//
// Run from repo root:
//   deno run --allow-net --allow-read scripts/backfill-creator-avatars.ts
// Reads mobile/.env (EXPO_PUBLIC_SUPABASE_URL, SERVICE_ROLE).
import {
  instagramAvatarCandidates, normaliseHandle,
} from '../supabase/functions/capture-post/creatorAvatar.ts';

type Platform = 'instagram' | 'tiktok';

const envText = await Deno.readTextFile(new URL('../mobile/.env', import.meta.url));
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SERVICE_ROLE;
if (!BASE || !KEY) {
  console.error('mobile/.env needs EXPO_PUBLIC_SUPABASE_URL and SERVICE_ROLE');
  Deno.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const UA = 'Mozilla/5.0 (compatible; FitTracker/1.0)';

const list = await fetch(
  `${BASE}/rest/v1/captured_sources?select=platform,poster_handle&platform=in.(instagram,tiktok)&poster_handle=not.is.null`,
  { headers },
);
if (!list.ok) {
  console.error('list failed', list.status, await list.text());
  Deno.exit(1);
}
const rows = await list.json() as { platform: Platform; poster_handle: string }[];
const pairs = new Map<string, { platform: Platform; handle: string }>();
for (const r of rows) {
  const handle = normaliseHandle(r.poster_handle);
  if (handle) pairs.set(`${r.platform}:${handle}`, { platform: r.platform, handle });
}
console.log(`${pairs.size} creators`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ok = 0, none = 0;
for (const { platform, handle } of pairs.values()) {
  let candidates: string[] = [];
  if (platform === 'instagram') {
    try {
      const page = await fetch(`https://www.instagram.com/${handle}/`, { headers: { 'User-Agent': UA } });
      const onProfile = new URL(page.url).pathname.toLowerCase().startsWith(`/${handle}`);
      if (page.ok && onProfile) candidates = instagramAvatarCandidates(await page.text());
    } catch {
      // Stays empty: the row is stamped and retried tomorrow.
    }
  }
  const res = await fetch(`${BASE}/functions/v1/capture-post`, {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'refresh-creator', platform, handle, candidates }),
  });
  const body = await res.json().catch(() => ({})) as { avatarUrl?: string | null; error?: string };
  if (body.avatarUrl) ok++; else none++;
  const why = body.error ?? (candidates.length > 0 ? 'cdn refused' : 'no og:image');
  console.log(`${platform.padEnd(9)} ${handle.padEnd(24)} ${body.avatarUrl ? `ok    ${body.avatarUrl}` : `none  ${why}`}`);
  await sleep(1000);
}
console.log(`done: ${ok} with avatar, ${none} without`);
