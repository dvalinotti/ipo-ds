# iPoDS — Plan 9: Lint and Format Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Every task ends green on `bun run test` unless the task says otherwise.

**Goal:** Enforce one format (Prettier) and one rule set (ESLint with typescript-eslint, eslint-plugin-solid and the PocketJS guest rules) on iPoDS's TypeScript, gate both in CI, and change no behaviour.

**Architecture:**
- The tools are root `devDependencies` with a root `bun.lock`. The framework packages stay symlinked from `runtime/` by `scripts/setup.ts`; its `@types` link narrows to `@types/bun`, so the root install owns `node_modules/@types` instead of writing through the link into the submodule.
- Prettier formats `app/`, `scripts/`, `tests/` and the root `.ts` / `.js` files at `printWidth: 120`, other options default. One commit applies it; `.git-blame-ignore-revs` records that commit.
- ESLint 10 flat config, type-aware through `tsconfig.lint.json` (`tsconfig.json` plus `noUncheckedIndexedAccess`). Presets: `strictTypeChecked` and `stylisticTypeChecked`, Solid's TypeScript preset for `app/`, then the PocketJS guest rules for `app/`, then `eslint-config-prettier`.
- `bun run check` runs `scripts/check.ts`: `tsc` on `tsconfig.json`, then on `tsconfig.lint.json` with errors outside iPoDS's own files dropped (the runtime sources `tsc` follows are not written for that flag).
- The 3DS pipeline does not read `--strict-classes`: it prints `class "…" does not compile` and exits 0. A test fails on that warning instead.
- A GitHub Actions workflow runs check, lint, format check and the tests on every push to `main` and every pull request.

