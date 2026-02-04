import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Home,
  Calendar,
  Plus,
  TrendingUp,
  User,
  Settings,
  HelpCircle,
  Info,
  X,
} from "lucide-react-native";

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.75;

export default function DrawerMenu({ visible, onClose }: DrawerMenuProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: -DRAWER_WIDTH,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [visible]);

  const menuItems = [
    { icon: Home, label: "Home", color: "#22C55E" },
    { icon: Calendar, label: "Schedule", color: "#3B82F6" },
    { icon: Plus, label: "Track", color: "#F97316" },
    { icon: TrendingUp, label: "Progress", color: "#8B5CF6" },
    { icon: User, label: "Profile", color: "#EC4899" },
  ];

  const actionItems = [
    { icon: Settings, label: "Settings", color: "#9CA3AF" },
    { icon: HelpCircle, label: "Help & Support", color: "#9CA3AF" },
    { icon: Info, label: "About", color: "#9CA3AF" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Drawer */}
        <Pressable style={{ width: DRAWER_WIDTH }} onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.drawer,
              {
                width: DRAWER_WIDTH,
                transform: [{ translateX: slideAnim }],
                paddingTop: insets.top,
              },
            ]}
          >
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Menu</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={24} color="#9CA3AF" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Main Navigation */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>NAVIGATION</Text>
              {menuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.menuItem}
                    onPress={onClose}
                  >
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: `${item.color}20` },
                      ]}
                    >
                      <Icon size={20} color={item.color} strokeWidth={2} />
                    </View>
                    <Text style={styles.menuItemText}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MORE</Text>
              {actionItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.menuItem}
                    onPress={onClose}
                  >
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: `${item.color}20` },
                      ]}
                    >
                      <Icon size={20} color={item.color} strokeWidth={2} />
                    </View>
                    <Text style={styles.menuItemText}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>FitTracker v1.0.0</Text>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    flexDirection: "row",
  },
  drawer: {
    backgroundColor: "#1F2937",
    height: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 1,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#6B7280",
  },
});
