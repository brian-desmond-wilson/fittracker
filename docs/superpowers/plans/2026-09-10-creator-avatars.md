# Creator Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every creator in the Workouts tab's Creator picker and on the captured-workout detail screen shows the avatar they use on Instagram or TikTok, fetched and rehosted at capture time, refreshed after 30 days, and backfilled for the 30 creators already in the library.

**Architecture:** A shared `public.creators` table keyed by `(platform, handle)` plus a public `creator-avatars` bucket. The `capture-post` edge function gains pure parsers (`creatorAvatar.ts`, Deno-tested), an `ensureCreatorAvatar` helper that runs inside `resolve` and behind a new `refresh-creator` action, and the service role may call that one action so a backfill script can drive it. The client loads the creators table alongside workouts, threads a handle→avatar map into the picker and detail screen, and renders through one `CreatorAvatar` component that falls back to the initial letter.

**Tech Stack:** Supabase (Postgres migration, Storage, Deno edge function, supabase-js), Expo / React Native, TypeScript, Jest (ts-jest, pure libs only), Deno test for the edge parsers.

**Spec:** `docs/superpowers/specs/2026-09-10-creator-avatars-design.md` — where this plan and the spec disagree, the spec wins.

**Repo conventions the implementer must know**
- Work on a branch, never on `main`: `git checkout -b creator-avatars` from repo root first.
- Commit per task with the message given; end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never open a PR.
- Jest runs from `mobile/` (`npm test`), is `ts-jest` with `roots: ["<rootDir>/src"]` and matches only `**/__tests__/**/*.test.ts`; it cannot import React Native, so component behaviour is tested through pure helpers.
- Typecheck: `cd mobile && npx tsc --noEmit`. Lint: `cd mobile && npm run lint`. The Supabase client is untyped, so tsc proves nothing about column names — check spellings against the migration by eye.
- Migrations are pushed with `npx supabase db push --yes` from `mobile/` (that is where the CLI is linked); edge functions deploy with `npx supabase functions deploy capture-post` from repo root.
- `mobile/.env` holds `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SERVICE_ROLE`. The repo-root `.env` is dead; never read it.
- Colours come from `@/src/theme/tokens` (`colors.surface2`, `colors.textMuted`, `colors.brand`) or the `@/src/lib/colors` shim (`colors.primary` = brand, `colors.mutedForeground` = textMuted). Do not add raw hex.

---

### Task 1: Migration — `creators` table and `creator-avatars` bucket

**Files:**
- Create: `supabase/migrations/20260917100000_creators.sql`

- [ ] **Step 1: Write the migration**

```sql
-- One row per social creator whose posts have been captured, shared by every
-- user: a creator is the same person for everyone, so one fetch and one image
-- serve the whole app. Written only by the capture-post edge function with
-- the service role; users read. Spec:
-- docs/superpowers/specs/2026-09-10-creator-avatars-design.md
CREATE TABLE IF NOT EXISTS public.creators (
  platform text NOT NULL
    CONSTRAINT creators_platform_check CHECK (platform IN ('instagram', 'tiktok')),
  -- Normalised: no leading @, lowercased, trimmed.
  handle text NOT NULL,
  -- Public URL of OUR rehosted copy in the creator-avatars bucket; never a
  -- platform CDN link. NULL when the last fetch found nothing.
  avatar_url text,
  -- When we last TRIED, successful or not: drives the 30-day refresh and
  -- stops a dead profile being fetched on every capture.
  avatar_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, handle)
);

COMMENT ON TABLE public.creators IS
  'Social creators whose posts have been captured. Shared across users; avatar rehosted in creator-avatars.';

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read creators"
  ON public.creators FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policy on purpose: the edge function writes with
-- the service role, which bypasses RLS.

-- Bucket for rehosted avatars. Path convention: {platform}/{handle}.{ext},
-- overwritten in place on refresh so the stored URL never changes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('creator-avatars', 'creator-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read creator avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'creator-avatars');
-- Writes happen only from the edge function via service role — no
-- authenticated INSERT/UPDATE/DELETE policy, same as capture-thumbs.
```

- [ ] **Step 2: Push it**

Run from `mobile/`:
```bash
npx supabase db push --yes
```
Expected: the new migration is listed and applied with no error.

- [ ] **Step 3: Verify the table and bucket exist**

Run from `mobile/`:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/creators?select=*" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"; echo; curl -s "$EXPO_PUBLIC_SUPABASE_URL/storage/v1/bucket/creator-avatars" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Expected: first line `[]`; second line a JSON object with `"id":"creator-avatars"` and `"public":true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260917100000_creators.sql
git commit -m "feat(db): creators table and creator-avatars bucket

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Pure avatar parsers for the edge function, Deno-tested

**Files:**
- Create: `supabase/functions/capture-post/creatorAvatar.ts`
- Create: `supabase/functions/capture-post/creatorAvatar.test.ts`

No Deno globals in the module: `index.ts` imports it, and the test runs it under `deno test`.

- [ ] **Step 1: Write the failing tests**

`supabase/functions/capture-post/creatorAvatar.test.ts`:
```ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  normaliseHandle, isAvatarStale, instagramAvatarCandidates, parseTikTokAvatar,
} from './creatorAvatar.ts';

