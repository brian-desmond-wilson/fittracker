import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert, RefreshControl } from 'react-native';
import { Calendar, Plus, Clock } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ClassWithDetails } from '@/src/types/crossfit';
import { fetchClasses, searchClasses } from '@/src/lib/supabase/crossfit';
import { ClassDetailScreen } from './ClassDetailScreen';
import { supabase } from '@/src/lib/supabase';

interface ClassesTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCountUpdate: (count: number) => void;
}

export default function ClassesTab({ searchQuery, onSearchChange, onCountUpdate }: ClassesTabProps) {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadClasses();
    }
  }, [searchQuery]);

  const loadClasses = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setClasses([]);
        onCountUpdate(0);
        return;
      }

      const data = await fetchClasses(user.id);
      setClasses(data);
      onCountUpdate(data.length);
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadClasses();
      return;
    }

    try {
      setSearching(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setClasses([]);
        onCountUpdate(0);
        return;
      }

      const results = await searchClasses(user.id, searchQuery.trim());
      setClasses(results);
      onCountUpdate(results.length);
    } catch (error) {
      console.error('Error searching classes:', error);
    } finally {
      setSearching(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (searchQuery.trim()) {
      await handleSearch();
    } else {
      await loadClasses();
    }
    setRefreshing(false);
  };

  const handleCreateClass = () => {
    Alert.alert('Create Class', 'Class creation feature coming soon!');
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  const getWODPreview = (classData: ClassWithDetails) => {
    if (!classData.parts || classData.parts.length === 0) {
      return 'No content';
    }

    const previewParts = classData.parts
      .slice(0, 2)
      .map(part => {
        if (part.wod) {
          return `${part.wod.name}`;
        } else if (part.custom_content) {
          return part.custom_content.substring(0, 30);
        } else {
          return part.part_type;
        }
      });

    return previewParts.join(' → ');
  };

  return (
    <View style={styles.container}>
      {/* Classes List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading classes...</Text>
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No classes found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : 'Create your first class to get started!'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity style={styles.createButton} onPress={handleCreateClass}>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Create Class</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          classes.map((classData) => (
            <TouchableOpacity
              key={classData.id}
              style={styles.classCard}
              activeOpacity={0.7}
              onPress={() => setSelectedClassId(classData.id)}
            >
              <View style={styles.classHeader}>
                <View style={styles.dateContainer}>
                  <Calendar size={16} color={colors.primary} />
                  <Text style={styles.dateText}>{formatDate(classData.date)}</Text>
                </View>
                <View style={styles.durationBadge}>
                  <Clock size={14} color={colors.mutedForeground} />
                  <Text style={styles.durationText}>{classData.duration_minutes} min</Text>
                </View>
              </View>
              <Text style={styles.className}>{classData.name}</Text>
              <Text style={styles.wodPreview}>{getWODPreview(classData)}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Class Detail Modal */}
      <Modal
        visible={selectedClassId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedClassId(null)}
      >
        {selectedClassId && (
          <ClassDetailScreen
            classId={selectedClassId}
            onClose={() => setSelectedClassId(null)}
            onSave={() => {
              setSelectedClassId(null);
              loadClasses();
            }}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  classCard: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.muted,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  className: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  wodPreview: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
});
