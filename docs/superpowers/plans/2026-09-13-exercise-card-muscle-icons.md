# Exercise Card + Flaticon Muscle Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the captured-exercise card as the approved "Option A" icon layout and give the Muscle Groups picker real anatomical muscle icons from the Flaticon "Muscles" pack.

**Architecture:** One shared muscle-icon system — a pure name→file catalogue (Jest-tested) plus a React Native asset map and a `MuscleIcon` component — feeds both the picker tiles and the card. The card's display logic lives in a pure `catalogCardFacts()` function so the JSX stays a thin renderer; the 3-segment skill pill is extracted from the curated card into a shared `SkillPill` driven by a pure `skillFill()` rule.

**Tech Stack:** Expo / React Native, TypeScript, `react-native-gesture-handler` Swipeable, `lucide-react-native`, Jest + ts-jest (pure TS only — no React Native imports in tests). Design tokens in `src/theme/tokens.ts`.

**Spec:** `docs/superpowers/specs/2026-09-13-exercise-card-muscle-icons-design.md`
**Decision records:** https://claude.ai/code/artifact/0ff3d560-b9c1-437c-bf21-def8254f227e (Option A), https://claude.ai/code/artifact/5c0dd5f9-4b4b-40ae-8a15-7e48cd421cdb (icons on picker + card).

**Repo rules that override the usual plan template:**
- All paths below are relative to `mobile/` unless they start with `docs/`.
- **Do not commit unless Brian asks.** Each task ends at a natural commit boundary; stop there and report. Tests and typecheck must pass before you report a task done.
- Run tests with `npx jest <path>` from `mobile/`; typecheck with `npx tsc --noEmit`.
- Raw hex belongs only in `src/theme/tokens.ts`. New code uses `colors.*`, `spacing.*`, `radii.*`, `tint()`.

**Assets already in place:** `assets/muscles/*.png` — 18 files, 512×512, named by slug (see Task 2 table). Do not rename them.

---

## File map

| File | Responsibility |
|---|---|
| `src/theme/tokens.ts` (modify) | Add `colors.tier` (the tier-badge blue). |
| `src/lib/muscleIconCatalog.ts` (create) | Pure: muscle name → asset slug. No RN imports. |
| `src/lib/__tests__/muscleIconCatalog.test.ts` (create) | Every trainable muscle has a unique slug; unknown → null. |
| `src/components/ui/muscleIconAssets.ts` (create) | slug → `require()`d PNG. RN-only. |
| `src/components/ui/MuscleIcon.tsx` (create) | `<MuscleIcon muscle size dim />`. |
| `src/lib/skillLevel.ts` (create) | Pure: skill level → filled segment count + tone. |
| `src/lib/__tests__/skillLevel.test.ts` (create) | Segment rule. |
| `src/components/ui/SkillPill.tsx` (create) | Shared 3-segment pill (+ optional label). |
| `src/components/training/crossfit/SwipeableMovementCard.tsx` (modify) | Use `SkillPill`; tier badge colour from token. |
| `src/lib/catalogCardFacts.ts` (create) | Pure: `CatalogEntry` → what the card shows. |
| `src/lib/__tests__/catalogCardFacts.test.ts` (create) | Badge rule, primary/secondary split, creator fallback, empties. |
| `src/components/training/daily/MuscleGroupPicker.tsx` (modify) | Tiles use `MuscleIcon`; Full Body keeps `BodyFigure`. |
| `src/components/training/daily/SwipeableCatalogCard.tsx` (modify) | Option A layout. |
| `src/components/profile/AboutScreen.tsx` (modify) | Flaticon credit line. |

---

### Task 1: Tier colour token

**Files:**
- Modify: `src/theme/tokens.ts:14-18`

- [ ] **Step 1: Add the token**

In `src/theme/tokens.ts`, inside `colors`, directly after the `danger` line (line 18), add:

