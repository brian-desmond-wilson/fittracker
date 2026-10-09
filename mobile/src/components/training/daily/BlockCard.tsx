// One block of the composed day. Two weights, one component: the main block
// renders as the hero — it names the session and shows its exercises inline —
// and the support blocks render compact, expanding on tap. Every card gets
// the same controls (lock, adjust, swap); a built-in adds dismiss. Approved
// mockup A is the decision record for this layout.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  ChevronDown, ChevronRight, ChevronUp, Lock, LockOpen, RotateCw, Sparkles, X,
} from "lucide-react-native";
import { colors, tint, radii, spacing } from "@/src/theme/tokens";
import { builtinByKey } from "@/src/lib/dailyBuiltins";
import { BLOCK_TITLES, SECTION_FOR_BLOCK } from "@/src/lib/dailyBlockCompose";
import { roundsBadge } from "@/src/lib/dailyRounds";
import { SessionItemList } from "./SessionItemList";
import type { StoredBlock } from "@/src/types/dailyBlocks";
import type { SessionSection, StoredSessionItem } from "@/src/types/daily";

interface BlockCardProps {
  block: StoredBlock;
  /** Only this block's items — the caller resolves them (itemsForBlock), so a
   *  second main never shows the first main's movements. */
  items: StoredSessionItem[];
  /** The heading: "Main workout", or "Main workout 2 of 2" when the role
   *  repeats on a 2-hour day (blockTitle). */
  title: string;
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
  /** Persist a within-block drag — `orderedIds` is this section's new order. */
  onReorder: (section: SessionSection, orderedIds: string[]) => void;
  /** Swipe-to-remove one item from today. */
  onRemove: (item: StoredSessionItem) => void;
}

export function BlockCard({
  block, items, title, hero, canEdit, busy, rerolling, rerollNote, expanded,
  onToggleExpand, onOpenWorkout, onOpenExercise, onToggleLock, onAdjust,
  onReroll, onToggleDismissed, nudge, onReorder, onRemove,
}: BlockCardProps) {
  const builtin = block.builtinKey ? builtinByKey(block.builtinKey) : null;
  const orphaned = !block.builtinKey && !block.workoutId;
  const accent = colors.blocks[block.block];
  // The hero shows the round count as a badge and keeps the full protocol
  // behind a tap: the coach writes the whole round into rounds_note.
  const badge = roundsBadge(block.roundsNote);
  const [protocolOpen, setProtocolOpen] = useState(false);

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

  // The section this block explodes into — items are stored under the section,
  // never the block name, so a drag reports its position with this.
  const section = SECTION_FOR_BLOCK[block.block];

  // The hero keeps the plain list Brian reviews the day from: one line per
  // movement, the reps on the right, the coach's load call under the name.
  // Decision 2026-10-08: the rich cards stay on the support blocks only.
  const compactRows = items.map((item) => (
    <TouchableOpacity
      key={item.id}
      style={styles.itemRow}
      activeOpacity={0.7}
      onPress={() => onOpenExercise(item.exerciseId)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. Open the exercise.`}
    >
      <View style={styles.itemText}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        {item.weightNote ? (
          <Text style={styles.itemWeight} numberOfLines={2}>{item.weightNote}</Text>
        ) : null}
      </View>
      <Text style={styles.itemMeta}>
        {[
          item.targetSets ? `${item.targetSets} × ${item.targetReps ?? "?"}` : item.targetReps,
          item.restSeconds ? `${item.restSeconds}s` : null,
        ].filter(Boolean).join(" · ")}
      </Text>
      <ChevronRight size={15} color={colors.textFaint} />
    </TouchableOpacity>
  ));

  // Built-in movements are app data, not exercise rows: they stay a plain list
  // (no id, nothing to reorder or remove). Everything else renders as the rich
  // draggable, swipe-to-remove card, hosted by a DraggableFlatList. The list is
  // nested inside the tab's ScrollView, so it never scrolls itself.
  const itemRows = builtin ? (
    builtin.movements.map((m) => (
      <View key={m.name} style={styles.itemRow}>
        <Text style={styles.itemName}>{m.name}</Text>
        <Text style={styles.itemMeta}>{m.prescription}</Text>
      </View>
    ))
  ) : (
    <SessionItemList
      items={items}
      section={section}
      onOpen={onOpenExercise}
      onRemove={onRemove}
      onReorder={onReorder}
    />
  );

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
            {title.toUpperCase()} · {block.minutes} MIN
          </Text>
          {controls}
        </View>
        {nameRow}
        {(items.length > 0 || badge) && (
          <View style={styles.metaRow}>
            {items.length > 0 && (
              <Text style={styles.meta}>{items.length} exercises · from your catalog</Text>
            )}
            {badge && (
              <Text style={[styles.roundsBadge, { color: accent, borderColor: tint(accent, 0.5) }]}>
                {badge}
              </Text>
            )}
          </View>
        )}
        {block.roundsNote && (
          <TouchableOpacity
            onPress={() => setProtocolOpen((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={protocolOpen ? "Hide the round protocol" : "Show the round protocol"}
            accessibilityState={{ expanded: protocolOpen }}
            style={styles.protocolToggle}
          >
            <Text style={styles.protocolToggleText}>
              {protocolOpen ? "Hide protocol" : "Show protocol"}
            </Text>
            {protocolOpen
              ? <ChevronUp size={13} color={colors.textMuted} />
              : <ChevronDown size={13} color={colors.textMuted} />}
          </TouchableOpacity>
        )}
        {block.roundsNote && protocolOpen && (
          <Text style={styles.protocol}>{block.roundsNote}</Text>
        )}
        {block.reason && <Text style={styles.reason}>{block.reason}</Text>}
        <View style={styles.itemList}>{builtin ? itemRows : compactRows}</View>
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
        accessibilityLabel={`${title}: ${block.name}. ${expanded ? "Collapse" : "Expand"}.`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.headRow}>
          <Text style={styles.kicker}>
            <Text style={{ color: accent }}>●</Text>
            {"  "}{title.toUpperCase()} · {block.minutes} MIN
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
  meta: { fontSize: 12.5, color: colors.textMuted, flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  roundsBadge: {
    fontSize: 10.5, fontWeight: "700", letterSpacing: 1, borderWidth: 1,
    borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  protocolToggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 2 },
  protocolToggleText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  protocol: { fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },
  reason: { fontSize: 12.5, color: colors.brand, fontStyle: "italic", lineHeight: 17 },
  itemList: { marginTop: 4 },
  itemRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemText: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, color: colors.text, flex: 1 },
  itemWeight: { fontSize: 12, color: colors.textMuted, fontStyle: "italic", lineHeight: 16 },
  itemMeta: { fontSize: 12.5, color: colors.textMuted },
  emptyLine: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  nudge: { fontSize: 12, color: colors.warning, marginTop: 6, fontStyle: "italic" },
});
