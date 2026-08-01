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

### Standing rule (Tasks 8-10) — unfilled progress / meter / segment tracks take `colors.surface2`

**An unfilled track — the groove a progress ring, meter or bar fills into, and the trough behind a segmented control — is `colors.surface2`.** Spec §4.1 assigns `surface2` to exactly this: "raised elements: modal sheets, inputs, chips, **segmented tracks**". Spec §6 already routes segmented-control tracks there; this simply states the obvious extension, that a progress groove is the same kind of object.

This is **not** a `textFaint` case. The Tasks 7-10 outline rule scopes `textFaint` to an outline that *is itself the affordance* — an empty checkbox, a radio — where a too-dim stroke destroys the only signal that the control exists. A track is a bounding element: its job is to show the extent the fill travels through, and the fill (brand, or the domain accent) is what carries the signal. An opaque mid-grey groove competes with its own fill.

Binding on **Task 8**'s macro bars and **Task 9**'s `WaterProgressRing` unfilled track. Applied in Task 7 to all three of Home's tracks:

- `MealsHomeCard`'s `MiniRing` backing circle: `rgba(255,255,255,0.08)` → `colors.surface2`.
- `MealsHomeCard`'s macro bar `lineStyles.track`: same.
- `WaterIntakeHomeCard`'s `progressTrack`: `rgba(59,130,246,0.15)` → `colors.surface2`.

Note what the water one gives up deliberately: `rgba(59,130,246,0.15)` is exactly `tint(colors.accents.water)`, so keeping the identity read there would have been a one-token swap. It goes to `surface2` anyway, because the *filled* portion already carries the water accent — that is where identity belongs — and three adjacent tracks in one Home grid must not look like three systems. Track radii `1.5`/`2` → `radii.pill` (identical rendering on a 3-4pt bar), per the Task 6 precedent for `lib.barTrack`.

*(This supersedes an earlier draft of this amendment that sent all three tracks to `colors.textFaint` on the reading that the outline rule's "unfilled progress ring" covered them. It does not: that clause is about affordance outlines, and stretching it to an opaque fill contradicted spec §4.1's own name for these. Corrected in the follow-up commit, before any later task could inherit it.)*

### Task 7 — `home.tsx` had twelve dead style keys, not one

Step 1 says to delete "the dead duplicate card styles in `home.tsx:246-254`" — that range is the `card` key alone. Auditing every key against the JSX found that `card`, `cardHeader`, `cardTitle`, `iconContainer`, `iconGreen`, `iconBlue`, `cardValue`, `cardSubtext`, `emptyState`, `emptyStateIcon`, `emptyStateTitle` and `emptyStateText` are **all** unreferenced — the fossil of the summary cards before `MealsHomeCard`/`WaterIntakeHomeCard` were extracted into their own components. All twelve are deleted; the file's stylesheet drops from 25 keys to 13, every one of which is used. Leaving eleven dead keys that the grep gate would still flag for hex would have failed the task's own definition of done.

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

- **The plan's `TrackingCard` source had two untokenized literals; `icons` gains `xl: 32`.** Step 2's full-replacement source ends `title: { … marginTop: 8 }` and renders the glyph at `size={32}`. Both ship tokenized: `marginTop: spacing.sm`, and a new **`icons.xl = 32`** token added to `mobile/src/theme/tokens.ts`. Zero pixels change — 32 is the right size for a tile glyph and was never in question; what changed is that it is now nameable. The token addition is justified the same way the three `accents` keys were: a real consumer exists today, and this is the component Tasks 8-10 will read first, so a literal here would be the precedent for the system's most-copied tile. Same class of plan-authoring fix as Task 3's `IconButton` `22`.
- **`RampHomeBanner` takes the recipe's uniform padding.** Its `paddingHorizontal: 14` / `paddingVertical: 12` become `padding: spacing.md`, matching `FoodInventoryScreen`'s shipped banner exactly so the two variants of one recipe are one shape. The round-up-on-control-padding rule does not bite here: the banner is full-width, so its horizontal padding sets where the text starts, not how big the tap target is. `gap: 10 → spacing.md` and `borderRadius: 12 → radii.row` follow the standing tie/mapping rules.
- **18pt glyphs → `icons.md`.** `RampHomeBanner`'s `TrendingUp` and `EatNextHomeCard`'s `UtensilsCrossed` were `size={18}`, which is not a token; both round to `icons.md` (20). `home.tsx`'s profile `User` glyph was already exactly `icons.lg`.
- **Icon tint wells keep their geometry, gain the `tint()` recipe.** The two home cards' `iconContainer` fills go from hand-typed `rgba(…, 0.2)` to `tint(colors.accents.meals)` / `tint(colors.accents.water)` (and `tint(colors.success)` for water's goal-hit state) — 0.2 → the system's single 0.15, `borderRadius: 8 → radii.control`, `padding: 6 → spacing.sm` (tie rounds up).
- **Half-width sizing survives the `Card` swap.** `Card variant="panel"` cannot express `width: "47%"` / `minWidth: 160`, so both home cards pass a `cardSizing` style through `Card.style`, exactly as Task 6's `lib.cardSpacing` does. `EatNextHomeCard`'s `marginBottom` is passed the same way as `cardSpacing`. Padding converges 20 → `spacing.lg` (16) in all three, which is the point of the panel variant.
- **`WaterIntakeHomeCard`'s pace colors.** `"on pace"` blue `#3B82F6` → `colors.accents.water` (identity, on the water card); goal-hit/ahead green → `colors.success`; behind amber → `colors.warning`. No control changed color — these are status text, not affordances.
- **Not fixed, flagged for Task 8: `lib/mealMacros.ts`'s `macroColor()` returns raw hex** (`#3B82F6`, `#22C55E`, `#F59E0B`, `#EF4444`, `rgba(59,130,246,0.7)`) and `MealsHomeCard` renders those values into its ring and macro bars. The card itself is grep-clean because the literals live in the lib, but the color is untokenized in substance. It was left alone deliberately: `mealMacros` is shared with `MealsScreen` and its modal fleet, so deciding which blue means "in progress" versus the water accent is Task 8's call, in the task that owns those call sites. Task 8 should tokenize `macroColor` when it sweeps that file's consumers.

### Standing rule (Tasks 8-10) — which loading treatment to use where

Two treatments, chosen by what contains the spinner. No third one, and no new API on the primitive:

- **`LoadingState`** — screen-level or full-list-region loading. It is deliberately full-bleed (`flex: 1` + opaque `colors.bg`) and it always renders a label. Used as a list's `ListEmptyComponent`, the content container must carry `flexGrow: 1` or it collapses to its own padding (Task 5's `gridContainer`, Task 6's Shopping list).
- **A bare `<ActivityIndicator color={colors.brand} />`** — loading *inside* a `Card`, a modal sheet, or any inline region. `LoadingState` there would paint a `bg`-colored patch over the card surface and invent a "Loading..." string the surface never had.

`EatNextHomeCard`'s loading branch is the reference for the second case and now carries a comment saying so. **Do not** add an `inline` mode, a nullable label, or a transparent variant to `LoadingState` to unify these — one line of `ActivityIndicator` is smaller than the prop surface that would replace it, and no call site has asked. Task 8's seven modals are the next consumers of this rule.

Related, recorded so it is not mistaken for an oversight: **`home.tsx`'s full-screen loading branch was left hand-rolled.** It is a `SafeAreaView` + large brand `ActivityIndicator` with no label. Swapping in `LoadingState` would have introduced a visible "Loading..." string that the screen does not show today — a behavior change, which the migration tasks forbid. It is already tokenized (`colors.brand`, `colors.bg`), so the grep gate is satisfied without it.

### Task 7 (review follow-up) — grid widths, header convergence, and one unrecorded hue shift

Three fixes from the Task 7 review, in the follow-up commit alongside the `surface2` correction above.

**`width: "47%"` → `flex: 1` on both home cards.** `home.tsx`'s `grid` is `flexDirection: "row"` + `flexWrap: "wrap"` + `gap: spacing.lg`. Two children at 47% consume `0.94W + 16`, so the pair lands roughly 6pt short of the right gutter on a 402pt device — invisible while the cards were bespoke, obvious now that a full-width `EatNextHomeCard` sits directly above them with the same gutter. The percentage predates the `gap` and double-counts the separation. Both `cardSizing` styles are now `{ flex: 1 }` (the `minWidth: 160` floor goes with it — it existed to stop the percentage collapsing on narrow devices, and a zero-basis flex child in a two-item row cannot). The `gap` now owns the separation exactly, at any width. `cardSizing` is kept as the style key: `Card.style` is the sanctioned extension point for placement the primitive can't express.

**`WaterIntakeHomeCard`'s `cardHeader` converges 16 → `spacing.md` (12),** matching `MealsHomeCard`'s. Pre-existing drift that was invisible while the two cards had independent bespoke styling; with both now on `Card variant="panel"` at identical padding, side by side in one grid row, a 4pt difference in where the value block starts reads as a rendering bug.

**Unrecorded value change, now itemized:** `home.tsx`'s `topBar.borderBottomColor` was `#1E293B` (the literal value of `surface2`) and is now `colors.border` (`#1F2937`). Systemically required — spec §4.1 makes `border` the only border color, and every other border in the commit went there — but it is a real, if small, hue shift rather than a pure rename, and every other value shift in that commit is itemized, so this one should be too.

### Notes for Task 11 (recorded, not acted on)

- **`track/index.tsx`'s `iconMap: Record<string, any>` is the last unsafe field in the Track hub config.** With `iconColor`/`backgroundColor` replaced by a typed `accent`, `icon: string` is the only remaining way to write a value that compiles and crashes at render: `icon: "Utensls"` type-checks, `iconMap["Utensls"]` is `undefined`, and `<undefined />` throws. The real fix is deleting the indirection — the file already imports all eight lucide components, so the config field can simply be `icon: LucideIcon` and the map disappears. That is a structural change with no styling content, so Task 7 correctly left it alone; Task 11's closeout is the place for it.
- **Do not copy `WaterIntakeHomeCard`'s raw `fontSize: 22`.** One documented off-scale exception (recorded above, with its reason) is tolerable; a second and third would be drift dressed up as precedent. If Task 9's water screen wants a headline number, it uses a type token — and if none fits, that is an argument for adding one token, not for repeating the literal.

### Task 8 — the `macroColor()` decision: a `colors.macros` group keyed by STATE, not by macro name

Task 7 deferred `mobile/src/lib/mealMacros.ts`'s `macroColor()` to this task. It is now tokenized. The brief suggested `colors.macros.protein/carbs/fat/…`; reading the function shows a materially different shape, so the group ships keyed by **progress state**:

| Key | Value | Meaning | Where the value came from |
|---|---|---|---|
| `macros.under` | `#3B82F6` | in progress toward a goal / approaching a cap | the `!goal`, `ratio >= 0.8` cap and `ratio < 1.0` branches |
| `macros.met` | `#22C55E` | at or past a "hit this" goal | the `ratio >= 1.0` non-cap branch |
| `macros.atCap` | `#F59E0B` | at a "do not exceed" cap | the `ratio >= 1.0` cap branch |
| `macros.overCap` | `#EF4444` | more than 10% past a cap | the `ratio >= 1.1` cap branch |

Exactly four keys, every value byte-identical to the literal it replaced, so nothing renders differently. **Why not per-macro names:** `macroColor(value, goal, m)` never colors "protein" differently from "carbs" — `m` is read only to decide whether the macro is a *cap* type (`sodium`/`sugars`). The palette is a verdict scale, and naming it `protein`/`carbs`/`fat` would have invented a mapping the code does not have.

**`#3B82F6` is byte-identical to `accents.water`, and the other three to `success`/`warning`/`danger`. They are deliberately NOT deduplicated, and a future reader must not "clean this up".** These are marks on a meter — a bar fill showing 60% of a sodium cap — not a domain identity and not a semantic verdict badge. Under `macros` the blue means "in progress", it does not mean "Water"; changing the app's water accent must not repaint a carbs bar, and changing the danger red must not repaint a sodium bar. This is the same argument Task 7 recorded for keeping `accents.photos`/`accents.workouts` separate from `warning`/`danger`.

The fifth return value, `"rgba(59, 130, 246, 0.7)"` (comfortably under a cap), is now `tint(colors.macros.under, 0.7)` — same rendered color, no raw literal. It keeps its 0.7 rather than collapsing onto the system's 0.15/0.3: those two alphas are for tinted *surfaces*, and this is a meter fill that has to stay a legible mark on `surface2`. (`tint()` emits `rgba(59,130,246,0.7)` without the old string's spaces — identical to the renderer.)

`mealMacros.ts` imports `../theme/tokens` **relatively**, not via the `@/` alias: the module is covered by the Jest suite through `eatNext.test.ts`, and `mobile/jest.config.js` declares no `moduleNameMapper`, so the aliased form failed the suite with `Cannot find module '@/src/theme/tokens'`. Every other `src/lib` cross-import is relative for the same reason. (Config left untouched — this is the smaller fix, and the file already sat inside the tested lib.)

`MealsWeeklySummaryModal`'s week macro-split bar and its three percentage labels also move onto this palette (`met`/`atCap`/`under` reading as P/C/F) — they were the same three literals, hand-typed.

