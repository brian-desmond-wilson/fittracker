// The 3-segment skill pill's one rule, shared by the curated and captured
// exercise cards: how many segments light, and in which token colour.
export type SkillTone = "brand" | "warning" | "danger";

export interface SkillFill {
  filled: 0 | 1 | 2 | 3;
  tone: SkillTone | null;
}

export function skillFill(level: string | null | undefined): SkillFill {
  switch (level) {
    case "Beginner": return { filled: 1, tone: "brand" };
    case "Intermediate": return { filled: 2, tone: "warning" };
    case "Advanced": return { filled: 3, tone: "danger" };
    default: return { filled: 0, tone: null };
  }
}
