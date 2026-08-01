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

**`Screen` detail-variant title was not actually centered.** The plan's markup gave the bar title `flex: 1` between a fixed 32pt back-button flank and an unconstrained `headerRight`. Spec §3 decision 4 and §5.4 both require the detail bar title to be centered, but whenever `headerRight` is wider than 32pt (e.g. an `IconButton variant="square"` at 44pt, or a ghost `Button`, as Task 10's "Done" action will be), the title visibly shifts left by roughly half the width difference — the plan's markup did not deliver what the spec requires. Fix: restructured only the `detail` branch of the chrome bar in `mobile/src/components/ui/Screen.tsx` to an equal-flank pattern — a left `flank` holding the back button (extracted into a shared `backButton` value, behavior unchanged), the title at natural width (dropped `flex: 1` from `styles.barTitle`, kept `textAlign: "center"`, `numberOfLines={1}`, `color: colors.text`), and a right `flank` (plus a `flankRight` modifier) holding `headerRight`. The now-redundant `detail`-variant spacer `<View style={styles.back} />` placeholders were dropped since the flanks themselves reserve the space; `styles.back` is retained for the back button itself. The `root` variant's chrome bar (which deliberately gives `headerCenter` `flex: 1` for a full-width search pill on Food Inventory) was left exactly as it was — not restructured.

