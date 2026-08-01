# FitTracker Style Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `src/theme/tokens.ts` + seven UI primitives, then migrate every nutrition/Track/Home surface to them — including converting the two light-themed screens to dark — per `docs/superpowers/specs/2026-08-01-fittracker-style-guide-design.md`.

**Architecture:** A flat typed token module (no provider, no runtime) consumed by seven thin primitives in `src/components/ui/`. Migration proceeds in bounded stages: dependencies first, worst offenders early, the 1,766-line Meals screen only after the pattern is proven. `src/lib/colors.ts` becomes a re-export shim so out-of-scope screens keep compiling untouched.

**Tech Stack:** React Native (Expo SDK 54), TypeScript strict, `StyleSheet.create`, lucide-react-native, Jest. **No database work anywhere in this plan** — purely visual; no migrations, no owner gates.

---

## ⛔ Preconditions

- Branch: create `style-guide/system` off `main`, which must include spec commit `3360d66` (and this plan's commit).
- Baseline: `cd mobile && npx tsc --noEmit` → 0 errors; `npm test` → all suites green. Record the counts; they must not regress (these tests never touch UI — they are a tripwire, not coverage).
- The spec is authoritative on values. This plan is authoritative on mechanics. Record every deviation found during review in the **⚠️ Execution amendments** section at the bottom, in the same commit as the fix.
- Migration tasks (5–10) are mechanical restyles: **zero behavior changes**. Handler logic, data fetching, and navigation must be byte-identical unless a task explicitly says otherwise.

### The grep gate (used in every migration task)

A migrated file is done when BOTH commands return nothing for that file:

```bash
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(|rgba\(' <file>       # no raw colors (tint()/tokens only)
grep -n 'from "@/src/lib/colors"' <file>                  # imports @/src/theme/tokens instead
```

### Simulator screenshot verification (controller-run, per migration task)

The dedicated sim is `iPhone 17 Pro (FitTracker)` UDID `3B0EBB05-97BE-4325-91D2-C28FFEA2EF11`; Metro on port **8090** (never 8081 — the owner's own sessions use it). If the dev client errors about a missing native module, rebuild: `cd mobile/ios && pod install && xcodebuild -workspace FitTracker.xcworkspace -scheme FitTracker -configuration Debug -destination "platform=iOS Simulator,id=3B0EBB05-97BE-4325-91D2-C28FFEA2EF11" -derivedDataPath build build`, then `xcrun simctl install 3B0EBB05-97BE-4325-91D2-C28FFEA2EF11 mobile/ios/build/Build/Products/Debug-iphonesimulator/FitTracker.app`.

```bash
cd mobile && npx expo start --dev-client --port 8090 &      # once
xcrun simctl launch 3B0EBB05-97BE-4325-91D2-C28FFEA2EF11 com.bwil0007.fittracker
xcrun simctl openurl 3B0EBB05-97BE-4325-91D2-C28FFEA2EF11 "fittracker://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8090"
# per screen: deep-link then screenshot
xcrun simctl openurl 3B0EBB05-97BE-4325-91D2-C28FFEA2EF11 "fittracker://track/shopping"
xcrun simctl io 3B0EBB05-97BE-4325-91D2-C28FFEA2EF11 screenshot /tmp/style-<task>-<screen>.png
```

Routes: `track` (hub), `track/meals`, `track/water`, `track/food-inventory`, `track/shopping`, `home`. Read each screenshot and check: dark background everywhere, green controls, accent glyphs, no clipped text. If the simulator is unavailable, note it in the amendments section and rely on the Task 11 owner checklist.

---

## File structure

```
mobile/src/theme/tokens.ts            # NEW — all tokens + tint()
mobile/src/theme/tokens.test.ts       # NEW — tint() unit tests
mobile/src/lib/colors.ts              # becomes re-export shim
mobile/src/components/ui/Button.tsx   # NEW ─┐
mobile/src/components/ui/IconButton.tsx      │
mobile/src/components/ui/Badge.tsx           │ seven primitives
mobile/src/components/ui/Card.tsx            │
mobile/src/components/ui/Screen.tsx          │
mobile/src/components/ui/SectionHeader.tsx   │
mobile/src/components/ui/EmptyState.tsx      ┘
mobile/src/components/ui/index.ts     # NEW — barrel
docs/STYLE_GUIDE.md                   # NEW — Task 11
eslint.config.js (mobile/)            # Task 11 — hex/hsl/rgba backstop
```

Migrated in place (Tasks 5–10): FoodInventoryScreen, ViewFoodDetailsScreen, EditFoodScreen + `edit-food/styles.ts` + 3 route wrappers; ShoppingListScreen; `meals/library/*`; the four Home cards + RampHomeBanner + `home.tsx` + TrackingCard + `track/index.tsx`; MealsScreen + `mealsScreenStyles.ts` + 7 modals; WaterScreen + 4 modals + water cards; `profile/nutrition/*`; `app/(tabs)/_layout.tsx`.

---

### Task 1: Token module with tested `tint()`

**Files:**
- Create: `mobile/src/theme/tokens.ts`
- Test: `mobile/src/theme/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/theme/tokens.test.ts
import { tint } from "./tokens";

describe("tint", () => {
  it("produces the standard 15% fill", () => {
    expect(tint("#22C55E")).toBe("rgba(34,197,94,0.15)");
  });
  it("accepts an explicit alpha", () => {
    expect(tint("#F59E0B", 0.3)).toBe("rgba(245,158,11,0.3)");
  });
  it("handles lowercase hex", () => {
    expect(tint("#f97316")).toBe("rgba(249,115,22,0.15)");
  });
  it("throws on malformed input rather than emitting a broken color", () => {
    expect(() => tint("#FFF")).toThrow();     // shorthand not supported
    expect(() => tint("22C55E")).toThrow();   // missing #
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd mobile && npx jest src/theme/tokens.test.ts`
Expected: FAIL — cannot find module `./tokens`. (If Jest doesn't pick the file up, check `jest.config` `testMatch`/`roots` and extend to include `src/theme/` — record as amendment.)

- [ ] **Step 3: Write `tokens.ts`**

```ts
// mobile/src/theme/tokens.ts
// FitTracker design tokens — the ONLY place raw color/size values may live.
// Spec: docs/superpowers/specs/2026-08-01-fittracker-style-guide-design.md
import type { TextStyle } from "react-native";

export const colors = {
  bg: "#0A0F1E",
  surface: "#111827",
  surface2: "#1E293B",
  border: "#1F2937",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textFaint: "#6B7280",
  brand: "#22C55E",
  onBrand: "#FFFFFF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  imageWell: "#FFFFFF", // product photos are shot on white; wells stay white on dark cards
  scrim: "rgba(0,0,0,0.5)",
  accents: {
    meals: "#F97316",
    water: "#3B82F6",
    inventory: "#8B5CF6",
    shopping: "#14B8A6",
    brand: "#22C55E",
  },
} as const;

export type AccentKey = keyof typeof colors.accents;

/** The one translucent-fill recipe (tiles, badges, banners). Border tints use 0.3. */
export function tint(hex: string, alpha = 0.15): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new Error(`tint(): expected #RRGGBB, got "${hex}"`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
  screenGutter: 16,
} as const;

export const radii = { control: 8, row: 12, panel: 16, pill: 999 } as const;

export const typography = {
  titleRoot: { fontSize: 28, fontWeight: "bold" } satisfies TextStyle,
  titleBar: { fontSize: 17, fontWeight: "600" } satisfies TextStyle,
  section: {
    fontSize: 13, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.5, color: colors.textMuted,
  } satisfies TextStyle,
  rowTitle: { fontSize: 16, fontWeight: "600" } satisfies TextStyle,
  body: { fontSize: 14 } satisfies TextStyle,
  caption: { fontSize: 12, color: colors.textMuted } satisfies TextStyle,
  button: { fontSize: 16, fontWeight: "600" } satisfies TextStyle,
  buttonSm: { fontSize: 14, fontWeight: "600" } satisfies TextStyle,
} as const;

export const icons = { sm: 16, md: 20, lg: 24, strokeWidth: 2 } as const;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest src/theme/tokens.test.ts` → 4 passing. Then `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/theme/tokens.ts mobile/src/theme/tokens.test.ts
git commit -m "style(theme): design tokens module with tested tint() helper"
```

---

### Task 2: Turn `lib/colors.ts` into a shim

**Files:**
- Modify: `mobile/src/lib/colors.ts` (replace entire contents)

- [ ] **Step 1: Replace the file**

```ts
// mobile/src/lib/colors.ts
// LEGACY SHIM — do not add tokens here. Import from "@/src/theme/tokens" instead.
// Maps every pre-style-guide token name onto the new palette so unmigrated
// screens keep compiling. Migrated files must not import this module (grep-gated).
import { colors as t } from "../theme/tokens";

export const colors = {
  primary: t.brand,
  primaryForeground: t.onBrand,
  background: t.bg,
  foreground: t.text,
  card: t.surface2,
  cardForeground: t.text,
  secondary: t.surface2,
  secondaryForeground: t.text,
  muted: t.surface2,
  mutedForeground: t.textMuted,
  destructive: t.danger,
  destructiveForeground: t.text,
  border: t.border,
  input: t.surface2,
  accent: t.surface2,
  accentForeground: t.text,
};
```

Notes on visible diffs this causes app-wide (intended, spec §4.1): `primaryForeground` `#FEFCFB`→`#FFFFFF`, `mutedForeground` `#94A3B8`→`#9CA3AF`, `destructive` `#7F1D1D`→`#EF4444`, `border` `#1E293B`→`#1F2937`.

- [ ] **Step 2: Gates**

Run: `cd mobile && npx tsc --noEmit` → 0 errors; `npm test` → green.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/colors.ts
git commit -m "style(theme): colors.ts becomes a re-export shim over tokens"
```

---

### Task 3: Primitives I — Button, IconButton, Badge

**Files:**
- Create: `mobile/src/components/ui/Button.tsx`, `IconButton.tsx`, `Badge.tsx`, `index.ts`

- [ ] **Step 1: `Button.tsx`**

```tsx
// mobile/src/components/ui/Button.tsx
import React, { useState } from "react";
import {
  ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to fill the row (full-width CTAs). */
  fluid?: boolean;
  icon?: LucideIcon;
}

export function Button({
  label, onPress, variant = "primary", size = "md",
  loading = false, disabled = false, fluid = false, icon: Icon,
}: ButtonProps) {
  // Capture rendered width so swapping the label for a spinner doesn't reflow.
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined);
  const onLayout = (e: LayoutChangeEvent) => {
    if (minWidth === undefined) setMinWidth(e.nativeEvent.layout.width);
  };
  const labelColor =
    variant === "primary" ? colors.onBrand
    : variant === "secondary" ? colors.text
    : variant === "destructive" ? colors.danger
    : colors.brand;
  const blocked = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.base, styles[variant], size === "sm" && styles.sm,
        fluid && styles.fluid, disabled && styles.disabled, { minWidth },
      ]}
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.7}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.onBrand : colors.brand}
        />
      ) : (
        <>
          {Icon ? <Icon size={icons.md} color={labelColor} strokeWidth={icons.strokeWidth} /> : null}
          <Text style={[size === "sm" ? typography.buttonSm : typography.button, { color: labelColor }]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderRadius: radii.control,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
  },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  destructive: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.danger },
  ghost: { backgroundColor: "transparent", paddingHorizontal: spacing.sm },
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg - 2 },
  fluid: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
});
```

- [ ] **Step 2: `IconButton.tsx`**

```tsx
// mobile/src/components/ui/IconButton.tsx
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, tint } from "@/src/theme/tokens";

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  variant?: "square" | "circle";
  accessibilityLabel: string;
  disabled?: boolean;
}