Deno.test('normaliseHandle strips @, lowercases, trims', () => {
  assertEquals(normaliseHandle('@OnlineWOD '), 'onlinewod');
  assertEquals(normaliseHandle('  fit___dad'), 'fit___dad');
  assertEquals(normaliseHandle('@'), '');
  assertEquals(normaliseHandle(''), '');
});

Deno.test('isAvatarStale: null is stale, 29 days fresh, 31 days stale', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  assertEquals(isAvatarStale(null, now), true);
  assertEquals(isAvatarStale('2026-08-12T12:00:00Z', now), false);
  assertEquals(isAvatarStale('2026-08-10T12:00:00Z', now), true);
});

Deno.test('instagramAvatarCandidates: og:image first upgraded to 150, then as given', () => {
  const html = `<html><head>
    <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s100x100_tt6&amp;_nc_cat=107&amp;oh=00_AQJK&amp;oe=6AA95BEF" />
  </head></html>`;
  assertEquals(instagramAvatarCandidates(html), [
    'https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s150x150_tt6&_nc_cat=107&oh=00_AQJK&oe=6AA95BEF',
    'https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=107&oh=00_AQJK&oe=6AA95BEF',
  ]);
});

Deno.test('instagramAvatarCandidates: no size token → the one URL, no og:image → empty', () => {
  const html = `<meta property="og:image" content="https://x.test/a.jpg" />`;
  assertEquals(instagramAvatarCandidates(html), ['https://x.test/a.jpg']);
  assertEquals(instagramAvatarCandidates('<html></html>'), []);
});

