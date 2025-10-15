import { DefaultTaskConfig } from '../types/morning-routine';

export const DEFAULT_ROUTINE_NAME = 'My Morning Routine';
export const DEFAULT_TARGET_TIME = '07:00:00'; // 7:00 AM

export const DEFAULT_MORNING_TASKS: DefaultTaskConfig[] = [
  {
    title: 'Brush Teeth',
    description: 'Brush your teeth and get ready for the day',
    estimated_minutes: 2,
    is_required: true,
    task_type: 'simple',
  },
  {
    title: 'Record Weight',
    description: 'Step on the scale and record your weight',
    estimated_minutes: 1,
    is_required: true,
    task_type: 'weight_entry',
  },
  {
    title: 'Take Medications',
    description: 'Take your daily medications',
    estimated_minutes: 2,
    is_required: true,
    task_type: 'checklist',
    checklist_items: [
      'Vitamin D',
      'Multivitamin',
      'Other supplements',
    ],
  },
  {
    title: 'Walk the Dog',
    description: 'Take your dog for a morning walk',
    estimated_minutes: 15,
    is_required: false,
    task_type: 'simple',
  },
  {
    title: 'Feed the Dog',
    description: 'Feed your dog breakfast',
    estimated_minutes: 3,
    is_required: false,
    task_type: 'simple',
  },
  {
    title: 'Quick Breakfast',
    description: 'Eat a quick, healthy breakfast',
    estimated_minutes: 10,
    is_required: false,
    task_type: 'simple',
  },
  {
    title: 'Pack for Gym',
    description: 'Pack everything you need for the gym',
    estimated_minutes: 5,
    is_required: false,
    task_type: 'checklist',
    checklist_items: [
      'Water bottle',
      'Gym towel',
      'Workout clothes',
      'Headphones',
    ],
  },
];

export const calculateTotalEstimatedTime = (): number => {
  return DEFAULT_MORNING_TASKS.reduce((total, task) => total + task.estimated_minutes, 0);
};
