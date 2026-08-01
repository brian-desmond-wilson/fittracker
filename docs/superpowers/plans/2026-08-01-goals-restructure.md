# Goals Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Goals page into true goals (Body / Nutrition / Hydration sections), a new Tracking Settings page (meal times, water pace window, water display prefs), and a Personal Details card on the Profile page (height, birthdate, sex, health notes, derived current weight) — migrating every touched screen to the style guide.

**Architecture:** Three full-screen modal screens wired through `mobile/app/(tabs)/profile.tsx` (existing pattern). Pure logic extracted to `mobile/src/lib/bodyUnits.ts` and `mobile/src/lib/timeFields.ts` with unit tests. One additive Supabase migration adds `birthdate`, `sex`, `health_notes` to `profiles`. All touched screens adopt `@/src/theme/tokens` + `ui/` primitives per `docs/STYLE_GUIDE.md`.

**Tech Stack:** React Native (Expo), TypeScript, Supabase (untyped client — column names verified by hand), Jest, lucide-react-native, `@react-native-community/datetimepicker`.

**Spec:** `docs/superpowers/specs/2026-08-01-goals-restructure-design.md`

**Execution amendments to the spec (decided at planning):**
1. The spec said the screens keep a "labelled '‹ Profile' back bar retokenized per rule 5". The migrated reference sibling (`NutritionPreferencesScreen`) instead uses `Screen variant="detail"` (chevron back, centred bar title) — the sanctioned detail chrome. All three screens here do the same. Since `ui/Screen`'s ScrollView does not set `keyboardShouldPersistTaps` (rule 22 requires it for form scrollers), form screens use `Screen scroll={false}` and own their scroller: `paddingHorizontal: spacing.screenGutter` + `paddingBottom: insets.bottom + spacing.xxl` on the content container.
2. Current weight is read from `weight_logs.weight_lbs` (the table stores lbs, not kg — no conversion).

**Commit policy note:** `mobile/CLAUDE.md` says commit only when the user asks. The user authorizes the per-task commits written into this plan by approving plan execution; do NOT push, and do NOT merge to main without being asked.

**Working directory for all commands:** repo root of the worktree. Test/lint/tsc commands run from `mobile/`.

---

### Task 1: `bodyUnits.ts` — body-measurement conversions and parsing (TDD)

Pure helpers moved out of `GoalsScreen.tsx` so GoalsScreen and ProfileScreen can share them, plus `ageFromBirthdate` for the new birthdate field.

**Files:**
- Create: `mobile/src/lib/bodyUnits.ts`
- Test: `mobile/src/lib/__tests__/bodyUnits.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/bodyUnits.test.ts
import {
  ageFromBirthdate,
  cmToFtIn,
  ftInToCm,
  intOrNull,
  kgToLbs,
  lbsToKg,
} from "../bodyUnits";

describe("cmToFtIn / ftInToCm", () => {
  it("converts 172.72 cm to 5 ft 8 in", () => {
    const { ft, inches } = cmToFtIn(172.72);
    expect(ft).toBe(5);
    expect(Math.round(inches)).toBe(8);
  });

  it("round-trips ft/in through cm", () => {
    expect(cmToFtIn(ftInToCm(6, 1)).ft).toBe(6);
    expect(Math.round(cmToFtIn(ftInToCm(6, 1)).inches)).toBe(1);
  });

  it("handles whole-foot heights without spilling into 12 inches", () => {
    const { ft, inches } = cmToFtIn(ftInToCm(6, 0));
    expect(ft).toBe(6);
    expect(Math.round(inches)).toBe(0);
  });
});

describe("kgToLbs / lbsToKg", () => {
  it("converts 79.4 kg to ~175 lbs", () => {
    expect(Math.round(kgToLbs(79.4))).toBe(175);
  });

  it("round-trips", () => {
    expect(kgToLbs(lbsToKg(175))).toBeCloseTo(175, 6);
  });
});

describe("intOrNull", () => {
  it("parses a plain integer string", () => {
    expect(intOrNull("160")).toBe(160);
  });
  it("returns null for empty and whitespace", () => {
    expect(intOrNull("")).toBeNull();
    expect(intOrNull("   ")).toBeNull();
  });
  it("returns null for zero, negatives, and garbage", () => {
    expect(intOrNull("0")).toBeNull();
    expect(intOrNull("-5")).toBeNull();
    expect(intOrNull("abc")).toBeNull();
  });
  it("truncates decimals (parseInt semantics, matching old GoalsScreen)", () => {
    expect(intOrNull("160.9")).toBe(160);
  });
});

describe("ageFromBirthdate", () => {
  it("computes age when birthday has passed this year", () => {
    expect(ageFromBirthdate("1990-01-15", new Date(2026, 7, 1))).toBe(36);
  });
  it("computes age when birthday has not yet arrived", () => {
    expect(ageFromBirthdate("1990-12-31", new Date(2026, 7, 1))).toBe(35);
  });
  it("handles the birthday itself", () => {
    expect(ageFromBirthdate("1990-08-01", new Date(2026, 7, 1))).toBe(36);
  });
  it("returns null for empty or malformed input", () => {
    expect(ageFromBirthdate("", new Date(2026, 7, 1))).toBeNull();
    expect(ageFromBirthdate("not-a-date", new Date(2026, 7, 1))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest src/lib/__tests__/bodyUnits.test.ts`
Expected: FAIL — `Cannot find module '../bodyUnits'`

- [ ] **Step 3: Write the implementation**

