import { StyleSheet } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";

// Styles for EditFoodScreen (extracted from the screen component).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  backText: {
    fontSize: 17,
    color: colors.text,
  },
  headerTitle: {
    ...typography.titleBar,
    color: colors.text,
  },
  content: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // The `Card variant="panel"` recipe inlined: the accordion header has to sit
  // flush to the card edge (and `sectionContent` carries its own padding), so
  // the section can't take the primitive's fixed internal padding.
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.panel,
    marginHorizontal: spacing.screenGutter,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionHeaderError: {
    backgroundColor: tint(colors.danger),
  },
  sectionTitle: {
    ...typography.rowTitle,
    color: colors.text,
  },
  sectionTitleError: {
    color: colors.danger,
  },
  sectionContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  sectionSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.lg,
  },
  fieldHalf: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  label: {
    ...typography.body,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  required: {
    color: colors.danger,
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
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  textArea: {
    height: 100,
    paddingTop: spacing.md,
  },
  pickerButton: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pickerButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  placeholder: {
    color: colors.textFaint,
  },
  locationButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  locationButton: {
    flex: 1,
    // Control padding rounds UP off-grid (was 10): tap targets never shrink.
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  locationButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  locationButtonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  locationButtonTextActive: {
    color: colors.onBrand,
  },
  storageTypeButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  storageTypeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  storageTypeButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  storageTypeButtonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  storageTypeButtonTextActive: {
    color: colors.onBrand,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: colors.brand,
  },
  toggleThumb: {
    width: 27,
    height: 27,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  helpText: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  errorBox: {
    backgroundColor: tint(colors.danger),
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.control,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: "600",
    textAlign: "center",
  },
  locationEntryCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.row,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  locationEntryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  locationEntryRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  locationEntryField: {
    flex: 1,
  },
  locationEntryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  locationEntryButtons: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  locationEntryButton: {
    flex: 1,
    // Rounds UP off-grid (was 6) — see `locationButton`.
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  locationEntryButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  locationEntryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  locationEntryButtonTextActive: {
    color: colors.onBrand,
  },
  locationEntryInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  removeLocationButton: {
    padding: spacing.xs,
  },
  statusButton: {
    flex: 1,
    // Rounds UP off-grid (was 6) — see `locationButton`.
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  statusButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  statusButtonTextActive: {
    color: colors.onBrand,
  },
  clearButton: {
    marginTop: spacing.sm,
  },
  clearButtonText: {
    ...typography.buttonSm,
    color: colors.danger,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  imageContainer: {
    width: "48%",
    position: "relative",
  },
  // Photo well — white is the documented exception (spec §4.1).
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.imageWell,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.row,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageWithPhoto: {
    borderStyle: "solid",
    borderColor: colors.border,
  },
  productImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imagePlaceholderText: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textFaint,
  },
  removeImageButton: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    padding: spacing.xs,
    zIndex: 10,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerButton: {
    flex: 1,
  },
  pickerModal: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
  },
  pickerContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    paddingTop: spacing.xl,
    maxHeight: "50%",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  pickerOption: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerClose: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickerCloseText: {
    ...typography.button,
    color: colors.danger,
  },
  loadingText: {
    marginTop: spacing.sm,
    ...typography.body,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  datePickerModal: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  datePickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    width: "100%",
    paddingBottom: 34,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  datePickerDone: {
    ...typography.button,
    color: colors.brand,
  },
  // Category/Subcategory Styles
  categoryList: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  categoryItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface2,
  },
  categoryCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  categoryName: {
    ...typography.rowTitle,
    color: colors.text,
  },
  categoryNameSelected: {
    color: colors.brand,
  },
  expandButton: {
    padding: spacing.xs,
  },
  subcategoryList: {
    paddingLeft: spacing.xxl,
    paddingRight: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  subcategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    marginTop: spacing.xs,
    backgroundColor: colors.surface2,
  },
  subcategoryName: {
    ...typography.body,
    color: colors.textMuted,
  },
  subcategoryNameSelected: {
    color: colors.brand,
    fontWeight: "600",
  },
});
