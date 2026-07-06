import { StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

// Styles for the Workout Session screen (extracted from app/workout/[id].tsx).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#1f2937',
    borderRadius: 8,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  exerciseDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  exerciseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#374151',
  },
  exerciseDotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  exerciseDotCompleted: {
    backgroundColor: '#4ade80',
  },
  exerciseDotSummary: {
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Exercise Card
  exerciseCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  exerciseImageContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseImageReal: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  exerciseImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    borderStyle: 'dashed',
  },
  generateImageText: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  exerciseName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  exerciseTarget: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  lastPerformance: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },

  // Sets Section
  setsSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  setsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  setsSectionTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addWarmupText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  noWarmupsText: {
    color: '#6b7280',
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Set Rows - Completed (new design)
  setRowCompletedNew: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  deleteSwipeAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 10,
    marginBottom: 8,
  },
  deleteSwipeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  setRowCompletedMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  setNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4ade80',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberText: {
    color: '#0A0F1E',
    fontSize: 12,
    fontWeight: '700',
  },
  warmupBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warmupBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  setWeightReps: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  difficultyBadgeSmall: {
    backgroundColor: '#374151',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  difficultyBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  setDurationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  setDurationText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  restIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(107, 114, 128, 0.3)',
  },
  restIndicatorText: {
    color: '#6b7280',
    fontSize: 11,
  },
  // Legacy completed row (keeping for compatibility)
  setRowCompleted: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 8,
    marginBottom: 8,
  },
  setRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setLabel: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
  setCompletedText: {
    color: '#4ade80',
    fontSize: 14,
  },
  setRowPending: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    marginBottom: 8,
  },
  pendingCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4b5563',
  },
  setNumberBadgePending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberTextPending: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  warmupBadgePending: {
    backgroundColor: '#4b5563',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warmupBadgeTextPending: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
  },
  setLabelPending: {
    color: '#6b7280',
    fontSize: 14,
  },
  setPendingText: {
    color: '#6b7280',
    fontSize: 14,
  },
  setRowActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  setRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  setRowHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setNumberBadgeActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberTextActive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  warmupBadgeActive: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  warmupBadgeTextActive: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  timerStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  timerStartText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
  },
  timerRunning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  timerRunningText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  setLabelActive: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  suggestionRow: {
    marginBottom: 12,
  },
  suggestionText: {
    color: '#fbbf24',
    fontSize: 13,
  },

  // Inputs
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    width: 80,
    height: 48,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  inputLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  inputSeparator: {
    color: '#6b7280',
    fontSize: 20,
  },

  // Difficulty
  difficultyContainer: {
    marginBottom: 12,
  },
  difficultyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  difficultyButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  difficultyButtonCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  difficultyButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  difficultyButtonText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  difficultyButtonTextCompact: {
    fontSize: 11,
  },
  difficultyButtonTextActive: {
    color: '#fff',
  },
  increaseWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  increaseWeightText: {
    color: '#9ca3af',
    fontSize: 13,
  },

  // Log Set Button
  logSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logSetButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Notes
  notesSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  notesSectionTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Exercise Difficulty
  exerciseDifficultySection: {
    marginTop: 16,
  },

  // Bottom Actions
  bottomActions: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  nextButton: {
    backgroundColor: colors.primary,
  },
  completedButton: {
    backgroundColor: '#059669',
  },
  finishButton: {
    backgroundColor: '#059669',
  },

  // Summary View Styles
  summaryCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  summarySubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  summaryList: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  summaryRowContent: {
    flex: 1,
  },
  summaryExerciseName: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '500',
  },
  summarySetCount: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 2,
  },
  summaryButtons: {
    marginTop: 24,
    gap: 12,
  },
  doneForTodayButton: {
    backgroundColor: colors.secondary,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // Rest Timer Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restTimerModal: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    minWidth: 280,
  },
  restTimerTitle: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 16,
  },
  restTimerTime: {
    color: '#fff',
    fontSize: 64,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  restTimerButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  restTimerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
