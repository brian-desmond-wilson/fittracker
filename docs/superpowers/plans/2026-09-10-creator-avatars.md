# Creator Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every creator in the Workouts tab's Creator picker and on the captured-workout detail screen shows the avatar they use on Instagram or TikTok, fetched and rehosted at capture time, refreshed after 30 days, and backfilled for the 30 creators already in the library.

**Architecture:** A shared `public.creators` table keyed by `(platform, handle)` plus a public `creator-avatars` bucket. The `capture-post` edge function gains pure parsers (`creatorAvatar.ts`, Deno-tested), an `ensureCreatorAvatar` helper that reads TikTok profiles itself and takes host-checked Instagram picture links from the caller (Instagram walls the edge runtime), runs inside `resolve` for TikTok and behind a `refresh-creator` action for both; the service role may call that one action so a backfill script can drive it. The phone reads Instagram profile pages after a capture and when the Creator picker opens. The client loads the creators table alongside workouts, threads a handle→avatar map into the picker and detail screen, and renders through one `CreatorAvatar` component that falls back to the initial letter.

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

### Task 3b: Server fix-up — phone-supplied candidates, handle validation, 1-day retry

Why: Task 3's smoke test showed Instagram answers the edge runtime with 429 + login redirect. Spec §5 was revised (2026-09-11): the server discovers TikTok avatars itself, Instagram candidates arrive from the phone or the backfill script, candidate hosts are allow-listed, invalid handles never reach the network or the table, and a row without an avatar is retried after a day rather than a month. Review of e726553 also asked for the two duplicate `refresh-creator` blocks to become one.

**Files:**
- Modify: `supabase/functions/capture-post/creatorAvatar.ts`
- Modify: `supabase/functions/capture-post/creatorAvatar.test.ts`
- Modify: `supabase/functions/capture-post/index.ts`

- [ ] **Step 1: Update the tests first**

In `creatorAvatar.test.ts`, change the import to:
```ts
import {
  normaliseHandle, isAvatarStale, instagramAvatarCandidates, parseTikTokAvatar, isAllowedAvatarHost,
} from './creatorAvatar.ts';
```

Replace the `normaliseHandle` test with:
```ts
Deno.test('normaliseHandle strips @, lowercases, trims', () => {
  assertEquals(normaliseHandle('@OnlineWOD '), 'onlinewod');
  assertEquals(normaliseHandle('  fit___dad'), 'fit___dad');
  assertEquals(normaliseHandle('@'), '');
  assertEquals(normaliseHandle(''), '');
});

Deno.test('normaliseHandle rejects anything that is not a platform handle', () => {
  assertEquals(normaliseHandle('Sam Jones'), '');
  assertEquals(normaliseHandle('a/b'), '');
  assertEquals(normaliseHandle('x'.repeat(31)), '');
  assertEquals(normaliseHandle('x'.repeat(30)), 'x'.repeat(30));
  assertEquals(normaliseHandle('senada.greca'), 'senada.greca');
});
```

Replace the `isAvatarStale` test with:
```ts
Deno.test('isAvatarStale: null is stale; with an avatar 29 days fresh, 31 stale', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  assertEquals(isAvatarStale(null, true, now), true);
  assertEquals(isAvatarStale('2026-08-12T12:00:00Z', true, now), false);
  assertEquals(isAvatarStale('2026-08-10T12:00:00Z', true, now), true);
});

Deno.test('isAvatarStale: without an avatar, 23 hours fresh, 25 hours stale', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  assertEquals(isAvatarStale('2026-09-09T13:00:00Z', false, now), false);
  assertEquals(isAvatarStale('2026-09-09T11:00:00Z', false, now), true);
});
```

