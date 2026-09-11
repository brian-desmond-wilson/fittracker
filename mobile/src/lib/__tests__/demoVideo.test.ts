import { videoSourceLabel, demoSearchUrl } from "../demoVideo";

describe("videoSourceLabel", () => {
  it("names the host", () => {
    expect(videoSourceLabel("https://www.youtube.com/watch?v=abc")).toBe("YouTube");
    expect(videoSourceLabel("https://youtu.be/abc")).toBe("YouTube");
    expect(videoSourceLabel("https://www.instagram.com/reel/abc/")).toBe("Instagram");
    expect(videoSourceLabel("https://www.tiktok.com/@x/video/1")).toBe("TikTok");
    expect(videoSourceLabel("https://vimeo.com/1")).toBe("Video");
    expect(videoSourceLabel("not a url")).toBe("Video");
  });
});

describe("demoSearchUrl", () => {
  it("is a YouTube search for the name plus 'exercise'", () => {
    expect(demoSearchUrl("Goblet Squat")).toBe("https://www.youtube.com/results?search_query=Goblet%20Squat%20exercise");
    expect(demoSearchUrl("  Sit-up & Twist ")).toBe("https://www.youtube.com/results?search_query=Sit-up%20%26%20Twist%20exercise");
  });
});