Deno.test('parseTikTokAvatar unescapes the embedded JSON field', () => {
  const html = `{"user":{"avatarLarger":"https:\\u002F\\u002Fp16-sign.tiktokcdn-us.com\\u002Ftos\\u002Favt~c5_1080x1080.jpeg?x-expires=1&x-signature=a%2Fb"}}`;
  assertEquals(
    parseTikTokAvatar(html),
    'https://p16-sign.tiktokcdn-us.com/tos/avt~c5_1080x1080.jpeg?x-expires=1&x-signature=a%2Fb',
  );
  assertEquals(parseTikTokAvatar('<html></html>'), null);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run from repo root:
```bash
deno test supabase/functions/capture-post/creatorAvatar.test.ts
```
Expected: FAIL — module `./creatorAvatar.ts` not found.

- [ ] **Step 3: Write the module**

`supabase/functions/capture-post/creatorAvatar.ts`:
```ts
// Pure helpers behind creator avatars: how a handle is keyed, when a stored
// avatar is due a refresh, and where each platform's profile page hides the
// picture. No Deno globals, so `deno test` reaches every branch without a
// network. Fetching and rehosting stay in index.ts.

/** The key form of a handle: no @, lowercased, trimmed. Display keeps the @. */
export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').trim().toLowerCase();
}

export const AVATAR_MAX_AGE_DAYS = 30;

/** Null (never fetched) is stale; otherwise stale past 30 days. */
export function isAvatarStale(fetchedAt: string | null, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return true;
  return now.getTime() - then > AVATAR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** The handful of entities OG tag content actually contains. Same as
 *  index.ts's decodeEntities, copied so this module stays import-free. */
const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function ogImage(html: string): string | null {
  const a = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
  const b = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const raw = a?.[1] ?? b?.[1] ?? null;
  return raw ? decodeEntities(raw) : null;
}

/** Instagram's profile page carries the avatar as og:image at 100px. Try the
 *  150px variant first (the CDN's signed hash may reject the edit), then the
 *  URL as given. Empty when the page has no og:image. */
export function instagramAvatarCandidates(html: string): string[] {
  const url = ogImage(html);
  if (!url) return [];
  const upgraded = url.replace(/_s100x100/, '_s150x150');
  return upgraded === url ? [url] : [upgraded, url];
}

/** TikTok's profile page has no og:image; the avatar sits in an embedded JSON
 *  blob as "avatarLarger" with /-escaped slashes. */
export function parseTikTokAvatar(html: string): string | null {
  const m = html.match(/"avatarLarger":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    const url = JSON.parse(`"${m[1]}"`) as string;
    return /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
deno test supabase/functions/capture-post/creatorAvatar.test.ts
```
Expected: `ok | 5 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/capture-post/creatorAvatar.ts supabase/functions/capture-post/creatorAvatar.test.ts
git commit -m "feat(capture): pure creator-avatar parsers, Deno-tested

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Edge function — rehost, ensure, hook into resolve, `refresh-creator` action

**Files:**
- Modify: `supabase/functions/capture-post/index.ts`

- [ ] **Step 1: Update the header comment**

In the comment block at the top of `index.ts`, after the `classify` paragraph (ends `the client re-validates against it (workoutTagValidate.ts).`) and before the `SUGGEST ONLY` paragraph, add:

```
//
//   refresh-creator { platform, handle }
//       → { platform, handle, avatarUrl, avatarFetchedAt }
//       Fetch the creator's profile page, rehost their avatar to the
//       creator-avatars bucket and upsert public.creators — unless a row
//       fresher than 30 days exists. resolve does the same for the poster
//       it finds. The one caller allowed in with the service role (the
//       backfill script) may only call this action.
```

And change the `SUGGEST ONLY` paragraph to:

```
// SUGGEST ONLY: no action here writes a row the user owns. The things this
// function does own are the rehosted thumbnail (a file), and the shared
// creators table (a cache of public profile pictures, nobody's data).
```

- [ ] **Step 2: Add the import and bucket constant**

After `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';` add:
```ts
import {
  instagramAvatarCandidates, isAvatarStale, normaliseHandle, parseTikTokAvatar,
} from './creatorAvatar.ts';
```

After `const BUCKET = 'capture-thumbs';` add:
```ts
const AVATAR_BUCKET = 'creator-avatars';
```

- [ ] **Step 3: Add the rehost and ensure helpers**

Directly after the `rehostThumb` function (it ends with `  } catch {\n    return null;\n  }\n}`), add:

```ts
type AvatarPlatform = 'instagram' | 'tiktok';

const serviceClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Download the first candidate that is a real image and keep our own copy
 *  at a fixed path, overwriting on refresh so the stored URL never changes.
 *  Same guards as rehostThumb. Null when none of them worked. */
async function rehostAvatar(
  candidates: string[], platform: AvatarPlatform, handle: string,
): Promise<string | null> {
  for (const imageUrl of candidates) {
    try {
      const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) continue;
      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) continue;
      const ext = contentType.includes('png') ? 'png'
        : contentType.includes('webp') ? 'webp'
        : 'jpg';
      const filePath = `${platform}/${handle}.${ext}`;
      const service = serviceClient();
      const { error } = await service.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, buffer, { contentType, upsert: true });
      if (error) continue;
      return service.storage.from(AVATAR_BUCKET).getPublicUrl(filePath).data.publicUrl;
    } catch {
      continue;
    }
  }
  return null;
}

interface CreatorRow {
  platform: AvatarPlatform;
  handle: string;
  avatar_url: string | null;
  avatar_fetched_at: string | null;
}

/** Make sure public.creators has a fresh avatar for this creator. Never
 *  throws, never blocks a capture on failure: a fetch that finds nothing
 *  still stamps avatar_fetched_at (so a dead profile is not hammered on
 *  every capture) and keeps whatever avatar_url was there before (so a
 *  transient failure does not blank a working picture). */
async function ensureCreatorAvatar(
  platform: AvatarPlatform, rawHandle: string,
): Promise<CreatorRow | null> {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  const service = serviceClient();
  try {
    const { data: existing } = await service
      .from('creators')
      .select('platform, handle, avatar_url, avatar_fetched_at')
      .eq('platform', platform)
      .eq('handle', handle)
      .maybeSingle();
    const row = (existing ?? null) as CreatorRow | null;
    if (row && !isAvatarStale(row.avatar_fetched_at)) return row;

    let candidates: string[] = [];
    const profileUrl = platform === 'instagram'
      ? `https://www.instagram.com/${handle}/`
      : `https://www.tiktok.com/@${handle}`;
    const res = await fetch(profileUrl, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const html = await res.text();
      candidates = platform === 'instagram'
        ? instagramAvatarCandidates(html)
        : (() => { const u = parseTikTokAvatar(html); return u ? [u] : []; })();
    }
    const rehosted = candidates.length > 0 ? await rehostAvatar(candidates, platform, handle) : null;

    const next: CreatorRow = {
      platform, handle,
      avatar_url: rehosted ?? row?.avatar_url ?? null,
      avatar_fetched_at: new Date().toISOString(),
    };
    const { error } = await service.from('creators').upsert(next, { onConflict: 'platform,handle' });
    if (error) return row;
    return next;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Let the service role call `refresh-creator`, and read the body first**

Replace this block inside `serve`:

```ts
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
```

with:

```ts
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('missing Authorization header');
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const body = await req.json();

    // The backfill script holds the service role, not a user session. It is
    // let in for the one action that touches nothing a user owns; every
    // other action still needs a real user.
    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && body.action === 'refresh-creator') {
      const platform = String(body.platform ?? '');
      if (platform !== 'instagram' && platform !== 'tiktok') throw new Error('platform must be instagram or tiktok');
      const row = await ensureCreatorAvatar(platform, String(body.handle ?? ''));
      return json({
        platform, handle: normaliseHandle(String(body.handle ?? '')),
        avatarUrl: row?.avatar_url ?? null, avatarFetchedAt: row?.avatar_fetched_at ?? null,
      });
    }

    // Establish WHO is calling before any storage write — the thumb path is
    // scoped by the verified user id, never by anything the client claims.
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData?.user) throw new Error('not authenticated');
    const userId = userData.user.id;
```

- [ ] **Step 5: Hook `resolve` and add the user-facing `refresh-creator` action**

In the `resolve` action, replace:

```ts
      const meta = platform === 'tiktok'
        ? await resolveTikTok(url)
        : platform === 'instagram'
          ? await resolveInstagram(url)
          : null;
```

with:

```ts
      const meta = platform === 'tiktok'
        ? await resolveTikTok(url)
        : platform === 'instagram'
          ? await resolveInstagram(url)
          : null;

      // The poster's avatar, kept fresh as a side effect of capturing. Awaited
      // rather than detached: the edge runtime may not finish work left
      // running after the response goes out. Costs nothing when fresh.
      if (meta?.posterHandle && (platform === 'instagram' || platform === 'tiktok')) {
        await ensureCreatorAvatar(platform, meta.posterHandle);
      }
```

Then, directly before the `summarize` action's comment block (`// Just the one-line description, ...`), add:

```ts
    if (body.action === 'refresh-creator') {
      const platform = String(body.platform ?? '');
      if (platform !== 'instagram' && platform !== 'tiktok') throw new Error('platform must be instagram or tiktok');
      const row = await ensureCreatorAvatar(platform, String(body.handle ?? ''));
      return json({
        platform, handle: normaliseHandle(String(body.handle ?? '')),
        avatarUrl: row?.avatar_url ?? null, avatarFetchedAt: row?.avatar_fetched_at ?? null,
      });
    }
```

- [ ] **Step 6: Type-check the function**

Run from repo root:
```bash
deno check supabase/functions/capture-post/index.ts
```
Expected: no errors. (If `deno check` complains about the remote std/esm imports needing `--allow-import`, add `--allow-import`.)

- [ ] **Step 7: Deploy**

Run from repo root:
```bash
npx supabase functions deploy capture-post
```
Expected: `Deployed Functions on project ...: capture-post`.

- [ ] **Step 8: Smoke it with the service role**

Run from `mobile/`:
```bash
set -a; . ./.env; set +a; curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/capture-post" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d '{"action":"refresh-creator","platform":"instagram","handle":"@onlinewod"}'
```
Expected: `{"platform":"instagram","handle":"onlinewod","avatarUrl":"https://.../storage/v1/object/public/creator-avatars/instagram/onlinewod.jpg","avatarFetchedAt":"2026-..."}`. Open the `avatarUrl` in a browser: the OnlineWOD logo. If `avatarUrl` is null, fetch `https://www.instagram.com/onlinewod/` with the function's UA from a terminal and check whether the page still carries `og:image` — Instagram sometimes serves a login wall to datacentre IPs; if so, note it in the task report and continue (the client falls back to the letter).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/capture-post/index.ts
git commit -m "feat(capture): fetch and rehost the poster's avatar; refresh-creator action

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Backfill script and run

**Files:**
- Create: `scripts/backfill-creator-avatars.mjs`

- [ ] **Step 1: Write the script**

```js
// Give every creator already in the library an avatar. Lists the distinct
// (platform, handle) pairs on captured_sources and asks capture-post's
// refresh-creator action for each, one second apart to be polite to the
// profile pages. Idempotent: anything fresher than 30 days is skipped by
// the function itself.
//
// Run from repo root: node scripts/backfill-creator-avatars.mjs
// Reads mobile/.env (EXPO_PUBLIC_SUPABASE_URL, SERVICE_ROLE).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(path.join(here, '..', 'mobile', '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SERVICE_ROLE;
if (!URL_ || !KEY) { console.error('mobile/.env needs EXPO_PUBLIC_SUPABASE_URL and SERVICE_ROLE'); process.exit(1); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const res = await fetch(
  `${URL_}/rest/v1/captured_sources?select=platform,poster_handle&platform=in.(instagram,tiktok)&poster_handle=not.is.null`,
  { headers },
);
if (!res.ok) { console.error('list failed', res.status, await res.text()); process.exit(1); }
const rows = await res.json();
const pairs = [...new Map(
  rows.map((r) => [`${r.platform}:${r.poster_handle.trim().replace(/^@+/, '').toLowerCase()}`, r]),
).values()];
console.log(`${pairs.length} creators`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, none = 0;
for (const { platform, poster_handle } of pairs) {
  const r = await fetch(`${URL_}/functions/v1/capture-post`, {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'refresh-creator', platform, handle: poster_handle }),
  });
  const body = await r.json().catch(() => ({}));
  const line = body.avatarUrl ? `ok    ${body.avatarUrl}` : `none  ${body.error ?? ''}`;
  body.avatarUrl ? ok++ : none++;
  console.log(`${platform.padEnd(9)} ${poster_handle.padEnd(24)} ${line}`);
  await sleep(1000);
}
console.log(`done: ${ok} with avatar, ${none} without`);
```

- [ ] **Step 2: Run it**

From repo root:
```bash
node scripts/backfill-creator-avatars.mjs
```
Expected: `30 creators`, one line per creator, most `ok` with a `creator-avatars` URL, ending `done: N with avatar, M without`. Record the `none` handles in the task report; a handful is acceptable (deleted or private accounts), more than a third means Instagram is walling the function's IP — report and stop.

- [ ] **Step 3: Verify the table**

From `mobile/`:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/creators?select=platform,handle,avatar_url&order=handle" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r),'rows;',sum(1 for x in r if x['avatar_url']),'with avatar')"
```
Expected: `30 rows; N with avatar`, N matching the script's `ok` count.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-creator-avatars.mjs
git commit -m "chore(capture): backfill script for creator avatars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Client helpers and data access

**Files:**
- Create: `mobile/src/lib/creatorHandle.ts`
- Create: `mobile/src/lib/__tests__/creatorHandle.test.ts`
- Create: `mobile/src/lib/supabase/creators.ts`

- [ ] **Step 1: Write the failing tests**

`mobile/src/lib/__tests__/creatorHandle.test.ts`:
```ts
import { normaliseHandle, isAvatarStale, avatarLetter, avatarUri } from "../creatorHandle";

describe("normaliseHandle", () => {
  it("strips @, lowercases, trims", () => {
    expect(normaliseHandle("@OnlineWOD ")).toBe("onlinewod");
    expect(normaliseHandle("fit___dad")).toBe("fit___dad");
    expect(normaliseHandle("@")).toBe("");
  });
});

describe("isAvatarStale", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  it("null is stale", () => expect(isAvatarStale(null, now)).toBe(true));
  it("29 days is fresh", () => expect(isAvatarStale("2026-08-12T12:00:00Z", now)).toBe(false));
  it("31 days is stale", () => expect(isAvatarStale("2026-08-10T12:00:00Z", now)).toBe(true));
});

describe("avatarLetter", () => {
  it("is the first letter of the bare handle, uppercased", () => {
    expect(avatarLetter("@onlinewod")).toBe("O");
    expect(avatarLetter("_dylanshannon")).toBe("_");
    expect(avatarLetter("")).toBe("?");
  });
});

describe("avatarUri", () => {
  it("is null without a url", () => expect(avatarUri(null, "2026-09-10T00:00:00Z")).toBeNull());
  it("busts the cache with the fetch time", () => {
    expect(avatarUri("https://x/a.jpg", "2026-09-10T00:00:00.000Z"))
      .toBe("https://x/a.jpg?v=1788998400000");
  });
  it("still works with no fetch time", () => expect(avatarUri("https://x/a.jpg", null)).toBe("https://x/a.jpg"));
});
```

- [ ] **Step 2: Run them to see them fail**

From `mobile/`:
```bash
npx jest src/lib/__tests__/creatorHandle.test.ts
```
Expected: FAIL — cannot find module `../creatorHandle`.

- [ ] **Step 3: Write the helpers**

`mobile/src/lib/creatorHandle.ts`:
```ts
// The client half of creator identity. Mirrors the edge function's
// creatorAvatar.ts (the two do not share a module graph): the same
// normalisation keys the same row, and the same 30-day rule decides when
// the picker asks for a refresh.

/** The key form of a handle: no @, lowercased, trimmed. Display keeps the @. */
export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").trim().toLowerCase();
}