Append:
```ts
Deno.test('isAllowedAvatarHost: platform CDNs over https only', () => {
  assertEquals(isAllowedAvatarHost('instagram', 'https://scontent-sjc6-1.cdninstagram.com/v/a.jpg?x=1'), true);
  assertEquals(isAllowedAvatarHost('instagram', 'https://scontent.xx.fbcdn.net/v/a.jpg'), true);
  assertEquals(isAllowedAvatarHost('tiktok', 'https://p16-sign.tiktokcdn-us.com/tos/a.jpeg'), true);
  assertEquals(isAllowedAvatarHost('tiktok', 'https://p16.tiktokcdn.com/a.jpeg'), true);
  assertEquals(isAllowedAvatarHost('instagram', 'https://p16.tiktokcdn.com/a.jpeg'), false);
  assertEquals(isAllowedAvatarHost('instagram', 'http://scontent.cdninstagram.com/a.jpg'), false);
  assertEquals(isAllowedAvatarHost('instagram', 'https://cdninstagram.com.evil.test/a.jpg'), false);
  assertEquals(isAllowedAvatarHost('instagram', 'https://evilcdninstagram.com/a.jpg'), false);
  assertEquals(isAllowedAvatarHost('instagram', 'not a url'), false);
});
```

- [ ] **Step 2: Run the tests to see the new ones fail**

```bash
deno test supabase/functions/capture-post/creatorAvatar.test.ts
```
Expected: failures on `isAllowedAvatarHost` (not exported), the rejection cases, and the `hasAvatar` argument.

- [ ] **Step 3: Update the module**

In `creatorAvatar.ts`, replace `normaliseHandle` with:
```ts
/** The key form of a handle: no @, lowercased, trimmed — and only if the
 *  result is a handle either platform would issue (letters, digits, dots,
 *  underscores, at most 30). Anything else is "", which every caller treats
 *  as nothing to do: no fetch, no row, no object in the bucket. */
export function normaliseHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, '').trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : '';
}
```

Replace the `AVATAR_MAX_AGE_DAYS` constant and `isAvatarStale` with:
```ts
export const AVATAR_MAX_AGE_DAYS = 30;
/** A row with no avatar is retried after a day, not a month: "we were
 *  walled off" must not read as "this profile is dead". */
export const AVATAR_RETRY_HOURS = 24;

/** Null (never fetched) is stale; with an avatar, stale past 30 days;
 *  without one, stale past 24 hours. */
export function isAvatarStale(fetchedAt: string | null, hasAvatar: boolean, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return true;
  const maxMs = hasAvatar
    ? AVATAR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    : AVATAR_RETRY_HOURS * 60 * 60 * 1000;
  return now.getTime() - then > maxMs;
}
```

Append at the end of the file:
```ts
const AVATAR_HOSTS: Record<'instagram' | 'tiktok', string[]> = {
  instagram: ['cdninstagram.com', 'fbcdn.net'],
  tiktok: ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'],
};

/** A caller-supplied avatar link may only point at the platform's own
 *  image CDN, over https. The function fetches whatever passes this, so
 *  the check is the whole difference between "rehost a profile picture"
 *  and "fetch any URL a signed-in user names". Exact domain or a true
 *  subdomain, never a bare suffix match. */
export function isAllowedAvatarHost(platform: 'instagram' | 'tiktok', url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return AVATAR_HOSTS[platform].some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
deno test supabase/functions/capture-post/creatorAvatar.test.ts
```
Expected: `ok | 8 passed | 0 failed`.

- [ ] **Step 5: Rework the edge function**

In `index.ts`:

(a) Change the import to:
```ts
import {
  isAllowedAvatarHost, isAvatarStale, normaliseHandle, parseTikTokAvatar,
} from './creatorAvatar.ts';
```

