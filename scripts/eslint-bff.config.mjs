// Standalone ESLint flat config for the fe_bff_compliance gate check.
// Invoked by scripts/gate-check.sh with --config flag so it bypasses the
// web workspace's main eslint.config.* and only applies the BFF rule.
// Plan reference: .claude/plans/adaptive-mixing-creek.md §A9.

import tseslint from "typescript-eslint";

const forbiddenLiteralPattern =
  "Literal[value=/^https?:\\/\\/(localhost|127\\.0\\.0\\.1):(3001|3002|3003)/]";
const forbiddenTemplatePattern =
  "TemplateElement[value.raw=/(localhost|127\\.0\\.0\\.1):(3001|3002|3003)/]";
const message =
  "Browser code must not fetch service ports (3001/3002/3003) directly. Use /api/* BFF routes.";

export default [
  {
    ignores: ["apps/web/src/app/api/**", "apps/web/.next/**", "**/node_modules/**"],
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: forbiddenLiteralPattern, message },
        { selector: forbiddenTemplatePattern, message },
      ],
    },
  },
];