Re-review of this fix in the real `yoga-layout` engine caught a second-order bug the first pass introduced: giving both flanks `flex: 1` (implicit `flexBasis: 0`) with a natural-width title and no size floor meant that once the title's intrinsic width exceeded the available space, RN's default `flexShrink: 0` on the flanks made them refuse to shrink — instead both flanks collapsed to width 0, and the back chevron and `headerRight` (which still paint at their natural sizes; RN doesn't clip by default) were drawn on top of the title text. Measured at a 350pt bar, a ~30+ character title overlapped the back chevron by 24pt and covered 72 of a ghost button's 80 points — a functional regression the old `flex: 1`-on-title markup never had, since it always reserved exactly the leftover space for the title.

Fix: added `flexShrink: 1` to `barTitle` (it already has `numberOfLines={1}`, so it now truncates/ellipsizes instead of forcing the flanks to zero) and `minWidth: 32` to `flank` (so a flank can never collapse below the back chevron's footprint; `flankRight` composes on top of `flank` and inherits the floor — it still only adds `alignItems: "flex-end"`). Resulting behavior: when there's slack, both flanks grow equally from a zero basis and the title sits dead center — the centering win is preserved. When the title is too long for the available space, it shrinks and ellipsizes while the flanks hold at their ≥32pt floor, so the back chevron and `headerRight` are never overlapped. Titles no longer "squeeze both flanks symmetrically" as an earlier draft of this note claimed — the flanks are floored at 32pt, not squeezed indefinitely; it is the title that gives way.

Accepted residual limitation (deliberate, not to be "fixed"): a very long title next to a very wide `headerRight` can still crowd that right-hand action, because true centering with unequal side content fundamentally requires absolute positioning, which is more surgery than this bar warrants. Every detail title in this plan is short ("Shopping List", "Nutrition Preferences", "Meal Library", "Edit Food"), so it doesn't arise in practice.

Also dropped an unused `radii` import from `mobile/src/components/ui/Screen.tsx` (pre-existing in the plan's original Task 4 source — `radii` was never referenced in that file), since an unused import would trip the lint backstop Task 11 adds.

Re-ran gates: `npx tsc --noEmit` clean; `npm test` still 12 suites / 321 tests passing.

**`scroll={false}` contract undocumented.** `scroll={false}` renders a bare `<View style={styles.scroll}>` (just `flex: 1`) — by design it gets neither `scrollContent`'s `paddingHorizontal: spacing.screenGutter` nor `paddingBottom: insets.bottom + spacing.xxl`, because Inventory and Shopping own their own `FlatList`/`SectionList` and must supply those themselves. Nothing said so, and Task 6 wires Shopping's `SectionList` through this path under a visible bottom tab bar — forgetting the bottom inset would hide the last row behind the tab bar. Fix: expanded the JSDoc on `ScreenProps.scroll` in `mobile/src/components/ui/Screen.tsx` to state the contract explicitly. Documentation only, no logic changed.

**`EmptyState` full-bleed assumption undocumented.** `styles.wrap` sets `flex: 1` and an opaque `backgroundColor: colors.bg` — correct for all currently planned (full-screen) call sites, but nesting `EmptyState` inside a `Card` as an empty-list placeholder would paint a `bg` patch over the card surface. Fix: added a one-line doc comment above `EmptyState` in `mobile/src/components/ui/EmptyState.tsx` noting it is full-bleed only and expects to fill a screen-level container, not sit inside a `Card`. Documentation only, no logic changed.

**Recording, not implementing: `SectionHeader`'s action is label-only.** Spec §5.5 allows the section-header action to be `label | icon`, and spec §7 imagines the edit-food accordion eventually reusing the `ui` primitive. `ui/SectionHeader.tsx` implements only the `label` form. This is deliberate, not an oversight: there is no call site today, and review confirmed Task 5 does not consolidate onto this primitive (Task 5 only recolors the bespoke `edit-food/SectionHeader.tsx` in place). Extending the API now with no caller would violate YAGNI. Revisit if a future task actually needs the icon form.

### Task 5 — `CategoryTabs.tsx` and `SubcategoryPills.tsx` had to be converted too

The plan's Task 5 file list names eight files, but two of the Food Inventory screen's always-visible body components are separate files that were still fully light-themed: `mobile/src/components/track/CategoryTabs.tsx` (white container, `#E5E7EB` border, `#111827`/`#6B7280` labels, 3px violet active indicator) and `mobile/src/components/track/SubcategoryPills.tsx` (white container, `#F3F4F6` pills, `#E9D5FF`/`#7C3AED` selected state). Leaving them would have left a white band directly under a now-dark title on the screen the task exists to darken, and the plan's own mapping table has a "category tabs active state (violet)" row with nowhere else to apply it.

Fix: both converted to tokens in the same commit. `CategoryTabs` active state is now `colors.text` label + a 2px `colors.brand` underline (spec §6, and the mockup's `.tabs .on`), inactive `colors.textMuted`; the indicator lost its 3px height and top corner radii. `SubcategoryPills` selected state is `tint(colors.brand)` fill + `colors.brand` border/label — a filter chip is a control, so it is brand, not the inventory accent. `git add -A mobile/src/components/track` already covered both paths.

### Task 5 — grid-tile stock/expiry chips moved below the photo instead of overlaying it

The plan's mapping table converts the tile's `"Expired"`/low-stock text labels to `Badge`s but does not say where they sit; the current code painted them as absolutely-positioned overlays on the top-right of the product image (90%-opaque red/blue fills with white text). `Badge` is a 15%-alpha `tint()` fill with a full-strength label — a treatment designed for dark surfaces, and unreadable over the white `colors.imageWell` or a product photo. The approved mockup (spec §6 "Visual reference", section 5 "Applied: the Food Inventory conversion") settles it: the proposed tile renders image well → title → subtitle → **badge below the text**, `align-self: flex-start`.

Fix: the overlay container and its three bespoke styles (`badgeContainer`, `lowStockBadgeOverlay`, `restockFridgeBadgeOverlay`, `badgeOverlayText`) are gone; a single wrapping `gridBadges` row now sits at the bottom of the tile's info block. The render conditions are unchanged (`needsRestockFridge`, `isLowTotalStock`). Per the plan's own example the low-stock label reads `Low` rather than `Low Stock`.

**`Restock Fridge` tone.** Not covered by the plan's table. It is rendered `tone="inventory"` — it names a storage location, which is exactly the "location Badges" case where the plan sanctions the surviving violet, and it keeps the chip distinguishable from the amber `Low` chip beside it (they were red vs. blue before).

**Tile expiration line.** `formatExpirationDate` used to return `{ text, color }`; it now returns `{ text, tone: BadgeTone | null }`. The expired/today/soon bands render as `Badge`s (matching the mockup's `Expired` chip) and the plain future-date band stays a muted text line, since a full "Exp: Aug 15, 2026" string is not chip-shaped. Same bands, same strings, same projection input — only the wrapper changed.

### Task 5 — `edit-food/SectionHeader.tsx` chevron: plan said `colors.surface`, used `colors.text`

The plan's Task 5 Step 2 says the hardcoded `#111827`/`#EF4444` in `edit-food/SectionHeader.tsx` map to `colors.surface`/`colors.danger`. `#111827` is indeed the literal value of `colors.surface`, but that is a *background* token: the accordion chevron sits ON a `colors.surface` card, so mapping it literally would have painted an invisible chevron. Spec §4.1 assigns `#111827` to surfaces and gives foreground duty to `text`/`textMuted`. Spec wins on values.

Fix: `mobile/src/components/track/edit-food/SectionHeader.tsx` renders `color={hasError ? colors.danger : colors.text}` at `icons.md`. The `danger` half of the plan's mapping was applied as written.

### Task 5 — edit-food sections use the `Card panel` recipe inline, not the `Card` component

Spec §7 and the plan both say the edit screen's white sections become `Card panel`. The seven sections in `EditFoodScreen.tsx` wrap an accordion header that must run flush to the card edge (it is the full-width tap target, and it takes a tinted error background across that full width), while `sectionContent` carries its own padding. `Card variant="panel"`'s fixed `spacing.lg` internal padding would inset the header and double-pad the content.

Fix: `styles.section` in `edit-food/styles.ts` now carries the panel recipe itself (`colors.surface`, `radii.panel`, 1px `colors.border`, `overflow: "hidden"`, screen-gutter margins) and the JSX is untouched. Visually identical to `Card panel`; no primitive was bypassed for a *different* look. `ViewFoodDetailsScreen`'s sections, which have no such constraint, do use the real `Card variant="panel"`.

**Related deliberate non-change:** spec §7 also imagines the accordion reusing the `ui/SectionHeader` primitive "with a chevron action". It does not — the local `edit-food/SectionHeader` carries `isExpanded`, `hasError` and an `Animated` rotating chevron that the primitive has no API for (see the Task 4 amendment above recording that `ui/SectionHeader`'s action is label-only and has no caller). Adopting it would have deleted the rotation animation and the error state — a behavior change, which Task 5 forbids. Left in place, recolored only.

### Task 5 — `preview.tsx` has an error state, not a loading state

The plan's Step 3 says all three route wrappers replace "the hardcoded light loading view" with `<LoadingState/>`. `[id].tsx` and `edit/[id].tsx` do exactly that. `preview.tsx` has no loading state at all — it derives its item synchronously from route params — and the light `#FFFFFF` block it does have is the "Missing product data" *error* branch.

Fix: that branch renders `<EmptyState title="Missing product data" />` instead. `LoadingState` there would have claimed the screen was still loading something that will never arrive.

### Task 5 — smaller deviations, recorded together

- **`Screen` adoption declined for `FoodInventoryScreen`.** The plan marks it optional. The existing header was kept and retokenized: adopting `Screen` would not have removed any bespoke chrome (the screen still owns its search bar, its category tabs, its banner and its `FlatList`) and would have re-parented the whole body for a purely cosmetic task. `ViewFoodDetailsScreen` did not adopt `Screen variant="detail"` either, for a harder reason: its `ScrollView` carries a `RefreshControl`, and `Screen` owns the `ScrollView` with no way to pass one through — adopting it would have deleted pull-to-refresh.
- **Grid gutter 20 → `spacing.screenGutter` (16).** `GRID_PADDING`/`GRID_GAP` are now `spacing.screenGutter`/`spacing.md`, so the grid lines up with the header and banner instead of sitting 4pt narrower. Same convergence spec §4.3 applies to Track hub and Meals. `ITEM_WIDTH` is derived from them and follows.
- **Uncategorized-tag overlay lost its drop shadow.** `shadowColor: "#000"` is a raw color literal and the token module has no elevation scale (the system is deliberately flat). The circle is now `colors.surface` behind a `colors.accents.inventory` glyph at `icons.sm`, which reads on the white image well without a shadow.
- **List empty/loading states adopt the primitives.** The bespoke `emptyState`/`emptyText`/`emptySubtext` block and the bare `<Text>Loading...</Text>` in the grid's `ListEmptyComponent` became `EmptyState` and `LoadingState`. Both conditional copy expressions were moved verbatim into the `title`/`body` props.
- **Section-title typography.** `ViewFoodDetailsScreen`'s 18/700 section titles converge to `typography.section` per spec §4.5. The edit screen's accordion titles use `typography.rowTitle` instead: they are row *controls* with a chevron, not passive section labels, and 13/700 uppercase would have shrunk the primary tap affordance of that screen.
- **`EditFoodScreen` footer + inline controls onto `Button`.** Cancel/Save are `Button secondary`/`Button primary` at equal flex inside `styles.footerButton` wrappers (`fluid`, so they still stretch); Save's `saving` state moved to `loading` + `disabled`, replacing the `"Saving..."` label swap and the manual `buttonDisabled` opacity. The barcode Scan control and the multi-location Add control likewise became `Button size="sm"`, which is what retired the inline `ActivityIndicator` the plan called out at `EditFoodScreen.tsx:1092-1095`. Press-blocking behavior is identical in all four cases (`Button` blocks on `disabled || loading`).
- **Detail-screen category tags → `Badge`.** Categories are `tone="inventory"` (identity), subcategories `tone="neutral"`, replacing the `#E9D5FF`/`#7C3AED` and `#DBEAFE`/`#2563EB` pill pairs. `locationQuantity` keeps `colors.accents.inventory` — the other sanctioned violet survivor.

### Task 5 (review follow-up) — banner heading was 13/700, spec says 14/600

`FoodInventoryScreen`'s `expiringTitle` carried the pre-existing `fontSize: 13, fontWeight: "700"` straight through the conversion; only its color was retokenized. Spec §5 and this plan both specify a **14/600** heading for the banner recipe, and this is the recipe's first call site — Task 8's `RampHomeBanner` and Task 10's ramp status banner are both expected to copy it, so the drift would have propagated.

Fix: `expiringTitle` is now `{ ...typography.buttonSm, color: colors.warning, marginBottom: spacing.xs }`. `typography.buttonSm` is exactly 14/600, so the banner recipe is now expressible entirely in tokens with no magic numbers left for the next copy to inherit.

### Task 5 (review follow-up) — `Card` gains `onLongPress`; the grid tile collapses onto it

The original conversion nested `Card(View) > Pressable` because `Card` had no long-press slot, which preserved the action sheet but left the card's own 12pt padding ring dead and shrank the effective tap target to roughly 88pt. Tasks 6-10 hit the same list-row-with-context-action shape repeatedly.

Fix, in two parts:

1. `mobile/src/components/ui/Card.tsx` takes an optional `onLongPress?: () => void`, passed to the existing `TouchableOpacity`. The interactive branch now triggers on `onPress || onLongPress`, so a long-press-only card is valid. Purely additive — every existing caller is unaffected.
2. `FoodInventoryScreen`'s grid tile moves both handlers onto the `Card` and drops the inner `Pressable` (and its now-unused import).

**Gesture equivalence verified before collapsing.** Both `Pressable` and `TouchableOpacity` are built on the same `Pressability` core with the same default `delayLongPress` (500ms) and the same suppression rule (a fired long-press cancels the subsequent `onPress`). The handlers are the same closures over the same argument: `onPress={() => handleViewItem(item)}`, `onLongPress={() => handleLongPress(item)}`. The inner `Pressable` carried no prop `Card` cannot express — only `style`, which was already the `Card`'s `styles.gridItem`. The two deliberate differences are both gains: the tile now shows the standard `activeOpacity` 0.7 press feedback like every other card, and it picks up `accessibilityRole="button"`.

### Task 5 (review follow-up) — refinement to the standing off-grid spacing rule

The Task 3 amendment established: for a `token ± n` expression, drop the `± n` and keep the base token. That rule says nothing about a **bare off-grid literal**, and rounding those to the nearest step silently shrank three controls in `edit-food/styles.ts` — `statusButton` and `locationEntryButton` went `paddingVertical: 6 → spacing.xs` (4), leaving them ~25pt tall, and `locationButton` went `10 → spacing.sm` (8).

**Refinement, in force for Tasks 6-10:** when a bare off-grid literal is a control's touch-affecting padding, round **up** to the next step, never down. Tap targets must never shrink as a side effect of tokenization. (Non-control values — margins, gaps, decorative padding — keep nearest-step rounding.)

Applied here: `statusButton` and `locationEntryButton` 6 → `spacing.sm` (8); `locationButton` 10 → `spacing.md` (12).

### Task 5 (review follow-up) — uniform `Badge` treatment in the expiring-soon list

The first pass rendered the expired rows as a `Badge` (following the mockup) but left today/soon rows as plain amber text, so adjacent rows in the same scroller had mismatched right-edge heights and baselines.

Fix: all three bands now render a `Badge` — `tone="danger"` for expired, `tone="warning"` for today and for the "Nd left" case. The `expiringWhen` text style is deleted. This is also what the plan's mapping table asks for ("Expired"/low-stock text labels → `Badge`).

### Task 5 (review follow-up) — smaller fixes, recorded together

- **Empty/loading states did not fill the viewport.** `gridContainer` set only padding, so `EmptyState`/`LoadingState` (`flex: 1`, i.e. `flexBasis: 0`) had no free space to grow into and collapsed to their own 64pt of padding, rendering high in the list area. `flexGrow: 1` added to `gridContainer` — inert once rows exist, since content already exceeds the viewport and children are top-aligned. Same pairing `ShoppingListScreen.tsx:284` already uses.
- **Footer spacer folded into the content container.** `ListFooterComponent={<View style={{ height: spacing.xxxl }} />}` is gone; `contentContainerStyle` now carries `paddingBottom: insets.bottom + spacing.xxl`, restoring the safe-area term the spacer never had and dropping a per-render element.
- **Dead `sectionContent` removed.** Once `Card variant="panel"` took over the padding in `ViewFoodDetailsScreen`, `sectionContent` had no properties left; the empty key and its no-op wrapping `<View>` are both gone and `renderSection` renders `content` directly.
- **Inert-button smell fixed at the source.** `onPress={() => onAddToInventory?.()}` existed only to satisfy `Button`'s required `onPress`. `Button.onPress` stays required — making it optional would let any downstream task ship an enabled-but-inert CTA — and the header slot is now conditional instead: Edit when not previewing, Add only when a handler exists, otherwise nothing. An Add button that silently does nothing is now unrepresentable.
- **`colors.onBrand` used off-label twice.** `toggleThumb`'s fill and the `Trash2` glyph on the `colors.danger` remove-image button are both `colors.text` now. `onBrand` means "foreground on a brand fill"; both are literally `#FFFFFF` so nothing rendered wrong, but this file sets precedent for five more tasks. No `onDanger` token was added — there is no spec basis for one. The four remaining `onBrand` uses in `edit-food/styles.ts` are all `*TextActive` labels sitting on `colors.brand` fills, which is exactly on-label.

### Task 6 — `Screen variant="detail"` adopted for Shopping; the plan's `headerRight` row is a mis-description

`Screen variant="detail"` + `scroll={false}` was adopted for `ShoppingListScreen`. Verified first that the existing header carried nothing `Screen` cannot express: it was exactly a back chevron, a centered title and a 32pt spacer — no `RefreshControl` pass-through (the `RefreshControl` belongs to the screen's own `SectionList`, which `scroll={false}` leaves untouched), no search field, no animated state, no bespoke left slot. The screen keeps `useSafeAreaInsets` solely to supply the list's bottom inset.

The plan's mapping row "`headerAction` teal `#14B8A6` `:383` → `headerRight` ghost action, brand" does not match the file: `styles.headerAction` at `:383` is the **section**-header action style (used by "Add all" and "Open ↗"), not a screen-header action. The screen has no top-bar action at all, so `Screen`'s `headerRight` slot is left unused and the `headerAction` style migrated to `Button variant="ghost" size="sm"` inside the section headers, in brand. Nothing teal survives outside the section-count `Badge`.

Per the `scroll={false}` contract, the `SectionList`'s `contentContainerStyle` now supplies `paddingHorizontal: spacing.screenGutter` (the rows' and section headers' own `marginHorizontal`/`paddingHorizontal: 16` were deleted rather than doubled) and `paddingBottom: insets.bottom + spacing.xxl`. The pre-existing `flexGrow: 1` was kept, which is what lets the `EmptyState`/`LoadingState` primitives fill the viewport.

### Task 6 — glyph → lucide mapping, and the one glyph that stayed a control rather than a button

| Glyph | Role in the JSX | Replacement |
|---|---|---|
| `＋` (`:180`) | suggestion row: add this suggestion to the list | `IconButton variant="circle"` + `Plus` |
| `✓` (`:199`) | **checked state of a checkbox**, not a button label | lucide `Check` at `icons.sm` in `colors.onBrand`, rendered inside the retained checkbox |
| `⇄` (`:212`) | item row: open the vendor picker | `IconButton variant="circle"` + `ArrowLeftRight` |
| `✕` (`:226`) | item row: remove from the list | `IconButton variant="circle"` + `X` |
| `↗` (`:318`) | section header: "Open ↗" vendor deep link | `Button variant="ghost" size="sm"` with `icon={ArrowUpRight}` |

Two deviations inside that table:

**`✓` did not become an `IconButton circle`.** It is not a button label — it is the *checked* state of a two-state checkbox, and `IconButton` always renders its icon, so a circle variant would have painted a faint green check on an *unchecked* row and destroyed the empty-box affordance that tells the user the item is still unbought. The checkbox `TouchableOpacity` is retained (same handler, same `disabled={busy}`), fully tokenized: `radii.control`, `colors.brand` fill when checked, and — deliberately — `colors.textFaint` for the unchecked outline rather than `colors.border`. `#374151` mapped literally to `colors.border` would have put a `#1F2937` outline on a `#111827` card, roughly halving the contrast of the one element whose job is to be visible.

**`Button` renders its `icon` leading, at `icons.md`.** "Open ↗" therefore reads "↗ Open" and the arrow is 20pt, not the `icons.sm` the plan's row asks for. Both are fixed geometry of the Task 3 `Button` primitive; the `icons.sm` instruction is honored by the three `IconButton circle` actions, which do render at `icons.sm`. `Button` was not modified — five later tasks build on it.

**The row `✕` is now brand, not red.** `IconButton` has no destructive variant and the plan's row action mapping is explicit, so the delete affordance's red is gone from the icon; the destructive confirmation `Alert` (unchanged) still guards it. Where a destructive action *is* labeled, the system's own primitive is used instead: the purchased section's "Clear" is `Button variant="destructive" size="sm"`, and Meal Library's "Delete" is `Button variant="destructive"`. So the rule applied throughout Task 6 is: **labeled destructive actions use `Button destructive`; icon-only row actions go brand.**

### Task 6 — section counts moved out of the title string into a `Badge`

The plan asks for "`SectionHeader` with count `Badge tone="shopping"`". The counts lived inside the title strings (`` `Suggested (${n})` ``), so the `sections` memo now emits `title: "Suggested"` plus a `count: number | null` field, and the header renders `<Badge label={String(count)} tone="shopping" />` beside the title. Vendor sections pass `count: null` — they never displayed a count and adding one would be new information, not a restyle. This is a presentational change to a derived array; no filtering, ordering, `keyExtractor` or section identity changed.

`ui/SectionHeader` supplies the title + badge only. Its `action` prop was **not** used: it is label-only, brand-colored and has no `disabled` support, while all three of this screen's section actions need `disabled={busy}` (the double-fire guard documented on the `busy` state) and one of them is destructive. They are rendered as `Button`s beside the `SectionHeader` inside the screen's own header row. `SectionHeader` was not extended — the Task 4 amendment already recorded that its action API stays minimal until a real call site needs more.

### Task 6 — Meal Library deviations

- **`Screen` not adopted for the Meal Library modal.** Spec §6 classes its header as a detail header, and the title now uses `typography.titleBar` accordingly, but the header is a three-slot bar (left = "New" / "‹ Library", centre = title, right = "Done") and `Screen variant="detail"` offers only a back chevron plus `headerRight` — there is no `headerLeft` (deliberately, per the Task 4 amendment). The bespoke header is retained and retokenized; its three actions become `Button variant="ghost" size="sm"`, matching the Task 5 precedent in `ViewFoodDetailsScreen`'s header. `＋ New` and `‹ Library` lose their text glyphs to `icon={Plus}` / `icon={ChevronLeft}` as a consequence.
- **Score-chip tones follow the plan's `success | warning | danger` by band.** `scoreChipStyle` is replaced by `scoreTone(score): BadgeTone` in the same file, with the same `scoreBand` thresholds and the same "the DECISION stays in `mealScore.ts`" split; `core → success`, `mid → warning`, `low → danger`. Note this is a real color change beyond tokenization: `mid` was a neutral `#1F2937` chip and `low` a grey one, and they now read amber and red. That is what the plan specifies. `mealScore.ts`'s doc comment naming `scoreChipStyle` was updated to name `scoreTone` (comment only — the only edit outside `components/track`, so the commit adds that path explicitly on top of the plan's `git add -A mobile/src/components/track`).
- **"Brian Approved" is `tone="success"`.** The plan routes the whole `:52-71` block to `Badge` but names tones only for the score bands. The badge was blue (`#3B82F6`/`#60A5FA`) and blue is the water accent with no identity role here, so it could not survive; `success` is the semantic token for a positive verdict and introduces no new hue. "In stock" is also `success` — the two are distinguished by their labels, as they must be anyway for anyone not perceiving color. `MealBuilder`'s "Meets the Brian Approved bar" is a sentence, not a chip, so it stays a `Text` on a new `lib.approvedNote` style in the same `colors.success`.
- **`barFill` (score-breakdown bars) → `colors.brand`.** It was `#3B82F6`; the plan's instruction that Meal Library's blues become brand applies.
- **`chipActive` → solid `colors.brand` fill + `colors.onBrand` label.** These are segmented-style selectors (category / role / rating / meal type) and one filter chip; spec §6 gives active segments a brand fill, and the original `#2563EB` was likewise a solid fill. This differs from Task 5's `SubcategoryPills`, which used the `tint(brand)` treatment — that one is a standalone filter pill row, these are segment groups.
- **`lib.card` is replaced by `Card variant="row"` + a `lib.cardSpacing` style.** `Card` owns surface/radius/padding/border; the `marginHorizontal: screenGutter` / `marginBottom: sm` placement the old `card` style also carried has nowhere to live inside the primitive, so it is passed through `Card`'s `style` prop. Every one of the eight former `lib.card` blocks uses `row` (not `panel`), which preserves today's 12pt padding / 12pt radius exactly. `lib.headerAction` is renamed `lib.glyphAction`, since after the migration its only remaining consumers are `MealBuilder`'s `−` / `＋` steppers.
- **`MealBuilder`'s inline glyphs (`−`, `＋`, `✕`, `✂︎`, `●`) were deliberately left as text.** Spec §4.6 scopes the glyph→lucide swap to Shopping's set, and converting the stepper row to three 32pt `IconButton circle`s inside a dense card row is a layout change, not a restyle. They are tokenized in place. Worth revisiting if a later task touches the builder.
- **`MealLibraryModal`'s `ListEmptyComponent` stayed a `Text`.** Its copy is two full sentences that name the way out of the in-stock filter; as an `EmptyState` `title` (16/600) it would read as a headline, and adopting the primitive would also have required adding `flexGrow: 1` to that list's content container. The error and loading branches did adopt `EmptyState` / `LoadingState`.
- **`lib.input` keeps `fontSize: 15`.** Spec §4.5 defines no input type token and the plan does not mention `input`; only its colors, radius and padding were tokenized.

### Task 6 — spacing conversions, and a uniform tie-break

Applying the standing rules (Task 3: drop `± n`, keep the base token; Task 5: control touch-padding rounds up, other values round to nearest): several values here are exactly *between* two steps (`6` and `10`), which neither rule resolves. **Ties round up, uniformly** — the same "tap targets never shrink" instinct, applied consistently so the two files don't disagree. Applied to: the shopping row `gap: 10 → spacing.md`, `vendorPicker gap: 6 → spacing.sm`, `vendorChip padding 10/5 → spacing.md/spacing.sm` (a control, so it rounds up regardless), Meal Library's `chip padding 12/6 → spacing.md/spacing.sm`, and every `marginTop: 6 → spacing.sm` / `marginTop: 10 → spacing.md`. `borderRadius: 14`/`16` on chips → `radii.pill`; `borderRadius: 6` on the checkbox → `radii.control`.

**Stale cross-reference left for Task 7:** `mobile/src/components/EatNextHomeCard.tsx:254-263` documents that its local chip/badge colors mirror `library/styles.ts`'s `scoreChipCore/Mid/Low` and `badge`/`inStockBadge`, all four of which this task deleted. Task 7 migrates that file to `Badge` and retires the comment; it was left untouched here rather than dragging an out-of-scope file into a Task 6 commit.

### Task 6 (review follow-up) — four primitive defects that Task 6's call sites exposed

Task 6 was the first task to put ghost buttons, section-header actions, icon-only deletes and `Card` style overrides into real use, and each one surfaced a defect in a Task 3/4 primitive. All four are fixed in `mobile/src/components/ui/` in their own commit, ahead of the call-site changes, because Tasks 7-10 inherit them.

**`Button`'s style array applied `sm` after the variant.** The order was `styles.base, styles[variant], size === "sm" && styles.sm`, and `sm` sets `paddingHorizontal: spacing.lg` (16) while `ghost` sets `spacing.sm` (8) — so `sm` won and every `ghost` + `sm` button sat 16pt in, contradicting spec §5.1's "ghost: … horizontal padding 8". Reordered to `styles.base, size === "sm" && styles.sm, styles[variant]`. Verified against all four variants: `sm` carries **only** padding (`paddingVertical`/`paddingHorizontal`), and of the four variants only `ghost` declares padding at all — `primary` sets a background, `secondary`/`destructive` set a background plus a border. So the reorder changes exactly one combination (`ghost` + `sm`, horizontal padding 16 → 8) and is inert for `primary`/`secondary`/`destructive` at either size and for `ghost` at `md` (which already resolved to 8, since `ghost` followed `base` there too).

**`Button` rendered its icon at a fixed `icons.md`.** A 20pt glyph beside a 14pt `buttonSm` label; it is also why Task 6's `↗ Open` could not honor the plan's `icons.sm`. Now `size={size === "sm" ? icons.sm : icons.md}`. No caller-facing icon-size prop was added — a per-call-site size knob is exactly the drift this system exists to remove.

**`SectionHeader.action` was a `{ label, onPress }` shape with zero consumers.** It could not express any of Task 6's three section actions, which need `disabled` (the `busy` double-fire guard), an icon, and the destructive variant; adding those props would have rebuilt `Button` inside `SectionHeader`. It is now a `React.ReactNode` slot, like `badge` already was, and `styles.action` is deleted. Callers pass `<Button variant="ghost" size="sm" … />`. Changed now, while the cost is zero call sites, rather than after four more tasks migrate a dozen section headers. (This supersedes the Task 4 amendment's "action is label-only, revisit when a caller needs the icon form" — the caller arrived.)

**`Card.style` was `ViewStyle`, not `StyleProp<ViewStyle>`.** It compiles for a single style object but rejects the `style={[a, cond && b]}` array that any conditional card state needs; the internal `base` array is now `StyleProp<ViewStyle>[]`. Widened before a later task works around it.

**`IconButton` gains `tone?: "default" | "danger"`** — see the standing rule below. `circle` and `square` both take a `tint(colors.danger)` fill with a `colors.danger` glyph. "The same calm treatment" was read as *the circle's* treatment rather than a danger-bordered outline: adding a border would change the square's geometry, and the prohibition being expressed is against a **filled** red, which a 0.15-alpha tint is not.

### Standing rule (Tasks 7-10) — destructive controls

- **Labeled** destructive actions use `Button variant="destructive"` (calm outline, `danger` border and label). The word carries the meaning, so the control can be quiet.
- **Icon-only** destructive row actions use `IconButton tone="danger"`.

This **supersedes** the rule recorded earlier in Task 6 ("icon-only row actions go brand"). That rule was wrong on both law and affordance. On law: §3 decision 3's "every interactive control is brand" governs the four **domain accents** (meals/water/inventory/shopping) — `danger` is a semantic token, and §5.1 establishes it as the legitimate color of a destructive control. On affordance: strip the red from an unlabeled delete and nothing separates it from any other row action — in the Shopping row, `⇄` and `✕` become the same green circle and glyph shape is the only signal left. Applied to `ShoppingListScreen`'s row `✕` and `MealBuilder`'s ingredient `✕`. Note which of those two had kept its red before this task: the **unguarded** one. Shopping's delete is behind an `Alert` confirm; MealBuilder's removes the ingredient immediately with no confirmation at all.

### Standing rule (Tasks 7-10) — outline color

- An outline that **is itself the affordance** — an empty checkbox, a radio, an unfilled progress ring — uses `colors.textFaint`.
- An outline that merely **bounds visible content** — a chip, an input, a card — uses `colors.border`.

Task 6 shipped both (`ShoppingListScreen`'s checkbox on `textFaint`; `vendorChip` / `lib.chip` / `lib.input` on `border`) and recorded only the first as a deviation, which read as an inconsistency. Both were right; the rule simply was not written down. Task 9's `WaterProgressRing` unfilled track is the next instance.

### Standing rule (Tasks 7-10) — active state of chips, segments and tabs

Three treatments existed across Tasks 5-6 with no rule to choose between them. No eighth primitive is being added — spec §5 fixes the set at seven — so the treatment is selected by what the control *is*:

- **Segmented control** (grouped, mutually exclusive, sitting on a shared track): `surface2` track, `radii.control`, active segment = **solid `colors.brand` fill + `onBrand` label**. Spec §6 verbatim.
- **Standalone filter/toggle chip** (independent, no shared track): active = **`tint(colors.brand)` fill + `colors.brand` border + `colors.brand` label**. Matches Task 5's `SubcategoryPills` and Task 6's `vendorChipSelected`.
- **Category tabs**: active = `colors.text` label + 2px `colors.brand` underline. Spec §6; done in Task 5's `CategoryTabs`.

Applied in Task 6: `lib.chipActive` (solid brand) keeps the grouped, single-select selectors — meal type in `MealDetail`, category / role / taste override in `MealBuilder`. The `"In stock only"` filter in `MealLibraryModal` is a standalone toggle and was wrong under this rule, so `lib.chipFilterActive` / `chipFilterTextActive` were added for the tint treatment and that one call site moved onto them. Two style keys rather than one bent key, as instructed. This narrows the earlier Task 6 note that sent every `chipActive` to a solid fill.

### Standing note (Tasks 7-10) — gutter strategy is decided by the screen's relationship to `Screen`

Task 6 ships both strategies on purpose; the choice is not arbitrary.

- `ShoppingListScreen` uses `Screen scroll={false}`, so `Screen` supplies **no** horizontal gutter and the screen's own `SectionList` puts `paddingHorizontal: spacing.screenGutter` on its `contentContainerStyle`. Per-element `marginHorizontal` was deleted from the rows and section headers rather than left to double up.
- The Meal Library modal does **not** use `Screen` at all (its three-slot header has no `Screen` equivalent), so there is no container to hang a gutter on: its cards keep per-element `marginHorizontal` via `lib.cardSpacing`, and `MealDetail`/`MealBuilder` render into a plain `ScrollView`.

Rule of thumb for the remaining tasks: **one gutter owner per screen.** If a container (`Screen`'s scroll path, or a list's `contentContainerStyle`) supplies it, elements carry none; if no container can, elements carry it uniformly. Never both.

### Task 6 (review follow-up) — glyph scope correction and smaller fixes

**The §4.6 scope reading was wrong.** Task 6 originally left `MealBuilder`'s inline glyphs as text on the argument that §4.6 scopes the lucide swap to Shopping's set. It does not: the subject of that sentence is "text-glyph controls", and Shopping's `＋ ✓ ⇄ ✕ ↗` is given parenthetically as the example. `MealBuilder`'s `−`, `＋`, `✕` and the `＋ {name}` add-food affordance are now `Minus`, `Plus`, `X` at `icons.sm` (brand, and `danger` for the delete per the rule above), and each picks up an `accessibilityRole`/`accessibilityLabel` it never had as bare text.

The *other* half of the original argument stands and was kept: they are **not** promoted to `IconButton circle`. Three 32pt circles inside a dense card row is a layout change, not a restyle. The existing `TouchableOpacity` + `GLYPH_HIT_SLOP` wrappers and handlers are untouched — only the `<Text>` child was swapped for a lucide icon. `✂︎` and `●` are left alone: they are status glyphs inside prose, not controls. With the swap, `lib.glyphAction` and `lib.destructiveText` lose their last consumers and are deleted.

Smaller items in the same commit:

- `lib.headerTitle` gains `flexShrink: 1`. In a `space-between` bar a natural-width title claims its full intrinsic width and pushes the flanking actions out — and those actions just became `Button`s. `Screen.tsx`'s `barTitle` already carries this guard for exactly this reason (recorded in the Task 4 amendment); the bespoke modal header now matches.
- `ShoppingListScreen`'s checkbox `22 → 24`. 22 is named in spec §4.3's banned list. Carrying an off-grid value through a fully-migrated file would establish "off-grid survives if it was pre-existing" as precedent for four more tasks.
- `lib.barTrack` / `lib.barFill` `borderRadius: 3 → radii.pill`. Identical rendering on a 6pt bar, one fewer magic number.
- `MealDetail`'s "Edit" moves from `Button ghost` to `Button secondary`, so the footer pair (`secondary` + `destructive`) is two outlined controls of equal weight instead of a bare text link beside a bordered one.
- The `ShoppingListScreen` comment calling its `EmptyState` "full-bleed" is corrected — the list's `contentContainerStyle` now supplies a horizontal gutter, so it is inset. `flexGrow: 1` is still what keeps it from collapsing.

### Task 7 — the sanctioned `colors.accents` additions, in full

Step 3 sanctions adding the non-nutrition tiles' base hexes to `colors.accents`. Exactly three were added, each reusing the tile's own pre-existing `iconColor` (so every tile renders the identical hue it did before) and each with a real consumer today:

| Key | Value | Tile it serves | Where the value came from |
|---|---|---|---|
| `measurements` | `#EC4899` | Measurements (`Ruler`) | that entry's own `iconColor` / `rgba(236,72,153,0.15)` fill |
| `photos` | `#F59E0B` | Progress Photos (`Camera`) | that entry's own `iconColor` / `rgba(245,158,11,0.15)` fill |
| `workouts` | `#EF4444` | Workouts (`Dumbbell`) | that entry's own `iconColor` / `rgba(239,68,68,0.15)` fill |

Nothing else was added — no speculative accents. The other five tiles use keys that already existed: Meals & Snacks → `meals`, Water → `water`, Food Inventory → `inventory`, Shopping List → `shopping`, Weight → `brand`, exactly as Step 3 lists.

`photos` and `workouts` are byte-identical to `colors.warning` and `colors.danger`. They are kept as separate accent keys rather than aliased, because the two roles are genuinely different: `warning`/`danger` are **semantic** ("expiring", "delete this"), while these are **identity** ("the camera tile", "the dumbbell tile"). A tile should not have to say `colors.danger` to mean "Workouts", and a later change to the danger red must not silently repaint the Workouts tile. Both are `accents.*`, so contract 1 (accents are identity only, never controls) governs them.

Consequence for the type: `TrackingCategoryConfig` in `mobile/src/types/track.ts` drops `iconColor: string` / `backgroundColor: string` for a single `accent: AccentKey`, which makes an unmappable tile color a compile error instead of a hex typo. That file and `mobile/src/theme/tokens.ts` are the two files Task 7 touched beyond the seven the plan names.

### Task 7 — `EatNextHomeCard` imports `scoreTone` rather than mirroring it

Task 6 left this file a stale cross-reference: its `scoreChipCore/Mid/Low` and `stockBadge*` styles were copy-pasted from `library/styles.ts` keys that Task 6 deleted, under a comment explaining that presentation is per-surface so a local copy was fine "since nothing shared existed". Something shared exists now.

Both blocks are gone. The score chip is `<Badge label={String(top.score)} tone={scoreTone(top.score)} />`, importing the very same `scoreTone` from `@/src/components/track/meals/library/styles` that `MealRow`, `MealDetail` and `MealBuilder` use — so the same score is now provably the same color on Home and in the Library, rather than coincidentally similar. (`scoreTone` resolves `scoreBand` internally, so the local `scoreBand` import and the `band` local both went away; the threshold DECISION still lives only in `mealScore.ts`.) The import direction — a Home card reaching into the meal library's style module — is the smallest available fix: `scoreTone` is a pure `Record` lookup with no react-native runtime beyond the module it sits in, and hoisting it to a new shared module would be a Task 11 refactor, not a Task 7 restyle.

The stock badge is `<Badge label={stockBadge.label} tone={stockBadge.assemblable ? "success" : "warning"} />`. `success` matches the tone Task 6 gave the Library's own `"In stock"` badge; `warning` preserves the amber the missing-items half already had. `eatNextStockBadge` remains the single decision point for the copy and the green/amber split.

Resulting band → tone mapping, identical in both surfaces: `core → success`, `mid → warning`, `low → danger`.

Two small consequences of adopting `Badge`: it carries no `numberOfLines` (the old stock-badge `<Text>` had `numberOfLines={1}`), and its `alignSelf: "flex-start"` top-aligns it in the `alignItems: "center"` header row. Both are immaterial for the labels this renders ("In stock", "Missing 3", a 1-3 digit score) and neither was worth bending the primitive for.

### Task 7 — emergency card border converges to the 0.3 border tint

`EatNextHomeCard`'s emergency state painted `rgba(248,113,113,0.5)` — a third alpha level (`#F87171` at 50%) on top of the system's two. It is now `tint(colors.danger, 0.3)`, the same border alpha the banner recipe uses, over the tokenized `#EF4444`. Spec §4.2's whole purpose is collapsing "seven arbitrary alpha levels" onto `0.15` fill / `0.3` border, and a fourth alpha in a file this task exists to detoxify would be new drift. The emergency signal is unweakened in practice: the title and the `UtensilsCrossed` glyph both switch to full-strength `colors.danger` alongside it, which is what actually reads at a glance.

### Task 7 — unfilled progress tracks take `colors.textFaint` (three instances)

The Tasks 7-10 standing rule on outline color names "an unfilled progress ring" as an affordance that uses `colors.textFaint`. Applied uniformly to all three unfilled tracks Home renders side by side, so they do not disagree with each other or with Task 9's `WaterProgressRing`:

- `MealsHomeCard`'s `MiniRing` backing circle: `rgba(255,255,255,0.08)` → `colors.textFaint`.
- `MealsHomeCard`'s macro bar `lineStyles.track`: same.
- `WaterIntakeHomeCard`'s `progressTrack`: `rgba(59,130,246,0.15)` → `colors.textFaint`.

The water one is the deliberate part: `rgba(59,130,246,0.15)` is exactly `tint(colors.accents.water)`, so keeping the identity read would have been a one-token swap. It went to `textFaint` anyway — the *filled* portion still carries the water accent, which is where the identity belongs, and having the Meals card's tracks grey while the Water card's stayed blue would have made two adjacent half-width cards in the same grid look like two systems. Track radii `1.5`/`2` → `radii.pill` (identical rendering on a 3-4pt bar), per the Task 6 precedent for `lib.barTrack`.

### Task 7 — `home.tsx` had twelve dead style keys, not one

Step 1 says to delete "the dead duplicate card styles in `home.tsx:246-254`" — that range is the `card` key alone. Auditing every key against the JSX found that `card`, `cardHeader`, `cardTitle`, `iconContainer`, `iconGreen`, `iconBlue`, `cardValue`, `cardSubtext`, `emptyState`, `emptyStateIcon`, `emptyStateTitle` and `emptyStateText` are **all** unreferenced — the fossil of the summary cards before `MealsHomeCard`/`WaterIntakeHomeCard` were extracted into their own components. All twelve are deleted; the file's stylesheet drops from 24 keys to 12, every one of which is used. Leaving eleven dead keys that the grep gate would still flag for hex would have failed the task's own definition of done.

### Task 7 — `Screen` adoption declined for both screens

Neither adoption is a clean win, and the plan requires neither.

- **`home.tsx`**: its `ScrollView` carries a `RefreshControl`, which `Screen` owns the `ScrollView` for and cannot pass through — the same blocker that kept `ViewFoodDetailsScreen` off `Screen` in Task 5. It also renders a sticky absolutely-positioned "Refreshing..." overlay as a sibling of the scroller, and a top bar whose only content is a right-hand profile button. Adopting `Screen` would have deleted pull-to-refresh.
- **`track/index.tsx`**: no such blocker, but nothing to gain either. Its header is a *bordered* bar containing the title, whereas `Screen variant="root"` renders an unbordered chrome bar (empty here, since there are no header props) and moves the title into the scroll body. That is a visible restructure of a screen this task was asked to retokenize, and `Screen`'s `scrollContent` `gap: spacing.lg` would additionally re-space the three sections. Kept and retokenized: the title converges to `typography.titleRoot` (32/bold → 28/bold, spec §4.5) and the gutter to `spacing.screenGutter`, which is the substance of what §6 asks for.

Home's profile button likewise stayed a plain `TouchableOpacity`, retokenized. `IconButton square` is a 44×44 **brand-filled** control and `circle` a tinted green one; the profile glyph is deliberately quiet grey chrome, and either variant would have turned it into a green button — a visual change the plan does not ask for.

### Task 7 — bottom padding: both screens converge on `insets.bottom + spacing.xxl`

Step 1 prescribes this for `home.tsx`'s magic `paddingBottom: 100`. `track/index.tsx`'s equivalent — a trailing `<View style={{ height: 32 }} />` spacer inside the `ScrollView` — was folded into `contentContainerStyle` the same way, matching the Task 5 precedent in `FoodInventoryScreen` (drops a per-render element and gains the safe-area term the spacer never had).

Verified this does not hide content behind the tab bar: `app/(tabs)/_layout.tsx`'s `tabBarStyle` has a fixed `height: 88` and is **not** absolutely positioned, so the tab bar sits below the scene rather than over it, and `@react-navigation/bottom-tabs` does not shrink the scene's `SafeAreaInsetsContext`. The trailing space therefore goes from a flat 100 to `insets.bottom + 24` (≈58 on a notched device, 24 on a flat one) of pure slack below the last card — less dead space, nothing clipped.

### Task 7 — typography convergences, and the sizes that were deliberately kept

Converged to tokens:

- `home.tsx` `userName` 32/`"bold"` → `typography.titleRoot` (28/bold) + `colors.text`; `track/index.tsx` `headerTitle` the same. Spec §4.5 fixes the root title at 28.
- `track/index.tsx` `sectionTitle` 12/600 `letterSpacing: 1` → `typography.section` (13/700 uppercase, `letterSpacing: 0.5`, `textMuted`). The strings were already uppercase, so `textTransform` is a no-op here.
- `EatNextHomeCard`'s five 13pt text styles → `typography.body` (14). `#D1D5DB` (a hex with no token) and `#9CA3AF` both land on `colors.textMuted`; the CTA line lands on `colors.brand`; the expiring line on `typography.caption` + `colors.warning`.
- `title` 16/700 → `typography.rowTitle` (16/600); `MealsHomeCard`'s ring `topText` 16/`"bold"` → `typography.rowTitle`; `WaterIntakeHomeCard`'s `cardValue` `"bold"` → `"700"`. `"bold"` is spec-banned outside `titleRoot`.
- The two home cards' `cardTitle` 14/500 → `typography.body` + `textMuted`; `cardSubtext` 11 → `typography.caption`.

Deliberately **not** converged, each with a reason:

- `home.tsx`'s section headers stay screen-owned 20/600 text, recolored only — Step 1 says so explicitly.
- `WaterIntakeHomeCard`'s `cardValue` keeps `fontSize: 22`. It sits between `rowTitle` (16) and `titleRoot` (28) with no token in between; either substitution visibly resizes the headline number of a half-width tile, which is a layout change rather than a restyle. (22 is on spec §4.3's banned list, but that list governs *spacing*, and Task 6's ban-driven `22 → 24` fix was a checkbox's box size, not a font size.)
- `MealsHomeCard`'s ring/macro-line sub-caption sizes (9 and 11) are kept. Spec §4.5 defines no token below `caption` (12) and these are sized to fit inside a 64pt ring; same call Task 6 recorded for `lib.input`'s 15. Their colors and spacing are tokenized.

### Task 7 — smaller deviations, recorded together

- **The plan's `TrackingCard` source had one untokenized literal.** Step 2's full-replacement source ends `title: { ...typography.rowTitle, color: colors.text, marginTop: 8 }`. Shipped as `marginTop: spacing.sm` — same value, and an 8 hardcoded in the plan's own exemplar tile would be an odd precedent for the system's most-copied component. Same class of plan-authoring fix as Task 3's `IconButton` `22`. The glyph's `size={32}` **was** kept as the plan wrote it: `icons.lg` (24) would visibly shrink every Track hub tile's glyph, and 32 is what ships today.
- **`RampHomeBanner` takes the recipe's uniform padding.** Its `paddingHorizontal: 14` / `paddingVertical: 12` become `padding: spacing.md`, matching `FoodInventoryScreen`'s shipped banner exactly so the two variants of one recipe are one shape. The round-up-on-control-padding rule does not bite here: the banner is full-width, so its horizontal padding sets where the text starts, not how big the tap target is. `gap: 10 → spacing.md` and `borderRadius: 12 → radii.row` follow the standing tie/mapping rules.
- **18pt glyphs → `icons.md`.** `RampHomeBanner`'s `TrendingUp` and `EatNextHomeCard`'s `UtensilsCrossed` were `size={18}`, which is not a token; both round to `icons.md` (20). `home.tsx`'s profile `User` glyph was already exactly `icons.lg`.
- **Icon tint wells keep their geometry, gain the `tint()` recipe.** The two home cards' `iconContainer` fills go from hand-typed `rgba(…, 0.2)` to `tint(colors.accents.meals)` / `tint(colors.accents.water)` (and `tint(colors.success)` for water's goal-hit state) — 0.2 → the system's single 0.15, `borderRadius: 8 → radii.control`, `padding: 6 → spacing.sm` (tie rounds up).
- **Half-width sizing survives the `Card` swap.** `Card variant="panel"` cannot express `width: "47%"` / `minWidth: 160`, so both home cards pass a `cardSizing` style through `Card.style`, exactly as Task 6's `lib.cardSpacing` does. `EatNextHomeCard`'s `marginBottom` is passed the same way as `cardSpacing`. Padding converges 20 → `spacing.lg` (16) in all three, which is the point of the panel variant.
- **`WaterIntakeHomeCard`'s pace colors.** `"on pace"` blue `#3B82F6` → `colors.accents.water` (identity, on the water card); goal-hit/ahead green → `colors.success`; behind amber → `colors.warning`. No control changed color — these are status text, not affordances.
- **Not fixed, flagged for Task 8: `lib/mealMacros.ts`'s `macroColor()` returns raw hex** (`#3B82F6`, `#22C55E`, `#F59E0B`, `#EF4444`, `rgba(59,130,246,0.7)`) and `MealsHomeCard` renders those values into its ring and macro bars. The card itself is grep-clean because the literals live in the lib, but the color is untokenized in substance. It was left alone deliberately: `mealMacros` is shared with `MealsScreen` and its modal fleet, so deciding which blue means "in progress" versus the water accent is Task 8's call, in the task that owns those call sites. Task 8 should tokenize `macroColor` when it sweeps that file's consumers.
