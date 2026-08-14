// The rail: Fuel's one chronological read of the day (Direction A).
//
// Receipts above the NOW line, plan below it. Dumb on purpose — every row
// arrives pre-decided from `buildFuelRail` (pure, tested); this file only
// draws. The NOW line is the page's single orange line: meals-accent as
// identity (rule 2), never a control.
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button, Card, IconButton } from "@/src/components/ui";
import { monogram } from "@/src/lib/vendorMonogram";
import type {
  AttributedLog,
  FuelPick,
  FuelProjection,
  FuelRailRow,
  FuelWindow,
} from "@/src/lib/fuelPlan";

interface FuelRailProps {
  rows: FuelRailRow[];
  /** Meal id currently quick-logging (its Log button shows the spinner). */
  loggingMealId: string | null;
  /** Borrowed product photo per logged row (log id → url), so receipts carry
   *  the same face their meal did. Missing entries fall back to initials. */
  logFaceById: Map<string, string | null>;
  onPressLog: (logId: string) => void;
  onDeleteLog: (logId: string) => void;
  /** Ghost rows: a missed window (retro into its slot) or the generic
   *  "ate something earlier" row (null). */
  onRetro: (window: FuelWindow | null) => void;
  onQuickLog: (mealId: string) => void;
  /** Open the library — at a meal when swapping a pick, at the list when
   *  reached from an empty slot. */
  onOpenLibrary: (mealId: string | null) => void;
}

function fmtMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}


function Face({ url, name, small }: { url: string | null; name: string; small?: boolean }) {
  return (
    <View style={[s.face, small && s.faceSm]}>
      {url ? (
        <Image source={{ uri: url }} style={s.faceImage} resizeMode="cover" />
      ) : (
        <Text style={s.faceInitials}>{monogram(name)}</Text>
      )}
    </View>
  );
}

function LoggedRow({
  log,
  windowLabel,
  faceUrl,
  onPress,
  onDelete,
}: {
  log: AttributedLog;
  windowLabel: string | null;
  faceUrl: string | null;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={s.stop}>
      <View style={[s.dot, s.dotDone]} />
      <Text style={s.stamp}>
        {fmtMinutes(log.loggedAtMinutes)}
        {windowLabel ? ` · ${windowLabel.toUpperCase()}` : ""}
      </Text>
      <Card variant="row" onPress={onPress}>
        <View style={s.rowLine}>
          <Face url={faceUrl} name={log.name} />
          <View style={s.rowBody}>
            <Text style={s.rowTitle} numberOfLines={1}>
              {log.name}
            </Text>
            <Text style={s.rowMeta}>
              {Math.round(log.calories)} cal · {Math.round(log.protein)}g P · logged
            </Text>
          </View>
          <Check size={icons.md} color={colors.brand} strokeWidth={icons.strokeWidth} />
          <IconButton
            icon={Trash2}
            weight="secondary"
            tone="danger"
            onPress={onDelete}
            accessibilityLabel={`Delete ${log.name}`}
          />
        </View>
      </Card>
    </View>
  );
}

/**
 * The mock's "next decision is the biggest card" rule: only the IMMINENT
 * suggestion gets the full treatment — face, reasons, big Log + Swap. Every
 * later window renders compact: face, name, numbers (portion note inline),
 * and a ghost Log on the right.
 */
