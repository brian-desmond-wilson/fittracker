// mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx
// The detail page behind both Training tabs (Exercises and Movements are two
// doors onto one `exercises` table; the noun and the hierarchy route are the
// props, everything else is shared — the server decides from is_movement
// whether the photo gets a CrossFit athlete).
//
// v2 (spec 2026-09-11): hero → meta row (Category, Goal, Skill, Scored by) →
// Your history → Description → Also Known As → muscles → equipment →
// hierarchy → Scale It → Demo Video → Captured From → Add to today. Every
// new block fails closed: a failed fetch hides that block and logs.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Image, Alert, Modal, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, ChevronRight, Sparkles, MoreVertical, Dumbbell, Weight, Circle, AlertCircle,
} from 'lucide-react-native';
import { colors, spacing, tint } from '@/src/theme/tokens';
import { equipmentNamesOf } from '@/src/lib/exerciseEquipment';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import type { CaptureSourceV2 } from '@/src/types/capture';
import { supabase } from '@/src/lib/supabase';
import { fetchAncestors, fetchMovementProgressions, fetchMovementRegressions } from '@/src/lib/supabase/crossfit';
import { fetchExerciseSources } from '@/src/lib/supabase/capture';
import { enrichExercise } from '@/src/lib/supabase/enrich';
import { fetchExerciseWorkingSets } from '@/src/lib/supabase/exerciseHistory';
import { fetchLatestRating, rerateMovement } from '@/src/lib/supabase/rerateMovement';
import type { LatestRating } from '@/src/lib/supabase/rerateMovement';
import type { WorkingSet } from '@/src/lib/exerciseHistory';
import { scoredByLabel, scoringRowsOf } from '@/src/lib/scoredBy';
import { collapseSiblings } from '@/src/lib/hierarchyCollapse';
import { exerciseFilterParam } from '@/src/lib/exerciseFilterLink';
import type { ExerciseFilterLink } from '@/src/lib/exerciseFilterLink';
import { getLocalDateString } from '@/src/lib/dates';
import { CatalogItemWizard } from '@/src/components/training/crossfit/CatalogItemWizard';
import { MovementRatingSheet } from '@/src/components/training/daily/MovementRatingSheet';
import { UndoToast } from '@/src/components/ui/UndoToast';
import type { UndoToastContent } from '@/src/components/ui/UndoToast';
import { HistoryBlock } from './HistoryBlock';
import { ScaleItSection } from './ScaleItSection';
import type { ScaleLink } from './ScaleItSection';
import { DemoVideoCard } from './DemoVideoCard';
import { CapturedFromStrip } from './CapturedFromStrip';
import type { CapturedFromTab } from './CapturedFromStrip';
import { AddToTodayButton } from './AddToTodayButton';

export interface TrainingItemDetailScreenProps {
  /** How this tab names the thing, lower case: "exercise" or "movement". */
  noun: string;
  /** Plural of the same, for copy like "movements you created". */
  nounPlural: string;
  /**
   * Route prefix for the hierarchy and Scale It links, so tapping a parent,
   * sibling or alternative keeps you in the tab you arrived through.
   */
  routeBase: string;
}

/** "movement" -> "Movement", for sentence-leading copy. */
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The detail row plus the junction embeds this screen reads. */
interface DetailRow extends ExerciseWithVariations {
  alias_rows?: { alias: string; kind: string }[];
  goal_rows?: { goal_type: { id: string; name: string } | null }[];
  scoring_rows?: { scoring_type: unknown }[];
}

/** "Also known as" names, deduplicated case-insensitively, minus the display name. */
function aliasNamesOf(item: DetailRow): string[] {
  const displayName = item.name.trim().toLowerCase();
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of item.alias_rows ?? []) {
    const alias = row.alias.trim();
    const key = alias.toLowerCase();
    if (!alias || key === displayName || seen.has(key)) continue;
    seen.add(key);
    names.push(alias);
  }
  return names;
}

/** A glyph per equipment name; the nearest lucide shapes. */
const getEquipmentIcon = (equipmentName: string) => {
  const name = equipmentName.toLowerCase();
  if (name.includes('barbell') || name.includes('bar')) return Weight;
  if (name.includes('dumbbell') || name.includes('db')) return Dumbbell;
  if (name.includes('kettlebell') || name.includes('kb')) return Weight;
  return Circle;
};

