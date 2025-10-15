import { supabase } from '../lib/supabase';
import {
  MorningRoutineTemplate,
  MorningRoutineTask,
  MorningRoutineCompletion,
  MorningRoutineWithTasks,
  MorningRoutineProgress,
  TaskCompletionData,
} from '../types/morning-routine';
import {
  DEFAULT_ROUTINE_NAME,
  DEFAULT_TARGET_TIME,
  DEFAULT_MORNING_TASKS,
} from '../config/defaultMorningRoutine';

/**
 * Get or create default morning routine template for user
 */
export async function getOrCreateDefaultRoutine(
  userId: string
): Promise<MorningRoutineWithTasks | null> {
  try {
    // Check if user already has a default routine
    const { data: existingTemplate } = await supabase
      .from('morning_routine_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single();

    if (existingTemplate) {
      // Fetch tasks for this template
      const { data: tasks } = await supabase
        .from('morning_routine_tasks')
        .select('*')
        .eq('template_id', existingTemplate.id)
        .order('order_index');

      return {
        ...existingTemplate,
        tasks: tasks || [],
      };
    }

    // Create new default routine template
    const { data: newTemplate, error: templateError } = await supabase
      .from('morning_routine_templates')
      .insert({
        user_id: userId,
        name: DEFAULT_ROUTINE_NAME,
        is_default: true,
        target_completion_time: DEFAULT_TARGET_TIME,
      })
      .select()
      .single();

    if (templateError || !newTemplate) {
      console.error('Error creating template:', templateError);
      return null;
    }

    // Create default tasks
    const tasksToInsert = DEFAULT_MORNING_TASKS.map((task, index) => ({
      template_id: newTemplate.id,
      title: task.title,
      description: task.description,
      order_index: index,
      estimated_minutes: task.estimated_minutes,
      is_required: task.is_required,
      task_type: task.task_type,
      checklist_items: task.checklist_items || null,
    }));

    const { data: createdTasks, error: tasksError } = await supabase
      .from('morning_routine_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error('Error creating tasks:', tasksError);
      return null;
    }

    return {
      ...newTemplate,
      tasks: createdTasks || [],
    };
  } catch (error) {
    console.error('Error in getOrCreateDefaultRoutine:', error);
    return null;
  }
}

/**
 * Start a new morning routine session
 */
export async function startMorningRoutine(
  userId: string,
  templateId: string
): Promise<MorningRoutineCompletion | null> {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Check if routine already exists for today
    const { data: existing } = await supabase
      .from('morning_routine_completions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .single();

    if (existing) {
      return existing;
    }

    // Create new routine completion
    const { data, error } = await supabase
      .from('morning_routine_completions')
      .insert({
        user_id: userId,
        template_id: templateId,
        date: dateStr,
        started_at: new Date().toISOString(),
        tasks_completed: [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error starting routine:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in startMorningRoutine:', error);
    return null;
  }
}

/**
 * Get today's morning routine progress
 */
export async function getTodayRoutineProgress(
  userId: string
): Promise<MorningRoutineCompletion | null> {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const { data } = await supabase
      .from('morning_routine_completions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .single();

    return data || null;
  } catch (error) {
    console.error('Error getting today routine:', error);
    return null;
  }
}

/**
 * Update task completion
 */
export async function updateTaskCompletion(
  completionId: string,
  taskCompletionData: TaskCompletionData[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('morning_routine_completions')
      .update({
        tasks_completed: taskCompletionData,
      })
      .eq('id', completionId);

    if (error) {
      console.error('Error updating task completion:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateTaskCompletion:', error);
    return false;
  }
}

/**
 * Complete the morning routine
 */
export async function completeRoutine(completionId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // Get the routine to calculate total minutes
    const { data: routine } = await supabase
      .from('morning_routine_completions')
      .select('started_at')
      .eq('id', completionId)
      .single();

    if (!routine) {
      return false;
    }

    const startTime = new Date(routine.started_at);
    const endTime = new Date(now);
    const totalMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

    const { error } = await supabase
      .from('morning_routine_completions')
      .update({
        completed_at: now,
        total_minutes: totalMinutes,
      })
      .eq('id', completionId);

    if (error) {
      console.error('Error completing routine:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in completeRoutine:', error);
    return false;
  }
}

/**
 * Calculate routine progress
 */
export function calculateProgress(
  routine: MorningRoutineWithTasks,
  completion: MorningRoutineCompletion
): MorningRoutineProgress {
  const totalTasks = routine.tasks.length;
  const completedTasks = completion.tasks_completed.filter((t) => !t.skipped).length;
  const skippedTasks = completion.tasks_completed.filter((t) => t.skipped).length;
  const remainingTasks = totalTasks - completion.tasks_completed.length;

  // Calculate estimated time remaining
  const completedTaskIds = new Set(completion.tasks_completed.map((t) => t.task_id));
  const estimatedTimeRemaining = routine.tasks
    .filter((task) => !completedTaskIds.has(task.id))
    .reduce((total, task) => total + task.estimated_minutes, 0);

  // Calculate elapsed time
  const startTime = new Date(completion.started_at);
  const now = new Date();
  const elapsedTime = Math.round((now.getTime() - startTime.getTime()) / (1000 * 60));

  // Check if on track (compare elapsed time to estimated time for completed tasks)
  const completedTasksEstimated = routine.tasks
    .filter((task) => completedTaskIds.has(task.id))
    .reduce((total, task) => total + task.estimated_minutes, 0);

  const isOnTrack = elapsedTime <= completedTasksEstimated + 5; // 5 min buffer
  const minutesAheadOrBehind = completedTasksEstimated - elapsedTime;

  return {
    totalTasks,
    completedTasks,
    skippedTasks,
    remainingTasks,
    estimatedTimeRemaining,
    elapsedTime,
    isOnTrack,
    minutesAheadOrBehind,
  };
}
