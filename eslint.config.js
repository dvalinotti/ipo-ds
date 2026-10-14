// ESLint for iPoDS's TypeScript: typescript-eslint's strict and stylistic type-checked
// presets, eslint-plugin-solid for app/, and the PocketJS guest rules the build and
// QuickJS impose. Prettier owns formatting (eslint-config-prettier goes last).
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import solid from "eslint-plugin-solid/configs/typescript";
import tseslint from "typescript-eslint";

/** PocketJS and iPoDS functions that take accessors or handlers (solid/reactivity treats them as tracked). */
const REACTIVE_FUNCTIONS = [
  "onFrame",
  "onButtonPress",
  "onRepeat",
  "onTapOrHold",
  "onAnalogRows",
  "createGesture",
  "settled",
];
const NO_TIMERS =
  "QuickJS has no event loop: setTimeout ignores its delay. Count frames (onFrame) or use after() from @pocketjs/framework/clock.";
const LITERAL_CLASSES = "Class strings compile only as complete literals: choose between literals with a ternary.";

export default defineConfig(
  { ignores: ["runtime/", "dist/", ".local/", "node_modules/", "app/library/compose-table.ts"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: { parserOptions: { project: "./tsconfig.lint.json", tsconfigRootDir: import.meta.dirname } },
    rules: {
      // Index reads are checked by noUncheckedIndexedAccess (tsconfig.lint.json); `!` marks one known to be in range.
      "@typescript-eslint/no-non-null-assertion": "off",
      // No classes or `this`: factories return objects of closures, which are safe to pass unbound.
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      // Spreading a string yields code points, which is what glyph and font checks want.
      "@typescript-eslint/no-misused-spread": ["error", { allow: [{ from: "lib", name: "string" }] }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ...solid,
    rules: {
      ...solid.rules,
      "solid/reactivity": ["error", { customReactiveFunctions: REACTIVE_FUNCTIONS }],
      // style={{}} keys are PocketJS prop names (translateX, insetT) with numeric values, not CSS.
      "solid/style-prop": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "solid-js",
              importNames: ["createResource", "useTransition", "startTransition"],
              message: "PocketJS's Solid build rejects Solid's async features; use a signal and an effect.",
            },
            { name: "solid-js/web", message: "PocketJS renders through @pocketjs/framework/solid." },
          ],
          patterns: [
            {
              group: ["node:*", "bun", "bun:*"],
              message: "app/ runs in the 3DS guest (QuickJS): no Node or Bun APIs.",
            },
            {
              group: ["**/runtime/**"],
              message:
                "Import the framework through @pocketjs/framework/*; compiler and tool code stays out of the bundle.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...["setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame"].map((name) => ({
          name,
          message: NO_TIMERS,
        })),
        { name: "performance", message: "QuickJS has no performance clock; timing is frame-based." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='classList']", message: `PocketJS rejects classList. ${LITERAL_CLASSES}` },
        { selector: "JSXAttribute[name.name='class'] TemplateLiteral", message: LITERAL_CLASSES },
        { selector: "JSXAttribute[name.name='class'] BinaryExpression[operator='+']", message: LITERAL_CLASSES },
      ],
    },
  },
  { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);
