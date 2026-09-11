// mobile/src/components/training/daily/WorkoutFiltersSheet.tsx
// Mockup A3. A page-sheet holding every axis. The draft lives here and is
// copied from the applied filters on open; Show applies it, closing discards
// it. Creator and Muscle group push their own pages inside this modal.
import React, { useEffect, useMemo, useState } from "react";
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
import { FilterSheetFrame, FilterSection } from "./filterSheet/FilterSheetFrame";
import { FilterRow } from "./filterSheet/FilterRow";
import { FilterPill, FilterPillRow, toggleIn } from "./filterSheet/FilterPills";
import { FilterSegmented } from "./filterSheet/FilterSegmented";
import { EquipmentGrid } from "./filterSheet/EquipmentGrid";

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
  // `applied` must be referentially stable while the sheet is open: a new
  // object identity here discards the draft. The tab only replaces it
  // through applyFilters, which cannot run while this modal is up.
  useEffect(() => {
    if (visible) { setDraft(applied); setPage("root"); }
  }, [visible, applied]);

  const count = useMemo(() => countFor(draft), [countFor, draft]);
  const musclesValue = draft.muscles.length === 0 ? null : draft.muscles.join(", ");
  const creatorsValue = draft.creators.length === 0 ? null : draft.creators.join(", ");

  const pushed =
    page === "muscles" ? (
      <MuscleGroupPicker selected={draft.muscles}
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
      onRequestClose={() => (page === "root" ? onClose() : setPage("root"))}
      onReset={() => setDraft(EMPTY_FILTERS)}
      ctaLabel={`Show ${count} ${count === 1 ? "workout" : "workouts"}`}
      onCta={() => { onApply(draft); onClose(); }}
    >
      <FilterRow label="Creator" value={creatorsValue} placeholder="Any creator" first
        onPress={() => { setPage("creators"); onCreatorsOpen?.(); }} />
      <FilterRow label="Muscle group" value={musclesValue} placeholder="Any muscle"
        onPress={() => setPage("muscles")} />

      <FilterSection title="Equipment" hint="Most of the movements" />
      <EquipmentGrid tiles={EQUIPMENT_GRID} selected={draft.equipment} available={availableEquipment}
        dimHint="No saved workout uses this yet"
        onToggle={(name) => setDraft((d) => ({ ...d, equipment: toggleIn(d.equipment, name) }))} />

      <FilterSection title="Workout type" />
      <FilterPillRow>
        {FILTERABLE_ROLES.map((r: BlockRole) => (
          <FilterPill key={r} label={BLOCK_TITLES[r]} on={draft.blockRoles.includes(r)}
            onPress={() => setDraft((d) => ({ ...d, blockRoles: toggleIn(d.blockRoles, r) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Format" />
      <FilterPillRow>
        {ALL_FORMATS.map((fm) => (
          <FilterPill key={fm} label={FORMAT_LABELS[fm]} on={draft.formats.includes(fm)}
            onPress={() => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, fm) }))} />
        ))}
        {/* Dashed: a state, not a value. It finds what the classifier
            skipped so the backfill can be reviewed by filtering. */}
        <FilterPill key="untagged" label="Untagged" dashed on={draft.formats.includes("untagged")}
          onPress={() => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, "untagged") }))} />
      </FilterPillRow>

      <FilterSection title="Score" />
      <FilterPillRow>
        {ALL_SCORES.map((sc: WorkoutScoreType) => (
          <FilterPill key={sc} label={SCORE_LABELS[sc]} on={draft.scores.includes(sc)}
            onPress={() => setDraft((d) => ({ ...d, scores: toggleIn(d.scores, sc) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Intensity" />
      <FilterSegmented<WorkoutIntensity | "any">
        options={[{ value: "any", label: "Any" }, ...ALL_INTENSITIES.map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))]}
        value={draft.intensity ?? "any"}
        onPick={(v) => setDraft((d) => ({ ...d, intensity: v === "any" ? null : v }))} />

      <FilterSection title="Length" />
      <FilterPillRow>
        {LENGTH_BANDS.map((b) => (
          <FilterPill key={b.band} label={b.label} on={draft.lengths.includes(b.band)}
            onPress={() => setDraft((d) => ({ ...d, lengths: toggleIn<LengthBand>(d.lengths, b.band) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Skill" />
      <FilterPillRow>
        {ALL_SKILLS.map((s: SkillLevel) => (
          <FilterPill key={s} label={s} on={draft.skills.includes(s)}
            onPress={() => setDraft((d) => ({ ...d, skills: toggleIn(d.skills, s) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="History" />
      <FilterSegmented<HistoryFilter>
        options={[{ value: "any", label: "Any" }, { value: "never", label: HISTORY_LABELS.never }, { value: "done", label: HISTORY_LABELS.done }]}
        value={draft.history}
        onPick={(v) => setDraft((d) => ({ ...d, history: v }))} />
    </FilterSheetFrame>
  );
}
