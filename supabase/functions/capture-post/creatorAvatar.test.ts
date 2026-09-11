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
