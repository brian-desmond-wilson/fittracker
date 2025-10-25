import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Clock,
  Zap,
  Timer,
  Target,
  TrendingUp,
  Ruler,
  MapPin,
  Flame,
  Dumbbell,
  Activity,
  Package,
  Group,
  Sparkles,
  MoreVertical,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WODWithDetails, ScalingLevel } from "@/src/types/crossfit";
import { fetchWODById } from "@/src/lib/supabase/crossfit";
import { supabase } from "@/src/lib/supabase";
import { WODStructureVisualizer } from './WODStructureVisualizer';
import { ScalingComparisonView } from './ScalingComparisonView';
import {
  getWODStats,
  getCategoryDisplay,
  getGoalTypeDisplay,
  formatDistance,
  formatWeight,
  aggregateMovementCategories,
  formatMuscleGroups,
  getMovementPlaceholderIcon,
  formatTimeCap,
} from '@/src/lib/wodDetailHelpers';

interface WODDetailScreenProps {
  wodId: string;
  onClose: () => void;
}

export function WODDetailScreen({ wodId, onClose }: WODDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const [wod, setWod] = useState<WODWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedScaling, setSelectedScaling] = useState<ScalingLevel>("Rx");
  const [showComparison, setShowComparison] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);

  useEffect(() => {
    loadWOD();
  }, [wodId]);

  const loadWOD = async () => {
    try {
      setLoading(true);
      const data = await fetchWODById(wodId);
      setWod(data);
    } catch (error) {
      console.error("Error loading WOD:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!wod) return;

    try {
      setGeneratingImage(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to generate an image');
        return;
      }

      // Build prompt using the same logic as createWOD
      const { buildWODImagePrompt } = await import('@/src/lib/gemini');

      // Fetch exercise names for movements
      const movementPromises = (wod.movements || []).map(async (movement) => {
        return {
          name: movement.exercise?.name || 'Movement',
        };
      });

      const movements = await Promise.all(movementPromises);

      const prompt = buildWODImagePrompt({
        wodName: wod.name,
        formatName: wod.format?.name || 'For Time',
        movements,
        timeCap: wod.time_cap_minutes,
        repScheme: wod.rep_scheme,
      });

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('generate-wod-image', {
        body: {
          wodId: wod.id,
          prompt,
          userId: user.id,
        },
      });

      if (error) {
        throw error;
      }

      // Show success and reload WOD to get new image
      Alert.alert(
        'Success',
        'AI image generated successfully!',
        [{ text: 'OK', onPress: () => loadWOD() }]
      );

    } catch (error) {
      console.error('Error generating image:', error);
      Alert.alert('Error', 'Failed to generate image. Please try again.');
    } finally {
      setGeneratingImage(false);
    }
  };

  // Get category badge color
  const getCategoryColor = (categoryName: string) => {
    switch (categoryName) {
      case "The Girls":
        return colors.primary;
      case "Heroes":
        return "#EF4444";
      case "Daily WOD":
        return "#10B981";
      default:
        return colors.mutedForeground;
    }
  };

  // Get score type icons and labels
  const getScoreTypes = () => {
    if (!wod) return [];

    const types: Array<{ icon: any; label: string; color: string }> = [];

    if (wod.score_type_time) {
      types.push({ icon: Clock, label: "Time", color: colors.primary });
    }
    if (wod.score_type_rounds) {
      types.push({ icon: Target, label: "Rounds", color: "#10B981" });
    }
    if (wod.score_type_reps) {
      types.push({ icon: TrendingUp, label: "Reps", color: "#F59E0B" });
    }
    if (wod.score_type_load) {
      types.push({ icon: Ruler, label: "Load", color: "#8B5CF6" });
    }
    if (wod.score_type_distance) {
      types.push({ icon: MapPin, label: "Distance", color: "#3B82F6" });
    }
    if (wod.score_type_calories) {
      types.push({ icon: Flame, label: "Calories", color: "#EF4444" });
    }

    return types;
  };

  // Get rep scheme for movement (custom or WOD-level)
  const getRepScheme = (movement: any) => {
    // If movement has custom rep scheme override, use it
    if (movement.custom_rep_scheme && movement.follows_wod_scheme === false) {
      return movement.custom_rep_scheme;
    }
    // Otherwise use WOD-level rep scheme
    return wod?.rep_scheme || '';
  };

  // Get movements for selected scaling level with formatted details
  const getScaledMovements = () => {
    if (!wod || !wod.movements) return [];

    return wod.movements.map((movement) => {
      const repScheme = getRepScheme(movement);
      let repsDisplay = '';
      let weightDisplay = '';
      let variation = '';

      switch (selectedScaling) {
        case "Rx":
          // Reps: use rep scheme
          if (repScheme) repsDisplay = repScheme;

          // Weight: gender-split format
          if (movement.rx_weight_men_lbs && movement.rx_weight_women_lbs) {
            weightDisplay = `${movement.rx_weight_men_lbs}/${movement.rx_weight_women_lbs} lbs`;
          } else if (movement.rx_weight_men_lbs) {
            weightDisplay = `${movement.rx_weight_men_lbs} lbs (M)`;
          } else if (movement.rx_weight_women_lbs) {
            weightDisplay = `${movement.rx_weight_women_lbs} lbs (W)`;
          }

          variation = movement.rx_movement_variation || '';
          break;

        case "L2":
          // Reps: custom or rep scheme
          if (movement.l2_reps) {
            const repsValue = String(movement.l2_reps);
            const isRepScheme = repsValue.includes('-');
            repsDisplay = isRepScheme ? repsValue : `${movement.l2_reps} reps`;
          } else if (repScheme) {
            repsDisplay = repScheme;
          }

          // Weight: gender-split format
          if (movement.l2_weight_men_lbs && movement.l2_weight_women_lbs) {
            weightDisplay = `${movement.l2_weight_men_lbs}/${movement.l2_weight_women_lbs} lbs`;
          } else if (movement.l2_weight_men_lbs) {
            weightDisplay = `${movement.l2_weight_men_lbs} lbs (M)`;
          } else if (movement.l2_weight_women_lbs) {
            weightDisplay = `${movement.l2_weight_women_lbs} lbs (W)`;
          }

          variation = movement.l2_movement_variation || '';
          break;

        case "L1":
          // Reps: custom or rep scheme
          if (movement.l1_reps) {
            const repsValue = String(movement.l1_reps);
            const isRepScheme = repsValue.includes('-');
            repsDisplay = isRepScheme ? repsValue : `${movement.l1_reps} reps`;
          } else if (repScheme) {
            repsDisplay = repScheme;
          }

          // Weight: gender-split format
          if (movement.l1_weight_men_lbs && movement.l1_weight_women_lbs) {
            weightDisplay = `${movement.l1_weight_men_lbs}/${movement.l1_weight_women_lbs} lbs`;
          } else if (movement.l1_weight_men_lbs) {
            weightDisplay = `${movement.l1_weight_men_lbs} lbs (M)`;
          } else if (movement.l1_weight_women_lbs) {
            weightDisplay = `${movement.l1_weight_women_lbs} lbs (W)`;
          }

          variation = movement.l1_movement_variation || '';
          break;
      }

      return {
        ...movement,
        repsDisplay,
        weightDisplay,
        variation,
      };
    });
  };

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading WOD...</Text>
        </View>
      </>
    );
  }

  if (!wod) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <Text style={styles.errorText}>WOD not found</Text>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const scaledMovements = getScaledMovements();
  const scoreTypes = getScoreTypes();
  const wodStats = getWODStats(wod);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Hero Image with Overlay or Generate Button */}
          {wod.image_url ? (
            <View style={styles.heroSection}>
              <Image
                source={{ uri: wod.image_url }}
                style={styles.heroImage}
                resizeMode="cover"
              />
              {/* Gradient Overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                start={{ x: 0, y: 0.6 }}
                end={{ x: 0, y: 1 }}
                style={styles.heroGradient}
              >
                {/* Overlaid Content */}
                <View style={styles.heroOverlayContent}>
                  <Text style={styles.heroTitle}>{wod.name}</Text>
                  <View style={styles.heroMetaRow}>
                    <View style={styles.heroCategoryBadge}>
                      <Text style={styles.heroCategoryText}>{wod.category?.name}</Text>
                    </View>
                    <View style={styles.heroFormatRow}>
                      {(wod.rep_scheme_type === 'fixed_rounds' || wod.format?.name === 'Rounds For Time') ? (
                        <Timer size={16} color="#FFFFFF" />
                      ) : (
                        <Zap size={16} color="#FFFFFF" />
                      )}
                      <Text style={styles.heroFormatText}>
                        {wod.format?.name}
                        {wod.time_cap_minutes && ` • ${wod.time_cap_minutes} min cap`}
                      </Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
              {/* Three-dot menu button */}
              <TouchableOpacity
                style={styles.imageMenuButton}
                onPress={() => setShowImageMenu(true)}
                activeOpacity={0.7}
              >
                <MoreVertical size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.generateImageSection}>
              <TouchableOpacity
                style={styles.generateImageButton}
                onPress={handleGenerateImage}
                disabled={generatingImage}
              >
                {generatingImage ? (
                  <>
                    <ActivityIndicator size="small" color={colors.background} />
                    <Text style={styles.generateImageText}>Generating AI Image...</Text>
                  </>
                ) : (
                  <>
                    <Sparkles size={20} color={colors.background} />
                    <Text style={styles.generateImageText}>Generate AI Image</Text>
                  </>
                )}
              </TouchableOpacity>
              {/* Title below generate button */}
              <View style={styles.titleSection}>
                <Text style={styles.wodTitle}>{wod.name}</Text>
              </View>
            </View>
          )}

          {/* Integrated Stats Row */}
          <View style={styles.integratedStatsRow}>
            {/* Movement Names */}
            <View style={styles.statColumn}>
              <Image
                source={require('@/assets/kettlebell.png')}
                style={styles.kettlebellIcon}
                resizeMode="contain"
              />
              <View style={styles.statTextContainer}>
                {(wod.movements || []).slice(0, 2).map((movement, index) => (
                  <Text key={index} style={styles.statText} numberOfLines={1}>
                    {movement.exercise?.name || 'Movement'}
                  </Text>
                ))}
                {(wod.movements || []).length > 2 && (
                  <Text style={styles.statText}>+{(wod.movements || []).length - 2} more</Text>
                )}
              </View>
            </View>

            {/* Movement Categories */}
            <View style={styles.statColumn}>
              <Group size={18} color="#10B981" strokeWidth={2} />
              <View style={styles.statTextContainer}>
                {(() => {
                  const categories = new Set<string>();
                  (wod.movements || []).forEach(movement => {
                    const category = (movement.exercise as any)?.movement_category?.name;
                    if (category) categories.add(category);
                  });
                  const categoryArray = Array.from(categories).slice(0, 2);
                  return categoryArray.map((cat, index) => (
                    <Text key={index} style={styles.statText} numberOfLines={1}>
                      {cat}
                    </Text>
                  ));
                })()}
              </View>
            </View>

            {/* Time Cap */}
            <View style={styles.statColumn}>
              <Clock size={18} color="#F59E0B" strokeWidth={2} />
              <View style={styles.statTextContainer}>
                <Text style={styles.statText}>
                  {formatTimeCap(wod.time_cap_minutes, wod.format?.name || 'For Time', wod.rep_scheme)}
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {wod.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.description}>{wod.description}</Text>
            </View>
          )}

          {/* WOD Structure Visualization */}
          <WODStructureVisualizer wod={wod} />

          {/* Scaling Selector */}
          <View style={styles.scalingSection}>
            <View style={styles.scalingHeader}>
              <Text style={styles.sectionTitle}>Scaling</Text>
              <TouchableOpacity
                style={styles.comparisonToggle}
                onPress={() => setShowComparison(!showComparison)}
              >
                <Text style={styles.comparisonToggleText}>
                  {showComparison ? 'Single View' : 'Compare'}
                </Text>
              </TouchableOpacity>
            </View>

            {!showComparison && (
              <>
                <View style={styles.scalingTabs}>
                  {(["Rx", "L2", "L1"] as ScalingLevel[]).map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.scalingTab,
                        selectedScaling === level && styles.scalingTabActive,
                      ]}
                      onPress={() => setSelectedScaling(level)}
                    >
                      <Text
                        style={[
                          styles.scalingTabText,
                          selectedScaling === level && styles.scalingTabTextActive,
                        ]}
                      >
                        {level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Scaling Description */}
                {wod.scaling_levels && wod.scaling_levels.length > 0 && (
                  <View style={styles.scalingDescription}>
                    {wod.scaling_levels
                      .filter((s) => s.level_name === selectedScaling)
                      .map((s) => (
                        <Text key={s.id} style={styles.scalingDescText}>
                          {s.description}
                        </Text>
                      ))}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Movements List or Comparison View */}
          <View style={styles.movementsSection}>
            {showComparison ? (
              <>
                <Text style={styles.sectionTitle}>Scaling Comparison</Text>
                <ScalingComparisonView wod={wod} />
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Movements</Text>
                {scaledMovements.map((movement, index) => {
                  const exercise = movement.exercise as any;

                  // Get category and goal type
                  const categoryName = exercise?.movement_category?.name;
                  const goalTypeName = exercise?.goal_type?.name;

                  // Get image or placeholder
                  const imageUrl = exercise?.thumbnail_url || exercise?.image_url;
                  const placeholderIcon = getMovementPlaceholderIcon(categoryName);

                  // Get muscle groups
                  const muscleGroups = exercise?.muscle_regions
                    ? formatMuscleGroups(exercise.muscle_regions)
                    : '';

                  // Get distance info
                  let distanceDisplay = null;
                  const distanceValue = (movement as any)[`${selectedScaling.toLowerCase()}_distance_value`];
                  const distanceUnit = (movement as any)[`${selectedScaling.toLowerCase()}_distance_unit`];
                  if (distanceValue && distanceUnit) {
                    distanceDisplay = formatDistance(distanceValue, distanceUnit);
                  }

                  return (
                    <View key={movement.id} style={styles.movementCard}>
                      {/* Movement Image and Content Container */}
                      <View style={styles.movementCardContent}>
                        {/* Movement Image */}
                        <View style={styles.movementImageContainer}>
                          {imageUrl ? (
                            <Image
                              source={{ uri: imageUrl }}
                              style={styles.movementImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.movementPlaceholder}>
                              <Text style={styles.movementPlaceholderIcon}>{placeholderIcon}</Text>
                            </View>
                          )}
                        </View>

                        {/* Movement Info */}
                        <View style={styles.movementInfo}>
                          {/* Movement Header */}
                          <View style={styles.movementHeader}>
                            <Text style={styles.movementNumber}>{index + 1}.</Text>
                            <Text style={styles.movementName}>
                              {movement.exercise?.name}
                            </Text>
                            {categoryName && (
                              <View style={styles.movementCategoryBadge}>
                                <Text style={styles.movementCategoryText}>{categoryName}</Text>
                              </View>
                            )}
                          </View>

                          {/* Rep Scheme (if present) */}
                          {movement.repsDisplay && (
                            <View style={styles.movementRepScheme}>
                              <TrendingUp size={14} color={colors.primary} />
                              <Text style={styles.movementRepText}>{movement.repsDisplay}</Text>
                            </View>
                          )}

                          {/* Description (if available) */}
                          {exercise?.description && (
                            <Text style={styles.movementDescription} numberOfLines={2}>
                              {exercise.description}
                            </Text>
                          )}

                          {/* Movement Metadata Row */}
                          <View style={styles.movementMetadataRow}>
                            {/* Category */}
                            {categoryName && (
                              <View style={styles.movementMetaItem}>
                                <Activity size={14} color="#10B981" />
                                <Text style={styles.movementMetaText}>{categoryName}</Text>
                              </View>
                            )}

                            {/* Muscle Groups */}
                            {muscleGroups && (
                              <View style={styles.movementMetaItem}>
                                <Flame size={14} color="#F59E0B" />
                                <Text style={styles.movementMetaText}>{muscleGroups}</Text>
                              </View>
                            )}

                            {/* Skill Level */}
                            {exercise?.skill_level && (
                              <View style={styles.movementMetaItem}>
                                <Target size={14} color="#8B5CF6" />
                                <Text style={styles.movementMetaText}>{exercise.skill_level}</Text>
                              </View>
                            )}
                          </View>

                          {/* Weight and Distance Specs */}
                          <View style={styles.movementDetailsRow}>
                            {movement.weightDisplay && (
                              <View style={styles.detailChip}>
                                <Dumbbell size={14} color="#8B5CF6" />
                                <Text style={styles.movementDetailText}>{movement.weightDisplay}</Text>
                              </View>
                            )}
                            {distanceDisplay && (
                              <View style={styles.detailChip}>
                                <MapPin size={14} color="#3B82F6" />
                                <Text style={styles.movementDetailText}>{distanceDisplay.primary}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Movement Variation */}
                      {movement.variation && (
                        <View style={styles.variationContainer}>
                          <Text style={styles.variationText}>📝 {movement.variation}</Text>
                        </View>
                      )}

                      {/* Movement Notes */}
                      {movement.notes && (
                        <Text style={styles.movementNotes}>ℹ️ {movement.notes}</Text>
                      )}

                      {/* Movement Standards */}
                      {movement.standards && movement.standards.length > 0 && (
                        <View style={styles.standardsContainer}>
                          <Text style={styles.standardsLabel}>Standards:</Text>
                          <View style={styles.standardsList}>
                            {movement.standards.map((standard) => (
                              <View key={standard.id} style={styles.standardBadge}>
                                <Text style={styles.standardText}>{standard.standard_name}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Image Menu Modal */}
      <Modal
        visible={showImageMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowImageMenu(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowImageMenu(false);
                handleGenerateImage();
              }}
              disabled={generatingImage}
            >
              <Sparkles size={20} color={colors.primary} />
              <Text style={styles.menuItemText}>Regenerate Image</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  errorText: {
    fontSize: 18,
    color: "#EF4444",
    marginBottom: 20,
  },

  // WOD Image Section
  // Hero Image Section with Overlay
  heroSection: {
    position: 'relative',
    width: '100%',
    height: 220,
    backgroundColor: '#1A1F2E',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroOverlayContent: {
    gap: 12,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroCategoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  heroCategoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  heroFormatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroFormatText: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },

  // Generate Image Section (when no image)
  generateImageSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  generateImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  generateImageText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },

  // Title Section (only for WODs without images)
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  wodTitle: {
    fontSize: 34,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  // Integrated Stats Row
  integratedStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderTopColor: '#2D3748',
  },
  statColumn: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  statTextContainer: {
    alignItems: 'center',
    gap: 2,
  },
  statText: {
    fontSize: 11,
    color: colors.foreground,
    fontWeight: '600',
    textAlign: 'center',
  },
  kettlebellIcon: {
    width: 18,
    height: 18,
    tintColor: colors.primary,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },

  // Description
  descriptionSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: colors.mutedForeground,
    lineHeight: 24,
  },

  // Quick Stats Card (kept for backward compatibility, but no longer used)
  quickStatsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  quickStatsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748',
  },
  metaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary + '40',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '60',
  },
  metaBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  metaInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  metaInfoText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.foreground,
  },
  quickStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  quickStatItem: {
    alignItems: "center",
    gap: 8,
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  quickStatLabel: {
    fontSize: 13,
    color: colors.mutedForeground,
  },

  // Sections
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },

  // Scaling Section
  scalingSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  scalingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  comparisonToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary + '20',
    borderRadius: 8,
  },
  comparisonToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  scalingTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  scalingTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1A1F2E",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#2D3748",
  },
  scalingTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scalingTabText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  scalingTabTextActive: {
    color: "#FFFFFF",
  },
  scalingDescription: {
    padding: 14,
    backgroundColor: "#1A1F2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  scalingDescText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },

  // Movements Section
  movementsSection: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  movementCard: {
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  movementCardContent: {
    flexDirection: 'row',
  },
  movementImageContainer: {
    width: 100,
    height: 120,
    backgroundColor: '#1A1F2E',
  },
  movementImage: {
    width: '100%',
    height: '100%',
  },
  movementPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D3748',
  },
  movementPlaceholderIcon: {
    fontSize: 40,
  },
  movementInfo: {
    flex: 1,
    padding: 16,
  },
  movementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  movementNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.primary,
  },
  movementName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    flex: 1,
  },
  movementCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primary + '30',
    borderRadius: 8,
  },
  movementCategoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  movementRepScheme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  movementRepText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  movementDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
    marginBottom: 8,
  },
  movementMetadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  movementMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  movementMetaText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  movementBadges: {
    flexDirection: "row",
    gap: 6,
  },
  categoryBadgeSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryEmojiSmall: {
    fontSize: 16,
  },
  goalTypeBadgeSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  goalTypeEmojiSmall: {
    fontSize: 16,
  },
  movementDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2D3748',
    borderRadius: 8,
  },
  movementDetailText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  distanceContainer: {
    width: "100%",
    gap: 4,
  },
  distanceSecondary: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginLeft: 38,
  },
  distanceContext: {
    fontSize: 13,
    color: '#F59E0B',
    marginLeft: 38,
    fontStyle: "italic",
  },
  variationContainer: {
    marginTop: 12,
  },
  variationText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  movementNotes: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 12,
    lineHeight: 20,
  },
  standardsContainer: {
    marginTop: 12,
  },
  standardsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
    marginBottom: 6,
  },
  standardsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  standardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#2D3748",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  standardText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },

  // Image Menu
  imageMenuButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 4,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.foreground,
    fontWeight: '500',
  },
});
