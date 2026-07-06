import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { CheckSquare, Square } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { styles } from "./styles";
import { DIFFICULTY_OPTIONS, getDifficultyColor } from "./helpers";

interface DifficultyPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  increaseWeight: boolean;
  onIncreaseWeightChange: (value: boolean) => void;
  compact?: boolean;
}

export function DifficultyPicker({
  value,
  onChange,
  increaseWeight,
  onIncreaseWeightChange,
  compact,
}: DifficultyPickerProps) {
  return (
    <View style={styles.difficultyContainer}>
      <View style={styles.difficultyRow}>
        {DIFFICULTY_OPTIONS.map((opt) => {
          const isSelected = value === opt;
          const color = getDifficultyColor(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.difficultyButton,
                isSelected && { backgroundColor: `${color}30`, borderColor: color },
                compact && styles.difficultyButtonCompact,
              ]}
              onPress={() => onChange(value === opt ? null : opt)}
            >
              <Text
                style={[
                  styles.difficultyButtonText,
                  isSelected && { color },
                  compact && styles.difficultyButtonTextCompact,
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.increaseWeightRow}
        onPress={() => onIncreaseWeightChange(!increaseWeight)}
      >
        {increaseWeight ? (
          <CheckSquare size={20} color={colors.primary} />
        ) : (
          <Square size={20} color="#6b7280" />
        )}
        <Text style={styles.increaseWeightText}>Add weight next time (^)</Text>
      </TouchableOpacity>
    </View>
  );
}
