import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
  User,
  Target,
  Calendar,
  Settings,
  Bell,
  Lock,
  HelpCircle,
  Info,
  Wrench,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react-native';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}

interface ProfileMenuProps {
  isAdmin: boolean;
  onProfilePress: () => void;
  onGoalsPress: () => void;
  onRoutinesPress: () => void;
  onPreferencesPress: () => void;
  onNotificationsPress: () => void;
  onPrivacyPress: () => void;
  onHelpPress: () => void;
  onAboutPress: () => void;
  onDevTasksPress: () => void;
  onSignOut: () => void;
}

export function ProfileMenu({
  isAdmin,
  onProfilePress,
  onGoalsPress,
  onRoutinesPress,
  onPreferencesPress,
  onNotificationsPress,
  onPrivacyPress,
  onHelpPress,
  onAboutPress,
  onDevTasksPress,
  onSignOut,
}: ProfileMenuProps) {
  const userMenuItems: MenuItem[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: <User size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onProfilePress,
    },
    {
      id: 'goals',
      label: 'Goals',
      icon: <Target size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onGoalsPress,
    },
    {
      id: 'routines',
      label: 'Routines',
      icon: <Calendar size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onRoutinesPress,
    },
    {
      id: 'preferences',
      label: 'Preferences',
      icon: <Settings size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onPreferencesPress,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onNotificationsPress,
    },
    {
      id: 'privacy',
      label: 'Privacy & Security',
      icon: <Lock size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onPrivacyPress,
    },
    {
      id: 'help',
      label: 'Help & Support',
      icon: <HelpCircle size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onHelpPress,
    },
    {
      id: 'about',
      label: 'About',
      icon: <Info size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onAboutPress,
    },
  ];

  const adminMenuItems: MenuItem[] = [
    {
      id: 'dev-tasks',
      label: 'Development Tasks',
      icon: <Wrench size={22} color="#9CA3AF" strokeWidth={2} />,
      onPress: onDevTasksPress,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>Profile</Text>

      {/* User Menu Items */}
      <View style={styles.menuSection}>
        {userMenuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuItem}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconContainer}>{item.icon}</View>
              <Text style={styles.menuItemText}>{item.label}</Text>
            </View>
            <ChevronRight size={20} color="#6B7280" strokeWidth={2} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Admin Section */}
      {isAdmin && (
        <>
          <View style={styles.adminBadgeContainer}>
            <ShieldCheck size={16} color="#22C55E" />
            <Text style={styles.adminBadgeText}>Administrator Access</Text>
          </View>

          <View style={styles.menuSection}>
            {adminMenuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.iconContainer}>{item.icon}</View>
                  <Text style={styles.menuItemText}>{item.label}</Text>
                </View>
                <ChevronRight size={20} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Sign Out Button */}
      <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  menuSection: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  adminBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  adminBadgeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#22C55E',
  },
  signOutButton: {
    backgroundColor: '#7F1D1D',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
