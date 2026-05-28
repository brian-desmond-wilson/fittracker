import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WODDetailScreen } from '@/src/components/training/crossfit/WODDetailScreen';

export default function WODDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  if (!id) {
    return null;
  }

  return (
    <WODDetailScreen
      wodId={id}
      // Always land on Training index — router.back() would walk linear
      // history if entered from outside the Training tab.
      onClose={() => router.replace("/(tabs)/training")}
    />
  );
}
