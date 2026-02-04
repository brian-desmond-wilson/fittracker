import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight, Clock } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import {
  MorningRoutineWithTasks,
  MorningRoutineCompletion,
  MorningRoutineProgress,
} from '@/src/types/morning-routine';
import {
  getOrCreateDefaultRoutine,
  getTodayRoutineProgress,
  calculateProgress,
} from '@/src/services/morningRoutineService';

interface MorningRoutineBannerProps {
  onPress: () => void;
  refreshKey?: number;
}

export default function MorningRoutineBanner({ onPress, refreshKey = 0 }: MorningRoutineBannerProps) {
  const [visible, setVisible] = useState(false);
  const [routine, setRoutine] = useState<MorningRoutineWithTasks | null>(null);
  const [completion, setCompletion] = useState<MorningRoutineCompletion | null>(null);
  const [progress, setProgress] = useState<MorningRoutineProgress | null>(null);

  useEffect(() => {
    checkRoutineStatus();
  }, [refreshKey]);

  const checkRoutineStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setVisible(false);
        return;
      }

      // Check if there's an active routine today
      const completionData = await getTodayRoutineProgress(user.id);

      if (completionData && !completionData.completed_at) {
        // There's an active routine
        const routineData = await getOrCreateDefaultRoutine(user.id);

        if (routineData) {
          setRoutine(routineData);
          setCompletion(completionData);

          const progressData = calculateProgress(routineData, completionData);
          setProgress(progressData);

          setVisible(true);
        }
      } else {
        setVisible(false);
      }
    } catch (error) {
      console.error('Error checking routine status:', error);
      setVisible(false);
    }
  };

  if (!visible || !progress) {
    return null;
  }

  const isOnTrack = progress.isOnTrack;
  const bannerColor = isOnTrack ? '#22C55E' : '#EF4444';

  return (
    <TouchableOpacity
      style={[styles.banner, { borderLeftColor: bannerColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.left}>
          <Text style={styles.title}>Morning Routine</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              {progress.completedTasks}/{progress.totalTasks} tasks
            </Text>
            <View style={styles.dot} />
            <Clock size={12} color={bannerColor} strokeWidth={2} />
            <Text style={[styles.timeText, { color: bannerColor }]}>
              {progress.estimatedTimeRemaining} min left
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressText}>
              {progress.totalTasks > 0 ? Math.round((progress.completedTasks / progress.totalTasks) * 100) : 0}%
            </Text>
          </View>
          <ChevronRight size={20} color="#9CA3AF" strokeWidth={2} />
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarBackground}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${progress.totalTasks > 0 ? (progress.completedTasks / progress.totalTasks) * 100 : 0}%`,
              backgroundColor: bannerColor,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  left: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#6B7280',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#374151',
  },
  progressText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#111827',
  },
  progressBarFill: {
    height: '100%',
  },
});