function SuggestionRow({
  window,
  pick,
  closingSoon,
  primary,
  loggingMealId,
  onQuickLog,
  onOpenLibrary,
}: {
  window: FuelWindow;
  pick: FuelPick;
  closingSoon: boolean;
  primary: boolean;
  loggingMealId: string | null;
  onQuickLog: (mealId: string) => void;
  onOpenLibrary: (mealId: string | null) => void;
}) {
  const stamp = (
    <Text style={s.stamp}>
      {fmtMinutes(window.startMinutes)} · {window.label.toUpperCase()}
      {closingSoon ? " — window closes soon" : ""}
    </Text>
  );

  if (!primary) {
    return (
      <View style={s.stop}>
        <View style={[s.dot, s.dotSuggestion]} />
        {stamp}
        <Card variant="row" onPress={() => onOpenLibrary(pick.mealId)}>
          <View style={s.rowLine}>
            <Face url={pick.faceUrl} name={pick.name} small />
            <View style={s.rowBody}>
              <Text style={s.rowTitle} numberOfLines={1}>
                {pick.name}
              </Text>
              <Text style={s.rowMeta} numberOfLines={2}>
                {Math.round(pick.calories)} cal · {Math.round(pick.protein)}g P
                {pick.reasons.length > 0 ? (
                  <Text style={s.reasonInline}> · {pick.reasons.join(" · ")}</Text>
                ) : null}
              </Text>
            </View>
            <Button
              label="Log"
              size="sm"
              variant="ghost"
              loading={loggingMealId === pick.mealId}
              onPress={() => onQuickLog(pick.mealId)}
            />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={s.stop}>
      <View style={[s.dot, s.dotSuggestion]} />
      {stamp}
      <Card variant="row" onPress={() => onOpenLibrary(pick.mealId)}>
        <View style={s.rowLine}>
          <Face url={pick.faceUrl} name={pick.name} />
          <View style={s.rowBody}>
            <Text style={s.rowTitle} numberOfLines={2}>
              {pick.name}
            </Text>
            <Text style={s.rowMeta}>
              {Math.round(pick.calories)} cal · {Math.round(pick.protein)}g P
              {pick.prepMinutes === 0 ? " · ready to eat" : ` · ${pick.prepMinutes} min prep`}
            </Text>
          </View>
        </View>
        {pick.reasons.length > 0 && (
          <Text style={s.reasons} numberOfLines={3}>
            {pick.reasons.join(" · ")}
          </Text>
        )}
        <View style={s.actionRow}>
          <View style={s.actionGrow}>
            <Button
              label="Log it"
              size="sm"
              fluid
              loading={loggingMealId === pick.mealId}
              onPress={() => onQuickLog(pick.mealId)}
            />
          </View>
          <Button
            label="Swap"
            size="sm"
            variant="ghost"
            onPress={() => onOpenLibrary(pick.mealId)}
          />
        </View>
      </Card>
    </View>
  );
}

/** The trailing phrase on the landing row, one per way the day can land. */
const LANDING_NOTE: Record<NonNullable<FuelProjection["miss"]> | "on_goal", string> = {
  on_goal: " — on goal ✓",
  over_calories: " — over goal",
  under_calories: " — short of goal",
  under_protein: " — short on protein",
};

export function FuelRail({
  rows,
  loggingMealId,
  logFaceById,
  onPressLog,
  onDeleteLog,
  onRetro,
  onQuickLog,
  onOpenLibrary,
}: FuelRailProps) {
  if (rows.length === 0) return null;
  const firstSuggestionIdx = rows.findIndex((r) => r.kind === "suggestion");
  return (
    <View style={s.rail}>
      {rows.map((row, i) => {
        switch (row.kind) {
          case "logged":
            return (
              <LoggedRow
                key={`log-${row.log.id}`}
                log={row.log}
                windowLabel={row.windowLabel}
                faceUrl={logFaceById.get(row.log.id) ?? null}
                onPress={() => onPressLog(row.log.id)}
                onDelete={() => onDeleteLog(row.log.id)}
              />
            );
          case "missed":
            return (
              <View key={`missed-${row.window.id}`} style={s.stop}>
                <View style={[s.dot, s.dotGhost]} />
                <Text style={s.stamp}>
                  {fmtMinutes(row.window.startMinutes)} · {row.window.label.toUpperCase()}
                </Text>
                <View style={s.missedCard}>
                  <View style={s.rowLine}>
                    <Text style={s.missedTitle}>{row.window.label}</Text>
                    <Badge tone="neutral" label="Missed" />
                  </View>
                  {row.note && <Text style={s.rowMeta}>{row.note}</Text>}
                  <TouchableOpacity
                    onPress={() => onRetro(row.window)}
                    activeOpacity={0.7}
                    style={s.ghostRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Log a late ${row.window.label}`}
                  >
                    <Text style={s.ghostText}>＋ Actually ate? Log it — the plan re-balances</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          case "retro":
            return (
              <View key="retro" style={s.stop}>
                <View style={[s.dot, s.dotGhost]} />
                <TouchableOpacity
                  onPress={() => onRetro(null)}
                  activeOpacity={0.7}
                  style={s.ghostRow}
                  accessibilityRole="button"
                  accessibilityLabel="Log something you ate earlier"
                >
                  <Text style={s.ghostText}>＋ Ate something else earlier? Add it here</Text>
                </TouchableOpacity>
              </View>
            );
          case "now":
            return (
              <View key="now" style={s.nowLine}>
                <View style={s.nowDot} />
                <Text style={s.nowText}>NOW · {fmtMinutes(row.sortMinutes)}</Text>
                <View style={s.nowRule} />
              </View>
            );
          case "suggestion":
            return (
              <SuggestionRow
                key={`sugg-${row.window.id}`}
                window={row.window}
                pick={row.pick}
                closingSoon={row.closingSoon}
                primary={i === firstSuggestionIdx}
                loggingMealId={loggingMealId}
                onQuickLog={onQuickLog}
                onOpenLibrary={onOpenLibrary}
              />
            );
          case "empty-slot":
            return (
              <View key={`empty-${row.window.id}`} style={s.stop}>
                <View style={[s.dot, s.dotSuggestion]} />
                <Text style={s.stamp}>
                  {fmtMinutes(row.window.startMinutes)} · {row.window.label.toUpperCase()}
                </Text>
                <Card variant="row">
                  <View style={s.rowLine}>
                    <Text style={[s.rowMeta, s.rowBody]}>
                      Nothing in your library fits this slot yet.
                    </Text>
                    <Button
                      label="Open library"
                      size="sm"
                      variant="ghost"
                      onPress={() => onOpenLibrary(null)}
                    />
                  </View>
                </Card>
              </View>
            );
          case "landing": {
            const p = row.projection;
            return (
              <View key="landing" style={s.stop}>
                <View style={[s.dot, p.onGoal ? s.dotDone : s.dotGhost]} />
                <View style={[s.landing, p.onGoal ? s.landingOk : s.landingShort]}>
                  <Text style={[s.landingText, { color: p.onGoal ? colors.success : colors.warning }]}>
                    Day lands: {p.calories.toLocaleString()} cal · {Math.round(p.protein)}g P
                    {LANDING_NOTE[p.miss ?? "on_goal"]}
                  </Text>
                </View>
              </View>
            );
          }
          default:
            return null;
        }
      })}
    </View>
  );
}

const RAIL_INSET = 26; // room for the spine + dots to the left of the cards

const s = StyleSheet.create({
  rail: {
    paddingLeft: RAIL_INSET,
    borderLeftWidth: 2,
    borderLeftColor: colors.surface2,
    marginLeft: spacing.xs,
    gap: spacing.md,
  },
  stop: { position: "relative" },
  dot: {
    position: "absolute",
    left: -RAIL_INSET - spacing.xs - 1, // centred on the 2px spine
    top: 14,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  dotDone: { backgroundColor: colors.brand },
  dotSuggestion: { backgroundColor: colors.surface2, borderColor: colors.textFaint },
  dotGhost: { backgroundColor: colors.bg, borderColor: colors.textFaint, borderStyle: "dashed" },

  stamp: { ...typography.caption, color: colors.textFaint, marginBottom: spacing.xs },

  rowLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.rowTitle, color: colors.text },
  rowMeta: { ...typography.caption, marginTop: 2 },

  face: {
    width: 44,
    height: 44,
    borderRadius: radii.control,
    backgroundColor: colors.imageWell,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  faceSm: { width: 36, height: 36 },
  faceImage: { width: "100%", height: "100%" },
  faceInitials: { ...typography.rowTitle, color: colors.labelInk },

  reasons: { ...typography.caption, color: colors.warning, marginTop: spacing.sm },
  reasonInline: { color: colors.warning },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionGrow: { flex: 1 },

  missedCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.row,
    padding: spacing.md,
    gap: spacing.xs,
  },
  missedTitle: { ...typography.rowTitle, color: colors.textMuted, flex: 1 },

  ghostRow: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.row,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  ghostText: { ...typography.caption, color: colors.textFaint },

  nowLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, position: "relative" },
  nowDot: {
    position: "absolute",
    left: -RAIL_INSET - spacing.xs - 1,
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.accents.meals,
  },
  nowText: {
    ...typography.caption,
    color: colors.accents.meals,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  nowRule: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.accents.meals },

  landing: {
    borderWidth: 1,
    borderRadius: radii.row,
    padding: spacing.md,
  },
  landingOk: { backgroundColor: tint(colors.success), borderColor: tint(colors.success, 0.3) },
  landingShort: { backgroundColor: tint(colors.warning), borderColor: tint(colors.warning, 0.3) },
  landingText: { ...typography.buttonSm },
});