### Task 8 — the file list grew from eleven to seventeen, each one forced

The plan names eleven files. Six more were unavoidable, and none is discretionary polish:

- **`mobile/src/theme/tokens.ts`** and **`mobile/src/lib/mealMacros.ts`** — the `macroColor` work above, which this task was explicitly asked to do.
- **`meals/MealAddForm.tsx`** — it is the only consumer of `mealsScreenStyles`' `saveButton` (`#F97316`), `cancelButton`, `button`, and `sectionTitle` (the 18/600 the plan sends to `SectionHeader`). Converting those keys without converting their one call site would have left orphans, which this task forbids.
- **`MealsNutritionCard.tsx`** — the plan's own Step 1 names `MealsNutritionCard.tsx:87-93` as the reference `tint(accents.meals)` survivor; it was still a hand-typed `rgba(249, 115, 22, 0.08)` at a third alpha level, and it carries a 20pt gutter.
- **`MealsInsightsCard.tsx`** and **`meals/RecentFoodsRow.tsx`** — gutter alignment. Step 2 says "gutter 20 → 16". These two render in the same column as everything the task converges, with their own `marginHorizontal: 20` / `paddingHorizontal: 20`. Converting only the eleven would have left three blocks sitting 4pt wider than their neighbours — a misalignment that does not exist today, since everything is uniformly 20. Same reasoning Task 5 used to pull in `CategoryTabs`/`SubcategoryPills`. (`MealUndoSnackbar` needed nothing: it was already pinned at `left/right: 16`.)

### Task 8 — `Screen` adoption declined for the screen and for all seven modals

- **`MealsScreen`** — the plan says so outright, and the blocker is the familiar one: its `ScrollView` carries a `RefreshControl`, which `ui/Screen` owns the scroller for and cannot pass through (the same reason Task 5 kept `ViewFoodDetailsScreen` off it and Task 7 kept `home.tsx` off it). The screen also owns a three-slot chrome bar (back, full-width search field with an inline barcode/clear action, add button). Header kept and retokenized.
- **`FoodPreviewModal`, `ManualFoodEntryModal`** — `presentationStyle="pageSheet"` with a three-slot header (close ✕ / centered title / favourite star or spacer). `Screen variant="detail"` offers a back **chevron** plus `headerRight` and has no `headerLeft` (deliberately, per the Task 4 amendment), so adopting it would have replaced the ✕ with a ‹ — a navigation-affordance change, not a restyle. Both also have a bordered footer action bar outside the scroller, which `Screen` cannot express.
- **`MealsWeeklySummaryModal`** — its back control is a chevron **plus the word "Meals"**, i.e. a labelled back affordance; `Screen`'s is chevron-only, and it renders its own 28pt title in the body rather than a bar title.
- **`FoodCorrectionModal`, `MealLogEditorModal`, `QuickAdjustmentModal`** — centred `transparent` sheets on a scrim, not full screens. They take spec §6's modal recipe instead (`colors.scrim` backdrop + `Card variant="panel"` sheet + `Button` pair), which is what the plan asks for.
- **`BarcodeScannerModal`** — a camera viewfinder. Chrome only, per the plan.

All full-screen modals keep `mobile/CLAUDE.md`'s `useSafeAreaInsets()` + `StatusBar` pattern exactly as they had it; no safe-area handling changed anywhere.

### Task 8 — modal sheets are `Card panel` (`surface`), not `surface2`; recording the spec's internal tension

Spec §4.1 lists "modal sheets" under `surface2`, but spec §6 says "Modals keep **`Card variant="panel"`** sheets on `scrim` backdrops" and §5.3 defines `panel` as `surface`. The plan's Step 2 repeats §6 verbatim. §6/§5.3 win — they name the primitive, and a primitive is the more specific instruction — so the three centred sheets went from `colors.card` (`#1E293B`) to `Card panel`'s `colors.surface` (`#111827`). Their inputs are `surface2`, which is what §4.1's "raised elements: … inputs" actually buys: the sheet is now darker than the fields sitting on it, which reads correctly. Recorded because §4.1 is not wrong so much as out-voted, and Task 9's water modals will hit the identical fork.

Same shift, same reason, for every `colors.card` block that became a `Card`: the meal cards in `MealsDayList`, the search-results block, `EatNextRow`'s suggestion chips, `MealsInsightsCard`, and the weekly summary's stat cells and section cards. `colors.card` was the shim's alias for `surface2`; `Card row` is `surface`.

### Task 8 — the orange/blue control sweep, itemized

Every one of these was an accent-colored control and is now brand:

| Control | Was | Now |
|---|---|---|
| header 44×44 add (`mealsScreenStyles:47-54`) | `#F97316` fill | `IconButton variant="square"` (+ `accessibilityLabel` it never had) |
| Today/Insights segment (`tabPillActive`) | `#F97316` fill | `surface2` track + `colors.brand` segment + `onBrand` label |
| "Jump to Today" | `colors.primary` (already brand) | `Button primary` + `icon={Calendar}` |
| "Meal Library" | `#3B82F6` label + dashed `#374151` | `Button secondary` + `icon={Utensils}` |
| "Weekly Summary" | `#F97316` label on `rgba(249,115,22,0.06)` | `Button secondary` + `icon={BarChart3}` |
| "Quick Adjustment" | `#F97316` label + dashed border | `Button secondary` + `icon={Zap}` |
| `MealAddForm` Cancel/Log Meal | `colors.card` / `#F97316` | `Button secondary` + `Button primary` |
| `FoodCorrectionModal:314-323` | `#F97316` confirm | `Button primary` (+ `secondary` cancel) |
| `FoodPreviewModal:727-747` | `#F97316` Log Meal | `Button primary` (+ `secondary` Save to Library) |
| `ManualFoodEntryModal:475-488` | `#F97316` CTA | `Button primary` |
| `MealLogEditorModal:326-335` | `#3B82F6` confirm | `Button primary` (+ `secondary` cancel) |
| `QuickAdjustmentModal` | `#F97316` confirm | `Button primary` (+ `secondary` cancel) |
| meal-type / serving-preset selectors (×4 files) | the meal type's own hue as a solid fill | solid `colors.brand` + `onBrand` label (standing rule: grouped single-select) |
| `ManualFoodEntryModal` "save to library" checkbox | `#F97316` fill, `✓` **text glyph** | `colors.brand` fill + lucide `Check`; unchecked outline `colors.textFaint` (affordance outline) |
| `BarcodeScannerModal` "Grant Permission" | `#8B5CF6` fill | `Button primary` |
| `BarcodeScannerModal` torch-on | `#FACC15` | `colors.brand` (the "on" state of a toggle) |
| `FoodPreviewModal` favourite star | `#F59E0B` fill/stroke | `colors.brand` (ditto) |
| `RecentFoodsRow` favourite badge | `#F59E0B` circle | `colors.brand` circle |

The last three are the judgement calls worth flagging to the owner, because they are hue changes rather than pure renames and the plan does not name them: **an amber "favourite" star and an amber torch indicator are now green.** §3 decision 3 makes every interactive control brand, and the filled state of a toggle is a control state — but `colors.warning` would have been a zero-change rename of `#F59E0B`, and it was rejected only because calling a favourite "warning" is the exact semantic-vs-identity confusion Task 7 refused. Easy to revert if the owner dislikes it; nothing else depends on it.

Orange survives exactly where the plan says and nowhere else: the `Utensils` title glyph (`accents.meals` at `icons.xl`), `tint(accents.meals)` info fills (`MealsNutritionCard`'s card, `FoodPreviewModal`'s nutrition panel, `ManualFoodEntryModal`'s barcode block, and an "edited" `Badge tone="meals"`), and macro/bar fills (the weekly summary's short-of-goal day bars). Blue survives nowhere as a control — only inside `colors.macros.under`, as a data mark.

**Full-strength orange TEXT did not survive.** `FoodPreviewModal`'s `nutritionValue`/`servingValue` and `ManualFoodEntryModal`'s `notFoundText` were `#F97316` copy sitting inside those tinted panels; the plan's "orange survives ONLY as…" list is exhaustive and does not include text. They are `colors.text` now, which is exactly what `MealsNutritionCard` — the plan's own reference for the sanctioned tint fill — already did with its values.

### Task 8 — ten dead style keys in `mealsScreenStyles.ts`, including two the plan asked to convert

Auditing all 85 keys against the three files that import the sheet (`MealsScreen`, `MealAddForm`, `MealsDayList`) found ten with no consumer at all: `summaryCard`, `summaryLabel`, `summaryGrid`, `summaryItem`, `summaryValue`, `summaryItemLabel`, `addButtonContainer`, `addButton`, `addButtonText`, `mealInfo`. All deleted, as Task 7 deleted `home.tsx`'s twelve.

Two of them are named in the plan's own Step 1: **the "full-width CTA `:176-189`" (`addButton`, `#F97316`) is dead code**, as is `summaryValue` (`#F97316`). They are the fossil of a summary card and an add button that `MealsNutritionCard` and the header `IconButton` replaced. There was no live full-width orange CTA on this screen to convert; deleting is the correct discharge of that instruction.

The sheet ends at 62 keys, every one used. Keys retired into primitives: `headerAddButton` → `IconButton`; `jumpToTodayButton`/`Text`, `weeklySummaryButton`/`Text`, `quickAdjustButton`/`Text`, `templatesButton`/`Text` → `Button`; `button`/`cancelButton`/`cancelButtonText`/`saveButton`/`saveButtonText` → `Button`; `sectionTitle` → `SectionHeader`; `mealCard` → `Card row`; `searchResults` → `Card row`; `deleteButton` → `IconButton tone="danger"`; `loadingText` → `LoadingState`; `emptyState`/`emptyStateText`/`emptyStateSubtext` → `EmptyState`.

### Task 8 — `EmptyState`/`LoadingState` needed a two-level `flexGrow` chain, not one

The standing loading rule says a list region's content container must carry `flexGrow: 1` or the `flex: 1` primitives collapse onto their own padding (Task 5's `gridContainer`). Here the primitives sit one level deeper than in Tasks 5-6: `ScrollView` → `contentContainer` → `MealsDayList`'s `mealsSection` → `EmptyState`. A grow on the content container alone is not enough — `mealsSection` has auto height, which breaks the definite-height chain, and the states would still have resolved to a 64pt box with their icon and copy overflowing upward into the "Meal Library" button.

Fix: `flexGrow: 1` on **both** — a new `scrollContent` style on the `ScrollView`'s `contentContainerStyle`, and `flexGrow: 1` added to `mealsSection`. Both are inert whenever the day has enough content to scroll (free space is zero or negative, so nothing stretches), and on the Insights tab `mealsSection` is not rendered at all, so the extra container height is pure slack below the last card. Worth stating as a rule for Task 9: **the grow must run all the way down to the primitive's parent, not just to the scroller.**

### Task 8 — typography convergences, and the ones deliberately declined

Converged:

- `pageTitle` 28/`"bold"` → `typography.titleRoot` (a pure rename) with the `Utensils` glyph now `accents.meals` at `icons.xl`.
- `dateText` 20/600 → `typography.titleBar` (17/600). It is a centred label in a navigation bar, which is exactly what §4.5 assigns `titleBar` to, and §4.5 already sanctions the identical shrink for Shopping's 20/700.
- `sectionTitle` 18/600 → `SectionHeader` (`typography.section`, 13/700 uppercase muted), per Step 2. The modals' 16/600 "Servings" / "Log as" / "Nutrition (per serving)" headings converge to `typography.section` in place; only `FoodPreviewModal`'s "Nutrition" row uses the actual `SectionHeader` component, because it is the one that needs the `badge` and `action` slots.
- `MealsNutritionCard`'s 14/600 card title, `MealsInsightsCard`'s 13/600, the weekly summary's 12/700 card titles and `searchResultsHeader`'s 11/600 all land on `typography.section` — five hand-rolled variants of one label style.
- `FoodPreviewModal`'s `productName` 22/`"bold"` → `typography.titleRoot` (28/bold). This is a real size increase and the only one in the task. `"bold"` is banned outside `titleRoot`, 22 has no token, and Task 7's own note for Task 11 says the answer to "no token fits" is a type token, not a repeated literal. `servingValue` was already 28/bold, so it is a pure rename.
- The weekly summary's `title` 24/bold → `titleRoot`, `statValue` 22/700 → `titleRoot`; `MealsInsightsCard`'s `statValue` 22/700 → `typography.rowTitle` + 700 (it sits in a four-across row inside a card, where 28 would not fit).

Declined, with reasons: **input text stays `fontSize: 16`** in every form field — §4.5 defines no input token, matching Task 6's call on `lib.input`'s 15. **`getMealTypeColor`'s five meal-type hues stay** (see the flag below).

### Task 8 — spacing, icon and opacity conversions worth naming

