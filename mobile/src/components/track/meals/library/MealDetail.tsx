// mobile/src/components/track/meals/library/MealDetail.tsx
//
// One meal, as a page you read top to bottom: a photograph, the line that says
// whether you can have it, where it is filed, what is in it, then the reference
// material and the things you can do.
//
// The order is the decision order. What used to be here was the order the data
// happened to be in — name, ingredients, score breakdown, a logging form — so
// the five score bars arrived before the score and the ingredient problems
// arrived after everything else, as three lists of names you had to match up
// against the rows above them.
//
// The whole face turns over, not just the picture: the Nutrition Facts panel is
// the back of the packet for the WHOLE meal, and a panel inside a 232pt hero
// would be unreadable. Same control, same corner, on both faces.
import React, { useMemo, useRef, useState } from "react";
import { Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, FlipHorizontal, Link2, ShoppingCart } from "lucide-react-native";
import type { MealWithItems } from "@/src/types/meal-library";
import { defaultMealTypeFor, toggleCategory, type MealCategory } from "@/src/types/meal-library";
import type { MealType } from "@/src/types/track";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import { COMPONENT_MAX, RAW_MAX } from "@/src/lib/mealScore";
import type { MealAssemblability } from "@/src/lib/stockState";
import type { MealIngredient, MealNutrition } from "@/src/lib/mealLibraryView";
import { substitutionLine } from "@/src/lib/mealLibraryView";
import { buildNutritionLabel } from "@/src/lib/nutritionLabel";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { Badge, Button } from "@/src/components/ui";
import { NutritionFactsCard } from "@/src/components/track/NutritionFactsCard";
import { MealHero } from "./MealHero";
import { MealIngredientRow } from "./MealIngredientRow";
import { CategoryRail } from "./CategoryRail";
import { MealLogCard, PORTIONS, type Portion } from "./MealLogCard";
import { historyLine } from "./MealLibraryRow";

interface MealDetailProps {
  meal: MealWithItems;
  nutrition: MealNutrition;
  ingredients: MealIngredient[];
  score: BrianScoreResult;
  assemblability?: MealAssemblability;
  timesLogged: number;
  lastLoggedDate: string | null;
  faceUrl: string | null;
  logging: boolean;
  /** True while a category or the star is being written. */
  saving: boolean;
  onToggleFavorite: () => void;
  onToggleCategory: (next: MealCategory[]) => void;
  /** B2: hand the missing ingredient names to the shopping list. */
  onAddMissing: (names: string[]) => void;
  /** D4: open the concept picker for an ingredient nothing could match. */
  onLinkIngredient: (savedFoodName: string) => void;
  onOpenProduct: (inventoryId: string) => void;
  addingToList: boolean;
  addedToList: boolean;
  onLog: (meal: MealWithItems, opts: { mealType: MealType; portion: number; daysAgo: number }) => void;
  onArchive: (meal: MealWithItems, archived: boolean) => void;
  onDelete: (meal: MealWithItems) => void;
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel}>{label}</Text>
      <Text style={s.barValue}>{Math.round(value * 10) / 10}/{max}</Text>
      <View style={s.track}>
        <View style={[s.fill, { width: `${(value / max) * 100}%` }]} />
      </View>
    </View>
  );
}

const FLIP_MS = 320;

