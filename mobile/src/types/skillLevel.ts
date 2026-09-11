// mobile/src/types/skillLevel.ts
// The three-step difficulty ladder both catalog tabs filter on. One home so
// the Workouts and Exercises filter vocabularies cannot drift apart.
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";
export const ALL_SKILLS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];