- **Gutter 20 → `spacing.screenGutter` (16)** on every block: header, title row, date navigator, tabs, pace/suggested wrapper, search results, action rows, meals section, distribution wrapper, plus `MealsNutritionCard`, `MealsInsightsCard`, `RecentFoodsRow`, and the modals' `scrollContent`/`actions` padding. One gutter owner per screen, applied per-element because `MealsScreen` does not adopt `Screen`.
- **Off-grid literals** follow the standing rules: control touch-padding rounds **up** (`searchBar`/`mealTypeButton`/`searchResultRow` `paddingVertical: 10 → spacing.md`), ties round up (`gap: 10 → spacing.md`, `marginBottom: 6 → spacing.sm`), non-control values take the nearest step. The two negative nudges (`weeklySummaryButton`'s `marginTop: -4`, `quickAdjustButton`'s `+4`) are gone with the styles that carried them; all four screen actions now share one `actionRow` spacing.
- **`navArrowDisabled` opacity 0.3 → 0.5.** §5.1 makes 0.5 "the only dimming mechanism", and `Button`/`IconButton` both dim at 0.5 — three different disabled opacities on one screen was the drift.
- **Icon sizes.** Chevrons go to `icons.lg` on §4.6's "back chevron always `lg`" rather than by rounding (28 is an exact tie between `lg` and `xl`, which the rounding rules do not resolve). `Share2` 22 → `icons.lg`, `Package`/`Utensils`/`Search`/`X`/`ScanBarcode` 18/20 → `icons.md`. `RecentFoodsRow`'s favourite star 10 → `icons.sm` (16), with its badge circle 18 → 24 to hold it — the one place an icon visibly grows.
- **Radii.** 10/12/14/16/22 → `radii.control`/`row`/`pill`/`panel`. `MealLogEditorModal`/`QuickAdjustmentModal`'s meal-type chips and `MealsDayList`'s meal-type badge take `radii.pill`, matching `Badge`.
- **Unfilled tracks → `colors.surface2`** per the standing rule: the weekly summary's `splitBar` and `dayBarTrack` (both were `rgba(255,255,255,0.04)`), and the Today/Insights segment track.
- **Borders.** `#374151`, `rgba(255,255,255,0.04)` and `rgba(255,255,255,0.06)` all land on `colors.border`. The one exception is `ManualFoodEntryModal`'s checkbox, which takes `colors.textFaint` because that outline *is* the affordance.

### Task 8 — `MealsWeeklySummaryModal`'s `width: "47%"` grid, converted as instructed

`statsRow` was `flexWrap: "wrap"` + `gap: 10` with four `width: "47%"` cells, which double-counts the gap the same way Task 7's home cards did. The four cells are now two explicit `statsRow`s of two `Card variant="row"` children at `flex: 1`, separated by `gap: spacing.md`. Identical 2×2 layout, exact widths at any device width, and the cells pick up the `Card` recipe instead of re-declaring surface/radius/border. No percentage widths remain in the task's files.

### Task 8 — `BarcodeScannerModal`: why the viewfinder masks are not `colors.scrim`

Camera chrome only; the scanner, the permission request and the torch state are untouched. Every hex is gone, but the four dark panels (`rgba(0,0,0,0.8)` header, `rgba(0,0,0,0.6)` ×3 masks) did **not** collapse onto `colors.scrim` (`rgba(0,0,0,0.5)`). `scrim` is defined as the modal-backdrop value, and these are not backdrops: their darkness is functional — it is the only thing keeping white chrome and the instruction copy legible over an arbitrarily bright live camera image — so dropping the header from 0.8 to 0.5 would degrade a real affordance to satisfy a token whose stated purpose is different. They are `tint(colors.bg, 0.8)` / `tint(colors.bg, 0.6)` instead: alpha preserved exactly, no raw literal, and every value token-derived. The only visible consequence is that the veil is now `#0A0F1E`-based rather than pure black, i.e. a very faint navy cast at 60-80% opacity. The container's `#000000` is `colors.bg`.

