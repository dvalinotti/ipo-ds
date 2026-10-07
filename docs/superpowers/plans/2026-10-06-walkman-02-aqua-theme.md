# iPoDS Walkman — Plan 2: Aqua Theme, Parts Kit and Gallery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved Aqua / iTunes 4 mockups into an app-owned `Theme` (`AQUA`), baked icons, font coverage and presentational parts. A separate gallery bundle uses those parts to reproduce the six mockup states in the PocketJS sim and renders them to PNG for the user's visual sign-off.

**Architecture:** Everything lives in ipo-ds; there are no fork changes.
- **Theme:** `app/theme/theme.ts` declares semantic slots. `app/theme/aqua.ts` fills them with complete class literals, because the build compiles only literal strings and variants are functions choosing between literals.
- **Parts:** `app/theme/parts/*.tsx` are stateless Solid components that read only from a `Theme`.
- **Gallery:** `gallery.pocket.json` builds `app/gallery.tsx`, a storyboard of the mockup states, into its own bundle (`ipo-ds-gallery`).
- **Build:** `scripts/build.ts` gains `--manifest=`. `scripts/sim.ts` builds and boots any manifest for both tests and `scripts/gallery.ts`.

**Tech Stack:** Bun, TypeScript, SolidJS via `@pocketjs/framework`, PocketJS build pipeline (class compiler, SVG baker, font baker), PocketJS sim (WASM core).

**Spec:** `docs/superpowers/specs/2026-10-06-walkman-visual-design.md` (parent: `docs/superpowers/specs/2026-10-06-walkman-player-design.md` §6) · **Mockups:** `docs/design/aqua/main.html`, `docs/design/aqua/states.html`

**Provenance:** every code block below was assembled and run in a throwaway trial of this exact file set before the plan was written. The results were 57/57 tests, a clean `bun run check`, 12 gallery PNGs and a successful `bun run 3ds --pocket-only`. The repo was restored afterwards. The expected outputs come from that run.

## Global Constraints

- Framework code belongs in the PocketJS fork; **this plan changes no file under `runtime/`.**
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives/control flow from `solid-js`.
- Run tests with `bun run test` (= `bun test ./tests`) or `bun test ./tests/<file>`. Never run bare `bun test`, which would discover through the runtime submodule.
- Conventional Commits; end commit messages with the session's attribution trailer.
- Keep build products and captures out of Git. `dist/` (including `dist/gallery/`) is ignored.
- **Class strings must be complete literals:** no template literals, no concatenation. A variant is a function returning one of several literals. Validate with `unknownUtilities` (Task 3 test).
- Only these utilities exist:
  - linear gradients `bg-gradient-to-{t,b,l,r}` with `from-/via-/to-` (3 stops);
  - uniform `border`/`border-[N]`/`border-[#hex]`, `rounded-[N]`, `opacity-N`;
  - `shadow`/`-md`/`-lg`, `text-{xs,sm,base,…}`;
  - arbitrary `[N]` spacing (negative allowed), `flex-*`, `items-*`, `justify-*`, `absolute`/`relative`, `overflow-hidden`.
- **`ml-auto` does not exist; use a `flex-1` spacer.** PocketJS boxes default to `flex-row`, so add `flex-col` explicitly where children stack.
- Type: **Inter** (bundled default) at 12/14/16 px only, single-line text.
- Icons: SVG with filled `<rect>/<circle>/<path>` only, power-of-two canvas, `viewBox` scaling allowed.
- The `Theme` interface exists so **theme switching (v2)** is a new object plus a setting. Do not build switching now.
- Parts are presentational: no player/library state, no gestures. Plan 3 wires data and input.

## Review Focus