(b) Replace the whole `ensureCreatorAvatar` function (from its docblock `/** Make sure public.creators has a fresh avatar ...` through its closing `}`) with:
```ts
/** Make sure public.creators has a fresh avatar for this creator. Never
 *  throws, never blocks a capture on failure: a fetch that finds nothing
 *  still stamps avatar_fetched_at (so the next try waits a day) and keeps
 *  whatever avatar_url was there before (so a transient failure does not
 *  blank a working picture). A transport error returns null WITHOUT
 *  stamping, so the next capture simply retries.
 *
 *  The server reads TikTok profiles itself. Instagram answers this
 *  runtime's address with a login wall, so Instagram candidates arrive in
 *  `supplied` from the phone or the backfill script, which fetch the page
 *  from a home network; they are host-checked before anything is fetched. */
async function ensureCreatorAvatar(
  platform: AvatarPlatform, rawHandle: string, supplied: string[],
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
    if (row && !isAvatarStale(row.avatar_fetched_at, row.avatar_url !== null)) return row;

    const found: string[] = [];
    if (platform === 'tiktok') {
      const res = await fetch(`https://www.tiktok.com/@${handle}`, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const u = parseTikTokAvatar(await res.text());
        if (u) found.push(u);
      }
    }
    const candidates = [
      ...found,
      ...supplied.filter((u) => isAllowedAvatarHost(platform, u)).slice(0, 3),
    ];
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

/** The refresh-creator action, for a signed-in user and the backfill
 *  script alike. Candidates are capped here as well as in the helper so a
 *  long array never costs more than three downloads. */
async function runRefreshCreator(body: Record<string, unknown>): Promise<Response> {
  const platform = String(body.platform ?? '');
  if (platform !== 'instagram' && platform !== 'tiktok') throw new Error('platform must be instagram or tiktok');
  const rawHandle = String(body.handle ?? '');
  const supplied = (Array.isArray(body.candidates) ? body.candidates : [])
    .filter((c): c is string => typeof c === 'string')
    .slice(0, 3);
  const row = await ensureCreatorAvatar(platform, rawHandle, supplied);
  return json({
    platform, handle: normaliseHandle(rawHandle),
    avatarUrl: row?.avatar_url ?? null, avatarFetchedAt: row?.avatar_fetched_at ?? null,
  });
}
```

(c) Replace the service-role gate block:
```ts
    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && body.action === 'refresh-creator') {
      const platform = String(body.platform ?? '');
      if (platform !== 'instagram' && platform !== 'tiktok') throw new Error('platform must be instagram or tiktok');
      const row = await ensureCreatorAvatar(platform, String(body.handle ?? ''));
      return json({
        platform, handle: normaliseHandle(String(body.handle ?? '')),
        avatarUrl: row?.avatar_url ?? null, avatarFetchedAt: row?.avatar_fetched_at ?? null,
      });
    }
```
with:
```ts
    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && body.action === 'refresh-creator') {
      return await runRefreshCreator(body);
    }
```

(d) Replace the user-facing action block:
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
with:
```ts
    if (body.action === 'refresh-creator') {
      return await runRefreshCreator(body);
    }
```

(e) Replace the resolve hook:
```ts
      // The poster's avatar, kept fresh as a side effect of capturing. Awaited
      // rather than detached: the edge runtime may not finish work left
      // running after the response goes out. Costs nothing when fresh.
      if (meta?.posterHandle && (platform === 'instagram' || platform === 'tiktok')) {
        await ensureCreatorAvatar(platform, meta.posterHandle);
      }
```
with:
```ts
      // A TikTok poster's avatar, kept fresh as a side effect of capturing.
      // Awaited rather than detached: the edge runtime may not finish work
      // left running after the response goes out. Costs one row read when
      // fresh. Instagram is left to the phone, which follows up after this
      // response with refresh-creator and the candidates it can see.
      if (platform === 'tiktok' && meta?.posterHandle) {
        await ensureCreatorAvatar('tiktok', meta.posterHandle, []);
      }
