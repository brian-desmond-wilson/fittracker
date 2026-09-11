import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  normaliseHandle, isAvatarStale, instagramAvatarCandidates, parseTikTokAvatar, isAllowedAvatarHost,
} from './creatorAvatar.ts';

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
