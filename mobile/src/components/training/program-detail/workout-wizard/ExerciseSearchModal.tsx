import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Search } from 'lucide-react-native';
import { colors } from '@/src/theme/tokens';
import { fetchAllExercises, searchAllExercises } from '@/src/lib/supabase/crossfit';
import type { Exercise } from '@/src/types/training';

interface ExerciseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
}

export function ExerciseSearchModal({ visible, onClose, onSelectExercise }: ExerciseSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadExercises();
    }
  }, [visible]);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadExercises();
    }
  }, [searchQuery]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      setError(null);
      // Whole-catalog picker: a program workout can hold movements too, so
      // opt back into the rows the Exercises tab now excludes.
      const data = await fetchAllExercises({ includeMovements: true });
      setExercises(data as unknown as Exercise[]);
    } catch (err: any) {
      console.error('Error loading exercises:', err);
      setError(`Failed to load exercises: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadExercises();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await searchAllExercises(searchQuery.trim(), { includeMovements: true });
      setExercises(results as unknown as Exercise[]);
    } catch (err: any) {
      console.error('Error searching exercises:', err);
      setError(`Search failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExercise = (exercise: Exercise) => {
    onSelectExercise(exercise);
    setSearchQuery('');
    // Don't call onClose() here - the parent handles closing the modal
    // and calling onClose would reset convertingToGroupIndex/addingAlternativeToGroupId
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Compound':
        return colors.danger;
      case 'Isolation':
        return colors.blocks.mobility;
      case 'Accessory':
        return colors.warning;
      case 'Cardio':
        return colors.brand;
      default:
        return colors.textMuted;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Exercise</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Search size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCapitalize="none"
            />
          </View>

          {/* Exercises List */}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
            ) : error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{error}</Text>
              </View>
            ) : exercises.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {searchQuery
                    ? `No results for "${searchQuery}"`
                    : 'No exercises found. Create exercises in the Exercises tab first.'}
                </Text>
              </View>
            ) : (
              exercises.map((exercise) => (
                <TouchableOpacity
                  key={exercise.id}
                  style={styles.exerciseItem}
                  onPress={() => handleSelectExercise(exercise)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.categoryBadge, { backgroundColor: `${getCategoryColor(exercise.category)}20` }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(exercise.category) }]}>
                      {exercise.category}
                    </Text>
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>
                      {exercise.name}
                    </Text>
                    {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
                      <Text style={styles.muscleGroups}>
                        {exercise.muscle_groups.slice(0, 2).join(', ')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    width: '100%',
    height: 500,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  list: {
    flex: 1,
    minHeight: 300,
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  muscleGroups: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
});
