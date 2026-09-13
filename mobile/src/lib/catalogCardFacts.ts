// What the captured-exercise card shows, derived once from a CatalogEntry so
// the JSX is a plain renderer and this rule set is testable on its own.
import type { CatalogEntry } from "../types/capture";

export interface CardBadge {
  kind: "core" | "tier";
  label: string;
}

export interface CatalogCardFacts {
  badge: CardBadge | null;
  skillLevel: string | null;
  equipment: string[];
  /** The one large muscle icon. First primary; first muscle if none is flagged. */
  primaryMuscle: string | null;
  /** Every other muscle, deduped, in catalogue order. The card draws only the
   *  first few as small dimmed icons but names them all. */
  secondaryMuscles: string[];
  scoringTypes: string[];
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

// The catalogue carries a "Not Scored / N/A" placeholder row that is not worth a chip.
const isRealScore = (name: string) => {
  const n = name.toLowerCase().trim();
  return !n.includes("not scored") && n !== "n/a";
};

export function catalogCardFacts(entry: CatalogEntry): CatalogCardFacts {
  const primaryIdx = entry.muscles.findIndex((m) => m.isPrimary);
  const idx = primaryIdx >= 0 ? primaryIdx : (entry.muscles.length ? 0 : -1);
  const primaryMuscle = idx >= 0 ? entry.muscles[idx].name : null;
  const secondaryMuscles = uniq(
    entry.muscles.filter((_, i) => i !== idx).map((m) => m.name),
  ).filter((name) => name !== primaryMuscle);

  let badge: CardBadge | null = null;
  if (entry.tier === 0) badge = { kind: "core", label: "Core" };
  else if (entry.tier != null && entry.tier > 0) badge = { kind: "tier", label: `Tier ${entry.tier}` };

  return {
    badge,
    skillLevel: entry.skillLevel,
    equipment: uniq(entry.equipmentTypes),
    primaryMuscle,
    secondaryMuscles,
    scoringTypes: entry.scoringTypes.filter(isRealScore),
  };
}