```

(f) In the header comment, replace the `refresh-creator` paragraph with:
```
//   refresh-creator { platform, handle, candidates? }
//       → { platform, handle, avatarUrl, avatarFetchedAt }
//       Rehost the creator's avatar to the creator-avatars bucket and
//       upsert public.creators — unless a fresh row exists (30 days with
//       an avatar, 1 day without). TikTok: this function reads the profile
//       page itself. Instagram: it cannot (429 + login wall for this
//       runtime's address), so the phone or the backfill script reads the
//       page and passes the picture links as `candidates`, which are
//       accepted only on Instagram's own image CDN hosts. resolve does the
//       TikTok half for the poster it finds. The one caller allowed in with
//       the service role (the backfill script) may only call this action.
```

- [ ] **Step 6: Type-check and deploy**

```bash
deno check supabase/functions/capture-post/index.ts && npx supabase functions deploy capture-post
```
Expected: clean check; `Deployed Functions.`

- [ ] **Step 7: Smoke — Instagram with phone-style candidates (this proves the CDN download works from the edge)**

From `mobile/`:
```bash
set -a; . ./.env; set +a
CANDS=$(curl -sL -A "Mozilla/5.0 (compatible; FitTracker/1.0)" "https://www.instagram.com/onlinewod/" | python3 -c 'import sys,re,html,json; m=re.search(r"<meta property=\"og:image\" content=\"([^\"]*)\"", sys.stdin.read()); u=html.unescape(m.group(1)) if m else None; print(json.dumps([u.replace("_s100x100","_s150x150"), u] if u else []))')
echo "$CANDS"
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/capture-post" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d "{\"action\":\"refresh-creator\",\"platform\":\"instagram\",\"handle\":\"@onlinewod\",\"candidates\":$CANDS}"
```
Expected: `CANDS` prints two cdninstagram URLs; the action returns `avatarUrl` ending `creator-avatars/instagram/onlinewod.jpg`. Then `curl -sI "<avatarUrl>" | head -3` → 200, image content-type. **If avatarUrl is null with valid candidates, the edge runtime cannot reach Instagram's CDN either: report BLOCKED** (the spec's fallback is a bytes upload, not built yet).

- [ ] **Step 8: Smoke — TikTok server-side**

From `mobile/`, find a real TikTok handle in the library, then refresh it:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/captured_sources?select=poster_handle&platform=eq.tiktok&limit=1" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Then POST `{"action":"refresh-creator","platform":"tiktok","handle":"<that handle>"}` as in Step 7 without candidates. Expected: a `creator-avatars/tiktok/<handle>.jpg` URL that HEADs 200. If that creator's profile has no `avatarLarger` (deleted account), try `@tiktok` instead and delete that row and object afterwards.

- [ ] **Step 9: Smoke — rejections**

POST `{"action":"refresh-creator","platform":"instagram","handle":"a/b"}` → expect `{"platform":"instagram","handle":"","avatarUrl":null,"avatarFetchedAt":null}` and no new row (`GET /rest/v1/creators?handle=eq.a%2Fb` → `[]`). POST with `"candidates":["https://example.com/x.jpg"]` for a fresh handle like `@zz_no_such_creator_zz` → `avatarUrl` null, row stamped. Delete that test row afterwards.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/capture-post/creatorAvatar.ts supabase/functions/capture-post/creatorAvatar.test.ts supabase/functions/capture-post/index.ts
git commit -m "feat(capture): phone-supplied avatar candidates, handle validation, 1-day retry

Instagram walls the edge runtime (429 + login), so Instagram candidates
now arrive from the phone or the backfill and are host-checked; TikTok
stays server-side. Invalid handles never reach the network or the table,
and a row without an avatar is retried after a day rather than a month.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Backfill script and run

**Files:**
- Create: `scripts/backfill-creator-avatars.ts` (Deno; imports the parsers straight from the edge function)

- [ ] **Step 1: Write the script**

```ts
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
      if (page.ok) candidates = instagramAvatarCandidates(await page.text());
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
```

- [ ] **Step 2: Run it**

From repo root:
```bash
deno run --allow-net --allow-read scripts/backfill-creator-avatars.ts
```
Expected: `30 creators` (or fewer if a handle fails validation — report which), one line per creator, most `ok` with a `creator-avatars` URL, ending `done: N with avatar, M without`. Record every `none` line in the task report. A handful is acceptable (deleted or private accounts); if Instagram starts answering the Mac with `no og:image` for most of them, it has rate-limited this address — stop, wait ten minutes, rerun (fresh rows are skipped, so it resumes where it left off).

- [ ] **Step 3: Verify the table**

From `mobile/`:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/creators?select=platform,handle,avatar_url&order=handle" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" | python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r),'rows;',sum(1 for x in r if x['avatar_url']),'with avatar'); print([x['handle'] for x in r if not x['avatar_url']])"
```
Expected: row count matching the script's creator count, `with avatar` matching its `ok` count, and the list of handles without one.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-creator-avatars.ts
git commit -m "chore(capture): backfill script for creator avatars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Client helpers, data access, and the phone-side fetch

**Files:**
- Create: `mobile/src/lib/creatorHandle.ts`
- Create: `mobile/src/lib/__tests__/creatorHandle.test.ts`
- Create: `mobile/src/lib/supabase/creators.ts`
- Create: `mobile/src/lib/creatorProfile.ts`

- [ ] **Step 1: Write the failing tests**

`mobile/src/lib/__tests__/creatorHandle.test.ts`:
```ts
import {
  normaliseHandle, isAvatarStale, avatarLetter, avatarUri, instagramAvatarCandidates,
} from "../creatorHandle";

describe("normaliseHandle", () => {
  it("strips @, lowercases, trims", () => {
    expect(normaliseHandle("@OnlineWOD ")).toBe("onlinewod");
    expect(normaliseHandle("fit___dad")).toBe("fit___dad");
    expect(normaliseHandle("@")).toBe("");
  });
  it("rejects anything that is not a platform handle", () => {
    expect(normaliseHandle("Sam Jones")).toBe("");
    expect(normaliseHandle("a/b")).toBe("");
    expect(normaliseHandle("x".repeat(31))).toBe("");
    expect(normaliseHandle("senada.greca")).toBe("senada.greca");
  });
});

describe("isAvatarStale", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  it("null is stale", () => expect(isAvatarStale(null, true, now)).toBe(true));
  it("with an avatar: 29 days fresh, 31 days stale", () => {
    expect(isAvatarStale("2026-08-12T12:00:00Z", true, now)).toBe(false);
    expect(isAvatarStale("2026-08-10T12:00:00Z", true, now)).toBe(true);
  });
  it("without one: 23 hours fresh, 25 hours stale", () => {
    expect(isAvatarStale("2026-09-09T13:00:00Z", false, now)).toBe(false);
    expect(isAvatarStale("2026-09-09T11:00:00Z", false, now)).toBe(true);
  });
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

describe("instagramAvatarCandidates", () => {
  it("upgrades og:image to 150 first, then the URL as given", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s100x100_tt6&amp;_nc_cat=107&amp;oh=00_AQJK&amp;oe=6AA95BEF" />
    </head></html>`;
    expect(instagramAvatarCandidates(html)).toEqual([
      "https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s150x150_tt6&_nc_cat=107&oh=00_AQJK&oe=6AA95BEF",
      "https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=107&oh=00_AQJK&oe=6AA95BEF",
    ]);
  });
  it("gives the one URL without a size token, and nothing without og:image", () => {
    expect(instagramAvatarCandidates(`<meta property="og:image" content="https://x.test/a.jpg" />`)).toEqual(["https://x.test/a.jpg"]);
    expect(instagramAvatarCandidates("<html></html>")).toEqual([]);
  });
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
// normalisation keys the same row, the same staleness rule decides when
// the picker asks for a refresh, and the same Instagram parser runs on the
// phone, because Instagram serves the profile page to a phone and not to
// the server.

