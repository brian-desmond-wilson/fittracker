import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WODCategoryName, WODWithDetails, WODCategory } from '@/src/types/crossfit';
import { fetchWODs, searchWODs, fetchWODCategories } from '@/src/lib/supabase/crossfit';
import { AddWODWizard } from './AddWODWizard';
import { SwipeableWODCard } from './SwipeableWODCard';

interface WODsTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function WODsTab({ searchQuery, onSearchChange }: WODsTabProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<WODCategoryName>('All');
  const [wods, setWods] = useState<WODWithDetails[]>([]);
  const [categories, setCategories] = useState<WODCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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
    <GestureHandlerRootView style={styles.container}>
      {/* Category Filter Pills */}
      <View style={styles.categoryWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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
      </View>

      {/* WODs List */}
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
            <SwipeableWODCard
              key={wod.id}
              wod={wod}
              onPress={() => router.push(`/(tabs)/training/wod/${wod.id}`)}
              onDelete={loadWODs}
              getCategoryColor={getCategoryColor}
            />
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

      {/* Add WOD Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <AddWODWizard
          onClose={() => setAddModalVisible(false)}
          onSave={() => {
            setAddModalVisible(false);
            loadWODs();
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
