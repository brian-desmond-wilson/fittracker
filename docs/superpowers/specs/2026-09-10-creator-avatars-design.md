# Creator Avatars — Design Spec

**Date:** 2026-09-10
**Status:** Approved in chat 2026-09-10; not yet implemented
**Surfaces:** Creator picker inside the Workouts-tab filters sheet (`mobile/src/components/training/daily/CreatorPicker.tsx`) and the captured-workout detail screen's source line (`mobile/src/components/training/daily/CapturedWorkoutScreen.tsx`)
**Backend:** `supabase/functions/capture-post/index.ts`, one new migration, one new storage bucket

## 1. Problem

Every captured workout carries its creator's handle (`captured_sources.poster_handle`), and the Creator picker lists those handles with an initial-letter circle. The user wants each creator to show the same avatar they use on Instagram (or TikTok), both in the picker and on the workout detail screen. Nothing at capture time fetches a profile picture today: the resolve step scrapes only the post's OpenGraph tags (handle, caption, post image), and no table or column holds anything about a creator beyond the handle on each source row.

Verified 2026-09-10: a plain unauthenticated fetch with the function's existing User-Agent returns the avatar for both platforms.

- Instagram profile page `https://www.instagram.com/<handle>/` → `<meta property="og:image" content="…cdninstagram.com/…profile_pic…s100x100…">`. The `stp=dst-jpg_s100x100` size token can be raised to `s150x150`; if that variant fails, fall back to the URL as given.
- TikTok profile page `https://www.tiktok.com/@<handle>` → embedded JSON field `"avatarLarger":"https://p16-…tiktokcdn…"`, with `/` escapes to unescape. No `og:image` on that page.

Both CDN links are signed and expire, so the image must be rehosted (as post thumbnails already are).

Library state: 55 source rows (53 Instagram, 2 TikTok), 30 distinct handles.

## 2. Goals / non-goals

**Goals**
- Capture fetches, rehosts and records the creator's avatar, refreshing it when the stored one is older than 30 days.
- The Creator picker and the workout detail source line show the avatar, falling back to the initial letter.
- The 30 creators already in the library are backfilled with one script.
- A failed avatar fetch never fails or delays a capture.

**Non-goals**
- Workout cards stay as they are (no avatar).
- No creator display name, bio, follower count, or profile link beyond what the handle already gives.
- No per-user creator data; a creator is shared across all users.
- No change to how the handle is extracted from a post.

## 3. Decisions (user-approved 2026-09-10)

1. **Surfaces:** Creator picker yes, workout detail yes, workout card no.
2. **Refresh policy:** refetch when the stored avatar is older than 30 days; otherwise keep what we have.
3. **Storage:** one shared `creators` table keyed by platform + handle, not per-user, not a column on `captured_sources`.

## 4. Data and storage

### 4.1 `public.creators`

| column | type | notes |
|---|---|---|
| `platform` | text, not null | `'instagram'` or `'tiktok'`; CHECK on those two values (`'other'` sources have no profile page) |
| `handle` | text, not null | normalised: leading `@` stripped, lowercased, trimmed |
| `avatar_url` | text, null | public URL of our rehosted copy; null when the last fetch found nothing |
| `avatar_fetched_at` | timestamptz, null | when we last tried, successful or not (drives the 30-day rule and stops a dead profile being hammered) |
| `created_at` | timestamptz, not null, default now() | |

Primary key `(platform, handle)`. RLS enabled. One policy: `SELECT` to `authenticated`. No insert/update/delete policy for users; all writes come from the edge function with the service role.

### 4.2 Handle normalisation

One pure function, shared by the edge function (Deno) and the client (TS), each with its own copy since they do not share a module graph: `normaliseHandle("@OnlineWOD ") → "onlinewod"`. The picker's tally (`creatorCounts` in `workoutFilters.ts`) keeps producing the display form with `@`; the lookup into the avatar map uses the normalised form. Display never changes.

