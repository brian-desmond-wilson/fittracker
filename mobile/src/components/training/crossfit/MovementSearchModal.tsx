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
import { colors } from '@/src/lib/colors';
import { fetchMovements, searchMovements } from '@/src/lib/supabase/crossfit';
import type { ExerciseWithVariations } from '@/src/types/crossfit';

interface MovementSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectMovement: (movement: ExerciseWithVariations) => void;
}

export function MovementSearchModal({ visible, onClose, onSelectMovement }: MovementSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [movements, setMovements] = useState<ExerciseWithVariations[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadMovements();
    }
  }, [visible]);

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
      setError(null);
      const data = await fetchMovements();
      setMovements(data);
    } catch (error: any) {
      console.error('Error loading movements:', error);
      setError(`Failed to load movements: ${error?.message || 'Unknown error'}`);
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
      setLoading(true);
      setError(null);
      const results = await searchMovements(searchQuery.trim());
      setMovements(results);
    } catch (error: any) {
      console.error('Error searching movements:', error);
      setError(`Search failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMovement = (movement: ExerciseWithVariations) => {
    onSelectMovement(movement);
    setSearchQuery('');
    onClose();
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
            <Text style={styles.title}>Select Movement</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Search size={20} color={colors.mutedForeground} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search movements..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCapitalize="none"
            />
          </View>

          {/* Movements List */}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{error}</Text>
              </View>
            ) : movements.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {searchQuery
                    ? `No results for "${searchQuery}"`
                    : 'No movements found. Create movements in the Movements tab first.'}
                </Text>
              </View>
            ) : (
              movements.map((movement) => (
                <TouchableOpacity
                  key={movement.id}
                  style={styles.movementItem}
                  onPress={() => handleSelectMovement(movement)}
                  activeOpacity={0.7}
                >
                  <View style={styles.movementInfo}>
                    <Text style={styles.movementName}>
                      {movement.full_name || movement.name}
                    </Text>
                    <Text style={styles.movementCategory}>
                      {movement.movement_category?.name || movement.goal_type?.name}
                    </Text>
                  </View>
                  {movement.is_official && (
                    <View style={styles.officialBadge}>
                      <Text style={styles.officialBadgeText}>Official</Text>
                    </View>
                  )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background,
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
    color: colors.foreground,
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
    color: colors.foreground,
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
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  movementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  movementInfo: {
    flex: 1,
  },
  movementName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
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
});