```ts
// mobile/src/lib/bodyUnits.ts
// Body-measurement conversions and form parsing shared by GoalsScreen
// (target weight) and ProfileScreen (height, birthdate). DB stores metric
// (cm / kg); the UI enters imperial (ft+in / lbs).
import { parseLocalDate } from "./dates";

export const CM_PER_INCH = 2.54;
export const LBS_PER_KG = 2.20462;

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / CM_PER_INCH;
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn - ft * 12;
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_INCH;
}

export function kgToLbs(kg: number): number {
  return kg * LBS_PER_KG;
}

export function lbsToKg(lbs: number): number {
  return lbs / LBS_PER_KG;
}

/** Macro-field parsing: "" -> null, non-positive/garbage -> null. */
export function intOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Whole years old on `today`, or null when birthdate is empty/malformed. */
export function ageFromBirthdate(birthdate: string, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const b = parseLocalDate(birthdate);
  let age = today.getFullYear() - b.getFullYear();
  const hadBirthday =
    today.getMonth() > b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() >= b.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/lib/__tests__/bodyUnits.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/bodyUnits.ts mobile/src/lib/__tests__/bodyUnits.test.ts
git commit -m "feat(goals): bodyUnits helpers — imperial/metric conversions, intOrNull, age (TDD)"
```

---

### Task 2: `timeFields.ts` — hh:mm form helpers (TDD)

Time-field plumbing moved out of `GoalsScreen.tsx` for the Tracking Settings screen's pickers.

**Files:**
- Create: `mobile/src/lib/timeFields.ts`
- Test: `mobile/src/lib/__tests__/timeFields.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/timeFields.test.ts
import {
  dateFromHhmm,
  formatTimeLabel,
  hhmmAscending,
  hhmmFromDate,
} from "../timeFields";

describe("formatTimeLabel", () => {
  it("formats morning times", () => {
    expect(formatTimeLabel("08:05")).toBe("8:05 AM");
  });
  it("formats afternoon times", () => {
    expect(formatTimeLabel("13:30")).toBe("1:30 PM");
  });
  it("formats midnight and noon", () => {
    expect(formatTimeLabel("00:00")).toBe("12:00 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
  });
});

describe("hhmmFromDate / dateFromHhmm", () => {
  it("round-trips through a Date", () => {
    expect(hhmmFromDate(dateFromHhmm("07:45"))).toBe("07:45");
    expect(hhmmFromDate(dateFromHhmm("23:59"))).toBe("23:59");
  });
});

describe("hhmmAscending", () => {
  it("accepts strictly increasing times", () => {
    expect(hhmmAscending("08:00", "12:00", "18:00")).toBe(true);
  });
  it("rejects equal adjacent times", () => {
    expect(hhmmAscending("08:00", "08:00")).toBe(false);
  });
  it("rejects out-of-order times", () => {
    expect(hhmmAscending("12:00", "08:00")).toBe(false);
    expect(hhmmAscending("08:00", "18:00", "12:00")).toBe(false);
  });
  it("is true for zero or one argument", () => {
    expect(hhmmAscending()).toBe(true);
    expect(hhmmAscending("08:00")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest src/lib/__tests__/timeFields.test.ts`
Expected: FAIL — `Cannot find module '../timeFields'`

- [ ] **Step 3: Write the implementation**

```ts
// mobile/src/lib/timeFields.ts
// "HH:MM" form-field helpers for time pickers (Tracking Settings). Zero-padded
// 24h strings sort lexicographically, so ordering checks are string compares.

export function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function hhmmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateFromHhmm(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d;
}

/** True when every time is strictly after the one before it. */
export function hhmmAscending(...times: string[]): boolean {
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= times[i - 1]) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/lib/__tests__/timeFields.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/timeFields.ts mobile/src/lib/__tests__/timeFields.test.ts
git commit -m "feat(goals): timeFields helpers — hh:mm formatting, Date bridging, ordering (TDD)"
```

---

### Task 3: Schema migration — `birthdate`, `sex`, `health_notes` on `profiles`

**Files:**
- Create: `supabase/migrations/20260801120000_profile_personal_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Static personal facts for the Profile page's Personal Details card
-- (spec: docs/superpowers/specs/2026-08-01-goals-restructure-design.md).
-- All nullable, no backfill. Current weight deliberately NOT added here —
-- it is derived from the latest weight_logs row.
ALTER TABLE public.profiles
  ADD COLUMN birthdate DATE,
  ADD COLUMN sex TEXT CHECK (sex IN ('male', 'female')),
  ADD COLUMN health_notes TEXT;
```

- [ ] **Step 2: Push to the database**

Run: `npx supabase db push --yes`
Expected: `Applying migration 20260801120000_profile_personal_fields.sql... Finished supabase db push.`

If push fails on connectivity/auth, STOP and report — do not retry with schema-altering workarounds.

- [ ] **Step 3: Verify the migration is recorded**

Run: `npx supabase migration list 2>&1 | tail -5`
Expected: `20260801120000` listed with matching local and remote entries.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260801120000_profile_personal_fields.sql
git commit -m "feat(profile): add birthdate, sex, health_notes columns to profiles"
```

---

### Task 4: GoalsScreen — restructure into Body / Nutrition / Hydration + token migration

Full rewrite of the file. Height, meal times, water window/bonus-settings and water display prefs leave (Tasks 5–6 rehome them); everything left is a target. Zero raw hex; `ui/` primitives; inline danger error instead of silent `console.error`.

Note: `workout water bonus` stays here (it adjusts the goal), per the spec's IA table.

**Files:**
- Rewrite: `mobile/src/components/profile/GoalsScreen.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// mobile/src/components/profile/GoalsScreen.tsx
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { intOrNull, kgToLbs, lbsToKg } from "@/src/lib/bodyUnits";
import { OZ_PER_LITER } from "@/src/lib/waterUnits";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card, Screen, SectionHeader } from "@/src/components/ui";

