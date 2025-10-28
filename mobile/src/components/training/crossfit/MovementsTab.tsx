import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import { fetchMovements, searchMovements, computeMovementTier } from '@/src/lib/supabase/crossfit';
import { AddMovementWizard } from './AddMovementWizard';
import { SwipeableMovementCard } from './SwipeableMovementCard';

// Movement with computed tier for display
interface MovementWithTier extends ExerciseWithVariations {
  tier?: number;
}

type MovementCategory = 'All' | 'Lifting' | 'Gymnastics' | 'Cardio' | 'Core';

interface MovementsTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCountUpdate: (count: number) => void;
}

export default function MovementsTab({ searchQuery, onSearchChange, onCountUpdate }: MovementsTabProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<MovementCategory>('All');
  const [movements, setMovements] = useState<MovementWithTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const categories: MovementCategory[] = ['All', 'Lifting', 'Gymnastics', 'Cardio', 'Core'];

  const loadMovements = async () => {
    try {
      setLoading(true);
      const data = await fetchMovements();

      // Compute tier for each movement
      const movementsWithTiers = await Promise.all(
        data.map(async (movement) => {
          const tier = await computeMovementTier(movement.id);
          return { ...movement, tier };
        })
      );

      setMovements(movementsWithTiers);
      onCountUpdate(movementsWithTiers.length);
    } catch (error) {
      console.error('Error loading movements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadMovements();
      return;
    }

    try {
      setSearching(true);
      const results = await searchMovements(searchQuery.trim());

      // Compute tier for each movement
      const resultsWithTiers = await Promise.all(
        results.map(async (movement) => {
          const tier = await computeMovementTier(movement.id);
          return { ...movement, tier };
        })
      );

      setMovements(resultsWithTiers);
      onCountUpdate(resultsWithTiers.length);
    } catch (error) {
      console.error('Error searching movements:', error);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadMovements();
    }
  }, [searchQuery, selectedCategory]);

  const refreshMovements = async () => {
    if (searchQuery.trim()) {
      await handleSearch();
    } else {
      await loadMovements();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshMovements();
    setRefreshing(false);
  };

  // Filter movements by category
  const getFilteredMovements = () => {
    if (selectedCategory === 'All') {
      return movements;
    }

    return movements.filter((movement) => {
      const movementName = movement.name.toLowerCase();
      const goalTypeName = movement.goal_type?.name.toLowerCase() || '';

      switch (selectedCategory) {
        case 'Lifting':
          // Lifting movements: Olympic lifts, squats, deadlifts, presses
          return goalTypeName === 'strength' ||
                 movementName.includes('snatch') ||
                 movementName.includes('clean') ||
                 movementName.includes('jerk') ||
                 movementName.includes('squat') ||
                 movementName.includes('deadlift') ||
                 movementName.includes('press');
        case 'Gymnastics':
          // Gymnastics: Skill-based movements
          return goalTypeName === 'skill' ||
                 movementName.includes('pull-up') ||
                 movementName.includes('push-up') ||
                 movementName.includes('muscle-up') ||
                 movementName.includes('handstand') ||
                 movementName.includes('dip');
        case 'Cardio':
          // Cardio: MetCon movements
          return goalTypeName === 'metcon' ||
                 movementName.includes('row') ||
                 movementName.includes('run') ||
                 movementName.includes('bike') ||
                 movementName.includes('ski');
        case 'Core':
          // Core movements: Foundational movements with is_core = true
          return movement.is_core === true;
        default:
          return true;
      }
    });
  };

  // Get icon for movement based on category
  const getMovementIcon = (movement: ExerciseWithVariations): string => {
    const name = movement.name.toLowerCase();

    if (name.includes('snatch') || name.includes('clean') || name.includes('jerk')) {
      return '🏋️';
    } else if (name.includes('pull-up') || name.includes('muscle-up') || name.includes('handstand')) {
      return '🤸';
    } else if (name.includes('row') || name.includes('run') || name.includes('bike')) {
      return '🏃';
    } else if (name.includes('squat')) {
      return '💪';
    } else if (name.includes('press')) {
      return '🦾';
    } else {
      return '⚡';
    }
  };

  const filteredMovements = getFilteredMovements();

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Category Filter Pills */}
      <View style={styles.categoryWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContainer}
        >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryPill,
              selectedCategory === category && styles.categoryPillActive,
            ]}
            onPress={() => setSelectedCategory(category)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
      </View>

      {/* Movements List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading movements...</Text>
          </View>
        ) : filteredMovements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No movements found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No movements in ${selectedCategory} category`}
            </Text>
          </View>
        ) : (
          filteredMovements.map((movement) => (
            <View key={movement.id} style={styles.movementItem}>
              <SwipeableMovementCard
                movement={movement}
                onPress={() => router.push(`/(tabs)/training/movement/${movement.id}`)}
                onDelete={refreshMovements}
                getMovementIcon={getMovementIcon}
              />
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB - Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add Movement Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <AddMovementWizard
          onClose={() => setAddModalVisible(false)}
          onSave={() => {
            setAddModalVisible(false);
            loadMovements();
          }}
        />
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  categoryWrapper: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
  movementItem: {
    marginBottom: 12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
