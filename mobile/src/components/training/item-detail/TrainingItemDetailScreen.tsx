// The detail page behind both Training tabs.
//
// "Exercises" and "Movements" are two doors onto one `exercises` table — the
// two routes ran byte-identical queries — but each kept its own 1,000-line
// copy of this screen, so a fix to one left the other behind. What genuinely
// differed was two things: the word on screen and which tab the hierarchy
// links stay inside (the server decides from is_movement whether the photo
// gets a CrossFit athlete). Those are the props; everything else is shared.
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Image,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Sparkles, MoreVertical, Dumbbell, Weight, Circle, ExternalLink } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { equipmentNamesOf } from '@/src/lib/exerciseEquipment';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import type { CaptureSource } from '@/src/types/capture';
import { supabase } from '@/src/lib/supabase';
import { fetchAncestors } from '@/src/lib/supabase/crossfit';
import { fetchExerciseSources } from '@/src/lib/supabase/capture';
import { enrichExercise } from '@/src/lib/supabase/enrich';
import { CatalogItemWizard } from '@/src/components/training/crossfit/CatalogItemWizard';

export interface TrainingItemDetailScreenProps {
  /** How this tab names the thing, lower case: "exercise" or "movement". */
  noun: string;
  /** Plural of the same, for copy like "movements you created". */
  nounPlural: string;
  /**
   * Route prefix for the hierarchy links, so tapping a parent or sibling
   * keeps you in the tab you arrived through rather than teleporting you
   * into the other one.
   */
  routeBase: string;
}

/** "movement" -> "Movement", for sentence-leading copy. */
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The detail row plus the junction embeds this screen reads (Stage 5, Task 3).
 * equipment_rows comes from the base Exercise type.
 */
interface DetailRow extends ExerciseWithVariations {
  alias_rows?: { alias: string; kind: string }[];
  goal_rows?: { goal_type: { id: string; name: string } | null }[];
}

/**
 * "Also known as" names from exercise_aliases (all kinds), deduplicated
 * case-insensitively and excluding the display name itself. The legacy
 * aliases array is no longer read.
 */
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

