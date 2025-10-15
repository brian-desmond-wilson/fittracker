import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Plus, GripVertical, Edit2, Trash2, Clock, ChevronUp, ChevronDown } from 'lucide-react-native';
import { MorningRoutineTask, MorningRoutineWithTasks } from '@/src/types/morning-routine';
import {
  getRoutineTemplate,
  createRoutineTemplate,
  updateRoutineTemplate,
  createRoutineTask,
  updateRoutineTask,
  deleteRoutineTask,
  reorderRoutineTasks,
} from '@/src/services/morningRoutineService';
import { RoutineTaskEditor } from './RoutineTaskEditor';

interface RoutineTemplateEditorProps {
  templateId?: string; // Optional - if not provided, we're in create mode
  userId: string; // Required for creating new templates
  onClose: () => void;
  onUpdate: () => void; // Callback to refresh parent list
}

export function RoutineTemplateEditor({
  templateId,
  userId,
  onClose,
  onUpdate,
}: RoutineTemplateEditorProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<MorningRoutineWithTasks | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [taskEditorVisible, setTaskEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<MorningRoutineTask | undefined>(undefined);
  const [isCreateMode, setIsCreateMode] = useState(!templateId);

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    } else {
      // Create mode - initialize with empty state
      setTemplateName('New Routine');
      setTargetTime('');
      setTemplate({
        id: '',
        user_id: userId,
        name: 'New Routine',
        is_default: false,
        target_completion_time: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tasks: [],
      });
      setLoading(false);
    }
  }, [templateId, userId]);

  const loadTemplate = async () => {
    if (!templateId) return;

    setLoading(true);
    try {
      const data = await getRoutineTemplate(templateId);
      if (data) {
        setTemplate(data);
        setTemplateName(data.name);
        setTargetTime(data.target_completion_time || '');
      }
    } catch (error) {
      console.error('Error loading template:', error);
      Alert.alert('Error', 'Failed to load routine template');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplateInfo = async () => {
    if (!templateName.trim()) {
      Alert.alert('Error', 'Template name is required');
      return;
    }

    setSaving(true);
    try {
      if (isCreateMode) {
        // Create new template
        const newTemplate = await createRoutineTemplate(
          userId,
          templateName.trim(),
          targetTime.trim() || undefined
        );

        if (newTemplate) {
          // Switch to edit mode with the new template ID
          setIsCreateMode(false);
          setTemplate({
            ...newTemplate,
            tasks: [],
          });
          onUpdate();
          Alert.alert('Success', 'Routine created successfully');
        } else {
          Alert.alert('Error', 'Failed to create template');
        }
      } else {
        // Update existing template
        if (!templateId) return;

        const success = await updateRoutineTemplate(templateId, {
          name: templateName.trim(),
          target_completion_time: targetTime.trim() || null,
        });

        if (success) {
          await loadTemplate();
          onUpdate();
        } else {
          Alert.alert('Error', 'Failed to update template');
        }
      }
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Error', 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTask = () => {
    if (isCreateMode) {
      Alert.alert(
        'Save Template First',
        'Please save the routine template before adding tasks.'
      );
      return;
    }
    setEditingTask(undefined);
    setTaskEditorVisible(true);
  };

  const handleEditTask = (task: MorningRoutineTask) => {
    setEditingTask(task);
    setTaskEditorVisible(true);
  };

  const handleSaveTask = async (taskData: {
    title: string;
    description?: string;
    estimated_minutes: number;
    is_required: boolean;
    task_type: string;
    checklist_items?: string[];
  }) => {
    if (isCreateMode || !template?.id) {
      Alert.alert('Error', 'Please save the template first');
      return;
    }

    setSaving(true);
    try {
      if (editingTask) {
        // Update existing task
        const success = await updateRoutineTask(editingTask.id, taskData);
        if (success) {
          await loadTemplate();
          setTaskEditorVisible(false);
          onUpdate();
        } else {
          Alert.alert('Error', 'Failed to update task');
        }
      } else {
        // Create new task
        const newTask = await createRoutineTask(template.id, taskData);
        if (newTask) {
          await loadTemplate();
          setTaskEditorVisible(false);
          onUpdate();
        } else {
          Alert.alert('Error', 'Failed to create task');
        }
      }
    } catch (error) {
      console.error('Error saving task:', error);
      Alert.alert('Error', 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = (task: MorningRoutineTask) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const success = await deleteRoutineTask(task.id);
              if (success) {
                await loadTemplate();
                onUpdate();
              } else {
                Alert.alert('Error', 'Failed to delete task');
              }
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert('Error', 'Failed to delete task');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleMoveTask = async (taskIndex: number, direction: 'up' | 'down') => {
    if (!template?.id || isCreateMode) return;
    if (taskIndex < 0 || taskIndex >= template.tasks.length) return;

    const newIndex = direction === 'up' ? taskIndex - 1 : taskIndex + 1;
    if (newIndex < 0 || newIndex >= template.tasks.length) return;

    // Create new array with swapped tasks
    const newTasks = [...template.tasks];
    const temp = newTasks[taskIndex];
    newTasks[taskIndex] = newTasks[newIndex];
    newTasks[newIndex] = temp;

    // Optimistically update the UI
    setTemplate({
      ...template,
      tasks: newTasks,
    });

    // Save the new order to the database
    const orderedTaskIds = newTasks.map(task => task.id);
    try {
      const success = await reorderRoutineTasks(template.id, orderedTaskIds);
      if (!success) {
        // Revert on failure
        await loadTemplate();
        Alert.alert('Error', 'Failed to reorder tasks');
      }
    } catch (error) {
      console.error('Error reordering tasks:', error);
      await loadTemplate();
      Alert.alert('Error', 'Failed to reorder tasks');
    }
  };

  const calculateTotalTime = () => {
    if (!template) return 0;
    return template.tasks.reduce((total, task) => total + task.estimated_minutes, 0);
  };


  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <ChevronLeft size={24} color="#FFFFFF" />
              <Text style={styles.backText}>Routines</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#22C55E" />
          </View>
        </View>
      </>
    );
  }

  if (!template) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <ChevronLeft size={24} color="#FFFFFF" />
              <Text style={styles.backText}>Routines</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>Template not found</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Routines</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Template Info Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Template Info</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Routine Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="e.g., My Morning Routine"
                placeholderTextColor="#6B7280"
                maxLength={100}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Completion Time</Text>
              <TextInput
                style={styles.input}
                value={targetTime}
                onChangeText={setTargetTime}
                placeholder="e.g., 8:00 AM"
                placeholderTextColor="#6B7280"
                maxLength={20}
              />
              <Text style={styles.helperText}>
                Optional time you want to complete this routine by
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveTemplateInfo}
              disabled={saving || !templateName.trim()}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tasks Section */}
          <View style={styles.card}>
            <View style={styles.taskHeader}>
              <View>
                <Text style={styles.cardTitle}>Tasks</Text>
                <View style={styles.taskStats}>
                  <Text style={styles.taskStatsText}>
                    {template.tasks.length} {template.tasks.length === 1 ? 'task' : 'tasks'}
                  </Text>
                  <View style={styles.taskStatsDivider} />
                  <Clock size={14} color="#9CA3AF" />
                  <Text style={styles.taskStatsText}>
                    {calculateTotalTime()} min total
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.addTaskButton}
                onPress={handleAddTask}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addTaskButtonText}>Add Task</Text>
              </TouchableOpacity>
            </View>

            {template.tasks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No tasks yet. Add your first task to get started.
                </Text>
              </View>
            ) : (
              <View style={styles.taskList}>
                {template.tasks.map((task, index) => (
                  <View key={task.id} style={styles.taskItem}>
                    <View style={styles.taskReorderButtons}>
                      <TouchableOpacity
                        style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                        onPress={() => handleMoveTask(index, 'up')}
                        disabled={index === 0}
                      >
                        <ChevronUp size={18} color={index === 0 ? '#374151' : '#9CA3AF'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.reorderButton, index === template.tasks.length - 1 && styles.reorderButtonDisabled]}
                        onPress={() => handleMoveTask(index, 'down')}
                        disabled={index === template.tasks.length - 1}
                      >
                        <ChevronDown size={18} color={index === template.tasks.length - 1 ? '#374151' : '#9CA3AF'} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.taskContent}>
                      <View style={styles.taskTitleRow}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <View style={styles.taskBadge}>
                          <Clock size={12} color="#9CA3AF" />
                          <Text style={styles.taskBadgeText}>
                            {task.estimated_minutes}m
                          </Text>
                        </View>
                      </View>
                      {task.description && (
                        <Text style={styles.taskDescription} numberOfLines={2}>
                          {task.description}
                        </Text>
                      )}
                      <View style={styles.taskMeta}>
                        <Text style={styles.taskType}>{task.task_type}</Text>
                        {task.is_required && (
                          <>
                            <View style={styles.taskMetaDivider} />
                            <Text style={styles.taskRequired}>Required</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.taskActions}>
                      <TouchableOpacity
                        style={styles.taskActionButton}
                        onPress={() => handleEditTask(task)}
                      >
                        <Edit2 size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.taskActionButton}
                        onPress={() => handleDeleteTask(task)}
                      >
                        <Trash2 size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Task Editor Modal */}
      <RoutineTaskEditor
        visible={taskEditorVisible}
        task={editingTask}
        onClose={() => setTaskEditorVisible(false)}
        onSave={handleSaveTask}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
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
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#0A0F1E',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
  },
  saveButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#374151',
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  taskStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  taskStatsText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  taskStatsDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#374151',
  },
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addTaskButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  taskList: {
    gap: 12,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0F1E',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  taskItemActive: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  taskDragHandle: {
    marginRight: 12,
  },
  taskReorderButtons: {
    flexDirection: 'column',
    marginRight: 8,
    gap: 4,
  },
  reorderButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#1F2937',
  },
  reorderButtonDisabled: {
    opacity: 0.3,
  },
  taskContent: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1F2937',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  taskBadgeText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  taskDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskType: {
    fontSize: 12,
    color: '#22C55E',
    textTransform: 'capitalize',
  },
  taskMetaDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#374151',
  },
  taskRequired: {
    fontSize: 12,
    color: '#F59E0B',
  },
  taskActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  taskActionButton: {
    padding: 8,
  },
});
