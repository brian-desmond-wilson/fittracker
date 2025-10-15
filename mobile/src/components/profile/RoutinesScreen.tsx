import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { ChevronLeft, Calendar } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface RoutinesScreenProps {
  onClose: () => void;
}

export function RoutinesScreen({ onClose }: RoutinesScreenProps) {
  const insets = useSafeAreaInsets();

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
        <Text style={styles.pageTitle}>Morning Routines</Text>
        <Text style={styles.pageSubtitle}>
          Manage your morning routine templates
        </Text>

        {/* Placeholder Card */}
        <View style={styles.placeholderCard}>
          <View style={styles.iconContainer}>
            <Calendar size={48} color="#22C55E" strokeWidth={1.5} />
          </View>
          <Text style={styles.placeholderTitle}>Coming Soon</Text>
          <Text style={styles.placeholderText}>
            Morning routine configuration will be available here. You'll be able to create, edit, and manage your routine templates.
          </Text>
        </View>

        {/* Current Functionality Note */}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Current Functionality</Text>
          <Text style={styles.noteText}>
            • Start your morning routine from the Home tab{'\n'}
            • Complete daily tasks in the wizard{'\n'}
            • Track your progress and completion times
          </Text>
        </View>
      </View>
      </View>
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
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  placeholderCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  noteCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22C55E',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 22,
  },
});