/** The key form of a handle: no @, lowercased, trimmed — and only if the
 *  result is a handle either platform would issue. Anything else is "",
 *  which every caller treats as nothing to do. */
export function normaliseHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, "").trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : "";
}

export const AVATAR_MAX_AGE_DAYS = 30;
/** A row with no avatar is retried after a day, not a month. */
export const AVATAR_RETRY_HOURS = 24;

/** Null (never fetched) is stale; with an avatar, stale past 30 days;
 *  without one, stale past 24 hours. */
export function isAvatarStale(fetchedAt: string | null, hasAvatar: boolean, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return true;
  const maxMs = hasAvatar
    ? AVATAR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    : AVATAR_RETRY_HOURS * 60 * 60 * 1000;
  return now.getTime() - then > maxMs;
}

/** The fallback glyph: first character of the bare handle. */
export function avatarLetter(handle: string): string {
  const ch = handle.trim().replace(/^@+/, "").charAt(0);
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

const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function ogImage(html: string): string | null {
  const a = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
  const b = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const raw = a?.[1] ?? b?.[1] ?? null;
  return raw ? decodeEntities(raw) : null;
}

/** Instagram's profile page carries the avatar as og:image at 100px. The
 *  150px variant first (the CDN's signed hash may reject the edit), then
 *  the URL as given. Empty when the page has no og:image. */
export function instagramAvatarCandidates(html: string): string[] {
  const url = ogImage(html);
  if (!url) return [];
  const upgraded = url.replace(/_s100x100/, "_s150x150");
  return upgraded === url ? [url] : [upgraded, url];
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx jest src/lib/__tests__/creatorHandle.test.ts
```
Expected: PASS, 12 tests.

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

/** Ask the edge function to (re)fetch one creator. `candidates` are picture
 *  links this phone found on the creator's Instagram page (empty for
 *  TikTok, which the server reads itself). Resolves to the fresh row, or
 *  null when it could not. Screens call refreshCreatorFromPhone, not this. */
export async function refreshCreator(
  platform: CreatorPlatform, rawHandle: string, candidates: string[],
): Promise<CreatorAvatar | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: { action: "refresh-creator", platform, handle: rawHandle, candidates },
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

- [ ] **Step 6: Write the phone-side fetch**

`mobile/src/lib/creatorProfile.ts`:
```ts
// The phone's half of the avatar fetch. Instagram serves its profile page
// to a phone on a home or mobile network and refuses the server's
// datacentre address, so the app reads the page, picks out the picture
// links, and hands them to the server to download and keep. TikTok needs
// none of this: the server reads that page itself. Spec §5.4.
import { instagramAvatarCandidates, normaliseHandle } from "./creatorHandle";
import { refreshCreator } from "./supabase/creators";
import type { CreatorAvatar, CreatorPlatform } from "./supabase/creators";

/** A profile page is decoration; nothing waits six seconds for it. */
const PAGE_TIMEOUT_MS = 6000;

async function instagramCandidatesFromPhone(handle: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.instagram.com/${handle}/`, { signal: controller.signal });
    if (!res.ok) return [];
    return instagramAvatarCandidates(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Refresh one creator's avatar, doing the Instagram page read here. Still
 *  calls the server when the page gave nothing, so the row is stamped and
 *  the one-day retry clock starts. Never throws. */
export async function refreshCreatorFromPhone(
  platform: CreatorPlatform, rawHandle: string,
): Promise<CreatorAvatar | null> {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  const candidates = platform === "instagram" ? await instagramCandidatesFromPhone(handle) : [];
  return refreshCreator(platform, handle, candidates);
}
```

- [ ] **Step 7: Typecheck and commit**

From `mobile/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

```bash
git add src/lib/creatorHandle.ts src/lib/__tests__/creatorHandle.test.ts src/lib/supabase/creators.ts src/lib/creatorProfile.ts
git commit -m "feat(creators): client helpers, reads, and the phone-side Instagram fetch

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
import { fetchCreators } from "@/src/lib/supabase/creators";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import { refreshCreatorFromPhone } from "@/src/lib/creatorProfile";
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
  // whose avatar no capture has refreshed, or one Instagram walled off
  // yesterday. Fire-and-forget, once per handle per session; the function
  // itself skips anything fresh. The Instagram page reads happen on this
  // phone (creatorProfile.ts), so they run together, not one by one.
  const refreshStaleCreators = useCallback(() => {
    const due = workouts
      .filter((w) => w.source?.posterHandle && (w.source.platform === "instagram" || w.source.platform === "tiktok"))
      .map((w) => ({ platform: w.source!.platform as "instagram" | "tiktok", handle: normaliseHandle(w.source!.posterHandle!) }))
      .filter(({ handle }) => {
        if (!handle || refreshed.current.has(handle)) return false;
        const known = avatars[handle];
        return isAvatarStale(known?.fetchedAt ?? null, (known?.avatarUrl ?? null) !== null);
      });
    const unique = [...new Map(due.map((d) => [d.handle, d])).values()];
    if (unique.length === 0) return;
    unique.forEach((d) => refreshed.current.add(d.handle));
    Promise.all(unique.map((d) => refreshCreatorFromPhone(d.platform, d.handle))).then((rows) => {
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

### Task 7b: Capture sheet asks for the poster's avatar

**Files:**
- Modify: `mobile/src/components/training/daily/CaptureSheet.tsx`

- [ ] **Step 1: Add the import**

After `import { resolvePost, extractPost, findExistingCapture } from "@/src/lib/supabase/capture";` add:
```tsx
import { refreshCreatorFromPhone } from "@/src/lib/creatorProfile";
```

- [ ] **Step 2: Fire the refresh after a successful resolve**

Find, inside the resolve handler:
```tsx
    setResolved(r);
    if (r.needsCaption || !r.captionText) {
```
and change it to:
```tsx
    setResolved(r);
    // The poster's avatar, read from this phone because Instagram refuses
    // the server. Never awaited: a capture does not wait on decoration, and
    // a failure here is invisible — the picker shows a letter instead.
    // TikTok is left out: the server already did it inside resolve.
    if (r.platform === "instagram" && r.posterHandle) {
      void refreshCreatorFromPhone("instagram", r.posterHandle);
    }
    if (r.needsCaption || !r.captionText) {
```

- [ ] **Step 3: Typecheck, lint, commit**

From `mobile/`:
```bash
npx tsc --noEmit && npm run lint -- src/components/training/daily/CaptureSheet.tsx
```
Expected: clean.

```bash
git add src/components/training/daily/CaptureSheet.tsx
git commit -m "feat(capture): fetch the poster's Instagram avatar from the phone after resolve

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

Capture a new post from a creator not yet in the library (any public Instagram workout post). Expected: capture completes at its usual speed; within a few seconds the creators table has a row for them with an avatar (the phone read the page and the server rehosted it), and reopening the Creator picker shows their face. Confirm the row via REST:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/creators?select=handle,avatar_url&order=avatar_fetched_at.desc&limit=1" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Delete the test capture afterwards through the app's swipe-to-delete so the library is as it was.

- [ ] **Step 5: Tear down**

Stop Metro and shut down / delete the dedicated simulator. Report PASS/FAIL per step with the screenshots.

---

## Self-review

- **Spec coverage:** §4 table/bucket → Task 1; §4.2 normalisation + validation both sides → Tasks 2/3b and 5; §5.1 helper with supplied candidates and host allow-list, §5.2 TikTok-only resolve hook + shared action, service-role caller → Tasks 3 and 3b; §5.3 opportunistic refresh → Task 7 step 3; §5.4 phone-assisted fetch → Task 5 step 6 and Task 7b; §6 backfill → Task 4; §7.1 data → Task 5; §7.2 component → Task 6; §7.3 picker → Task 7; §7.4 detail at 20pt → Task 8; §8 error handling → `ensureCreatorAvatar` never throws, client reads return `{}`/null, `CreatorAvatar` `onError`; §9 tests → Deno (Task 2) and Jest (Task 5), on-sim walk → Task 9. One deliberate substitution: the spec's "CreatorAvatar renders the letter when url is null" test is a pure `avatarLetter`/`avatarUri` test, because Jest here cannot load React Native.
- **Placeholders:** none.
- **Type consistency:** `CreatorAvatarMap` keyed by normalised handle everywhere; `isAvatarStale(fetchedAt, hasAvatar, now?)` has the same signature in Deno and Jest; `refreshCreator(platform, handle, candidates)` and `refreshCreatorFromPhone(platform, handle)` both return the `CreatorAvatar` shape `fetchCreators` stores; `ensureCreatorAvatar` returns `CreatorRow` whose `avatar_url` / `avatar_fetched_at` the action maps to `avatarUrl` / `avatarFetchedAt`, which `refreshCreator` reads.
