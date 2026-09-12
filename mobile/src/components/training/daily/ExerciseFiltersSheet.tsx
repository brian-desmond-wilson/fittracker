// mobile/src/components/training/daily/ExerciseFiltersSheet.tsx
// The Exercises tab's filter sheet: the Workouts sheet's frame and blocks
// with the axes an exercise actually has. Draft lives here, copied from the
// applied filters on open; Show applies it, closing discards it.
import React, { useEffect, useMemo, useState } from "react";
import type { ExerciseFilters, PictureFilter } from "@/src/types/exerciseFilters";
import { EMPTY_EXERCISE_FILTERS, PICTURE_LABELS } from "@/src/types/exerciseFilters";
import type { SkillLevel } from "@/src/types/skillLevel";
import { ALL_SKILLS } from "@/src/types/skillLevel";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import { toggleIn } from "@/src/lib/filterChips";
import { RANK_OPTIONS, rankLabel } from "@/src/lib/exerciseFilters";
import { MuscleGroupPicker } from "./MuscleGroupPicker";
import { CreatorPicker } from "./CreatorPicker";
import { FilterSheetFrame, FilterSection } from "./filterSheet/FilterSheetFrame";
import { FilterRow } from "./filterSheet/FilterRow";
import { FilterPill, FilterPillRow } from "./filterSheet/FilterPills";
import { FilterSegmented } from "./filterSheet/FilterSegmented";
import { EquipmentGrid } from "./filterSheet/EquipmentGrid";

interface ExerciseFiltersSheetProps {
  visible: boolean;
  applied: ExerciseFilters;
  creators: { handle: string; count: number }[];
  /** Keyed by normalised handle. */
  avatars: CreatorAvatarMap;
  /** Live count for a draft, including the header search. */
  countFor: (draft: ExerciseFilters) => number;
  /** Every equipment name the catalog carries, in grid order. */
  equipmentTiles: { name: string; label: string }[];
  /** Names at least one exercise uses right now; the rest draw dimmed. */
  availableEquipment: Set<string>;
  /** Goal-type names present in the catalog, A–Z. */
  goalTypes: string[];
  /** Movement-category names present in the catalog, A–Z. */
  categories: string[];
  /** Scoring-type names present in the catalog, A–Z. */
  scoringTypes: string[];
  onApply: (next: ExerciseFilters) => void;
  onClose: () => void;
}

type Page = "root" | "muscles" | "creators";

export function ExerciseFiltersSheet({
  visible, applied, creators, avatars, countFor, equipmentTiles, availableEquipment, goalTypes, categories, scoringTypes, onApply, onClose,
}: ExerciseFiltersSheetProps) {
  const [draft, setDraft] = useState<ExerciseFilters>(applied);
  const [page, setPage] = useState<Page>("root");
  // `applied` must be referentially stable while the sheet is open: a new
  // identity here discards the draft. The tab only replaces it through
  // applyFilters, which cannot run while this modal is up.
  useEffect(() => {
    if (visible) { setDraft(applied); setPage("root"); }
  }, [visible, applied]);

  const count = useMemo(() => countFor(draft), [countFor, draft]);
  const musclesValue = draft.muscles.length === 0 ? null : draft.muscles.join(", ");
  const creatorsValue = draft.creators.length === 0 ? null : draft.creators.join(", ");

  const pushed =
    page === "muscles" ? (
      <MuscleGroupPicker selected={draft.muscles}
        subline="Matches an exercise's primary muscles. Pick as many as you like."
        onChange={(muscles) => setDraft((d) => ({ ...d, muscles }))}
        onBack={() => setPage("root")} />
    ) : page === "creators" ? (
      <CreatorPicker creators={creators} avatars={avatars} selected={draft.creators}
        onChange={(c) => setDraft((d) => ({ ...d, creators: c }))}
        onBack={() => setPage("root")} />
    ) : null;

  return (
    <FilterSheetFrame
      visible={visible}
      pushed={pushed}
      onClose={onClose}
      onPop={() => setPage("root")}
      onReset={() => setDraft(EMPTY_EXERCISE_FILTERS)}
      ctaLabel={`Show ${count} ${count === 1 ? "exercise" : "exercises"}`}
      onCta={() => { onApply(draft); onClose(); }}
    >
      <FilterRow label="Creator" value={creatorsValue} placeholder="Any creator" first
        onPress={() => setPage("creators")} />
      <FilterRow label="Muscle group" value={musclesValue} placeholder="Any muscle"
        onPress={() => setPage("muscles")} />

      <FilterSection title="Equipment" hint="The exercise's own equipment" />
      <EquipmentGrid tiles={equipmentTiles} selected={draft.equipment} available={availableEquipment}
        dimHint="No captured exercise uses this yet"
        onToggle={(name) => setDraft((d) => ({ ...d, equipment: toggleIn(d.equipment, name) }))} />

      <FilterSection title="Category" />
      <FilterPillRow>
        {categories.map((c) => (
          <FilterPill key={c} label={c} on={draft.categories.includes(c)}
            onPress={() => setDraft((d) => ({ ...d, categories: toggleIn(d.categories, c) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Type" />
      <FilterPillRow>
        {goalTypes.map((g) => (
          <FilterPill key={g} label={g} on={draft.goalTypes.includes(g)}
            onPress={() => setDraft((d) => ({ ...d, goalTypes: toggleIn(d.goalTypes, g) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Skill" />
      <FilterPillRow>
        {ALL_SKILLS.map((s: SkillLevel) => (
          <FilterPill key={s} label={s} on={draft.skills.includes(s)}
            onPress={() => setDraft((d) => ({ ...d, skills: toggleIn(d.skills, s) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Rank" />
      <FilterPillRow>
        {RANK_OPTIONS.map((t) => (
          <FilterPill key={t} label={rankLabel(t)} on={draft.tiers.includes(t)}
            onPress={() => setDraft((d) => ({ ...d, tiers: toggleIn(d.tiers, t) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Scored by" hint="Scored by all selected" />
      <FilterPillRow>
        {scoringTypes.map((s) => (
          <FilterPill key={s} label={s} on={draft.scoringTypes.includes(s)}
            onPress={() => setDraft((d) => ({ ...d, scoringTypes: toggleIn(d.scoringTypes, s) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Picture" />
      <FilterSegmented<PictureFilter>
        options={[{ value: "any", label: "Any" }, { value: "has", label: PICTURE_LABELS.has }, { value: "missing", label: PICTURE_LABELS.missing }]}
        value={draft.picture}
        onPick={(v) => setDraft((d) => ({ ...d, picture: v }))} />
    </FilterSheetFrame>
  );
}
