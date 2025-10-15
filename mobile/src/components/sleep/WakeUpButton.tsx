import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Sun } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BEDTIME_KEY = '@bedtime_timestamp';

interface WakeUpButtonProps {
  onWakeUp?: (sleepSessionId: string) => void;
}

export default function WakeUpButton({ onWakeUp }: WakeUpButtonProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [bedtime, setBedtime] = useState<string | null>(null);

  useEffect(() => {
    checkIfShouldShow();
  }, []);

  const checkIfShouldShow = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsVisible(false);
        return;
      }

      // Check if there's a stored bedtime from last night
      const storedBedtime = await AsyncStorage.getItem(BEDTIME_KEY);

      if (storedBedtime) {
        const bedtimeDate = new Date(storedBedtime);
        const now = new Date();

        // Check if bedtime was from yesterday or today (before current time)
        const hoursSinceBedtime = (now.getTime() - bedtimeDate.getTime()) / (1000 * 60 * 60);

        // Show wake up button if bedtime was within last 24 hours
        if (hoursSinceBedtime > 0 && hoursSinceBedtime < 24) {
          // Check if user already woke up today
          const todayDateStr = getDateString(now);

          const { data: existingSession } = await supabase
            .from('sleep_sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('date', todayDateStr)
            .single();

          if (!existingSession) {
            setIsVisible(true);
            setBedtime(storedBedtime);
          } else {
            // Already recorded wake up for today
            setIsVisible(false);
            // Clear the stored bedtime
            await AsyncStorage.removeItem(BEDTIME_KEY);
          }
        } else {
          // Bedtime too old, clear it
          await AsyncStorage.removeItem(BEDTIME_KEY);
          setIsVisible(false);
        }
      } else {
        setIsVisible(false);
      }
    } catch (error) {
      console.error('Error checking wake up visibility:', error);
      setIsVisible(false);
    }
  };

  const getDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const calculateSleepHours = (bedtimeStr: string, wakeTimeStr: string): number => {
    const bedtimeDate = new Date(bedtimeStr);
    const wakeTimeDate = new Date(wakeTimeStr);
    const diffMs = wakeTimeDate.getTime() - bedtimeDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.round(diffHours * 100) / 100; // Round to 2 decimal places
  };

  const handlePress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Error', 'You must be logged in to use this feature');
        return;
      }

      if (!bedtime) {
        Alert.alert('Error', 'No bedtime recorded');
        return;
      }

      const wakeTime = new Date();
      const wakeTimeStr = wakeTime.toISOString();
      const todayDateStr = getDateString(wakeTime);
      const totalHours = calculateSleepHours(bedtime, wakeTimeStr);

      // Create sleep session in database
      const { data: sleepSession, error } = await supabase
        .from('sleep_sessions')
        .insert({
          user_id: user.id,
          date: todayDateStr,
          bedtime: bedtime,
          wake_time: wakeTimeStr,
          total_hours: totalHours,
          manually_entered: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating sleep session:', error);
        Alert.alert('Error', 'Failed to record wake up. Please try again.');
        return;
      }

      // Clear stored bedtime
      await AsyncStorage.removeItem(BEDTIME_KEY);

      // Hide the button
      setIsVisible(false);

      // Notify parent component (which will open sleep quality modal)
      if (onWakeUp && sleepSession) {
        onWakeUp(sleepSession.id);
      }
    } catch (error) {
      console.error('Error recording wake up:', error);
      Alert.alert('Error', 'Failed to record wake up. Please try again.');
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Sun size={24} color="#FFFFFF" strokeWidth={2} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>Good Morning!</Text>
        <Text style={styles.subtitle}>Press to record wake up time</Text>
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
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
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
