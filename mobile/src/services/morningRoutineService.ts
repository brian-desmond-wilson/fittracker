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

// ============================================================================
// ROUTINE TEMPLATE MANAGEMENT
// ============================================================================

/**
 * Get all routine templates for a user
 */
export async function getAllRoutineTemplates(
  userId: string
): Promise<MorningRoutineTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('morning_routine_templates')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllRoutineTemplates:', error);
    return [];
  }
}

/**
 * Get a single routine template with its tasks
 */
export async function getRoutineTemplate(
  templateId: string
): Promise<MorningRoutineWithTasks | null> {
  try {
    const { data: template, error: templateError } = await supabase
      .from('morning_routine_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      console.error('Error fetching template:', templateError);
      return null;
    }

    const { data: tasks, error: tasksError } = await supabase
      .from('morning_routine_tasks')
      .select('*')
      .eq('template_id', templateId)
      .order('order_index');

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return null;
    }

    return {
      ...template,
      tasks: tasks || [],
    };
  } catch (error) {
    console.error('Error in getRoutineTemplate:', error);
    return null;
  }
}

/**
 * Create a new routine template
 */
export async function createRoutineTemplate(
  userId: string,
  name: string,
  targetTime?: string
): Promise<MorningRoutineTemplate | null> {
  try {
    const { data, error } = await supabase
      .from('morning_routine_templates')
      .insert({
        user_id: userId,
        name,
        is_default: false,
        target_completion_time: targetTime || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createRoutineTemplate:', error);
    return null;
  }
}

/**
 * Update an existing routine template
 */
export async function updateRoutineTemplate(
  templateId: string,
  updates: {
    name?: string;
    is_default?: boolean;
    target_completion_time?: string | null;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('morning_routine_templates')
      .update(updates)
      .eq('id', templateId);

    if (error) {
      console.error('Error updating template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateRoutineTemplate:', error);
    return false;
  }
}

/**
 * Delete a routine template (cascades to delete all tasks)
 */
export async function deleteRoutineTemplate(
  templateId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('morning_routine_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('Error deleting template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteRoutineTemplate:', error);
    return false;
  }
}

/**
 * Duplicate a routine template with all its tasks
 */
export async function duplicateRoutineTemplate(
  templateId: string,
  newName: string
): Promise<MorningRoutineWithTasks | null> {
  try {
    // Get the original template with tasks
    const original = await getRoutineTemplate(templateId);
    if (!original) {
      return null;
    }

    // Create new template
    const { data: newTemplate, error: templateError } = await supabase
      .from('morning_routine_templates')
      .insert({
        user_id: original.user_id,
        name: newName,
        is_default: false,
        target_completion_time: original.target_completion_time,
      })
      .select()
      .single();

    if (templateError || !newTemplate) {
      console.error('Error creating duplicate template:', templateError);
      return null;
    }

    // Duplicate all tasks
    if (original.tasks.length > 0) {
      const tasksToInsert = original.tasks.map((task) => ({
        template_id: newTemplate.id,
        title: task.title,
        description: task.description,
        order_index: task.order_index,
        estimated_minutes: task.estimated_minutes,
        is_required: task.is_required,
        task_type: task.task_type,
        checklist_items: task.checklist_items,
      }));

      const { data: newTasks, error: tasksError } = await supabase
        .from('morning_routine_tasks')
        .insert(tasksToInsert)
        .select();

      if (tasksError) {
        console.error('Error duplicating tasks:', tasksError);
        return null;
      }

      return {
        ...newTemplate,
        tasks: newTasks || [],
      };
    }

    return {
      ...newTemplate,
      tasks: [],
    };
  } catch (error) {
    console.error('Error in duplicateRoutineTemplate:', error);
    return null;
  }
}

// ============================================================================
// ROUTINE TASK MANAGEMENT
// ============================================================================

/**
 * Create a new task in a routine template
 */
export async function createRoutineTask(
  templateId: string,
  task: {
    title: string;
    description?: string;
    estimated_minutes: number;
    is_required: boolean;
    task_type: string;
    checklist_items?: string[];
  }
): Promise<MorningRoutineTask | null> {
  try {
    // Get current max order_index
    const { data: existingTasks } = await supabase
      .from('morning_routine_tasks')
      .select('order_index')
      .eq('template_id', templateId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrderIndex = existingTasks && existingTasks.length > 0
      ? existingTasks[0].order_index + 1
      : 0;

    const { data, error } = await supabase
      .from('morning_routine_tasks')
      .insert({
        template_id: templateId,
        title: task.title,
        description: task.description || null,
        order_index: nextOrderIndex,
        estimated_minutes: task.estimated_minutes,
        is_required: task.is_required,
        task_type: task.task_type,
        checklist_items: task.checklist_items || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating task:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createRoutineTask:', error);
    return null;
  }
}

/**
 * Update an existing routine task
 */
export async function updateRoutineTask(
  taskId: string,
  updates: {
    title?: string;
    description?: string | null;
    estimated_minutes?: number;
    is_required?: boolean;
    task_type?: string;
    checklist_items?: string[] | null;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('morning_routine_tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) {
      console.error('Error updating task:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateRoutineTask:', error);
    return false;
  }
}

/**
 * Delete a routine task
 */
export async function deleteRoutineTask(taskId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('morning_routine_tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error('Error deleting task:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteRoutineTask:', error);
    return false;
  }
}

/**
 * Reorder routine tasks by updating their order_index
 */
export async function reorderRoutineTasks(
  templateId: string,
  orderedTaskIds: string[]
): Promise<boolean> {
  try {
    // Update each task with its new order_index
    const updates = orderedTaskIds.map((taskId, index) =>
      supabase
        .from('morning_routine_tasks')
        .update({ order_index: index })
        .eq('id', taskId)
        .eq('template_id', templateId)
    );

    const results = await Promise.all(updates);

    // Check if any updates failed
    const hasError = results.some((result) => result.error);
    if (hasError) {
      console.error('Error reordering tasks');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in reorderRoutineTasks:', error);
    return false;
  }
}
