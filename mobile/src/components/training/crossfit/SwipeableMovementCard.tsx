import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Image } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Trash2 } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import { supabase } from '@/src/lib/supabase';

interface MovementWithTier extends ExerciseWithVariations {
  tier?: number;
}

interface SwipeableMovementCardProps {
  movement: MovementWithTier;
  onPress: () => void;
  onDelete: () => void;
  getMovementIcon: (movement: ExerciseWithVariations) => string;
  detailRoute?: 'movement' | 'exercise'; // Default: 'movement'
}

export function SwipeableMovementCard({
  movement,
  onPress,
  onDelete,
  getMovementIcon,
  detailRoute = 'movement'
}: SwipeableMovementCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const handleDelete = async () => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to delete a movement');
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
      // 1. Be the creator of the movement (and movement is not official), OR
      // 2. Be an admin
      const canDelete = isAdmin || (movement.created_by === user.id && !movement.is_official);

      if (!canDelete) {
        if (movement.is_official) {
          Alert.alert('Cannot Delete', 'Only administrators can delete official movements.');
        } else {
          Alert.alert('Cannot Delete', 'You can only delete movements that you created.');
        }
        swipeableRef.current?.close();
        return;
      }

      // Check if movement is used in any WODs
      const { data: wodMovements, error: wodCheckError } = await supabase
        .from('wod_movements')
        .select('id, wod_id, wods(name)')
        .eq('exercise_id', movement.id)
        .limit(5);

      if (wodCheckError) {
        console.error('Error checking WOD usage:', wodCheckError);
        Alert.alert('Error', 'Failed to verify movement usage.');
        swipeableRef.current?.close();
        return;
      }

      // If movement is used in WODs, show warning
      if (wodMovements && wodMovements.length > 0) {
        const wodCount = wodMovements.length;
        const wodNames = wodMovements
          .slice(0, 3)
          .map((wm: any) => wm.wods?.name)
          .filter(Boolean)
          .join(', ');

        const moreText = wodCount > 3 ? ` and ${wodCount - 3} more` : '';

        Alert.alert(
          'Cannot Delete Movement',
          `This movement is used in ${wodCount} WOD${wodCount > 1 ? 's' : ''} (${wodNames}${moreText}). Please remove it from all WODs before deleting.`,
          [
            {
              text: 'OK',
              style: 'cancel',
              onPress: () => {
                swipeableRef.current?.close();
              },
            },
          ]
        );
        return;
      }

      // Show confirmation dialog
      Alert.alert(
        'Delete Movement',
        `Are you sure you want to delete "${movement.name}"? This action cannot be undone.`,
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
              // Perform deletion
              const { error } = await supabase
                .from('exercises')
                .delete()
                .eq('id', movement.id);

              if (error) {
                console.error('Error deleting movement:', error);
                Alert.alert('Error', 'Failed to delete movement. Please try again.');
                swipeableRef.current?.close();
              } else {
                await onDelete();
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
        style={styles.movementCard}
        activeOpacity={0.7}
        onPress={onPress}
      >
        {/* Left: Icon or Thumbnail */}
        {movement.image_url ? (
          <Image
            source={{ uri: movement.image_url }}
            style={styles.movementImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.movementIcon}>
            <Text style={styles.movementIconText}>{getMovementIcon(movement)}</Text>
          </View>
        )}

        {/* Right: Movement Info */}
        <View style={styles.movementInfo}>
          <View style={styles.movementNameRow}>
            <Text style={styles.movementName}>
              {movement.name}
            </Text>
            <View style={styles.badgeColumn}>
              {movement.is_core === true ? (
                <View style={styles.coreBadge}>
                  <Text style={styles.coreBadgeText}>Core</Text>
                </View>
              ) : movement.tier !== undefined && movement.tier > 0 ? (
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>Tier {movement.tier}</Text>
                </View>
              ) : null}
              {/* Skill Level Pill */}
              <View style={styles.skillPill}>
                <View style={[
                  styles.skillSegment,
                  styles.skillSegmentLeft,
                  movement.skill_level === 'Beginner'
                    ? styles.skillSegmentFilledBeginner
                    : movement.skill_level === 'Intermediate'
                    ? styles.skillSegmentFilledIntermediate
                    : movement.skill_level === 'Advanced'
                    ? styles.skillSegmentFilledAdvanced
                    : styles.skillSegmentEmpty
                ]} />
                <View style={[
                  styles.skillSegment,
                  styles.skillSegmentMiddle,
                  movement.skill_level === 'Intermediate'
                    ? styles.skillSegmentFilledIntermediate
                    : movement.skill_level === 'Advanced'
                    ? styles.skillSegmentFilledAdvanced
                    : styles.skillSegmentEmpty
                ]} />
                <View style={[
                  styles.skillSegment,
                  styles.skillSegmentRight,
                  movement.skill_level === 'Advanced'
                    ? styles.skillSegmentFilledAdvanced
                    : styles.skillSegmentEmpty
                ]} />
              </View>
            </View>
          </View>
          <Text style={styles.movementCategory}>
            {movement.movement_category?.name || movement.goal_type?.name || 'General'}
          </Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  movementCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  movementImage: {
    width: 100,
    height: 100,
    backgroundColor: '#1A1F2E',
  },
  movementIcon: {
    width: 100,
    height: 100,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  movementIconText: {
    fontSize: 48,
  },
  movementInfo: {
    flex: 1,
    padding: 16,
  },
  movementNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  movementName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  movementCategory: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  badgeColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  coreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  coreBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skillPill: {
    flexDirection: 'row',
    height: 8,
    width: 40,
    gap: 2,
  },
  skillSegment: {
    flex: 1,
    height: '100%',
  },
  skillSegmentLeft: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  skillSegmentMiddle: {
    // No border radius for middle segment
  },
  skillSegmentRight: {
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  skillSegmentEmpty: {
    backgroundColor: '#374151',
  },
  skillSegmentFilledBeginner: {
    backgroundColor: '#22C55E',
  },
  skillSegmentFilledIntermediate: {
    backgroundColor: '#F59E0B',
  },
  skillSegmentFilledAdvanced: {
    backgroundColor: '#EF4444',
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