export const AVATAR_MAX_AGE_DAYS = 30;

/** Null (never fetched) is stale; otherwise stale past 30 days. */
export function isAvatarStale(fetchedAt: string | null, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return true;
  return now.getTime() - then > AVATAR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** The fallback glyph: first character of the bare handle. */
export function avatarLetter(handle: string): string {
  const ch = normaliseHandle(handle).charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** The URL to render. The stored path is fixed (a refresh overwrites the
 *  file in place), so the fetch time rides along as a query to defeat the
 *  image cache after a refresh. */
export function avatarUri(url: string | null, fetchedAt: string | null): string | null {
  if (!url) return null;
  const t = fetchedAt ? Date.parse(fetchedAt) : NaN;
  return Number.isFinite(t) ? `${url}?v=${t}` : url;
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx jest src/lib/__tests__/creatorHandle.test.ts
```
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the data access module**

`mobile/src/lib/supabase/creators.ts`:
```ts
// Reads of the shared creators table and the one edge action that refreshes
// a row. The table is a cache of public profile pictures: a miss is a letter
// in the UI, never an error.
import { supabase } from "../supabase";
import { normaliseHandle } from "../creatorHandle";

export type CreatorPlatform = "instagram" | "tiktok";

export interface CreatorAvatar {
  platform: CreatorPlatform;
  /** Normalised (no @). */
  handle: string;
  avatarUrl: string | null;
  fetchedAt: string | null;
}

/** Keyed by normalised handle. A handle captured on both platforms keeps
 *  whichever row sorts last; the picker only knows handles, not platforms. */
export type CreatorAvatarMap = Record<string, CreatorAvatar>;

interface CreatorRow {
  platform: CreatorPlatform;
  handle: string;
  avatar_url: string | null;
  avatar_fetched_at: string | null;
}

const toAvatar = (r: CreatorRow): CreatorAvatar => ({
  platform: r.platform, handle: r.handle, avatarUrl: r.avatar_url, fetchedAt: r.avatar_fetched_at,
});

export async function fetchCreators(): Promise<CreatorAvatarMap> {
  const { data, error } = await supabase
    .from("creators")
    .select("platform, handle, avatar_url, avatar_fetched_at")
    .order("platform");
  if (error) {
    console.error("creators fetch failed:", error);
    return {};
  }
  const map: CreatorAvatarMap = {};
  for (const r of (data ?? []) as CreatorRow[]) map[r.handle] = toAvatar(r);
  return map;
}

export async function fetchCreator(platform: CreatorPlatform, rawHandle: string): Promise<CreatorAvatar | null> {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  const { data, error } = await supabase
    .from("creators")
    .select("platform, handle, avatar_url, avatar_fetched_at")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  return toAvatar(data as CreatorRow);
}

/** Ask the edge function to (re)fetch one creator. Resolves to the fresh
 *  row, or null when it could not. */
export async function refreshCreator(platform: CreatorPlatform, rawHandle: string): Promise<CreatorAvatar | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: { action: "refresh-creator", platform, handle: rawHandle },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return {
      platform, handle: String(data.handle ?? normaliseHandle(rawHandle)),
      avatarUrl: (data.avatarUrl as string | null) ?? null,
      fetchedAt: (data.avatarFetchedAt as string | null) ?? null,
    };
  } catch (e) {
    console.error("creator refresh failed:", e);
    return null;
  }
}
```

- [ ] **Step 6: Typecheck and commit**

From `mobile/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

```bash
git add src/lib/creatorHandle.ts src/lib/__tests__/creatorHandle.test.ts src/lib/supabase/creators.ts
git commit -m "feat(creators): client helpers and reads for creator avatars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `CreatorAvatar` component

**Files:**
- Create: `mobile/src/components/ui/CreatorAvatar.tsx`
- Modify: `mobile/src/components/ui/index.ts` (add an export line; look at how the others are exported and follow that exact form)

- [ ] **Step 1: Write the component**

`mobile/src/components/ui/CreatorAvatar.tsx`:
```tsx
// A creator's face in a circle, or their initial when we have no picture:
// before the image lands, when the row has none, or when the load fails.
// The letter circle is the one the Creator picker drew before avatars
// existed, so a creator without one looks exactly as they did.
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme/tokens";
import { avatarLetter, avatarUri } from "@/src/lib/creatorHandle";

interface CreatorAvatarProps {
  /** Display form is fine ("@onlinewod"); only the first letter is used. */
  handle: string;
  url: string | null;
  fetchedAt?: string | null;
  size: number;
}

export function CreatorAvatar({ handle, url, fetchedAt = null, size }: CreatorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const uri = failed ? null : avatarUri(url, fetchedAt);
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.circle, round]} accessibilityIgnoresInvertColors>
      {/* The letter sits underneath until the image has painted, so the
          circle is never blank for a beat. */}
      {(!uri || !loaded) && (
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.43) }]}>{avatarLetter(handle)}</Text>
      )}
      {uri && (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, round]}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  letter: { fontWeight: "700", color: colors.textMuted },
});
```

- [ ] **Step 2: Export it**

In `mobile/src/components/ui/index.ts`, after `export { BottomSheet } from "./BottomSheet";`, add:
```ts
export { CreatorAvatar } from "./CreatorAvatar";
```

- [ ] **Step 3: Typecheck, lint, commit**

From `mobile/`:
```bash
npx tsc --noEmit && npm run lint -- src/components/ui/CreatorAvatar.tsx
```
Expected: no errors, no new warnings.

```bash
git add src/components/ui/CreatorAvatar.tsx src/components/ui/index.ts
git commit -m "feat(ui): CreatorAvatar with initial-letter fallback

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Creator picker, filters sheet and Workouts tab wiring

