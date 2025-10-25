import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Image } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Zap, Trash2, History, Timer } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WODWithDetails } from '@/src/types/crossfit';
import { deleteWOD } from '@/src/lib/supabase/crossfit';
import { supabase } from '@/src/lib/supabase';
import { getWODCardDisplay } from '@/src/lib/wodDisplayHelpers';

interface SwipeableWODCardProps {
  wod: WODWithDetails;
  onPress: () => void;
  onDelete: () => void;
  getCategoryColor: (categoryName: string) => string;
}

export function SwipeableWODCard({ wod, onPress, onDelete, getCategoryColor }: SwipeableWODCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

  // Get formatted display data for the WOD card
  const { formatLine, structureLine, movementsLine } = getWODCardDisplay(wod, 'Rx');

  const handleDelete = async () => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to delete a WOD');
        return;
      }

      // Get user profile to check admin status
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        Alert.alert('Error', 'Failed to verify permissions');
        return;
      }

      const isAdmin = profile?.is_admin || false;

      // Check permissions
      // User must either:
      // 1. Be the creator of the WOD (and WOD is not official), OR
      // 2. Be an admin
      const canDelete = isAdmin || (wod.user_id === user.id && !wod.is_official);

      if (!canDelete) {
        if (wod.is_official) {
          Alert.alert('Cannot Delete', 'Only administrators can delete official WODs.');
        } else {
          Alert.alert('Cannot Delete', 'You can only delete WODs that you created.');
        }
        swipeableRef.current?.close();
        return;
      }

      // Show confirmation dialog
      Alert.alert(
        'Delete WOD',
        `Are you sure you want to delete "${wod.name}"? This action cannot be undone.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              swipeableRef.current?.close();
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              // TODO: When wod_instance table exists, check for instances here
              // const { data: instances } = await supabase
              //   .from('wod_instances')
              //   .select('id')
              //   .eq('wod_id', wod.id)
              //   .limit(1);
              //
              // if (instances && instances.length > 0) {
              //   const { count } = await supabase
              //     .from('wod_instances')
              //     .select('*', { count: 'exact', head: true })
              //     .eq('wod_id', wod.id);
              //
              //   Alert.alert(
              //     'Cannot Delete',
              //     `Cannot delete WOD. This WOD has been used in ${count} workout(s).`
              //   );
              //   swipeableRef.current?.close();
              //   return;
              // }

              // Perform deletion
              const success = await deleteWOD(wod.id);

              if (success) {
                onDelete();
              } else {
                Alert.alert('Error', 'Failed to delete WOD. Please try again.');
                swipeableRef.current?.close();
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in handleDelete:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      swipeableRef.current?.close();
    }
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });

    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Trash2 size={20} color="#FFFFFF" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <TouchableOpacity
        style={styles.wodCard}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <View style={styles.wodCardContent}>
          {/* Left: Thumbnail Image */}
          {wod.image_url && (
            <View style={styles.thumbnailContainer}>
              <Image
                source={{ uri: wod.image_url }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Right: WOD Info */}
          <View style={styles.wodInfo}>
            {/* Header: Title + Category Badge */}
            <View style={styles.wodHeader}>
              <Text style={styles.wodName} numberOfLines={1}>{wod.name}</Text>
              <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(wod.category?.name || '') }]}>
                <Text style={styles.categoryBadgeText}>{wod.category?.name}</Text>
              </View>
            </View>

        {/* Line 2: Format + Time Domain */}
        <View style={styles.formatRow}>
          {(wod.rep_scheme_type === 'fixed_rounds' || wod.format?.name === 'Rounds For Time') ? (
            <History size={16} color={colors.primary} />
          ) : (wod.rep_scheme_type === 'descending' || wod.rep_scheme_type === 'ascending') ? (
            <Timer size={16} color={colors.primary} />
          ) : (
            <Zap size={16} color={colors.primary} />
          )}
          <Text style={styles.formatText}>{formatLine}</Text>
        </View>

        {/* Line 3: Structure/Rep Scheme (conditional) */}
        {structureLine && (
          <View style={styles.structureRow}>
            <Text style={styles.structureText}>{structureLine}</Text>
          </View>
        )}

            {/* Line 4: Movement Summary */}
            <View style={styles.movementsRow}>
              <Text style={styles.movementsText}>{movementsLine}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  wodCard: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wodCardContent: {
    flexDirection: 'row',
    gap: 12,
  },
  wodInfo: {
    flex: 1,
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
    flex: 1,
    marginRight: 8,
  },
  thumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1A1F2E',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  formatText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  structureRow: {
    paddingLeft: 22, // Align with text after icon in formatRow
    marginBottom: 8,
  },
  structureText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  movementsRow: {
    paddingLeft: 22, // Align with text after icon in formatRow
  },
  movementsText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    gap: 4,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