### 4.3 Bucket `creator-avatars`

Public bucket, same policies as `capture-thumbs` (public read; service-role write). Object path `${platform}/${handle}.${ext}`, uploaded with `upsert: true` so a refresh overwrites in place and the stored URL stays valid. Same guards as `rehostThumb`: `image/*` content-type, 8 MB cap, non-empty body.

Note that `getPublicUrl` on a fixed path means clients may cache a stale image after a refresh. Accepted: append `?v=<avatar_fetched_at epoch>` to the URL the client renders so a refresh busts the cache. The stored `avatar_url` stays clean; the client adds the query.

## 5. Capture flow

### 5.1 New helper in `capture-post/index.ts`

```ts
// Returns the creator row after ensuring it is fresh. Never throws.
async function ensureCreatorAvatar(platform: 'instagram' | 'tiktok', rawHandle: string): Promise<void>
```

1. `handle = normaliseHandle(rawHandle)`; return if empty.
2. Read `creators` for `(platform, handle)` with the service client. If a row exists and `avatar_fetched_at` is within 30 days, return.
3. Fetch the profile page with the existing `UA`:
   - instagram: `https://www.instagram.com/${handle}/`, parse `og:image` with the existing `ogTag()`; try upgrading `s100x100` → `s150x150` in the `stp` param, fall back to the original if that download is not `image/*` or not 2xx.
   - tiktok: `https://www.tiktok.com/@${handle}`, regex `"avatarLarger":"((?:[^"\\]|\\.)*)"`, then JSON-unescape (`JSON.parse('"' + m[1] + '"')`).
4. Rehost via a new `rehostAvatar(imageUrl, platform, handle)` (a sibling of `rehostThumb`, bucket `creator-avatars`, `upsert: true`).
5. Upsert `creators` with `avatar_url` (the public URL, or null if any step failed) and `avatar_fetched_at = now()`.
6. Every step is inside one try/catch; on error, still upsert `avatar_fetched_at = now()` with the previous `avatar_url` preserved (so a transient failure does not blank an existing avatar, and a dead profile is not retried for 30 days).

### 5.2 Where it runs

- In the existing `resolve` action, after `resolveInstagram` / `resolveTikTok` returns a `posterHandle`: `await ensureCreatorAvatar(platform, handle)` before the response is built. Cost: at most one profile fetch plus one image download per capture, and zero when fresh. It is awaited (not fire-and-forget) because Deno edge runtimes may not finish detached work after the response is sent.
- A new action `refresh-creator { platform, handle }` that calls the same helper and returns `{ platform, handle, avatarUrl, avatarFetchedAt }`. Requires the normal user JWT like the other actions. This is what the backfill script and the picker's opportunistic refresh call.

### 5.3 Opportunistic refresh from the client

When the filters sheet's Creator page opens, the client checks the creators it has loaded; for any handle whose row is missing or older than 30 days, it calls `refresh-creator` once per handle, fire-and-forget, then reloads the creators table when the batch settles. A per-session `Set` of handles already attempted stops repeat calls. This keeps long-idle creators from freezing at whatever avatar the last capture found.

## 6. Backfill

`scripts/backfill-creator-avatars.ts` (run with `npx tsx` from `mobile/`, reading `mobile/.env`): select distinct `(platform, poster_handle)` from `captured_sources` where `platform in ('instagram','tiktok')` and `poster_handle is not null` (service role), then call the `refresh-creator` action for each, sequentially, with a 1 s pause between calls to be polite to the profile pages. Print one line per creator: handle, ok/none, and the URL. Idempotent: rerunning skips anything fresher than 30 days.

## 7. Client

### 7.1 Data

- `mobile/src/lib/supabase/creators.ts`: `fetchCreators(): Promise<Record<string, CreatorAvatar>>` keyed by normalised handle; `CreatorAvatar = { platform, handle, avatarUrl: string | null, fetchedAt: string | null }`; `refreshCreator(platform, handle)` wrapping the edge action.
- `WorkoutsTab` loads creators in the same `Promise.all` as workouts and completions, stores the map in state, and passes `avatars` to `WorkoutFiltersSheet` → `CreatorPicker`. The captured-workout detail screen fetches the single creator for its source's handle (one row by key) on load.