**Files:**
- Modify: `mobile/src/components/training/daily/CreatorPicker.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutFiltersSheet.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

- [ ] **Step 1: The picker renders the avatar**

In `CreatorPicker.tsx`:

Add imports:
```tsx
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import { normaliseHandle } from "@/src/lib/creatorHandle";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
```

Change the props interface to:
```tsx
interface CreatorPickerProps {
  creators: { handle: string; count: number }[];
  /** Keyed by normalised handle; a missing key draws the initial letter. */
  avatars: CreatorAvatarMap;
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
}
```
and the destructuring to `{ creators, avatars, selected, onChange, onBack }`.

Replace:
```tsx
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.handle.replace(/^@/, "").charAt(0).toUpperCase()}</Text>
              </View>
```
with:
```tsx
              <CreatorAvatar
                handle={c.handle}
                url={avatars[normaliseHandle(c.handle)]?.avatarUrl ?? null}
                fetchedAt={avatars[normaliseHandle(c.handle)]?.fetchedAt ?? null}
                size={28}
              />
```

Delete the `avatar` and `avatarText` entries from `styles` (they are now unused; lint would flag them).

- [ ] **Step 2: The filters sheet passes avatars through and reports the page opening**

In `WorkoutFiltersSheet.tsx`:

Add import:
```tsx
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
```

Add to `WorkoutFiltersSheetProps`, after `creators`:
```tsx
  /** Keyed by normalised handle. */
  avatars: CreatorAvatarMap;
  /** Fired when the Creator page opens, so the tab can refresh stale rows. */
  onCreatorsOpen?: () => void;
