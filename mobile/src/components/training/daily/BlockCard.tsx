// One block of the composed day. Two weights, one component: the main block
// renders as the hero — it names the session and shows its exercises inline —
// and the support blocks render compact, expanding on tap. Every card gets
// the same controls (lock, adjust, swap); a built-in adds dismiss. Approved
// mockup A is the decision record for this layout.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  ChevronDown, ChevronRight, ChevronUp, Lock, LockOpen, RotateCw, Sparkles, X,
} from "lucide-react-native";
import { colors, tint, radii, spacing } from "@/src/theme/tokens";
import { builtinByKey } from "@/src/lib/dailyBuiltins";
import { BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import type { StoredBlock } from "@/src/types/dailyBlocks";

export interface BlockCardItem {
  id: string;
  exerciseId: string;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  restSeconds: number | null;
}

interface BlockCardProps {
  block: StoredBlock;
  items: BlockCardItem[];
  hero: boolean;
  /** Still a suggestion — locks, adjusts, swaps and dismissals are live. */
  canEdit: boolean;
  /** A reload or another block's swap is in flight; controls stand down. */
  busy: boolean;
  rerolling: boolean;
  /** A declined swap to report under this card. */
  rerollNote: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Open the workout's catalog page. Only wired when workoutId is real. */
  onOpenWorkout: () => void;
  onOpenExercise: (exerciseId: string) => void;
  onToggleLock: () => void;
  onAdjust: () => void;
  onReroll: () => void;
  /** Built-ins only: wave it off for today / bring it back. */
  onToggleDismissed: () => void;
  /** What to capture to replace a built-in (gap nudge), when it is one. */
  nudge: string | null;
}

export function BlockCard({
  block, items, hero, canEdit, busy, rerolling, rerollNote, expanded,
  onToggleExpand, onOpenWorkout, onOpenExercise, onToggleLock, onAdjust,
  onReroll, onToggleDismissed, nudge,
}: BlockCardProps) {
  const builtin = block.builtinKey ? builtinByKey(block.builtinKey) : null;
  const orphaned = !block.builtinKey && !block.workoutId;
  const accent = colors.blocks[block.block];

  // A dismissed built-in collapses to one honest line and its way back.
  if (block.dismissed) {
    return (
      <View style={[styles.card, styles.dismissedCard]}>
        <Text style={styles.dismissedText}>
          {BLOCK_TITLES[block.block]} dismissed for today
        </Text>
        {canEdit && (
          <TouchableOpacity
            onPress={onToggleDismissed}
            disabled={busy}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Bring the ${BLOCK_TITLES[block.block].toLowerCase()} back`}
          >
            <Text style={styles.undo}>Undo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const controls = canEdit && (
    <View style={styles.controls}>
      <TouchableOpacity
        style={[styles.iconBtn, block.locked && styles.iconBtnLocked]}
        onPress={onToggleLock}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          block.locked
            ? `Unlock the ${BLOCK_TITLES[block.block].toLowerCase()}`
            : `Lock the ${BLOCK_TITLES[block.block].toLowerCase()} so recomposes keep it`
        }
        accessibilityState={{ disabled: busy, selected: block.locked }}
      >
        {block.locked
          ? <Lock size={14} color={colors.warning} />
          : <LockOpen size={14} color={colors.textMuted} />}
      </TouchableOpacity>
      {/* The BFR finisher is rules-appended: no shortlist to reroll from, and
          the adjust vocabulary (and its DB CHECK) doesn't know the block.
          Its controls are lock and dismiss only. */}
      {block.block !== "bfr" && (
        <TouchableOpacity
          style={[styles.iconBtn, (busy || block.locked) && styles.iconDim]}
          onPress={onAdjust}
          disabled={busy || block.locked}
          accessibilityRole="button"
          accessibilityLabel={`Tell the recommender what to change about the ${BLOCK_TITLES[block.block].toLowerCase()}`}
          accessibilityState={{ disabled: busy || block.locked }}
        >
          <Sparkles size={14} color={colors.brand} />
        </TouchableOpacity>
      )}
      {block.block !== "bfr" && (
        <TouchableOpacity
          style={[styles.iconBtn, (busy || block.locked) && !rerolling && styles.iconDim]}
          onPress={onReroll}
          disabled={busy || block.locked}
          accessibilityRole="button"
          accessibilityLabel={`Swap the ${BLOCK_TITLES[block.block].toLowerCase()} for another one`}
          accessibilityState={{ disabled: busy || block.locked, busy: rerolling }}
        >
          {rerolling
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <RotateCw size={14} color={colors.textMuted} />}
        </TouchableOpacity>
      )}
      {block.builtinKey !== null && (
        <TouchableOpacity
          style={[styles.iconBtn, busy && styles.iconDim]}
          onPress={onToggleDismissed}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss the ${BLOCK_TITLES[block.block].toLowerCase()} for today`}
          accessibilityState={{ disabled: busy }}
        >
          <X size={14} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );

  const nameRow = (
    <TouchableOpacity
      style={styles.nameRow}
      disabled={!block.workoutId}
      onPress={onOpenWorkout}
      activeOpacity={0.7}
      accessibilityRole={block.workoutId ? "button" : undefined}
      accessibilityLabel={
        block.workoutId ? `${block.name}. Open the workout in your catalog.` : undefined
      }
    >
      <Text style={[styles.name, hero && styles.heroName]} numberOfLines={2}>
        {block.name}
      </Text>
      {block.builtinKey !== null && <Text style={styles.builtinBadge}>BUILT-IN</Text>}
      {block.workoutId !== null && (
        <ChevronRight size={hero ? 18 : 15} color={colors.textFaint} />
      )}
    </TouchableOpacity>
  );

  const itemRows = builtin
    ? builtin.movements.map((m) => (
        <View key={m.name} style={styles.itemRow}>
          <Text style={styles.itemName}>{m.name}</Text>
          <Text style={styles.itemMeta}>{m.prescription}</Text>
        </View>
      ))
    : items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.itemRow}
          activeOpacity={0.7}
          onPress={() => onOpenExercise(item.exerciseId)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}. Open the exercise.`}
        >
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {[
              item.targetSets
                ? `${item.targetSets} × ${item.targetReps ?? "?"}`
                : item.targetReps,
              item.restSeconds ? `${item.restSeconds}s` : null,
            ].filter(Boolean).join(" · ")}
          </Text>
          <ChevronRight size={14} color={colors.textFaint} />
        </TouchableOpacity>
      ));

  const emptyLine = !builtin && items.length === 0 && (
    <Text style={styles.emptyLine}>
      {orphaned
        ? "This workout is no longer in your catalog — the block keeps its name as history."
        : "No movements stored for this block yet. Pull to refresh."}
    </Text>
  );

  if (hero) {
    return (
      <View style={[styles.card, styles.heroCard]}>
        <View style={styles.headRow}>
          <Text style={[styles.kicker, { color: accent }]}>
            {BLOCK_TITLES[block.block].toUpperCase()} · {block.minutes} MIN
          </Text>
          {controls}
        </View>
        {nameRow}
        {(items.length > 0 || block.roundsNote) && (
          <Text style={styles.meta}>
            {[
              items.length > 0 ? `${items.length} exercises · from your catalog` : null,
              block.roundsNote,
            ].filter(Boolean).join(" · ")}
          </Text>
        )}
        {block.reason && <Text style={styles.reason}>{block.reason}</Text>}
        <View style={styles.itemList}>{itemRows}</View>
        {emptyLine}
        {rerollNote && <Text style={styles.emptyLine}>Couldn't swap this block right now.</Text>}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={onToggleExpand}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${BLOCK_TITLES[block.block]}: ${block.name}. ${expanded ? "Collapse" : "Expand"}.`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.headRow}>
          <Text style={styles.kicker}>
            <Text style={{ color: accent }}>●</Text>
            {"  "}{BLOCK_TITLES[block.block].toUpperCase()} · {block.minutes} MIN
          </Text>
          <View style={styles.headRight}>
            {controls}
            {expanded
              ? <ChevronUp size={15} color={colors.textFaint} />
              : <ChevronDown size={15} color={colors.textFaint} />}
          </View>
        </View>
        {nameRow}
        {block.reason && !expanded && (
          <Text style={styles.reason} numberOfLines={2}>{block.reason}</Text>
        )}
      </TouchableOpacity>
      {expanded && (
        <>
          {block.roundsNote && <Text style={styles.meta}>{block.roundsNote}</Text>}
          {block.reason && <Text style={styles.reason}>{block.reason}</Text>}
          <View style={styles.itemList}>{itemRows}</View>
          {emptyLine}
        </>
      )}
      {nudge !== null && <Text style={styles.nudge}>{nudge}</Text>}
      {rerollNote && <Text style={styles.emptyLine}>Couldn't swap this block right now.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.panel, padding: spacing.lg, marginTop: spacing.sm + 2,
    gap: 4,
  },
  heroCard: {
    backgroundColor: colors.surface2,
    borderColor: tint(colors.brand, 0.4),
  },
  dismissedCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  dismissedText: { fontSize: 13, color: colors.textFaint },
  undo: { fontSize: 13, color: colors.brand, fontWeight: "600" },
  headRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    gap: spacing.sm,
  },
  headRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kicker: {
    fontSize: 10.5, fontWeight: "700", letterSpacing: 1.1, color: colors.textFaint,
    flexShrink: 1,
  },
  controls: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 28, height: 28, borderRadius: radii.control,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnLocked: {
    backgroundColor: tint(colors.warning, 0.15),
    borderColor: tint(colors.warning, 0.3),
  },
  iconDim: { opacity: 0.4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  name: { fontSize: 15, fontWeight: "600", color: colors.text, flexShrink: 1 },
  heroName: { fontSize: 19, fontWeight: "800" },
  builtinBadge: {
    fontSize: 10, color: colors.textMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden",
    letterSpacing: 0.5,
  },
  meta: { fontSize: 12.5, color: colors.textMuted },
  reason: { fontSize: 12.5, color: colors.brand, fontStyle: "italic", lineHeight: 17 },
  itemList: { marginTop: 4 },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: 14, color: colors.text, flex: 1 },
  itemMeta: { fontSize: 12.5, color: colors.textMuted },
  emptyLine: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  nudge: { fontSize: 12, color: colors.warning, marginTop: 6, fontStyle: "italic" },
});
