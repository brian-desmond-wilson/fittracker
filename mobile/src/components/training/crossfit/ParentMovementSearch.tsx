import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { searchMovementsWithTier } from '@/src/lib/supabase/crossfit';
import type { ExerciseWithTier } from '@/src/types/crossfit';

interface ParentMovementSearchProps {
  onSelect: (movement: ExerciseWithTier) => void;
  selectedMovement: ExerciseWithTier | null;
  onClear: () => void;
}

export function ParentMovementSearch({ onSelect, selectedMovement, onClear }: ParentMovementSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseWithTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const results = await searchMovementsWithTier(searchQuery);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (error) {
        console.error('Error searching movements:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelect = (movement: ExerciseWithTier) => {
    onSelect(movement);
    setSearchQuery('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleClear = () => {
    onClear();
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  const getTierLabel = (tier: number): string => {
    if (tier === 0) return 'Core Movement';
    return `Tier ${tier}`;
  };

  const getTierColor = (tier: number): string => {
    switch (tier) {
      case 0: return colors.primary; // Core = primary color
      case 1: return '#22C55E'; // Tier 1 = green
      case 2: return '#F59E0B'; // Tier 2 = amber
      case 3: return '#EF4444'; // Tier 3 = red
      case 4: return '#DC2626'; // Tier 4 = dark red
      default: return colors.mutedForeground;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Core Movement <Text style={styles.required}>*</Text>
      </Text>
      <Text style={styles.helperText}>
        Search for the parent/core movement this variation is based on
      </Text>

      {selectedMovement ? (
        // Selected state
        <View style={styles.selectedContainer}>
          <View style={styles.selectedContent}>
            {selectedMovement.image_url ? (
              <Image
                source={{ uri: selectedMovement.image_url }}
                style={styles.selectedImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.selectedIcon}>
                <Text style={styles.selectedIconText}>📋</Text>
              </View>
            )}
            <View style={styles.selectedInfo}>
              <Text style={styles.selectedName}>{selectedMovement.name}</Text>
              <View style={[styles.tierBadge, { backgroundColor: getTierColor(selectedMovement.tier) + '20', borderColor: getTierColor(selectedMovement.tier) + '40' }]}>
                <Text style={[styles.tierText, { color: getTierColor(selectedMovement.tier) }]}>
                  {getTierLabel(selectedMovement.tier)}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={handleClear} style={styles.clearButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      ) : (
        // Search state
        <>
          <View style={styles.searchContainer}>
            <Search size={20} color={colors.mutedForeground} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a movement..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading && <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicator} />}
          </View>

          {showDropdown && searchResults.length > 0 && (
            <ScrollView style={styles.dropdown} nestedScrollEnabled={true}>
              {searchResults.map((movement) => (
                <TouchableOpacity
                  key={movement.id}
                  style={styles.resultItem}
                  onPress={() => handleSelect(movement)}
                  activeOpacity={0.7}
                >
                  {movement.image_url ? (
                    <Image
                      source={{ uri: movement.image_url }}
                      style={styles.resultImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.resultIcon}>
                      <Text style={styles.resultIconText}>📋</Text>
                    </View>
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{movement.name}</Text>
                    <View style={[styles.tierBadge, { backgroundColor: getTierColor(movement.tier) + '20', borderColor: getTierColor(movement.tier) + '40' }]}>
                      <Text style={[styles.tierText, { color: getTierColor(movement.tier) }]}>
                        {getTierLabel(movement.tier)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {showDropdown && searchResults.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No movements found</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  required: {
    color: colors.destructive,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.input,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  dropdown: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  resultIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultIconText: {
    fontSize: 24,
  },
  resultInfo: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.foreground,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  emptyText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  selectedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  selectedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  selectedIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectedIconText: {
    fontSize: 24,
  },
  selectedInfo: {
    flex: 1,
    gap: 4,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  clearButton: {
    padding: 8,
  },
});
