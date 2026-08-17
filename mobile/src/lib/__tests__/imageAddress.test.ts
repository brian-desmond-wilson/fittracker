import { isFetchableImageAddress } from "../imageAddress";

describe("isFetchableImageAddress", () => {
  it("takes an ordinary http or https address", () => {
    expect(isFetchableImageAddress("https://huel.com/img/banana.jpg")).toBe(true);
    expect(isFetchableImageAddress("http://example.com/a.png")).toBe(true);
  });

  it("ignores the whitespace a paste brings with it", () => {
    expect(isFetchableImageAddress("  https://huel.com/a.jpg\n")).toBe(true);
  });

  it("takes an address with no file extension — a CDN id is still an image", () => {
    // Shopify, Contentful and friends serve pictures off opaque paths, and the
    // server fetches before it believes anything anyway.
    expect(isFetchableImageAddress("https://cdn.shopify.com/s/files/1/0/abc?v=2")).toBe(true);
  });

  it("refuses what cannot be fetched over the web", () => {
    expect(isFetchableImageAddress("file:///var/mobile/photo.jpg")).toBe(false);
    expect(isFetchableImageAddress("data:image/png;base64,iVBOR")).toBe(false);
    expect(isFetchableImageAddress("javascript:alert(1)")).toBe(false);
    expect(isFetchableImageAddress("ftp://example.com/a.jpg")).toBe(false);
  });

  it("refuses a scheme with nothing after it", () => {
    expect(isFetchableImageAddress("https://")).toBe(false);
    expect(isFetchableImageAddress("https:// spaced.com/a.jpg")).toBe(false);
  });

  it("refuses an empty or blank field, which is the state it starts in", () => {
    expect(isFetchableImageAddress("")).toBe(false);
    expect(isFetchableImageAddress("   ")).toBe(false);
  });
});
