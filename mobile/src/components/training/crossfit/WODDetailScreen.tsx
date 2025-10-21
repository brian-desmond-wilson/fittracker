import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
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
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WODWithDetails, ScalingLevel } from "@/src/types/crossfit";
import { fetchWODById } from "@/src/lib/supabase/crossfit";

interface WODDetailScreenProps {
  wodId: string;
  onClose: () => void;
}

export function WODDetailScreen({ wodId, onClose }: WODDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const [wod, setWod] = useState<WODWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedScaling, setSelectedScaling] = useState<ScalingLevel>("Rx");

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

  // Get movements for selected scaling level
  const getScaledMovements = () => {
    if (!wod || !wod.movements) return [];

    return wod.movements.map((movement) => {
      let reps, weight, variation;

      switch (selectedScaling) {
        case "Rx":
          reps = movement.rx_reps;
          weight = movement.rx_weight_lbs;
          variation = movement.rx_movement_variation;
          break;
        case "L2":
          reps = movement.l2_reps;
          weight = movement.l2_weight_lbs;
          variation = movement.l2_movement_variation;
          break;
        case "L1":
          reps = movement.l1_reps;
          weight = movement.l1_weight_lbs;
          variation = movement.l1_movement_variation;
          break;
      }

      return {
        ...movement,
        reps,
        weight,
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
          {/* WOD Title & Category */}
          <View style={styles.titleSection}>
            <Text style={styles.wodName}>{wod.name}</Text>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: getCategoryColor(wod.category?.name || "") },
              ]}
            >
              <Text style={styles.categoryBadgeText}>{wod.category?.name}</Text>
            </View>
          </View>

          {/* Description */}
          {wod.description && (
            <Text style={styles.description}>{wod.description}</Text>
          )}

          {/* Format & Time Cap */}
          <View style={styles.metaSection}>
            <View style={styles.metaItem}>
              <Zap size={20} color={colors.primary} />
              <Text style={styles.metaLabel}>Format:</Text>
              <Text style={styles.metaValue}>{wod.format?.name}</Text>
            </View>
            <View style={styles.metaItem}>
              <Timer size={20} color={colors.mutedForeground} />
              <Text style={styles.metaLabel}>Time Cap:</Text>
              <Text style={styles.metaValue}>
                {wod.time_cap_minutes ? `${wod.time_cap_minutes} min` : "No cap"}
              </Text>
            </View>
          </View>

          {/* Score Types */}
          {scoreTypes.length > 0 && (
            <View style={styles.scoreTypesSection}>
              <Text style={styles.sectionTitle}>Score Types</Text>
              <View style={styles.scoreTypesList}>
                {scoreTypes.map((type, index) => {
                  const Icon = type.icon;
                  return (
                    <View key={index} style={styles.scoreTypeBadge}>
                      <Icon size={16} color={type.color} />
                      <Text style={[styles.scoreTypeText, { color: type.color }]}>
                        {type.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Scaling Selector */}
          <View style={styles.scalingSection}>
            <Text style={styles.sectionTitle}>Scaling Level</Text>
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
                  .filter((s) => s.level === selectedScaling)
                  .map((s) => (
                    <Text key={s.id} style={styles.scalingDescText}>
                      {s.description}
                    </Text>
                  ))}
              </View>
            )}
          </View>

          {/* Movements List */}
          <View style={styles.movementsSection}>
            <Text style={styles.sectionTitle}>Movements</Text>
            {scaledMovements.map((movement, index) => (
              <View key={movement.id} style={styles.movementCard}>
                <View style={styles.movementHeader}>
                  <Text style={styles.movementNumber}>{index + 1}.</Text>
                  <Text style={styles.movementName}>
                    {movement.exercise?.name}
                    {movement.variation && ` (${movement.variation})`}
                  </Text>
                </View>

                <View style={styles.movementDetails}>
                  {movement.reps !== null && movement.reps !== undefined && (
                    <View style={styles.movementDetailItem}>
                      <Text style={styles.movementDetailLabel}>Reps:</Text>
                      <Text style={styles.movementDetailValue}>{movement.reps}</Text>
                    </View>
                  )}
                  {movement.weight !== null && movement.weight !== undefined && (
                    <View style={styles.movementDetailItem}>
                      <Text style={styles.movementDetailLabel}>Weight:</Text>
                      <Text style={styles.movementDetailValue}>{movement.weight} lbs</Text>
                    </View>
                  )}
                </View>

                {movement.notes && (
                  <Text style={styles.movementNotes}>{movement.notes}</Text>
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
            ))}
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
    padding: 16,
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
  titleSection: {
    marginBottom: 16,
  },
  wodName: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  description: {
    fontSize: 16,
    color: colors.mutedForeground,
    lineHeight: 24,
    marginBottom: 20,
  },
  metaSection: {
    marginBottom: 24,
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    fontSize: 16,
    color: colors.mutedForeground,
    fontWeight: "500",
  },
  metaValue: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  scoreTypesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  scoreTypesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scoreTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#1F2937",
    borderRadius: 8,
  },
  scoreTypeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scalingSection: {
    marginBottom: 24,
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
    backgroundColor: "#1F2937",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  scalingTabActive: {
    backgroundColor: "#0EA5E9",
    borderColor: "#0EA5E9",
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
    padding: 12,
    backgroundColor: "#1F2937",
    borderRadius: 8,
  },
  scalingDescText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  movementsSection: {
    marginBottom: 24,
  },
  movementCard: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: "#1F2937",
    borderRadius: 12,
  },
  movementHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  movementNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.primary,
  },
  movementName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  movementDetails: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  movementDetailItem: {
    flexDirection: "row",
    gap: 6,
  },
  movementDetailLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  movementDetailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  movementNotes: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontStyle: "italic",
    marginTop: 8,
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
    paddingVertical: 4,
    backgroundColor: "#374151",
    borderRadius: 6,
  },
  standardText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },
});