### 7.2 `CreatorAvatar` component (`mobile/src/components/ui/CreatorAvatar.tsx`)

Props: `handle: string`, `url: string | null`, `size: number`. Renders an `Image` in a circle of `size`; before load, on `null`, or on `onError`, renders the existing initial-letter circle (`surface2` fill, `textMuted` letter, letter size scaled to `size * 0.43` so 28pt keeps its 12pt letter). The URL rendered is `avatarUrl + '?v=' + fetchedAtEpoch`. Accessibility: `accessibilityIgnoresInvertColors`, no label (the handle text beside it is the label).

### 7.3 Creator picker

The row's avatar `View` becomes `<CreatorAvatar handle={c.handle} url={avatars[normaliseHandle(c.handle)]?.avatarUrl ?? null} size={28} />`. Nothing else in the row moves.

### 7.4 Workout detail

The source row (`sourceRow`, external-link icon + handle text) gains a 20pt `CreatorAvatar` as its leading element, before the icon and text: avatar · handle · external-link icon. **Deviation from chat:** chat said "the size that line already uses"; that icon is 15pt, too small for a face, so the avatar is 20pt and the row's `alignItems: "center"` keeps the text baseline unchanged. Confirm at spec review. When the source has no handle (row shows the platform name) no avatar is rendered.

## 8. Error handling

- Profile fetch not 2xx, no avatar tag, non-image download, oversize: `avatar_url` unchanged (or null on first sight), `avatar_fetched_at` stamped, capture continues.
- Storage upload error: same.
- Client image load error: falls back to the letter for that render; no retry loop.
- `creators` read failure on the client: the map is empty and every avatar is a letter; the tab still renders.

## 9. Testing

Unit (Jest, `mobile/src/lib/__tests__/`):
- `normaliseHandle`: strips `@`, lowercases, trims, empty in → empty out.
- `isAvatarStale(fetchedAt, now)`: null → stale; 29 days → fresh; 31 days → stale.
- Avatar extraction from saved profile HTML fixtures (Instagram `og:image` with the `s150x150` upgrade, TikTok `avatarLarger` with escapes): the parsers live in `supabase/functions/capture-post/creatorAvatar.ts` as pure string → string|null functions with no Deno globals, imported by `index.ts` and tested with `deno test supabase/functions/capture-post/` (Deno 2.9 is installed). Jest's roots stop at `mobile/src`, so these cannot be Jest tests.
- `CreatorAvatar` renders the letter when `url` is null.

On-simulator walk: Creator picker shows real faces for the backfilled creators and a letter for an unbackfilled one; workout detail shows the avatar beside the handle; a fresh capture from a new creator produces a row and an avatar without slowing the capture visibly.

## 10. Files

- Create: `supabase/migrations/20260917100000_creators.sql` (the migrations directory is future-dated; this follows the last one, `20260916100000_workout_format_score.sql`) (table, RLS, bucket + policies)
- Create: `supabase/functions/capture-post/creatorAvatar.ts` (pure parsers + `normaliseHandle`) and `creatorAvatar.test.ts`
- Modify: `supabase/functions/capture-post/index.ts` (helper, `resolve` hook, `refresh-creator` action)
- Create: `scripts/backfill-creator-avatars.ts`
- Create: `mobile/src/lib/creatorHandle.ts` (`normaliseHandle`, `isAvatarStale`), `mobile/src/lib/supabase/creators.ts`, `mobile/src/components/ui/CreatorAvatar.tsx`
- Modify: `WorkoutsTab.tsx`, `WorkoutFiltersSheet.tsx`, `CreatorPicker.tsx`, `CapturedWorkoutScreen.tsx`
