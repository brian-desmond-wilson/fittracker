import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { ChevronLeft, Plus, Clock, Edit2, Copy, Trash2, Star } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';
import { MorningRoutineTemplate } from '@/src/types/morning-routine';
import {
  getAllRoutineTemplates,
  duplicateRoutineTemplate,
  deleteRoutineTemplate,
} from '@/src/services/morningRoutineService';
import { RoutineTemplateEditor } from './RoutineTemplateEditor';

interface RoutinesScreenProps {
  onClose: () => void;
}

export function RoutinesScreen({ onClose }: RoutinesScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MorningRoutineTemplate[]>([]);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadUserAndTemplates();
  }, []);

  const loadUserAndTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await loadTemplates(user.id);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const loadTemplates = async (uid?: string) => {
    const userIdToUse = uid || userId;
    if (!userIdToUse) return;

    setLoading(true);
    try {
      const data = await getAllRoutineTemplates(userIdToUse);
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      Alert.alert('Error', 'Failed to load routine templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    if (!userId) return;

    // Open editor in create mode (no templateId)
    setIsCreating(true);
    setEditingTemplateId(undefined);
    setEditorVisible(true);
  };

  const handleEdit = (templateId: string) => {
    setIsCreating(false);
    setEditingTemplateId(templateId);
    setEditorVisible(true);
  };

  const handleDuplicate = (template: MorningRoutineTemplate) => {
    Alert.alert(
      'Duplicate Routine',
      `Create a copy of "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async () => {
            try {
              const duplicated = await duplicateRoutineTemplate(
                template.id,
                `${template.name} (Copy)`
              );

              if (duplicated) {
                await loadTemplates();
              } else {
                Alert.alert('Error', 'Failed to duplicate routine');
              }
            } catch (error) {
              console.error('Error duplicating template:', error);
              Alert.alert('Error', 'Failed to duplicate routine');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (template: MorningRoutineTemplate) => {
    if (template.is_default) {
      Alert.alert(
        'Cannot Delete',
        'You cannot delete your default routine. Please set another routine as default first.'
      );
      return;
    }

    Alert.alert(
      'Delete Routine',
      `Are you sure you want to delete "${template.name}"? This will also delete all tasks in this routine.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteRoutineTemplate(template.id);
              if (success) {
                await loadTemplates();
              } else {
                Alert.alert('Error', 'Failed to delete routine');
              }
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert('Error', 'Failed to delete routine');
            }
          },
        },
      ]
    );
  };

  const handleCloseEditor = () => {
    setEditorVisible(false);
    setEditingTemplateId(undefined);
    setIsCreating(false);
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.pageTitle}>Routines</Text>
              <Text style={styles.pageSubtitle}>
                Manage your routine templates
              </Text>
            </View>
            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateNew}
            >
              <Plus size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#22C55E" />
            </View>
          ) : templates.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No Routines Yet</Text>
              <Text style={styles.emptyStateText}>
                Create your first routine template to get started
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={handleCreateNew}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.emptyStateButtonText}>Create Routine</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.templateList}
              showsVerticalScrollIndicator={false}
            >
              {templates.map((template) => (
                <View key={template.id} style={styles.templateCard}>
                  <View style={styles.templateHeader}>
                    <View style={styles.templateTitleRow}>
                      <Text style={styles.templateName}>{template.name}</Text>
                      {template.is_default && (
                        <View style={styles.defaultBadge}>
                          <Star size={12} color="#F59E0B" fill="#F59E0B" />
                          <Text style={styles.defaultBadgeText}>Default</Text>
                        </View>
                      )}
                    </View>
                    {template.target_completion_time && (
                      <View style={styles.targetTimeRow}>
                        <Clock size={14} color="#9CA3AF" />
                        <Text style={styles.targetTimeText}>
                          Target: {template.target_completion_time}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.templateActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleEdit(template.id)}
                    >
                      <Edit2 size={18} color="#22C55E" />
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDuplicate(template)}
                    >
                      <Copy size={18} color="#3B82F6" />
                      <Text style={[styles.actionButtonText, { color: '#3B82F6' }]}>
                        Duplicate
                      </Text>
                    </TouchableOpacity>

                    {!template.is_default && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDelete(template)}
                      >
                        <Trash2 size={18} color="#EF4444" />
                        <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Template Editor Modal */}
      {userId && (
        <Modal
          visible={editorVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          statusBarTranslucent={false}
          onRequestClose={handleCloseEditor}
        >
          <RoutineTemplateEditor
            templateId={editingTemplateId}
            userId={userId}
            onClose={handleCloseEditor}
            onUpdate={loadTemplates}
          />
        </Modal>
      )}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  createButton: {
    width: 44,
    height: 44,
    backgroundColor: '#22C55E',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  templateList: {
    flex: 1,
  },
  templateCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 12,
  },
  templateHeader: {
    marginBottom: 16,
  },
  templateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  templateName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  defaultBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },
  targetTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetTimeText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  templateActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0A0F1E',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
});
