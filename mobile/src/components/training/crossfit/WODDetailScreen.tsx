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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WODWithDetails, ScalingLevel } from "@/src/types/crossfit";
import { fetchWODById } from "@/src/lib/supabase/crossfit";
import { WODStructureVisualizer } from './WODStructureVisualizer';
import { ScalingComparisonView } from './ScalingComparisonView';
import {
  getWODStats,
  getCategoryDisplay,
  getGoalTypeDisplay,
  formatDistance,
  formatWeight,
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
          {/* WOD Image (if available) */}
          {wod.image_url && (
            <View style={styles.imageSection}>
              <Image
                source={{ uri: wod.image_url }}
                style={styles.wodImage}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.wodTitle}>{wod.name}</Text>
          </View>

          {/* Description */}
          {wod.description && (
            <Text style={styles.description}>{wod.description}</Text>
          )}

          {/* Quick Stats Card */}
          <View style={styles.quickStatsCard}>
            <Text style={styles.quickStatsTitle}>Quick Stats</Text>

            {/* Category and Format Row */}
            <View style={styles.metaRow}>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{wod.category?.name}</Text>
              </View>
              <View style={styles.metaInfo}>
                <Zap size={16} color={colors.primary} />
                <Text style={styles.metaInfoText}>
                  {wod.format?.name}
                  {wod.time_cap_minutes && ` • ${wod.time_cap_minutes} min`}
                </Text>
              </View>
            </View>

            {/* Stats Grid */}
            <View style={styles.quickStatsGrid}>
              <View style={styles.quickStatItem}>
                <Dumbbell size={20} color={colors.primary} />
                <Text style={styles.quickStatValue}>{wodStats.movementCount}</Text>
                <Text style={styles.quickStatLabel}>Movements</Text>
              </View>
              <View style={styles.quickStatItem}>
                <Activity size={20} color="#10B981" />
                <Text style={styles.quickStatValue}>{wodStats.dominantCategory}</Text>
                <Text style={styles.quickStatLabel}>Category</Text>
              </View>
              <View style={styles.quickStatItem}>
                <Clock size={20} color="#F59E0B" />
                <Text style={styles.quickStatValue}>{wodStats.estimatedDuration}</Text>
                <Text style={styles.quickStatLabel}>Est. Time</Text>
              </View>
            </View>
          </View>

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
                  const exercise = movement.exercise;
                  // Note: Exercise type doesn't have joined relations, using fallback
                  const categoryDisplay = getCategoryDisplay(undefined);
                  const goalTypeDisplay = getGoalTypeDisplay(undefined);

                  // Get distance info
                  let distanceDisplay = null;
                  const distanceValue = (movement as any)[`${selectedScaling.toLowerCase()}_distance_value`];
                  const distanceUnit = (movement as any)[`${selectedScaling.toLowerCase()}_distance_unit`];
                  if (distanceValue && distanceUnit) {
                    distanceDisplay = formatDistance(distanceValue, distanceUnit);
                  }

                  return (
                    <View key={movement.id} style={styles.movementCard}>
                      {/* Movement Header with Category */}
                      <View style={styles.movementHeader}>
                        <View style={styles.movementTitleRow}>
                          <Text style={styles.movementNumber}>{index + 1}.</Text>
                          <Text style={styles.movementName}>
                            {movement.exercise?.name}
                          </Text>
                        </View>
                        <View style={styles.movementBadges}>
                          <View style={[styles.categoryBadgeSmall, { backgroundColor: categoryDisplay.color + '20' }]}>
                            <Text style={styles.categoryEmojiSmall}>{categoryDisplay.icon}</Text>
                          </View>
                          <View style={[styles.goalTypeBadgeSmall, { backgroundColor: goalTypeDisplay.color + '20' }]}>
                            <Text style={styles.goalTypeEmojiSmall}>{goalTypeDisplay.icon}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Movement Details */}
                      {(movement.repsDisplay || movement.weightDisplay || distanceDisplay) && (
                        <View style={styles.movementDetailsRow}>
                          {movement.repsDisplay && (
                            <View style={styles.detailChip}>
                              <TrendingUp size={14} color={colors.primary} />
                              <Text style={styles.movementDetailText}>{movement.repsDisplay}</Text>
                            </View>
                          )}
                          {movement.weightDisplay && (
                            <View style={styles.detailChip}>
                              <Dumbbell size={14} color="#8B5CF6" />
                              <Text style={styles.movementDetailText}>{movement.weightDisplay}</Text>
                            </View>
                          )}
                          {distanceDisplay && (
                            <View style={styles.distanceContainer}>
                              <View style={styles.detailChip}>
                                <MapPin size={14} color="#3B82F6" />
                                <Text style={styles.movementDetailText}>{distanceDisplay.primary}</Text>
                              </View>
                              <Text style={styles.distanceSecondary}>
                                {distanceDisplay.secondary}
                              </Text>
                              {distanceDisplay.context && (
                                <Text style={styles.distanceContext}>
                                  💡 {distanceDisplay.context}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      )}

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
  imageSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  wodImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#1A1F2E',
  },

  // Title Section
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

  // Description
  description: {
    fontSize: 16,
    color: colors.mutedForeground,
    lineHeight: 24,
    marginBottom: 16,
    marginHorizontal: 16,
  },

  // Quick Stats Card
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
    padding: 20,
    backgroundColor: "#1A1F2E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  movementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  movementTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  movementNumber: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.primary,
  },
  movementName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
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
});
