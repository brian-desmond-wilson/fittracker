import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import { supabase } from '@/src/lib/supabase';

export default function MovementDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [movement, setMovement] = useState<ExerciseWithVariations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovement();
  }, [id]);

  const loadMovement = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('exercises')
        .select(`
          *,
          movement_category:movement_categories(id, name),
          goal_type:goal_types(id, name),
          variations:exercise_variations(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setMovement(data as ExerciseWithVariations);
    } catch (error) {
      console.error('Error loading movement:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading movement...</Text>
        </View>
      </>
    );
  }

  if (!movement) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <Text style={styles.errorText}>Movement not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
          <Text style={styles.backText}>Movements</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Movement Name */}
        <View style={styles.titleSection}>
          <Text style={styles.movementName}>{movement.name}</Text>
          {movement.is_official ? (
            <View style={styles.officialBadge}>
              <Text style={styles.officialBadgeText}>OFFICIAL</Text>
            </View>
          ) : (
            <View style={styles.customBadge}>
              <Text style={styles.customBadgeText}>CUSTOM</Text>
            </View>
          )}
        </View>

        {/* Category & Goal Type */}
        <View style={styles.metaSection}>
          {movement.movement_category?.name && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Category</Text>
              <Text style={styles.metaValue}>{movement.movement_category.name}</Text>
            </View>
          )}
          {movement.goal_type?.name && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Goal Type</Text>
              <Text style={styles.metaValue}>{movement.goal_type.name}</Text>
            </View>
          )}
        </View>

        {/* Description Placeholder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.placeholderText}>
            Detailed description and instructions for {movement.name} will be displayed here.
          </Text>
        </View>

        {/* Equipment Placeholder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipment Required</Text>
          <Text style={styles.placeholderText}>
            Equipment information will be displayed here.
          </Text>
        </View>

        {/* Variations Placeholder */}
        {movement.variations && movement.variations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Variations</Text>
            {movement.variations.map((variation) => (
              <View key={variation.id} style={styles.variationItem}>
                <Text style={styles.variationName}>{variation.name}</Text>
                <Text style={styles.variationDescription}>
                  {variation.description || 'No description available'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Muscle Groups Placeholder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Primary Muscles</Text>
          <Text style={styles.placeholderText}>
            Primary and secondary muscle groups will be displayed here.
          </Text>
        </View>

        {/* Video/Media Placeholder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Demo Video</Text>
          <View style={styles.mediaPlaceholder}>
            <Text style={styles.mediaPlaceholderText}>Video demo coming soon</Text>
          </View>
        </View>
      </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  errorText: {
    fontSize: 18,
    color: colors.foreground,
    marginBottom: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  titleSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  movementName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 12,
  },
  officialBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary + '20',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  officialBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  customBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#6B7280' + '20',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  metaSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 24,
    backgroundColor: '#1A1F2E',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
  variationItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#1A1F2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  variationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  variationDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
  },
  mediaPlaceholder: {
    height: 200,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPlaceholderText: {
    fontSize: 15,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
});
