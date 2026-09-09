import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import {
  fetchAllExercises,
  searchAllExercises,
  resolveMovementCategoryIds,
  type CatalogListFilter,
} from '@/src/lib/supabase/crossfit';
import { CatalogItemWizard } from './crossfit/CatalogItemWizard';
import { SwipeableMovementCard } from './crossfit/SwipeableMovementCard';

// Classification-driven pills: the four modalities (movement_categories
// dictionary) plus "Cores" (hierarchy roots, is_core = true). Every pill is a
// server-side filter — the client-side name-substring buckets are gone.
type ExercisePill = 'All' | 'Weightlifting' | 'Gymnastics' | 'Monostructural' | 'Recovery' | 'Cores';

interface ExercisesTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCountUpdate: (count: number) => void;
}

export default function ExercisesTab({ searchQuery, onSearchChange, onCountUpdate }: ExercisesTabProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<ExercisePill>('All');
  const [exercises, setExercises] = useState<ExerciseWithVariations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);

  const categories: ExercisePill[] = ['All', 'Weightlifting', 'Gymnastics', 'Monostructural', 'Recovery', 'Cores'];

  // Stale-response guard: the alias-aware search is two round trips, which
  // widens the window for an older response to land after a newer one. Every
  // fetch takes a ticket; a response only applies if its ticket is still the
  // latest.
  const requestSeq = useRef(0);

  // Pill -> server-side filter. Modality ids come from the dictionary,
  // resolved once and cached in the data layer.
  const buildFilter = async (): Promise<CatalogListFilter | undefined> => {
    if (selectedCategory === 'All') return undefined;
    if (selectedCategory === 'Cores') return { coresOnly: true };
    const ids = await resolveMovementCategoryIds();
    const categoryId = ids.get(selectedCategory);
    if (!categoryId && __DEV__) {
      // A missing dictionary row would otherwise make the pill silently show
      // everything (the filter is simply not applied).
      console.warn(`ExercisesTab: no movement_categories row named "${selectedCategory}" — pill filter not applied`);
    }
    return { categoryId };
  };

  const loadExercises = async () => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      // Tier rides on the row itself (`exercises.tier`, engine-maintained) —
      // no second hierarchy query, nothing computed client-side. The fetch
      // excludes is_movement rows: the tab split is real now.
      const data = await fetchAllExercises(await buildFilter());
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setExercises(data);
      onCountUpdate(data.length);
    } catch (error) {
      console.error('Error loading exercises:', error);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadExercises();
      return;
    }

    const seq = ++requestSeq.current;
    try {
      setSearching(true);
      const results = await searchAllExercises(searchQuery.trim(), await buildFilter());
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setExercises(results);
      onCountUpdate(results.length);
    } catch (error) {
      console.error('Error searching exercises:', error);
    } finally {
      if (seq === requestSeq.current) setSearching(false);
    }
  };

  useEffect(() => {
    // Debounce so we don't fire a search (and its per-row tier lookups) on
    // every keystroke — only 300ms after the user stops typing.
    const handle = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        loadExercises();
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery, selectedCategory]);

  const refreshExercises = async () => {
    if (searchQuery.trim()) {
      await handleSearch();
    } else {
      await loadExercises();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshExercises();
    setRefreshing(false);
  };

  // Icon stays name-based on purpose: it is cosmetic decoration, was never
  // tied to the (now deleted) substring filter buckets, and classification
  // carries no emoji column.
  const getExerciseIcon = (exercise: ExerciseWithVariations): string => {
    const name = exercise.name.toLowerCase();

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

      {/* Exercises List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading exercises...</Text>
        </View>
      ) : (
        <FlatList
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          data={exercises}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.exerciseItem}>
              <SwipeableMovementCard
                movement={item}
                onPress={() => router.push(`/(tabs)/training/exercise/${item.id}`)}
                onDelete={refreshExercises}
                onEdit={() => setEditItemId(item.id)}
                getMovementIcon={getExerciseIcon}
                detailRoute="exercise"
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No exercises found</Text>
              <Text style={styles.emptyStateText}>
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : `No exercises in ${selectedCategory} category`}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB - Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add Exercise Modal — the ONE catalog wizard, exercise preset */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <CatalogItemWizard
          isMovement={false}
          onClose={() => setAddModalVisible(false)}
          onSave={() => {
            setAddModalVisible(false);
            loadExercises();
          }}
        />
      </Modal>

      {/* Edit Exercise Modal — same wizard, pre-filled */}
      <Modal
        visible={editItemId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setEditItemId(null)}
      >
        {editItemId && (
          <CatalogItemWizard
            isMovement={false}
            editId={editItemId}
            onClose={() => setEditItemId(null)}
            onSave={() => {
              setEditItemId(null);
              loadExercises();
            }}
          />
        )}
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
  exerciseItem: {
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