const scaleLinksOf = (rows: { to_exercise?: { id: string; name: string } }[]): ScaleLink[] =>
  rows.flatMap((r) => (r.to_exercise ? [{ id: r.to_exercise.id, name: r.to_exercise.name }] : []));

export function TrainingItemDetailScreen({
  noun, nounPlural, routeBase,
}: TrainingItemDetailScreenProps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [today] = useState(() => getLocalDateString()); // one clock sample
  const [userId, setUserId] = useState<string | null>(null);
  const [item, setItem] = useState<DetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tier, setTier] = useState<number>(0);
  const [editVisible, setEditVisible] = useState(false);
  const [hierarchyData, setHierarchyData] = useState<{
    ancestors: Array<{ id: string; name: string; is_core: boolean; tier: number }>;
    siblings: ExerciseWithVariations[];
  }>({ ancestors: [], siblings: [] });
  const [siblingsExpanded, setSiblingsExpanded] = useState(false);

  // v2 blocks. Each starts empty and fails closed.
  const [sources, setSources] = useState<CaptureSourceV2[]>([]);
  const [history, setHistory] = useState<WorkingSet[]>([]);
  const [skillNote, setSkillNote] = useState<LatestRating | null>(null);
  const [easier, setEasier] = useState<ScaleLink[]>([]);
  const [harder, setHarder] = useState<ScaleLink[]>([]);
  const [rateVisible, setRateVisible] = useState(false);
  const [toast, setToast] = useState<UndoToastContent | null>(null);

  useEffect(() => {
    setSiblingsExpanded(false);
    loadItem();
    loadUser();
    loadScaling();
  }, [id]);

  useEffect(() => {
    if (!userId || !id) return;
    loadSources(userId);
    loadHistory(userId);
    loadSkillNote(userId);
  }, [userId, id]);

  useEffect(() => {
    if (item && !item.is_core && item.parent_exercise_id) {
      loadHierarchy();
    } else {
      setHierarchyData({ ancestors: [], siblings: [] });
    }
  }, [item?.id, item?.parent_exercise_id, item?.is_core]);

  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      setIsAdmin(profile?.is_admin || false);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadSources = async (uid: string) => {
    try {
      setSources(await fetchExerciseSources(id, uid));
    } catch (error) {
      console.error('Error loading capture sources:', error);
      setSources([]);
    }
  };

  const loadHistory = async (uid: string) => {
    try {
      setHistory(await fetchExerciseWorkingSets(uid, id));
    } catch (error) {
      console.error('Error loading exercise history:', error);
      setHistory([]);
    }
  };

  const loadSkillNote = async (uid: string) => {
    try {
      setSkillNote(await fetchLatestRating(uid, id));
    } catch (error) {
      console.error('Error loading skill note:', error);
      setSkillNote(null);
    }
  };

  const loadScaling = async () => {
    try {
      const [regressions, progressions] = await Promise.all([
        fetchMovementRegressions(id),
        fetchMovementProgressions(id),
      ]);
      setEasier(scaleLinksOf(regressions));
      setHarder(scaleLinksOf(progressions));
    } catch (error) {
      console.error('Error loading scaling links:', error);
      setEasier([]);
      setHarder([]);
    }
  };

  const loadItem = async () => {
    try {
      // Spinner only on the initial load; later refreshes (Enrich, wizard save)
      // swap the data in place so the v2 blocks stay mounted and scroll holds.
      if (item === null) setLoading(true);
      const { data, error } = await supabase
        .from('exercises')
        .select(`
          *,
          movement_category:movement_categories(id, name),
          goal_rows:exercise_goal_types(goal_type:goal_types(id, name)),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(id, name)
          ),
          equipment_rows:exercise_equipment(
            equipment:equipment(id, name)
          ),
          alias_rows:exercise_aliases(alias, kind),
          scoring_rows:exercise_scoring_types(scoring_type:scoring_types(name, display_order))
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      setItem(data as any);
      setTier(data.tier ?? 0);
    } catch (error) {
      console.error('Error loading item:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHierarchy = async () => {
    if (!item || !item.parent_exercise_id) return;
    try {
      const ancestors = await fetchAncestors(item.parent_exercise_id);
      const { data: siblingsData, error: siblingsError } = await supabase
        .from('exercises')
        .select('id, name, is_core, parent_exercise_id, tier')
        .eq('parent_exercise_id', item.parent_exercise_id)
        .neq('id', id)
        .order('name');
      if (siblingsError) throw siblingsError;
      setHierarchyData({ ancestors, siblings: (siblingsData || []) as any[] });
    } catch (error) {
      console.error('Error loading hierarchy:', error);
    }
  };

  const handleMenuPress = () => {
    if (!item) return;

    Alert.alert(
      `${capitalize(noun)} Options`,
      'Choose an action',
      [
        {
          text: `Edit ${capitalize(noun)}`,
          onPress: () => setEditVisible(true),
        },
        {
          text: 'Enrich',
          onPress: () => { handleEnrich(false); },
        },
        {
          text: 'Regenerate Image',
          onPress: () => { handleEnrich(true); },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  /** A field name as the alert says it. */
  const fieldLabel = (field: string) =>
    field === 'description' ? 'description' : field === 'video_url' ? 'demo video' : 'image';

  /**
   * A skipped reason that means the field was never a candidate — set by a
   * person, already full, images off, no capture, or filled by another run
   * in the meantime. Anything else is a fill that was attempted and failed.
   */
  const isBenignSkip = (reason: string) =>
    reason === 'user'
    || reason === 'filled'
    || reason === 'images off'
    || reason === 'no single-exercise capture'
    || reason.startsWith('filled elsewhere');

  /**
   * Enrich fills whatever is empty (description, demo video, picture) and
   * never touches a value a person set. Regenerate image is the one
   * overwrite: a fresh picture over the existing one. The server owns the
   * prompt; the phone sends an id and a flag.
   */
  const handleEnrich = async (forceImage: boolean) => {
    if (!item || generating) return;

    try {
      setGenerating(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to do that');
        return;
      }

      // Regenerating spends an image credit on a picture that already exists:
      // only the creator of a custom item, or an admin for official ones.
      if (forceImage) {
        const canGenerate = isAdmin || (!item.is_official && item.created_by === user.id);
        if (!canGenerate) {
          Alert.alert(
            'Permission Denied',
            item.is_official
              ? `Only administrators can regenerate images for official ${nounPlural}.`
              : `You can only regenerate images for ${nounPlural} you created.`
          );
          return;
        }
      }

      const result = await enrichExercise(item.id, { images: true, forceImage });
      if (!result) {
        Alert.alert('Error', forceImage ? 'Image generation failed. Please try again.' : 'Enrichment failed. Please try again.');
        return;
      }

      if (forceImage && !result.imageUrl) {
        // The same call may still have filled the description or video.
        Alert.alert('Error', result.skipped.image_url ?? 'Image generation failed', [
          { text: 'OK', onPress: () => loadItem() },
        ]);
        return;
      }

      const failures = Object.entries(result.skipped)
        .filter(([, reason]) => !isBenignSkip(reason))
        .map(([field, reason]) => `${fieldLabel(field)} (${reason})`);
      const couldNotFill = failures.length > 0 ? `Could not fill ${failures.join('; ')}.` : '';
      const message = result.filled.length > 0
        ? `Filled: ${result.filled.map(fieldLabel).join(', ')}.${couldNotFill ? ` ${couldNotFill}` : ''}`
        : couldNotFill || 'Nothing was empty — every field already has a value.';
      const title = forceImage
        ? (item.image_url ? 'Image regenerated' : 'Image generated')
        : 'Enriched';
      Alert.alert(title, message, [
        { text: 'OK', onPress: () => loadItem() },
      ]);
    } catch (error: any) {
      console.error('Error enriching item:', error);
      const errorMessage = error?.message || 'Something went wrong. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  // ---------- navigation ----------

  /** A chip, tile or handle: the Exercises tab with this value on top of the saved filters (§4.4). */
  const openFiltered = useCallback((link: ExerciseFilterLink) => {
    router.navigate({
      pathname: '/(tabs)/training',
      params: { exerciseFilter: exerciseFilterParam(link) },
    } as never);
  }, [router]);
  const openToday = useCallback(() => {
    router.navigate({ pathname: '/(tabs)/training', params: { openTab: 'today' } } as never);
  }, [router]);
  const openSession = useCallback((sessionId: string) => {
    router.push(`/(tabs)/track/gym-sessions/${sessionId}` as never);
  }, [router]);
  const openAllSessions = useCallback(() => {
    if (!item) return;
    router.push({
      pathname: '/(tabs)/track/gym-sessions',
      params: { exerciseId: id, exerciseName: item.name },
    } as never);
  }, [router, id, item]);
  const openWorkout = useCallback((workoutId: string) => {
    router.push(`/(tabs)/training/captured-workout/${workoutId}` as never);
  }, [router]);
  const openSourcesScreen = useCallback((tab: CapturedFromTab) => {
    router.push({ pathname: `/(tabs)/training/exercise-sources/${id}`, params: { tab } } as never);
  }, [router, id]);

  /** Back to wherever we came from — but when there's nothing to pop (a hot
   *  reload, deep link, or state restore that lands on this page as the stack's
   *  only screen), a raw back() dispatches an unhandled GO_BACK: the button
   *  does nothing and warns. Fall back to the Training index instead. */
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/training' as never);
  }, [router]);

  /** Re-rate: overwrite the latest row, replay the state; on failure keep the
   *  old note and toast (spec §8). The sheet closes either way. */
  const onRerateSave = async (ratings: { exerciseId: string; rating: LatestRating['rating'] }[]) => {
    const chosen = ratings.find((r) => r.exerciseId === id);
    if (!chosen || !skillNote || !userId) return;
    const ok = await rerateMovement({ userId, sessionId: skillNote.sessionId, exerciseId: id, rating: chosen.rating });
    if (ok) {
      setSkillNote({ ...skillNote, rating: chosen.rating });
    } else {
      setToast({ title: "Couldn't save the rating", detail: 'Your earlier rating stands. Try again in a moment.' });
    }
  };

  // ---------- derived ----------

  const equipmentChips = item
    ? equipmentNamesOf(item).filter((name) => name.toLowerCase() !== 'bodyweight')
    : [];
  const aliasNames = item ? aliasNamesOf(item) : [];
  const scoredBy = useMemo(() => (item ? scoredByLabel(scoringRowsOf(item.scoring_rows)) : ''), [item]);
  const siblingView = collapseSiblings(hierarchyData.siblings, siblingsExpanded);
  const initialRatings = useMemo(
    () => (skillNote ? { [id]: skillNote.rating } : undefined),
    [skillNote, id],
  );

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading item...</Text>
        </View>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <Text style={styles.errorText}>{capitalize(noun)} not found</Text>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const badge = item.is_core === true ? (
    <Pressable onPress={() => openFiltered({ tiers: [0] })} hitSlop={8}>
      <View style={styles.heroCoreBadge}><Text style={styles.heroBadgeText}>CORE</Text></View>
    </Pressable>
  ) : tier > 0 ? (
    <Pressable onPress={() => openFiltered({ tiers: [tier] })} hitSlop={8}>
      <View style={styles.heroTierBadge}><Text style={styles.heroBadgeText}>TIER {tier}</Text></View>
    </Pressable>
  ) : null;

  const hierarchyRow = (
    key: string, name: string, badgeNode: React.ReactNode, onPress: (() => void) | null, current: boolean, first: boolean,
  ) => (
    <View key={key} style={!first ? styles.hierarchyWrapper : undefined}>
      {!first && <View style={styles.hierarchyConnectorLine} />}
      <TouchableOpacity
        style={[first ? styles.hierarchyParent : styles.hierarchyItem, current && styles.hierarchyCurrentItem]}
        onPress={onPress ?? undefined}
        disabled={onPress === null}
        activeOpacity={0.7}
      >
        <View style={styles.hierarchyConnector}>
          <View style={[styles.connectorDot, current && styles.connectorDotCurrent]} />
        </View>
        <View style={styles.hierarchyItemContent}>
          {badgeNode}
          <Text style={[styles.hierarchyItemName, current && styles.hierarchyCurrentText]} numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
  const tierBadge = (t: number) => (
    <View style={styles.tierHierarchyBadge}><Text style={styles.tierHierarchyBadgeText}>TIER {t}</Text></View>
  );
  const coreBadge = (
    <View style={styles.coreHierarchyBadge}><Text style={styles.coreHierarchyBadgeText}>CORE</Text></View>
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text} />
            <Text style={styles.backText}>{capitalize(nounPlural)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton}>
            <MoreVertical size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 1. Hero — unchanged from v1 */}
          {item.image_url ? (
            <View style={styles.heroSection}>
              <Image source={{ uri: item.image_url }} style={styles.heroImage} resizeMode="cover" />
              <LinearGradient colors={[tint(colors.shadow, 0.6), tint(colors.shadow, 0), tint(colors.shadow, 0.8)]} style={styles.heroGradient} />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroExerciseName}>{item.name}</Text>
                {badge}
              </View>
            </View>
          ) : (
            <View style={styles.heroPlaceholder}>
              {badge && <View style={styles.heroBadgeTopRight}>{badge}</View>}
              <Text style={styles.heroExerciseNameNoImage}>{item.name}</Text>
              <View style={{ height: 20 }} />
              <TouchableOpacity
                style={styles.generateButton}
                onPress={() => { handleEnrich(true); }}
                disabled={generating}
                activeOpacity={0.7}
              >
                {generating ? (
                  <>
                    <ActivityIndicator size="small" color={colors.onBrand} />
                    <Text style={styles.generateButtonText}>Generating...</Text>
                  </>
                ) : (
                  <>
                    <Sparkles size={20} color={colors.onBrand} />
                    <Text style={styles.generateButtonText}>Generate Image</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* 2. Meta row: Category, Goal, Skill, Scored by (§4.1) */}
          <View style={styles.metaSection}>
            {item.movement_category?.name && (
              <Pressable
                style={styles.metaItem}
                hitSlop={4}
                onPress={() => openFiltered({ categories: [item.movement_category!.name] })}
              >
                <Text style={styles.metaLabel}>Category</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{item.movement_category.name}</Text>
              </Pressable>
            )}
            {(item.goal_rows?.length ?? 0) > 0 && (
              <Pressable
                style={styles.metaItem}
                hitSlop={4}
                onPress={() => openFiltered({
                  goalTypes: item.goal_rows!.map((g) => g.goal_type?.name).filter((n): n is string => !!n),
                })}
              >
                <Text style={styles.metaLabel}>Goal</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {item.goal_rows!.map((g) => g.goal_type?.name).filter(Boolean).join(', ')}
                </Text>
              </Pressable>
            )}
            {item.skill_level && (
              <Pressable
                style={styles.metaItem}
                hitSlop={4}
                onPress={() => openFiltered({ skills: [item.skill_level!] })}
              >
                <Text style={styles.metaLabel}>Skill</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{item.skill_level}</Text>
              </Pressable>
            )}
            {scoredBy !== '' && (
              <Pressable
                style={styles.metaItem}
                hitSlop={4}
                onPress={() => openFiltered({ scoringTypes: scoringRowsOf(item.scoring_rows).map((r) => r.name) })}
              >
                <Text style={styles.metaLabel}>Scored by</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{scoredBy}</Text>
              </Pressable>
            )}
          </View>

          {/* 3. Your history (§4.2) — hidden with no working sets */}
          {userId && history.length > 0 && (
            <HistoryBlock
              userId={userId}
              sets={history}
              today={today}
              skillNote={skillNote}
              onOpenSession={openSession}
              onSeeAll={openAllSessions}
              onRerate={() => setRateVisible(true)}
            />
          )}

          {/* 4. Description */}
          {item.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descriptionText}>{item.description}</Text>
            </View>
          )}

          {/* 5. Also Known As */}
          {aliasNames.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Also Known As</Text>
              <Text style={styles.descriptionText}>{aliasNames.join(', ')}</Text>
            </View>
          )}

          {/* 6. Muscles — every chip is a button into the Exercises tab (§4.4) */}
          {item.muscle_regions && item.muscle_regions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Primary Muscles</Text>
              <View style={styles.muscleContainer}>
                {item.muscle_regions.filter((mr: any) => mr.is_primary).map((mr: any, index: number) => (
                  <TouchableOpacity key={index} style={styles.musclePrimaryChip}
                    onPress={() => openFiltered({ muscles: [mr.muscle_region?.name] })}
                    accessibilityRole="button" accessibilityLabel={`Exercises for ${mr.muscle_region?.name}`}>
                    <Text style={styles.musclePrimaryText}>{mr.muscle_region?.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {item.muscle_regions.some((mr: any) => !mr.is_primary) && (
                <>
                  <Text style={styles.subsectionTitle}>Secondary Muscles</Text>
                  <View style={styles.muscleContainer}>
                    {item.muscle_regions.filter((mr: any) => !mr.is_primary).map((mr: any, index: number) => (
                      <TouchableOpacity key={index} style={styles.muscleSecondaryChip}
                        onPress={() => openFiltered({ muscles: [mr.muscle_region?.name] })}
                        accessibilityRole="button" accessibilityLabel={`Exercises for ${mr.muscle_region?.name}`}>
                        <Text style={styles.muscleSecondaryText}>{mr.muscle_region?.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* 7. Equipment — tiles are buttons too */}
          {equipmentChips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Equipment</Text>
              <View style={styles.equipmentContainer}>
                {equipmentChips.map((equipment, index) => {
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
            </View>
          )}

          {/* 8. Hierarchy — ancestors and the current row always; siblings collapse past four (§4.5) */}
          {!item.is_core && hierarchyData.ancestors.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{capitalize(noun)} Hierarchy</Text>
              <View>
                {hierarchyData.ancestors.map((ancestor, index) =>
                  hierarchyRow(
                    ancestor.id, ancestor.name,
                    ancestor.is_core ? coreBadge : tierBadge(ancestor.tier),
                    () => router.push(`${routeBase}/${ancestor.id}` as never), false, index === 0,
                  ),
                )}
                {hierarchyRow('current', item.name, tierBadge(tier), null, true, false)}
                {siblingView.shown.map((sibling) =>
                  hierarchyRow(
                    sibling.id, sibling.name, tierBadge(sibling.tier ?? 0),
                    () => router.push(`${routeBase}/${sibling.id}` as never), false, false,
                  ),
                )}
                {siblingView.hidden > 0 && (
                  <TouchableOpacity style={styles.seeAllRow} onPress={() => setSiblingsExpanded(true)}
                    accessibilityRole="button" accessibilityLabel={`See all ${hierarchyData.siblings.length} siblings`}>
                    <Text style={styles.seeAllText}>See all {hierarchyData.siblings.length}</Text>
                    <ChevronRight size={16} color={colors.brand} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* 9. Scale It (§4.6) */}
          <ScaleItSection easier={easier} harder={harder}
            onOpen={(exerciseId) => router.push(`${routeBase}/${exerciseId}` as never)} />

          {/* 10. Demo Video (§4.7) — the Find-a-demo link always renders */}
          <DemoVideoCard videoUrl={item.video_url ?? null} exerciseName={item.name} />

          {/* 11. Captured From (§4.8) */}
          <CapturedFromStrip
            sources={sources}
            today={today}
            onOpenCounts={openSourcesScreen}
            onOpenWorkout={openWorkout}
            onOpenCreator={(handle) => openFiltered({ creators: [handle] })}
          />

          {/* 12. Add to today (§4.9) — the last thing in the scroll */}
          {userId && (
            <AddToTodayButton userId={userId} exerciseId={id} exerciseName={item.name} onAdded={openToday} />
          )}
        </ScrollView>

        <UndoToast toast={toast} onDismissed={() => setToast(null)} icon={AlertCircle} />
      </View>

      {/* Re-rate: the existing sheet, one movement, page-owned save (decision 4) */}
      {skillNote && (
        <MovementRatingSheet
          visible={rateVisible}
          sessionId={skillNote.sessionId}
          movements={[{ exerciseId: id, name: item.name }]}
          initialRatings={initialRatings}
          onSave={onRerateSave}
          onClose={() => setRateVisible(false)}
          onSaved={() => setRateVisible(false)}
        />
      )}

      {/* Edit — the one catalog wizard, pre-filled from this row */}
      <Modal visible={editVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditVisible(false)}>
        {editVisible && (
          <CatalogItemWizard
            isMovement={!!item.is_movement}
            editId={item.id}
            onClose={() => setEditVisible(false)}
            onSave={() => { setEditVisible(false); loadItem(); }}
          />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: colors.textMuted },
  errorText: { fontSize: 18, color: colors.text, marginBottom: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 17, color: colors.text },
  menuButton: { padding: 4 },
  backButtonText: { fontSize: 16, color: colors.brand, fontWeight: '600' },
  content: { flex: 1 },
  heroSection: { position: 'relative', width: '100%', height: 220, backgroundColor: colors.surface, overflow: 'hidden' },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: 300 },
  heroGradient: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  heroPlaceholder: {
    height: 220, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border, position: 'relative',
  },
  heroBadgeTopRight: { position: 'absolute', top: 16, right: 16 },
  generateButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: colors.brand, borderRadius: 8,
  },
  generateButtonText: { fontSize: 16, fontWeight: '600', color: colors.onBrand },
  heroOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 16 },
  heroExerciseName: {
    fontSize: 34, fontWeight: 'bold', color: colors.text, marginBottom: 8,
    textShadowColor: tint(colors.shadow, 0.75), textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  heroExerciseNameNoImage: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 8, textAlign: 'center' },
  heroCoreBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.success, borderRadius: 6 },
  heroTierBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.accents.water, borderRadius: 6 },
  heroBadgeText: { fontSize: 11, fontWeight: '600', color: colors.onBrand, letterSpacing: 0.5 },
  metaSection: {
    flexDirection: 'row', padding: 16, gap: 12, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 },
  subsectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8 },
  descriptionText: { fontSize: 15, lineHeight: 22, color: colors.text },
  equipmentContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  equipmentItem: { alignItems: 'center', width: 80 },
  equipmentIconContainer: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: tint(colors.brand, 0.08),
    alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: tint(colors.brand, 0.19),
  },
  equipmentLabel: { fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' },
  muscleContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  musclePrimaryChip: {
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: tint(colors.brand, 0.125),
    borderRadius: 8, borderWidth: 1, borderColor: colors.brand,
  },
  musclePrimaryText: { fontSize: 14, fontWeight: '600', color: colors.brand },
  muscleSecondaryChip: {
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  muscleSecondaryText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  hierarchyParent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 0 },
  hierarchyWrapper: { position: 'relative' },
  hierarchyConnectorLine: { position: 'absolute', left: 23, top: 0, bottom: 0, width: 2, backgroundColor: colors.border },
  hierarchyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 48 },
  hierarchyCurrentItem: {
    backgroundColor: tint(colors.brand, 0.1), borderLeftWidth: 3, borderLeftColor: colors.brand,
    marginVertical: 4, borderRadius: 8, paddingLeft: 45,
  },
  hierarchyConnector: { width: 0, alignItems: 'center', justifyContent: 'center' },
  connectorDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border,
    borderWidth: 2, borderColor: colors.bg, marginLeft: -48,
  },
  connectorDotCurrent: { backgroundColor: colors.brand, borderColor: colors.brand, width: 12, height: 12, borderRadius: 6 },
  hierarchyItemContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hierarchyItemName: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text },
  hierarchyCurrentText: { fontWeight: '700', color: colors.brand },
  coreHierarchyBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: tint(colors.brand, 0.3),
  },
  coreHierarchyBadgeText: { fontSize: 10, fontWeight: '700', color: colors.brand, letterSpacing: 0.5 },
  tierHierarchyBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    backgroundColor: tint(colors.accents.water), borderWidth: 1, borderColor: tint(colors.accents.water, 0.3),
  },
  tierHierarchyBadgeText: { fontSize: 10, fontWeight: '700', color: colors.accents.water, letterSpacing: 0.5 },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 48, paddingVertical: 10 },
  seeAllText: { fontSize: 14, fontWeight: '600', color: colors.brand },
});