export function MealDetail({
  meal, nutrition, ingredients, score, assemblability, timesLogged, lastLoggedDate,
  faceUrl, logging, saving, onToggleFavorite, onToggleCategory, onAddMissing,
  onLinkIngredient, onOpenProduct, addingToList, addedToList, onLog,
  onArchive, onDelete,
}: MealDetailProps) {
  const [mealType, setMealType] = useState<MealType>(defaultMealTypeFor(meal));
  const [portion, setPortion] = useState<Portion>(PORTIONS[1]);
  const [daysAgo, setDaysAgo] = useState(0);
  const [scoreOpen, setScoreOpen] = useState(false);

  // Two faces in one box, each hiding its own back. `showingBack` flips at the
  // halfway point rather than at the end, so the control the user is looking
  // at belongs to the face that is arriving.
  const [showingBack, setShowingBack] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const toggleFlip = () => {
    const next = showingBack ? 0 : 1;
    setTimeout(() => setShowingBack(!showingBack), FLIP_MS / 2);
    Animated.timing(flip, { toValue: next, duration: FLIP_MS, useNativeDriver: true }).start();
  };
  const frontSpin = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backSpin = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  const totals = nutrition.totals;
  const history = historyLine(timesLogged, lastLoggedDate, new Date());
  const subs = substitutionLine(nutrition);
  const archived = meal.archived_at !== null;

  // The panel is the whole meal totalled, so its serving size has to say so —
  // "1 meal" beside 400 cal is otherwise read as one ingredient's worth.
  const labelSource = useMemo(() => ({
    serving_size: `1 meal (${meal.items.length} ingredient${meal.items.length === 1 ? "" : "s"})`,
    calories: Math.round(totals.calories),
    protein: totals.protein,
    carbs: totals.carbs,
    fats: totals.fats,
    sugars: totals.sugars,
    fiber_g: totals.fiber_g,
  }), [meal.items.length, totals]);
  const panelIsEmpty = buildNutritionLabel(labelSource).rows.length === 0;

  const confirmDelete = () =>
    Alert.alert("Delete meal", `Delete "${meal.name}" from your library?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(meal) },
    ]);

  const missing = assemblability?.missing ?? [];
  const unlinked = assemblability?.unlinked ?? [];
  const stockLine =
    assemblability === undefined ? null
    : missing.length > 0 ? { text: `Missing ${missing.length}`, tone: s.warnText }
    : unlinked.length > 0 ? { text: "Can't be checked", tone: s.faintText }
    : { text: "Ready to make", tone: s.okText };

  // The same control in the same place on both faces, so flipping back never
  // means hunting for it. Suppressed when the panel would have no rows at all.
  const flipButton = panelIsEmpty ? null : (
    <TouchableOpacity
      onPress={toggleFlip}
      style={s.flipBtn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={showingBack ? "Back to the meal" : "Show nutrition facts for the whole meal"}
    >
      <FlipHorizontal size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
    </TouchableOpacity>
  );

  return (
    <View style={s.flipArea}>
      <Animated.View
        style={[s.face, { transform: [{ perspective: 1200 }, { rotateY: frontSpin }] }]}
        pointerEvents={showingBack ? "none" : "auto"}
      >
        <ScrollView contentContainerStyle={s.scroll}>
          <MealHero
            name={meal.name}
            score={score.score}
            faceUrl={faceUrl}
            isFavorite={meal.is_favorite}
            onToggleFavorite={onToggleFavorite}
            macroLine={
              `${Math.round(totals.calories)} cal · ${Math.round(totals.protein)}g protein`
              + ` · ${Math.round(totals.fiber_g)}g fiber`
              + (meal.prep_minutes > 0 ? ` · ${meal.prep_minutes} min` : "")
            }
            sourceLine={
              [meal.source_name, meal.is_complete_portion ? "complete portion" : null]
                .filter(Boolean).join(" · ") || null
            }
            corner={flipButton}
          />

          {/* The page's only summary, and the only thing above the fold that
              decides a tap: can I make it, is anything about to turn, do I
              actually eat it. */}
          <View style={s.statusLine}>
            {stockLine && <Text style={[s.status, stockLine.tone]}>{stockLine.text}</Text>}
            {assemblability?.expiringItemName != null && (
              <>
                <Text style={s.dot}>·</Text>
                <Text style={[s.status, s.warnText]}>
                  {assemblability.expiringDaysLeft === 0
                    ? "uses food expiring today"
                    : `uses food expiring in ${assemblability.expiringDaysLeft}d`}
                </Text>
              </>
            )}
            {history && (
              <>
                <Text style={s.dot}>·</Text>
                <Text style={s.status}>{history}</Text>
              </>
            )}
          </View>

          <View style={s.body}>
            {archived && (
              <View style={s.archivedBanner}>
                <Text style={s.archivedText}>
                  Archived — kept out of the library and out of suggestions.
                </Text>
              </View>
            )}

            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>EATEN AS</Text>
                <Text style={s.hint}>tap to add or remove</Text>
              </View>
              <CategoryRail
                selected={meal.categories}
                primary={meal.category}
                busy={saving}
                onToggle={(c) => onToggleCategory(toggleCategory(meal.categories, c))}
              />
            </View>

            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>
                  INGREDIENTS · {meal.items.length}
                </Text>
                {meal.items.some((it) => it.small_pieces_ok) && (
                  <Text style={s.hint}>✂︎ already cut small — EoE-safe</Text>
                )}
              </View>

              {ingredients.map((ing) => (
                <MealIngredientRow
                  key={ing.item.id}
                  ingredient={ing}
                  onOpenProduct={onOpenProduct}
                />
              ))}

              {/* B2. Naming the gap and then making you retype it into the
                  shopping list by hand is most of the dead end. Name-only
                  rows: an unresolved ingredient has no inventory row to point
                  at, which is exactly what makes it missing. */}
              {missing.length > 0 && (
                <View style={s.rowAction}>
                  <Button
                    label={addedToList ? "Added to shopping list" : `Add ${missing.length} to shopping list`}
                    onPress={() => onAddMissing(missing)}
                    variant="secondary"
                    size="sm"
                    icon={ShoppingCart}
                    disabled={addedToList || addingToList}
                  />
                </View>
              )}

              {/* D4. Concept links decide what "ready", "missing" and "in
                  stock" MEAN, and they were invisible and unrepairable from
                  the app: a meal could sit permanently un-makeable with no
                  hint that the fix was one link. */}
              {unlinked.map((name) => (
                <View key={name} style={s.rowAction}>
                  <Button
                    label={`Link ${name}`}
                    onPress={() => onLinkIngredient(name)}
                    variant="secondary"
                    size="sm"
                    icon={Link2}
                  />
                </View>
              ))}

              {subs && <Text style={s.subNote}>{subs}</Text>}
            </View>

            {/* The number is the decision; the five components are the audit.
                Shut by default, and the two verdicts that are NOT audit — a
                "never" food, and taste we could not read — stay outside it. */}
            <View style={s.card}>
              <TouchableOpacity
                style={s.disclosure}
                onPress={() => setScoreOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: scoreOpen }}
                accessibilityLabel={scoreOpen ? "Hide the score breakdown" : "Show the score breakdown"}
              >
                <View style={s.disclosureLeft}>
                  <Text style={s.scoreHeadline}>Brian Score {score.score}/100</Text>
                  {score.approved && <Badge label="Brian Approved" tone="success" />}
                </View>
                {scoreOpen
                  ? <ChevronUp size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
                  : <ChevronDown size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />}
              </TouchableOpacity>

              {score.containsNever && (
                <Text style={s.neverFlag}>Contains a food rated “never”</Text>
              )}
              {score.tasteUnknown && (
                <Text style={s.faintNote}>
                  Taste unknown — no ingredient is linked to a rated food concept yet.
                </Text>
              )}

              {scoreOpen && (
                <>
                  <ScoreBar label="Taste" value={score.taste} max={COMPONENT_MAX.taste} />
                  <ScoreBar label="Convenience" value={score.convenience} max={COMPONENT_MAX.convenience} />
                  <ScoreBar label="Protein" value={score.protein} max={COMPONENT_MAX.protein} />
                  <ScoreBar label="EoE-friendly" value={score.eoe} max={COMPONENT_MAX.eoe} />
                  <ScoreBar label="Calories" value={score.calories} max={COMPONENT_MAX.calories} />
                  <Text style={s.faintNote}>
                    {score.raw} of {RAW_MAX} possible, rescaled to {score.score}. Cost isn&apos;t
                    scored yet — no price data.
                  </Text>
                </>
              )}
            </View>

            <MealLogCard
              portion={portion}
              onPortion={setPortion}
              daysAgo={daysAgo}
              onDaysAgo={setDaysAgo}
              mealType={mealType}
              onMealType={setMealType}
              calories={Math.round(totals.calories * portion)}
              logging={logging}
              onLog={() => onLog(meal, { mealType, portion, daysAgo })}
            />

            {/* No Edit here: the header carries it, in the same slot the
                product page keeps its own. Two of them made the footer read
                as three equal choices when one of them is where you go to
                change the meal and the other two end its life. */}
            <View style={s.actions}>
              <Button
                label={archived ? "Unarchive" : "Archive"}
                variant="secondary"
                icon={archived ? ArchiveRestore : Archive}
                onPress={() => onArchive(meal, !archived)}
              />
              <Button label="Delete" variant="destructive" onPress={confirmDelete} />
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      <Animated.View
        style={[s.face, s.backFace, { transform: [{ perspective: 1200 }, { rotateY: backSpin }] }]}
        pointerEvents={showingBack ? "auto" : "none"}
      >
        <NutritionFactsCard item={labelSource} corner={flipButton} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  // Clipped and given its own stacking context: without it the rotation's
  // compositing bleeds over the header rule above.
  flipArea: { flex: 1, overflow: "hidden", zIndex: 0 },
  face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden" },
  backFace: { padding: spacing.screenGutter },
  scroll: { paddingBottom: spacing.xxl },

  statusLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.md,
  },
  status: { ...typography.caption },
  okText: { color: colors.brand, fontWeight: "600" },
  warnText: { color: colors.warning, fontWeight: "600" },
  faintText: { color: colors.textFaint, fontWeight: "600" },
  dot: { ...typography.caption, color: colors.textFaint },

  body: { padding: spacing.screenGutter, gap: spacing.md },

  archivedBanner: {
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    padding: spacing.md,
  },
  archivedText: { ...typography.caption, color: colors.textMuted },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.row,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  hint: { ...typography.caption, color: colors.textFaint, flexShrink: 1, textAlign: "right" },
  rowAction: { alignSelf: "flex-start" },
  subNote: { ...typography.caption, color: colors.macros.under },

  disclosure: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  disclosureLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  scoreHeadline: { ...typography.rowTitle, color: colors.text },
  neverFlag: { ...typography.caption, fontWeight: "700", color: colors.danger },
  faintNote: { ...typography.caption, color: colors.textFaint },

  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { ...typography.body, color: colors.textMuted, width: 104 },
  barValue: { ...typography.caption, color: colors.textFaint, width: 52 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.brand },

  actions: { flexDirection: "row", gap: spacing.sm },

  flipBtn: {
    width: 34, height: 34, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
});
