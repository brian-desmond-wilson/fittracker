import { needsGeneratedImage } from "../supabase/exerciseImages";

jest.mock("../supabase", () => ({ supabase: {} }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

describe("needsGeneratedImage", () => {
  it("wants an image for a row that has none", () => {
    expect(needsGeneratedImage({ image_url: null })).toBe(true);
    expect(needsGeneratedImage({ image_url: "" })).toBe(true);
    expect(needsGeneratedImage({ image_url: "   " })).toBe(true);
  });

  // The wizard lets a person paste their own URL; a picture they chose must
  // never be replaced by a generated one.
  it("leaves a row that already has a picture alone", () => {
    expect(needsGeneratedImage({ image_url: "https://x/y.png" })).toBe(false);
  });
});