export function IconButton({
  icon: Icon, onPress, variant = "square", accessibilityLabel, disabled = false,
}: IconButtonProps) {
  const circle = variant === "circle";
  return (
    <TouchableOpacity
      style={[circle ? styles.circle : styles.square, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      // circle is 32pt visually; pad the touch target to >= 44pt
      hitSlop={circle ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <Icon
        size={circle ? icons.sm : 22}
        color={circle ? colors.brand : colors.onBrand}
        strokeWidth={icons.strokeWidth}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  square: {
    width: 44, height: 44, borderRadius: radii.control,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  circle: {
    width: 32, height: 32, borderRadius: radii.pill,
    backgroundColor: tint(colors.brand), alignItems: "center", justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
});
```

- [ ] **Step 3: `Badge.tsx`**

```tsx
// mobile/src/components/ui/Badge.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AccentKey, colors, radii, tint } from "@/src/theme/tokens";

export type BadgeTone = "warning" | "danger" | "success" | "neutral" | AccentKey;

const toneColor = (tone: BadgeTone): string => {
  switch (tone) {
    case "warning": return colors.warning;
    case "danger": return colors.danger;
    case "success": return colors.success;
    case "neutral": return colors.textMuted;
    default: return colors.accents[tone];
  }
};

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const c = toneColor(tone);
  return (
    <View style={[styles.pill, { backgroundColor: tint(c) }]}>
      <Text style={[styles.label, { color: c }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: { fontSize: 12, fontWeight: "600" },
});
```

- [ ] **Step 4: Start the barrel — `index.ts`**

```ts
// mobile/src/components/ui/index.ts
export { Button } from "./Button";
export type { ButtonVariant } from "./Button";
export { IconButton } from "./IconButton";
export { Badge } from "./Badge";
export type { BadgeTone } from "./Badge";
```

- [ ] **Step 5: Gates + commit**

`cd mobile && npx tsc --noEmit` → 0; `npm test` → green.

```bash
git add mobile/src/components/ui/
git commit -m "style(ui): Button, IconButton, Badge primitives"
```

---

### Task 4: Primitives II — Card, Screen, SectionHeader, EmptyState

**Files:**
- Create: `mobile/src/components/ui/Card.tsx`, `Screen.tsx`, `SectionHeader.tsx`, `EmptyState.tsx`
- Modify: `mobile/src/components/ui/index.ts`

- [ ] **Step 1: `Card.tsx`**

```tsx
// mobile/src/components/ui/Card.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { AccentKey, colors, radii, spacing, tint } from "@/src/theme/tokens";

interface CardProps {
  variant: "row" | "panel" | "tile";
  /** tile only: identity fill + glyph color source */
  accent?: AccentKey;
  onPress?: () => void;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function Card({ variant, accent, onPress, style, children }: CardProps) {
  const base: ViewStyle[] = [
    variant === "row" ? styles.row : variant === "panel" ? styles.panel : styles.tile,
  ];
  if (variant === "tile") {
    base.push({ backgroundColor: tint(colors.accents[accent ?? "brand"]) });
  }
  if (style) base.push(style);
  if (onPress) {
    return (
      <TouchableOpacity style={base} onPress={onPress} activeOpacity={0.7}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface, borderRadius: radii.row,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  panel: {
    backgroundColor: colors.surface, borderRadius: radii.panel,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  tile: {
    borderRadius: radii.panel, padding: spacing.lg,
    aspectRatio: 1, minHeight: 140, maxHeight: 180,
    justifyContent: "space-between",
  },
});
```

- [ ] **Step 2: `Screen.tsx`** (safe-area pattern per `mobile/CLAUDE.md` — works for route screens AND fullScreen modals)

```tsx
// mobile/src/components/ui/Screen.tsx
import React from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { AccentKey, colors, icons, radii, spacing, typography } from "@/src/theme/tokens";

interface ScreenProps {
  variant: "root" | "detail";
  title: string;
  /** root: colors the title glyph */
  accent?: AccentKey;
  /** root: glyph rendered beside the 28pt title */
  icon?: LucideIcon;
  onBack?: () => void;
  /** root: chrome-bar middle slot (e.g. search pill); detail: unused */
  headerCenter?: React.ReactNode;
  /** both: right slot (IconButton, ghost action, etc.) */
  headerRight?: React.ReactNode;
  /** default true; pass false when the screen owns a FlatList/SectionList */
  scroll?: boolean;
  children: React.ReactNode;
}

export function Screen({
  variant, title, accent, icon: Icon, onBack, headerCenter, headerRight,
  scroll = true, children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const titleGlyphColor = colors.accents[accent ?? "brand"];
  const body = variant === "root" ? (
    <>
      <View style={styles.titleRow}>
        {Icon ? <Icon size={26} color={titleGlyphColor} strokeWidth={icons.strokeWidth} /> : null}
        <Text style={[typography.titleRoot, styles.titleText]}>{title}</Text>
      </View>
      {children}
    </>
  ) : (
    children
  );
  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.chrome, variant === "detail" && styles.chromeBordered]}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.back} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="Back">
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
          ) : variant === "detail" ? (
            <View style={styles.back} />
          ) : null}
          {variant === "detail" ? (
            <Text style={[typography.titleBar, styles.barTitle]} numberOfLines={1}>{title}</Text>
          ) : (
            <View style={styles.center}>{headerCenter}</View>
          )}
          {headerRight ?? (variant === "detail" ? <View style={styles.back} /> : null)}
        </View>
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{body}</View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chrome: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm + 2,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
  },
  chromeBordered: { borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, alignItems: "flex-start", justifyContent: "center" },
  center: { flex: 1 },
  barTitle: { flex: 1, textAlign: "center", color: colors.text },
  titleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  titleText: { color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.screenGutter, gap: spacing.lg - 2 },
});
```

- [ ] **Step 3: `SectionHeader.tsx`**

```tsx
// mobile/src/components/ui/SectionHeader.tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, typography } from "@/src/theme/tokens";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
  /** rendered beside the title (e.g. a count Badge) */
  badge?: React.ReactNode;
}

export function SectionHeader({ title, action, badge }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={typography.section}>{title}</Text>
        {badge}
      </View>
      {action ? (
        <TouchableOpacity onPress={action.onPress} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.action}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  action: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
```

- [ ] **Step 4: `EmptyState.tsx`** (also exports the standard loading treatment)

```tsx
// mobile/src/components/ui/EmptyState.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {Icon ? <Icon size={40} color={colors.textFaint} strokeWidth={1.5} /> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} size="sm" /> : null}
    </View>
  );
}

/** The one loading treatment: brand spinner + muted caption. */
export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: spacing.md, padding: spacing.xxxl, backgroundColor: colors.bg,
  },
  title: { ...typography.rowTitle, color: colors.text, textAlign: "center" },
  body: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
```

- [ ] **Step 5: Complete the barrel**

```ts
// mobile/src/components/ui/index.ts  (full contents)
export { Button } from "./Button";
export type { ButtonVariant } from "./Button";
export { IconButton } from "./IconButton";
export { Badge } from "./Badge";
export type { BadgeTone } from "./Badge";
export { Card } from "./Card";
export { Screen } from "./Screen";
export { SectionHeader } from "./SectionHeader";
export { EmptyState, LoadingState } from "./EmptyState";
```

- [ ] **Step 6: Gates + commit**

`npx tsc --noEmit` → 0; `npm test` → green.

```bash
git add mobile/src/components/ui/
git commit -m "style(ui): Card, Screen, SectionHeader, EmptyState primitives"
```

---

### Task 5: Light→dark conversions (Food Inventory, detail, edit)

**Files:**
- Modify: `mobile/src/components/track/FoodInventoryScreen.tsx`, `mobile/src/components/track/ViewFoodDetailsScreen.tsx`, `mobile/src/components/track/EditFoodScreen.tsx`, `mobile/src/components/track/edit-food/styles.ts`, `mobile/src/components/track/edit-food/SectionHeader.tsx`, `mobile/app/(tabs)/track/food-inventory/[id].tsx`, `mobile/app/(tabs)/track/food-inventory/edit/[id].tsx`, `mobile/app/(tabs)/track/food-inventory/preview.tsx`

Zero behavior changes: same fetches, same handlers, same navigation. This task only replaces colors/geometry and swaps hand-rolled controls for primitives.

- [ ] **Step 1: FoodInventoryScreen — kill the white body**

Mechanical mapping (apply throughout the file's StyleSheet, currently ~lines 850–1038):

| Current | Replacement |
|---|---|
| `titleContainer`/`flatList`/`gridContainer` `backgroundColor: "#FFFFFF"` | `colors.bg` |
| `pageTitle` `color: "#111827"`, 28/bold | `typography.titleRoot` + `color: colors.text` |
| grid tile: white bg, radius 8, border `#E5E7EB` | `Card variant="row"` wrapper (keep the `Pressable` for `onLongPress` INSIDE the Card via `onPress`-less Card + existing Pressable, or pass handlers through — preserve long-press behavior exactly) |
| tile image box on `#F9FAFB` bordered `#E5E7EB` | `backgroundColor: colors.imageWell`, `borderRadius: radii.control`, no border |
| add button `#8B5CF6` 44×44 | `<IconButton icon={Plus} accessibilityLabel="Add food" …/>` (brand) |
| expiring banner (amber card, radius 12) | Banner recipe: `backgroundColor: tint(colors.warning)`, `borderColor: tint(colors.warning, 0.3)`, `borderWidth: 1`, `borderRadius: radii.row`, heading `colors.warning` 14/600 |
| "Expired"/low-stock text labels | `<Badge tone="danger" label="Expired"/>` / `<Badge tone="warning" label="Low"/>` |
| category tabs active state (violet) | active: `colors.text` label + 2px `colors.brand` underline; inactive `colors.textMuted` |
| search bar + header | keep existing header structure this task (Screen adoption for list screens is optional; if adopted, use `scroll={false}`); colors → `surface2`/`textFaint` tokens |
| package glyph / location identity | `colors.accents.inventory` — violet survives ONLY here and in location Badges (`tone="inventory"`) |

- [ ] **Step 2: ViewFoodDetailsScreen + EditFoodScreen + `edit-food/styles.ts`**

Same recipe: every `#F9FAFB`/`#FFFFFF` section background → `colors.bg`/`colors.surface` (`Card panel` for sections); `#111827` headings → `colors.text`; `#E5E7EB`/`#F3F4F6` secondary buttons → `Button secondary`; violet save (`#8B5CF6`, `edit-food/styles.ts:408-433`) → `Button primary fluid` with existing `loading`/`disabled` wiring moved to Button props; `edit-food/SectionHeader.tsx` hardcoded `#111827`/`#EF4444` → `colors.surface`/`colors.danger`; the inline `ActivityIndicator` at `EditFoodScreen.tsx:1092-1095` (spinner `#111827`) → Button `loading` prop. Photo containers keep `colors.imageWell`.

- [ ] **Step 3: The three route wrappers**

In `[id].tsx`, `edit/[id].tsx`, `preview.tsx` (each ~lines 105-107): replace the hardcoded light loading view with `<LoadingState/>` from `@/src/components/ui`.

- [ ] **Step 4: Gates**

```bash
cd mobile && npx tsc --noEmit && npm test
FILES="src/components/track/FoodInventoryScreen.tsx src/components/track/ViewFoodDetailsScreen.tsx src/components/track/EditFoodScreen.tsx src/components/track/edit-food/styles.ts src/components/track/edit-food/SectionHeader.tsx app/(tabs)/track/food-inventory/[id].tsx app/(tabs)/track/food-inventory/edit/[id].tsx app/(tabs)/track/food-inventory/preview.tsx"
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(|rgba\(' $FILES
grep -n 'from "@/src/lib/colors"' $FILES
```
Both greps: no output. Screenshot `track/food-inventory` + one item detail + edit; verify dark end-to-end, white image wells, green add button.

- [ ] **Step 5: Commit**

```bash
git add -A mobile/src/components/track mobile/app
git commit -m "style(inventory): convert Food Inventory, detail, and edit screens to dark theme tokens"
```

---

### Task 6: Shopping List + Meal Library

**Files:**
- Modify: `mobile/src/components/track/ShoppingListScreen.tsx`, `mobile/src/components/track/meals/library/styles.ts`, `mobile/src/components/track/meals/library/MealLibraryModal.tsx`, `MealRow.tsx`, `MealDetail.tsx`, `MealBuilder.tsx`

- [ ] **Step 1: ShoppingListScreen**

| Current (file:line from audit) | Replacement |
|---|---|
| header: centered 20/700 title, `:374` | `Screen variant="detail"` with `scroll={false}` (SectionList stays the screen's own); title 17/600 via `typography.titleBar` |
| `headerAction` teal `#14B8A6` `:383` | `headerRight` ghost action, brand |
| text glyphs `＋ ✓ ⇄ ✕ ↗` `:180,199,212,226,318` | lucide `Plus`, `Check`, `ArrowLeftRight`, `X`, `ArrowUpRight` at `icons.sm`, in `IconButton circle` / `Button ghost` per role |
| row card `#111827` r12 border `#1F2937` `:384-388` | `Card variant="row"` |
| section header 13/700 uppercase `:379-382` | `SectionHeader` with count `Badge tone="shopping"` (teal survives ONLY here) |
| retry button teal r10 `:421-425` | `Button primary` |
| circle icon buttons `rgba(20,184,166,0.15)` `:394-398` | `IconButton circle` (brand tint) |
| `busy` dim `opacity 0.5` `:407` | keep mechanism; value already matches Button `disabled` convention |
| spinner tint `#14B8A6` | `LoadingState` |

- [ ] **Step 2: Meal Library**

`library/styles.ts`: `primaryButton` `#2563EB` r10 (`:97-103`) → `Button primary`; `headerAction` `#3B82F6` (`:17`) → ghost brand; row card (`:33-41`) → `Card row`; score chips / stock badges (`:52-71`) → `Badge` (`tone="success"|"warning"|"danger"` by band — thresholds unchanged from `mealScore` bands); title 20/700 → `typography.titleBar` in its fullScreen-modal header.

- [ ] **Step 3: Gates + commit**

tsc 0 / tests green / both greps clean on all six files. Screenshots: `track/shopping`, Meal Library modal (via Meals screen → library button — needs one manual tap; if headless-only, screenshot shopping and note library for owner checklist).

```bash
git add -A mobile/src/components/track
git commit -m "style(shopping,library): migrate Shopping List and Meal Library to tokens and primitives"
```

---

### Task 7: Home surfaces + Track hub

**Files:**
- Modify: `mobile/src/components/EatNextHomeCard.tsx`, `MealsHomeCard.tsx`, `WaterIntakeHomeCard.tsx`, `RampHomeBanner.tsx`, `mobile/app/(tabs)/home.tsx`, `mobile/src/components/track/TrackingCard.tsx`, `mobile/app/(tabs)/track/index.tsx`

- [ ] **Step 1: Home cards** — `#111827` r16 p20 border `#1F2937` cards → `Card variant="panel"`; delete the dead duplicate card styles in `home.tsx:246-254`; magic `paddingBottom: 100` (`home.tsx:218`) → `insets.bottom + spacing.xxl`; `EatNextHomeCard` score chip + stock badge copy-paste block (`:254-263` and the styles it documents) → `Badge`, deleting the comment that apologized for the duplication; `RampHomeBanner` (`:96-107`) → Banner recipe with `tint(colors.success)` fill; section headers 20/600 (`home.tsx:233-239`) stay screen-owned text but recolor via tokens.

- [ ] **Step 2: TrackingCard becomes a Card-tile wrapper** (full replacement):

```tsx
// mobile/src/components/track/TrackingCard.tsx
import React from "react";
import { StyleSheet, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AccentKey, colors, icons, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";

interface TrackingCardProps {
  title: string;
  icon: LucideIcon;
  accent: AccentKey;
  onPress: () => void;
}

export function TrackingCard({ title, icon: Icon, accent, onPress }: TrackingCardProps) {
  return (
    <Card variant="tile" accent={accent} onPress={onPress} style={styles.grow}>
      <Icon size={32} color={colors.accents[accent]} strokeWidth={icons.strokeWidth} />
      <Text style={styles.title}>{title}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  title: { ...typography.rowTitle, color: colors.text, marginTop: 8 },
});
```

- [ ] **Step 3: `track/index.tsx` card config** — replace each entry's `iconColor` + `backgroundColor` hex/rgba pair with a single `accent` key: Meals & Snacks → `"meals"`, Water → `"water"`, Food Inventory → `"inventory"`, Shopping List → `"shopping"`, Weight → `"brand"`. Non-nutrition tiles (Measurements, Photos, activity tiles) each get their existing base hex added to `colors.accents` under a domain name (e.g. `measurements: "#EC4899"`) — sanctioned token additions; record the exact set added as an amendment. Section headers 12/600 ls1 (`:206-212`) → `typography.section`. Gutter 20 → `spacing.screenGutter`.

- [ ] **Step 4: Gates + commit** — tsc/tests/greps clean on all seven files; screenshots `home` + `track`.

```bash
git add -A mobile/src mobile/app
git commit -m "style(home,track-hub): migrate Home cards, ramp banner, and Track hub tiles to primitives"
```

---

### Task 8: Meals screen + modal fleet

**Files:**
- Modify: `mobile/src/components/track/MealsScreen.tsx`, `mobile/src/components/track/meals/mealsScreenStyles.ts`, `FoodPreviewModal.tsx`, `FoodCorrectionModal.tsx`, `meals/ManualFoodEntryModal.tsx`, `MealLogEditorModal.tsx`, `QuickAdjustmentModal.tsx`, `MealsWeeklySummaryModal.tsx`, `BarcodeScannerModal.tsx`, `meals/EatNextRow.tsx`, `meals/MealsDayList.tsx`

- [ ] **Step 1: The orange→green control sweep.** In `mealsScreenStyles.ts` and all seven modals: every `#F97316` CONTROL (full-width CTA `:176-189`, header 44×44 add `:47-54`, active segment, modal confirm `FoodCorrectionModal.tsx:314-323`, `FoodPreviewModal.tsx:727-747`, `ManualFoodEntryModal.tsx:475-488`) → `Button primary` / `IconButton square` / segmented active = brand fill + `onBrand` label on `surface2` track. Orange survives ONLY as: title glyph (`accents.meals`), macro-bar fills, and `tint(accents.meals)` info fills (e.g. `MealsNutritionCard.tsx:87-93` banner). Blue `#3B82F6` modal pair (`MealLogEditorModal.tsx:326-335`, `QuickAdjustmentModal`) → `Button primary` + `Button secondary`.

- [ ] **Step 2: Structure.** Screen title 28/bold + fork glyph (`mealsScreenStyles.ts:136-139`) → `typography.titleRoot` + `accents.meals` glyph (keep the screen's own header row — MealsScreen owns complex chrome; full `Screen` adoption is NOT required this task); section headers 18/600 (`:194-197`) → `SectionHeader`; suggested-now rows + day list rows → `Card row`; "Missing N" chips (`EatNextRow`) → `Badge tone="warning"`; modal sheets → `colors.scrim` backdrop + `Card panel` sheet + `Button` pairs; `MealsDayList.tsx:34` loading → `LoadingState`; gutter 20 → 16.

- [ ] **Step 3: Gates + commit** — tsc/tests; greps clean on all eleven files; screenshots `track/meals` (Today + Insights toggle states).

```bash
git add -A mobile/src/components/track
git commit -m "style(meals): migrate Meals screen and its modal fleet to tokens and primitives"
```

---

### Task 9: Water screen + modals

**Files:**
- Modify: `mobile/src/components/track/WaterScreen.tsx`, `WaterLogEditorModal.tsx`, `WaterQuickAddEditorModal.tsx`, `WaterGoalEditorModal.tsx`, `WaterCalendarModal.tsx`, `WaterCustomLogForm.tsx`, `WaterQuickAddCard.tsx`, `WaterInsightsCard.tsx`, `WaterDayStrip.tsx`, `WaterHistoryList.tsx`, `WaterProgressRing.tsx`, `WaterUndoSnackbar.tsx`

- [ ] **Step 1:** Same sweep with water blue: `#3B82F6` controls (modal pairs `WaterLogEditorModal.tsx:170-179`, quick-add pill `WaterCustomLogForm.tsx:139-148`) → `Button` variants; blue survives in the water drop glyph, progress ring fill, and day-strip fills (`accents.water`). Cards r12 `colors.card` (`WaterInsightsCard.tsx:64-70` etc.) → `Card panel` (r16 — the spec collapses in-screen insight cards into panel geometry); 28pt title → `typography.titleRoot` + glyph; history section headers → `SectionHeader`; per-log rows → `Card row`; `WaterScreen.tsx:642`-style loading → `LoadingState`; calendar modal → `scrim` + `Card panel`.

- [ ] **Step 2: Gates + commit** — tsc/tests/greps on all twelve files; screenshot `track/water`.

```bash
git add -A mobile/src/components/track
git commit -m "style(water): migrate Water screen, modals, and cards to tokens and primitives"
```

---

### Task 10: Nutrition Preferences + Food Matching

**Files:**
- Modify: `mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx`, `RampCard.tsx`, `ConstraintsSection.tsx`, `VendorsSection.tsx`, `ConceptRow.tsx`, `FoodMatchingScreen.tsx`
- Delete (after migration): `mobile/src/components/profile/nutrition/styles.ts`

- [ ] **Step 1:** This fullScreen modal becomes `Screen variant="detail"` (safe-area pattern already matches); title-left + "Done" (`styles.ts:6-14`) → centered `titleBar` + `headerRight` ghost "Done"; `colors.primary` buttons pV10 (`:49-59`) → `Button primary` (pV12); destructive outline (`:81-89`, text `#F87171`) → `Button destructive` (label becomes `colors.danger` — one red); ramp status banner (`:40-47`) → Banner recipe; section titles 16/700 (`:23-28`) → `SectionHeader`; concept/vendor rows → `Card row`; each subcomponent imports tokens directly; retire `profile/nutrition/styles.ts` entirely and delete it.

- [ ] **Step 2: Gates + commit** — tsc/tests; greps clean on all six files; `ls mobile/src/components/profile/nutrition/styles.ts` → No such file. Screenshot via Home → ramp banner deep link (`?modal=nutrition`) if data allows, else owner checklist.

```bash
git add -A mobile/src/components/profile
git commit -m "style(nutrition-prefs): migrate preferences and food matching to primitives; retire local stylesheet"
```

---

### Task 11: Closeout — tab bar, STYLE_GUIDE.md, lint backstop, sweep

**Files:**
- Modify: `mobile/app/(tabs)/_layout.tsx`, `mobile/src/components/TabBarIcon.tsx`
- Create: `docs/STYLE_GUIDE.md`, ESLint config addition (location depends on existing setup — see Step 3)

- [ ] **Step 1: Tab bar** — replace the HSL strings (`_layout.tsx:11-25`: `"hsl(217.2, 32.6%, 17.5%)"` → `colors.surface2`, `"hsl(142, 76%, 36%)"` → `colors.brand`, `"hsl(215, 20.2%, 65.1%)"` → `colors.textMuted`) and its ad-hoc shadow values; `TabBarIcon.tsx` keeps size 24 / focused strokeWidth 2.5 (sanctioned exception — record in guide).

- [ ] **Step 2: Write `docs/STYLE_GUIDE.md`** — full contents:

```markdown
# FitTracker Style Guide

Source of truth: `mobile/src/theme/tokens.ts` + `mobile/src/components/ui/`.
Spec: `docs/superpowers/specs/2026-08-01-fittracker-style-guide-design.md`.

## Rules
1. No raw color values (`#hex`, `hsl()`, `rgba()`) outside `src/theme/tokens.ts`. Translucent fills come from `tint(color)` (0.15) / `tint(color, 0.3)` for borders; modal backdrops use `colors.scrim`.
2. Domain accents (`colors.accents.*`) are IDENTITY ONLY: title glyphs, hub tiles, badges, data fills (macro bars, rings). Every interactive control — buttons, links, spinners, active tabs/segments — is `colors.brand`.
3. Buttons come from `ui/Button` or `ui/IconButton`. Never hand-roll a TouchableOpacity-with-background. Disabled = the component's opacity 0.5; loading = the `loading` prop.
4. Surfaces come from `ui/Card`: `row` (lists, r12), `panel` (insights/modals, r16), `tile` (hub, tint fill). Border is always `colors.border`.
5. Screens: root = slim chrome + 28pt `typography.titleRoot` + accent glyph in the body; detail = bordered bar + centered `typography.titleBar`. Use `ui/Screen`; pass `scroll={false}` when the screen owns a FlatList/SectionList.
6. Section headers via `ui/SectionHeader` (13/700 uppercase). Status pills via `ui/Badge`. Loading/empty via `ui/EmptyState`/`LoadingState`.
7. Spacing on the 4pt scale (`spacing.*`), gutter `spacing.screenGutter` (16). Radii only from `radii.*`. Type only from `typography.*`; weights are numeric strings ("bold" exists only inside `titleRoot`).
8. Icons: lucide-react-native, sizes `icons.sm|md|lg`, strokeWidth 2 (tab focused state 2.5 is the one exception). Back chevron: `lg`, `colors.text`.
9. Banner recipe (no component): `tint(warning)` fill + `tint(warning, 0.3)` 1px border + `radii.row` + warning 14/600 heading. Same shape with `success` for positive banners.
10. Exceptions that are tokens, not violations: `colors.imageWell` (white product-photo wells), `colors.scrim`.

## Adopt-on-touch
Screens outside nutrition/Track/Home (training, workout-session, schedule, other profile pages) migrate whenever a change touches them: swap `@/src/lib/colors` for `@/src/theme/tokens`, replace hand-rolled controls with `ui/` primitives, run the grep gate on the file you touched.
```

- [ ] **Step 3: ESLint backstop.** Inspect `mobile/` for existing ESLint setup (`.eslintrc*`, `eslint.config.*`, `package.json` `eslintConfig`). Add (or create config with) this rule — **error** scope via an override for `src/theme/**` and `src/components/ui/**`, **warn** globally:

```js
// rule fragment — merge into the existing config's `rules`
"no-restricted-syntax": ["warn", {
  selector: "Literal[value=/^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/]",
  message: "Raw hex color — use tokens from @/src/theme/tokens",
}, {
  selector: "Literal[value=/^(?:hsla?|rgba?)\\(/]",
  message: "Raw color function — use tokens or tint() from @/src/theme/tokens",
}],
// override block:
// files: ["src/theme/**", "src/components/ui/**"], rules: { "no-restricted-syntax": ["error", ...same options] }
```

If no ESLint exists at all, create `mobile/eslint.config.js` with `eslint-config-expo` if present in node_modules, else a minimal flat config with just this rule + `@typescript-eslint/parser`; add `"lint": "eslint src app"` to `mobile/package.json` scripts. Record whichever path was taken as an amendment. `npx eslint src/theme src/components/ui` must pass with zero errors.

- [ ] **Step 4: Final sweep + gates**

```bash
cd mobile && npx tsc --noEmit && npm test
# repo-wide status check: remaining hits must ALL be in out-of-scope dirs (training, workout-session, schedule, non-nutrition profile)
grep -rlE '#[0-9A-Fa-f]{3,8}\b|hsl\(' src/components src/lib app --include='*.ts*' | sort
```
Verify the list contains no nutrition/Track/Home/ui/theme files. Screenshot pass: `home`, `track`, `track/meals`, `track/water`, `track/food-inventory`, `track/shopping`.

- [ ] **Step 5: Commit, then STOP for the owner**

```bash
git add -A
git commit -m "style(closeout): tab bar tokens, STYLE_GUIDE.md, ESLint color backstop"
```

Hand the owner this on-device checklist (Metro reload on the existing dev client, port 8090; no native changes so no rebuild needed): 1) Track hub tiles tinted per domain, green nothing-but-controls; 2) Food Inventory fully dark, photos on white wells, restock modal styled; 3) Meals: log a meal end-to-end — every CTA green, orange only in glyph/macros; 4) Shopping: suggest→confirm→purchase→restock flow, real icons instead of text glyphs; 5) Water modals; 6) Nutrition Preferences via ramp banner deep link; 7) EditFood accordion + save (loading spinner inside green button). **No merge, no push — owner's call.**

---

## ⚠️ Execution amendments

*(Record every deviation from this plan here, in the same commit as the fix: what the plan said, what was actually done, why. Include token additions from Task 7 Step 3 and any Jest/ESLint config discoveries.)*

### Task 1 — Jest `testMatch` did not pick up `src/theme/tokens.test.ts`

The plan's Step 2 anticipated this exact contingency. `mobile/jest.config.js` scoped `testMatch` to `["**/__tests__/**/*.test.ts"]` only — every existing suite lives under a `src/lib/__tests__/` directory, and `src/theme/tokens.test.ts` sits directly in `src/theme/`, not in a `__tests__` folder, so `npx jest src/theme/tokens.test.ts` reported "No tests found" (0 matches) before the implementation even existed.

Fix: extended `testMatch` to `["**/__tests__/**/*.test.ts", "**/theme/**/*.test.ts"]` in `mobile/jest.config.js`. Re-ran the test — it was now discovered and failed correctly on `Cannot find module './tokens'` (the true TDD-red state), then passed once `tokens.ts` was written. Final suite: 12 suites / 321 tests passing (up from 11/317); `npx tsc --noEmit` clean.

### Task 3 — `IconButton` square icon size: plan had an untokenized `22`

The plan's Task 3 `IconButton.tsx` source rendered the square variant's icon as `size={circle ? icons.sm : 22}` — a plan authoring bug. Spec §5.2 states the square variant renders its icon at size `md`, and `icons.md` is 20 in `mobile/src/theme/tokens.ts`. The plan is authoritative on mechanics but the spec is authoritative on values, so the spec wins here; `22` was also an untokenized magic number with no spec basis, in the exact primitive the whole style guide exists to keep tokenized.

Fix: changed the expression to `size={circle ? icons.sm : icons.md}` in `mobile/src/components/ui/IconButton.tsx`. Nothing else in the file changed. Re-ran gates: `npx tsc --noEmit` clean; `npm test` still 12 suites / 321 tests passing.

### Task 3 — `Button` `sm` padding was off-grid (`spacing.lg - 2`)

The plan's Task 3 `Button.tsx` source set `sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg - 2 }`. `spacing.lg - 2` evaluates to 14, and spec §4.3 states verbatim: "Off-grid values (10, 14, 18, 22, 38…) are banned; nearest step wins." Nothing in §5.1 sanctions 14 — this was the same class of plan-authoring bug as the Task 3 `IconButton` `22` fixed above.

Fix: changed the expression to `sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }` in `mobile/src/components/ui/Button.tsx` — dropping the `± n` arithmetic adjustment and keeping the plan's own base token, rather than substituting a different rounding. This resolution — **drop the ± adjustment, keep the base token** — is adopted as the standing rule for every remaining off-grid `token ± n` expression elsewhere in this plan; later tasks that hit the same pattern are covered by this amendment and do not need a fresh one. Re-ran gates: `npx tsc --noEmit` clean; `npm test` still 12 suites / 321 tests passing.

Also, per code-quality review, extended the comment above `Button`'s `minWidth` `useState` to document an existing (unchanged) assumption: the width capture assumes first layout happens with the label visible, so a call site that mounts with `loading={true}` would capture the spinner's width instead and the control would grow when loading later clears. This is documentation only — no logic changed.

### Task 4 — `LoadingState` label styled with `typography.body` instead of `typography.caption`

The plan's Task 4 `EmptyState.tsx` source styled `LoadingState`'s label `<Text>` with `styles.body` (`typography.body`, 14/400), reusing the same style as `EmptyState`'s optional `body` prop text. Spec §5.7 states the module "also exports the standard loading treatment (`ActivityIndicator` in `brand` + **`caption`** text)" — the spec names `caption` (`typography.caption`, 12/400, `color: colors.textMuted`) explicitly for the loading label, not `body`. Spec is authoritative on values, so `caption` wins.

Fix: added a new `caption: { ...typography.caption, textAlign: "center" }` entry to the `StyleSheet.create` block in `mobile/src/components/ui/EmptyState.tsx` (not re-specifying color since `typography.caption` already carries `color: colors.textMuted`), and changed only `LoadingState`'s `<Text>` to use `styles.caption`. `EmptyState`'s own `body` `<Text>` was left on `styles.body`, unchanged — the spec's `caption` naming applies to the loading treatment only, not to `EmptyState`'s generic body copy. Re-ran gates: `npx tsc --noEmit` clean; `npm test` still 12 suites / 321 tests passing.

Also recording a deliberate non-change so it isn't mistaken for an oversight: spec §5.4 lists `headerLeft?/headerCenter?/headerRight?` slots on `Screen`, but the plan's `ScreenProps` (and the shipped `Screen.tsx`) only define `headerCenter` and `headerRight`. `headerLeft` was NOT added — the left position is occupied by the back chevron in both `root` and `detail` variants, no Task 5-10 migration has identified a need for an additional left-side slot, and adding an unused prop would violate this project's YAGNI discipline. If a later migration genuinely needs it, it should be added then, together with a real call site.

### Task 4 — code-quality review follow-ups: `Card` a11y role, `Screen` detail-bar centering, doc-only clarifications

Code-quality review of the Task 4 commit (`6493b55`) surfaced one accessibility gap, one layout bug, and two documentation gaps, all in components that Tasks 5-10 build ~60 screens/components on top of.

**`Card` missing `accessibilityRole="button"`.** The plan's `Card.tsx` gave `Button`, `IconButton`, and `SectionHeader`'s action `accessibilityRole="button"` on their `TouchableOpacity`, but `Card`'s `onPress` branch had none — a VoiceOver regression across every tappable row/tile in the app (Inventory tiles, Shopping rows, Meal Library rows, Track hub tiles). Fix: added `accessibilityRole="button"` to the `TouchableOpacity` in `mobile/src/components/ui/Card.tsx`'s `onPress` branch. Nothing else in that branch changed.

**`Screen` detail-variant title was not actually centered.** The plan's markup gave the bar title `flex: 1` between a fixed 32pt back-button flank and an unconstrained `headerRight`. Spec §3 decision 4 and §5.4 both require the detail bar title to be centered, but whenever `headerRight` is wider than 32pt (e.g. an `IconButton variant="square"` at 44pt, or a ghost `Button`, as Task 10's "Done" action will be), the title visibly shifts left by roughly half the width difference — the plan's markup did not deliver what the spec requires. Fix: restructured only the `detail` branch of the chrome bar in `mobile/src/components/ui/Screen.tsx` to an equal-flank pattern — a left `flank` (`flex: 1, alignItems: "flex-start"`) holding the back button (extracted into a shared `backButton` value, behavior unchanged), the title at natural width (dropped `flex: 1` from `styles.barTitle`, kept `textAlign: "center"`, `numberOfLines={1}`, `color: colors.text`), and a right `flank` (`flex: 1, alignItems: "flex-end"`, plus a `flankRight` modifier) holding `headerRight`. With both flanks equal and the title at natural width, the title is genuinely centered regardless of what either side holds, and a long title squeezes both flanks symmetrically. The now-redundant `detail`-variant spacer `<View style={styles.back} />` placeholders were dropped since the flanks themselves reserve the space; `styles.back` is retained for the back button itself. The `root` variant's chrome bar (which deliberately gives `headerCenter` `flex: 1` for a full-width search pill on Food Inventory) was left exactly as it was — not restructured. Re-ran gates: `npx tsc --noEmit` clean; `npm test` still 12 suites / 321 tests passing.

**`scroll={false}` contract undocumented.** `scroll={false}` renders a bare `<View style={styles.scroll}>` (just `flex: 1`) — by design it gets neither `scrollContent`'s `paddingHorizontal: spacing.screenGutter` nor `paddingBottom: insets.bottom + spacing.xxl`, because Inventory and Shopping own their own `FlatList`/`SectionList` and must supply those themselves. Nothing said so, and Task 6 wires Shopping's `SectionList` through this path under a visible bottom tab bar — forgetting the bottom inset would hide the last row behind the tab bar. Fix: expanded the JSDoc on `ScreenProps.scroll` in `mobile/src/components/ui/Screen.tsx` to state the contract explicitly. Documentation only, no logic changed.

**`EmptyState` full-bleed assumption undocumented.** `styles.wrap` sets `flex: 1` and an opaque `backgroundColor: colors.bg` — correct for all currently planned (full-screen) call sites, but nesting `EmptyState` inside a `Card` as an empty-list placeholder would paint a `bg` patch over the card surface. Fix: added a one-line doc comment above `EmptyState` in `mobile/src/components/ui/EmptyState.tsx` noting it is full-bleed only and expects to fill a screen-level container, not sit inside a `Card`. Documentation only, no logic changed.

**Recording, not implementing: `SectionHeader`'s action is label-only.** Spec §5.5 allows the section-header action to be `label | icon`, and spec §7 imagines the edit-food accordion eventually reusing the `ui` primitive. `ui/SectionHeader.tsx` implements only the `label` form. This is deliberate, not an oversight: there is no call site today, and review confirmed Task 5 does not consolidate onto this primitive (Task 5 only recolors the bespoke `edit-food/SectionHeader.tsx` in place). Extending the API now with no caller would violate YAGNI. Revisit if a future task actually needs the icon form.