```
and add `avatars, onCreatorsOpen` to the destructuring in the function signature.

Change the `CreatorPicker` element to:
```tsx
        <CreatorPicker creators={creators} avatars={avatars} selected={draft.creators}
          onChange={(c) => setDraft((d) => ({ ...d, creators: c }))}
          onBack={() => setPage("root")} />
```

Change the row that opens the page (currently `onPress={() => setPage("creators")}`) to:
```tsx
onPress={() => { setPage("creators"); onCreatorsOpen?.(); }}
```

- [ ] **Step 3: The tab loads creators and refreshes stale ones on demand**

In `WorkoutsTab.tsx`:

Add imports:
```tsx
import { fetchCreators, refreshCreator } from "@/src/lib/supabase/creators";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import { isAvatarStale, normaliseHandle } from "@/src/lib/creatorHandle";
```

Add state after `const [completions, setCompletions] = useState<CompletionMap>({});`:
```tsx
  const [avatars, setAvatars] = useState<CreatorAvatarMap>({});
  // Handles this session has already asked the function to refresh, so
  // reopening the picker does not re-ask for one that came back empty.
  const refreshed = useRef(new Set<string>());
```

Change the parallel load from:
```tsx
    const [list, history] = await Promise.all([
      fetchCapturedWorkouts(user.id),
      fetchWorkoutCompletions(user.id),
    ]);
    setWorkouts(list);
    setCompletions(history);
