import React, { useRef, useEffect } from "react";
import { TouchableOpacity, Text, View, Animated } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { colors, icons } from "@/src/theme/tokens";
import { styles } from "./styles";
import { SectionKey } from "./constants";

interface SectionHeaderProps {
  title: string;
  sectionKey: SectionKey;
  isExpanded: boolean;
  hasError: boolean;
  onPress: () => void;
  /** One line describing what is inside, shown while collapsed. */
  summary?: string;
}

// Collapsible accordion section header with a rotating chevron.
//
// The summary is the whole point of the header: six identical closed boxes
// meant you had to open every one to find out which held anything. It is
// hidden while expanded, where the contents speak for themselves.
export function SectionHeader({ title, isExpanded, hasError, onPress, summary }: SectionHeaderProps) {
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
      <View style={styles.sectionHeaderText}>
        <Text style={[styles.sectionTitle, hasError && styles.sectionTitleError]}>{title}</Text>
        {!isExpanded && summary ? (
          <Text style={styles.sectionSummary} numberOfLines={1}>{summary}</Text>
        ) : null}
      </View>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <ChevronDown size={icons.md} color={hasError ? colors.danger : colors.text} />
      </Animated.View>
    </TouchableOpacity>
  );
}
