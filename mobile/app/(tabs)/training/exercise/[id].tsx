import { TrainingItemDetailScreen } from '@/src/components/training/item-detail/TrainingItemDetailScreen';

export default function ExerciseDetailPage() {
  return (
    <TrainingItemDetailScreen
      noun="exercise"
      nounPlural="exercises"
      routeBase="/(tabs)/training/exercise"
    />
  );
}
