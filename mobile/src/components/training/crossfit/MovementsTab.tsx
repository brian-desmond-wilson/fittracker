import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Plus } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import { fetchMovements, searchMovements } from '@/src/lib/supabase/crossfit';
import { AddMovementScreen } from './AddMovementScreen';

type MovementCategory = 'All' | 'Oly lifts' | 'Gymnastics' | 'Cardio';

interface MovementsTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function MovementsTab({ searchQuery, onSearchChange }: MovementsTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<MovementCategory>('All');
  const [movements, setMovements] = useState<ExerciseWithVariations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const categories: MovementCategory[] = ['All', 'Oly lifts', 'Gymnastics', 'Cardio'];

  useEffect(() => {
    loadMovements();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadMovements();
    }
  }, [searchQuery]);

  const loadMovements = async () => {
    try {
      setLoading(true);
      const data = await fetchMovements();
      setMovements(data);
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
      setMovements(results);
    } catch (error) {
      console.error('Error searching movements:', error);
    } finally {
      setSearching(false);
    }
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
        case 'Oly lifts':
          // Olympic lifts: Snatch, Clean, Jerk
          return movementName.includes('snatch') ||
                 movementName.includes('clean') ||
                 movementName.includes('jerk');
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
    <View style={styles.container}>
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
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
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
            <TouchableOpacity
              key={movement.id}
              style={styles.movementItem}
              activeOpacity={0.7}
            >
              <View style={styles.movementIcon}>
                <Text style={styles.movementIconText}>{getMovementIcon(movement)}</Text>
              </View>
              <View style={styles.movementInfo}>
                <View style={styles.movementNameRow}>
                  <Text style={styles.movementName}>
                    {movement.name}
                  </Text>
                  {movement.is_official ? (
                    <View style={styles.officialBadge}>
                      <Text style={styles.officialBadgeText}>Official</Text>
                    </View>
                  ) : (
                    <View style={styles.customBadge}>
                      <Text style={styles.customBadgeText}>Custom</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.movementCategory}>
                  {movement.movement_category?.name || movement.goal_type?.name || 'General'}
                </Text>
              </View>
            </TouchableOpacity>
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
        <AddMovementScreen
          onClose={() => setAddModalVisible(false)}
          onSave={() => {
            setAddModalVisible(false);
            loadMovements();
          }}
        />
      </Modal>
    </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  movementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementIconText: {
    fontSize: 24,
  },
  movementInfo: {
    flex: 1,
  },
  movementNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  movementName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  movementCategory: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  officialBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  officialBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  customBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
