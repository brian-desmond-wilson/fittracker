import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, CheckCircle } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import {
  MorningRoutineWithTasks,
  MorningRoutineCompletion,
  TaskCompletionData,
  MorningRoutineProgress,
} from '@/src/types/morning-routine';
import {
  getOrCreateDefaultRoutine,
  startMorningRoutine,
  updateTaskCompletion,
  completeRoutine,
  calculateProgress,
} from '@/src/services/morningRoutineService';
import TaskCard from './TaskCard';

interface MorningRoutineWizardProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export default function MorningRoutineWizard({
  visible,
  onClose,
  onComplete,
}: MorningRoutineWizardProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState<MorningRoutineWithTasks | null>(null);
  const [completion, setCompletion] = useState<MorningRoutineCompletion | null>(null);
  const [progress, setProgress] = useState<MorningRoutineProgress | null>(null);

  useEffect(() => {
    if (visible) {
      initializeRoutine();
    }
  }, [visible]);

  useEffect(() => {
    if (routine && completion) {
      const newProgress = calculateProgress(routine, completion);
      setProgress(newProgress);
    }
  }, [routine, completion]);

  const initializeRoutine = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please log in to continue');
        return;
      }

      // Get or create default routine template
      const routineData = await getOrCreateDefaultRoutine(user.id);
      if (!routineData) {
        Alert.alert('Error', 'Failed to load morning routine');
        return;
      }

      setRoutine(routineData);

      // Start or get today's completion
      const completionData = await startMorningRoutine(user.id, routineData.id);
      if (!completionData) {
        Alert.alert('Error', 'Failed to start morning routine');
        return;
      }

      setCompletion(completionData);
    } catch (error) {
      console.error('Error initializing routine:', error);
      Alert.alert('Error', 'Failed to initialize morning routine');
    } finally {
      setLoading(false);
    }
  };

  const handleTaskComplete = async (taskId: string, data?: any) => {
    if (!completion || !routine) return;

    const newTaskCompletion: TaskCompletionData = {
      task_id: taskId,
      completed_at: new Date().toISOString(),
      skipped: false,
      data: data || {},
    };

    // Update local state
    const updatedTasksCompleted = [
      ...completion.tasks_completed.filter((t) => t.task_id !== taskId),
      newTaskCompletion,
    ];

    // Update in database
    const success = await updateTaskCompletion(completion.id, updatedTasksCompleted);
    if (success) {
      setCompletion({
        ...completion,
        tasks_completed: updatedTasksCompleted,
      });

      // Check if all tasks are done
      if (updatedTasksCompleted.length === routine.tasks.length) {
        handleCompleteRoutine();
      }
    } else {
      Alert.alert('Error', 'Failed to save task completion');
    }
  };

  const handleTaskSkip = async (taskId: string) => {
    if (!completion || !routine) return;

    const newTaskCompletion: TaskCompletionData = {
      task_id: taskId,
      completed_at: new Date().toISOString(),
      skipped: true,
    };

    // Update local state
    const updatedTasksCompleted = [
      ...completion.tasks_completed.filter((t) => t.task_id !== taskId),
      newTaskCompletion,
    ];

    // Update in database
    const success = await updateTaskCompletion(completion.id, updatedTasksCompleted);
    if (success) {
      setCompletion({
        ...completion,
        tasks_completed: updatedTasksCompleted,
      });

      // Check if all tasks are done
      if (updatedTasksCompleted.length === routine.tasks.length) {
        handleCompleteRoutine();
      }
    } else {
      Alert.alert('Error', 'Failed to skip task');
    }
  };

  const handleCompleteRoutine = async () => {
    if (!completion) return;

    const success = await completeRoutine(completion.id);
    if (success) {
      Alert.alert(
        'Great Job!',
        'You completed your morning routine!',
        [
          {
            text: 'OK',
            onPress: () => {
              onClose();
              if (onComplete) {
                onComplete();
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('Error', 'Failed to complete routine');
    }
  };

  const getTaskStatus = (taskId: string) => {
    if (!completion) return { isCompleted: false, isSkipped: false };

    const taskCompletion = completion.tasks_completed.find((t) => t.task_id === taskId);
    return {
      isCompleted: taskCompletion ? !taskCompletion.skipped : false,
      isSkipped: taskCompletion ? taskCompletion.skipped : false,
    };
  };

  const handleClose = () => {
    if (completion && completion.tasks_completed.length > 0) {
      Alert.alert(
        'Close Morning Routine?',
        'Your progress has been saved. You can continue later from the home screen.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Morning Routine</Text>
            {progress && (
              <Text style={styles.subtitle}>
                {progress.completedTasks}/{progress.totalTasks} completed • {progress.estimatedTimeRemaining} min left
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        {progress && (
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progress.totalTasks > 0 ? (progress.completedTasks / progress.totalTasks) * 100 : 0}%`,
                    backgroundColor: progress.isOnTrack ? '#22C55E' : '#F59E0B',
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, !progress.isOnTrack && styles.progressTextBehind]}>
              {progress.isOnTrack
                ? progress.minutesAheadOrBehind > 0
                  ? `${progress.minutesAheadOrBehind} min ahead`
                  : 'On track'
                : `${Math.abs(progress.minutesAheadOrBehind)} min behind`}
            </Text>
          </View>
        )}

        {/* Tasks List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading your routine...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {routine?.tasks.map((task) => {
              const { isCompleted, isSkipped } = getTaskStatus(task.id);
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  isCompleted={isCompleted}
                  isSkipped={isSkipped}
                  onComplete={(data) => handleTaskComplete(task.id, data)}
                  onSkip={() => handleTaskSkip(task.id)}
                />
              );
            })}

            {progress && progress.completedTasks + progress.skippedTasks === progress.totalTasks && (
              <View style={styles.completionCard}>
                <CheckCircle size={48} color="#22C55E" strokeWidth={2} />
                <Text style={styles.completionTitle}>All Done!</Text>
                <Text style={styles.completionText}>
                  You completed your morning routine in {progress.elapsedTime} minutes
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  closeButton: {
    padding: 4,
  },
  progressBarContainer: {
    padding: 16,
    paddingTop: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#22C55E',
    textAlign: 'center',
    fontWeight: '600',
  },
  progressTextBehind: {
    color: '#EF4444',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  completionCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#22C55E',
    marginTop: 16,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  completionText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