- Titles longer than their column ("Harder, Better, Faster, Stronger (Extended Club Mix)") clip inside the 214 px title cell and never shift the time/artist column. Pinned in Task 5's album-state test (cell width 214, time cell x 242).
- Seek and progress fractions from a misbehaving host (position past duration, duration 0, NaN) keep the fill and knob on the track. Pinned in Task 5's `tests/geometry.test.ts`.
- An album with no letters (`""`, `"   "`) gets the ♪ hub, not blank initials. The same album always gets the same hue regardless of case or padding. Pinned in Task 2.
- Accented names in real libraries (Beyoncé, Sigur Rós, Starálfur, Hoppípolla) render instead of hollow boxes, and every character the app's source can show is in `app/fonts.json`. Pinned in Task 4, re-run by Task 5's gallery strings.
- The open search keyboard is modal and takes L/R. The gallery and its tests put the search state last, so it never blocks flipping. Pinned by the Task 5 test order and `GALLERY_STATES`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/build.ts` (modify) | `--manifest=<path>` selects the manifest; plan written to `dist/<output>.plan.json` |
| `scripts/sim.ts` (create) | `buildBundle(manifest)`, `bootBuilt(bundle, extraGlobals)`, `disposeBundles()`, `ROOT` |
| `tests/support/app-world.ts` (modify) | `bootApp`, `bootGallery`, `disposeGuest`, `screenText`, `pathTo`, `backgroundOf`, `textColorOf` |
| `app/theme/placeholder.ts` (create) | `placeholderArt(album, hueCount)` → `{ hue, initials }` |
| `app/theme/theme.ts` (create) | `Theme` interface and slot types |
| `app/theme/aqua.ts` (create) | `AQUA: Theme` |
| `app/theme/icons/*.svg` (create, 19 files) | baked transport/status/sort icons |
| `app/fonts.json` (create) | Inter coverage: ASCII, Latin-1 Supplement, Latin Extended-A, UI symbols |
| `app/theme/geometry.ts` (create) | `clampFraction`, `trackOffset` |
| `app/theme/parts/toolbar.tsx` (create) | `Lights`, `LcdStatus`, `SegmentedTabs`, `Toolbar`, `TABS` |
| `app/theme/parts/list.tsx` (create) | `ColumnHeader`, `ListRow`, `Scrollbar` |
| `app/theme/parts/strips.tsx` (create) | `SearchStrip`, `Breadcrumb`, `KeyBadge`, `FooterLegend`, `LegendItem` |
| `app/theme/parts/panels.tsx` (create) | `StatePanel`, `IdlePanel`, `PROGRESS_TRACK_PX` |
| `app/theme/parts/deck.tsx` (create) | `PlaceholderArt`, `ArtFrame`, `InfoLcd`, `SeekCapsule`, `TransportButton`, `TransportRow`, `SEEK_TRACK_PX` |
| `gallery.pocket.json` (create) | gallery manifest (entry `app/gallery.tsx`, output `ipo-ds-gallery`) |
| `app/gallery.tsx`, `app/gallery/names.ts`, `app/gallery/states.tsx` (create) | the storyboard bundle |
| `scripts/png.ts` (create) | `encodePng`, `scale` |
| `scripts/gallery.ts` (create) | writes `dist/gallery/<n>-<state>-{top,bottom}@2x.png` |
| `package.json` (modify), `README.md` (modify) | `gallery` script and how to run it |
| `tests/build.test.ts`, `tests/placeholder.test.ts`, `tests/theme.test.ts`, `tests/fonts.test.ts`, `tests/geometry.test.ts`, `tests/gallery.test.ts`, `tests/png.test.ts` (create) | tests |

---

### Task 1: Build any manifest; shared sim harness

**Files:**
- Modify: `scripts/build.ts` (whole file)
- Create: `scripts/sim.ts`
- Modify: `tests/support/app-world.ts` (whole file)
- Test: `tests/build.test.ts` (create)

**Interfaces:**
- Consumes: `resolve3dsBuildPlan`, `build3ds` (`runtime/tools/`), `bootBundle` (`runtime/hosts/sim/sim.ts`). `build3ds` already accepts `--manifest=` and checks that the plan matches it.
- Produces:
  - `scripts/build.ts --manifest=<path>`, with the path resolved against the cwd (default `pocket.json`). It writes `dist/<output>.plan.json` and copies to `dist/` only without `--package-outdir`.
  - `scripts/sim.ts`: `ROOT: string`, `buildBundle(manifest: string): BuiltBundle` (cached per manifest), `bootBuilt(bundle: BuiltBundle, extraGlobals?): Promise<BundleWorld>`, `disposeBundles(): void`.
  - `tests/support/app-world.ts`: `bootApp(extraGlobals?)`, `bootGallery()`, `disposeGuest()`, `screenText(world, surface?)`, `pathTo(world, surface, text): SimNode[]` (throws if absent), `backgroundOf(path): number`, `textColorOf(path): number`. Colours are `0xAABBGGRR`.

- [ ] **Step 1: Write the failing test**

`tests/build.test.ts`:
```ts
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

test("--manifest builds the bundle that manifest names and keeps it out of dist/", () => {
  const dir = mkdtempSync(join(tmpdir(), "ipo-ds-manifest-"));
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, "pocket.json"), "utf8"));
    manifest.app.output = "ipo-ds-probe";
    writeFileSync(join(dir, "probe.pocket.json"), JSON.stringify(manifest));
    const run = Bun.spawnSync(
      [process.execPath, "scripts/build.ts", "--pocket-only", `--manifest=${join(dir, "probe.pocket.json")}`, `--outdir=${join(dir, "guest")}`, `--package-outdir=${dir}`],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    expect(run.exitCode, `${run.stdout}${run.stderr}`).toBe(0);
    expect(existsSync(join(dir, "guest", "ipo-ds-probe.js"))).toBe(true);
    expect(existsSync(join(ROOT, "dist", "ipo-ds-probe.pocket"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/build.test.ts`
Expected: FAIL with a non-zero exit. The current script resolves `pocket.json` (output `ipo-ds-main`) while `build3ds` checks it against the probe manifest: "…has drifted from …probe.pocket.json…".

- [ ] **Step 3: Implement `scripts/build.ts`**

Replace `scripts/build.ts` with:
```ts
// Resolve a manifest (pocket.json, or --manifest=<path> such as the theme
// gallery's) against the runtime's 3DS profile, build through the runtime's
// 3DS pipeline, and copy the products from runtime/dist/3ds to dist/. Other
// arguments (--cia, --pocket-only, --capture, --outdir, --package-outdir,
// --font-*) pass through to build3ds.
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolve3dsBuildPlan } from "../runtime/tools/3ds-profile.ts";
import { build3ds } from "../runtime/tools/3ds.ts";
const root = resolve(import.meta.dir, "..");
const manifestArg = process.argv.find((a) => a.startsWith("--manifest="));
const manifest = resolve(manifestArg ? manifestArg.slice("--manifest=".length) : resolve(root, "pocket.json"));
const passthrough = process.argv.slice(2).filter((a) => !a.startsWith("--manifest="));
const plan = resolve3dsBuildPlan(await Bun.file(manifest).json());
mkdirSync(resolve(root, "dist"), { recursive: true });
const planPath = resolve(root, `dist/${plan.app.output}.plan.json`);
writeFileSync(planPath, JSON.stringify(plan, null, 2));
await build3ds([`--plan=${planPath}`, `--manifest=${manifest}`, `--project-root=${root}`, ...passthrough]);
// A caller that names its own package directory (the test harness) keeps the
// products there; copying runtime/dist/3ds would publish a stale build.
if (!passthrough.some((a) => a.startsWith("--package-outdir="))) {
  for (const ext of ["3dsx", "pocket", "cia"]) {
    const from = resolve(root, `runtime/dist/3ds/${plan.app.output}.${ext}`);
    if (existsSync(from)) copyFileSync(from, resolve(root, `dist/${plan.app.output}.${ext}`));
  }
}
```

- [ ] **Step 4: Create the shared sim builder and switch the harness to it**

`scripts/sim.ts`:
```ts
// Builds a ipo-ds bundle (--pocket-only: no Docker) once per process and boots
// it on the PocketJS sim's WASM core with the 3DS geometry. Shared by the test
// harness and scripts/gallery.ts.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bootBundle, type BundleWorld } from "../runtime/hosts/sim/sim.ts";

export const ROOT = resolve(import.meta.dir, "..");

export interface BuiltBundle {
  dir: string;
  js: string;
  pak: string;
}

const built = new Map<string, BuiltBundle>();

/** Build the bundle a manifest (path relative to the repo root) describes. */
export function buildBundle(manifest: string): BuiltBundle {
  const cached = built.get(manifest);
  if (cached) return cached;
  const output = (JSON.parse(readFileSync(resolve(ROOT, manifest), "utf8")) as { app: { output: string } }).app.output;
  const dir = mkdtempSync(join(tmpdir(), `${output}-`));
  const run = Bun.spawnSync(
    [process.execPath, "scripts/build.ts", "--pocket-only", `--manifest=${manifest}`, `--outdir=${join(dir, "guest")}`, `--package-outdir=${dir}`],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (run.exitCode !== 0) throw new Error(`${output} build failed\n${run.stdout}${run.stderr}`);
  const bundle = { dir, js: join(dir, "guest", `${output}.js`), pak: join(dir, "guest", `${output}.pak`) };
  built.set(manifest, bundle);
  return bundle;
}

export function disposeBundles(): void {
  for (const bundle of built.values()) rmSync(bundle.dir, { recursive: true, force: true });
  built.clear();
}

export function bootBuilt(bundle: BuiltBundle, extraGlobals?: Record<string, unknown>): Promise<BundleWorld> {
  return bootBundle({ js: bundle.js, pak: bundle.pak, extraGlobals, viewport: { width: 400, height: 240, auxiliary: [320, 240] } });
}
```

Replace `tests/support/app-world.ts` with:
```ts
// Boots the ipo-ds app or the theme gallery in the PocketJS sim (bundles are
// built once per test process by scripts/sim.ts) and reads what a screen shows.
import type { BundleWorld, SimNode } from "../../runtime/hosts/sim/sim.ts";
import { bootBuilt, buildBundle, disposeBundles } from "../../scripts/sim.ts";

export function bootApp(extraGlobals?: Record<string, unknown>): Promise<BundleWorld> {
  return bootBuilt(buildBundle("pocket.json"), extraGlobals);
}

export function bootGallery(): Promise<BundleWorld> {
  return bootBuilt(buildBundle("gallery.pocket.json"));
}

export function disposeGuest(): void {
  disposeBundles();
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

/** Every text on a surface, concatenated in tree order. */
export function screenText(world: BundleWorld, surface: "primary" | "auxiliary" = "primary"): string {
  return flat(world.tree(surface)).map((node) => node.text).join("");
}

/** Path from the surface root to the first node whose own text is exactly `text`. */
export function pathTo(world: BundleWorld, surface: "primary" | "auxiliary", text: string): SimNode[] {
  const walk = (node: SimNode, path: SimNode[]): SimNode[] | null => {
    const here = [...path, node];
    if (node.text === text) return here;
    for (const child of node.children) {
      const found = walk(child, here);
      if (found) return found;
    }
    return null;
  };
  const root = world.tree(surface);
  const path = root ? walk(root, []) : null;
  if (!path) throw new Error(`no node with text ${JSON.stringify(text)} on ${surface}`);
  return path;
}

/** Background of the nearest ancestor that paints one, as the core holds it (0xAABBGGRR). */
export function backgroundOf(path: readonly SimNode[]): number {
  for (let i = path.length - 1; i >= 0; i--) if (path[i]!.bgColor >>> 24 !== 0) return path[i]!.bgColor >>> 0;
  return 0;
}

/** Colour of the <Text> element holding a text run (the run's parent), 0xAABBGGRR. */
export function textColorOf(path: readonly SimNode[]): number {
  const element = path.length >= 2 && path[path.length - 2]!.type === "text" ? path[path.length - 2]! : path[path.length - 1]!;
  return element.textColor >>> 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test && bun run check`
Expected: 39 pass, 0 fail (38 existing + 1); no type errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/build.ts scripts/sim.ts tests/support/app-world.ts tests/build.test.ts
git commit -m "feat(build): build any manifest and share one sim builder"
```

---

### Task 2: Placeholder art hashing

**Files:**
- Create: `app/theme/placeholder.ts`
- Test: `tests/placeholder.test.ts` (create)

**Interfaces:**
- Consumes: `normalize(text)` from `app/library/normalize.ts` (Plan 1).
- Produces: `placeholderArt(album: string, hueCount: number): { hue: number; initials: string }`.
  - `hue` is in `[0, hueCount)`, using FNV-1a over `normalize(album)` with an fmix32 finalizer.
  - `initials` is the first code point upper-cased plus the second lower-cased, from the trimmed name; `"♪"` when empty.

- [ ] **Step 1: Write the failing test**

`tests/placeholder.test.ts`:
```ts
import { expect, test } from "bun:test";
import { placeholderArt } from "../app/theme/placeholder.ts";

test("an album always gets the same hue, however it is cased or padded", () => {
  expect(placeholderArt("Discovery", 6)).toEqual({ hue: 5, initials: "Di" });
  expect(placeholderArt("DISCOVERY", 6).hue).toBe(5);
  expect(placeholderArt("  Discovery", 6)).toEqual({ hue: 5, initials: "Di" });
});

test("six albums spread over at least four of the six hues", () => {
  const albums = ["Discovery", "Takk...", "Demon Days", "Is This It", "OK Computer", "Unknown Album"];
  expect(new Set(albums.map((album) => placeholderArt(album, 6).hue)).size).toBeGreaterThanOrEqual(4);
});

test("initials: first letter upper, second lower; one letter stays one; no letters shows ♪", () => {
  expect(placeholderArt("OK Computer", 6).initials).toBe("Ok");
  expect(placeholderArt("é", 6).initials).toBe("É");
  expect(placeholderArt("x", 6).initials).toBe("X");
  expect(placeholderArt("", 6).initials).toBe("♪");
  expect(placeholderArt("   ", 6).initials).toBe("♪");
});

test("the hue is an index into however many hues the theme has", () => {
  for (const count of [1, 2, 6, 7]) {
    const { hue } = placeholderArt("Takk...", count);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(count);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/placeholder.test.ts`
Expected: FAIL — `Cannot find module '../app/theme/placeholder.ts'`.

- [ ] **Step 3: Implement**

`app/theme/placeholder.ts`:
```ts
import { normalize } from "../library/normalize.ts";
export interface PlaceholderArt { hue: number; initials: string }
/** FNV-1a (32-bit) over the folded album name, finalized with fmix32, picks a hue; initials come from the name as written. */
export function placeholderArt(album: string, hueCount: number): PlaceholderArt {
  let hash = 0x811c9dc5;
  for (const ch of normalize(album)) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // fmix32 (MurmurHash3's finalizer) spreads FNV's low bits before the modulo.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  const letters = [...album.trim()];
  const initials = letters.length === 0 ? "♪" : letters[0]!.toUpperCase() + (letters[1] ?? "").toLowerCase();
  return { hue: (hash >>> 0) % hueCount, initials };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test ./tests/placeholder.test.ts && bun run check`
Expected: 4 pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/theme/placeholder.ts tests/placeholder.test.ts
git commit -m "feat(theme): stable placeholder hue and initials per album"
```

---

### Task 3: Theme interface, the AQUA theme and its icons

**Files:**
- Create: `app/theme/theme.ts`, `app/theme/aqua.ts`
- Create: `app/theme/icons/*.svg` (19 files, generated in Step 3)
- Test: `tests/theme.test.ts` (create)

**Interfaces:**
- Consumes: `unknownUtilities` (`runtime/framework/compiler/tailwind.ts`), `bakeSvg` (`runtime/framework/compiler/bake-svg.ts`), tests only.
- Produces:
  - Types: `RowKind = "odd" | "even" | "selected"`, `Tab = "Songs" | "Artists" | "Albums"`, `RepeatMode = "off" | "all" | "one"`, `TransportKind`, `IconName`, `IconInk = "white" | "ink" | "blue"`, `PlaceholderHue { name; cover; hubText }`, `Theme`.
  - `AQUA: Theme`. Its slot names are exactly those in `theme.ts` below, including the functions `light`, `tab`, `tabText`, `headerLeft`, `row`, `rowTitle`, `rowDetail`, `rowMuted`, `rowMarker`, `badge`, `badgeText`, `ring`, `transport`, `icon` and `iconLarge`.
  - Image keys are literal paths relative to `app/`, e.g. `theme/icons/shuffle-blue.svg`.

- [ ] **Step 1: Write the failing test**

`tests/theme.test.ts`:
```ts
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bakeSvg } from "../runtime/framework/compiler/bake-svg.ts";
import { unknownUtilities } from "../runtime/framework/compiler/tailwind.ts";
import { AQUA } from "../app/theme/aqua.ts";
import type { IconInk, IconName, RowKind, TransportKind } from "../app/theme/theme.ts";

const ROOT = new URL("..", import.meta.url).pathname;

/** Every class literal the theme can return, each variant included. */
function aquaLiterals(): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(AQUA)) {
    if (typeof value === "string" && key !== "name" && key !== "osk" && !value.endsWith(".svg")) out.push(value);
  }
  for (const flag of [true, false]) out.push(AQUA.tab(flag), AQUA.tabText(flag), AQUA.headerLeft(flag), AQUA.badge(flag), AQUA.badgeText(flag));
  for (const kind of ["odd", "even", "selected"] as RowKind[]) {
    out.push(AQUA.row(kind), AQUA.rowTitle(kind), AQUA.rowDetail(kind), AQUA.rowMuted(kind), AQUA.rowMarker(kind));
  }
  for (const color of ["red", "amber", "green"] as const) out.push(AQUA.light(color));
  out.push(AQUA.ring("outer"), AQUA.ring("inner"));
  for (const kind of ["shuffle", "prev", "play", "pause", "next", "repeat"] as TransportKind[]) {
    for (const on of [true, false]) for (const enabled of [true, false]) out.push(AQUA.transport(kind, on, enabled));
  }
  for (const hue of AQUA.placeholderHues) out.push(hue.cover, hue.hubText);
  return out;
}

test("every class literal the Aqua theme can produce compiles", () => {
  const unknown = aquaLiterals()
    .map((literal) => [literal, unknownUtilities(literal)] as const)
    .filter(([, bad]) => bad.length > 0);
  expect(unknown).toEqual([]);
});

test("every icon the theme names exists and bakes to an opaque image of its size", () => {
  const keys = new Set<string>([AQUA.sortIcon]);
  for (const name of ["shuffle", "repeat", "prev", "next", "play", "pause"] as IconName[]) {
    for (const ink of ["white", "ink", "blue"] as IconInk[]) keys.add(AQUA.icon(name, ink));
  }
  for (const name of ["play", "pause"] as const) for (const ink of ["white", "ink"] as const) keys.add(AQUA.iconLarge(name, ink));
  for (const key of keys) {
    const path = join(ROOT, "app", key);
    expect(existsSync(path), key).toBe(true);
    const image = bakeSvg(readFileSync(path, "utf8"), 1);
    const size = key.includes("-lg-") ? 32 : key.includes("sort-") ? 8 : 16;
    expect([image.width, image.height], key).toEqual([size, size]);
    let opaque = 0;
    for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i]! > 128) opaque++;
    expect(opaque, key).toBeGreaterThan(8);
  }
});

