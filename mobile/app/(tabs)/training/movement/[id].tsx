import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Image,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Sparkles, MoreVertical } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import { supabase } from '@/src/lib/supabase';
import { computeMovementTier } from '@/src/lib/supabase/crossfit';

export default function MovementDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [movement, setMovement] = useState<ExerciseWithVariations | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tier, setTier] = useState<number>(0);

  useEffect(() => {
    loadMovement();
    checkAdminStatus();
  }, [id]);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      setIsAdmin(profile?.is_admin || false);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadMovement = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('exercises')
        .select(`
          *,
          movement_category:movement_categories(id, name),
          goal_type:goal_types(id, name),
          variations:exercise_variations(*),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(id, name)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setMovement(data as any);

      // Compute tier for the movement
      const movementTier = await computeMovementTier(id);
      setTier(movementTier);
    } catch (error) {
      console.error('Error loading movement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuPress = () => {
    if (!movement) return;

    Alert.alert(
      'Movement Options',
      'Choose an action',
      [
        {
          text: 'Regenerate Image',
          onPress: handleGenerateImage,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleGenerateImage = async () => {
    if (!movement) return;

    try {
      setGenerating(true);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to generate an image');
        return;
      }

      // Only allow custom movements by creator or official movements by admins
      const canGenerate = isAdmin || (!movement.is_official && movement.created_by === user.id);
      if (!canGenerate) {
        Alert.alert(
          'Permission Denied',
          movement.is_official
            ? 'Only administrators can generate images for official movements.'
            : 'You can only generate images for movements you created.'
        );
        return;
      }

      // Build equipment list
      const equipmentList = movement.equipment_types && movement.equipment_types.length > 0
        ? movement.equipment_types.join(', ')
        : 'bodyweight';

      // Create prompt
      const prompt = `A high-quality, professional photo of a CrossFit athlete performing ${movement.name} in a modern CrossFit gym. ${movement.movement_category?.name || ''} movement. Equipment: ${equipmentList}. Dramatic lighting, motivational atmosphere, athletic focus. Photorealistic, high detail.`;

      console.log('Generating movement image with prompt:', prompt);

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('generate-movement-image', {
        body: {
          movementId: movement.id,
          prompt,
          userId: user.id,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      // Check if the response indicates failure
      if (data && !data.success) {
        const errorMsg = data.error || data.message || 'Image generation failed';
        Alert.alert('Error', errorMsg);
        return;
      }

      // Show success and reload movement to get new image
      Alert.alert(
        'Success',
        'AI image generated successfully!',
        [{ text: 'OK', onPress: () => loadMovement() }]
      );

    } catch (error: any) {
      console.error('Error generating image:', error);
      const errorMessage = error?.message || 'Failed to generate image. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setGenerating(false);
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
          <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton}>
            <MoreVertical size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Image with Overlay or Generate Button */}
        {movement.image_url ? (
          <View style={styles.heroSection}>
            <Image
              source={{ uri: movement.image_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
            {/* Gradient Overlay */}
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
              style={styles.heroGradient}
            />
            {/* Movement Name & Badge Overlay */}
            <View style={styles.heroOverlay}>
              <Text style={styles.heroMovementName}>{movement.name}</Text>
              {movement.is_core === true ? (
                <View style={styles.heroCoreBadge}>
                  <Text style={styles.heroCoreBadgeText}>CORE</Text>
                </View>
              ) : tier > 0 ? (
                <View style={styles.heroTierBadge}>
                  <Text style={styles.heroTierBadgeText}>TIER {tier}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.heroPlaceholder}>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerateImage}
              disabled={generating}
              activeOpacity={0.7}
            >
              {generating ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generating...</Text>
                </>
              ) : (
                <>
                  <Sparkles size={20} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generate Image</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Category, Goal Type & Skill Level */}
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
          {movement.skill_level && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Skill Level</Text>
              <Text style={styles.metaValue}>{movement.skill_level}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {movement.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{movement.description}</Text>
          </View>
        )}

        {/* Equipment Required */}
        {movement.equipment_types && movement.equipment_types.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment Required</Text>
            <View style={styles.equipmentContainer}>
              {movement.equipment_types.map((equipment, index) => (
                <View key={index} style={styles.equipmentChip}>
                  <Text style={styles.equipmentText}>{equipment}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Variations Placeholder */}
        {movement.variations && movement.variations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Variations</Text>
            {movement.variations.map((variation) => (
              <View key={variation.id} style={styles.variationItem}>
                <Text style={styles.variationName}>
                  {variation.variation_option?.name || 'Unknown Variation'}
                </Text>
                <Text style={styles.variationDescription}>
                  {variation.variation_option?.description || 'No description available'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Primary Muscles */}
        {movement.muscle_regions && movement.muscle_regions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Primary Muscles</Text>
            <View style={styles.muscleContainer}>
              {movement.muscle_regions
                .filter((mr: any) => mr.is_primary)
                .map((mr: any, index: number) => (
                  <View key={index} style={styles.musclePrimaryChip}>
                    <Text style={styles.musclePrimaryText}>{mr.muscle_region?.name}</Text>
                  </View>
                ))}
            </View>
            {movement.muscle_regions.some((mr: any) => !mr.is_primary) && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 16, marginTop: 16, marginBottom: 8 }]}>
                  Secondary Muscles
                </Text>
                <View style={styles.muscleContainer}>
                  {movement.muscle_regions
                    .filter((mr: any) => !mr.is_primary)
                    .map((mr: any, index: number) => (
                      <View key={index} style={styles.muscleSecondaryChip}>
                        <Text style={styles.muscleSecondaryText}>{mr.muscle_region?.name}</Text>
                      </View>
                    ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Demo Video */}
        {(movement.demo_video_url || movement.video_url) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Demo Video</Text>
            <TouchableOpacity
              style={styles.videoLinkButton}
              onPress={() => {
                const videoUrl = movement.demo_video_url || movement.video_url;
                if (videoUrl) {
                  Linking.openURL(videoUrl);
                }
              }}
            >
              <Text style={styles.videoLinkText}>Watch Video</Text>
            </TouchableOpacity>
          </View>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  menuButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },

  // Hero Image Section
  heroSection: {
    position: 'relative',
    width: '100%',
    height: 220,
    backgroundColor: '#1A1F2E',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 300,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heroPlaceholder: {
    height: 220,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 16,
  },
  heroMovementName: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroCoreBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  heroCoreBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroTierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
  },
  heroTierBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
    gap: 16,
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
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.foreground,
  },
  equipmentContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipmentChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1A1F2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  equipmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  muscleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  musclePrimaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primary + '20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  musclePrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  muscleSecondaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1A1F2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muscleSecondaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  videoLinkButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  videoLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
