import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Moon } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BEDTIME_KEY = '@bedtime_timestamp';

interface GoingToBedButtonProps {
  onBedtimeSet?: (bedtime: string) => void;
}

export default function GoingToBedButton({ onBedtimeSet }: GoingToBedButtonProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasPressedToday, setHasPressedToday] = useState(false);

  useEffect(() => {
    checkVisibility();
    // Check every minute if visibility should change
    const interval = setInterval(checkVisibility, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkVisibility = async () => {
    // Check if current time is after 10 PM (22:00)
    const now = new Date();
    const currentHour = now.getHours();
    const isAfter10PM = currentHour >= 22;

    setIsVisible(isAfter10PM);

    // Check if user already pressed today
    if (isAfter10PM) {
      const todayStr = getTodayDateString();
      const lastBedtimeStr = await AsyncStorage.getItem(BEDTIME_KEY);

      if (lastBedtimeStr) {
        try {
          const lastBedtime = new Date(lastBedtimeStr);
          const lastBedtimeDate = getDateString(lastBedtime);
          setHasPressedToday(lastBedtimeDate === todayStr);
        } catch (error) {
          console.error('Error parsing bedtime:', error);
          setHasPressedToday(false);
        }
      }
    }
  };

  const getTodayDateString = (): string => {
    const now = new Date();
    return getDateString(now);
  };

  const getDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handlePress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Error', 'You must be logged in to use this feature');
        return;
      }

      const bedtime = new Date().toISOString();

      // Store bedtime locally
      await AsyncStorage.setItem(BEDTIME_KEY, bedtime);

      // Update UI
      setHasPressedToday(true);

      // Notify parent component
      if (onBedtimeSet) {
        onBedtimeSet(bedtime);
      }

      Alert.alert(
        'Good night!',
        'Sleep well! Press the Wake Up button when you wake up.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error setting bedtime:', error);
      Alert.alert('Error', 'Failed to record bedtime. Please try again.');
    }
  };

  if (!isVisible || hasPressedToday) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Moon size={24} color="#FFFFFF" strokeWidth={2} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>Going to Bed</Text>
        <Text style={styles.subtitle}>Press to track your sleep</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  iconContainer: {
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
