import { decodeCaption } from "../captionText";

describe("decodeCaption", () => {
  it("decodes the hex entities Instagram and TikTok captions arrive in", () => {
    // Real stored captions: "Save this 1 KB chest & triceps series &#x2705;"
    expect(decodeCaption("Save this &#x2705;")).toBe("Save this ✅");
    expect(decodeCaption("&#x201c;squatting&#x201d;")).toBe("“squatting”");
    expect(decodeCaption("Full protocol &#x1f447;")).toBe("Full protocol 👇");
  });

  it("decodes decimal entities too", () => {
    expect(decodeCaption("caf&#233;")).toBe("café");
    expect(decodeCaption("&#128170;")).toBe("💪");
  });

  it("decodes the handful of named entities that show up in captions", () => {
    expect(decodeCaption("chest &amp; triceps")).toBe("chest & triceps");
    expect(decodeCaption("&lt;3 &gt;_&lt;")).toBe("<3 >_<");
    expect(decodeCaption("&quot;form&quot; &apos;tips&apos;")).toBe("\"form\" 'tips'");
    expect(decodeCaption("a&nbsp;b")).toBe("a b");
  });

  it("decodes &amp;-escaped entities in one pass, not two", () => {
    // "&amp;#x2705;" is a literal "&#x2705;" the creator typed, not a tick.
    // Decoding twice would silently turn their text into an emoji.
    expect(decodeCaption("&amp;#x2705;")).toBe("&#x2705;");
  });

  it("leaves unknown or malformed entities alone rather than guessing", () => {
    expect(decodeCaption("100&percnt; effort")).toBe("100&percnt; effort");
    expect(decodeCaption("A & B")).toBe("A & B");
    expect(decodeCaption("&#xZZZZ;")).toBe("&#xZZZZ;");
  });

  it("passes through text that was never encoded", () => {
    expect(decodeCaption("8x KB Curl\n8R/8L Cross Body SL RDL")).toBe(
      "8x KB Curl\n8R/8L Cross Body SL RDL",
    );
  });

  it("handles null and empty input", () => {
    expect(decodeCaption(null)).toBe("");
    expect(decodeCaption("")).toBe("");
  });
});
