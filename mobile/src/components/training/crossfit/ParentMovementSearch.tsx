// The wizard's CORE picker.
//
// Under the movement model a derivation hangs off exactly one CORE movement
// (is_core rows); the engine derives the parent/tier itself. So this search
// offers cores ONLY — the old tier chips are gone because every result is a
// core by construction.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { searchCoreMovements } from '@/src/lib/supabase/crossfit';

export interface CoreMovementOption {
  id: string;
  name: string;
  short_name?: string | null;
  image_url?: string | null;
}

interface ParentMovementSearchProps {
  onSelect: (core: CoreMovementOption) => void;
  selectedMovement: CoreMovementOption | null;
  onClear: () => void;
  labelText?: string;
  helperText?: string;
  placeholder?: string;
  emptyText?: string;
}

export function ParentMovementSearch({
  onSelect,
  selectedMovement,
  onClear,
  labelText = 'Core Movement',
  helperText = 'Search for the core movement this derivation is based on',
  placeholder = 'Search core movements...',
  emptyText = 'No core movements found',
}: ParentMovementSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CoreMovementOption[]>([]);
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
        const results = await searchCoreMovements(searchQuery.trim());
        setSearchResults(results as CoreMovementOption[]);
        setShowDropdown(true);
      } catch (error) {
        console.error('Error searching core movements:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelect = (core: CoreMovementOption) => {
    onSelect(core);
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

  const coreBadge = (
    <View style={styles.coreBadge}>
      <Text style={styles.coreBadgeText}>Core</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {labelText} <Text style={styles.required}>*</Text>
      </Text>
      <Text style={styles.helperTextStyle}>
        {helperText}
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
              {coreBadge}
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
              placeholder={placeholder}
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
              {searchResults.map((core) => (
                <TouchableOpacity
                  key={core.id}
                  style={styles.resultItem}
                  onPress={() => handleSelect(core)}
                  activeOpacity={0.7}
                >
                  {core.image_url ? (
                    <Image
                      source={{ uri: core.image_url }}
                      style={styles.resultImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.resultIcon}>
                      <Text style={styles.resultIconText}>📋</Text>
                    </View>
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{core.name}</Text>
                    {coreBadge}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {showDropdown && searchResults.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTextStyle}>{emptyText}</Text>
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
  helperTextStyle: {
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
  coreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  coreBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
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
  emptyTextStyle: {
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