```
to:
```tsx
    // Creators ride along: the picker is decoration on the list, and a
    // missing map just means letters.
    const [list, history, faces] = await Promise.all([
      fetchCapturedWorkouts(user.id),
      fetchWorkoutCompletions(user.id),
      fetchCreators(),
    ]);
    setWorkouts(list);
    setCompletions(history);
    setAvatars(faces);
```

After the `countFor` callback, add:
```tsx
  // Opening the Creator page is the moment to catch a long-idle creator
  // whose avatar no capture has refreshed. Fire-and-forget, once per
  // handle per session; the function itself skips anything fresh.
  const refreshStaleCreators = useCallback(() => {
    const due = workouts
      .filter((w) => w.source?.posterHandle && (w.source.platform === "instagram" || w.source.platform === "tiktok"))
      .map((w) => ({ platform: w.source!.platform as "instagram" | "tiktok", handle: normaliseHandle(w.source!.posterHandle!) }))
      .filter(({ handle }) => handle && !refreshed.current.has(handle) && isAvatarStale(avatars[handle]?.fetchedAt ?? null));
    const unique = [...new Map(due.map((d) => [d.handle, d])).values()];
    if (unique.length === 0) return;
    unique.forEach((d) => refreshed.current.add(d.handle));
    Promise.all(unique.map((d) => refreshCreator(d.platform, d.handle))).then((rows) => {
      const fresh = rows.filter((r): r is NonNullable<typeof r> => r !== null);
      if (fresh.length === 0) return;
      setAvatars((prev) => {
        const next = { ...prev };
        for (const r of fresh) next[r.handle] = r;
        return next;
      });
    });
  }, [workouts, avatars]);
```

Change the `WorkoutFiltersSheet` element to:
```tsx
      <WorkoutFiltersSheet
        visible={filtersOpen}
        applied={filters}
        creators={creators}
        avatars={avatars}
        onCreatorsOpen={refreshStaleCreators}
        countFor={countFor}
        availableEquipment={availableEquipment}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />
```

- [ ] **Step 4: Typecheck, lint, test**

From `mobile/`:
```bash
npx tsc --noEmit && npm run lint -- src/components/training/daily/CreatorPicker.tsx src/components/training/daily/WorkoutFiltersSheet.tsx src/components/training/daily/WorkoutsTab.tsx && npm test
```
Expected: no type errors, no new lint warnings, all Jest suites pass (the picker's old `avatar` styles gone, no unused-import warnings).

- [ ] **Step 5: Commit**

```bash
git add src/components/training/daily/CreatorPicker.tsx src/components/training/daily/WorkoutFiltersSheet.tsx src/components/training/daily/WorkoutsTab.tsx
git commit -m "feat(workouts): creator avatars in the Creator picker, stale rows refreshed on open

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Workout detail source line

**Files:**
- Modify: `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx`

- [ ] **Step 1: Load the creator beside the workout**

