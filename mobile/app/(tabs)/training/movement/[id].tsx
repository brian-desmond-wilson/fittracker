import { TrainingItemDetailScreen } from '@/src/components/training/item-detail/TrainingItemDetailScreen';

export default function MovementDetailPage() {
  return (
    <TrainingItemDetailScreen
      noun="movement"
      nounPlural="movements"
      routeBase="/(tabs)/training/movement"
      discipline="CrossFit"
    />
  );
}