export function TrainingItemDetailScreen({
  noun,
  nounPlural,
  routeBase,
}: TrainingItemDetailScreenProps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<DetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tier, setTier] = useState<number>(0);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [editVisible, setEditVisible] = useState(false);
  const [hierarchyData, setHierarchyData] = useState<{
    ancestors: Array<{ id: string; name: string; is_core: boolean; tier: number }>;
    siblings: ExerciseWithVariations[];
  }>({ ancestors: [], siblings: [] });

  useEffect(() => {
    loadItem();
    checkAdminStatus();
    loadSources();
  }, [id]);

  useEffect(() => {
    if (item && !item.is_core && item.parent_exercise_id) {
      loadHierarchy();
    }
  }, [item]);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      setIsAdmin(profile?.is_admin || false);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  /**
   * Where a captured exercise came from. Most of the library was never
   * captured from anything, so an empty list is the normal case and the
   * section simply doesn't appear.
   */
  const loadSources = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !id) {
        setSources([]);
        return;
      }
      setSources(await fetchExerciseSources(id, user.id));
    } catch (error) {
      console.error('Error loading capture sources:', error);
      setSources([]);
    }
  };

  const loadItem = async () => {
    try {
      setLoading(true);
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
          alias_rows:exercise_aliases(alias, kind)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setItem(data as any);

      // Tier is stored on the row (engine-maintained). Outliers carry NULL,
      // which renders as no badge — same as the old computed 0 did.
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
      // Bounded walk up the parent chain — at most 4 single-row lookups (the
      // DB caps hierarchy depth), instead of reading the whole table to draw
      // a two-item tree. Each rung's tier comes off its stored column.
      const ancestors = await fetchAncestors(item.parent_exercise_id);

      // Fetch sibling items (same parent, same tier level)
      const { data: siblingsData, error: siblingsError } = await supabase
        .from('exercises')
        .select('id, name, is_core, parent_exercise_id')
        .eq('parent_exercise_id', item.parent_exercise_id)
        .neq('id', id) // Exclude current item
        .order('name');

      if (siblingsError) throw siblingsError;

      setHierarchyData({
        ancestors,
        siblings: (siblingsData || []) as any[],
      });
    } catch (error) {
      console.error('Error loading hierarchy:', error);
    }
  };

  // Helper function to get equipment icon
  const getEquipmentIcon = (equipmentName: string) => {
    const name = equipmentName.toLowerCase();

    // Map equipment names to icons
    if (name.includes('barbell') || name.includes('bar')) {
      return Weight;
    } else if (name.includes('dumbbell') || name.includes('db')) {
      return Dumbbell;
    } else if (name.includes('kettlebell') || name.includes('kb')) {
      return Weight;
    } else if (name.includes('plate') || name.includes('bumper')) {
      return Circle;
    } else if (name.includes('pull-up') || name.includes('pullup')) {
      return Circle;
    } else if (name.includes('box') || name.includes('bench')) {
      return Circle;
    } else if (name.includes('rope') || name.includes('ring')) {
      return Circle;
    } else {
      return Circle;
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

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading item...</Text>
        </View>
      </>
    );
  }

  // Junction-backed display data (legacy arrays are no longer read).
  // Bodyweight is implied, not equipment — it never gets a chip, matching the
  // old render which skipped it.
  const equipmentChips = item
    ? equipmentNamesOf(item).filter((name) => name.toLowerCase() !== 'bodyweight')
    : [];
  const aliasNames = item ? aliasNamesOf(item) : [];

  if (!item) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <Text style={styles.errorText}>{capitalize(noun)} not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>{capitalize(nounPlural)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton}>
            <MoreVertical size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Image with Overlay or Generate Button */}
        {item.image_url ? (
          <View style={styles.heroSection}>
            <Image
              source={{ uri: item.image_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
            {/* Gradient Overlay */}
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
              style={styles.heroGradient}
            />
            {/* Name & badge overlay */}
            <View style={styles.heroOverlay}>
              <Text style={styles.heroExerciseName}>{item.name}</Text>
              {item.is_core === true ? (
                <View style={styles.heroCoreBadge}>
                  <Text style={styles.heroCoreBadgeText}>CORE</Text>
                </View>
              ) : tier > 0 ? (
                <View style={styles.heroTierBadge}>
                  <Text style={styles.heroTierBadgeText}>TIER {tier}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.heroPlaceholder}>
            {/* Badge in top-right corner */}
            {item.is_core === true ? (
              <View style={styles.heroBadgeTopRight}>
                <View style={styles.heroCoreBadge}>
                  <Text style={styles.heroCoreBadgeText}>CORE</Text>
                </View>
              </View>
            ) : tier > 0 ? (
              <View style={styles.heroBadgeTopRight}>
                <View style={styles.heroTierBadge}>
                  <Text style={styles.heroTierBadgeText}>TIER {tier}</Text>
                </View>
              </View>
            ) : null}
            {/* Name (centered) */}
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
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generating...</Text>
                </>
              ) : (
                <>
                  <Sparkles size={20} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generate Image</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Category, Goal Type & Skill Level */}
        <View style={styles.metaSection}>
          {item.movement_category?.name && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Category</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{item.movement_category.name}</Text>
            </View>
          )}
          {(item.goal_rows?.length ?? 0) > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Goal Type</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {item.goal_rows!.map((g) => g.goal_type?.name).filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
          {item.skill_level && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Skill Level</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{item.skill_level}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {item.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{item.description}</Text>
          </View>
        )}

        {/* Also Known As — every alias the catalog answers to (exercise_aliases) */}
        {aliasNames.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Also Known As</Text>
            <Text style={styles.descriptionText}>{aliasNames.join(', ')}</Text>
          </View>
        )}

        {/* Primary Muscles */}
        {item.muscle_regions && item.muscle_regions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Primary Muscles</Text>
            <View style={styles.muscleContainer}>
              {item.muscle_regions
                .filter((mr: any) => mr.is_primary)
                .map((mr: any, index: number) => (
                  <View key={index} style={styles.musclePrimaryChip}>
                    <Text style={styles.musclePrimaryText}>{mr.muscle_region?.name}</Text>
                  </View>
                ))}
            </View>
            {item.muscle_regions.some((mr: any) => !mr.is_primary) && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 16, marginTop: 16, marginBottom: 8 }]}>
                  Secondary Muscles
                </Text>
                <View style={styles.muscleContainer}>
                  {item.muscle_regions
                    .filter((mr: any) => !mr.is_primary)
                    .map((mr: any, index: number) => (
                      <View key={index} style={styles.muscleSecondaryChip}>
                        <Text style={styles.muscleSecondaryText}>{mr.muscle_region?.name}</Text>
                      </View>
                    ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Equipment — exercise_equipment junction (cores: default-equipment string) */}
        {equipmentChips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            <View style={styles.equipmentContainer}>
              {equipmentChips.map((equipment, index) => {
                const EquipmentIcon = getEquipmentIcon(equipment);
                return (
                  <View key={index} style={styles.equipmentItem}>
                    <View style={styles.equipmentIconContainer}>
                      <EquipmentIcon size={32} color={colors.primary} strokeWidth={1.5} />
                    </View>
                    <Text style={styles.equipmentLabel}>{equipment}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Hierarchy */}
        {!item.is_core && hierarchyData.ancestors.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{capitalize(noun)} Hierarchy</Text>

            <View style={styles.hierarchyContainer}>
              {/* Render all ancestors (core first, then tier 1, tier 2, etc.) */}
              {hierarchyData.ancestors.map((ancestor, index) => (
                <View key={ancestor.id} style={index > 0 ? styles.hierarchyAncestorWrapper : undefined}>
                  {index > 0 && <View style={styles.hierarchyConnectorLine} />}
                  <TouchableOpacity
                    style={index === 0 ? styles.hierarchyParent : styles.hierarchyItem}
                    onPress={() => router.push(`${routeBase}/${ancestor.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.hierarchyConnector}>
                      <View style={styles.connectorDot} />
                    </View>
                    <View style={styles.hierarchyItemContent}>
                      {ancestor.is_core ? (
                        <View style={styles.coreHierarchyBadge}>
                          <Text style={styles.coreHierarchyBadgeText}>CORE</Text>
                        </View>
                      ) : (
                        <View style={styles.tierHierarchyBadge}>
                          <Text style={styles.tierHierarchyBadgeText}>TIER {ancestor.tier}</Text>
                        </View>
                      )}
                      <Text style={styles.hierarchyItemName} numberOfLines={1} ellipsizeMode="tail">
                        {ancestor.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ))}

              {/* The one you are looking at (highlighted) */}
              <View style={styles.hierarchyCurrentWrapper}>
                <View style={styles.hierarchyConnectorLine} />
                <View style={[styles.hierarchyItem, styles.hierarchyCurrentItem]}>
                  <View style={styles.hierarchyConnector}>
                    <View style={[styles.connectorDot, styles.connectorDotCurrent]} />
                  </View>
                  <View style={styles.hierarchyItemContent}>
                    <View style={styles.tierHierarchyBadge}>
                      <Text style={styles.tierHierarchyBadgeText}>TIER {tier}</Text>
                    </View>
                    <Text
                      style={[styles.hierarchyItemName, styles.hierarchyCurrentText]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.name}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Siblings */}
              {hierarchyData.siblings.map((sibling, index) => (
                <View key={sibling.id} style={styles.hierarchySiblingWrapper}>
                  <View style={styles.hierarchyConnectorLine} />
                  <TouchableOpacity
                    style={styles.hierarchyItem}
                    onPress={() => router.push(`${routeBase}/${sibling.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.hierarchyConnector}>
                      <View style={styles.connectorDot} />
                    </View>
                    <View style={styles.hierarchyItemContent}>
                      <View style={styles.tierHierarchyBadge}>
                        <Text style={styles.tierHierarchyBadgeText}>TIER {tier}</Text>
                      </View>
                      <Text style={styles.hierarchyItemName} numberOfLines={1} ellipsizeMode="tail">
                        {sibling.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Demo Video */}
        {item.video_url && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Demo Video</Text>
            <TouchableOpacity
              style={styles.videoLinkButton}
              onPress={() => {
                if (item.video_url) {
                  Linking.openURL(item.video_url);
                }
              }}
            >
              <Text style={styles.videoLinkText}>Watch Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Captured From — the post this came from, so provenance survives
            after the catalog card stopped carrying the link. */}
        {sources.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Captured From</Text>
            {sources.map((source) => (
              <TouchableOpacity
                key={source.sourceId}
                style={styles.captureSourceRow}
                activeOpacity={0.7}
                onPress={() => Linking.openURL(source.sourceUrl)}
                accessibilityRole="link"
                accessibilityLabel={
                  `Open the ${source.platform} post` +
                  (source.posterHandle ? ` by ${source.posterHandle}` : '') + '.'
                }
              >
                <ExternalLink size={15} color={colors.primary} />
                <Text style={styles.captureSourceHandle}>
                  {source.posterHandle ?? capitalize(source.platform)}
                </Text>
                {source.posterHandle && (
                  <Text style={styles.captureSourcePlatform}>
                    on {capitalize(source.platform)}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      </View>

      {/* Edit — the one catalog wizard, pre-filled from this row */}
      <Modal
        visible={editVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setEditVisible(false)}
      >
        {editVisible && (
          <CatalogItemWizard
            isMovement={!!item.is_movement}
            editId={item.id}
            onClose={() => setEditVisible(false)}
            onSave={() => {
              setEditVisible(false);
              loadItem();
            }}
          />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  errorText: {
    fontSize: 18,
    color: colors.foreground,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  menuButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  heroSection: {
    position: 'relative',
    width: '100%',
    height: 220,
    backgroundColor: '#1A1F2E',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 300,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heroPlaceholder: {
    height: 220,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
  },
  heroBadgeTopRight: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 16,
  },
  heroExerciseName: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroExerciseNameNoImage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroCoreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  heroCoreBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroTierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
  },
  heroTierBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  metaSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
    backgroundColor: '#1A1F2E',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.foreground,
  },
  equipmentContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  equipmentItem: {
    alignItems: 'center',
    width: 80,
  },
  equipmentIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  equipmentLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.foreground,
    textAlign: 'center',
  },
  muscleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  musclePrimaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primary + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  musclePrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  muscleSecondaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1A1F2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muscleSecondaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  videoLinkButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  videoLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  captureSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  captureSourceHandle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  captureSourcePlatform: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  hierarchyContainer: {
    gap: 0,
  },
  hierarchyParent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 0,
  },
  hierarchyCurrentWrapper: {
    position: 'relative',
  },
  hierarchySiblingWrapper: {
    position: 'relative',
  },
  hierarchyAncestorWrapper: {
    position: 'relative',
  },
  hierarchyConnectorLine: {
    position: 'absolute',
    left: 23,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.border,
  },
  hierarchyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 48,
  },
  hierarchyCurrentItem: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginVertical: 4,
    borderRadius: 8,
    paddingLeft: 45,
  },
  hierarchyConnector: {
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    borderWidth: 2,
    borderColor: colors.background,
    marginLeft: -48,
  },
  connectorDotCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  hierarchyItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hierarchyItemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.foreground,
  },
  hierarchyCurrentText: {
    fontWeight: '700',
    color: colors.primary,
  },
  coreHierarchyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  coreHierarchyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  tierHierarchyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  tierHierarchyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
});