Add imports:
```tsx
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import { fetchCreator } from "@/src/lib/supabase/creators";
import type { CreatorAvatar as CreatorAvatarRow } from "@/src/lib/supabase/creators";
```
(`useEffect` must be in the React import: change `import React, { useCallback, useMemo, useState } from "react";` to `import React, { useCallback, useEffect, useMemo, useState } from "react";`.)

Next to the existing `const [workout, setWorkout] = useState<...>` line (find it near the top of the component), add:
```tsx
  const [creator, setCreator] = useState<CreatorAvatarRow | null>(null);
```

After the `load` callback definition (the `const load = useCallback(() => { ... }, [id]);` block), add:
```tsx
  // The creator's avatar rides beside the source link. One row by key; a
  // miss is a letter, never an error.
  useEffect(() => {
    const src = workout?.source;
    if (!src?.posterHandle || (src.platform !== "instagram" && src.platform !== "tiktok")) {
      setCreator(null);
      return;
    }
    let alive = true;
    fetchCreator(src.platform, src.posterHandle).then((c) => { if (alive) setCreator(c); });
    return () => { alive = false; };
  }, [workout?.source?.platform, workout?.source?.posterHandle]);
```

- [ ] **Step 2: Render it**

Replace:
```tsx
              <ExternalLink size={15} color={colors.primary} />
              <Text style={styles.sourceText}>
                {workout.source.posterHandle ?? workout.source.platform}
              </Text>
```
with:
```tsx
              {/* Avatar · handle · link glyph. 20pt, not the glyph's 15: a
                  face is unreadable that small (spec §7.4). */}
              {workout.source.posterHandle && (
                <CreatorAvatar
                  handle={workout.source.posterHandle}
                  url={creator?.avatarUrl ?? null}
                  fetchedAt={creator?.fetchedAt ?? null}
                  size={20}
                />
              )}
              <Text style={styles.sourceText}>
                {workout.source.posterHandle ?? workout.source.platform}
              </Text>
              <ExternalLink size={15} color={colors.primary} />
```

- [ ] **Step 3: Typecheck, lint**

From `mobile/`:
```bash
npx tsc --noEmit && npm run lint -- src/components/training/daily/CapturedWorkoutScreen.tsx
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/training/daily/CapturedWorkoutScreen.tsx
git commit -m "feat(workouts): creator avatar on the workout detail source line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: On-simulator walk

No files. Uses the session's dedicated simulator and its own Metro port (see memory: never reuse the user's Metro or sim). The Claude simulator tool may be dead; then drive with idb per `reference_idb_simulator_driver`.

- [ ] **Step 1: Start Metro on a free port and open the dev client**

From `mobile/` (pick a port nobody else uses, e.g. 8102):
```bash
LANG=en_US.UTF-8 npx expo start --port 8102
```
Then open `fittracker-local://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8102` on the sim.

- [ ] **Step 2: Creator picker**

Training › Daily › Workouts › Filters › Creator. Expected: rows for backfilled creators show a real face in the 28pt circle (onlinewod's logo among them); any creator the backfill reported as `none` shows the initial letter; rows, counts and checkboxes are otherwise unchanged. Screenshot it.

- [ ] **Step 3: Workout detail**

Open any onlinewod workout. Expected: at the end of the page, the source row reads avatar (20pt) · `@onlinewod` · link glyph, and tapping it still opens the post. Screenshot it.

- [ ] **Step 4: A fresh capture**

Capture a new post from a creator not yet in the library (any public Instagram workout post). Expected: capture completes at its usual speed; afterwards the Creator picker lists the new creator with their avatar. Confirm the row via REST:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/creators?select=handle,avatar_url&order=avatar_fetched_at.desc&limit=1" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Delete the test capture afterwards through the app's swipe-to-delete so the library is as it was.

- [ ] **Step 5: Tear down**

Stop Metro and shut down / delete the dedicated simulator. Report PASS/FAIL per step with the screenshots.

---

## Self-review

- **Spec coverage:** §4 table/bucket → Task 1; §4.2 normalisation both sides → Tasks 2 and 5; §5.1 helper, §5.2 resolve hook + action, service-role caller → Task 3; §5.3 opportunistic refresh → Task 7 step 3; §6 backfill → Task 4; §7.1 data → Task 5; §7.2 component → Task 6; §7.3 picker → Task 7; §7.4 detail at 20pt → Task 8; §8 error handling → `ensureCreatorAvatar` never throws, client reads return `{}`/null, `CreatorAvatar` `onError`; §9 tests → Deno (Task 2) and Jest (Task 5), on-sim walk → Task 9. One deliberate substitution: the spec's "CreatorAvatar renders the letter when url is null" test is a pure `avatarLetter`/`avatarUri` test, because Jest here cannot load React Native.
- **Placeholders:** none.
- **Type consistency:** `CreatorAvatarMap` keyed by normalised handle everywhere; `refreshCreator` returns the same `CreatorAvatar` shape `fetchCreators` stores; `ensureCreatorAvatar` returns `CreatorRow` whose `avatar_url` / `avatar_fetched_at` the action maps to `avatarUrl` / `avatarFetchedAt`, which `refreshCreator` reads.