```ts
  // Hierarchy-rank badge on exercise cards ("Tier 1–3"). Identity, not a
  // verdict: the same blue as `accents.water`, but a rank must not repaint if
  // the water tile's colour ever moves.
  tier: "#3B82F6",
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 3: Checkpoint** — natural commit boundary ("feat(tokens): tier badge colour"). Commit only if Brian asks.

---

### Task 2: Pure muscle-icon catalogue (tested)

**Files:**
- Create: `src/lib/muscleIconCatalog.ts`
- Create: `src/lib/__tests__/muscleIconCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/muscleIconCatalog.test.ts`:

```ts
import { MUSCLE_ICON_SLUGS, muscleIconSlug } from "../muscleIconCatalog";
import { TRAINABLE_MUSCLES } from "../dailyCoverage";

describe("muscleIconCatalog", () => {
  it("every trainable muscle has an icon slug", () => {
    for (const m of TRAINABLE_MUSCLES) {
      expect(muscleIconSlug(m)).not.toBeNull();
    }
  });

  it("slugs are unique — two muscles never share a picture", () => {
    const slugs = Object.values(MUSCLE_ICON_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("slugs are file-safe kebab-case", () => {
    for (const s of Object.values(MUSCLE_ICON_SLUGS)) {
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("unknown or non-muscle names return null", () => {
    expect(muscleIconSlug("Full Body")).toBeNull();
    expect(muscleIconSlug("Back")).toBeNull();
    expect(muscleIconSlug("")).toBeNull();
  });

  it("lookup is exact on muscle_regions.name (no case folding)", () => {
    expect(muscleIconSlug("chest")).toBeNull();
    expect(muscleIconSlug("Chest")).toBe("chest");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/muscleIconCatalog.test.ts`
Expected: FAIL — `Cannot find module '../muscleIconCatalog'`.

- [ ] **Step 3: Write the catalogue**

Create `src/lib/muscleIconCatalog.ts`:

```ts
// Which picture stands for which muscle. Pure data so Jest can prove the
// vocabulary is covered; the React Native `require()` side lives in
// components/ui/muscleIconAssets.ts and is keyed by these slugs.
//
// Keys are muscle_regions.name verbatim (the TRAINABLE_MUSCLES vocabulary).
// Values are file stems under assets/muscles/. The pictures are the Flaticon
// "Muscles" pack by cube29 (free licence, credited on the About screen).
// "Full Body" is a pickable tag, not a muscle, and has no picture here on
// purpose — the picker keeps its body figure for that one tile.

export const MUSCLE_ICON_SLUGS = {
  "Chest": "chest",
  "Shoulders": "shoulders",
  "Triceps": "triceps",
  "Upper Back": "upper-back",
  "Lats": "lats",
  "Biceps": "biceps",
  "Forearms / Grip": "forearms-grip",
  "Neck / Traps": "neck-traps",
  "Core": "core",
  "Obliques": "obliques",
  "Lower Back": "lower-back",
  "Quads": "quads",
  "Hamstrings": "hamstrings",
  "Glutes": "glutes",
  "Calves": "calves",
  "Hip Flexors": "hip-flexors",
  "Hip Abductors": "hip-abductors",
  "Hip Adductors": "hip-adductors",
} as const;

export type MuscleIconSlug = (typeof MUSCLE_ICON_SLUGS)[keyof typeof MUSCLE_ICON_SLUGS];

/** Exact lookup on muscle_regions.name; null for anything without a picture. */
export function muscleIconSlug(name: string): MuscleIconSlug | null {
  return (MUSCLE_ICON_SLUGS as Record<string, MuscleIconSlug>)[name] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/muscleIconCatalog.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Checkpoint** — "feat(muscles): icon catalogue".

---

### Task 3: Asset map + `MuscleIcon` component

**Files:**
- Create: `src/components/ui/muscleIconAssets.ts`
- Create: `src/components/ui/MuscleIcon.tsx`

- [ ] **Step 1: Write the asset map**

Create `src/components/ui/muscleIconAssets.ts`:

```ts
// slug → bundled PNG. Keyed by MuscleIconSlug so a slug added to the
// catalogue without a picture here is a compile error, not a blank tile.
// Files are 512×512 — crisp at the 72pt picker tile and 36pt card icon at 3×.
import type { ImageSourcePropType } from "react-native";
import type { MuscleIconSlug } from "@/src/lib/muscleIconCatalog";

export const MUSCLE_ICON_SOURCES: Record<MuscleIconSlug, ImageSourcePropType> = {
  "chest": require("@/assets/muscles/chest.png"),
  "shoulders": require("@/assets/muscles/shoulders.png"),
  "triceps": require("@/assets/muscles/triceps.png"),
  "upper-back": require("@/assets/muscles/upper-back.png"),
  "lats": require("@/assets/muscles/lats.png"),
  "biceps": require("@/assets/muscles/biceps.png"),
  "forearms-grip": require("@/assets/muscles/forearms-grip.png"),
  "neck-traps": require("@/assets/muscles/neck-traps.png"),
  "core": require("@/assets/muscles/core.png"),
  "obliques": require("@/assets/muscles/obliques.png"),
  "lower-back": require("@/assets/muscles/lower-back.png"),
  "quads": require("@/assets/muscles/quads.png"),
  "hamstrings": require("@/assets/muscles/hamstrings.png"),
  "glutes": require("@/assets/muscles/glutes.png"),
  "calves": require("@/assets/muscles/calves.png"),
  "hip-flexors": require("@/assets/muscles/hip-flexors.png"),
  "hip-abductors": require("@/assets/muscles/hip-abductors.png"),
  "hip-adductors": require("@/assets/muscles/hip-adductors.png"),
};
```
(`@/assets/…` is how the app already requires `kettlebell.png` in `WODDetailScreen.tsx`.)

- [ ] **Step 2: Write the component**

Create `src/components/ui/MuscleIcon.tsx`:

```tsx
// One muscle, one picture. Shared by the Muscle Groups picker and the
// captured-exercise card so both read the same. A name with no picture
// renders nothing — a stray region name must never show a broken image.
import React from "react";
import { Image } from "react-native";
import { muscleIconSlug } from "@/src/lib/muscleIconCatalog";
import { MUSCLE_ICON_SOURCES } from "./muscleIconAssets";

interface MuscleIconProps {
  /** muscle_regions.name, verbatim. */
  muscle: string;
  size: number;
  /** Secondary muscle on a card: same picture, half opacity. */
  dim?: boolean;
}

export function MuscleIcon({ muscle, size, dim = false }: MuscleIconProps) {
  const slug = muscleIconSlug(muscle);
  if (!slug) return null;
  return (
    <Image
      source={MUSCLE_ICON_SOURCES[slug]}
      style={{ width: size, height: size, opacity: dim ? 0.5 : 1 }}
      resizeMode="contain"
      accessibilityLabel={muscle}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Checkpoint** — "feat(muscles): MuscleIcon component + assets".

---

### Task 4: Skill rule (tested) + shared `SkillPill`; curated card adopts it

**Files:**
- Create: `src/lib/skillLevel.ts`
- Create: `src/lib/__tests__/skillLevel.test.ts`
- Create: `src/components/ui/SkillPill.tsx`
- Modify: `src/components/training/crossfit/SwipeableMovementCard.tsx:240-269, 383-430`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/skillLevel.test.ts`:

```ts
import { skillFill } from "../skillLevel";

describe("skillFill", () => {
  it("Beginner lights one segment, brand tone", () => {
    expect(skillFill("Beginner")).toEqual({ filled: 1, tone: "brand" });
  });
  it("Intermediate lights two, warning tone", () => {
    expect(skillFill("Intermediate")).toEqual({ filled: 2, tone: "warning" });
  });
  it("Advanced lights all three, danger tone", () => {
    expect(skillFill("Advanced")).toEqual({ filled: 3, tone: "danger" });
  });
  it("anything else lights nothing", () => {
    expect(skillFill(null)).toEqual({ filled: 0, tone: null });
    expect(skillFill(undefined)).toEqual({ filled: 0, tone: null });
    expect(skillFill("Expert")).toEqual({ filled: 0, tone: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/skillLevel.test.ts`
Expected: FAIL — `Cannot find module '../skillLevel'`.

- [ ] **Step 3: Write the rule**

Create `src/lib/skillLevel.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/skillLevel.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the pill**

Create `src/components/ui/SkillPill.tsx`:

```tsx
// The 3-segment skill pill: 1 green / 2 amber / 3 red. Extracted from the
// curated Exercises card so the captured card reads identically.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme/tokens";
import { skillFill } from "@/src/lib/skillLevel";

interface SkillPillProps {
  level: string | null | undefined;
  /** Also print the level word beside the pill, in the pill's colour. */
  showLabel?: boolean;
}

const TONE = { brand: colors.brand, warning: colors.warning, danger: colors.danger } as const;

export function SkillPill({ level, showLabel = false }: SkillPillProps) {
  const { filled, tone } = skillFill(level);
  const lit = tone ? TONE[tone] : colors.border;
  return (
    <View style={styles.row} accessibilityLabel={level ? `Skill: ${level}` : undefined}>
      <View style={styles.pill}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i === 0 && styles.segmentLeft,
              i === 2 && styles.segmentRight,
              { backgroundColor: i < filled ? lit : colors.border },
            ]}
          />
        ))}
      </View>
      {showLabel && level ? <Text style={[styles.label, { color: lit }]}>{level}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { flexDirection: "row", height: 8, width: 40, gap: 2 },
  segment: { flex: 1, height: "100%" },
  segmentLeft: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  segmentRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  label: { fontSize: 11.5, fontWeight: "600" },
});
```

Note: the empty-segment colour moves from the old hardcoded `#374151` to `colors.border` (`#1F2937`) — one step darker, on purpose: raw hex is not allowed outside tokens and `border` is the nearest neutral.

- [ ] **Step 6: Switch the curated card to the shared pill**

In `src/components/training/crossfit/SwipeableMovementCard.tsx`:

Add the imports near the other component imports:
```tsx
import { SkillPill } from "@/src/components/ui/SkillPill";
import { colors as tokens, tint } from "@/src/theme/tokens";
```
(The file already imports `colors` from the legacy shim as `colors`; keep that import untouched and use `tokens` only for the two lines below.)

Replace lines 240–269 (the `{/* Skill Level Pill */}` comment through the closing `</View>` of `styles.skillPill`) with:
```tsx
              <SkillPill level={movement.skill_level} />
```

In `styles`, replace `tierBadge` and `tierBadgeText` (lines 383–397) with:
```ts
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: tint(tokens.tier),
    borderWidth: 1,
    borderColor: tint(tokens.tier, 0.3),
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.tier,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
```

Delete the now-unused styles `skillPill`, `skillSegment`, `skillSegmentLeft`, `skillSegmentMiddle`, `skillSegmentRight`, `skillSegmentEmpty`, `skillSegmentFilledBeginner`, `skillSegmentFilledIntermediate`, `skillSegmentFilledAdvanced` (lines 398–430).

- [ ] **Step 7: Typecheck + lint the file**

Run: `npx tsc --noEmit && npx eslint src/components/training/crossfit/SwipeableMovementCard.tsx src/components/ui/SkillPill.tsx`
Expected: exit 0, no new warnings beyond the file's pre-existing raw-colour ones.

- [ ] **Step 8: Checkpoint** — "refactor(exercises): shared SkillPill; tier badge on token".

---

### Task 5: Pure card facts (tested)

**Files:**
- Create: `src/lib/catalogCardFacts.ts`
- Create: `src/lib/__tests__/catalogCardFacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/catalogCardFacts.test.ts`:

```ts
import { catalogCardFacts } from "../catalogCardFacts";
import type { CatalogEntry } from "../../types/capture";

const base: CatalogEntry = {
  exerciseId: "e1",
  name: "Alternating Chest Fly",
  imageUrl: null,
  skillLevel: "Intermediate",
  equipmentTypes: ["Dumbbell", "Bench"],
  muscles: [
    { name: "Chest", isPrimary: true },
    { name: "Shoulders", isPrimary: false },
  ],
  goalTypes: [],
  category: "Weightlifting",
  tier: 2,
  scoringTypes: ["Load", "Reps"],
  sources: [{
    sourceId: "s1", platform: "instagram", sourceUrl: "https://x", posterHandle: "jlieb_fit",
    thumbnailUrl: null, capturedAt: "2026-09-01T00:00:00Z",
  }],
};

describe("catalogCardFacts", () => {
  it("splits primary from secondary muscles", () => {
    const f = catalogCardFacts(base);
    expect(f.primaryMuscle).toBe("Chest");
    expect(f.secondaryMuscles).toEqual(["Shoulders"]);
  });

  it("several primaries: first is the large icon, the rest join the secondaries", () => {
    const f = catalogCardFacts({ ...base, muscles: [
      { name: "Quads", isPrimary: true }, { name: "Glutes", isPrimary: true }, { name: "Core", isPrimary: false },
    ]});
    expect(f.primaryMuscle).toBe("Quads");
    expect(f.secondaryMuscles).toEqual(["Glutes", "Core"]);
  });

  it("no primary flagged: first muscle stands in as primary", () => {
    const f = catalogCardFacts({ ...base, muscles: [{ name: "Core", isPrimary: false }] });
    expect(f.primaryMuscle).toBe("Core");
    expect(f.secondaryMuscles).toEqual([]);
  });

  it("no muscles at all", () => {
    const f = catalogCardFacts({ ...base, muscles: [] });
    expect(f.primaryMuscle).toBeNull();
    expect(f.secondaryMuscles).toEqual([]);
  });

  it("badge: tier 1–3 → Tier n; tier 0 → Core; null → none", () => {
    expect(catalogCardFacts({ ...base, tier: 2 }).badge).toEqual({ kind: "tier", label: "Tier 2" });
    expect(catalogCardFacts({ ...base, tier: 0 }).badge).toEqual({ kind: "core", label: "Core" });
    expect(catalogCardFacts({ ...base, tier: null }).badge).toBeNull();
  });

  it("creator: handle, else platform, else null", () => {
    expect(catalogCardFacts(base).creator).toBe("@jlieb_fit");
    expect(catalogCardFacts({ ...base, sources: [{ ...base.sources[0], posterHandle: null }] }).creator).toBe("instagram");
    expect(catalogCardFacts({ ...base, sources: [] }).creator).toBeNull();
  });

  it("passes skill, equipment and scoring through untouched", () => {
    const f = catalogCardFacts(base);
    expect(f.skillLevel).toBe("Intermediate");
    expect(f.equipment).toEqual(["Dumbbell", "Bench"]);
    expect(f.scoringTypes).toEqual(["Load", "Reps"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/catalogCardFacts.test.ts`
Expected: FAIL — `Cannot find module '../catalogCardFacts'`.

- [ ] **Step 3: Write the facts function**

Create `src/lib/catalogCardFacts.ts`:

```ts
// What the captured-exercise card shows, derived once from a CatalogEntry so
// the JSX is a plain renderer and this rule set is testable on its own.
import type { CatalogEntry } from "@/src/types/capture";

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
  /** Small, dimmed icons — every other muscle, in catalogue order. */
  secondaryMuscles: string[];
  scoringTypes: string[];
  /** "@handle", or the platform name when the post had no handle, or null. */
  creator: string | null;
}

export function catalogCardFacts(entry: CatalogEntry): CatalogCardFacts {
  const primaryIdx = entry.muscles.findIndex((m) => m.isPrimary);
  const idx = primaryIdx >= 0 ? primaryIdx : (entry.muscles.length ? 0 : -1);
  const primaryMuscle = idx >= 0 ? entry.muscles[idx].name : null;
  const secondaryMuscles = entry.muscles.filter((_, i) => i !== idx).map((m) => m.name);

  let badge: CardBadge | null = null;
  if (entry.tier === 0) badge = { kind: "core", label: "Core" };
  else if (entry.tier != null && entry.tier > 0) badge = { kind: "tier", label: `Tier ${entry.tier}` };

  const src = entry.sources[0];
  const creator = src ? (src.posterHandle ? `@${src.posterHandle}` : src.platform) : null;

  return {
    badge,
    skillLevel: entry.skillLevel,
    equipment: entry.equipmentTypes,
    primaryMuscle,
    secondaryMuscles,
    scoringTypes: entry.scoringTypes,
    creator,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/catalogCardFacts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Checkpoint** — "feat(exercises): catalogCardFacts".

---

### Task 6: Muscle Groups picker tiles

**Files:**
- Modify: `src/components/training/daily/MuscleGroupPicker.tsx:1-14, 62-81, 106-115`

- [ ] **Step 1: Swap the tile art**

In `src/components/training/daily/MuscleGroupPicker.tsx`:

Replace the header comment (lines 1–4) with:
```tsx
// mobile/src/components/training/daily/MuscleGroupPicker.tsx
// One tile per region, grouped, with Select all per group. Multi-select.
// Tiles show the shared muscle picture (MuscleIcon); "Full Body" is a tag,
// not a muscle, and keeps the body figure with every region lit. Primary
// muscles only — said in the sub-line so nobody wonders why a
// triceps-secondary workout is missing.
```

Add the import after the `BodyFigure` import (line 11):
```tsx
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
```

Delete the `BACK_ONLY` constant and its comment (lines 13–14) — the pictures carry their own view now.

Replace the tile body (lines 71–76, the `<BodyFigure … />` element) with:
```tsx
                      {full ? (
                        <BodyFigure
                          view="front"
                          width={46}
                          fillFor={() => (on ? colors.brand : colors.textMuted)}
                        />
                      ) : (
                        <MuscleIcon muscle={m} size={56} />
                      )}
```

- [ ] **Step 2: Tidy the tile style comment**

In `styles.tile` (lines 106–112) replace the two comment lines
```ts
    // The figure's silhouette is drawn in surface2, so the tile sits one
    // step darker or the body vanishes and only the region floats.
```
with
```ts
    // One step darker than the pictures' own surface so the Full Body figure
    // (drawn in surface2) still reads; the icon tiles match it for consistency.
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `BACK_ONLY` is referenced anywhere else, `grep -rn BACK_ONLY src` — it is not, per the current tree.)

- [ ] **Step 4: Checkpoint** — "feat(filters): muscle picker tiles use MuscleIcon".

---

### Task 7: Captured-exercise card — Option A layout

**Files:**
- Modify: `src/components/training/daily/SwipeableCatalogCard.tsx` (whole render + styles)

- [ ] **Step 1: Replace the imports**

Replace lines 6–14 with:
```tsx
import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ChevronRight, Hash, Weight, Timer, Target } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { deleteCatalogExercise } from "@/src/lib/supabase/capture";
import { catalogCardFacts } from "@/src/lib/catalogCardFacts";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { SkillPill } from "@/src/components/ui/SkillPill";
import type { CatalogEntry } from "@/src/types/capture";
```

Directly under `const CARD_RADIUS = 12;` add:
```tsx
const THUMB = 76;
const PRIMARY_ICON = 36;
const SECONDARY_ICON = 26;

/** One glyph per scoring type; anything unfamiliar gets a target. */
const SCORE_ICON: Record<string, LucideIcon> = { Reps: Hash, Load: Weight, Time: Timer };
const scoreIcon = (name: string): LucideIcon => SCORE_ICON[name] ?? Target;
```

- [ ] **Step 2: Replace the card JSX**

Replace everything from `<TouchableOpacity` (line 77) through its closing `</TouchableOpacity>` (line 112) with:

```tsx
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}. Open the exercise.`}
      >
        {/* The exercise's own picture, never the post it came from — that
            belongs to the workout card. No picture yet: an empty square holds
            the slot so every row's text lines up. */}
        {entry.imageUrl ? (
          <Image source={{ uri: entry.imageUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}

        <View style={styles.body}>
          {/* Row 1: name + rank */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{entry.name}</Text>
            {facts.badge && (
              <View style={[styles.badge, facts.badge.kind === "core" ? styles.badgeCore : styles.badgeTier]}>
                <Text style={[styles.badgeText, facts.badge.kind === "core" ? styles.badgeTextCore : styles.badgeTextTier]}>
                  {facts.badge.label}
                </Text>
              </View>
            )}
          </View>

          {/* Row 2: skill │ equipment │ muscles — each part and its divider
              vanish together when there is nothing to show. */}
          {(facts.skillLevel || facts.equipment.length > 0 || facts.primaryMuscle) && (
            <View style={styles.rail}>
              {facts.skillLevel && <SkillPill level={facts.skillLevel} showLabel />}
              {facts.skillLevel && facts.equipment.length > 0 && <View style={styles.divider} />}
              {facts.equipment.length > 0 && (
                <View style={styles.equipment}>
                  {facts.equipment.map((e) => (
                    <EquipmentGlyph key={e} name={e} size={18} color={colors.text} />
                  ))}
                </View>
              )}
              {(facts.skillLevel || facts.equipment.length > 0) && facts.primaryMuscle && <View style={styles.divider} />}
              {facts.primaryMuscle && (
                <View style={styles.muscles}>
                  <MuscleIcon muscle={facts.primaryMuscle} size={PRIMARY_ICON} />
                  {facts.secondaryMuscles.map((m) => (
                    <MuscleIcon key={m} muscle={m} size={SECONDARY_ICON} dim />
                  ))}
                  <View>
                    <Text style={styles.musclePrimary}>{facts.primaryMuscle}</Text>
                    {facts.secondaryMuscles.length > 0 && (
                      <Text style={styles.muscleSecondary} numberOfLines={1}>
                        {facts.secondaryMuscles.join(", ")}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Row 3: how it's scored, and who it came from. Credit where it's
              due, but not a second tap target: the whole card is the exercise. */}
          {(facts.scoringTypes.length > 0 || facts.creator) && (
            <View style={styles.footer}>
              {facts.scoringTypes.map((s) => {
                const Icon = scoreIcon(s);
                return (
                  <View key={s} style={styles.score}>
                    <Icon size={13} color={colors.textMuted} strokeWidth={1.8} />
                    <Text style={styles.scoreText}>{s}</Text>
                  </View>
                );
              })}
              <View style={{ flex: 1 }} />
              {facts.creator && <Text style={styles.creator}>{facts.creator}</Text>}
            </View>
          )}
        </View>

        <View style={styles.chevron}>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
```

And at the top of the component body, right after `const close = …;` (line 31), add:
```tsx
  const facts = catalogCardFacts(entry);
```

- [ ] **Step 3: Replace the styles**

Replace the whole `styles` block (lines 117–133) with:

```tsx
const styles = StyleSheet.create({
  // The gap between cards lives out here: inside the Swipeable it would leave
  // a stripe of red showing under the next card.
  swipeContainer: { marginBottom: spacing.md },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden",
  },
  // Inset and rounded on its own — the same treatment as the curated
  // Exercises page, so the two lists read as one family.
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.row, alignSelf: "flex-start" },
  thumbEmpty: { backgroundColor: colors.surface },
  body: { flex: 1, minWidth: 0, gap: spacing.sm },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  badge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeTier: { backgroundColor: tint(colors.tier), borderColor: tint(colors.tier, 0.3) },
  badgeCore: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  badgeText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  badgeTextTier: { color: colors.tier },
  badgeTextCore: { color: colors.brand },
  rail: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  divider: { width: 1, height: 18, backgroundColor: colors.border },
  equipment: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muscles: { flexDirection: "row", alignItems: "center", gap: 6 },
  musclePrimary: { fontSize: 11.5, fontWeight: "600", color: colors.text, lineHeight: 14 },
  muscleSecondary: { fontSize: 11.5, color: colors.textMuted, lineHeight: 14 },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  score: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  scoreText: { fontSize: 11.5, color: colors.textMuted },
  creator: { fontSize: 12, color: colors.textFaint },
  chevron: { alignSelf: "center" },
});
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/training/daily/SwipeableCatalogCard.tsx`
Expected: exit 0, no warnings (every colour is a token).

- [ ] **Step 5: Run the whole test suite**

Run: `npx jest`
Expected: all suites PASS, including the three new ones.

- [ ] **Step 6: Checkpoint** — "feat(exercises): Option A captured-exercise card".

---

### Task 8: Licence credit on the About screen

**Files:**
- Modify: `src/components/profile/AboutScreen.tsx:39-41, 134-139`

- [ ] **Step 1: Add the credit line**

Directly after the copyright `<Text>` (line 41), add:
```tsx
        <Text style={styles.credit}>
          Muscle icons by cube29 – Flaticon
        </Text>
```

In `styles`, after `copyright` (line 139), add:
```ts
  credit: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
```
(This file predates the tokens system and is raw-hex throughout; matching its own style is the right call here rather than importing tokens for one line.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Checkpoint** — "chore(about): Flaticon muscle-icon credit".

---

### Task 9: On-device verification

**Files:** none (verification only). Use the `FitTracker-walk3` simulator (dev client installed, Brian signed in) and a Metro port nobody else is using — `8097` worked last time. See memory notes on simulator isolation.

- [ ] **Step 1: Start Metro on the isolated port and open the dev client on walk3**

Run from `mobile/`: `npx expo start --dev-client --port 8097`
Then open the FitTracker Local dev client on `FitTracker-walk3` and connect to that port.

- [ ] **Step 2: Captured Exercises list (Training › flame › Exercises)**

Check, and screenshot each:
- Thumbnails are rounded and inset (not flush to the card edge).
- A card with a long name ("Alternating Cossack Squat To Halo") wraps the name and the icon rail still aligns.
- Skill pill shows 1/2/3 segments in green/amber/red with the word beside it.
- Equipment glyphs render (Dumbbell, Bench, Kettlebell, Floor…).
- Primary muscle icon is large; secondaries small and dimmed; names under them.
- Score chips (Reps / Load / Time) and the `@handle` on the last row.
- Tier badge: at least one "TIER n" card; find or note a "CORE" (tier 0) card if any exist.
- Swipe left → Remove still works and the red action panel's corner matches the card.
- Tap a card → exercise page opens as before.

- [ ] **Step 3: Muscle Groups picker (Filters › Muscle groups)**

Check, and screenshot:
- All 18 tiles show a picture; Full Body shows the lit body figure.
- Tapping a tile highlights it; Select all / Clear per group still works; Done returns with filters applied.

- [ ] **Step 4: Curated Exercises page (Training › dumbbell › Exercises)**

Check the skill pill and Tier badge look as before (pill segments, blue badge) — this is the regression check for the `SkillPill` extraction.

- [ ] **Step 5: About screen (Profile › About)**

Check the "Muscle icons by cube29 – Flaticon" line sits under the copyright.

- [ ] **Step 6: Report**

Post the screenshots and a one-line verdict per screen. Stop; Brian decides on committing and merging.