Also dropped a pre-existing unused `Alert` import from that file (it would trip Task 11's lint backstop).

### Task 8 — smaller deviations, recorded together

- **`MealsDayList`'s trash icon → `IconButton variant="circle" tone="danger"`.** It was a bare 18pt `mutedForeground` `Trash2` in a 4pt pad. The standing destructive rule sends icon-only destructive row actions to `tone="danger"`; it also gains a real 32pt+hit-slop target and an `accessibilityLabel` naming the meal. Note this delete is **unguarded** (no confirm `Alert`), which is precisely the case the Task 6 amendment argued must keep its red.
- **`EatNextRow`'s stock chip → `Badge`.** Its five copy-pasted `stockBadge*` styles (a local mirror of `EatNextHomeCard`'s, itself mirroring the meal library's) are deleted; the chip renders `<Badge tone={assemblable ? "success" : "warning"} />`, the same pair Task 7 gave the Home card, so the two Eat Next surfaces now provably match rather than coincidentally match. The chip body is `Card variant="row"`. The badge grows from 10pt text in a 5/1 box to `Badge`'s 12pt in a 10/3 box — the "denser geometry" the file's comment defended is given up on purpose, since sharing the primitive is the point. Comments updated, not left stale.
- **The three "secondary" screen actions lost their differentiating hues and their dashed borders.** Meal Library was blue, Weekly Summary orange-on-tint, Quick Adjustment orange-on-dashed. All three are now identical `Button secondary` rows, distinguished by label and leading icon. That is the intended outcome of "controls are not accents", but it is the most visible single change on the Insights tab.
- **`Button` icons render leading at `md` (20pt)**, so the four converted actions show a 20pt glyph where they had 16. Fixed geometry of the Task 3 primitive; not modified, per the Task 6 precedent.
- **`RecentFoodsRow`'s loading branch → a bare `<ActivityIndicator color={colors.brand} />`**, not `LoadingState`: it is an inline strip inside the screen's scroller, which is the second half of the standing loading rule. Its "Quick Add" heading stays.
- **`FoodPreviewModal`'s inventory row takes the banner recipe's `success` variant** (`tint(success)` fill, `tint(success, 0.3)` border, `radii.row`) — it was `rgba(34,197,94,0.08)`/`0.3`, i.e. a fifth alpha level. The `Switch` goes `trackColor {{ surface2, brand }}` + `thumbColor colors.text` (not `onBrand`, which means "on a brand fill" — the Task 5 precedent).
- **The three state pills in `FoodPreviewModal` → `Badge`:** "edited" `tone="meals"` (a sanctioned tint-orange info fill), "auto-scaled" `tone="neutral"` (it was `#3B82F6`, and blue has no identity role here), "per 100 g/mL" `tone="warning"` (it was `#EAB308`, a yellow with no token; `per100Hint` follows to `colors.warning`). "Edit" becomes the `SectionHeader` `action` slot as a `Button variant="ghost" size="sm"`.
- **`FoodPreviewModal`'s serving steppers stay bespoke, tokenized in place.** They are neutral 44×44 chrome, not accent-colored, so contract 1 does not reach them; promoting them to `IconButton square` would have repainted a stepper brand-green, which is a change the plan does not ask for. Same call for the screen's date-navigation arrows and the share button.
- **`Button` cannot flex**, only stretch, so every side-by-side pair (`formButtons`, and each modal's `actions`) wraps its buttons in a `flex: 1` `View` with `fluid` — the `footerButton` pattern Task 5 established in `EditFoodScreen`.
- **Save/confirm buttons moved from a `"Saving…"` label swap to `Button`'s `loading` prop** in all three editor modals. Press-blocking is identical (`Button` blocks on `disabled || loading`); the compound `disabled={saving || X}` conditions are split into `loading={saving} disabled={X}`, which is the same boolean.
- **`MEAL_TYPES`' `color` field dropped from the four local copies** in `FoodPreviewModal`, `ManualFoodEntryModal`, `MealLogEditorModal` and `QuickAdjustmentModal`, since the active chip is brand now and nothing else read it. The arrays were not consolidated onto `mealsHelpers`' copy — that is a refactor, not a restyle.

### Task 8 — flagged, NOT fixed: `mealsHelpers.ts`'s five meal-type hues are still raw hex

`mobile/src/components/track/meals/mealsHelpers.ts:5-11` still holds `MEAL_TYPES` with `#F59E0B`/`#10B981`/`#3B82F6`/`#8B5CF6`/`#EC4899`, which `getMealTypeColor()` feeds into `MealsDayList`'s meal-type badge fill. This is the same shape of problem `macroColor` had, and `MealsDayList.tsx` itself is grep-clean because the literals live in the helper — exactly the situation Task 7 flagged and handed to this task.

It was left alone deliberately rather than swept in: the file is not in the plan's list, the badge is the *only* surviving consumer now that all four meal-type selectors are brand, and the honest fix is a five-key `colors.mealTypes` group whose members would collide with `accents.water`/`accents.inventory`/`accents.measurements` on three of five values — a naming decision worth making on purpose rather than as a side effect of a control sweep. `Badge` cannot express it either: its tone set has no per-meal-type slot. **Task 11's closeout should either add the group or decide the badge does not need five hues.**

### Task 8 — no behavior bug found

Reviewed hunk by hunk: no handler, data fetch, effect dependency, modal open/close path, navigation call, camera or permission flow changed. The two structural edits — folding the `<View style={{ height: 40 }} />` spacer into `contentContainerStyle` as `insets.bottom + spacing.xxl` (the Task 7 precedent), and splitting the weekly summary's wrapped four-cell row into two rows of two — are layout-only and were verified to preserve the rendered result.

Gates: `npx tsc --noEmit` → 0 errors; `npm test` → 12 suites / 321 tests passing; both greps clean on all seventeen files.

### Task 8 (review follow-up) — `MacroBar`/`MacroRing` were missed; the grooves were the visible defect

The standing `surface2` rule says verbatim that it is "**Binding on Task 8's macro bars**". `mobile/src/components/track/MacroBar.tsx` and `MacroRing.tsx` *are* those bars, and the first pass shipped without them: `MacroBar`'s track was still `rgba(255,255,255,0.06)`, `MacroRing`'s backing circle still `stroke="rgba(255,255,255,0.08)"`, and both still imported the `lib/colors` shim, so they failed both grep gates. Review's simulator screenshot of `track/meals` shows the consequence plainly — a translucent-white groove sitting on `MealsNutritionCard`'s `tint(accents.meals)` fill composites to a muddy brown instead of reading as a neutral track, which is exactly the failure mode the `surface2` rule exists to prevent. This was a real visual defect, not a bookkeeping miss.

Both are now migrated and belong to this task's "extra files pulled in" set (bringing the task to nineteen files touched, eighteen of them grep-gated — `theme/tokens.ts` is excepted by spec §9 as the token module). Their only consumer is `MealsNutritionCard.tsx`, which was already in scope for precisely this reason, so the justification is the same one — only stronger, since the rule names them.

- `MacroBar`: `track`/`fill` → `colors.surface2` groove, `borderRadius: 3 → radii.pill` (identical rendering on a 6pt bar, the Task 6 `lib.barTrack` precedent); `label` 13/600 → `typography.buttonSm`, `value` 12 → `typography.caption`; `marginBottom: 10 → spacing.md` (tie rounds up).
- `MacroRing`: backing `Circle` stroke → `colors.surface2`; `goalText`/`macroLabelText` colors → `textMuted`/`text`.
- **`MacroRing`'s three font sizes are deliberately held** (`value` 20, `goalText` 10, `macroLabelText` 10). That block is absolutely positioned inside a fixed 110pt ring, spec §4.5 defines no token between `rowTitle` (16) and `titleRoot` (28) nor anything below `caption` (12), and resizing it would push the label stack outside the circle. Same call Task 7 recorded for `MealsHomeCard`'s ring sub-captions. The one convergence applied is `value`'s banned `fontWeight: "bold" → "700"`, which changes no metrics.

The fill colors were already correct — they come from `macroColor()`, which this task tokenized.

### Task 8 (review follow-up) — the favourite amber is restored; the torch green stands

The first pass sent three amber affordances to brand on the reading that §3 decision 3 governs any control's on-state. Review overruled two of the three, and the narrower reading is the right one: **the accent policy exists to stop the four DOMAIN accents (meals orange, water blue, inventory violet, shopping teal) leaking into controls.** Amber was never one of them, and a filled gold star is one of the strongest cross-platform conventions there is — a solid green star reads "verified", not "favourited".

- `FoodPreviewModal`'s favourite `Star` → `colors.warning` for the filled state (`colors.textMuted` unfilled, unchanged).
- `RecentFoodsRow`'s `favoriteBadge` circle → `colors.warning`. Re-classified on the code: it renders under `{item.is_favorite && …}` as an indicator overlaid on the thumbnail, and the long-press toggle belongs to the **whole tile** — the badge is not a hit target, so it is not a control and the policy never reached it. (Its inner `Star` glyph stays `colors.onBrand`; it sits on a filled circle.)
- `BarcodeScannerModal`'s torch-on `Zap` **stays `colors.brand`**. That glyph genuinely *is* the button — it is the only content of the torch `TouchableOpacity` — so its lit state is a textbook control on-state.

This does conflate a semantic token (`warning`) with an identity use (`favourite`), which is the confusion Task 7 refused when it created `accents.photos`/`accents.workouts` rather than aliasing `warning`/`danger`. Recorded knowingly: **the honest fix is a `colors.favorite` token, and if a third favourite surface appears it should be added.** Two call sites in one feature do not justify a token today.

### Task 8 (review follow-up) — weekly-summary day chart: `dayValue` held at 9pt

Review flagged `dayValue` 9 → `typography.caption` (12) as an overflow risk in the densest widget in the task and asked for the layout math. It does not fit, so it is reverted.

Available width per column = `deviceWidth − 2×16` (the modal's `contentInner` gutter) `− 2×12` (`Card row` padding) `− 6×8` (`daysRow`'s six `spacing.sm` gaps), ÷ 7 columns:

| Device | Column | 4-digit at 9pt | 4-digit at 12pt |
|---|---|---|---|
| 320pt (SE 1st gen) | 30.9pt | 21.6pt — 9.3pt slack | 28.8pt — **2.1pt slack** |
| 375pt (SE 2/3, mini) | 38.7pt | 21.6pt | 28.8pt — 9.9pt |
| 390pt / 402pt | 40.9 / 42.6pt | 21.6pt | 28.8pt — 12.1 / 13.8pt |

(SF digits run ~0.58–0.60em; the table uses the pessimistic 0.60.)

At 320pt a four-digit calorie total at 12pt has ~2pt of slack, and the failure mode is worse than truncation: `dayValue` carries **no `numberOfLines`**, so it wraps — and `daysRow` is a fixed `height: 110` with `alignItems: "flex-end"`, so the wrapped second line overflows the row and collides with the bars.

**Decision: keep `dayLabel` on `typography.caption` (12) and hold `dayValue` at `fontSize: 9`,** with the math recorded in a comment at the call site. Reasons, in order: `dayLabel` renders `d.weekday[0]`, a single character ~7pt wide, so its 11 → 12 convergence is free; `dayValue` is a ring/chart-fitted size of exactly the kind spec §4.5 has no token for and Task 7 already sanctioned holding; and reverting it to its pre-Task-8 value means the widget renders byte-identically to before on a screen neither review nor I can reach with a screenshot. The rejected alternatives were shrinking `daysRow`'s gap (buys ~7pt but tightens a 7-bar chart to fix a text problem) and adding `numberOfLines`/`adjustsFontSizeToFit` (new props, and per-glyph autoscaling across seven columns renders at seven different sizes).

### Task 8 (review follow-up) — value shifts that the first pass left unitemized

Every other value change in the commit was listed; these four were not, and one count was wrong.

- `MealsWeeklySummaryModal` `contentInner` `paddingBottom: 60 → spacing.xxxl` (32). The scroller sits inside a `presentationStyle="fullScreen"` modal with no tab bar beneath it, so the extra 28pt was slack, not clearance.
- `mealsScreenStyles` `mealTypeBadgeText` `#FFFFFF → colors.text`, and `chipText` `#D1D5DB → colors.textMuted` in `MealLogEditorModal` and `QuickAdjustmentModal`. `#D1D5DB` had no token; `textMuted` (`#9CA3AF`) is the nearest and is what every other inactive chip label in the app uses.
- `BarcodeScannerModal`'s "Loading camera..." spinner `#FFFFFF → colors.brand`, per §5.7's single loading treatment.
- **Correction: the sheet ends at 60 keys, not 62** (85 → 60). The earlier figure was miscounted; the ten dead keys and the seventeen retired into primitives are listed correctly.

Re-ran gates after this follow-up: `npx tsc --noEmit` → 0 errors; `npm test` → 12 suites / 321 tests; both greps clean on all eighteen gated files, `MacroBar.tsx` and `MacroRing.tsx` now included.

### Standing rule (Tasks 9-10) — the stat-cell value token

**A stat-cell value — the number in a compact labelled cell — is `{ ...typography.rowTitle, fontWeight: "700" }`.**

One commit had produced three answers to the same widget: `MealsWeeklySummaryModal.statValue` → `typography.titleRoot` (28/bold), `MealsInsightsCard.statValue` → `rowTitle` + 700 (16), `MealsNutritionCard.compactValue` → `typography.body` + 600 (14). All three now use the rule. `titleRoot` was the worst of the three specifically: that modal renders its own "Weekly Summary" H1 two lines above the stat grid, so matching it flattened the hierarchy the H1 exists to create. `titleRoot` stays reserved for one title per surface.

~~**Task 9's ring centre and day-strip totals take this token and must not re-litigate it.**~~ — **SUPERSEDED. This rule was stated too broadly and the ring centre was the wrong call site; see "Task 9 (coordinator override) — the stat-cell rule is scoped to grids; a hero value takes `titleRoot`" at the bottom of this section for the corrected, authoritative text.**

One consequence to watch, recorded rather than hidden: `MealsNutritionCard`'s `compactValue` renders value + inline goal ("12.5g / 65.0g") in a three-across row. At the new 16pt, on a 320pt device the cell is ~85pt against ~92pt of glyphs, so it wraps to two lines. `compactRow` has no fixed height, so it grows gracefully rather than clipping — but it does wrap, where the pre-Task-8 13pt did not. Accepted as the cost of one token; if it reads badly on device the fix is a narrower goal string, not a fourth size.

### Task 8 (quality review) — `QuickAdjustmentModal` could push its own footer off-screen

A real defect, and the only one in the task that was not purely cosmetic. It was the one centred sheet with **no `ScrollView` and no height cap** — its two siblings capped their scrollers at 460/500. The migration added ~16pt net (four inputs moving to `spacing.md` vertical padding, chip padding, chip gap). On a 320×568 device the meal-type chips wrap to two rows and the content reaches ~543pt; the backdrop is `justifyContent: "center"`, so the overflow splits both ways and Cancel/Log leaves the screen with nothing to scroll. It also carries `autoFocus` on Calories with no `KeyboardAvoidingView`, so on a 375×667 device the footer was already sitting under the keyboard.

**Fixed by making all three sheets identical rather than by patching one.** Note the sibling caps would NOT have fixed it either: on a 568pt screen the backdrop leaves 528pt, of which the chrome (Card padding 32 + title/subtitle ~58 + footer ~56 = ~146pt) is unavoidable, so even a 460pt scroller totals ~606pt and still overflows. Fixed pixel caps cannot adapt.

The scaffold is now `maxHeight: "100%"` on the `Card` — which resolves against the backdrop's content box, i.e. screen minus its `spacing.xl` padding — plus `flexShrink: 1` on the inner `ScrollView`, so the scroller is what gives up space and the title and footer buttons always render, on any device. Both magic numbers are gone.

**Deliberate zero-behavior-change exception, as sanctioned:** fix 2 adds a scroll container and keyboard avoidance to `QuickAdjustmentModal`. No handler, state, validation or submit path changed — this is layout capability, not logic. The other two sheets gain only `KeyboardAvoidingView` and lose their fixed caps.

### Task 8 (quality review) — the centred-sheet spacing picks

The three sheets disagreed on two things. Picks, with reasons:

- **`actions.marginTop` → `spacing.lg`** (was `spacing.md` in `MealLogEditorModal`). Majority of two, and correct on its own terms: the footer needs more separation from the last field than fields need from each other, so it should not share the inter-field step.
- **Field rhythm → label-owned (`label: { marginTop: spacing.sm, marginBottom: spacing.xs }`), no `field` wrapper** (was a `field: { marginBottom }` wrapper in `MealLogEditorModal`). Majority of two, and it keeps vertical rhythm in one declaration instead of splitting it between a wrapper and the label. `MealLogEditorModal` loses its three `<View style={styles.field}>` wrappers and the `field` key; its `row` drops `marginBottom` to match the other two.

### Task 8 (quality review) — the canonical centred-sheet recipe

**Not a primitive.** The coordinator declined `ui/Sheet` and `ui/TextField`: spec §5 fixes the set at seven, the plan is authoritative on architecture, and adding primitives late in a cosmetic cycle is the scope expansion this cycle exists to avoid. The spec already has the precedent — "Banner is a recipe, not a component," documented with copy-paste source. This is the second such recipe. **Task 9 copies this block verbatim for its four Water modals; Task 11 lifts it into `docs/STYLE_GUIDE.md` beside the Banner recipe.**

```tsx
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";

<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={styles.backdrop}
  >
    <Card variant="panel" style={styles.card}>
      <Text style={styles.title}>Sheet title</Text>
      {/* optional */}
      <Text style={styles.subtitle}>One line of supporting copy.</Text>

      {/* `handled` is required, not optional: a scroller sitting between a
          live keyboard and a control eats the first tap on that control. */}
      <ScrollView
        style={styles.sheetScroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Field name</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          editable={!saving}
        />
        <View style={styles.row}>
          <View style={styles.halfField}>{/* … */}</View>
          <View style={styles.halfField}>{/* … */}</View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.actionButton}>
          <Button variant="secondary" label="Cancel" onPress={onClose}
                  disabled={saving} fluid />
        </View>
        <View style={styles.actionButton}>
          <Button label="Save" onPress={handleSave} loading={saving} fluid />
        </View>
      </View>
    </Card>
  </KeyboardAvoidingView>
</Modal>

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  // `maxHeight: "100%"` resolves against the backdrop's content box (screen
  // minus its padding), so the sheet can never exceed the screen on any device.
  // Never a fixed pixel cap — it cannot adapt, and the chrome alone eats
  // ~146pt, so even a 460pt scroller overflows a 568pt screen.
  card: { width: "100%", maxHeight: "100%" },
  // Shrinks first, so the title and the footer buttons always render.
  sheetScroll: { flexShrink: 1 },

  title: { ...typography.titleBar, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, marginBottom: spacing.lg },

  // The one form-label token. The label owns the field rhythm — no `field`
  // wrapper, no per-field marginBottom.
  label: { ...typography.section, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
  },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  // `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it.
  actionButton: { flex: 1 },
});
```

Rules that come with it: confirm is `Button` (primary) on the **right**, cancel is `Button variant="secondary"` on the left; the confirm's in-flight state is `loading`, never a `"Saving…"` label swap; `disabled` carries only the validity condition, since `Button` already blocks on `disabled || loading`. Grouped single-select chips inside a sheet take the solid-brand active treatment. The `ScrollView` **must** carry `keyboardShouldPersistTaps="handled"` — see the Task 9 amendment "the recipe's `ScrollView` was swallowing the first tap" for the defect that added it and for the follow-up it leaves on Task 8's five sheets.

### Task 8 (quality review) — form labels converge on `typography.section`; twins deleted

Two tokens were doing one job: `typography.buttonSm` + `colors.text` (`MealAddForm`, `ManualFoodEntryModal`) against `typography.section` (the three centred sheets). Standardized on **`typography.section`** — 13/700 uppercase `textMuted` is the only one of the two that reads as a label rather than as body text, and it is what the sheets already shipped.

Both byte-identical `label`/`inputLabel` twins are gone — in `mealsScreenStyles.ts` (as instructed) and in `ManualFoodEntryModal.tsx`, which had the same pair for the same reason. Both files used the two interchangeably inside a single component, which is what made them indefensible. All call sites point at `label`. `mealsScreenStyles.ts`'s `subsectionTitle` follows to `typography.section` too, so `MealAddForm`'s "Nutrition (optional)" and `ManualFoodEntryModal`'s "Nutrition (per serving)" — the same heading in the same flow — finally match. Sheet key count: **60 → 59**.

(The remaining `inputLabel` hits in the repo are `MeasurementsScreen.tsx` and `workout-session/`, both outside this cycle's migration reach per spec §2.)

### Task 8 (quality review) — smaller fixes

- **`"Quick Adjustment — calories only"` loses its `icon`.** At `typography.button` (16/600) with `spacing.xl` padding each side, the label runs ~255pt against a ~220pt content box on a 320pt device; `Button` neither truncates nor shrinks, so it wrapped to two lines and grew — and the `minWidth` capture then locked in that taller first layout. Dropping the glyph reclaims 28pt and fits. The copy is user-facing and is unchanged, since editing product text is not a restyle. `Zap` is no longer imported by `MealsScreen`.
- **`FoodPreviewModal`'s `actionButtonFull: { flex: 2 }` deleted.** It applied only when `source === "saved"`, which is exactly the branch where the "Save to Library" sibling is not rendered — so the lone remaining child was already the only flex item and `2` versus `1` resolved identically. Dead code that read as intent.
- **`RecentFoodsRow`'s favourite badge restored to 18pt.** It had grown to 24 purely so a 16pt `icons.sm` star would fit, which is the tail wagging the dog — at 24 it was ~34% of the 70pt thumbnail. The glyph goes back to its original 10 via a named `BADGE_GLYPH` constant with a comment, the same "fitted size, no token applies" call as `MacroRing`'s ring labels. The badge now renders exactly as it did pre-Task-8, in `colors.warning`.
- **`tint()`'s doc comment widened** in `tokens.ts`. It described only the 0.15/0.3 surface recipe, which did not cover `BarcodeScannerModal`'s legitimate `tint(colors.bg, 0.6 / 0.8)` camera overlay. It now states the two common alphas as the default for surface fills and permits a justified functional alpha at the call site, the point being that the *color* always comes from a token. **Comment only — no behavior change, and no overlay tokens added.**

### Note for Task 11 — `mealsScreenStyles.ts` is three disjoint stylesheets in one file

Recorded, deliberately not acted on. Its 59 keys partition cleanly by consumer with **zero overlap**: `MealsScreen` uses the screen chrome, `MealAddForm` the form block, `MealsDayList` the list block. Nothing is genuinely shared, so the "shared stylesheet" framing is false — it is three stylesheets that happen to live in one module, which is why the ten dead keys survived unnoticed for so long. Splitting it into per-consumer sheets (or colocating each) is a structural refactor with no styling content, so it is out of scope for a cosmetic cycle. Task 11's closeout is the place.

### Task 9 — the file list grew from twelve to fourteen

The plan names twelve files. Two more were forced, neither discretionary:

- **`WaterRingCard.tsx`** — it is the container that renders `WaterProgressRing` (which the plan *does* name), it is the screen's hero card, and it was the single most hex-heavy file in the water fleet (`rgba(59,130,246,0.1)` fill, `rgba(59,130,246,0.3)` border, a `#3B82F6` "Today" link, and a four-colour pace-status block). Migrating the ring inside it while leaving its wrapper on raw rgba would have shipped a `surface2` groove sitting on a hand-typed blue tint — the exact composite failure Task 8's `MacroBar`/`MacroRing` follow-up had to correct.
- **`WaterBarChart.tsx`** — the only child of `WaterInsightsCard`, which the plan names. Its bar fills are the same `#22C55E`/`#3B82F6` pair the ring uses and its zero-day stub was a hand-typed water tint. Converting the card without it would have left a hex-failing file inside a grep-clean one.

