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
