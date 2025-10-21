import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { Search, Clock, Zap } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WODCategoryName, WODWithDetails, WODCategory } from '@/src/types/crossfit';
import { fetchWODs, searchWODs, fetchWODCategories } from '@/src/lib/supabase/crossfit';
import { WODDetailScreen } from './WODDetailScreen';

export default function WODsTab() {
  const [selectedCategory, setSelectedCategory] = useState<WODCategoryName>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [wods, setWods] = useState<WODWithDetails[]>([]);
  const [categories, setCategories] = useState<WODCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selectedWODId, setSelectedWODId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadWODs();
    }
  }, [searchQuery, selectedCategory]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesData] = await Promise.all([
        fetchWODCategories(),
      ]);
      setCategories(categoriesData);
      await loadWODs();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWODs = async () => {
    try {
      const categoryId = selectedCategory === 'All'
        ? undefined
        : categories.find(c => c.name === selectedCategory)?.id;

      const data = await fetchWODs(categoryId);
      setWods(data);
    } catch (error) {
      console.error('Error loading WODs:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadWODs();
      return;
    }

    try {
      setSearching(true);
      const results = await searchWODs(searchQuery.trim());
      setWods(results);
    } catch (error) {
      console.error('Error searching WODs:', error);
    } finally {
      setSearching(false);
    }
  };

  const getCategoryColor = (categoryName: string) => {
    switch (categoryName) {
      case 'The Girls':
        return colors.primary;
      case 'Heroes':
        return '#EF4444';
      case 'Daily WOD':
        return '#10B981';
      default:
        return colors.mutedForeground;
    }
  };

  const categoryOptions: WODCategoryName[] = ['All', 'Daily WOD', 'Heroes', 'The Girls'];

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={20} color={colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search WODs..."
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searching && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* Category Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScrollView}
        contentContainerStyle={styles.categoryContainer}
      >
        {categoryOptions.map((category) => (
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

      {/* WODs List */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading WODs...</Text>
          </View>
        ) : wods.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No WODs found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No WODs in ${selectedCategory} category`}
            </Text>
          </View>
        ) : (
          wods.map((wod) => (
            <TouchableOpacity
              key={wod.id}
              style={styles.wodCard}
              activeOpacity={0.7}
              onPress={() => setSelectedWODId(wod.id)}
            >
              <View style={styles.wodHeader}>
                <Text style={styles.wodName}>{wod.name}</Text>
                <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(wod.category?.name || '') }]}>
                  <Text style={styles.categoryBadgeText}>{wod.category?.name}</Text>
                </View>
              </View>
              <View style={styles.wodMeta}>
                <View style={styles.metaItem}>
                  <Zap size={16} color={colors.primary} />
                  <Text style={styles.metaText}>{wod.format?.name}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Clock size={16} color={colors.mutedForeground} />
                  <Text style={styles.metaText}>
                    {wod.time_cap_minutes ? `${wod.time_cap_minutes} min cap` : 'No time cap'}
                  </Text>
                </View>
              </View>
              {wod.description && (
                <Text style={styles.wodDescription} numberOfLines={2}>
                  {wod.description}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* WOD Detail Modal */}
      <Modal
        visible={selectedWODId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedWODId(null)}
      >
        {selectedWODId && (
          <WODDetailScreen
            wodId={selectedWODId}
            onClose={() => setSelectedWODId(null)}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.input,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  categoryScrollView: {
    maxHeight: 50,
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
    marginTop: 16,
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
  wodCard: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  wodName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  wodMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  wodDescription: {
    fontSize: 14,
    color: colors.foreground,
    lineHeight: 20,
  },
});
