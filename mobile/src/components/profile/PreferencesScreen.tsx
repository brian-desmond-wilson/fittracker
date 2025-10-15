import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { ChevronLeft, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PreferencesScreenProps {
  onClose: () => void;
}

export function PreferencesScreen({ onClose }: PreferencesScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
          <Text style={styles.backText}>Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.pageTitle}>Preferences</Text>
        <Text style={styles.pageSubtitle}>
          Customize your app experience
        </Text>

        <View style={styles.placeholderCard}>
          <View style={styles.iconContainer}>
            <Settings size={48} color="#22C55E" strokeWidth={1.5} />
          </View>
          <Text style={styles.placeholderTitle}>Coming Soon</Text>
          <Text style={styles.placeholderText}>
            Preferences like units (metric/imperial), theme settings, and language selection will be available here.
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
});
