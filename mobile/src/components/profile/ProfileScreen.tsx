import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { User, Mail, ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProfileScreenProps {
  userName: string;
  userEmail: string;
  memberSince: string;
  onClose: () => void;
}

export function ProfileScreen({ userName, userEmail, memberSince, onClose }: ProfileScreenProps) {
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

      {/* Content */}
      <View style={styles.content}>
        {/* Avatar and User Info */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <User size={60} color="#22C55E" strokeWidth={2} />
          </View>
          <Text style={styles.userName}>{userName || 'User'}</Text>
          <View style={styles.emailRow}>
            <Mail size={16} color="#9CA3AF" />
            <Text style={styles.userEmail}>{userEmail}</Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member since</Text>
            <Text style={styles.infoValue}>{memberSince}</Text>
          </View>
        </View>

        <Text style={styles.helpText}>
          Your profile information is displayed here. To edit your personal goals and preferences, visit the Goals section.
        </Text>
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userEmail: {
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  helpText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
