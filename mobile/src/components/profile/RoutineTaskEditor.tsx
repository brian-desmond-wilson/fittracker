import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Plus, Trash2 } from 'lucide-react-native';
import { TaskType, MorningRoutineTask } from '@/src/types/morning-routine';

interface RoutineTaskEditorProps {
  visible: boolean;
  task?: MorningRoutineTask; // If provided, we're editing; otherwise creating
  onClose: () => void;
  onSave: (taskData: {
    title: string;
    description?: string;
    estimated_minutes: number;
    is_required: boolean;
    task_type: TaskType;
    checklist_items?: string[];
  }) => void;
}

export function RoutineTaskEditor({
  visible,
  task,
  onClose,
  onSave,
}: RoutineTaskEditorProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task?.estimated_minutes?.toString() || '5'
  );
  const [isRequired, setIsRequired] = useState(task?.is_required ?? true);
  const [taskType, setTaskType] = useState<TaskType>(task?.task_type || 'simple');
  const [checklistItems, setChecklistItems] = useState<string[]>(
    task?.checklist_items || []
  );
  const [newChecklistItem, setNewChecklistItem] = useState('');

  // Update state when task prop changes (for editing existing tasks)
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setEstimatedMinutes(task.estimated_minutes.toString());
      setIsRequired(task.is_required);
      setTaskType(task.task_type);
      setChecklistItems(task.checklist_items || []);
    } else {
      // Reset to defaults when creating new task
      setTitle('');
      setDescription('');
      setEstimatedMinutes('5');
      setIsRequired(true);
      setTaskType('simple');
      setChecklistItems([]);
    }
    setNewChecklistItem('');
  }, [task, visible]); // Include visible to reset when modal reopens

  const handleSave = () => {
    if (!title.trim()) {
      return;
    }

    const minutes = parseInt(estimatedMinutes, 10);
    if (isNaN(minutes) || minutes < 1) {
      return;
    }

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      estimated_minutes: minutes,
      is_required: isRequired,
      task_type: taskType,
      checklist_items: taskType === 'checklist' ? checklistItems : undefined,
    });
  };

  const handleAddChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems([...checklistItems, newChecklistItem.trim()]);
      setNewChecklistItem('');
    }
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  };

  const taskTypes: { value: TaskType; label: string; description: string }[] = [
    {
      value: 'simple',
      label: 'Simple Task',
      description: 'A single task to complete',
    },
    {
      value: 'checklist',
      label: 'Checklist',
      description: 'Multiple sub-items to check off',
    },
    {
      value: 'weight_entry',
      label: 'Weight Entry',
      description: 'Record your weight',
    },
    {
      value: 'medication',
      label: 'Medication',
      description: 'Take medication reminder',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {task ? 'Edit Task' : 'Add Task'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title Input */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Task Title <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Brush teeth"
              placeholderTextColor="#6B7280"
              maxLength={100}
            />
          </View>

          {/* Description Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add any additional details..."
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>

          {/* Estimated Minutes */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Estimated Minutes <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={estimatedMinutes}
              onChangeText={setEstimatedMinutes}
              placeholder="5"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>

          {/* Task Type Selector */}
          <View style={styles.section}>
            <Text style={styles.label}>Task Type</Text>
            {taskTypes.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.radioOption,
                  taskType === type.value && styles.radioOptionSelected,
                ]}
                onPress={() => setTaskType(type.value)}
              >
                <View style={styles.radioButton}>
                  {taskType === type.value && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <View style={styles.radioContent}>
                  <Text style={styles.radioLabel}>{type.label}</Text>
                  <Text style={styles.radioDescription}>{type.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Checklist Items - Only show if task type is checklist */}
          {taskType === 'checklist' && (
            <View style={styles.section}>
              <Text style={styles.label}>Checklist Items</Text>

              {/* Existing checklist items */}
              {checklistItems.map((item, index) => (
                <View key={index} style={styles.checklistItem}>
                  <Text style={styles.checklistItemText}>{item}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveChecklistItem(index)}
                    style={styles.deleteButton}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add new checklist item */}
              <View style={styles.addChecklistRow}>
                <TextInput
                  style={[styles.input, styles.checklistInput]}
                  value={newChecklistItem}
                  onChangeText={setNewChecklistItem}
                  placeholder="Add checklist item"
                  placeholderTextColor="#6B7280"
                  maxLength={100}
                  onSubmitEditing={handleAddChecklistItem}
                />
                <TouchableOpacity
                  onPress={handleAddChecklistItem}
                  style={styles.addButton}
                  disabled={!newChecklistItem.trim()}
                >
                  <Plus size={20} color={newChecklistItem.trim() ? '#22C55E' : '#6B7280'} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Required Toggle */}
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.label}>Required Task</Text>
                <Text style={styles.toggleDescription}>
                  Can this task be skipped?
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, isRequired && styles.toggleActive]}
                onPress={() => setIsRequired(!isRequired)}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    isRequired && styles.toggleThumbActive,
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!title.trim() || !estimatedMinutes) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!title.trim() || !estimatedMinutes}
          >
            <Text style={styles.saveButtonText}>
              {task ? 'Save Changes' : 'Add Task'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  radioOptionSelected: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
  },
  radioContent: {
    flex: 1,
  },
  radioLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  radioDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  checklistItemText: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
  },
  deleteButton: {
    padding: 4,
  },
  addChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checklistInput: {
    flex: 1,
  },
  addButton: {
    width: 44,
    height: 44,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  toggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#22C55E',
  },
  toggleThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#22C55E',
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
});
