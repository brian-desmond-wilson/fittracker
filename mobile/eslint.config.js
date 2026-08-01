// mobile/eslint.config.js
// Style-guide lint backstop (spec §9). This config exists for ONE rule: raw
// color literals must not appear outside the token module. It deliberately
// enables no other lint rules — adding a general lint pass to a ~160-component
// codebase is a separate project, and a config that fails on day one is a
// config nobody runs.
//
// Run: `npm run lint` (whole app) or `npx eslint src/theme src/components/ui`.
const tsParser = require("@typescript-eslint/parser");

/**
 * Both selectors match STRING LITERALS only. `rgba()` assembled from a template
 * literal or from string concatenation slips through — the rule is a backstop
 * for the common case, not a proof. Reviewers still read the diff.
 */
const rawColorLiterals = [
  {
    selector:
      "Literal[value=/^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/]",
    message: "Raw hex color — use tokens from @/src/theme/tokens",
  },
  {
    selector: "Literal[value=/^(?:hsla?|rgba?)\\(/]",
    message:
      "Raw color function — use tokens or tint() from @/src/theme/tokens",
  },
];

/**
 * Two files carry a pre-existing `// eslint-disable-next-line
 * react-hooks/exhaustive-deps` (`profile/nutrition/VendorsSection.tsx`,
 * `hooks/useEatNext.ts`). ESLint hard-errors on a disable directive naming a
 * rule it cannot resolve, which would make `npm run lint` exit 1 on day one
 * over something unrelated to color. The rule is declared here as a no-op so
 * the directives resolve; NOTHING enables it. If the hooks rules are ever
 * genuinely wanted, install `eslint-plugin-react-hooks` and swap this out.
 */
const reactHooksStub = {
  rules: { "exhaustive-deps": { create: () => ({}) } },
};

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "android/**",
      "ios/**",
      ".expo/**",
      "scripts/**",
    ],
  },
  {
    // Everywhere: a warning. Most of the app (training, workout-session,
    // schedule, non-nutrition profile) is out of this cycle's migration reach
    // and adopts on touch, so these must not block anyone's commit.
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooksStub },
    // The stub above never reports, so both real directives look "unused".
    // Reporting them would invite someone to delete a comment that matters the
    // moment the real plugin is installed.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-restricted-syntax": ["warn", ...rawColorLiterals],
    },
  },
  {
    // The primitives: an error. Every screen in the app is built out of these
    // seven components, so one raw literal here is one raw literal everywhere.
    files: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": ["error", ...rawColorLiterals],
    },
  },
  {
    // The token module is the ONE sanctioned home for raw color values (spec
    // §9: "token module and its shim excepted"). `tokens.ts` holds ~29 of them
    // by design and `tokens.test.ts` asserts on them, so the rule is off here
    // rather than error — the spec's own carve-out, expressed in config.
    // (`src/lib/colors.ts`, the shim, re-exports and holds no literals.)
    files: ["src/theme/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];
