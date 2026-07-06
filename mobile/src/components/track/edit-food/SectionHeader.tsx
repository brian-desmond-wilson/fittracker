import React, { useRef, useEffect } from "react";
import { TouchableOpacity, Text, Animated } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { styles } from "./styles";
import { SectionKey } from "./constants";

interface SectionHeaderProps {
  title: string;
  sectionKey: SectionKey;
  isExpanded: boolean;
  hasError: boolean;
  onPress: () => void;
}

// Collapsible accordion section header with a rotating chevron.
export function SectionHeader({ title, isExpanded, hasError, onPress }: SectionHeaderProps) {
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <TouchableOpacity
      style={[styles.sectionHeader, hasError && styles.sectionHeaderError]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.sectionTitle, hasError && styles.sectionTitleError]}>{title}</Text>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <ChevronDown size={20} color={hasError ? "#EF4444" : "#111827"} />
      </Animated.View>
    </TouchableOpacity>
  );
}