**Tech Stack:** ESLint 10.12.0, `@eslint/js` 10.0.1, typescript-eslint 8.71.2, eslint-plugin-solid 0.18.1, eslint-config-prettier 10.1.8, Prettier 3.9.10, TypeScript 5.9.3 (the runtime's), Bun 1.4.2.

**Spec:** the measurements under *Findings* (there is no separate spec document). Every number there comes from a trial run with the configuration in this plan on a copy of the tree at `56bfcbd`, whose TypeScript is `main`'s at `d6e8d08`.

## Findings

| Measure | Result |
|---|---|
| TypeScript in scope | 85 files, 6,987 lines; 0 `any`, 0 classes, 2 default exports, double quotes, semicolons, 2-space indent |
| Lines over 120 / 140 / 200 columns today | 255 / 111 / 10 |
| Prettier at width 80 / 100 / 120 / 140 | 77 / 71 / 57 / 47 files change; the code (without the generated compose table) grows from 6,796 lines to 10,090 / 8,941 / 8,157 / 7,679 |
| Bundle after Prettier at 120 | `ipo-ds-main.pak` byte-identical; `ipo-ds-main.js` identical except the source-path comments of a copy in another directory (identical in place) |
| `tsc --noUncheckedIndexedAccess` | 460 errors, 458 in `runtime/`, 2 in iPoDS (`app/now-playing/frame-time.ts:16`) |
| Other flags | `verbatimModuleSyntax`, `isolatedModules`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noUnusedParameters`: 0 errors. `noUnusedLocals`, `noImplicitReturns`: 1 each, both in `runtime/`. `exactOptionalPropertyTypes`: 31 in iPoDS (Solid optional props) |
| ESLint, presets untuned | 378 findings in 52 files: `no-non-null-assertion` 146, `no-unnecessary-type-assertion` 81, `restrict-template-expressions` 58, `solid/reactivity` 31, `no-confusing-void-expression` 30, `solid/style-prop` 8, others 24 |
| ESLint, this plan's config | 31 findings in 17 files, the same 31 before and after Prettier (Task 5 lists each); the PocketJS guest rules flag nothing in today's code |
| ESLint time | 10 s for the repo under `bun --bun` |
| After Tasks 1–6 on the copy | `bun run check`, `bun run lint`, `bun run format:check` clean (also with Node off `PATH`); `bun run test` 189 pass, 0 fail (before Task 6 adds its test); Task 6's test fails on a bad token and passes without it (4 s) |
| 3DS build with `--strict-classes` and a bad token | warning printed, exit 0 (the flag is read by `runtime/tools/build.ts`, not by `runtime/tools/3ds.ts`) |
| Root `bun install` with the current `@types` link | keeps every link, but writes `@types/esrecurse` and `@types/json-schema` into `runtime/node_modules/@types` |
| Root `bun install` with only `@types/bun` linked | keeps every link, writes nothing into `runtime/`; `tsc` passes |

## Rule decisions

| Rule | Setting | Why |
|---|---|---|
| `@typescript-eslint/no-non-null-assertion` | off | `noUncheckedIndexedAccess` (lint tsconfig) checks index reads; `!` marks one known to be in range, and `no-unnecessary-type-assertion` removes any `!` the types make redundant |
| `@typescript-eslint/unbound-method` | off | no classes or `this`: factories return objects of closures (`onUp: grab.release`) |
| `@typescript-eslint/consistent-type-definitions` | off | interfaces for object shapes and type aliases for unions are both used deliberately |
| `@typescript-eslint/consistent-type-imports` | error, `inline-type-imports` | matches the existing `import { x, type Y }` style; `--fix` applies it |
| `@typescript-eslint/no-confusing-void-expression` | `ignoreArrowShorthand` | `() => session.dispatch(…)` handlers are the house style (30 hits otherwise) |
| `@typescript-eslint/no-misused-spread` | allow `string` | `[...text]` iterates code points, which is what glyph and font checks want |
| `@typescript-eslint/restrict-template-expressions` | `allowNumber` | numbers in labels and messages (58 hits otherwise) |
| `solid/reactivity` | error, `customReactiveFunctions` | the PocketJS and iPoDS functions that take accessors or handlers: `onFrame`, `onButtonPress`, `onRepeat`, `onTapOrHold`, `onAnalogRows`, `createGesture`, `settled` (21 false positives otherwise) |
| `solid/style-prop` | off | `style` keys are PocketJS prop names (`translateX`, `insetT`) with numeric values, not CSS |
| `no-restricted-imports` (`app/`) | error | `createResource` / `useTransition` / `startTransition` (the PocketJS Solid build rejects them), `solid-js/web`, `node:*` / `bun` / `bun:*`, any `runtime/` path |
| `no-restricted-globals` (`app/`) | error | `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `requestAnimationFrame`, `performance`: QuickJS has no event loop or performance clock |
| `no-restricted-syntax` (`app/`) | error | `classList`, a template literal or `+` inside `class`: class strings compile only as complete literals |

## Global Constraints

- **Branch:** `chore/lint-format` from `main`. The merge is the user's call after review.
- **No fork changes.** The `runtime` pin does not move. The 3DS pipeline's ignored `--strict-classes` is a PocketJS change (CLAUDE.md); Task 6 works around it here.
- **No behaviour change.** Task 2's bundle is identical to Task 0's. After Task 5, `bun run test` passes with the same 189 tests, and `bun run gallery` writes images byte-identical to Task 0's.
- **Scope is TypeScript.** Prettier and ESLint never walk `runtime/` (CLAUDE.md): Prettier gets explicit globs, and ESLint's global ignore stops it from descending. JSON, Markdown, HTML and YAML stay hand-formatted.
- **Exact versions** in `package.json` (no ranges), so `bun install --frozen-lockfile` in CI matches local runs. `typescript` matches `runtime/node_modules/typescript/package.json`; move it with the runtime pin.
- **Commits:** Conventional Commits (`build:`, `style:`, `fix:`, `test:`, `ci:`, `docs:`).

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `package.json`, `bun.lock` | 1, 2, 3, 4 | dev dependencies; `check`, `lint`, `lint:fix`, `format`, `format:check` scripts |
| `scripts/setup.ts` | 1 | link `@types/bun`, not the whole `@types` directory |
| `.prettierrc.json`, `.prettierignore` | 2 | width 120; ignore `runtime/`, `dist/`, the generated compose table and non-TypeScript files |
| `.git-blame-ignore-revs` | 2 | the formatting commit |
| `tsconfig.lint.json` | 3 | `tsconfig.json` plus `noUncheckedIndexedAccess`; includes `pocket.config.ts` |
| `scripts/check.ts` | 3 | the two `tsc` passes |
| `app/now-playing/frame-time.ts` | 3 | the two unchecked index reads |
| `eslint.config.js` | 4 | the flat config |
| `app/**`, `scripts/sim.ts`, `tests/**` | 5 | the 31 findings |
| `tests/build.test.ts` | 6 | class literals compile in both manifests |
| `.github/workflows/check.yml` | 7 | CI |
| `AGENTS.md`, `README.md` | 8 | setup, commands, standards |

---

## Task 0: Workspace and baseline

- [ ] **Step 1: Branch and set up.**

```bash
git switch -c chore/lint-format main
git submodule update --init runtime
bun install --cwd runtime --frozen-lockfile
bun scripts/setup.ts
bun run --cwd runtime wasm
```

- [ ] **Step 2: Confirm the baseline is green.** `bun run check` → clean. `bun run test` → **189 pass, 0 fail**.

- [ ] **Step 3: Record the baselines** (outside Git):

```bash
bun scripts/build.ts --pocket-only --outdir=.local/baseline/guest --package-outdir=.local/baseline
bun run gallery && cp -R dist/gallery .local/gallery-baseline
```

---

## Task 1: Root dev dependencies

**Files:** `package.json`, `bun.lock` (new), `scripts/setup.ts`, `README.md` (Build), `AGENTS.md` (Setup)

- [ ] **Step 1: Narrow the `@types` link.** In `scripts/setup.ts`, replace the `"@types": "runtime/node_modules/@types"` entry with `"@types/bun": "runtime/node_modules/@types/bun"`, and before the loop drop a checkout's old directory link:

```ts
// An older setup linked the whole @types directory; linking @types/bun through it would delete runtime's copy.
const types = resolve(root, "node_modules/@types");
if (lstatSync(types, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(types);
```

(`lstatSync` joins the `node:fs` import.) Without the guard, `rmSync(destination, { recursive: true })` for `node_modules/@types/bun` resolves through the old link and deletes `runtime/node_modules/@types/bun`. Run `bun scripts/setup.ts` now, before any root install: a root install through the old link writes into `runtime/node_modules/@types`.

- [ ] **Step 2: Add the dev dependencies** to `package.json`:

```json
"devDependencies": {
  "@eslint/js": "10.0.1",
  "eslint": "10.12.0",
  "eslint-config-prettier": "10.1.8",
  "eslint-plugin-solid": "0.18.1",
  "prettier": "3.9.10",
  "typescript": "5.9.3",
  "typescript-eslint": "8.71.2"
}
```

- [ ] **Step 3: Install and relink.**

```bash
bun install
bun scripts/setup.ts
```

Expected: `node_modules/@pocketjs/framework`, `solid-js`, `bun-types` and `@types/bun` are links into `runtime/`; `node_modules/@types` is a directory; `git -C runtime status --short` is empty and `ls runtime/node_modules/@types` lists no `esrecurse` or `json-schema`. `bun run check` → clean; `bun run test` → 189 pass.

- [ ] **Step 4: Document the install.** In the README's Build block and AGENTS.md's Setup block, add `bun install --frozen-lockfile` after the runtime install. In AGENTS.md, replace "there is no root lockfile" with: the root `bun.lock` holds the lint and format tools; `typescript` there matches the runtime's.

- [ ] **Step 5: Commit** `build: root dev dependencies for lint and format`.

---

## Task 2: Prettier

**Files:** `.prettierrc.json`, `.prettierignore`, `package.json`, every TypeScript file, `.git-blame-ignore-revs`

- [ ] **Step 1: Configure.**

`.prettierrc.json`:

```json
{ "printWidth": 120 }
```

`.prettierignore` (also keeps editors from reformatting the files the scripts leave alone):

```
runtime/
dist/
app/library/compose-table.ts
*.md
*.json
*.html
*.yml
```

`package.json` scripts:

```json
"format": "prettier --write \"app/**/*.{ts,tsx}\" \"scripts/**/*.ts\" \"tests/**/*.ts\" \"*.{ts,js}\"",
"format:check": "prettier --check \"app/**/*.{ts,tsx}\" \"scripts/**/*.ts\" \"tests/**/*.ts\" \"*.{ts,js}\""
```

Commit these three files alone: `build: Prettier at width 120 for TypeScript`.

- [ ] **Step 2: Format.** `bun run format`. Expected: 57 files change.

- [ ] **Step 3: Prove nothing but whitespace moved.**

```bash
bun scripts/build.ts --pocket-only --outdir=.local/formatted/guest --package-outdir=.local/formatted
cmp .local/baseline/guest/ipo-ds-main.js .local/formatted/guest/ipo-ds-main.js
cmp .local/baseline/guest/ipo-ds-main.pak .local/formatted/guest/ipo-ds-main.pak
```

Expected: both identical. `bun run check` clean; `bun run test` 189 pass; `bun run format:check` clean.

- [ ] **Step 4: Commit** `style: format TypeScript with Prettier`. This commit holds only Prettier's output.

- [ ] **Step 5: Keep blame readable.** Write the Step 4 commit's full hash into `.git-blame-ignore-revs` under a `# style: format TypeScript with Prettier` comment line, and commit `chore: ignore the formatting commit in git blame`. (GitHub reads the file; locally, `git config blame.ignoreRevsFile .git-blame-ignore-revs`.)

---

## Task 3: Unchecked index reads fail the check

**Files:** `tsconfig.lint.json`, `scripts/check.ts`, `package.json`, `app/now-playing/frame-time.ts`

- [ ] **Step 1: Add the strict tsconfig.**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true },
  "include": ["app", "scripts", "tests", "pocket.config.ts", "runtime/framework/src/jsx.d.ts"]
}
```

- [ ] **Step 2: Add `scripts/check.ts`** and point `"check"` at it (`"check": "bun scripts/check.ts"`):

```ts
// Type-checks iPoDS twice: with tsconfig.json, as the build sees it, and with
// tsconfig.lint.json, which adds noUncheckedIndexedAccess. tsc also checks the
// runtime sources the app imports, which are not written for that flag, so the
// second pass fails only on errors in iPoDS's own files.
const OWN = /^(app|scripts|tests)\/|^pocket\.config\.ts\(/;
const PASSES = [
  ["tsconfig.json", () => true],
  ["tsconfig.lint.json", (line: string) => OWN.test(line)],
] as const;

let failed = false;
for (const [project, keep] of PASSES) {
  const run = Bun.spawnSync(["bun", "runtime/node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false", "-p", project], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "inherit",
  });
  const errors = run.stdout
    .toString()
    .split("\n")
    .filter((line) => line.includes(": error TS") && keep(line));
  if (errors.length > 0) {
    failed = true;
    console.error(`${project}: ${errors.length} error(s)\n${errors.join("\n")}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Watch it fail.** `bun run check` → exit 1, `tsconfig.lint.json: 2 error(s)`, both at `app/now-playing/frame-time.ts(16,…)`: `Object is possibly 'undefined'`.

- [ ] **Step 4: Fix with a tuple guard.** In `app/now-playing/frame-time.ts`, after `usable`:

```ts
const usablePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(usable);
```

and replace the `Array.isArray(frame) || frame.length !== 2 || !frame.every(usable)` guard with `if (!usablePair(frame)) return "F:-";`. (A destructure of `frame` after `Array.isArray` reads an `any[]` and fails Task 4's `no-unsafe-assignment`.)

- [ ] **Step 5: Confirm.** `bun run check` → exit 0, about 8 s. `bun test --conditions=browser tests/frame-time.test.ts` → pass.

- [ ] **Step 6: Commit** `build: type-check iPoDS with noUncheckedIndexedAccess`.

---

## Task 4: ESLint

**Files:** `eslint.config.js`, `package.json`

- [ ] **Step 1: Add `eslint.config.js`.**

```js
// ESLint for iPoDS's TypeScript: typescript-eslint's strict and stylistic type-checked
// presets, eslint-plugin-solid for app/, and the PocketJS guest rules the build and
// QuickJS impose. Prettier owns formatting (eslint-config-prettier goes last).
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import solid from "eslint-plugin-solid/configs/typescript";
import tseslint from "typescript-eslint";

/** PocketJS and iPoDS functions that take accessors or handlers (solid/reactivity treats them as tracked). */
const REACTIVE_FUNCTIONS = ["onFrame", "onButtonPress", "onRepeat", "onTapOrHold", "onAnalogRows", "createGesture", "settled"];
const NO_TIMERS =
  "QuickJS has no event loop: setTimeout ignores its delay. Count frames (onFrame) or use after() from @pocketjs/framework/clock.";
const LITERAL_CLASSES = "Class strings compile only as complete literals: choose between literals with a ternary.";

export default defineConfig(
  { ignores: ["runtime/", "dist/", "node_modules/", "app/library/compose-table.ts"] },
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
            { group: ["node:*", "bun", "bun:*"], message: "app/ runs in the 3DS guest (QuickJS): no Node or Bun APIs." },
            {
              group: ["**/runtime/**"],
              message: "Import the framework through @pocketjs/framework/*; compiler and tool code stays out of the bundle.",
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
```

- [ ] **Step 2: Add the scripts.** `"lint": "bun --bun eslint ."` and `"lint:fix": "bun --bun eslint . --fix"` (`--bun` runs ESLint on Bun, so Node is not required).

- [ ] **Step 3: Prove the guest rules fire.** Write a throwaway `app/zz-probe.tsx` that imports `createResource` from `solid-js`, `readFileSync` from `node:fs` and a `../runtime/…` path, calls `setTimeout` and `performance.now()`, and renders ``<View class={`p-2 ${x}`} />``, `<View class={"p-2 " + x} />` and `<View class={on ? "p-2 bg-red-500" : "p-2 bg-slate-700"} />`. `bun run lint` → an error on each line except the ternary. Delete the probe.

- [ ] **Step 4: Record the findings.** `bun run lint` → **31 problems** (Task 5 lists them). Commit `build: ESLint with typescript-eslint, Solid and PocketJS guest rules` (lint is red until Task 5).

---

## Task 5: Fix the findings

**Files:** as listed; line numbers are after Task 2's formatting. No behaviour change: each fix is a type-level change, an explicit one-time read, or a test-only change.

| # | Finding | Fix |
|---|---|---|
| 1–4 | `solid/reactivity` `now-playing/now-playing.tsx:30–33`: `props.session.status`, `.player`, `.dispatch`, `.track` read at setup | `const session = untrack(() => props.session);` then `const status = session.status;` and the others from `session` (the session lives as long as the app); add `untrack` to the `solid-js` import |
| 5–7 | `solid/reactivity` `explorer/explorer.tsx:64–66`: `props.store.state`, `.dispatch`, `props.session.library` | `const { state, dispatch } = untrack(() => props.store);` and `const library = untrack(() => props.session.library);` |
| 8 | `solid/reactivity` `dj/dj-mode.tsx:12`: `const session = props.session` | `const session = untrack(() => props.session);`; import `untrack` from `solid-js` |
| 9 | `solid/reactivity` `dj/scratch.ts:37`: `let serial = opened();` | `let serial = untrack(opened);` (the effect after it compares against this snapshot) |
| 10 | `solid/reactivity` `explorer/recycled-list.tsx:39`: `slotSignal(slot())` | `slotSignal(untrack(slot))` (a slot's number never changes) |
| 11–15 | `no-unnecessary-type-assertion` in `theme/parts/`: `ref={props.ref as never}` at `deck.tsx:141`, `gel.tsx:15`, `platter.tsx:28`; `props.kind as …` at `deck.tsx:195`; `props.shadow!` at `gel.tsx:27` | `bun run lint:fix` removes them; confirm `bun run check` stays clean |
| 16–17 | `restrict-template-expressions` `scripts/sim.ts:36`: `Buffer` in a template | `${run.stdout.toString()}${run.stderr.toString()}` |
| 18–19 | same, `tests/build.test.ts:25` | same |
| 20–21 | `no-unsafe-*` `tests/build.test.ts:11–12`: `JSON.parse` is `any` | `JSON.parse(…) as { app: { output: string } }` |
| 22–23 | `no-unsafe-*` `tests/spinner-atlas.test.ts:13–15` | `JSON.parse(…) as Record<string, unknown>` |
| 24 | `no-unsafe-assignment` `tests/vinyl-png.test.ts:58` | `const images: unknown = JSON.parse(…)` |
| 25–27 | `no-unnecessary-condition` `tests/app.test.ts:527, 535`, `tests/gallery.test.ts:289`: the second `node.rect?.[3]` after `node.rect?.[2] === …` has already narrowed | `node.rect[3]` in those three places only; the first `?.` stays (`rect` is `null` for hidden nodes) |
| 28 | `no-unnecessary-type-assertion` `tests/dj.test.ts:78`: `{ … } as StepInput` | drop `as StepInput` (the return type checks it) |
| 29 | `no-useless-assignment` `tests/dj.test.ts:146`: `at = turn(…)` is never read | `turn(rig, at, -10, 18);`, and `let at` at line 134 becomes `const at` |
| 30 | `prefer-const` `tests/player.test.ts:52` | `const out` |
| 31 | `no-unused-expressions` `tests/session.test.ts:23`: the `@ts-expect-error` probe `session.player().status;` | `expectTypeOf(session.player()).not.toHaveProperty("status");` (import `expectTypeOf` from `bun:test`). Not a runtime `expect`: `PlayerView` omits `status` from the type only, and the object still carries it. Check the guard by changing `PlayerView` to `PlayerState`: `tsc` must fail on this line |

- [ ] **Step 1: Apply the table.** Run `bun run lint:fix` first (rows 11–15), then edit the rest by hand, then `bun run format`.

- [ ] **Step 2: Confirm.** `bun run lint` → 0 problems. `bun run check` → clean. `bun run format:check` → clean. `bun run test` → **189 pass, 0 fail**.

- [ ] **Step 3: Gallery unchanged.** `bun run gallery`, then `cmp` every file in `dist/gallery` against `.local/gallery-baseline` → all identical.

- [ ] **Step 4: Commit** `fix: resolve the lint findings`.

---

## Task 6: Class literals that do not compile fail the tests

**Files:** `tests/build.test.ts`

- [ ] **Step 1: Write the test** (append to `tests/build.test.ts`):

```ts
test("every class literal compiles, in the app and in the gallery (the 3DS build only warns)", () => {
  for (const manifest of ["pocket.json", "gallery.pocket.json"]) {
    const dir = mkdtempSync(join(tmpdir(), "ipo-ds-classes-"));
    try {
      const run = Bun.spawnSync(
        [process.execPath, "scripts/build.ts", "--pocket-only", `--manifest=${manifest}`, `--outdir=${join(dir, "guest")}`, `--package-outdir=${dir}`],
        { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
      );
      const output = `${run.stdout.toString()}${run.stderr.toString()}`;
      expect(run.exitCode, output).toBe(0);
      expect(output.split("\n").filter((line) => line.includes("does not compile"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}, 240_000);
```

- [ ] **Step 2: Watch it fail.** Add `<View class="p-2 bogus-token" />` inside `Gel` in `app/theme/parts/gel.tsx`. `bun test --conditions=browser tests/build.test.ts -t "class literal"` → fail, listing `app/theme/parts/gel.tsx:…: class "p-2 bogus-token" does not compile: unknown utility bogus-token`. Remove the line; the test passes.

- [ ] **Step 3: Commit** `test: a class literal that does not compile fails the build test`.

- [ ] **Step 4: Follow-up outside this plan.** In PocketJS, make `runtime/tools/3ds.ts` honor `--strict-classes`, then move the pin and pass the flag from `scripts/build.ts`. The test stays as the guard for both manifests.

---

## Task 7: CI

**Files:** `.github/workflows/check.yml`

- [ ] **Step 1: Add the workflow.** Pin each action to its current major at implementation time.

```yaml
name: check
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          submodules: true
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - run: bun install --cwd runtime --frozen-lockfile
      - run: bun install --frozen-lockfile
      - run: bun scripts/setup.ts
      - run: bun run check
      - run: bun run lint
      - run: bun run format:check
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - run: bun run --cwd runtime wasm
      - run: bun run test
```

- [ ] **Step 2: Confirm on the pull request** that the run is green, and that a pushed formatting slip (an extra space in any `app/` file) turns `format:check` red; revert it.

- [ ] **Step 3: Commit** `ci: check, lint, format and test on pushes and pull requests`.

---

## Task 8: Documentation

**Files:** `AGENTS.md`, `README.md`

- [ ] **Step 1: AGENTS.md Commands.** Add `bun run lint`, `bun run lint:fix`, `bun run format`, `bun run format:check`, and describe `bun run check` as the two `tsc` passes. Add one line under Code standards: ESLint and Prettier enforce the mechanical rules; run `bun run format` and `bun run lint` before committing.

- [ ] **Step 2: README Develop.** Add `bun run lint` and `bun run format` to the command block.

- [ ] **Step 3: Commit** `docs: lint and format commands`.

---

## Task 9: Branch verification

- [ ] **Step 1:** From a clean clone of the branch, run the Setup block in AGENTS.md, then `bun run check`, `bun run lint`, `bun run format:check` → clean; `bun run test` → 190 pass (189 plus Task 6's).
- [ ] **Step 2:** `bun run 3ds` builds the `.3dsx` (Docker) and it boots in Azahar to the Songs list; play a song and enter DJ Mode.
- [ ] **Step 3:** `git -C runtime status --short` is empty; `git status --short` shows nothing under `dist/` or `.local/`.

## Not in this plan

- **Prettier for JSON, Markdown, HTML, YAML.** The plans and specs in `docs/` are long, hand-formatted Markdown with tables; formatting them is a separate decision.
- **`prettier-plugin-tailwindcss`.** It reorders class tokens. PocketJS resolves conflicting tokens by position, and the plugin does not know the PocketJS subset.
- **`exactOptionalPropertyTypes`.** 31 errors in iPoDS, all from passing `T | undefined` to optional Solid props.
- **`noUncheckedIndexedAccess` in `tsconfig.json`.** It needs the runtime sources fixed first (458 errors), which is PocketJS work.
- **Pre-commit hooks.** CI enforces; contributors and agents run `bun run format` and `bun run lint` locally.
