# Exercise Page: Equipment vs. Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the exercise detail page, stop showing support surfaces (Floor, Wall) as equipment — list real equipment only (with a "No equipment needed" state), and show surfaces in a separate, non-tappable "Surface" section.

**Architecture:** One screen component changes. The canonical `SUPPORT_SURFACES` set already exists; the page just needs to split the exercise's equipment names into real equipment and surfaces and render them in two sections. No data or test-lib changes.

**Tech Stack:** React Native (Expo), TypeScript. Verified by `npx tsc --noEmit` and a device walk (the repo's Jest covers pure libs only; this is presentational logic reusing already-tested helpers).

**Spec:** `docs/superpowers/specs/2026-09-11-exercise-equipment-vs-surface-design.md`

**All commands run from `/Users/brianwilson/code/fittracker/mobile`.**

---

### Task 1: Split equipment from surfaces and render two sections

**Files:**
- Modify: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`

- [ ] **Step 1: Import the surface set**

Near the existing import of `equipmentNamesOf` (around line 22, `import { equipmentNamesOf } from '@/src/lib/exerciseEquipment';`), add:

```ts
import { SUPPORT_SURFACES } from '@/src/lib/workoutEquipment';
```

- [ ] **Step 2: Derive real equipment and surfaces**

Replace the current derivation (around lines 419-421):

```ts
  const equipmentChips = item
    ? equipmentNamesOf(item).filter((name) => name.toLowerCase() !== 'bodyweight')
    : [];
```

with:

```ts
  const equipmentNames = item ? equipmentNamesOf(item) : [];
  const realEquipment = equipmentNames.filter(
    (name) => !SUPPORT_SURFACES.has(name) && name.toLowerCase() !== 'bodyweight',
  );
  const surfaces = equipmentNames.filter((name) => SUPPORT_SURFACES.has(name));
```

- [ ] **Step 3: Rewrite the Equipment section (real equipment or an empty state)**

Replace the whole Equipment block (around lines 655-675, the `{/* 7. Equipment — tiles are buttons too */}` block currently gated on `equipmentChips.length > 0`) with a block that always renders once the exercise has loaded, showing tiles or the empty state. It uses `item` as the load guard (the surrounding render already only runs when `item` is set — if the block sits outside that guard, keep the `item &&` guard shown here):

```tsx
          {/* 7. Equipment — real gear only; tiles are buttons. Surfaces live in their own section below. */}
          {item && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Equipment</Text>
              {realEquipment.length > 0 ? (
                <View style={styles.equipmentContainer}>
                  {realEquipment.map((equipment, index) => {
                    const EquipmentIcon = getEquipmentIcon(equipment);
                    return (
                      <TouchableOpacity key={index} style={styles.equipmentItem}
                        onPress={() => openFiltered({ equipment: [equipment] })}
                        accessibilityRole="button" accessibilityLabel={`Exercises using ${equipment}`}>
                        <View style={styles.equipmentIconContainer}>
                          <EquipmentIcon size={32} color={colors.brand} strokeWidth={1.5} />
                        </View>
                        <Text style={styles.equipmentLabel}>{equipment}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.equipmentEmptyText}>No equipment needed</Text>
              )}
            </View>
          )}

          {/* 7b. Surface — Floor / Wall, shown as non-tappable tiles, only when present */}
          {surfaces.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Surface</Text>
              <View style={styles.equipmentContainer}>
                {surfaces.map((surface, index) => {
                  const SurfaceIcon = getEquipmentIcon(surface);
                  return (
                    <View key={index} style={styles.equipmentItem}>
                      <View style={styles.equipmentIconContainer}>
                        <SurfaceIcon size={32} color={colors.brand} strokeWidth={1.5} />
                      </View>
                      <Text style={styles.equipmentLabel}>{surface}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
```

Note: if the exercise-detail JSX around here already sits inside an `item ?`/`item &&` guard (the hero, meta row and other sections reference `item.*` unconditionally, so it does), drop the extra `item && ` wrapper on the Equipment block and render it unconditionally like the neighboring sections — the block must not be gated on equipment being present, only on the exercise existing. Match whatever guard the sibling sections (Muscles, Description) use.

- [ ] **Step 4: Add the empty-state text style**

In the `StyleSheet.create({...})` block, next to `equipmentLabel` (around line 813), add:

```ts
  equipmentEmptyText: { fontSize: 15, color: colors.textMuted },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx
git commit -m "fix(exercise-page): separate Surface from Equipment; No-equipment-needed state"
```

---

### Task 2: Device walk and merge

**Files:** none (verification + integration).

- [ ] **Step 1: Device walk on FitTracker-walk3**

With Metro running for the sim:
- Open **Push-Up**: Equipment shows "No equipment needed"; a **Surface** section shows **Floor**; tapping Floor does nothing (not a button).
- Open an exercise with real equipment (e.g. a Kettlebell or Barbell movement): its equipment tile still opens the Exercises tab filtered by that equipment; if it also has a surface (e.g. a floor press), a Surface section shows the surface; if it has no surface, there is no Surface section.
- Confirm no exercise still lists Floor or Wall under Equipment.

- [ ] **Step 2: Merge to main and push**

```bash
git checkout main && git merge --ff-only spec/equipment-vs-surface && git push
```

---

## Self-review notes

- **Spec coverage:** §4 experience (real-equipment tiles, "No equipment needed", conditional Surface section) → Task 1 Step 3; §5 rules (surface = `SUPPORT_SURFACES.has`, real = not surface and not bodyweight, surfaces non-tappable) → Steps 2-3; §6 architecture (one file, reuse `getEquipmentIcon` + existing tile styles, one new muted style) → Steps 1-4; §7 testing → Task 1 Step 5 + Task 2.
- **Placeholder scan:** none.
- **Consistency:** the Surface tile reuses the exact styles and icon helper of the Equipment tile but as a `View` (no `onPress`, no `accessibilityRole="button"`), matching the spec's "same tile look, non-interactive". The empty state uses `colors.textMuted`, consistent with the page's other muted text (`loadingText`, `metaLabel`).