Same justification Task 5 used for `CategoryTabs`/`SubcategoryPills` and Task 8 used for `MacroBar`/`MacroRing`. All fourteen are grep-clean.

### Task 9 — `Screen` adoption declined for `WaterScreen`

The plan does not require it and it is not a clean win. Two blockers, both familiar:

- The back affordance is a **labelled** one — a chevron plus the word "Track". `Screen`'s is chevron-only (there is no `headerLeft`, deliberately, per the Task 4 amendment). This is exactly why Task 8 kept `MealsWeeklySummaryModal` (`‹ Meals`) off `Screen`.
- The header is a **bordered** bar. `Screen variant="root"` renders an unbordered chrome bar and `variant="detail"` has no 28pt body title — neither expresses what this screen has today.

Additionally `Screen`'s `scrollContent` carries `gap: spacing.lg`, which would re-space six body blocks that already own their own vertical rhythm. Header kept and retokenized; `backText` uses the same `{ ...typography.titleBar, fontWeight: "400" }` recipe Task 8 gave `MealsWeeklySummaryModal`.

Gutter strategy follows from that: no container can own the gutter, so every body block carries `spacing.screenGutter` uniformly (20 → 16 across all six), exactly as `MealsScreen` does. The trailing `<View style={{ height: 40 }} />` spacer is folded into `contentContainerStyle` as `insets.bottom + spacing.xxl` — the Task 7/8 precedent, which also gains the safe-area term the spacer never had.

### Task 9 — the centred-sheet recipe, applied to four modals

`WaterLogEditorModal`, `WaterGoalEditorModal` and `WaterQuickAddEditorModal` take the canonical recipe **verbatim**: `KeyboardAvoidingView` backdrop on `colors.scrim`, `Card variant="panel"` at `width: "100%"` / `maxHeight: "100%"`, a `flexShrink: 1` `ScrollView`, and a `secondary` Cancel / `primary` Save pair in `flex: 1` wrappers. All three previously had a bare `<View>` backdrop at `rgba(0,0,0,0.7)`, no keyboard avoidance, a `"Saving…"` label swap, and — in the quick-add editor — a hand-picked `maxHeight: 420` on the scroller. `saving` now drives `Button`'s `loading`; the press-blocking boolean is identical (`Button` blocks on `disabled || loading`).

Two deliberate non-additions inside the recipe:

- **No field labels were invented.** The recipe's `styles.label` is used only where a label already existed (`WaterQuickAddEditorModal`'s "Button 1…4", which converges from 14/400-muted to `typography.section` and drops its `width: 80`). The log and goal sheets have single fields whose placeholders already name them; adding "AMOUNT" headings would be new product copy, not a restyle. `styles.label` is simply not declared in those two files, so there are no orphans.
- **The three sheets that have no subtitle use `title.marginBottom: spacing.md`**, matching the shipped `MealLogEditorModal`; the one that has a subtitle uses `xs` + `subtitle.marginBottom: lg`, per the recipe.

**`WaterCalendarModal` deviates, as anticipated.** It keeps the backdrop, the `Card variant="panel"` sheet and a footer `Button`, and drops the form parts: there is no title, no `ScrollView` and no Cancel. A native `DateTimePicker` spinner is not a form — it commits through `onChange` as the user spins, so "Done" is a dismiss, not a confirm, and a Cancel beside it would imply a rollback the component cannot perform. Done is therefore a single full-width `Button` (the card is a column, so `fluid` stretches it), replacing a `#3B82F6` fill with `borderRadius: 10` / `paddingVertical: 14` — two off-grid values. No `KeyboardAvoidingView` either: a spinner raises no keyboard. `maxHeight: "100%"` is still applied. The Android branch (a bare, chrome-less `DateTimePicker`) is untouched.

### Task 9 — the blue control sweep, itemized

| Control | Was | Now |
|---|---|---|
| `WaterLogEditorModal` confirm/cancel | `#3B82F6` fill / bordered | `Button` primary + secondary |
| `WaterGoalEditorModal` confirm/cancel | `#3B82F6` fill / bordered | `Button` primary + secondary |
| `WaterQuickAddEditorModal` confirm/cancel | `#3B82F6` fill / bordered | `Button` primary + secondary |
| `WaterCalendarModal` "Done" | `#3B82F6` fill | `Button` primary, `fluid` |
| `WaterCustomLogForm` "Add" pill | `#3B82F6` fill + `#FFFFFF` glyph | `Button` primary + `icon={Plus}` |
| `WaterGoalEditorModal` oz/L toggle | `#3B82F6` active segment on `#1F2937` | `surface2` track + solid `colors.brand` + `onBrand` label |
| beverage-type chips (×3 files) | the beverage's own hue as a solid fill | solid `colors.brand` + `onBrand` (standing rule: grouped single-select) |
| `WaterRingCard` "Today" link | `#3B82F6` text | `Button variant="ghost" size="sm"` |
| `WaterUndoSnackbar` "Undo" | `#3B82F6` text + white glyph | `Button variant="ghost" size="sm"` + `icon={Undo2}` |
| `WaterHistoryList` row delete | 18pt `textMuted` `Trash2` in a 4pt pad | `IconButton variant="circle" tone="danger"` (+ `accessibilityLabel`) |
| `WaterQuickAddCard` gear | 16pt `textMuted` `Sliders` in a 4pt pad | `IconButton variant="circle"` inside `SectionHeader`'s action slot |

Blue survives **exactly** where contract 1 allows and nowhere else: the `Droplets` title glyph (`accents.water` at `icons.xl`), the progress-ring **fill**, the day-strip selected-cell fill and dot fills, `WaterDayStrip`'s "today" day number, `WaterBarChart`'s bar fills, and `WaterRingCard`'s `"on pace"` **status text** (which is text, not a control — the same call Task 7 recorded for `WaterIntakeHomeCard`'s pace line, and it uses the identical three-way `accents.water` / `success` / `warning` split).

Two of those are hue changes worth flagging rather than pure renames: the row delete goes from grey to `danger` (per the standing destructive rule; note this delete *is* guarded by a confirm `Alert`, unchanged), and the quick-add gear goes from a quiet grey glyph to a 32pt `tint(brand)` circle. The gear is a genuine inline row action opening a modal — precisely what `circle` exists for — and it gains a ≥44pt touch target and an accessibility label it never had.

### Task 9 — `WaterRingCard` loses its blue tint; the hardest call in the task

The hero card was `rgba(59,130,246,0.1)` fill on a `rgba(59,130,246,0.3)` border at `radii.row`. It is now a plain `Card variant="panel"` (`surface`, `radii.panel`), like every other card on the screen.

The spec is genuinely two-voiced here: §3 decision 3 lists "tints" among the sanctioned identity uses of a domain accent, which would have permitted a one-token `tint(colors.accents.water)` / `tint(…, 0.3)` swap. But the plan's Task 9 instruction is an **exhaustive** list — "blue survives in the water drop glyph, progress ring fill, and day-strip fills" — and it converges the screen's in-screen cards onto panel geometry in the same sentence. The plan is authoritative on mechanics, and three sibling cards on `surface` beside one tinted-blue card would read as the odd one out on the screen this task exists to unify. The identity is not lost: a 180pt water-blue ring sits inside this very card, under a 32pt blue `Droplets` glyph.

This is the most visible single change in the task. It is a one-line revert (`tint(colors.accents.water)` through `Card.style`) if the owner disagrees at screenshot time.

### Task 9 — `WaterProgressRing`: the groove, and the ring-centre value

- **Unfilled track → `colors.surface2`**, per the standing rule, which names this file explicitly. It was `rgba(59, 130, 246, 0.15)` — i.e. exactly `tint(colors.accents.water)`, so keeping the identity read there was a one-token swap, and it was declined for the same reason Task 7 declined it on `WaterIntakeHomeCard`'s track: the *fill* already carries the identity, and a groove is a bounding element. This is **not** the outline rule's `textFaint` case.
- **Ring fill** stays water blue (`accents.water`, `success` when complete) — a sanctioned survivor.
- **Centre value → `{ ...typography.rowTitle, fontWeight: "700" }`**, the standing stat-cell token, which names "Task 9's ring centre" verbatim and forbids re-litigating it. Its color goes to `colors.text` (`colors.success` when complete), matching `WaterIntakeHomeCard`'s `cardValue`/`cardValueHit` exactly — the blue it had is not on contract 1's survivor list.

**Flagged for the owner, applied as instructed:** this is a 36 → 16 shrink of the headline number inside a 180pt ring, by far the largest single metric change in the migration. The `lineHeight: 40` and the `marginTop: -2` nudge on the unit below it are dropped with it, since both existed only to manage the 36pt headline's metrics. Note this cuts against the precedent Task 8 set for `MacroRing`, whose three ring-fitted font sizes were deliberately **held** on the argument that a fixed-diameter ring has no room for a token. The standing rule wins because it names this call site by name; if the screenshot shows a 16pt number floating in a 180pt ring, the honest fix is to amend the standing rule (or add a type token between `rowTitle` and `titleRoot`), not to special-case this file.

Applied consistently elsewhere: `WaterInsightsCard`'s four `statValue`s (22/700 → the token) and `WaterHistoryList`'s per-day totals. `WaterDayStrip` has **no** stat cells — it renders day *numbers*, not totals — so the rule finds nothing to bind to there; its day number stays `typography.body` + weight, and the history day total is the "day total" the rule was reaching for.

### Task 9 — `WaterHistoryList`: two section levels, one `SectionHeader`

The plan says "history section headers → `SectionHeader`". There are two candidates and they are nested, so only the outer one takes the primitive:

