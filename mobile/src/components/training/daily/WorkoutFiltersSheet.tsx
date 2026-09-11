// mobile/src/components/training/daily/WorkoutFiltersSheet.tsx
// Mockup A3. A page-sheet holding every axis. The draft lives here and is
// copied from the applied filters on open; Show applies it, closing discards
// it. Creator and Muscle group push their own pages inside this modal.
import React, { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import {
  Bike, Box, Cable, ChevronRight, Circle, CircleDashed, CircleDot, Cog, Dumbbell, Minus, Move,
  PersonStanding, RectangleHorizontal, Repeat, Waves, Weight, X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { KettlebellIcon } from "@/src/components/ui/KettlebellIcon";
import type { WorkoutFilters, LengthBand, SkillLevel, HistoryFilter, FormatFilter } from "@/src/types/workoutFilters";
import {
  EMPTY_FILTERS, FILTERABLE_ROLES, ALL_INTENSITIES, ALL_SKILLS, LENGTH_BANDS,
  INTENSITY_LABELS, HISTORY_LABELS,
} from "@/src/types/workoutFilters";
import type { BlockRole, WorkoutIntensity, WorkoutScoreType } from "@/src/types/dailyBlocks";
import { BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import { EQUIPMENT_GRID } from "@/src/lib/workoutEquipment";
import { ALL_FORMATS, FORMAT_LABELS, ALL_SCORES, SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import { MuscleGroupPicker } from "./MuscleGroupPicker";
import { CreatorPicker } from "./CreatorPicker";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";

/** A glyph per grid tile. The kettlebell is the app's own; the rest are the
 *  nearest lucide shapes. */
const EQUIPMENT_ICONS: Record<string, LucideIcon | "kettlebell"> = {
  Kettlebell: "kettlebell", Dumbbell, Barbell: Weight, Bodyweight: PersonStanding, Bands: CircleDashed,
  Bar: Minus, Box, "Jump Rope": Repeat, Bench: RectangleHorizontal, Sled: Move, Cable, Machine: Cog,
  Rings: Circle, "Med Ball": CircleDot, Bike, Rower: Waves,
};

interface WorkoutFiltersSheetProps {
  visible: boolean;
  applied: WorkoutFilters;
  creators: { handle: string; count: number }[];
  /** Keyed by normalised handle. */
  avatars: CreatorAvatarMap;
  /** Fired when the Creator page opens, so the tab can refresh stale rows. */
  onCreatorsOpen?: () => void;
  /** Live count for a draft, including the header search. */
  countFor: (draft: WorkoutFilters) => number;
  /** Equipment names at least one workout derives; other tiles draw dimmed. */
  availableEquipment: Set<string>;
  onApply: (next: WorkoutFilters) => void;
  onClose: () => void;
}

type Page = "root" | "muscles" | "creators";

export function WorkoutFiltersSheet({
  visible, applied, creators, avatars, onCreatorsOpen, countFor, availableEquipment, onApply, onClose,
}: WorkoutFiltersSheetProps) {
  const [draft, setDraft] = useState<WorkoutFilters>(applied);
  const [page, setPage] = useState<Page>("root");
  const insets = useSafeAreaInsets();
  // `applied` must be referentially stable while the sheet is open: a new
  // object identity here discards the draft. The tab only replaces it
  // through applyFilters, which cannot run while this modal is up.
  useEffect(() => {
    if (visible) { setDraft(applied); setPage("root"); }
  }, [visible, applied]);

  const count = useMemo(() => countFor(draft), [countFor, draft]);

  function toggleIn<T extends string>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  const pill = (label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity key={label} style={[styles.pill, on && styles.pillOn]} onPress={onPress}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  function segmented<T extends string>(
    options: { value: T; label: string }[], value: T, onPick: (v: T) => void,
  ) {
    return (
      <View style={styles.seg}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <TouchableOpacity key={o.value} style={[styles.segItem, on && styles.segItemOn]}
              onPress={() => onPick(o.value)}
              accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  const musclesValue = draft.muscles.length === 0 ? null : draft.muscles.join(", ");
  const creatorsValue = draft.creators.length === 0 ? null : draft.creators.join(", ");

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={() => (page === "root" ? onClose() : setPage("root"))}>
      {page === "muscles" ? (
        <MuscleGroupPicker selected={draft.muscles}
          onChange={(muscles) => setDraft((d) => ({ ...d, muscles }))}
          onBack={() => setPage("root")} />
      ) : page === "creators" ? (
        <CreatorPicker creators={creators} avatars={avatars} selected={draft.creators}
          onChange={(c) => setDraft((d) => ({ ...d, creators: c }))}
          onBack={() => setPage("root")} />
      ) : (
        <View style={styles.page}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button" accessibilityLabel="Close filters">
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity onPress={() => setDraft(EMPTY_FILTERS)} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.reset}>Reset</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
            <TouchableOpacity style={[styles.row, styles.rowFirst]} onPress={() => { setPage("creators"); onCreatorsOpen?.(); }}
              accessibilityRole="button" accessibilityLabel="Creator">
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Creator</Text>
                <Text style={[styles.rowValue, creatorsValue && styles.rowValueOn]} numberOfLines={1}>
                  {creatorsValue ?? "Any creator"}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textFaint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => setPage("muscles")}
              accessibilityRole="button" accessibilityLabel="Muscle group">
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Muscle group</Text>
                <Text style={[styles.rowValue, musclesValue && styles.rowValueOn]} numberOfLines={1}>
                  {musclesValue ?? "Any muscle"}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textFaint} />
            </TouchableOpacity>

            <View style={styles.sectionRow}>
              <Text style={styles.section}>Equipment</Text>
              <Text style={styles.hint}>Most of the movements</Text>
            </View>
            <View style={styles.grid}>
              {EQUIPMENT_GRID.map((e) => {
                const on = draft.equipment.includes(e.name);
                const dim = !on && !availableEquipment.has(e.name);
                // A grid name without a glyph gets the box rather than a crash.
                const Icon = EQUIPMENT_ICONS[e.name] ?? Box;
                const color = on ? colors.brand : colors.textMuted;
                return (
                  <TouchableOpacity key={e.name} style={[styles.tile, on && styles.tileOn, dim && styles.tileDim]}
                    onPress={() => setDraft((d) => ({ ...d, equipment: toggleIn(d.equipment, e.name) }))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={e.label}
                    accessibilityHint={dim ? "No saved workout uses this yet" : undefined}>
                    {Icon === "kettlebell"
                      ? <KettlebellIcon size={24} color={color} />
                      : <Icon size={24} color={color} strokeWidth={1.6} />}
                    <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={1}>{e.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.section}>Workout type</Text>
            <View style={styles.pills}>
              {FILTERABLE_ROLES.map((r: BlockRole) =>
                pill(BLOCK_TITLES[r], draft.blockRoles.includes(r),
                  () => setDraft((d) => ({ ...d, blockRoles: toggleIn(d.blockRoles, r) }))))}
            </View>

            <Text style={styles.section}>Format</Text>
            <View style={styles.pills}>
              {ALL_FORMATS.map((fm) =>
                pill(FORMAT_LABELS[fm], draft.formats.includes(fm),
                  () => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, fm) }))))}
              {/* Dashed: a state, not a value. It finds what the classifier
                  skipped so the backfill can be reviewed by filtering. */}
              <TouchableOpacity key="untagged"
                style={[styles.pill, styles.pillDashed, draft.formats.includes("untagged") && styles.pillOn]}
                onPress={() => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, "untagged") }))}
                accessibilityRole="button" accessibilityState={{ selected: draft.formats.includes("untagged") }}>
                <Text style={[styles.pillText, draft.formats.includes("untagged") && styles.pillTextOn]}>Untagged</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.section}>Score</Text>
            <View style={styles.pills}>
              {ALL_SCORES.map((sc: WorkoutScoreType) =>
                pill(SCORE_LABELS[sc], draft.scores.includes(sc),
                  () => setDraft((d) => ({ ...d, scores: toggleIn(d.scores, sc) }))))}
            </View>

            <Text style={styles.section}>Intensity</Text>
            {segmented<WorkoutIntensity | "any">(
              [{ value: "any", label: "Any" }, ...ALL_INTENSITIES.map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))],
              draft.intensity ?? "any",
              (v) => setDraft((d) => ({ ...d, intensity: v === "any" ? null : v })),
            )}

            <Text style={styles.section}>Length</Text>
            <View style={styles.pills}>
              {LENGTH_BANDS.map((b) =>
                pill(b.label, draft.lengths.includes(b.band),
                  () => setDraft((d) => ({ ...d, lengths: toggleIn<LengthBand>(d.lengths, b.band) }))))}
            </View>

            <Text style={styles.section}>Skill</Text>
            <View style={styles.pills}>
              {ALL_SKILLS.map((s: SkillLevel) =>
                pill(s, draft.skills.includes(s),
                  () => setDraft((d) => ({ ...d, skills: toggleIn(d.skills, s) }))))}
            </View>

            <Text style={styles.section}>History</Text>
            {segmented<HistoryFilter>(
              [{ value: "any", label: "Any" }, { value: "never", label: HISTORY_LABELS.never }, { value: "done", label: HISTORY_LABELS.done }],
              draft.history,
              (v) => setDraft((d) => ({ ...d, history: v })),
            )}

            {/* At the end of the scroll, never pinned. */}
            <TouchableOpacity style={styles.cta} onPress={() => { onApply(draft); onClose(); }}
              accessibilityRole="button">
              <Text style={styles.ctaText}>Show {count} {count === 1 ? "workout" : "workouts"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  reset: { fontSize: 15, fontWeight: "600", color: colors.brand },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  rowValueOn: { color: colors.brand },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingRight: spacing.screenGutter,
  },
  section: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: colors.textMuted, paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  hint: { fontSize: 12, fontWeight: "600", color: colors.brand, paddingBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  tile: {
    width: "22%", flexGrow: 1, alignItems: "center", gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileDim: { opacity: 0.5 },
  tileLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  pillOn: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  pillDashed: { borderStyle: "dashed", borderColor: colors.textFaint },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextOn: { color: colors.brand, fontWeight: "600" },
  seg: {
    flexDirection: "row", marginHorizontal: spacing.screenGutter,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: spacing.xs,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 13, color: colors.textMuted },
  segTextOn: { color: colors.onBrand, fontWeight: "600" },
  cta: {
    marginHorizontal: spacing.screenGutter, marginTop: spacing.xl, height: 48,
    backgroundColor: colors.brand, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: colors.onBrand, ...typography.button },
});