interface GoalsScreenProps {
  userId: string;
  initialData: {
    target_weight_kg: string;
    target_calories: string;
    target_protein_g: string;
    target_carbs_g: string;
    target_sodium_mg: string;
    target_fats_g: string;
    target_sugars_g: string;
    target_fiber_g: string;
    target_water_oz: string;
    water_workout_bonus_oz: string;
  };
  onClose: () => void;
  onSave: () => void;
}

type WaterUnit = "oz" | "L";

export function GoalsScreen({ userId, initialData, onClose, onSave }: GoalsScreenProps) {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState(initialData);
  const [waterUnit, setWaterUnit] = useState<WaterUnit>("oz");
  const [waterInput, setWaterInput] = useState(initialData.target_water_oz);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialWeightLbs = (() => {
    const kg = parseFloat(initialData.target_weight_kg);
    if (!isNaN(kg) && kg > 0) return Math.round(kgToLbs(kg)).toString();
    return "";
  })();
  const [weightLbs, setWeightLbs] = useState(initialWeightLbs);

  const handleWaterUnitChange = (next: WaterUnit) => {
    if (next === waterUnit) return;
    const parsed = parseFloat(waterInput);
    if (!isNaN(parsed)) {
      setWaterInput(
        next === "L"
          ? (parsed / OZ_PER_LITER).toFixed(2)
          : Math.round(parsed * OZ_PER_LITER).toString()
      );
    }
    setWaterUnit(next);
  };

  const handleSave = async () => {
    setError(null);
    try {
      setSaving(true);

      let waterOz: number | null = null;
      if (waterInput.trim() !== "") {
        const parsed = parseFloat(waterInput);
        if (isNaN(parsed) || parsed <= 0) {
          setError("Water goal must be a positive number.");
          return;
        }
        waterOz =
          waterUnit === "oz" ? Math.round(parsed) : Math.round(parsed * OZ_PER_LITER);
      }

      const bonusOz =
        formData.water_workout_bonus_oz.trim() === ""
          ? 0
          : Math.max(0, Math.round(parseFloat(formData.water_workout_bonus_oz) || 0));

      let weightKg: number | null = null;
      const lbsN = parseFloat(weightLbs);
      if (!isNaN(lbsN) && lbsN > 0) {
        weightKg = Math.round(lbsToKg(lbsN) * 10) / 10;
      }

      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          target_weight_kg: weightKg,
          target_calories: intOrNull(formData.target_calories),
          target_protein_g: intOrNull(formData.target_protein_g),
          target_carbs_g: intOrNull(formData.target_carbs_g),
          target_sodium_mg: intOrNull(formData.target_sodium_mg),
          target_fats_g: intOrNull(formData.target_fats_g),
          target_sugars_g: intOrNull(formData.target_sugars_g),
          target_fiber_g: intOrNull(formData.target_fiber_g),
          ...(waterOz !== null && { target_water_oz: waterOz }),
          water_workout_bonus_oz: bonusOz,
        })
        .eq("id", userId);

      if (dbError) throw dbError;

      onSave();
      onClose();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen variant="detail" title="Goals" onBack={onClose} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader title="Body" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.label}>Target Weight (lbs)</Text>
            <TextInput
              style={styles.input}
              placeholder="175"
              placeholderTextColor={colors.textMuted}
              value={weightLbs}
              onChangeText={setWeightLbs}
              keyboardType="decimal-pad"
              editable={!saving}
            />
          </Card>

          <SectionHeader title="Nutrition" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.label}>Daily Calorie Goal</Text>
            <TextInput
              style={styles.input}
              placeholder="2000"
              placeholderTextColor={colors.textMuted}
              value={formData.target_calories}
              onChangeText={(t) => setFormData({ ...formData, target_calories: t })}
              keyboardType="number-pad"
              editable={!saving}
            />
            <Text style={styles.label}>Daily Protein Goal (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="150"
              placeholderTextColor={colors.textMuted}
              value={formData.target_protein_g}
              onChangeText={(t) => setFormData({ ...formData, target_protein_g: t })}
              keyboardType="number-pad"
              editable={!saving}
            />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="225"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_carbs_g}
                  onChangeText={(t) => setFormData({ ...formData, target_carbs_g: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sodium (mg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2300"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_sodium_mg}
                  onChangeText={(t) => setFormData({ ...formData, target_sodium_mg: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="65"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_fats_g}
                  onChangeText={(t) => setFormData({ ...formData, target_fats_g: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sugars (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_sugars_g}
                  onChangeText={(t) => setFormData({ ...formData, target_sugars_g: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
            </View>
            <Text style={styles.label}>Fiber (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="30"
              placeholderTextColor={colors.textMuted}
              value={formData.target_fiber_g}
              onChangeText={(t) => setFormData({ ...formData, target_fiber_g: t })}
              keyboardType="number-pad"
              editable={!saving}
            />
          </Card>

          <SectionHeader title="Hydration" />
          <Card variant="panel" style={styles.sectionCard}>
            <View style={styles.labelRow}>
              <Text style={styles.labelInline}>Daily Water Goal</Text>
              <View style={styles.segmentTrack}>
                {(["oz", "L"] as WaterUnit[]).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.segment, waterUnit === unit && styles.segmentActive]}
                    onPress={() => handleWaterUnitChange(unit)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Enter water goal in ${unit}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        waterUnit === unit && styles.segmentTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TextInput
              style={styles.input}
              placeholder={waterUnit === "oz" ? "64" : "2"}
              placeholderTextColor={colors.textMuted}
              value={waterInput}
              onChangeText={setWaterInput}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            <Text style={styles.label}>Workout Water Bonus (oz)</Text>
            <Text style={styles.fieldHelp}>
              Extra oz added to your goal automatically on days you work out. Set to 0
              to disable.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              value={formData.water_workout_bonus_oz}
              onChangeText={(t) =>
                setFormData({ ...formData, water_workout_bonus_oz: t })
              }
              keyboardType="number-pad"
              editable={!saving}
            />
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Save Changes" onPress={handleSave} loading={saving} fluid />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: { marginBottom: spacing.sm },
  // Rule 19: one form-label token app-wide. The label owns the field rhythm.
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  labelInline: { ...typography.section, marginTop: 0, marginBottom: 0 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  // Rule 21 segmented control: surface2 track, active = solid brand + onBrand.
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: 2,
    gap: 2,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  fieldHelp: { ...typography.caption, marginBottom: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
});
```

- [ ] **Step 2: Run the style gates on the file**

```bash
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(' mobile/src/components/profile/GoalsScreen.tsx
grep -n '@/src/lib/colors' mobile/src/components/profile/GoalsScreen.tsx
```
Expected: both return nothing.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: errors ONLY in `app/(tabs)/profile.tsx` about the changed `GoalsScreenProps` shape (height/meal/water-settings fields no longer accepted). Task 8 fixes the wiring; any error in any other file is a real defect — fix it now.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/profile/GoalsScreen.tsx
git commit -m "feat(goals): restructure GoalsScreen into Body/Nutrition/Hydration, migrate to tokens"
```

---

### Task 5: TrackingSettingsScreen — new screen for meal times + water tracking prefs

**Files:**
- Create: `mobile/src/components/profile/TrackingSettingsScreen.tsx`

- [ ] **Step 1: Create the file**

```tsx
// mobile/src/components/profile/TrackingSettingsScreen.tsx
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/src/lib/supabase";
import {
  dateFromHhmm,
  formatTimeLabel,
  hhmmAscending,
  hhmmFromDate,
} from "@/src/lib/timeFields";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card, Screen, SectionHeader } from "@/src/components/ui";

interface TrackingSettingsScreenProps {
  userId: string;
  initialData: {
    breakfast_time: string; // "HH:MM"
    lunch_time: string;
    dinner_time: string;
    water_window_start: string;
    water_window_end: string;
    water_display_unit: "oz" | "L";
    water_only_counts: boolean;
  };
  onClose: () => void;
  onSave: () => void;
}

type PickerTarget = "breakfast" | "lunch" | "dinner" | "start" | "end";

const PICKER_TITLES: Record<PickerTarget, string> = {
  breakfast: "Breakfast Time",
  lunch: "Lunch Time",
  dinner: "Dinner Time",
  start: "Window Start",
  end: "Window End",
};

// Narrowed to the string-valued time fields only — typing this as
// `keyof initialData` would admit the boolean `water_only_counts` and break
// the computed-key string assignment in applyPicker.
type TimeFieldKey =
  | "breakfast_time"
  | "lunch_time"
  | "dinner_time"
  | "water_window_start"
  | "water_window_end";

const PICKER_FIELDS: Record<PickerTarget, TimeFieldKey> = {
  breakfast: "breakfast_time",
  lunch: "lunch_time",
  dinner: "dinner_time",
  start: "water_window_start",
  end: "water_window_end",
};

export function TrackingSettingsScreen({
  userId,
  initialData,
  onClose,
  onSave,
}: TrackingSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const pickerValue = (t: PickerTarget): string => formData[PICKER_FIELDS[t]] as string;

  const applyPicker = (t: PickerTarget, hhmm: string) =>
    setFormData((prev) => ({ ...prev, [PICKER_FIELDS[t]]: hhmm }));

  const handleSave = async () => {
    setError(null);
    if (!hhmmAscending(formData.breakfast_time, formData.lunch_time, formData.dinner_time)) {
      setError("Meal times must be in order: breakfast, then lunch, then dinner.");
      return;
    }
    if (!hhmmAscending(formData.water_window_start, formData.water_window_end)) {
      setError("Water window end must be after its start.");
      return;
    }
    try {
      setSaving(true);
      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          breakfast_time: formData.breakfast_time,
          lunch_time: formData.lunch_time,
          dinner_time: formData.dinner_time,
          water_window_start: formData.water_window_start,
          water_window_end: formData.water_window_end,
          water_display_unit: formData.water_display_unit,
          water_only_counts: formData.water_only_counts,
        })
        .eq("id", userId);
      if (dbError) throw dbError;
      onSave();
      onClose();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const timeField = (label: string, target: PickerTarget) => (
    <View style={styles.halfField}>
      <Text style={styles.subLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setPickerTarget(target)}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={`${PICKER_TITLES[target]}: ${formatTimeLabel(pickerValue(target))}`}
      >
        <Text style={styles.timeButtonText}>{formatTimeLabel(pickerValue(target))}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen variant="detail" title="Tracking Settings" onBack={onClose} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader title="Meal Times" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.fieldHelp}>
              When you typically eat. The pace coach uses these to suggest catch-up
              amounts by your next meal.
            </Text>
            <View style={styles.row}>
              {timeField("Breakfast", "breakfast")}
              {timeField("Lunch", "lunch")}
            </View>
            <View style={styles.row}>
              {timeField("Dinner", "dinner")}
              <View style={styles.halfField} />
            </View>
          </Card>

          <SectionHeader title="Water" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.label}>Pace Window</Text>
            <Text style={styles.fieldHelp}>
              Hours we use to compute your hydration pace each day.
            </Text>
            <View style={styles.row}>
              {timeField("Start", "start")}
              {timeField("End", "end")}
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.labelInline}>Display Water In</Text>
              <View style={styles.segmentTrack}>
                {(["oz", "L"] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.segment,
                      formData.water_display_unit === unit && styles.segmentActive,
                    ]}
                    onPress={() => setFormData({ ...formData, water_display_unit: unit })}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Display water in ${unit}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        formData.water_display_unit === unit && styles.segmentTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={styles.fieldHelp}>
              Where you see water amounts on the Water Intake screen.
            </Text>

            <View style={styles.switchRow}>
              <View style={styles.flex}>
                {/* Rule 19: a label beside a control in a row is row copy, not
                    a section label. */}
                <Text style={styles.switchLabel}>Only Water Counts</Text>
                <Text style={styles.fieldHelp}>
                  When on, coffee/tea/juice/other don't count toward your daily goal
                  or streaks. They still show up in History.
                </Text>
              </View>
              <Switch
                value={formData.water_only_counts}
                onValueChange={(v) => setFormData({ ...formData, water_only_counts: v })}
                trackColor={{ false: colors.surface2, true: colors.brand }}
                thumbColor={colors.onBrand}
                disabled={saving}
              />
            </View>
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Save Changes" onPress={handleSave} loading={saving} fluid />
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === "ios" ? (
        <Modal
          visible={pickerTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={styles.backdrop}>
            <Card variant="panel" style={styles.sheetCard}>
              <Text style={styles.sheetTitle}>
                {pickerTarget ? PICKER_TITLES[pickerTarget] : ""}
              </Text>
              <DateTimePicker
                value={dateFromHhmm(pickerTarget ? pickerValue(pickerTarget) : "08:00")}
                mode="time"
                display="spinner"
                onChange={(_e, picked) => {
                  if (picked && pickerTarget) applyPicker(pickerTarget, hhmmFromDate(picked));
                }}
                textColor={colors.text}
              />
              <Button label="Done" onPress={() => setPickerTarget(null)} fluid />
            </Card>
          </View>
        </Modal>
      ) : (
        pickerTarget !== null && (
          <DateTimePicker
            value={dateFromHhmm(pickerValue(pickerTarget))}
            mode="time"
            display="default"
            onChange={(_e, picked) => {
              const target = pickerTarget;
              setPickerTarget(null);
              if (picked && target) applyPicker(target, hhmmFromDate(picked));
            }}
          />
        )
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: { marginBottom: spacing.sm },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  labelInline: { ...typography.section, marginTop: 0, marginBottom: 0 },
  subLabel: { ...typography.caption, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  timeButtonText: { fontSize: 16, color: colors.text }, // matches input text size
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  halfField: { flex: 1 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: 2,
    gap: 2,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  switchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  switchLabel: { ...typography.body, color: colors.text, fontWeight: "600" },
  fieldHelp: { ...typography.caption, marginBottom: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheetCard: { width: "100%", maxHeight: "100%", gap: spacing.md },
  sheetTitle: { ...typography.titleBar, color: colors.text, textAlign: "center" },
});
```

- [ ] **Step 2: Run the style gates on the file**

```bash
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(' mobile/src/components/profile/TrackingSettingsScreen.tsx
grep -n '@/src/lib/colors' mobile/src/components/profile/TrackingSettingsScreen.tsx
```
Expected: both return nothing.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: same pre-existing `profile.tsx` wiring errors as Task 4 only (fixed in Task 8). No errors in the new file.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/profile/TrackingSettingsScreen.tsx
git commit -m "feat(profile): TrackingSettingsScreen — meal times, water pace window, display prefs"
```

---

### Task 6: ProfileScreen — Personal Details card + token migration

Adds editing (height, birthdate, sex, health notes), a read-only current weight from `weight_logs`, and migrates the whole file.

**Files:**
- Rewrite: `mobile/src/components/profile/ProfileScreen.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// mobile/src/components/profile/ProfileScreen.tsx
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Mail, User } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import { ageFromBirthdate, cmToFtIn, ftInToCm } from "@/src/lib/bodyUnits";
import { getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card, Screen, SectionHeader } from "@/src/components/ui";

type Sex = "male" | "female";

interface ProfileScreenProps {
  userId: string;
  userName: string;
  userEmail: string;
  memberSince: string;
  initialData: {
    height_cm: string;
    birthdate: string; // "YYYY-MM-DD" or ""
    sex: Sex | null;
    health_notes: string;
  };
  onClose: () => void;
  onSave: () => void;
}

export function ProfileScreen({
  userId,
  userName,
  userEmail,
  memberSince,
  initialData,
  onClose,
  onSave,
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBirthdatePicker, setShowBirthdatePicker] = useState(false);

  const initialHeight = (() => {
    const cm = parseFloat(initialData.height_cm);
    if (!isNaN(cm) && cm > 0) {
      const { ft, inches } = cmToFtIn(cm);
      return { ft: ft.toString(), inches: Math.round(inches).toString() };
    }
    return { ft: "", inches: "" };
  })();
  const [heightFt, setHeightFt] = useState(initialHeight.ft);
  const [heightIn, setHeightIn] = useState(initialHeight.inches);
  const [birthdate, setBirthdate] = useState(initialData.birthdate);
  const [sex, setSex] = useState<Sex | null>(initialData.sex);
  const [healthNotes, setHealthNotes] = useState(initialData.health_notes);

  // Latest weigh-in, display only — Track → Weight owns logging.
  const [currentWeightLbs, setCurrentWeightLbs] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("weight_logs")
        .select("weight_lbs")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) {
        setCurrentWeightLbs(Math.round(parseFloat(data[0].weight_lbs.toString())).toString());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const age = ageFromBirthdate(birthdate, new Date());
  const birthdateLabel = birthdate
    ? `${parseLocalDate(birthdate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}${age !== null ? ` (${age})` : ""}`
    : "Not set";

  const handleSave = async () => {
    setError(null);
    try {
      setSaving(true);

      let heightCm: number | null = null;
      const ftN = parseFloat(heightFt);
      const inN = parseFloat(heightIn);
      if (!isNaN(ftN) && ftN >= 0) {
        const cm = ftInToCm(ftN, isNaN(inN) ? 0 : inN);
        heightCm = cm > 0 ? Math.round(cm * 10) / 10 : null;
      }

      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          height_cm: heightCm,
          birthdate: birthdate || null,
          sex,
          health_notes: healthNotes.trim() || null,
        })
        .eq("id", userId);
      if (dbError) throw dbError;
      onSave();
      onClose();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen variant="detail" title="Profile" onBack={onClose} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <User size={icons.xl} color={colors.brand} strokeWidth={icons.strokeWidth} />
            </View>
            <Text style={styles.userName}>{userName || "User"}</Text>
            <View style={styles.emailRow}>
              <Mail size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              <Text style={styles.userEmail}>{userEmail}</Text>
            </View>
          </View>

          <SectionHeader title="Account" />
          <Card variant="panel" style={styles.sectionCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Member since</Text>
              <Text style={styles.infoValue}>{memberSince}</Text>
            </View>
          </Card>

          <SectionHeader title="Personal Details" />
          <Card variant="panel" style={styles.sectionCard}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Height (ft)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  placeholderTextColor={colors.textMuted}
                  value={heightFt}
                  onChangeText={setHeightFt}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Height (in)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="8"
                  placeholderTextColor={colors.textMuted}
                  value={heightIn}
                  onChangeText={setHeightIn}
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              </View>
            </View>

            <Text style={styles.label}>Birthdate</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowBirthdatePicker(true)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Birthdate: ${birthdateLabel}`}
            >
              <Text style={birthdate ? styles.inputText : styles.inputPlaceholder}>
                {birthdateLabel}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Sex</Text>
            <View style={styles.segmentTrack}>
              {(["male", "female"] as Sex[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, sex === value && styles.segmentActive]}
                  onPress={() => setSex((prev) => (prev === value ? null : value))}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Sex: ${value}${sex === value ? ", selected, tap to clear" : ""}`}
                >
                  <Text
                    style={[styles.segmentText, sex === value && styles.segmentTextActive]}
                  >
                    {value === "male" ? "Male" : "Female"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Health Notes</Text>
            <Text style={styles.fieldHelp}>
              Conditions, injuries, or anything else worth remembering.
            </Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="None"
              placeholderTextColor={colors.textMuted}
              value={healthNotes}
              onChangeText={setHealthNotes}
              multiline
              editable={!saving}
            />

            <View style={[styles.infoRow, styles.weightRow]}>
              <Text style={styles.infoLabel}>Current weight</Text>
              <Text style={styles.infoValue}>
                {currentWeightLbs !== null ? `${currentWeightLbs} lbs` : "No weigh-ins yet"}
              </Text>
            </View>
            <Text style={styles.fieldHelp}>
              From your latest weigh-in. Log weight in Track → Weight.
            </Text>
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Save Changes" onPress={handleSave} loading={saving} fluid />
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === "ios" ? (
        <Modal
          visible={showBirthdatePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBirthdatePicker(false)}
        >
          <View style={styles.backdrop}>
            <Card variant="panel" style={styles.sheetCard}>
              <Text style={styles.sheetTitle}>Birthdate</Text>
              <DateTimePicker
                value={birthdate ? parseLocalDate(birthdate) : new Date(1990, 0, 1)}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_e, picked) => {
                  if (picked) setBirthdate(getLocalDateString(picked));
                }}
                textColor={colors.text}
              />
              <Button label="Done" onPress={() => setShowBirthdatePicker(false)} fluid />
            </Card>
          </View>
        </Modal>
      ) : (
        showBirthdatePicker && (
          <DateTimePicker
            value={birthdate ? parseLocalDate(birthdate) : new Date(1990, 0, 1)}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(_e, picked) => {
              setShowBirthdatePicker(false);
              if (picked) setBirthdate(getLocalDateString(picked));
            }}
          />
        )
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: { marginBottom: spacing.sm },
  avatarSection: { alignItems: "center", paddingVertical: spacing.xxl },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: tint(colors.brand),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  userName: { ...typography.titleRoot, color: colors.text, marginBottom: spacing.sm },
  emailRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  userEmail: { ...typography.body, color: colors.textMuted },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weightRow: { marginTop: spacing.sm },
  infoLabel: { ...typography.body, color: colors.textMuted },
  infoValue: { ...typography.rowTitle, color: colors.text },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  inputText: { fontSize: 16, color: colors.text },
  inputPlaceholder: { fontSize: 16, color: colors.textMuted },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: 2,
    gap: 2,
    alignSelf: "flex-start",
  },
  segment: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  fieldHelp: { ...typography.caption, marginBottom: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheetCard: { width: "100%", maxHeight: "100%", gap: spacing.md },
  sheetTitle: { ...typography.titleBar, color: colors.text, textAlign: "center" },
});
```

- [ ] **Step 2: Run the style gates on the file**

```bash
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(' mobile/src/components/profile/ProfileScreen.tsx
grep -n '@/src/lib/colors' mobile/src/components/profile/ProfileScreen.tsx
```
Expected: both return nothing.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: `profile.tsx` wiring errors only (Task 8). No errors in this file.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/profile/ProfileScreen.tsx
git commit -m "feat(profile): Personal Details card — height, birthdate, sex, health notes; token migration"
```

---

### Task 7: ProfileMenu — Tracking Settings item + token migration

**Files:**
- Rewrite: `mobile/src/components/profile/ProfileMenu.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// mobile/src/components/profile/ProfileMenu.tsx
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Bell,
  Calendar,
  ChevronRight,
  Info,
  Salad,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  User,
  Wrench,
} from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}

interface ProfileMenuProps {
  isAdmin: boolean;
  onProfilePress: () => void;
  onGoalsPress: () => void;
  onNutritionPress: () => void;
  onTrackingSettingsPress: () => void;
  onRoutinesPress: () => void;
  onNotificationsPress: () => void;
  onAboutPress: () => void;
  onDevTasksPress: () => void;
  onSignOut: () => void;
}

export function ProfileMenu({
  isAdmin,
  onProfilePress,
  onGoalsPress,
  onNutritionPress,
  onTrackingSettingsPress,
  onRoutinesPress,
  onNotificationsPress,
  onAboutPress,
  onDevTasksPress,
  onSignOut,
}: ProfileMenuProps) {
  const menuIcon = (Icon: typeof User) => (
    <Icon size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
  );

  const userMenuItems: MenuItem[] = [
    { id: "profile", label: "Profile", icon: menuIcon(User), onPress: onProfilePress },
    { id: "goals", label: "Goals", icon: menuIcon(Target), onPress: onGoalsPress },
    {
      id: "nutrition",
      label: "Nutrition Preferences",
      icon: menuIcon(Salad),
      onPress: onNutritionPress,
    },
    {
      id: "tracking-settings",
      label: "Tracking Settings",
      icon: menuIcon(SlidersHorizontal),
      onPress: onTrackingSettingsPress,
    },
    { id: "routines", label: "Routines", icon: menuIcon(Calendar), onPress: onRoutinesPress },
    {
      id: "notifications",
      label: "Notifications",
      icon: menuIcon(Bell),
      onPress: onNotificationsPress,
    },
    { id: "about", label: "About", icon: menuIcon(Info), onPress: onAboutPress },
  ];

  const adminMenuItems: MenuItem[] = [
    {
      id: "dev-tasks",
      label: "Development Tasks",
      icon: menuIcon(Wrench),
      onPress: onDevTasksPress,
    },
  ];

  const renderSection = (items: MenuItem[]) => (
    <View style={styles.menuSection}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.menuItem}
          onPress={item.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.iconContainer}>{item.icon}</View>
            <Text style={styles.menuItemText}>{item.label}</Text>
          </View>
          <ChevronRight size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>Profile</Text>

      {renderSection(userMenuItems)}

      {isAdmin && (
        <>
          <View style={styles.adminBadgeContainer}>
            <ShieldCheck size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
            <Text style={styles.adminBadgeText}>Administrator Access</Text>
          </View>
          {renderSection(adminMenuItems)}
        </>
      )}

      <Button variant="destructive" label="Sign Out" onPress={onSignOut} fluid />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: spacing.screenGutter,
    paddingBottom: 100, // matches pre-migration reserve above the tab bar
  },
  pageTitle: { ...typography.titleRoot, color: colors.text, marginBottom: spacing.xxl },
  menuSection: {
    backgroundColor: colors.surface,
    borderRadius: radii.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  // Rule 20: a tappable disclosure row is a control — rowTitle, not section.
  menuItemText: { ...typography.rowTitle, color: colors.text },
  adminBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: tint(colors.brand),
    borderWidth: 1,
    borderColor: tint(colors.brand, 0.3),
    borderRadius: radii.control,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  adminBadgeText: { ...typography.buttonSm, color: colors.brand },
});
```

- [ ] **Step 2: Run the style gates on the file**

```bash
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(' mobile/src/components/profile/ProfileMenu.tsx
grep -n '@/src/lib/colors' mobile/src/components/profile/ProfileMenu.tsx
```
Expected: both return nothing.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: `profile.tsx` errors only — now including the missing `onTrackingSettingsPress` prop (Task 8 fixes).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/profile/ProfileMenu.tsx
git commit -m "feat(profile): Tracking Settings menu item; migrate ProfileMenu to tokens"
```

---

### Task 8: `profile.tsx` — wiring: data slices, new modal, prop plumbing

**Files:**
- Modify: `mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Update imports, types, and state**

Add the import:

```tsx
import { TrackingSettingsScreen } from "@/src/components/profile/TrackingSettingsScreen";
```

Extend the modal union:

```tsx
type ModalScreen =
  | "profile"
  | "goals"
  | "nutrition"
  | "tracking-settings"
  | "routines"
  | "notifications"
  | "about"
  | "dev-tasks"
  | null;
```

Add the three new personal fields to the `formData` initial state (keep every existing key):

```tsx
  const [formData, setFormData] = useState({
    height_cm: "",
    birthdate: "",
    sex: null as "male" | "female" | null,
    health_notes: "",
    target_weight_kg: "",
    target_calories: "",
    target_protein_g: "",
    target_carbs_g: "",
    target_sodium_mg: "",
    target_fats_g: "",
    target_sugars_g: "",
    target_fiber_g: "",
    target_water_oz: "",
    water_window_start: "08:00",
    water_window_end: "23:00",
    water_workout_bonus_oz: "0",
    water_display_unit: "oz" as "oz" | "L",
    water_only_counts: false,
    breakfast_time: "08:00",
    lunch_time: "12:00",
    dinner_time: "18:00",
  });
```

- [ ] **Step 2: Load the new fields in `loadUserData`**

Inside the `if (profile) { ... setFormData({ ... }) }` block, add alongside `height_cm`:

```tsx
          birthdate: profile.birthdate || "",
          sex: profile.sex === "male" || profile.sex === "female" ? profile.sex : null,
          health_notes: profile.health_notes || "",
```

- [ ] **Step 3: Update the ProfileMenu callsite**

Add the new handler prop (keep the others):

```tsx
        onTrackingSettingsPress={() => setActiveModal("tracking-settings")}
```

- [ ] **Step 4: Re-slice the modal `initialData` props**

Profile modal — replace the existing `<ProfileScreen ... />` with:

```tsx
        <ProfileScreen
          userId={userId}
          userName={userName}
          userEmail={userEmail}
          memberSince={memberSince}
          initialData={{
            height_cm: formData.height_cm,
            birthdate: formData.birthdate,
            sex: formData.sex,
            health_notes: formData.health_notes,
          }}
          onClose={() => setActiveModal(null)}
          onSave={handleGoalsSave}
        />
```

Goals modal — replace the `<GoalsScreen ... />` body with:

```tsx
        <GoalsScreen
          userId={userId}
          initialData={{
            target_weight_kg: formData.target_weight_kg,
            target_calories: formData.target_calories,
            target_protein_g: formData.target_protein_g,
            target_carbs_g: formData.target_carbs_g,
            target_sodium_mg: formData.target_sodium_mg,
            target_fats_g: formData.target_fats_g,
            target_sugars_g: formData.target_sugars_g,
            target_fiber_g: formData.target_fiber_g,
            target_water_oz: formData.target_water_oz,
            water_workout_bonus_oz: formData.water_workout_bonus_oz,
          }}
          onClose={() => setActiveModal(null)}
          onSave={handleGoalsSave}
        />
```

New Tracking Settings modal — insert after the Nutrition Preferences modal, following the same `Modal` pattern:

```tsx
      {/* Tracking Settings Modal */}
      <Modal
        visible={activeModal === "tracking-settings"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <TrackingSettingsScreen
          userId={userId}
          initialData={{
            breakfast_time: formData.breakfast_time,
            lunch_time: formData.lunch_time,
            dinner_time: formData.dinner_time,
            water_window_start: formData.water_window_start,
            water_window_end: formData.water_window_end,
            water_display_unit: formData.water_display_unit,
            water_only_counts: formData.water_only_counts,
          }}
          onClose={() => setActiveModal(null)}
          onSave={handleGoalsSave}
        />
      </Modal>
```

- [ ] **Step 5: Retokenize `profile.tsx`'s own styles**

Add to imports: `import { colors } from "@/src/theme/tokens";`
Replace `color="#22C55E"` on the loading `ActivityIndicator` with `color={colors.brand}`, and in `styles`, replace any `backgroundColor: '#0A0F1E'` with `backgroundColor: colors.bg`.

- [ ] **Step 6: Full gates**

```bash
grep -nE "#[0-9A-Fa-f]{3,8}\b|hsl\(" "mobile/app/(tabs)/profile.tsx"
cd mobile && npx tsc --noEmit && npm run lint && npm test
```
Expected: grep empty; tsc clean (wiring errors from Tasks 4–7 resolved); lint no NEW warnings; all tests pass (321 baseline + new helper tests).

- [ ] **Step 7: Commit**

```bash
git add "mobile/app/(tabs)/profile.tsx"
git commit -m "feat(profile): wire Tracking Settings modal, slice per-screen initialData"
```

---

### Task 9: Verification — dead keys, full gates, simulator

**Files:** none created; fixes applied wherever found.

- [ ] **Step 1: Dead style-key audit**

For each of the five touched TSX files (`GoalsScreen`, `TrackingSettingsScreen`, `ProfileScreen`, `ProfileMenu`, `profile.tsx`): list every key in its `StyleSheet.create` and grep the file for `styles.<key>` usages. Delete any key with zero usages, and remove unused imports. (STYLE_GUIDE §3: zero orphans is part of "done".)

- [ ] **Step 2: Repo-wide gates**

```bash
cd mobile && npm run lint && npx tsc --noEmit && npm test
```
Expected: all clean/passing.

- [ ] **Step 3: Simulator smoke test**

Per the user's simulator-isolation preference: boot a **dedicated** simulator instance and a **unique Metro port** (do not attach to the user's running sims). Launch the app, then verify:
1. Profile tab renders the menu with the new Tracking Settings row (icon, order: after Nutrition Preferences).
2. Goals: three sections render; save a protein change; reopen — persisted; no height/meal-time fields present.
3. Tracking Settings: change lunch time, save; reopen — persisted. Set lunch before breakfast — inline danger error, no save.
4. Profile: set birthdate and sex; save; reopen — persisted, age shown. Current weight shows latest weigh-in (or "No weigh-ins yet").
5. Screenshot each of the three screens for the user.

- [ ] **Step 4: Final commit (fixes from steps 1–3, if any)**

```bash
git add -A
git commit -m "chore(goals): dead-key audit + verification fixes"
```
Skip if the working tree is clean.

---

## Post-plan

- Report results + screenshots to the user.
- Do NOT merge to main, push, or delete the worktree — the user decides (no PRs on this repo; merges go straight to main when asked).
- Update `mobile/CLAUDE.md`'s Working Examples list only if asked.