- **"History"** (and `WaterCustomLogForm`'s "Log a Custom Amount") → `SectionHeader`. Both were 18/600, the same convergence Task 8 applied to `mealsScreenStyles`' `sectionTitle`. Each sits in a bare wrapper `<View>` that owns `marginBottom: spacing.md`, because `SectionHeader` takes no `style` prop.
- **The per-day group headers** ("Today" / "Yesterday" / a date, with the day's total on the right) stay bespoke, tokenized. Nesting `typography.section` (13/700 uppercase muted) directly inside itself would flatten the hierarchy the outer header exists to create. They read `typography.rowTitle` + `textMuted` for the date against the stat-cell token for the total.

Other items in the same file:

- **Per-log rows → `Card variant="row"`**, with `marginBottom` and the row's flex layout passed through `Card.style` (the `lib.cardSpacing` pattern from Task 6). `disabled={!onEdit}` + `activeOpacity={onEdit ? 0.7 : 1}` are gone because they are now expressed structurally: `Card` renders a plain `View` when it gets no handler, which is what "disabled" meant here. Radius converges 8 → `radii.row` (12).
- **The loading branch → `LoadingState`**, per the plan. ~~It is not a `ListEmptyComponent` — it sits inline in the screen's `ScrollView`, so it sizes to its own content and needs no `flexGrow` chain~~ — **that rationale was WRONG and is corrected in "Task 9 (spec review) — the empty/loading states did not size themselves" below; a `flex: 1` primitive never sizes to its own content.** Its opaque `colors.bg` being invisible against the screen's own `bg` still holds.
- **The empty branch → `EmptyState`** with `icon={Droplets}`. Its one string, `"No water logs yet. Start tracking today!"`, splits at its own sentence boundary into `title="No water logs yet"` + `body="Start tracking today!"`. Same words; the title drops its full stop, as titles do.
- **The beverage badge follows the `Badge` recipe by hand** — `tint(beverageColor(type))` fill + a full-strength label, `radii.pill`, 12/600, padding 3×10 — rather than using the primitive, because `Badge`'s tone set has no per-beverage slot. Identical reasoning to Task 8's `MealsDayList` meal-type badge. It loses the uppercase/letter-spaced 10/700 white-on-solid treatment; at these labels the two render to within a couple of points of the same width.

### Task 9 — flagged, NOT fixed: `waterUnits.ts`'s `beverageColor()` is still raw hex

`mobile/src/lib/waterUnits.ts:65-78` holds `beverageColor()` returning `#3B82F6` / `#92400E` / `#15803D` / `#F59E0B` / `#6B7280`, which `WaterQuickAddCard` (pill left-border), `WaterHistoryList` (`Droplets` glyph + badge) still consume. All three call sites are grep-clean because the literals live in the lib — the same shape of problem Task 7 flagged for `macroColor` and Task 8 flagged for `mealsHelpers`' `MEAL_TYPES`.

Left alone deliberately, and this one is *harder* than `macroColor` was: the sweep already removed its three **control** consumers (every beverage chip's active fill is brand now), so what remains is pure identity. But two of the five values — the coffee brown `#92400E` and the tea green `#15803D` — have no token anywhere in the system and no spec basis, so tokenizing honestly means **adding** a `colors.beverages` group of five new values in a task whose brief forbids inventing tokens. That is a naming decision worth making on purpose. **Task 11's closeout should either add the group or decide the beverage marks do not need five hues.**

### Task 9 — smaller deviations, recorded together

- **`WaterUndoSnackbar` lost its drop shadow.** `shadowColor` was a raw black literal, and the token module has no elevation scale — the system is deliberately flat. Same call Task 5 made for the inventory tile's tag overlay. `elevation: 8` went with it; the snackbar is still the last sibling in the screen's root `View`, so it paints above the scroller on both platforms. Its `#1F2937` fill maps to `colors.surface2` (a raised floating element, not a border) and its `#374151` outline to `colors.border`. **Its timer, its `visible` gate and its `onUndo` handler are untouched.**
- **`WaterBarChart`'s goal reference line → `colors.textFaint`,** not `colors.border`. It was `rgba(255,255,255,0.25)`; `border` (`#1F2937`) on a `surface` card would have been all but invisible, and this dashed line *is* the chart's affordance — the only thing that says where the goal sits. That is the outline rule's `textFaint` clause. Its zero-day 2pt stub goes the other way, to `colors.surface2`: a stub for a day with no water is an empty track, not a fill.
- **`WaterBarChart`'s internal geometry is untouched.** Its `padding` object (`14/22/8/8`) and the `fontSize="9"` axis labels are SVG viewBox coordinates inside a fixed 300-unit chart, not RN spacing; §4.5 defines no token below `caption` (12) and fourteen columns cannot hold one. Same call Task 8 recorded for the weekly summary's `dayValue`. Colors and only colors changed.
- **`WaterDayStrip`'s 1pt per-cell margin → a `gap`.** `marginHorizontal: 1` on seven `flex: 1` cells is both off-grid and the wrong mechanism; the row now carries `gap: spacing.xs` and drops its inert `justifyContent: "space-between"`, per the standing "flex: 1 on children + gap on the container" rule. Separation goes 2pt → 4pt.
- **`WaterQuickAddCard`'s pills stay bespoke.** They render a two-line label (custom name over the amount) and carry an optional beverage-colored left border; `Button` can express neither. Tokenized in place as neutral chrome on `surface2` — the same call Task 8 made for `FoodPreviewModal`'s serving steppers. Contract 1 does not reach them: they were never accent-colored.
- **Spacing follows the standing rules.** Control touch-padding rounds up (`WaterQuickAddCard`'s pill `paddingVertical: 10 → spacing.md`, every chip's `10/6 → spacing.md/spacing.sm`, the goal toggle's `unitButton` `6 → spacing.sm`, `navButton`/`headerActionButton` `6 → spacing.sm`); ties round up (the snackbar's `paddingHorizontal: 14 → spacing.lg`, `dot.marginTop: 6 → spacing.sm`, `dayStrip.header.paddingBottom: 10 → spacing.md`); non-control values take the nearest step (`marginTop: 2 → spacing.xs`, `marginBottom: 4 → spacing.xs`). Radii `3/6/8/10/12/14/16 → radii.pill`/`control`/`row`/`panel`.
- **Icon sizes.** The title `Droplets` 32 → `icons.xl`; the back chevron 24 → `icons.lg` (§4.6's "back chevron always `lg`"); `Share2` 20, the day-strip chevrons 20 and its calendar 18 → `icons.md`; the ring card's `Pencil` 14 and the history `Droplets` 16 → `icons.sm`. `strokeWidth: 2` → `icons.strokeWidth`.
- **Typography convergences.** `pageTitle` 28/`"bold"` → `typography.titleRoot` (a pure rename); the modal titles 18/600 → `typography.titleBar` (17/600); `WaterInsightsCard`'s bespoke 13/600-uppercase-`letterSpacing: 0.6` card title → `typography.section`; 14/600 labels → `typography.buttonSm`; 13pt and 14pt body text → `typography.body` (the Task 7 precedent); 11pt and 12pt metadata → `typography.caption`. Input text stays `fontSize: 16` in every field — §4.5 defines no input token.
- **`#D1D5DB` inactive chip labels → `colors.textMuted`**, the same mapping Task 8 applied in `MealLogEditorModal`/`QuickAdjustmentModal`. `#FFFFFF` on brand fills → `colors.onBrand`; `#FFFFFF` elsewhere (snackbar copy, the calendar picker's `textColor`) → `colors.text`, per the Task 5 precedent that `onBrand` means "on a brand fill".
- **The day-strip dot's `rgba(59,130,246,0.4)` keeps its alpha** as `tint(colors.accents.water, 0.4)`. Justified at the call site, as `tint()`'s widened doc comment permits: that dot has to read as "some water, under half" between a full-strength dot and a fully transparent one, which the 0.15 surface alpha cannot do.

### Task 9 — no behavior bug found

Reviewed hunk by hunk across all fourteen files: no handler, state setter, data fetch, effect dependency, modal open/close path, `Alert` flow, CSV export path or undo timer changed. `showUndoFor`'s 5000ms `setTimeout`, `dismissUndo`'s clear, and the `undoTimerRef` lifecycle are byte-identical. The three structural edits are layout-only and were verified to preserve the rendered result: folding the 40pt spacer into `contentContainerStyle`, replacing the day strip's per-cell margin with a container `gap`, and collapsing `TouchableOpacity` + `disabled` onto `Card`'s handler-presence branch.

Gates: `npx tsc --noEmit` → 0 errors; `npm test` → 12 suites / 321 tests passing; both greps clean on all fourteen files; zero orphaned style keys and zero unused imports.

### Task 9 (coordinator override) — the stat-cell rule is scoped to grids; a hero value takes `titleRoot`

The Task 9 screenshot of `track/water` confirmed the concern the first pass flagged: at 16pt inside a 180pt ring the centre value read as body copy rather than as the hero number the ring exists to display, and because the "oz" line (14) and the "of 68 oz" line (12) sit within a few points of it, the whole centre stack was typographically flat. 36 → 16 was too far. The coordinator overruled the standing rule rather than special-casing the file — this being the **second** time a rule stated too broadly produced a wrong application (Task 7's `textFaint`-on-progress-tracks was the first, corrected by the `surface2` amendment).

**The corrected rule, superseding the "Standing rule (Tasks 9-10) — the stat-cell value token" text above and authoritative from here:**

> **Stat-cell values** — the repeated value cells in a stats grid or row (insight cards, weekly summary, day-strip totals) — use `{ ...typography.rowTitle, fontWeight: "700" }`.
>
> **A hero value** — the single dominant number a card is built around, such as a progress-ring centre — uses `typography.titleRoot`. It is not a stat cell.
>
> Ring-fitted sizes with no token between these two (e.g. `MacroRing`'s 20/10/10 sub-captions inside a 110pt ring) are held as documented literals rather than forced onto either token.

That third clause is what makes the three ring treatments in this cycle coherent instead of contradictory: Task 8 deliberately **held** `MacroRing`'s ring-fitted sizes while Task 9 was told to force the water ring's centre onto a token, and nothing written down explained why those were both right. Now they are: `MacroRing`'s 20/10/10 are fitted sub-captions with no applicable token, and `WaterProgressRing`'s centre is a hero value with one.

**Recorded widening of spec §4.5.** The spec calls `titleRoot` "the only sanctioned use of `bold`" and scopes it to the root-screen title in the scroll body. Using it for a progress-ring centre widens that beyond screen titles. This is deliberate and recorded rather than silent: a hero number is in the same typographic weight class as a screen title, and the alternative — a fifth hand-picked size — is exactly the drift this cycle exists to remove. Note the practical consequence on this screen: `WaterScreen`'s `pageTitle` and the ring centre are now both 28/bold, roughly 150pt apart vertically. That is acceptable because the ring's number is a *value*, not a competing title; the "one `titleRoot` title per surface" constraint recorded in the superseded rule still governs **titles**.

**Call sites checked under the corrected rule — only one changed:**

| Call site | Classification | Token | Changed? |
|---|---|---|---|
| `WaterProgressRing.amount` | hero value (180pt ring centre) | `typography.titleRoot` + `colors.text` | **yes**, `rowTitle`/700 → `titleRoot` |
| `WaterInsightsCard.statValue` (×4) | stat cells in a four-across grid | `rowTitle` + `"700"` | no — already correct |
| `WaterHistoryList.dayTotal` | the repeated per-day total in a list header row | `rowTitle` + `"700"` | no — already correct |
| `WaterDayStrip.dayNumber` | neither: a day *number*, not a total | `typography.body` + `"500"` | no — the token never applied here |

`amountComplete` keeps `colors.success` for the goal-met state, so the ring centre still turns green on completion. The dropped `lineHeight: 40` and the unit's `marginTop: -2` stay dropped: both existed to manage the old 36pt headline's metrics, and 28 needs neither.

To restate the Task 9 amendment's own note now that it is resolved: the `WaterDayStrip` entry above is why that amendment recorded "the day strip has no stat cells" — the corrected rule's parenthetical "day-strip totals" refers to the per-day totals in the history list, which is where the token is actually applied.

### Task 9 (coordinator review) — accepted as shipped, recorded only

Four judgement calls from the first pass were reviewed and accepted without change:

- **`WaterRingCard` losing its blue tint** — consistency with every other `Card panel` in the app beats a one-off tinted surface, and the ring fill itself carries the water identity. The reading of the plan's exhaustive survivor list was correct.
- **`WaterUndoSnackbar` losing its drop shadow** — no elevation scale exists in the token system and inventing one is out of scope for a cosmetic cycle. **Recorded for a future elevation token: adding one would restore this shadow, and the snackbar is the call site that would justify it.**
- **The three remaining hue changes** — the history row delete going to `IconButton tone="danger"`, the quick-add gear becoming a `tint(brand)` `IconButton circle`, and the beverage badge moving to a tinted fill with a full-strength label — are all correct applications of the standing destructive / control / `Badge`-recipe rules.
- **`waterUnits.ts`'s `beverageColor()` deferred to Task 11** — agreed, and agreed that it is harder than `macroColor` was, since two of its five values have no token anywhere and a `colors.beverages` group is a naming decision rather than a side effect of a control sweep.

### Task 9 (spec review) — the recipe's `ScrollView` was swallowing the first tap

A genuine behavior regression introduced by the migration, and it originates in the **recipe**, not in this task's application of it.

`WaterLogEditorModal` and `WaterGoalEditorModal` both `autoFocus` their amount/goal input, so the keyboard is up the instant either sheet opens. The migration moved their controls — the beverage chips and the oz/L segmented control — inside the recipe's `<ScrollView>`, and RN's default `keyboardShouldPersistTaps="never"` makes a scroller consume the first tap that occurs while a descendant holds keyboard focus, using it to dismiss the keyboard. Pre-migration those controls were direct `View` children of the sheet with no scroller between them and the modal, so the tap landed on the control. Post-migration the user had to tap every chip twice.

Nothing upstream caught this because **none of Task 8's five sheets uses `autoFocus`**, so none of them has a keyboard up on open and none exhibits the defect.

Fix, in two parts:

1. `keyboardShouldPersistTaps="handled"` added to the `sheetScroll` `ScrollView` in all three water form sheets. `WaterQuickAddEditorModal` had no live defect (pre-existing scroller, no `autoFocus`) but takes the prop too, so the three sheets stay literally identical; each call site carries a comment saying which case it is.
2. **The canonical recipe block above is updated** so Task 10 and every future sheet inherit it, with a one-line note: *a scroller sitting between a live keyboard and a control eats the first tap on that control.* The "rules that come with it" paragraph now states the prop is mandatory.

**Follow-up left, deliberately not acted on:** Task 8's `FoodCorrectionModal`, `MealLogEditorModal`, `QuickAdjustmentModal` (and the two `pageSheet` modals with scrollers) should take the same prop. They have no `autoFocus` and therefore no live defect today, so editing five files outside this task's scope to fix a latent issue is not warranted here — but any of them gaining an `autoFocus` field, or a user tapping a chip while a text field above it holds focus, reproduces it. **Task 11's closeout should sweep the prop across every sheet.**

### Task 9 (spec review) — the empty/loading states did not size themselves

The Task 9 amendment above claimed the history list's `LoadingState`/`EmptyState` "sizes to its own content and needs no `flexGrow` chain". **That was wrong**, and a wrong rationale in this plan is worse than the bug, because Task 10 reads it. `EmptyState`'s and `LoadingState`'s shared `wrap` is `flex: 1` — i.e. `flexBasis: 0` — so it never sizes to its content. Nested in `styles.section` (`paddingHorizontal` only) inside `WaterScreen`'s content container (`paddingBottom` only), it resolved to zero content height and collapsed onto its own `2 × spacing.xxxl` = 64pt of padding, with the icon, title and body spilling out of the box.

**The standard fix provably cannot work here, which is why this file needs a different one.** The `flexGrow: 1` chain (Task 5's `gridContainer`, Task 8's two-level `scrollContent` + `mealsSection`) works by giving the scroll content container a definite height of at least the viewport, so free space exists for the flex child to claim. This history list is the **last** block on a screen whose content above it — title ~90, ring card ~300, quick-add ~110, day strip ~110, insights ~250, custom-log form ~150 — already totals ~1000pt, more than any phone viewport. Free space at the content container is therefore always ≤ 0, `flexGrow` distributes nothing, and `section` has nothing to pass down. A chain here would have been inert at every level while looking like a fix.

**Fix: a `stateBox` wrapper with `minHeight: 192`,** which each state fills. Verified against the actual engine rather than asserted — `node_modules/react-native/ReactCommon/yoga/yoga/algorithm/CalculateLayout.cpp` STEP 5 (~L1518-1545): when a min-dimension is defined and exceeds the flex line's consumed size, Yoga sets `availableInnerMainDim = minInnerMainDim` and, load-bearingly, leaves `sizeBasedOnContent` **false**, so `remainingFreeSpace` is positive and the `flexGrow: 1` child fills the box. Without a min-dimension the `else` branch sets `sizeBasedOnContent = true` and the child keeps its zero basis — exactly the collapse observed. The branch is guarded on `sizingModeMainDim != StretchFit`, which is the case for an auto-height `View` inside an auto-height scroll content container.

192 is a documented literal, derived rather than picked: the taller of the two primitives' intrinsic content is `EmptyState` at `2 × spacing.xxxl` padding + a 40pt icon + `2 × spacing.md` gaps + a `rowTitle` line + a `body` line ≈ 166pt, plus slack for a wrapped title. The reasoning is recorded in full at the call site, since it is the kind of thing a later reader would otherwise "clean up" into an inert `flexGrow`.

**Rule this generalizes, for Task 10:** the `flexGrow: 1` chain is not the fix for a `flex: 1` primitive — it is *one* way to produce the thing the primitive actually needs, which is **a parent with a definite main size**. Where the scroller can be at least viewport-height, grow the chain. Where sibling content guarantees the scroller is already overflowing, grow nothing and give the state its own box.

### Task 9 (spec review) — six unrecorded deltas, itemized

Every other value shift in this task was listed; these were not.

- **`WaterProgressRing.unit` 16 → 14** (`typography.body`). The "oz"/"L" line under the ring's hero number; 16 had no token and `body` is the nearest. With the centre value now at `titleRoot` (28) the two are properly differentiated, which they were not at the interim 16/16.
- **`WaterCustomLogForm.chipText` `foreground` → `textMuted`.** Inactive beverage chips were full-strength `text`; they now match the inactive chip label in every migrated sheet (`MealLogEditorModal`, `QuickAdjustmentModal`, and the two water sheets), which is `textMuted`. Active labels are `onBrand` on the brand fill.
- **Cancel buttons now dim while saving.** All four sheets pass `disabled={saving}` to `Button variant="secondary"`, and `Button` applies `opacity: 0.5` — spec §5.1's single dimming mechanism. The hand-rolled cancels were `disabled` without any visual dim, so the control looked live while it was not. A gain, but a real visual change.
- **Day-strip cell separation 2 → 4.** `marginHorizontal: 1` on each of seven cells (2pt between neighbours) became a container `gap: spacing.xs` (4pt), per the "flex + gap, never per-child margins" rule.
- **Trailing slack 40 → `insets.bottom + spacing.xxl`.** Flat 40pt of spacer becomes ~58pt on a notched device and 24pt on a flat one. `WaterScreen` renders as a route, not under the tab bar, so the safe-area term is the correct clearance and the flat-device reduction is pure slack removal. Same conversion Task 7 verified for `home.tsx` and `track/index.tsx`.
- **`WaterQuickAddEditorModal.label` restored to the recipe's margins.** The first pass dropped the recipe's `marginTop: spacing.sm, marginBottom: spacing.xs` in favour of the `block` group's `gap`, which was internally coherent but contradicted the "verbatim" claim. The `label` style is now byte-identical across all three form sheets. `block` **keeps** its `gap: spacing.sm` and that is the one recorded structural difference: this sheet has one label heading *three* fields, so the label cannot own the inter-field rhythm the way it does in a one-label-per-field sheet. `block` is a per-button group, not the per-field wrapper the recipe bans.

### Task 10 — `Screen variant="detail"` adopted for Nutrition Preferences, declined for Food Matching

**Adopted for `NutritionPreferencesScreen`,** as the plan instructs, with `scroll={false}`. Verified first that `Screen` can express everything the old bar had:

- **Left affordance: there was none.** The old header (`styles.ts:6-14`) was a `space-between` row of a left-aligned title and a right-hand "Done" — no back chevron, no ✕, no labelled back. `Screen` is passed **no `onBack`**, so its `backButton` is `null` and the left flank renders as an empty ≥32pt spacer. Adoption therefore *adds* no navigation affordance and *removes* none; "Done" (the only way out of this `presentationStyle="fullScreen"` modal) moves to `headerRight` as a `Button variant="ghost" size="sm"`. This is the first screen in the cycle where the missing `headerLeft` slot is not a blocker precisely because nothing occupies that position.
- **No `RefreshControl` anywhere.** The screen's `FlatList` (and Food Matching's `SectionList`) have none, so `Screen` owning the scroller deletes no pull-to-refresh. This is the blocker that kept `ViewFoodDetailsScreen`, `home.tsx` and `MealsScreen` off `Screen` in Tasks 5/7/8; it simply does not apply here.
- Per the `scroll={false}` contract the `FlatList` now supplies both `paddingHorizontal: spacing.screenGutter` and `paddingBottom: insets.bottom + spacing.xxl`; the cards' `marginHorizontal: 16` is deleted rather than doubled. One gutter owner, as the standing rule requires. The screen keeps `useSafeAreaInsets` only for that bottom inset and for the Food Matching view-switch container.

**Declined for `FoodMatchingScreen`.** Its left affordance is a **labelled** back — "‹ Back" — and `Screen`'s is chevron-only with no `headerLeft` slot (deliberately, per the Task 4 amendment). This is exactly the call Task 8 made for `MealsWeeklySummaryModal` (`‹ Meals`) and Task 9 made for `WaterScreen` (`‹ Track`). The bespoke bar is kept and retokenized: `‹ Back` becomes `Button variant="ghost" size="sm" icon={ChevronLeft} label="Back"` (the Task 6 `‹ Library` precedent), the title takes `typography.titleBar`, and the old `headerSpacer: { width: 44 }` is replaced by the **equal-flank pattern copied from `Screen.tsx`** (`flank: { flex: 1, minWidth: 32 }` + `flankRight`, title `flexShrink: 1` + `numberOfLines={1}`) — the 44pt spacer could never have balanced a ghost button with an icon, and the flanks centre the title at any width. The bar also **gains a 1px `colors.border` bottom border** it did not have, so the two headers in this modal are the same object; spec §6 requires a bordered bar for detail screens.

Consequence for the view switch: `NutritionPreferencesScreen`'s `showMatching` early return keeps its own `StatusBar` + inset-padded container (now a local `styles.screen`), because `FoodMatchingScreen` still does not render chrome of its own. Nothing about the switch changed.

### Task 10 — `profile/nutrition/styles.ts` retired; where its 26 keys went

Verified by repo-wide grep before deleting that the only importers were the six files in scope (`grep -rn "nutritionStyles\|nutrition/styles"` → six hits, all inside `profile/nutrition/`). Each subcomponent now owns a local `StyleSheet.create` built from tokens directly.

| Retired key | Where it went |
|---|---|
| `screen` | local in `NutritionPreferencesScreen` (view-switch container only) |
| `header` / `headerTitle` | `Screen`'s detail bar; a local bordered bar in `FoodMatchingScreen` |
| `headerAction` | `Button variant="ghost" size="sm"` ("Done", "Back"); the nav row's `›` became a lucide `ChevronRight` |
| `card` | `Card variant="panel"` (the four section cards) / `Card variant="row"` (concept, product and linked rows, the Food Matching nav row) |
| `sectionTitle` | `SectionHeader` (five call sites) — see the nav-row exception below |
| `row` | per-file `row` (`paddingVertical: 10 → spacing.md`) |
| `rowLabel` | split — see the typography note below |
| `itemTitle` | `typography.rowTitle` |
| `rowValue` | `typography.body` + `colors.textMuted` |
| `banner` / `bannerText` | the Banner recipe, `success` variant |
| `primaryButton` / `primaryButtonText` | `Button` (primary) |
| `destructiveButton` / `destructiveButtonText` | `Button variant="destructive"` |
| `mutedText` / `mutedTextSpaced` | `typography.body` + `textMuted`; `marginTop: spacing.md` |
| `chipRow` / `chip` / `chipActive` / `chipText` / `chipTextActive` | per-file grouped-single-select chip block (RampCard, ConstraintsSection, ConceptRow); **deleted entirely** in `FoodMatchingScreen` — see below |
| `input` | the canonical sheet-recipe input |
| `chipPickerContainer` | `paddingVertical: spacing.md` |
| `flexShrinkColumn` | `{ flexShrink: 1 }` |

`ls mobile/src/components/profile/nutrition/styles.ts` → No such file or directory.

### Task 10 — the ramp status banner is the recipe's `success` variant

The plan sends `styles.ts:40-47` to the Banner recipe. That banner was **green** (`rgba(34,197,94,0.12)` fill, solid `colors.primary` border), and its content is a positive prompt ("Time to advance to Level N"), so it takes the recipe's `success` half verbatim: `tint(colors.success)` fill, `tint(colors.success, 0.3)` 1px border, `radii.row`, `padding: spacing.md`, heading `{ ...typography.buttonSm, color: colors.success }`. Three real value shifts, all toward the system: fill alpha 0.12 → 0.15, the border from a full-strength stroke to the 0.3 tint, and the heading from 14/400 `colors.text` to 14/600 `colors.success` — the same treatment Task 5's `expiringTitle` and Task 7's `RampHomeBanner` already ship.

The second banner in that card ("You're at the top ramp level… reassess your targets manually") uses the **same `success` variant**, not `warning`. It rendered green before and its message is an all-clear rather than a hazard; repainting it amber would be inventing a warning the screen never showed.

### Task 10 — chips, and why `FoodMatchingScreen`'s chips became `Button`s

Every chip row in this feature is a **grouped single-select** (ramp levels, spice/prep/leftover pickers, concept ratings), so all three take the standing rule's segment treatment: solid `colors.brand` fill + `colors.onBrand` label, which is what `chipActive` already was — a pure rename. Geometry converges: `borderRadius: 16 → radii.pill`, padding `12/6 → spacing.md/spacing.sm` (control touch-padding rounds up), label 13 → `typography.body`.

`FoodMatchingScreen`'s chips are the exception and they are **not** chips: the three head-noun suggestions and the "Choose…"/"Cancel" toggle have no selected state at all — each is a one-shot action with a transparent background and a 1px border, which is the literal definition of `Button variant="secondary"`. Style-guide rule 3 ("never hand-roll a TouchableOpacity-with-background") applies, so they are `Button variant="secondary" size="sm"`, and the suggestion buttons carry `icon={Check}` — which is also how §4.6's `✓ → Check` glyph swap is discharged here. `chip`/`chipText` therefore have no consumer left in that file and are gone. Geometry consequence: those controls go from a 16pt pill to `radii.control` (8) with a 14/600 `colors.text` label, and the linked-row "Unlink" goes from bare red text to `Button variant="destructive" size="sm"` per the standing labeled-destructive rule.

### Task 10 — `rowLabel` (15/400) split three ways, and the nav row is not a section

The retired `rowLabel` did four different jobs at one size. Split by what each actually is:

- **Row titles** — the concept name, the vendor name, RampCard's active level — take `typography.rowTitle` (16/600). `itemTitle` (15/600) landed on the same token, so the two are now one thing.
- **Labels beside a control in a row** — the four `BoolRow` switch labels, ConceptRow's two switch labels — take `typography.body` + `colors.text`. They are row copy, not field headings.
- **Labels above a field group** — `ChipPicker`'s "Spice tolerance" / "Max prep time" / "Leftovers OK for" — take **`typography.section`**, per the standing "one form-label token app-wide" rule. This is the most visible typography change in the task: they go from 15/400 white to 13/700 uppercase muted, and they now read as headings above their chip rows rather than as more switch labels.

**The "Food Matching" nav row does not use `SectionHeader`.** The plan routes `sectionTitle` there, but this call site is the primary label of a tappable disclosure row, not a passive section heading — `typography.section` would have rendered the row's own name as 13/700 uppercase muted beside a full-strength description. It takes `typography.rowTitle`, the same call Task 5 recorded for the edit-food accordion titles ("they are row *controls*, not passive section labels"). The other five `sectionTitle` call sites do use the primitive.

### Task 10 — `ConceptRow`'s five rating hues, re-expressed in existing tokens

`RATING_COLORS` held three raw literals (`never`, `dislike`, `like`) beside two shim tokens. No new token group was added — unlike `macroColor` (Task 8) and `beverageColor` (Task 9, deferred), this scale maps cleanly onto tokens the system already has:

| Rating | Was | Now |
|---|---|---|
| `never` | `#F87171` | `colors.danger` (the one red) |
| `dislike` | `#FB923C` | `colors.warning` |
| `neutral` | `mutedForeground` | `colors.textMuted` |
| `like` | `#60A5FA` | `colors.text` |
| `love` | `primary` | `colors.brand` |

Four are near-renames. **`like` is a real hue change** — a light blue becomes full-strength white. Blue in this app is the water accent and has no identity role on a food-rating scale, so it could not survive contract 1 (the same reasoning Task 8 used to send `FoodPreviewModal`'s "auto-scaled" pill from `#3B82F6` to `neutral`). `colors.text` keeps the five steps monotonic and legible — red, amber, muted, full-strength, brand — reading as an escalating verdict without inventing a hue. The rating stays a colored `Text` rather than a `Badge`, because the same string carries the `· ✂︎` / `· ⏱` suffixes and `Badge` cannot hold them.

### Task 10 — loading/empty states, and the definite-size question

Both screens' error branches become `<EmptyState … action={{ label: "Retry" }}>` and both loading branches become `<LoadingState />`, matching `ShoppingListScreen` — the directly analogous screen (same `load`/`run`/`body` idiom) that Task 6 migrated. The bespoke `centerFill` + `retryButton` styles and the two hand-rolled `ActivityIndicator`s are gone.

Neither needs a `flexGrow` chain or a `minHeight` box. Both primitives are rendered as the **direct child of a container with a definite main size**: in `NutritionPreferencesScreen` that is `Screen`'s `scroll={false}` `<View style={{ flex: 1 }}>`, and in `FoodMatchingScreen` it is the view-switch container (`flex: 1`, inset-padded) with the header as its only sibling. This is the "parent with a definite main size" the Task 9 spec-review amendment identified as the actual requirement — the `flexGrow` chain and the `minHeight` box are two ways of producing it, and neither is needed when a `flex: 1` ancestor already supplies it directly. Nothing is rendered as a `ListEmptyComponent` here, so no content container needs `flexGrow`.

### Task 10 — section counts moved out of the title string into a `Badge`

`FoodMatchingScreen`'s `sections` memo emitted `` `Needs review (${n})` ``. It now emits `title` plus a `count: number`, and `renderSectionHeader` renders `<SectionHeader title={…} badge={<Badge label={String(count)} tone="neutral" />} />`. Exactly the Task 6 shopping-sections conversion, including the reasoning: this is a presentational change to a derived array — no filtering, ordering, `keyExtractor` or section identity changed, and the counts still come from the same two arrays handed to the `SectionList`. `tone="neutral"` because nutrition preferences has no domain accent and nothing in the plan names one.

### Task 10 — smaller deviations and unitemized deltas, recorded together

- **Section cards are `Card variant="panel"`, item rows are `Card variant="row"`.** The four section cards had `padding: 16`, which is `panel` exactly; their radius converges 12 → `radii.panel` (16). The per-item cards (concept rows, product rows, linked rows) take `row` (12/12), which is what the plan's "concept/vendor rows → `Card row`" asks for. All of them move from `colors.card` (the shim's alias for `surface2`) to `Card`'s `colors.surface`, the same shift Task 8 recorded for every `colors.card` block that became a `Card`; the inputs sitting on them are `surface2`, so fields are now lighter than their card, which reads correctly.
- **Inputs take the canonical sheet-recipe input verbatim** (`surface2` fill, `border` outline, `radii.control`, `spacing.md` padding both axes, `fontSize: 16`, `colors.text`) in all four files that have one. Real deltas: the background goes from `colors.background` (`bg`) to `surface2`, vertical padding 8 → 12, and text 15 → 16. §4.5 defines no input token, so 16 is the recipe's documented literal.
- **`SectionHeader` has no `style` prop**, so each of the five call sites sits in a bare wrapper `<View>` carrying `marginBottom: spacing.md` — the Task 9 `WaterHistoryList` precedent.
- **Three gaps that did not exist before were added,** each where tokenization exposed a collision rather than as free polish: `searchInput`'s `marginTop: spacing.md` (the search field sat flush against the "✂︎ small pieces" line), `VendorRow`'s editor `gap: spacing.sm` (its Name and URL fields were flush against each other), and both lists' `paddingTop: spacing.lg` (the first card sat directly under the header bar).
- **`Button` cannot flex, only stretch**, so RampCard's "Advance to …" and ConceptRow's "Delete concept" use `fluid` — both were full-width `alignItems: "center"` blocks. "Delete concept" sits in a `deleteWrap` carrying the `marginTop: 12` the old `destructiveButton` style owned.
- **The destructive label is now one red.** `destructiveButtonText`'s `#F87171` and `unlinkText`'s `#F87171` both become `Button variant="destructive"`'s `colors.danger` (`#EF4444`), which is the point of spec §4.1's "the one red".
- **Bottom inset `insets.bottom + 24 → insets.bottom + spacing.xxl`** in both lists — a pure rename (`spacing.xxl` is 24).
- **`Switch` `trackColor` `{ true: colors.primary }` → `colors.brand`** in all three files that render one; `thumbColor` was never set and still is not.
- **The vendor deep-link text stays a `<Text onPress>` with its trailing `↗`.** Task 6's glyph swap covers text-glyph *controls* that are their own element; this glyph is a suffix inside a link string nested in the row's expand `TouchableOpacity`, and promoting it to a sibling `TouchableOpacity` + lucide `ArrowUpRight` would change gesture arbitration between the link and the expand tap. It is tokenized to `colors.brand` (a control, so brand — never an accent) and left structurally alone. `✂︎` and `⏱` likewise stay: status glyphs inside prose, per the Task 6 carve-out.
- **`FoodMatchingScreen`'s section headers are still transparent**, so with `SectionList`'s default `stickySectionHeadersEnabled` on iOS, rows scroll behind a stuck header. That is exactly how it behaves today (the old header was a bare `<Text>` with no background); giving the wrapper a `colors.bg` fill would be a visual change the plan does not ask for, and disabling stickiness would be a behavior change. Left as-is, recorded so it is not mistaken for a regression introduced here.

### Task 10 — no behavior bug found

Reviewed hunk by hunk across all six files: no handler, state setter, data fetch, `useCallback`/`useMemo`/`useEffect` dependency, `Alert` flow, `Linking` call, modal open/close path or view-switch condition changed. `VendorRow`'s and `ConceptRow`'s `dirtyRef`/`latest`/`flush` edit-flush machinery is byte-identical, as are both screens' `load`/`run` idioms and the `silent` resync on returning from Food Matching. The two structural edits are presentational and were verified to preserve the rendered result: moving the section counts out of the title strings into a `Badge`, and replacing the four hand-rolled `TouchableOpacity` controls in `FoodMatchingScreen` with `Button`s carrying the same closures.

Gates: `npx tsc --noEmit` → 0 errors; `npm test` → 12 suites / 321 tests passing; both greps clean on all six files; `ls .../styles.ts` → No such file or directory; zero orphaned style keys and zero unused imports.

### Task 9 (quality review) — six fixes, one of them the same defect as the modal sheets

**1. `WaterScreen`'s own `ScrollView` was swallowing taps too.** The previous round fixed `keyboardShouldPersistTaps="handled"` on the three modal sheets and missed the one **on-screen** form: `WaterCustomLogForm` lives inside the screen's scroller, and its amount `TextInput` sits directly above its beverage chips and its "Add" `Button`. Focus the field, tap a chip or Add, and RN spends the first tap dismissing the keyboard. Same class, same fix, same one-line rationale at the call site. This is worth stating as a rule rather than a fix: **the prop belongs on any scroller that has both a text input and a control inside it, not just on modal sheets** — the recipe is where it was noticed, not where it is scoped.

**2 & 3. The in-card section header is one recipe now.** `WaterInsightsCard` hand-rolled `<Text style={typography.section}>` for the same in-card title that `WaterQuickAddCard` renders through `<SectionHeader>`, inside an identical `Card variant="panel"` — two answers to one widget, which is exactly the drift this cycle exists to remove. It now uses `SectionHeader`, and its duplicate `title` style key is deleted. The wrapper that carries the spacing (`SectionHeader` takes no `style` prop) is converged on **one name and one value across all four consumers**: `sectionHeader: { marginBottom: spacing.md }`. `WaterQuickAddCard` was the odd one out on both counts (`header` / `spacing.sm`) and moves to the majority; its quick-add pills consequently sit 4pt lower.

**4. `WaterUndoSnackbar` is safe-area aware.** A flat `bottom: spacing.xxl` (24) put the bar inside the 34pt home-indicator zone on a notched device — in the same commit that added `insets.bottom` to the scroller, so the screen was internally inconsistent. It now calls `useSafeAreaInsets()` and passes `bottom: insets.bottom + spacing.md` inline, matching `mobile/CLAUDE.md`'s insets pattern. The hook is called before the `if (!visible) return null` early return, so the rules of hooks hold. **Its timer still lives entirely in `WaterScreen` and is untouched** — this component holds no timer at all.

Its comment is also corrected: it claimed the `border` outline helped separate the bar from `bg`. It does not — `colors.border` (`#1F2937`) on `colors.surface2` (`#1E293B`) differs by roughly one step per channel and is invisible. The `surface2` **fill** does all the separating; the border is retained only so the snackbar matches every other raised surface. The rendering was right, the reasoning was wrong, and a wrong reason in a comment propagates the same way a wrong reason in this plan does.

**5. Dead weight deleted.** `WaterBarChart`'s entire `StyleSheet` existed for `wrap: { width: "100%" }` — a no-op on a stretch-aligned column child, doubly so beside an `Svg` that already declares `width="100%"`. The wrapper `<View>`, the stylesheet and the now-unused `View`/`StyleSheet` imports are gone and the component returns its `Svg` directly (children re-indented by hand, no formatter). `WaterCustomLogForm`'s `inputContainer: { flex: 1 }` wrapped a single `TextInput`; the `flex: 1` moves onto `input` and the wrapper is deleted.

**6. `WaterCalendarModal`'s `onChange` is typed.** It was `(event: any, picked?: Date)`; the dependency exports `DateTimePickerEvent` (`{ type: 'set' | 'neutralButtonPressed' | 'dismissed'; nativeEvent: … }`), which is imported and used. `WaterScreen`'s `handleDatePickerChange` — the only implementation of that prop, and the other half of the same `any` — is typed with it as well, so the `event.type === "dismissed"` check is now checked rather than assumed. No `any` remains in the water fleet.

### Task 9 (quality review) — recorded, deliberately not acted on

- **The hand-rolled beverage badge's `10`/`3` padding** in `WaterHistoryList` is raw. It is a deliberate copy of `ui/Badge`'s own `paddingHorizontal: 10, paddingVertical: 3` — the primitive hardcodes those two values itself, because §4.3's scale has no 10 and no 3 — and copying them is what makes this badge visually identical to every real `Badge` beside it. Tokenizing only the copy would make it *differ* from the primitive it is imitating. The real fix is upstream, in `Badge`, and it is not a Task 9 change.
- **`fontSize: 12` + `fontWeight: "600"` now appears verbatim in four files** (`WaterCustomLogForm`, `WaterLogEditorModal`, `WaterQuickAddEditorModal`'s chip labels, and `WaterHistoryList`'s badge label), copied from Task 8's `MealLogEditorModal`/`QuickAdjustmentModal`. That is six call sites of one unnamed style across two tasks — a **de-facto token the module lacks**: a 12/600 "chip/badge label", sitting between `caption` (12/400) and `buttonSm` (14/600), and it is also exactly what `ui/Badge` hardcodes internally. **Task 11 token proposal: add it (e.g. `typography.label`) and point all six call sites plus `Badge` at it.** Deliberately NOT added here — inventing a token late in a cosmetic cycle is the scope expansion this cycle avoids, and no fifth hand-rolled copy was created either.
- **`WaterDayStrip`'s `DAY_INITIALS[i]`** indexes a fixed 7-entry Sunday-first array by the map index of `weekDates`, so it silently assumes the caller always passes exactly seven days starting Sunday. `WaterScreen` does (`startOfWeek` sets `getDay()` to 0 and builds 7), so there is no live bug — but the label is positional rather than derived from each entry's own `date`. Pre-existing coupling with no styling content; out of scope for a restyle, worth a line in Task 11's closeout.
