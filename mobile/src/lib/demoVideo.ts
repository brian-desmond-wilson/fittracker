// The Demo Video card's source label and the "Find a demo" search link
// (spec §4.7, decision 8).
export function videoSourceLabel(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Video";
  }
  if (host.includes("youtube.") || host === "youtu.be") return "YouTube";
  if (host.includes("instagram.")) return "Instagram";
  if (host.includes("tiktok.")) return "TikTok";
  return "Video";
}

export function demoSearchUrl(exerciseName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName.trim()} exercise`)}`;
}
