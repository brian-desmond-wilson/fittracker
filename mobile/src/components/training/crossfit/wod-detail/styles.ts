import { StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

// Styles for WODDetailScreen (extracted from the screen component).
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  errorText: {
    fontSize: 18,
    color: "#EF4444",
    marginBottom: 20,
  },

  // WOD Image Section
  // Hero Image Section with Overlay
  heroSection: {
    position: 'relative',
    width: '100%',
    height: 220,
    backgroundColor: '#1A1F2E',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 300,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroOverlayContent: {
    gap: 12,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroCategoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  heroCategoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  heroFormatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroFormatText: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },

  // Generate Image Section (when no image)
  generateImageSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  generateImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  generateImageText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },

  // Title Section (only for WODs without images)
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  wodTitle: {
    fontSize: 34,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  // Integrated Stats Row
  integratedStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 0,
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderTopColor: '#2D3748',
  },
  statColumn: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  statTextContainer: {
    alignItems: 'center',
    gap: 2,
  },
  statText: {
    fontSize: 11,
    color: colors.foreground,
    fontWeight: '600',
    textAlign: 'center',
  },
  kettlebellIcon: {
    width: 18,
    height: 18,
    tintColor: colors.primary,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },

  // Description
  descriptionSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: colors.mutedForeground,
    lineHeight: 24,
  },

  // Quick Stats Card (kept for backward compatibility, but no longer used)
  quickStatsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  quickStatsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748',
  },
  metaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary + '40',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '60',
  },
  metaBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  metaInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  metaInfoText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.foreground,
  },
  quickStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  quickStatItem: {
    alignItems: "center",
    gap: 8,
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  quickStatLabel: {
    fontSize: 13,
    color: colors.mutedForeground,
  },

  // Sections
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },

  // Scaling Section
  scalingSection: {
    marginBottom: 0,
  },
  scalingTabs: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  scalingTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    position: "relative",
  },
  scalingTabActive: {
    // Active styling handled by indicator
  },
  scalingTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  scalingTabTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  scalingTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  scalingDescription: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#1A1F2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  scalingDescText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },

  // Movements Section
  movementsSection: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  movementCard: {
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  movementCardContent: {
    flexDirection: 'row',
  },
  movementImageContainer: {
    width: 100,
    height: 120,
    backgroundColor: '#1A1F2E',
    position: 'relative',
  },
  verticalCategoryBadge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    transform: [{ rotate: '-90deg' }],
    width: 120,
    textAlign: 'center',
  },
  movementImage: {
    width: '100%',
    height: '100%',
  },
  movementPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D3748',
  },
  movementPlaceholderIcon: {
    fontSize: 40,
  },
  movementInfo: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  movementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  movementNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.primary,
  },
  movementName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    flex: 1,
  },
  movementCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primary + '30',
    borderRadius: 8,
  },
  movementCategoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  movementRepScheme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  movementRepText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  movementDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
    marginBottom: 8,
  },
  movementMetadataRow: {
    flexDirection: 'column',
    gap: 4,
    marginBottom: 0,
  },
  movementMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  movementMetaText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  movementBadges: {
    flexDirection: "row",
    gap: 6,
  },
  categoryBadgeSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryEmojiSmall: {
    fontSize: 16,
  },
  goalTypeBadgeSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  goalTypeEmojiSmall: {
    fontSize: 16,
  },
  movementDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2D3748',
    borderRadius: 8,
  },
  movementDetailText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  distanceContainer: {
    width: "100%",
    gap: 4,
  },
  distanceSecondary: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginLeft: 38,
  },
  distanceContext: {
    fontSize: 13,
    color: '#F59E0B',
    marginLeft: 38,
    fontStyle: "italic",
  },
  variationContainer: {
    marginTop: 12,
  },
  variationText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  movementNotes: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 12,
    lineHeight: 20,
  },
  notesIconButton: {
    padding: 4,
    marginLeft: 4,
  },
  notesExpandedContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  notesExpandedText: {
    fontSize: 13,
    color: colors.foreground,
    lineHeight: 20,
  },
  standardsContainer: {
    marginTop: 12,
  },
  standardsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
    marginBottom: 6,
  },
  standardsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  standardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#2D3748",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  standardText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
  },

  // Image Menu
  imageMenuButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 4,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.foreground,
    fontWeight: '500',
  },
});
