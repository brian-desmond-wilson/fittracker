// Whether a pasted address is worth handing to the server.
//
// The check is deliberately shallow: only that this is an http(s) URL with
// something after the scheme. Whether it actually points at an image is the
// server's business — it fetches and inspects the bytes before copying
// anything into our bucket — and a client-side extension check would reject
// every CDN that serves pictures off an opaque path.
//
// What it does buy is an honest button: "Use" is plainly dead until the field
// holds something fetchable, rather than failing after a round trip.

export function isFetchableImageAddress(raw: string): boolean {
  return /^https?:\/\/\S+$/i.test(raw.trim());
}
