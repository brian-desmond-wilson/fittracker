import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react-native';
import { MorningRoutineTask } from '@/src/types/morning-routine';

interface TaskCardProps {
  task: MorningRoutineTask;
  isCompleted: boolean;
  isSkipped: boolean;
  onComplete: (data?: any) => void;
  onSkip: () => void;
}

export default function TaskCard({
  task,
  isCompleted,
  isSkipped,
  onComplete,
  onSkip,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});

  const handleComplete = () => {
    if (task.task_type === 'weight_entry') {
      if (!weight) {
        Alert.alert('Weight Required', 'Please enter your weight');
        return;
      }
      const weightNum = parseFloat(weight);
      if (isNaN(weightNum) || weightNum <= 0) {
        Alert.alert('Invalid Weight', 'Please enter a valid weight');
        return;
      }
      onComplete({ weight: weightNum, weight_unit: weightUnit });
    } else if (task.task_type === 'checklist' && task.checklist_items) {
      const completed = Object.keys(checklistState).filter((key) => checklistState[key]);
      onComplete({ checklist_completed: completed });
    } else {
      onComplete();
    }
  };

  const toggleChecklistItem = (item: string) => {
    setChecklistState((prev) => ({
      ...prev,
      [item]: !prev[item],
    }));
  };

  const getStatusColor = () => {
    if (isCompleted) return '#22C55E';
    if (isSkipped) return '#6B7280';
    return '#3B82F6';
  };

  return (
    <View style={[styles.card, isCompleted && styles.cardCompleted, isSkipped && styles.cardSkipped]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isCompleted ? (
            <CheckCircle2 size={24} color="#22C55E" strokeWidth={2} />
          ) : (
            <Circle size={24} color={getStatusColor()} strokeWidth={2} />
          )}
          <View style={styles.headerText}>
            <Text style={styles.title}>{task.title}</Text>
            <View style={styles.metaRow}>
              <Clock size={14} color="#9CA3AF" strokeWidth={2} />
              <Text style={styles.metaText}>{task.estimated_minutes} min</Text>
              {!task.is_required && (
                <Text style={styles.optionalBadge}>Optional</Text>
              )}
            </View>
          </View>
        </View>

        {!isCompleted && !isSkipped && (
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={styles.expandButton}
          >
            {expanded ? (
              <ChevronUp size={20} color="#9CA3AF" />
            ) : (
              <ChevronDown size={20} color="#9CA3AF" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded Content */}
      {expanded && !isCompleted && !isSkipped && (
        <View style={styles.expandedContent}>
          {task.description && (
            <Text style={styles.description}>{task.description}</Text>
          )}

          {/* Weight Entry Task */}
          {task.task_type === 'weight_entry' && (
            <View style={styles.weightEntry}>
              <TextInput
                style={styles.weightInput}
                placeholder="Enter weight"
                placeholderTextColor="#6B7280"
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
              />
              <View style={styles.unitSelector}>
                <TouchableOpacity
                  style={[styles.unitButton, weightUnit === 'lbs' && styles.unitButtonActive]}
                  onPress={() => setWeightUnit('lbs')}
                >
                  <Text style={[styles.unitText, weightUnit === 'lbs' && styles.unitTextActive]}>
                    lbs
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitButton, weightUnit === 'kg' && styles.unitButtonActive]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <Text style={[styles.unitText, weightUnit === 'kg' && styles.unitTextActive]}>
                    kg
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Checklist Task */}
          {task.task_type === 'checklist' && task.checklist_items && (
            <View style={styles.checklist}>
              {task.checklist_items.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.checklistItem}
                  onPress={() => toggleChecklistItem(item)}
                >
                  {checklistState[item] ? (
                    <CheckCircle2 size={20} color="#22C55E" strokeWidth={2} />
                  ) : (
                    <Circle size={20} color="#6B7280" strokeWidth={2} />
                  )}
                  <Text style={[styles.checklistItemText, checklistState[item] && styles.checklistItemTextChecked]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            {!task.is_required && (
              <TouchableOpacity
                style={[styles.button, styles.skipButton]}
                onPress={onSkip}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, styles.completeButton]}
              onPress={handleComplete}
            >
              <Text style={styles.completeButtonText}>Complete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Completion Status */}
      {(isCompleted || isSkipped) && (
        <View style={styles.statusBadge}>
          <Text style={[styles.statusText, isCompleted && styles.statusTextCompleted]}>
            {isCompleted ? 'Completed' : 'Skipped'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#374151',
  },
  cardCompleted: {
    borderColor: '#22C55E',
    opacity: 0.7,
  },
  cardSkipped: {
    borderColor: '#6B7280',
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginRight: 8,
  },
  optionalBadge: {
    fontSize: 12,
    color: '#9CA3AF',
    backgroundColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expandButton: {
    padding: 4,
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  description: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 16,
  },
  weightEntry: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  weightInput: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  unitSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  unitButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  unitButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  unitText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  unitTextActive: {
    color: '#FFFFFF',
  },
  checklist: {
    gap: 12,
    marginBottom: 16,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#111827',
    borderRadius: 12,
  },
  checklistItemText: {
    fontSize: 16,
    color: '#D1D5DB',
  },
  checklistItemTextChecked: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  skipButton: {
    backgroundColor: '#374151',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  completeButton: {
    backgroundColor: '#22C55E',
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  statusText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '600',
  },
  statusTextCompleted: {
    color: '#22C55E',
  },
});
