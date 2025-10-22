import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Clock, Zap, Trash2 } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { WODWithDetails } from '@/src/types/crossfit';
import { deleteWOD } from '@/src/lib/supabase/crossfit';
import { supabase } from '@/src/lib/supabase';

interface SwipeableWODCardProps {
  wod: WODWithDetails;
  onPress: () => void;
  onDelete: () => void;
  getCategoryColor: (categoryName: string) => string;
}

export function SwipeableWODCard({ wod, onPress, onDelete, getCategoryColor }: SwipeableWODCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

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
