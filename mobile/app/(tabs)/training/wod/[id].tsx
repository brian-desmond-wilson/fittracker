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
      onClose={() => router.back()}
    />
  );
}