test("the theme carries the six placeholder hues and the classic keyboard", () => {
  expect(AQUA.placeholderHues.map((hue) => hue.name)).toEqual(["blue", "teal", "plum", "amber", "green", "graphite"]);
  expect(AQUA.osk).toBe("classic");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/theme.test.ts`
Expected: FAIL — `Cannot find module '../app/theme/aqua.ts'`.

- [ ] **Step 3: Generate the icons**

Save as a scratch script outside the repo (e.g. `$TMPDIR/make-icons.py`) and run it from the repo root with `python3 $TMPDIR/make-icons.py`:
```python
# Writes app/theme/icons/*.svg: filled shapes on a 16-unit grid (the baker
# draws filled <rect>/<circle>/<path> only), in white, ink (#2b2b2b) and blue.
import os
os.makedirs("app/theme/icons", exist_ok=True)
SHAPES = {
    "play": '<path d="M4 2L14 8L4 14Z" fill="{c}"/>',
    "pause": '<rect x="3" y="2" width="4" height="12" fill="{c}"/><rect x="9" y="2" width="4" height="12" fill="{c}"/>',
    "prev": '<rect x="2" y="3" width="2" height="10" fill="{c}"/><path d="M14 3L5 8L14 13Z" fill="{c}"/>',
    "next": '<rect x="12" y="3" width="2" height="10" fill="{c}"/><path d="M2 3L11 8L2 13Z" fill="{c}"/>',
    "shuffle": '<path d="M1 4H5L10 11H12V9L15 12L12 15V13H9L4 6H1Z" fill="{c}"/><path d="M1 10H4L5.6 8L6.8 9.6L5 12H1Z" fill="{c}"/><path d="M9.2 6.4L10 5H12V3L15 6L12 9V7H11Z" fill="{c}"/>',
    "repeat": '<path d="M2 9V6C2 4.9 2.9 4 4 4H11V2L14 5L11 8V6H4V9Z" fill="{c}"/><path d="M14 7V10C14 11.1 13.1 12 12 12H5V14L2 11L5 8V10H12V7Z" fill="{c}"/>',
}
INKS = {"white": "#ffffff", "ink": "#2b2b2b", "blue": "#1c6fd1"}

def write(name, size, body):
    with open(f"app/theme/icons/{name}.svg", "w") as f:
        f.write(f'<svg width="{size}" height="{size}" viewBox="0 0 16 16">{body}</svg>\n')

for shape, body in SHAPES.items():
    for ink, colour in INKS.items():
        if ink == "blue" and shape not in ("shuffle", "repeat"):
            continue
        write(f"{shape}-{ink}", 16, body.format(c=colour))
for shape in ("play", "pause"):
    for ink in ("white", "ink"):
        write(f"{shape}-lg-{ink}", 32, SHAPES[shape].format(c=INKS[ink]))
with open("app/theme/icons/sort-up-ink.svg", "w") as f:
    f.write('<svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 6L4 2L7 6Z" fill="#2b2b2b"/></svg>\n')
```

Expected: `ls app/theme/icons | wc -l` prints `19`.

- [ ] **Step 4: Write the Theme interface**

`app/theme/theme.ts`:
```ts
// The semantic slots every iPoDS theme fills. Slots are complete class
// literals (the build compiles only literal class strings); variants are
// functions that choose between literals. Parts read only from a Theme, so a
// second theme (v2 theme switching) is a new object, not a refactor.
export type RowKind = "odd" | "even" | "selected";
export type Tab = "Songs" | "Artists" | "Albums";
export type RepeatMode = "off" | "all" | "one";
export type TransportKind = "shuffle" | "prev" | "play" | "pause" | "next" | "repeat";
export type IconName = "shuffle" | "repeat" | "prev" | "next" | "play" | "pause";
export type IconInk = "white" | "ink" | "blue";

export interface PlaceholderHue {
  name: string;
  /** 92×92 gradient box that centres its children. */
  cover: string;
  /** Initials ink on the hub. */
  hubText: string;
}

export interface Theme {
  name: string;
  /** The framework Osk theme the search keyboard uses. */
  osk: "dark" | "light" | "classic";

  topScreen: string;
  bottomScreen: string;

  toolbar: string;
  toolbarRule: string;
  light(color: "red" | "amber" | "green"): string;
  lcdStatus: string;
  lcdTitle: string;
  lcdLine: string;
  tabs: string;
  tab(active: boolean): string;
  tabText(active: boolean): string;
  hint: string;

  header: string;
  headerRule: string;
  /** First column (242 wide, holds the sort marker when sorted). */
  headerLeft(sorted: boolean): string;
  headerRight: string;
  /** Image key of the sort marker shown in a sorted header column. */
  sortIcon: string;
  headerText: string;

  listBody: string;
  row(kind: RowKind): string;
  rowLead: string;
  rowTitleCell: string;
  rowDetailCell: string;
  rowCountCell: string;
  rowTitle(kind: RowKind): string;
  rowDetail(kind: RowKind): string;
  rowMuted(kind: RowKind): string;
  rowMarker(kind: RowKind): string;

  scrollTrack: string;
  scrollThumb: string;

  footer: string;
  footerRule: string;
  footerItem: string;
  footerText: string;
  badge(primary: boolean): string;
  badgeText(primary: boolean): string;

  strip: string;
  stripRule: string;
  searchField: string;
  searchLabel: string;
  searchQuery: string;
  searchCount: string;
  crumb: string;
  crumbRule: string;
  crumbLink: string;
  crumbText: string;
  crumbDetail: string;
  spacer: string;

  panel: string;
  panelTitle: string;
  panelText: string;
  progressTrack: string;
  progressFill: string;

  artFrame: string;
  ring(size: "outer" | "inner"): string;
  hub: string;
  infoLcd: string;
  infoTitle: string;
  infoArtist: string;
  infoAlbum: string;
  infoStatus: string;
  infoStatusText: string;
  infoFlagText: string;

  seekCapsule: string;
  seekTime: string;
  seekTimeRight: string;
  seekTrack: string;
  seekFill: string;
  seekKnob: string;

  transportRow: string;
  transport(kind: TransportKind, on: boolean, enabled: boolean): string;

  idlePanel: string;

  placeholderHues: readonly PlaceholderHue[];
  /** Image key (a literal .svg path the build bakes) for an icon in an ink. */
  icon(name: IconName, ink: IconInk): string;
  /** 32×32 play / pause for the 64 px transport button. */
  iconLarge(name: "play" | "pause", ink: "white" | "ink"): string;
}
```

- [ ] **Step 5: Write the AQUA theme**

`app/theme/aqua.ts`:
```ts
// iPoDS's Aqua / iTunes 4 theme: every slot is a complete class literal so the
// build can compile it; state variants pick between literals.
import type { IconInk, IconName, PlaceholderHue, Theme, TransportKind } from "./theme.ts";


const HUES: readonly PlaceholderHue[] = [
  { name: "blue", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#12204a] to-[#5aa7f0]", hubText: "text-xs font-bold text-[#12204a]" },
  { name: "teal", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#0f3b3a] to-[#5fc4b4]", hubText: "text-xs font-bold text-[#0f3b3a]" },
  { name: "plum", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#3a1640] to-[#c98ad8]", hubText: "text-xs font-bold text-[#3a1640]" },
  { name: "amber", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#4a2a08] to-[#f0b860]", hubText: "text-xs font-bold text-[#4a2a08]" },
  { name: "green", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#173a14] to-[#86cf72]", hubText: "text-xs font-bold text-[#173a14]" },
  { name: "graphite", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#2b2b2b] to-[#a8a8a8]", hubText: "text-xs font-bold text-[#2b2b2b]" },
];

const ICONS: Record<IconName, Record<IconInk, string>> = {
  shuffle: { white: "theme/icons/shuffle-white.svg", ink: "theme/icons/shuffle-ink.svg", blue: "theme/icons/shuffle-blue.svg" },
  repeat: { white: "theme/icons/repeat-white.svg", ink: "theme/icons/repeat-ink.svg", blue: "theme/icons/repeat-blue.svg" },
  prev: { white: "theme/icons/prev-white.svg", ink: "theme/icons/prev-ink.svg", blue: "theme/icons/prev-ink.svg" },
  next: { white: "theme/icons/next-white.svg", ink: "theme/icons/next-ink.svg", blue: "theme/icons/next-ink.svg" },
  play: { white: "theme/icons/play-white.svg", ink: "theme/icons/play-ink.svg", blue: "theme/icons/play-ink.svg" },
  pause: { white: "theme/icons/pause-white.svg", ink: "theme/icons/pause-ink.svg", blue: "theme/icons/pause-ink.svg" },
};

const LARGE_ICONS: Record<"play" | "pause", Record<"white" | "ink", string>> = {
  play: { white: "theme/icons/play-lg-white.svg", ink: "theme/icons/play-lg-ink.svg" },
  pause: { white: "theme/icons/pause-lg-white.svg", ink: "theme/icons/pause-lg-ink.svg" },
};

export const AQUA: Theme = {
  name: "aqua",
  osk: "classic",

  topScreen: "w-full h-full flex-col bg-[#c2c2c2] overflow-hidden",
  bottomScreen: "relative w-full h-full bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8] overflow-hidden",

  toolbar: "w-full h-[34] shrink-0 flex-row items-center px-[6] gap-[6] bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8]",
  toolbarRule: "w-full h-[1] shrink-0 bg-[#6e6e6e]",
  light: (color) =>
    color === "red" ? "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#ffb3a8] to-[#e0443a]"
    : color === "amber" ? "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#ffe2a1] to-[#e3a21a]"
    : "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#c9f0a8] to-[#4fa83a]",
  lcdStatus: "w-[160] h-[30] ml-[4] flex-col items-center justify-center rounded-[6] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  lcdTitle: "text-xs font-bold text-[#2b2b2b]",
  lcdLine: "text-xs text-[#4a4c3f]",
  tabs: "flex-row items-center ml-[6] gap-[2]",
  tab: (active) => active
    ? "h-[20] px-[8] items-center justify-center rounded-[4] bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]"
    : "h-[20] px-[8] items-center justify-center rounded-[4] bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]",
  tabText: (active) => (active ? "text-xs text-white" : "text-xs text-[#2b2b2b]"),
  hint: "text-xs text-[#4a4a4a]",

  header: "w-full h-[16] shrink-0 flex-row items-center bg-gradient-to-b from-[#ffffff] via-[#e7e7e7] to-[#d4d4d4]",
  headerRule: "w-full h-[1] shrink-0 bg-[#a5a5a5]",
  headerLeft: (sorted) => sorted
    ? "w-[242] h-[16] pl-[22] flex-row items-center gap-[4] bg-gradient-to-b from-[#d9ebff] via-[#a9cdf6] to-[#8fbbef]"
    : "w-[242] h-[16] pl-[22] flex-row items-center gap-[4]",
  headerRight: "flex-1 h-[16] flex-row items-center",
  sortIcon: "theme/icons/sort-up-ink.svg",
  headerText: "text-xs text-[#2b2b2b]",

  listBody: "w-full flex-1 flex-col relative bg-white overflow-hidden",
  row: (kind) =>
    kind === "selected" ? "w-full h-[21] flex-row items-center bg-[#3875d7]"
    : kind === "odd" ? "w-full h-[21] flex-row items-center bg-[#edf3fe]"
    : "w-full h-[21] flex-row items-center bg-white",
  rowLead: "w-[22] h-[21] items-center justify-center",
  rowTitleCell: "w-[214] h-[21] mr-[6] flex-col justify-center overflow-hidden",
  rowDetailCell: "flex-1 h-[21] flex-col justify-center overflow-hidden",
  rowCountCell: "w-[60] h-[21] pr-[22] flex-col items-end justify-center",
  rowTitle: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-black"),
  rowDetail: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-[#2b2b2b]"),
  rowMuted: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-[#6a6a6a]"),
  rowMarker: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-[#1c6fd1]"),

  scrollTrack: "absolute right-[0] top-[0] w-[14] h-full bg-gradient-to-r from-[#d4d4d4] via-[#f1f1f1] to-[#d4d4d4]",
  scrollThumb: "absolute left-[1] w-[11] rounded-[6] bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]",

  footer: "w-full h-[20] shrink-0 flex-row items-center px-[8] gap-[12] bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8]",
  footerRule: "w-full h-[1] shrink-0 bg-[#6e6e6e]",
  footerItem: "flex-row items-center gap-[4]",
  footerText: "text-xs text-[#2b2b2b]",
  badge: (primary) => primary
    ? "w-[14] h-[14] rounded-[7] items-center justify-center bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]"
    : "w-[14] h-[14] rounded-[7] items-center justify-center bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]",
  badgeText: (primary) => (primary ? "text-xs font-bold text-white" : "text-xs font-bold text-[#2b2b2b]"),

  strip: "w-full h-[20] shrink-0 flex-row items-center px-[6] gap-[6] bg-gradient-to-b from-[#d6d6d6] to-[#c2c2c2]",
  stripRule: "w-full h-[1] shrink-0 bg-[#8a8a8a]",
  searchField: "flex-1 h-[16] flex-row items-center px-[8] gap-[4] rounded-[8] border border-[#7d7d7d] bg-white",
  searchLabel: "text-xs text-[#6a6a6a]",
  searchQuery: "text-xs text-black",
  searchCount: "text-xs text-[#2b2b2b]",
  crumb: "w-full h-[20] shrink-0 flex-row items-center px-[8] gap-[6] bg-gradient-to-b from-[#e9ecd5] to-[#d9ddc0]",
  crumbRule: "w-full h-[1] shrink-0 bg-[#8a8c78]",
  crumbLink: "text-xs text-[#1c6fd1]",
  crumbText: "text-xs text-[#2b2b2b]",
  crumbDetail: "text-xs text-[#2b2b2b]",
  spacer: "flex-1",

  panel: "w-full flex-1 flex-col items-center justify-center gap-[4] bg-white",
  panelTitle: "text-sm font-bold text-[#2b2b2b]",
  panelText: "text-xs text-[#4a4a4a]",
  progressTrack: "w-[220] h-[12] mt-[6] rounded-[6] border border-[#1a4f99] bg-white overflow-hidden",
  progressFill: "h-[10] bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1]",

  artFrame: "absolute left-[10] top-[10] w-[100] h-[100] p-[3] border border-[#7d7d7d] bg-white",
  ring: (size) => (size === "outer"
    ? "absolute left-[8] top-[8] w-[76] h-[76] rounded-[38] border-[2] border-[#f4f6e6] opacity-85"
    : "absolute left-[22] top-[22] w-[48] h-[48] rounded-[24] border-[2] border-[#f4f6e6] opacity-85"),
  hub: "w-[32] h-[32] rounded-[16] items-center justify-center bg-[#f4f6e6]",
  infoLcd: "absolute left-[118] top-[10] w-[192] h-[100] flex-col items-center px-[8] pt-[6] rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  infoTitle: "text-base font-bold text-[#1f2018]",
  infoArtist: "text-xs text-[#3c3e31] mt-[3]",
  infoAlbum: "text-xs text-[#6a6c5a] mt-[1]",
  infoStatus: "flex-row items-center gap-[6] mt-[8]",
  infoStatusText: "text-xs text-[#3c3e31]",
  infoFlagText: "text-xs font-bold text-[#1c6fd1]",

  seekCapsule: "absolute left-[10] top-[120] w-[300] h-[30] flex-row items-center px-[8] gap-[8] rounded-[15] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  seekTime: "w-[34] text-xs font-bold text-[#1f2018]",
  seekTimeRight: "w-[34] text-xs font-bold text-[#1f2018] text-right",
  seekTrack: "w-[200] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
  seekFill: "absolute left-[0] top-[0] h-[6] rounded-[3] bg-[#4a4c3f]",
  seekKnob: "absolute top-[-6] w-[18] h-[18] rounded-[9] bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]",

  transportRow: "absolute left-[10] top-[160] w-[300] h-[72] flex-row items-center justify-center gap-[10]",
  transport: (kind, on, enabled) => transportClass(kind, on, enabled),

  idlePanel: "absolute left-[10] top-[10] w-[300] h-[100] flex-col items-center justify-center gap-[4] rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",

  placeholderHues: HUES,
  icon: (name, ink) => ICONS[name][ink],
  iconLarge: (name, ink) => LARGE_ICONS[name][ink],
};

function transportClass(kind: TransportKind, on: boolean, enabled: boolean): string {
  const big = kind === "play" || kind === "pause";
  const small = kind === "shuffle" || kind === "repeat";
  const aqua = big || (small && on);
  if (!enabled) {
    return big ? "w-[64] h-[64] rounded-[32] items-center justify-center opacity-45 bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]"
      : small ? "w-[34] h-[34] rounded-[17] items-center justify-center opacity-45 bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]"
      : "w-[42] h-[42] rounded-[21] items-center justify-center opacity-45 bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]";
  }
  if (big) return "w-[64] h-[64] rounded-[32] items-center justify-center bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]";
  if (small) return aqua
    ? "w-[34] h-[34] rounded-[17] items-center justify-center bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]"
    : "w-[34] h-[34] rounded-[17] items-center justify-center bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]";
  return "w-[42] h-[42] rounded-[21] items-center justify-center bg-gradient-to-b from-[#ffffff] via-[#e2e2e2] to-[#c4c4c4] border border-[#7d7d7d]";
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test ./tests/theme.test.ts && bun run check`
Expected: 3 pass; no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/theme/theme.ts app/theme/aqua.ts app/theme/icons tests/theme.test.ts
git commit -m "feat(theme): Aqua theme slots and baked transport icons"
```

---

### Task 4: Font coverage

**Files:**
- Create: `app/fonts.json`
- Test: `tests/fonts.test.ts` (create)

**Interfaces:**
- Consumes: the build reads `fonts.json` beside the entry (`app/`) for both `app/main.tsx` and `app/gallery.tsx`.
- Produces: baked coverage for U+0020–007E, U+00A0–017F and `♪›…↻▶⌫ⒶⒷⓍⓎ—·`.

- [ ] **Step 1: Write the failing test**

`tests/fonts.test.ts`:
```ts
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("every character the app's source can show is baked by app/fonts.json", () => {
  const fonts = JSON.parse(readFileSync(join(ROOT, "app/fonts.json"), "utf8")) as { ranges: string[]; characters: string };
  const ranges = fonts.ranges.map((range) => range.replace(/U\+/g, "").split("-").map((hex) => parseInt(hex, 16)) as [number, number]);
  const declared = new Set([...fonts.characters].map((ch) => ch.codePointAt(0)!));
  const baked = (cp: number) => declared.has(cp) || ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
  const missing = new Set<string>();
  for (const file of sources(join(ROOT, "app"))) {
    // Comments are not shown; strip them (keeping "://" in URLs) before scanning.
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const ch of code) if (ch.codePointAt(0)! > 0x7e && !baked(ch.codePointAt(0)!)) missing.add(ch);
  }
  expect([...missing]).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/fonts.test.ts`
Expected: FAIL — `ENOENT … app/fonts.json`.

- [ ] **Step 3: Declare the coverage**

`app/fonts.json`:
```json
{
  "ranges": ["U+0020-007E", "U+00A0-017F"],
  "characters": "♪›…↻▶⌫ⒶⒷⓍⓎ—·"
}
```

- [ ] **Step 4: Run tests and the build**

Run: `bun test ./tests/fonts.test.ts && bun run 3ds --pocket-only`
Expected: 1 pass. The build prints `output: …ipo-ds-main.pocket (…, 3ds-dev abi 11)`, larger than before (about 0.27 MB to about 0.67 MB) because of the added Latin coverage.

- [ ] **Step 5: Commit**

```bash
git add app/fonts.json tests/fonts.test.ts
git commit -m "feat(theme): bake Latin-1, Latin Extended-A and UI symbols"
```

---

### Task 5: Parts kit and the gallery storyboard

**Files:**
- Create: `app/theme/geometry.ts`
- Create: `app/theme/parts/toolbar.tsx`, `app/theme/parts/list.tsx`, `app/theme/parts/strips.tsx`, `app/theme/parts/panels.tsx`, `app/theme/parts/deck.tsx`
- Create: `gallery.pocket.json`, `app/gallery/names.ts`, `app/gallery/states.tsx`, `app/gallery.tsx`
- Test: `tests/geometry.test.ts`, `tests/gallery.test.ts` (create)

**Interfaces:**
- Consumes: `AQUA`, `Theme` and types (Task 3); `placeholderArt` (Task 2); `bootGallery`, `pathTo`, `backgroundOf`, `textColorOf`, `screenText` (Task 1). From the framework: `View`/`Text`/`Image`/`AuxiliarySurface` (`components`), `createOsk`/`Osk` (`osk`), `onButtonPress` (`lifecycle`), `BTN` (`input`), `mount` (`solid`).
- Produces (Plan 3 consumes these exact names and props):
  - `geometry.ts`:
    - `clampFraction(value): number`
    - `trackOffset(fraction, inner): number`
  - `toolbar.tsx`:
    - `Toolbar { title; line; active: Tab; theme? }`
    - `Lights`, `LcdStatus { title; line }`, `SegmentedTabs { active }`, `TABS`
  - `list.tsx`:
    - `ColumnHeader { left; right; sorted?=true }`
    - `ListRow { kind: RowKind; title; detail; lead?; playing?; count?; onPress? }`
    - `Scrollbar { thumbTop; thumbHeight }` (inside a `listBody`)
  - `strips.tsx`:
    - `SearchStrip { query; count: number }`
    - `Breadcrumb { root; leaf; detail }`
    - `KeyBadge { letter; primary? }`
    - `FooterLegend { items: LegendItem[] }`, where `LegendItem { key; label; primary? }`
  - `panels.tsx`:
    - `StatePanel { title; lines: string[]; progress? }`
    - `IdlePanel`
    - `PROGRESS_TRACK_PX = 218`
  - `deck.tsx`:
    - `ArtFrame { album; children? }`, where children are the embedded cover and omitting them shows the placeholder
    - `PlaceholderArt { album }`
    - `InfoLcd { title; artist; album; position; shuffle; repeat: RepeatMode }`
    - `SeekCapsule { elapsed; remaining; fraction; enabled }`
    - `TransportButton { kind; on?; enabled?; onPress? }`
    - `TransportRow { playing; shuffle; repeat; enabled; onShuffle?; onPrev?; onToggle?; onNext?; onRepeat? }`
    - `SEEK_TRACK_PX = 198`
  - Every part also takes an optional `theme?: Theme`, defaulting to `AQUA`.
  - `GALLERY_STATES = ["main", "artists", "album", "scanning", "empty", "search"]`. `gallery.pocket.json` builds output `ipo-ds-gallery`; R and L step forward and back through the states.

- [ ] **Step 1: Write the failing tests**

`tests/geometry.test.ts`:
```ts
import { expect, test } from "bun:test";
import { clampFraction, trackOffset } from "../app/theme/geometry.ts";

test("fractions outside 0..1, and NaN, stay on the track", () => {
  expect([clampFraction(-0.5), clampFraction(0.25), clampFraction(1.7), clampFraction(NaN), clampFraction(Infinity)]).toEqual([0, 0.25, 1, 0, 0]);
});

test("track offsets round to whole pixels within the inner width", () => {
  expect([trackOffset(0.3, 198), trackOffset(2, 198), trackOffset(-1, 198), trackOffset(NaN, 218)]).toEqual([59, 198, 0, 0]);
});
```

`tests/gallery.test.ts`:
```ts
import { afterAll, beforeAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld } from "../runtime/hosts/sim/sim.ts";
import { GALLERY_STATES, type GalleryStateName } from "../app/gallery/names.ts";
import { backgroundOf, bootGallery, disposeGuest, pathTo, screenText, textColorOf } from "./support/app-world.ts";

// Colours as the core holds them: 0xAABBGGRR.
const SELECTED_ROW = 0xffd77538; // #3875d7
const ODD_ROW = 0xfffef3ed; // #edf3fe
const WHITE = 0xffffffff;

let world: BundleWorld;
let current = 0;

beforeAll(async () => {
  world = await bootGallery();
  for (let frame = 0; frame < 6; frame++) world.step();
}, 180_000);
afterAll(disposeGuest);

/** R advances one state; the tests visit states in GALLERY_STATES order (search, with its modal keyboard, last). */
function show(name: GalleryStateName): void {
  const target = GALLERY_STATES.indexOf(name);
  while (current !== target) {
    world.step({ buttons: BTN.RTRIGGER });
    for (let frame = 0; frame < 3; frame++) world.step();
    current = (current + 1) % GALLERY_STATES.length;
  }
  expect(world.failure).toBeNull();
}

function expectAll(text: string, parts: readonly string[]): void {
  for (const part of parts) expect(text).toContain(part);
}

test("main: songs with a selected and a playing row; Now Playing with embedded art", () => {
  show("main");
  expectAll(screenText(world, "primary"), ["iPoDS", "142 songs · 9.6 hrs", "Song Name", "Artist", "Digital Love", "Starálfur", "♪", "Now Playing"]);
  const selected = pathTo(world, "primary", "Digital Love");
  expect(backgroundOf(selected)).toBe(SELECTED_ROW);
  expect(textColorOf(selected)).toBe(WHITE);
  expect(backgroundOf(pathTo(world, "primary", "Aerodynamic"))).toBe(ODD_ROW);
  expectAll(screenText(world, "auxiliary"), ["One More Time", "Daft Punk", "3 of 12", "1:42", "-3:58", "DISCOVERY"]);
});

test("artists: names with right-hand counts, Queen selected; idle Now Playing", () => {
  show("artists");
  expectAll(screenText(world, "primary"), ["Beyoncé", "Queen", "Unknown Artist", "Open"]);
  expect(backgroundOf(pathTo(world, "primary", "Queen"))).toBe(SELECTED_ROW);
  expect(textColorOf(pathTo(world, "primary", "14"))).toBe(WHITE);
  expectAll(screenText(world, "auxiliary"), ["Nothing playing", "Pick a song above and press Ⓐ", "--:--"]);
});

test("album drill-down: breadcrumb and numbered rows; Now Playing with placeholder art", () => {
  show("album");
  expectAll(screenText(world, "primary"), ["Albums", "›", "Discovery", "Daft Punk · 14 songs", "5:20"]);
  expect(backgroundOf(pathTo(world, "primary", "Aerodynamic"))).toBe(SELECTED_ROW);
  // A title longer than its column is clipped by its 214 px cell (6 px gutter); the time column stays put.
  const long = pathTo(world, "primary", "Harder, Better, Faster, Stronger (Extended Club Mix)");
  expect(long[long.length - 3]!.rect![2]).toBe(214);
  const time = pathTo(world, "primary", "3:44");
  expect(time[time.length - 3]!.rect![0]).toBe(242);
  expectAll(screenText(world, "auxiliary"), ["Aerodynamic", "2 of 14", "0:12"]);
  expect(pathTo(world, "auxiliary", "Di").length).toBeGreaterThan(0);
});

test("scanning: LCD and panel report progress; idle Now Playing", () => {
  show("scanning");
  expectAll(screenText(world, "primary"), ["Scanning…", "Scanning your music…", "sdmc:/music/ · 87 of 142 files", "Now Playing"]);
  expect(screenText(world, "auxiliary")).toContain("Nothing playing");
});

test("empty library: guidance and a single Scan again hint", () => {
  show("empty");
  expectAll(screenText(world, "primary"), ["0 songs", "No music found", "then press Ⓧ to scan again.", "Scan again"]);
  expect(screenText(world, "auxiliary")).toContain("Nothing playing");
});

test("search: query strip with results; the classic keyboard on the bottom screen", () => {
  show("search");
  expectAll(screenText(world, "primary"), ["Search:", "daft", "4 found", "Edit search", "Clear"]);
  expect(backgroundOf(pathTo(world, "primary", "Digital Love"))).toBe(SELECTED_ROW);
  expect(screenText(world, "auxiliary")).toContain("START confirm");
  expect(pathTo(world, "auxiliary", "q").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test ./tests/geometry.test.ts ./tests/gallery.test.ts`
Expected: FAIL — `Cannot find module '../app/theme/geometry.ts'` and `Cannot find module '../app/gallery/names.ts'`.

- [ ] **Step 3: Geometry**

`app/theme/geometry.ts`:
```ts
// Pixel geometry shared by the deck and panels. Clamping keeps a host's odd
// values (position past duration, duration 0, NaN) inside the track.
export function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Fill width / knob offset in px for `fraction` of a track whose inner width is `inner` px. */
export function trackOffset(fraction: number, inner: number): number {
  return Math.round(inner * clampFraction(fraction));
}
```

- [ ] **Step 4: Top-screen parts**

`app/theme/parts/toolbar.tsx`:
```tsx
// The top screen's toolbar: window lights, the iTunes status LCD and the
// Songs / Artists / Albums segmented tabs with their L / R hints.
import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { Tab, Theme } from "../theme.ts";

export const TABS: readonly Tab[] = ["Songs", "Artists", "Albums"];

export function Lights(props: { theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class="flex-row items-center gap-[4]">
      <View class={t().light("red")} />
      <View class={t().light("amber")} />
      <View class={t().light("green")} />
    </View>
  );
}

export function LcdStatus(props: { title: string; line: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().lcdStatus}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Text class={t().lcdLine}>{props.line}</Text>
    </View>
  );
}

export function SegmentedTabs(props: { active: Tab; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().tabs}>
      <Text class={t().hint}>L</Text>
      <For each={TABS}>
        {(tab) => (
          <View class={t().tab(tab === props.active)}>
            <Text class={t().tabText(tab === props.active)}>{tab}</Text>
          </View>
        )}
      </For>
      <Text class={t().hint}>R</Text>
    </View>
  );
}

export function Toolbar(props: { title: string; line: string; active: Tab; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().toolbar}>
        <Lights theme={props.theme} />
        <LcdStatus title={props.title} line={props.line} theme={props.theme} />
        <SegmentedTabs active={props.active} theme={props.theme} />
      </View>
      <View class={t().toolbarRule} />
    </>
  );
}
```

`app/theme/parts/list.tsx`:
```tsx
// Column header, list rows and the scrollbar for the top screen's lists.
import { Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { RowKind, Theme } from "../theme.ts";

export function ColumnHeader(props: { left: string; right: string; sorted?: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().header}>
        <View class={t().headerLeft(props.sorted ?? true)}>
          <Text class={t().headerText}>{props.left}</Text>
          <Show when={props.sorted ?? true}>
            <Image class="w-[8] h-[8]" src={t().sortIcon} />
          </Show>
        </View>
        <View class={t().headerRight}>
          <Text class={t().headerText}>{props.right}</Text>
        </View>
      </View>
      <View class={t().headerRule} />
    </>
  );
}

export interface ListRowProps {
  kind: RowKind;
  title: string;
  /** Artist, time or (with `count`) a number shown right-aligned. */
  detail: string;
  /** Track number or other lead text; the ♪ marker replaces it while playing. */
  lead?: string;
  playing?: boolean;
  /** Title spans the row and `detail` is a right-aligned count (Artists / Albums views). */
  count?: boolean;
  onPress?: () => void;
  theme?: Theme;
}

export function ListRow(props: ListRowProps) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().row(props.kind)} onPress={props.onPress}>
      <View class={t().rowLead}>
        <Text class={props.playing ? t().rowMarker(props.kind) : t().rowMuted(props.kind)}>{props.playing ? "♪" : props.lead ?? ""}</Text>
      </View>
      <Show
        when={props.count}
        fallback={
          <>
            <View class={t().rowTitleCell}>
              <Text class={t().rowTitle(props.kind)}>{props.title}</Text>
            </View>
            <View class={t().rowDetailCell}>
              <Text class={t().rowDetail(props.kind)}>{props.detail}</Text>
            </View>
          </>
        }
      >
        <View class={t().rowDetailCell}>
          <Text class={t().rowTitle(props.kind)}>{props.title}</Text>
        </View>
        <View class={t().rowCountCell}>
          <Text class={t().rowMuted(props.kind)}>{props.detail}</Text>
        </View>
      </Show>
    </View>
  );
}

/** Overlay for a `listBody` (which is `relative`): the track spans the body; the thumb is placed in px. */
export function Scrollbar(props: { thumbTop: number; thumbHeight: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().scrollTrack}>
      <View class={t().scrollThumb} style={{ insetT: props.thumbTop, height: props.thumbHeight }} />
    </View>
  );
}
```

`app/theme/parts/strips.tsx`:
```tsx
// Bars that sit between the toolbar and the list (search, breadcrumb) and the
// footer legend of button hints.
import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { Theme } from "../theme.ts";

export function SearchStrip(props: { query: string; count: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().strip}>
        <View class={t().searchField}>
          <Text class={t().searchLabel}>Search:</Text>
          <Text class={t().searchQuery}>{props.query}</Text>
        </View>
        <Text class={t().searchCount}>{`${props.count} found`}</Text>
      </View>
      <View class={t().stripRule} />
    </>
  );
}

export function Breadcrumb(props: { root: string; leaf: string; detail: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().crumb}>
        <Text class={t().crumbLink}>{props.root}</Text>
        <Text class={t().crumbText}>›</Text>
        <Text class={t().crumbText}>{props.leaf}</Text>
        <View class={t().spacer} />
        <Text class={t().crumbDetail}>{props.detail}</Text>
      </View>
      <View class={t().crumbRule} />
    </>
  );
}

export function KeyBadge(props: { letter: string; primary?: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().badge(props.primary ?? false)}>
      <Text class={t().badgeText(props.primary ?? false)}>{props.letter}</Text>
    </View>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  primary?: boolean;
}

export function FooterLegend(props: { items: readonly LegendItem[]; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().footerRule} />
      <View class={t().footer}>
        <For each={props.items}>
          {(item) => (
            <View class={t().footerItem}>
              <KeyBadge letter={item.key} primary={item.primary} theme={props.theme} />
              <Text class={t().footerText}>{item.label}</Text>
            </View>
          )}
        </For>
      </View>
    </>
  );
}
```

`app/theme/parts/panels.tsx`:
```tsx
// Whole-area messages: the top screen's scanning / empty panel and the bottom
// screen's idle LCD.
import { For, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import { trackOffset } from "../geometry.ts";
import type { Theme } from "../theme.ts";

/** Inner width of the progress track (220 wide with a 1 px border). */
export const PROGRESS_TRACK_PX = 218;

/** Fills the list area. `progress` (0..1) adds the aqua progress bar. */
export function StatePanel(props: { title: string; lines: readonly string[]; progress?: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().panel}>
      <Text class={t().panelTitle}>{props.title}</Text>
      <For each={props.lines}>{(line) => <Text class={t().panelText}>{line}</Text>}</For>
      <Show when={props.progress !== undefined}>
        <View class={t().progressTrack}>
          <View class={t().progressFill} style={{ width: trackOffset(props.progress ?? 0, PROGRESS_TRACK_PX) }} />
        </View>
      </Show>
    </View>
  );
}

export function IdlePanel(props: { theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().idlePanel}>
      <Text class={t().panelTitle}>Nothing playing</Text>
      <Text class={t().panelText}>Pick a song above and press Ⓐ</Text>
    </View>
  );
}
```

- [ ] **Step 5: Bottom-screen parts**

`app/theme/parts/deck.tsx`:
```tsx
// The bottom screen's Now Playing deck: art frame, info LCD, seek capsule and
// transport buttons. Presentational only: Plan 3 wires the seek gesture and
// the handlers.
import { Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import type { JSX as SolidJSX } from "solid-js";
import { AQUA } from "../aqua.ts";
import { trackOffset } from "../geometry.ts";
import { placeholderArt } from "../placeholder.ts";
import type { RepeatMode, Theme, TransportKind } from "../theme.ts";

export function PlaceholderArt(props: { album: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const art = () => placeholderArt(props.album, t().placeholderHues.length);
  const hue = () => t().placeholderHues[art().hue]!;
  return (
    <View class={hue().cover}>
      <View class={t().ring("outer")} />
      <View class={t().ring("inner")} />
      <View class={t().hub}>
        <Text class={hue().hubText}>{art().initials}</Text>
      </View>
    </View>
  );
}

/** 100×100 white-matted frame. Children are the embedded cover; without them the placeholder for `album` shows. */
export function ArtFrame(props: { album: string; children?: SolidJSX.Element; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().artFrame}>
      <Show when={props.children} fallback={<PlaceholderArt album={props.album} theme={props.theme} />}>
        {props.children}
      </Show>
    </View>
  );
}

export function InfoLcd(props: {
  title: string;
  artist: string;
  album: string;
  position: string;
  shuffle: boolean;
  repeat: RepeatMode;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().infoLcd}>
      <Text class={t().infoTitle}>{props.title}</Text>
      <Text class={t().infoArtist}>{props.artist}</Text>
      <Text class={t().infoAlbum}>{props.album}</Text>
      <View class={t().infoStatus}>
        <Text class={t().infoStatusText}>{props.position}</Text>
        <Show when={props.shuffle}>
          <Image class="w-[16] h-[16]" src={t().icon("shuffle", "blue")} />
        </Show>
        <Show when={props.repeat !== "off"}>
          <Image class="w-[16] h-[16]" src={t().icon("repeat", "blue")} />
        </Show>
        <Show when={props.repeat === "one"}>
          <Text class={t().infoFlagText}>1</Text>
        </Show>
      </View>
    </View>
  );
}

/** Inner width of the seek track (200 wide with a 1 px border). */
export const SEEK_TRACK_PX = 198;

export function SeekCapsule(props: { elapsed: string; remaining: string; fraction: number; enabled: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const x = () => trackOffset(props.fraction, SEEK_TRACK_PX);
  return (
    <View class={t().seekCapsule}>
      <Text class={t().seekTime}>{props.elapsed}</Text>
      <View class={t().seekTrack}>
        <Show when={props.enabled}>
          <View class={t().seekFill} style={{ width: x() }} />
          <View class={t().seekKnob} style={{ insetL: x() - 9 }} />
        </Show>
      </View>
      <Text class={t().seekTimeRight}>{props.remaining}</Text>
    </View>
  );
}

export function TransportButton(props: { kind: TransportKind; on?: boolean; enabled?: boolean; onPress?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const enabled = () => props.enabled ?? true;
  const big = () => props.kind === "play" || props.kind === "pause";
  // Aqua gels carry white ink: play/pause, and shuffle/repeat while on. Graphite carries dark ink.
  const ink = () => (enabled() && (big() || ((props.kind === "shuffle" || props.kind === "repeat") && props.on)) ? "white" : "ink");
  return (
    <View class={t().transport(props.kind, props.on ?? false, enabled())} onPress={enabled() ? props.onPress : undefined}>
      <Show
        when={big()}
        fallback={<Image class="w-[16] h-[16]" src={t().icon(props.kind as "shuffle" | "repeat" | "prev" | "next", ink())} />}
      >
        <Image class="w-[32] h-[32]" src={t().iconLarge(props.kind as "play" | "pause", ink() === "white" ? "white" : "ink")} />
      </Show>
    </View>
  );
}

export function TransportRow(props: {
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  enabled: boolean;
  onShuffle?: () => void;
  onPrev?: () => void;
  onToggle?: () => void;
  onNext?: () => void;
  onRepeat?: () => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().transportRow}>
      <TransportButton kind="shuffle" on={props.shuffle} enabled={props.enabled} onPress={props.onShuffle} theme={props.theme} />
      <TransportButton kind="prev" enabled={props.enabled} onPress={props.onPrev} theme={props.theme} />
      <TransportButton kind={props.playing ? "pause" : "play"} enabled={props.enabled} onPress={props.onToggle} theme={props.theme} />
      <TransportButton kind="next" enabled={props.enabled} onPress={props.onNext} theme={props.theme} />
      <TransportButton kind="repeat" on={props.repeat !== "off"} enabled={props.enabled} onPress={props.onRepeat} theme={props.theme} />
    </View>
  );
}
```

- [ ] **Step 6: The gallery bundle**

`gallery.pocket.json` (the app's manifest with its own id, name, entry and output):
```json
{
  "$schema": "https://pocketjs.dev/schema/pocket-2.json",
  "pocket": 2,
  "id": "io.github.dvalinotti.ipods.gallery",
  "name": "ipo-ds-gallery",
  "title": "iPoDS Gallery",
  "version": "0.1.0",
  "engine": {
    "capabilities": {
      "requires": [
        "text.glyphs.baked",
        "input.buttons",
        "display.auxiliary",
        "input.touch.auxiliary"
      ],
      "enhances": [
        "input.analog.left",
        "media.local"
      ]
    }
  },
  "app": {
    "entry": "app/gallery.tsx",
    "output": "ipo-ds-gallery",
    "framework": "solid",
    "viewport": {
      "fixed": {
        "logical": [
          400,
          240
        ],
        "presentation": "native"
      }
    },
    "surfaces": {
      "auxiliary": {
        "fixed": {
          "logical": [
            320,
            240
          ],
          "presentation": "native"
        }
      }
    }
  }
}
```

`app/gallery/names.ts`:
```ts
/** Gallery states in cycle order; app/gallery/states.tsx builds one per name. */
export const GALLERY_STATES = ["main", "artists", "album", "scanning", "empty", "search"] as const;
export type GalleryStateName = (typeof GALLERY_STATES)[number];
```

`app/gallery/states.tsx`:
```tsx
// The six approved Aqua mockup states (docs/design/aqua), rebuilt from the
// theme parts with fixture data. Gallery-only: Plan 3 composes the real screens.
import { createSignal, For, onMount } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { createOsk, Osk } from "@pocketjs/framework/osk";
import type { JSX as SolidJSX } from "solid-js";
import { AQUA } from "../theme/aqua.ts";
import { ArtFrame, InfoLcd, SeekCapsule, TransportRow } from "../theme/parts/deck.tsx";
import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
import { IdlePanel, StatePanel } from "../theme/parts/panels.tsx";
import { Breadcrumb, FooterLegend, SearchStrip, type LegendItem } from "../theme/parts/strips.tsx";
import { Toolbar } from "../theme/parts/toolbar.tsx";
import type { RowKind, Tab } from "../theme/theme.ts";
import type { GalleryStateName } from "./names.ts";

export interface GalleryState {
  name: GalleryStateName;
  top: () => SolidJSX.Element;
  bottom: () => SolidJSX.Element;
}

type Row = [title: string, detail: string, lead?: string];
const LIBRARY_LINE = "142 songs · 9.6 hrs";
const SONGS_LEGEND: LegendItem[] = [
  { key: "A", label: "Play", primary: true },
  { key: "X", label: "Search" },
  { key: "B", label: "Back" },
  { key: "Y", label: "Now Playing" },
];

function kindAt(i: number, selected: number): RowKind {
  return i === selected ? "selected" : i % 2 === 0 ? "odd" : "even";
}

function Top(props: {
  tab: Tab;
  line?: string;
  strip?: SolidJSX.Element;
  header?: [string, string];
  rows?: readonly Row[];
  selected?: number;
  playing?: number;
  count?: boolean;
  scroll?: [number, number];
  body?: SolidJSX.Element;
  legend: readonly LegendItem[];
}) {
  return (
    <View class={AQUA.topScreen}>
      <Toolbar title="iPoDS" line={props.line ?? LIBRARY_LINE} active={props.tab} />
      {props.strip}
      {props.header ? <ColumnHeader left={props.header[0]} right={props.header[1]} /> : null}
      {props.body ?? (
        <View class={AQUA.listBody}>
          <For each={props.rows ?? []}>
            {(row, i) => (
              <ListRow
                kind={kindAt(i(), props.selected ?? -1)}
                title={row[0]}
                detail={row[1]}
                lead={row[2]}
                playing={i() === props.playing}
                count={props.count}
              />
            )}
          </For>
          {props.scroll ? <Scrollbar thumbTop={props.scroll[0]} thumbHeight={props.scroll[1]} /> : null}
        </View>
      )}
      <FooterLegend items={props.legend} />
    </View>
  );
}

function SunsetCover() {
  return (
    <View class="relative w-[92] h-[92] overflow-hidden bg-gradient-to-b from-[#f6d27a] via-[#e8743b] to-[#5b2a6e]">
      <View class="absolute left-[26] top-[16] w-[40] h-[40] rounded-[20] bg-[#fff1c4]" />
      <View class="absolute left-[0] top-[60] w-[92] h-[32] bg-[#2b1640]" />
      <View class="absolute left-[0] top-[64] w-[92] h-[3] bg-[#e8743b]" />
      <View class="absolute left-[0] top-[71] w-[92] h-[3] bg-[#e8743b]" />
      <Text class="absolute left-[6] top-[76] text-xs font-bold text-[#fff1c4]">DISCOVERY</Text>
    </View>
  );
}

function NowPlaying(props: { album: string; title: string; artist: string; position: string; elapsed: string; remaining: string; fraction: number; playing: boolean; cover?: boolean }) {
  return (
    <View class={AQUA.bottomScreen}>
      <ArtFrame album={props.album}>{props.cover ? <SunsetCover /> : undefined}</ArtFrame>
      <InfoLcd title={props.title} artist={props.artist} album={props.album} position={props.position} shuffle repeat="all" />
      <SeekCapsule elapsed={props.elapsed} remaining={props.remaining} fraction={props.fraction} enabled />
      <TransportRow playing={props.playing} shuffle repeat="all" enabled />
    </View>
  );
}

function Idle() {
  return (
    <View class={AQUA.bottomScreen}>
      <IdlePanel />
      <SeekCapsule elapsed="--:--" remaining="--:--" fraction={0} enabled={false} />
      <TransportRow playing={false} shuffle={false} repeat="off" enabled={false} />
    </View>
  );
}

function SearchKeyboard() {
  const [query, setQuery] = createSignal("daft");
  const osk = createOsk({ value: query, setValue: setQuery });
  onMount(() => osk.open());
  return (
    <View class={AQUA.bottomScreen}>
      <Osk osk={osk} surface="auxiliary" theme={AQUA.osk} />
    </View>
  );
}

const SONG_ROWS: Row[] = [
  ["Aerodynamic", "Daft Punk"], ["Around the World", "Daft Punk"], ["Clint Eastwood", "Gorillaz"], ["Digital Love", "Daft Punk"],
  ["Feel Good Inc.", "Gorillaz"], ["Hoppípolla", "Sigur Rós"], ["One More Time", "Daft Punk"], ["Starálfur", "Sigur Rós"],
];

export const STATES: readonly GalleryState[] = [
  {
    name: "main",
    top: () => <Top tab="Songs" header={["Song Name", "Artist"]} rows={SONG_ROWS} selected={3} playing={6} scroll={[18, 44]} legend={SONGS_LEGEND} />,
    bottom: () => <NowPlaying album="Discovery" title="One More Time" artist="Daft Punk" position="3 of 12" elapsed="1:42" remaining="-3:58" fraction={0.3} playing cover />,
  },
  {
    name: "artists",
    top: () => (
      <Top
        tab="Artists"
        header={["Artist", "Songs"]}
        rows={[["Beyoncé", "3"], ["Daft Punk", "12"], ["Gorillaz", "9"], ["Queen", "14"], ["Radiohead", "22"], ["Sigur Rós", "7"], ["The Strokes", "11"], ["Unknown Artist", "2"]]}
        selected={3}
        count
        scroll={[4, 60]}
        legend={[{ key: "A", label: "Open", primary: true }, { key: "X", label: "Search" }, { key: "B", label: "Back" }, { key: "Y", label: "Now Playing" }]}
      />
    ),
    bottom: () => <Idle />,
  },
  {
    name: "album",
    top: () => (
      <Top
        tab="Albums"
        strip={<Breadcrumb root="Albums" leaf="Discovery" detail="Daft Punk · 14 songs" />}
        header={["#  Song Name", "Time"]}
        rows={[["One More Time", "5:20", "1"], ["Aerodynamic", "3:27", "2"], ["Digital Love", "4:58", "3"], ["Harder, Better, Faster, Stronger (Extended Club Mix)", "3:44", "4"], ["Crescendolls", "3:31", "5"], ["Nightvision", "1:44", "6"], ["Superheroes", "3:57", "7"]]}
        selected={1}
        scroll={[4, 52]}
        legend={[{ key: "A", label: "Play", primary: true }, { key: "X", label: "Search" }, { key: "B", label: "Albums" }, { key: "Y", label: "Now Playing" }]}
      />
    ),
    bottom: () => <NowPlaying album="Discovery" title="Aerodynamic" artist="Daft Punk" position="2 of 14" elapsed="0:12" remaining="-3:15" fraction={0.05} playing />,
  },
  {
    name: "scanning",
    top: () => <Top tab="Songs" line="Scanning…" body={<StatePanel title="Scanning your music…" lines={["sdmc:/music/ · 87 of 142 files"]} progress={0.46} />} legend={[{ key: "Y", label: "Now Playing" }]} />,
    bottom: () => <Idle />,
  },
  {
    name: "empty",
    top: () => <Top tab="Songs" line="0 songs" body={<StatePanel title="No music found" lines={["Copy .mp3 files to the /music folder on your SD card,", "then press Ⓧ to scan again."]} />} legend={[{ key: "X", label: "Scan again", primary: true }]} />,
    bottom: () => <Idle />,
  },
  {
    // Last: the open keyboard is modal and takes L/R while it is up.
    name: "search",
    top: () => (
      <Top
        tab="Songs"
        strip={<SearchStrip query="daft" count={4} />}
        header={["Song Name", "Artist"]}
        rows={[["Aerodynamic", "Daft Punk"], ["Around the World", "Daft Punk"], ["Digital Love", "Daft Punk"], ["One More Time", "Daft Punk"]]}
        selected={2}
        playing={3}
        legend={[{ key: "A", label: "Play", primary: true }, { key: "X", label: "Edit search" }, { key: "B", label: "Clear" }, { key: "Y", label: "Now Playing" }]}
      />
    ),
    bottom: () => <SearchKeyboard />,
  },
];
```

`app/gallery.tsx`:
```tsx
// iPoDS theme gallery: a separate bundle (gallery.pocket.json) that shows the
// approved Aqua mockup states built from app/theme parts. L / R flip states.
import { createSignal, For, Show } from "solid-js";
import { AuxiliarySurface } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { mount } from "@pocketjs/framework/solid";
import { STATES } from "./gallery/states.tsx";

function Gallery() {
  const [index, setIndex] = createSignal(0);
  onButtonPress(BTN.RTRIGGER, () => setIndex((i) => (i + 1) % STATES.length));
  onButtonPress(BTN.LTRIGGER, () => setIndex((i) => (i + STATES.length - 1) % STATES.length));
  return (
    <>
      <For each={STATES}>{(state, i) => <Show when={index() === i()}>{state.top()}</Show>}</For>
      <AuxiliarySurface>
        <For each={STATES}>{(state, i) => <Show when={index() === i()}>{state.bottom()}</Show>}</For>
      </AuxiliarySurface>
    </>
  );
}

mount(() => <Gallery />);
```

- [ ] **Step 7: Run the whole gate**

Run: `bun run test && bun run check && bun run 3ds --pocket-only`
Expected: 55 pass, 0 fail (47 before this task + 2 geometry + 6 gallery); no type errors; the app build still prints `output: …ipo-ds-main.pocket`.

- [ ] **Step 8: Commit**

```bash
git add app/theme/geometry.ts app/theme/parts gallery.pocket.json app/gallery.tsx app/gallery tests/geometry.test.ts tests/gallery.test.ts
git commit -m "feat(theme): Aqua parts kit and a gallery bundle of the mockup states"
```

---

### Task 6: Gallery PNGs

**Files:**
- Create: `scripts/png.ts`, `scripts/gallery.ts`
- Modify: `package.json` (`scripts`), `README.md` (new "Theme gallery" section after "Check")
- Test: `tests/png.test.ts` (create)

**Interfaces:**
- Consumes: `buildBundle`, `bootBuilt`, `disposeBundles`, `ROOT` (Task 1); `GALLERY_STATES` (Task 5); `decodePng` (`runtime/framework/compiler/pak.ts`, test only).
- Produces:
  - `encodePng(width, height, rgba): Uint8Array` and `scale(width, height, rgba, factor): Uint8Array`.
  - `bun run gallery`, which writes `dist/gallery/<n>-<state>-{top,bottom}@2x.png` (12 files).

- [ ] **Step 1: Write the failing test**

`tests/png.test.ts`:
```ts
import { expect, test } from "bun:test";
import { decodePng } from "../runtime/framework/compiler/pak.ts";
import { encodePng, scale } from "../scripts/png.ts";

test("encodePng writes RGBA that the PocketJS PNG decoder reads back unchanged", () => {
  const rgba = Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255);
  const png = encodePng(2, 2, rgba);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = decodePng(png);
  expect([image.width, image.height]).toEqual([2, 2]);
  expect([...image.rgba]).toEqual([...rgba]);
});

test("scale repeats each pixel factor × factor times", () => {
  const out = scale(2, 1, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8), 2);
  expect([...out]).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/png.test.ts`
Expected: FAIL — `Cannot find module '../scripts/png.ts'`.

- [ ] **Step 3: Implement the PNG writer and the gallery script**

`scripts/png.ts`:
```ts
// Minimal PNG writer for sim captures: 8-bit RGBA, filter 0, one IDAT.
import { deflateSync } from "node:zlib";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // depth 8, colour type RGBA, deflate, filter set 0, no interlace
  const rows = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

/** Nearest-neighbour upscale, so a 400×240 capture reads like the 2× mockups. */
export function scale(width: number, height: number, rgba: Uint8Array, factor: number): Uint8Array {
  const out = new Uint8Array(width * factor * height * factor * 4);
  for (let y = 0; y < height * factor; y++)
    for (let x = 0; x < width * factor; x++)
      out.set(rgba.subarray(((y / factor | 0) * width + (x / factor | 0)) * 4, ((y / factor | 0) * width + (x / factor | 0)) * 4 + 4), (y * width * factor + x) * 4);
  return out;
}
```

`scripts/gallery.ts`:
```ts
// Renders every theme gallery state (gallery.pocket.json) in the PocketJS sim
// and writes both screens as 2× PNGs to dist/gallery/, for comparison with the
// approved mockups in docs/design/aqua/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BTN } from "../runtime/framework/src/input-api.ts";
import { GALLERY_STATES } from "../app/gallery/names.ts";
import { encodePng, scale } from "./png.ts";
import { bootBuilt, buildBundle, disposeBundles, ROOT } from "./sim.ts";

const out = join(ROOT, "dist", "gallery");
mkdirSync(out, { recursive: true });
try {
  const world = await bootBuilt(buildBundle("gallery.pocket.json"));
  for (let f = 0; f < 6; f++) world.step();
  for (const [index, name] of GALLERY_STATES.entries()) {
    for (const [surface, label] of [["primary", "top"], ["auxiliary", "bottom"]] as const) {
      const { width, height, rgba } = world.pixels(surface);
      const file = join(out, `${index + 1}-${name}-${label}@2x.png`);
      writeFileSync(file, encodePng(width * 2, height * 2, scale(width, height, rgba, 2)));
      console.log(file);
    }
    world.step({ buttons: BTN.RTRIGGER });
    for (let f = 0; f < 3; f++) world.step();
  }
  if (world.failure) throw new Error(`gallery failed: ${world.failure.message}`);
} finally {
  disposeBundles();
}
```

In `package.json` `scripts`, add after `"test"`:
```json
    "gallery": "bun scripts/gallery.ts"
```

In `README.md`, after the `## Check` section, add:
````markdown
## Theme gallery

```sh
bun run gallery   # dist/gallery/<n>-<state>-{top,bottom}@2x.png
```

`gallery.pocket.json` builds `app/gallery.tsx`, which shows the approved Aqua
mockup states (`docs/design/aqua/`) built from `app/theme/parts`. L / R flip
states on a device or in the sim.
````

- [ ] **Step 4: Run tests and the script**

Run: `bun run test && bun run check && bun run gallery`
Expected: 57 pass, 0 fail. The script prints 12 paths ending `dist/gallery/6-search-bottom@2x.png`, and `ls dist/gallery | wc -l` prints `12`.

- [ ] **Step 5: Commit**

```bash
git add scripts/png.ts scripts/gallery.ts tests/png.test.ts package.json README.md
git commit -m "feat(theme): render the gallery states to PNG"
```

---

### Task 7: Visual sign-off

**Files:** none (a review gate).

**Interfaces:**
- Consumes: `dist/gallery/*.png` (Task 6), the mockups `docs/design/aqua/main.html` and `docs/design/aqua/states.html`, and the Superdesign drafts named in the spec §2.

- [ ] **Step 1: Present the comparison**

Show the user the 12 PNGs grouped per state (top above bottom), next to the matching mockup state. Name the known deliberate differences:
- The search state's bottom screen is the framework `classic` keyboard, not a hand-drawn one.
- The album state's fourth title is longer, to show clipping.
- Discovery's placeholder hue is the one the hash picks.

- [ ] **Step 2: Record the decision**

If approved, Plan 2 is complete. If the user asks for adjustments, change the token or slot literals in `app/theme/aqua.ts` (`tests/theme.test.ts` keeps them compiling). Re-run `bun run test && bun run gallery` and present again.

---

## Plan 2 exit gate

- `bun run test` (57), `bun run check`, `bun run 3ds --pocket-only` and `bun run gallery` all green.
- The user approves the gallery PNGs against the mockups.
- Next: Plan 3 (Explorer and Now Playing screens) builds on these parts. Plan 4 (native `media.local`) is independent and can start any time.
