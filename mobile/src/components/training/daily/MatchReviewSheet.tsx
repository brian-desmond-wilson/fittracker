import React, { useCallback, useEffect, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Switch,
} from "react-native";
import { X, Link2, Search, Plus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import {
  fetchPendingReviews,
  resolveMatchReview,
} from "@/src/lib/supabase/matchReviews";
import type { PendingMatchReview } from "@/src/lib/supabase/matchReviews";
import { ExerciseSearchModal } from "@/src/components/training/program-detail/workout-wizard/ExerciseSearchModal";
import { CatalogItemWizard } from "@/src/components/training/crossfit/CatalogItemWizard";
import type { CatalogExerciseRow } from "@/src/lib/supabase/frontDoor";

// The match-review queue: every captured name that resolved to nothing waits
// here (Stage 5, Task 4 — capture no longer mints exercises). Three ways out
// per name, all ending with the review closed and the captured workout's
// pending items repointed:
//   link       — pick an existing exercise (candidate chip or catalog search)
//   link+alias — same, with the captured wording saved as a wild alias so the
//                next capture of it resolves on its own (the default: the
//                queue should shrink the dictionary's blind spots, not
//                revisit them)
//   create     — the one catalog wizard, prefilled with the captured name,
//                then linked as freshly minted
interface MatchReviewSheetProps {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
  /** Fired after each successful resolution so the host refreshes its badge
   *  and catalog list. */
  onResolved: () => void;
}

export function MatchReviewSheet({
  visible, userId, onClose, onResolved,
}: MatchReviewSheetProps) {
  const [reviews, setReviews] = useState<PendingMatchReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Per-review "teach the alias" switch; ON unless turned off. */
  const [aliasOff, setAliasOff] = useState<Set<string>>(new Set());
  const [searchFor, setSearchFor] = useState<PendingMatchReview | null>(null);
  const [createFor, setCreateFor] = useState<PendingMatchReview | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setReviews(await fetchPendingReviews(userId));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const saveAliasFor = (review: PendingMatchReview) => !aliasOff.has(review.id);

  const toggleAlias = (reviewId: string) =>
    setAliasOff((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });

  /** The shared tail of all three resolutions. */
  const resolve = async (
    review: PendingMatchReview,
    exerciseId: string,
    minted: boolean,
  ) => {
    if (busyId) return;
    setBusyId(review.id);
    const result = await resolveMatchReview({
      review,
      exerciseId,
      minted,
      saveAlias: saveAliasFor(review),
    });
    setBusyId(null);
    if (!result.ok) {
      Alert.alert("Couldn't resolve it", "Nothing was changed — try again.");
      return;
    }
    if (result.alreadyResolved) {
      // Someone got there first (another device, or a double tap racing the
      // refresh). That resolution stands; this one wrote nothing.
      Alert.alert(
        "Already resolved",
        `“${review.rawName}” was resolved elsewhere — nothing changed here.`,
      );
      setReviews((prev) => prev.filter((r) => r.id !== review.id));
      onResolved();
      return;
    }
    if (result.aliasFailed) {
      // The link stands; only the dictionary write missed. Say so instead of
      // letting the next capture of this wording queue up again silently.
      Alert.alert(
        "Linked, but the alias didn't save",
        `“${review.rawName}” wasn't remembered — capturing that wording again will land back here.`,
      );
    }
    setReviews((prev) => prev.filter((r) => r.id !== review.id));
    onResolved();
  };

  /**
   * Chips are one-tap and easy to hit by accident, and a resolution is
   * effectively irreversible from the app (it writes the review, provenance,
   * workout items, and optionally an alias). Confirm before committing.
   */
  const confirmChipLink = (
    review: PendingMatchReview,
    candidate: { exerciseId: string; name: string },
  ) => {
    const teaching = saveAliasFor(review)
      ? `\n\n“${review.rawName}” will also be remembered as a name for it.`
      : '';
    Alert.alert(
      'Link this movement?',
      `“${review.rawName}” will be linked to “${candidate.name}”.${teaching}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: () => resolve(review, candidate.exerciseId, false) },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Match reviews</Text>
            <Text style={styles.subtitle}>
              Captured names that didn't match your catalog
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={busyId !== null}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : reviews.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Nothing waiting</Text>
            <Text style={styles.emptyText}>
              Every captured movement is matched. New names land here when a
              capture can't find them in your catalog.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
            {reviews.map((review) => {
              const busy = busyId === review.id;
              return (
                <View key={review.id} style={styles.card}>
                  <Text style={styles.rawName}>{review.rawName}</Text>
                  {review.context && (
                    <Text style={styles.context}>from {review.context}</Text>
                  )}

                  {review.candidates.length > 0 && (
                    <>
                      <Text style={styles.fieldLabel}>Is it one of these?</Text>
                      <View style={styles.pillRow}>
                        {review.candidates.map((c) => (
                          <TouchableOpacity
                            key={c.exerciseId}
                            style={styles.pill}
                            disabled={busy}
                            onPress={() => confirmChipLink(review, c)}
                          >
                            <Link2 size={12} color={colors.primary} />
                            <Text style={styles.pillText}>{c.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <View style={styles.aliasRow}>
                    <Text style={styles.aliasText}>
                      Remember “{review.rawName}” for next time
                    </Text>
                    <Switch
                      value={saveAliasFor(review)}
                      onValueChange={() => toggleAlias(review.id)}
                      disabled={busy}
                      trackColor={{ true: colors.primary, false: colors.border }}
                    />
                  </View>

                  {/* Primary actions at the end of the card (house rule). */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      disabled={busy}
                      onPress={() => setSearchFor(review)}
                      activeOpacity={0.7}
                    >
                      <Search size={15} color={colors.primary} />
                      <Text style={styles.actionText}>Find in catalog</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      disabled={busy}
                      onPress={() => setCreateFor(review)}
                      activeOpacity={0.7}
                    >
                      <Plus size={15} color={colors.primary} />
                      <Text style={styles.actionText}>Create new</Text>
                    </TouchableOpacity>
                    {busy && <ActivityIndicator size="small" color={colors.primary} />}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Resolution (a)/(b): the alias-aware catalog search from Task 3. */}
        <ExerciseSearchModal
          visible={searchFor !== null}
          onClose={() => setSearchFor(null)}
          onSelectExercise={(exercise) => {
            const review = searchFor;
            setSearchFor(null);
            if (review) resolve(review, exercise.id, false);
          }}
        />

        {/* Resolution (c): the ONE catalog wizard, prefilled with the captured
            name. onCreated hands back the row so the link lands by id; onSave
            fires after the wizard's own success alert. */}
        <Modal
          visible={createFor !== null}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setCreateFor(null)}
        >
          {createFor && (
            <CatalogItemWizard
              isMovement={false}
              initialName={createFor.rawName}
              onClose={() => setCreateFor(null)}
              onSave={() => setCreateFor(null)}
              onCreated={(row: CatalogExerciseRow) => {
                const review = createFor;
                if (review) resolve(review, row.id, true);
              }}
            />
          )}
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  emptyText: {
    fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20,
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: colors.muted, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  rawName: { fontSize: 17, fontWeight: "600", color: colors.foreground },
  context: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  fieldLabel: { fontSize: 12, color: colors.mutedForeground, marginTop: 12, marginBottom: 6 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: colors.input, borderWidth: 1, borderColor: colors.primary,
  },
  pillText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  aliasRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 14, gap: 10,
  },
  aliasText: { fontSize: 13, color: colors.mutedForeground, flexShrink: 1 },
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12,
  },
  actionButton: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  actionText: { fontSize: 14, fontWeight: "600", color: colors.primary },
});
