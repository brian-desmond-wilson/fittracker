/**
 * React Hook: useTodaysWorkout
 * 
 * For use in React Native mobile app
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchTodaysWorkout } from '../lib/supabase/todaysWorkout';
import { TodaysWorkoutResponse } from '../types/training';

interface UseTodaysWorkoutResult {
  data: TodaysWorkoutResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTodaysWorkout(userId: string | undefined): UseTodaysWorkoutResult {
  const [data, setData] = useState<TodaysWorkoutResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setData({
        error: 'no_active_program',
        message: 'Not logged in',
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchTodaysWorkout(userId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch workout'));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch };
}
