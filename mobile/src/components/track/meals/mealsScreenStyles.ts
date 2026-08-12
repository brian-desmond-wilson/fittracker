import { StyleSheet } from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

// Styles for MealsScreen (extracted from the screen component to keep it lean).
// MealsScreen does NOT adopt `ui/Screen` (its ScrollView owns a RefreshControl),
// so per the plan's gutter rule each top-level block carries the gutter itself,
// uniformly at `spacing.screenGutter`.
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  refreshIndicator: {
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    padding: spacing.xs,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  searchActionButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
  },
  /**
   * Paired with `mealsSection`'s `flexGrow`, this gives the scroller a
   * definite height so `MealsDayList`'s `EmptyState`/`LoadingState` (both
   * `flex: 1`) can fill the list region rather than collapsing onto their own
   * padding. Same pairing Tasks 5-6 put on their list content containers.
   */
  scrollContent: {
    flexGrow: 1,
  },
  dateNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  navArrow: {
    padding: spacing.sm,
  },
  navArrowDisabled: {
    opacity: 0.5,
  },
  dateText: {
    ...typography.titleBar,
    color: colors.text,
  },
  tabsContainer: {
    paddingHorizontal: spacing.screenGutter,
    marginBottom: spacing.lg,
  },
  tabsTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.control,
  },
  tabPillActive: {
    backgroundColor: colors.brand,
  },
  tabPillText: {
    ...typography.buttonSm,
    color: colors.textMuted,
  },
  tabPillTextActive: {
    color: colors.onBrand,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  titleShareButton: {
    marginLeft: "auto",
    padding: spacing.sm,
  },
  pageTitle: {
    ...typography.titleRoot,
    color: colors.text,
  },
  /** Gutter wrapper for the screen's full-width `Button` rows. */
  actionRow: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.lg,
  },
  /** Gutter + spacing for the pace-coach / suggested-now block. */
  paceWrap: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.md,
  },
  addSection: {
    paddingHorizontal: spacing.screenGutter,
    marginBottom: spacing.xxl,
  },
  subsectionTitle: {
    ...typography.section,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  field: {
    marginBottom: spacing.lg,
  },
  halfField: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  // The one form-label token. `inputLabel` was a byte-identical twin used
  // interchangeably inside the same component; both call sites point here.
  label: {
    ...typography.section,
    marginBottom: spacing.sm,
  },
  required: {
    color: colors.danger,
  },
  dateButton: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  mealTypeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  mealTypeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label
  // (the standing active-state rule for segment groups).
  mealTypeButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  mealTypeButtonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  mealTypeButtonTextActive: {
    color: colors.onBrand,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  formButtons: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  formButton: {
    flex: 1,
  },
  mealsSection: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenGutter,
  },
  // Matches "SUGGESTED NOW" and "QUICK ADD" above it, so the tab reads as
  // three labelled groups instead of a stack of unrelated blocks.
  loggedHeader: {
    ...typography.section,
    marginBottom: spacing.md,
  },
  mealTypeSection: {
    marginBottom: spacing.xl,
  },
  mealTypeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  // Not a `Badge`: the fill is the meal type's own identity color, which the
  // primitive's tone set cannot express. Geometry matches `Badge`.
  mealTypeBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  mealTypeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  /** Placement the `Card row` primitive can't express. */
  mealCardSpacing: {
    marginBottom: spacing.md,
  },
  mealCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  mealTime: {
    ...typography.caption,
  },
  searchResultsSpacing: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.md,
  },
  searchResultsHeader: {
    ...typography.section,
    marginBottom: spacing.sm,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.control,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchResultName: {
    ...typography.buttonSm,
    color: colors.text,
  },
  searchResultBrand: {
    ...typography.caption,
  },
  searchResultCals: {
    ...typography.body,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  distributionWrap: {
    marginHorizontal: spacing.screenGutter,
  },
  mealName: {
    ...typography.rowTitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  mealNutrition: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  nutritionText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
