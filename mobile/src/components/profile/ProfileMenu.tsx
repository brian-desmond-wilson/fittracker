// mobile/src/components/profile/ProfileMenu.tsx
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Bell,
  Calendar,
  ChevronRight,
  Info,
  Salad,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  User,
  Wrench,
} from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";

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
  onNutritionPress: () => void;
  onTrackingSettingsPress: () => void;
  onRoutinesPress: () => void;
  onNotificationsPress: () => void;
  onAboutPress: () => void;
  onDevTasksPress: () => void;
  onSignOut: () => void;
}

export function ProfileMenu({
  isAdmin,
  onProfilePress,
  onGoalsPress,
  onNutritionPress,
  onTrackingSettingsPress,
  onRoutinesPress,
  onNotificationsPress,
  onAboutPress,
  onDevTasksPress,
  onSignOut,
}: ProfileMenuProps) {
  const menuIcon = (Icon: typeof User) => (
    <Icon size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
  );

  const userMenuItems: MenuItem[] = [
    { id: "profile", label: "Profile", icon: menuIcon(User), onPress: onProfilePress },
    { id: "goals", label: "Goals", icon: menuIcon(Target), onPress: onGoalsPress },
    {
      id: "nutrition",
      label: "Nutrition Preferences",
      icon: menuIcon(Salad),
      onPress: onNutritionPress,
    },
    {
      id: "tracking-settings",
      label: "Tracking Settings",
      icon: menuIcon(SlidersHorizontal),
      onPress: onTrackingSettingsPress,
    },
    { id: "routines", label: "Routines", icon: menuIcon(Calendar), onPress: onRoutinesPress },
    {
      id: "notifications",
      label: "Notifications",
      icon: menuIcon(Bell),
      onPress: onNotificationsPress,
    },
    { id: "about", label: "About", icon: menuIcon(Info), onPress: onAboutPress },
  ];

  const adminMenuItems: MenuItem[] = [
    {
      id: "dev-tasks",
      label: "Development Tasks",
      icon: menuIcon(Wrench),
      onPress: onDevTasksPress,
    },
  ];

  const renderSection = (items: MenuItem[]) => (
    <View style={styles.menuSection}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.menuItem}
          onPress={item.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.iconContainer}>{item.icon}</View>
            <Text style={styles.menuItemText}>{item.label}</Text>
          </View>
          <ChevronRight size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>Profile</Text>

      {renderSection(userMenuItems)}

      {isAdmin && (
        <>
          <View style={styles.adminBadgeContainer}>
            <ShieldCheck size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
            <Text style={styles.adminBadgeText}>Administrator Access</Text>
          </View>
          {renderSection(adminMenuItems)}
        </>
      )}

      <Button variant="destructive" label="Sign Out" onPress={onSignOut} fluid />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: spacing.screenGutter,
    paddingBottom: 100, // matches pre-migration reserve above the tab bar
  },
  pageTitle: { ...typography.titleRoot, color: colors.text, marginBottom: spacing.xxl },
  menuSection: {
    backgroundColor: colors.surface,
    borderRadius: radii.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  // Rule 20: a tappable disclosure row is a control — rowTitle, not section.
  menuItemText: { ...typography.rowTitle, color: colors.text },
  adminBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: tint(colors.brand),
    borderWidth: 1,
    borderColor: tint(colors.brand, 0.3),
    borderRadius: radii.control,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  adminBadgeText: { ...typography.buttonSm, color: colors.brand },
});
