# iPoDS Walkman — Plan 1: Foundations, `media.local` Contract, App Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin ipo-ds to a PocketJS fork, define the `media.local` host module (contract, SDK, sim fake), and build the app's tested core — library model, player reducer, player controller — behind a scanning two-screen app shell.

**Architecture:** Framework pieces land in the fork (`runtime/` submodule, branch `ipo-ds`): `contracts/spec/localmedia.ts` (types + validators), `framework/src/localmedia.ts` (SDK over `globalThis.localmedia`), `hosts/sim/localmedia.ts` (deterministic fake on a virtual clock), plus two tooling fixes (font flags through the 3DS build; `extraGlobals` on `bootBundle`). ipo-ds gets framework-free TS modules (`app/library/`, `app/player/`) unit-tested with `bun test`, and a headless harness that builds the guest with `--pocket-only` and runs it through `bootBundle` at 400×240 + 320×240.

**Tech Stack:** Bun (test runner, build scripts), TypeScript, SolidJS via `@pocketjs/framework`, PocketJS sim host (WASM core), git submodules.

**Spec:** `docs/superpowers/specs/2026-10-06-walkman-player-design.md` · **Roadmap:** `docs/superpowers/plans/2026-10-06-walkman-roadmap.md`

## Global Constraints

- Framework code belongs in the PocketJS fork (`runtime/`, branch `ipo-ds`); ipo-ds only bumps the submodule pin.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives/control flow from `solid-js`.
- `pocket.json` declares the 400×240 top viewport and the 320×240 `surfaces.auxiliary` with `display.auxiliary`.
- Commits and PRs use Conventional Commits (`feat: …`, `fix(scope): …`) in both repos.
- Do not recursively discover tests or sources through the runtime submodule: ipo-ds runs `bun test ./tests`, never bare `bun test`.
- Build products, logs and captures stay out of Git (`dist/`, temp dirs).
- Before editing anything under `runtime/`, read `runtime/CLAUDE.md`: docs prose there states mechanisms, bolds concrete facts, uses no adverbs like "simply/just/properly"; validation artifacts never get committed.
- Target: **New 3DS only**; format: **MP3 only**; music root: **`sdmc:/music/`** (non-recursive); text coverage: **Latin + accents**.
- `media.local` stays **out of the 3DS profile** in this plan (the native host does not ship it yet); ipo-ds lists it under `enhances`. Plan 4 adds it to the profile with hostAbi 12.
- Binary audio data never enters JS. Every `media.local` command updates the status snapshot before it returns (spec §4.1 snapshot rule).
- Fallback tags: title = filename without extension, artist = `Unknown Artist`, album = `Unknown Album`.
- Previous-track rule threshold: **3000 ms**.

## Review Focus

- A status from the previous track (or an `ended` that is still visible after `open`) must never advance the queue twice — reducer ignores statuses whose `trackId` is not the current track; the fake and contract make `open` visible synchronously. Pinned in Task 5 ("every command is visible…") and Task 8 ("a status for another track is stored but never acted on").
- A queue holding an undecodable file skips it; a queue where every file fails stops instead of looping forever under repeat-all. Pinned in Task 8 ("an error skips forward…") and Task 9 ("a corrupt file in the queue is skipped").
- Two albums with the same name by different artists ("Greatest Hits") stay separate albums. Pinned in Task 7.
- Search folds case, accents and surrounding whitespace: `beyonce` finds `Beyoncé`, `"   "` shows everything. Pinned in Task 7.
- Blank tag strings from a host (`""`, `"  "`) fall back exactly like missing tags. Pinned in Task 5 (fake) and Task 7 (library).

---

## File Structure

**Fork (`runtime/`, branch `ipo-ds`)**

| File | Responsibility |
|---|---|
| `contracts/spec/localmedia.ts` (create) | `LOCALMEDIA` constants, `LocalPhase`/`LocalTrack`/`LocalStatus`/`LocalMediaOps` types, `validLocalTrack`, `validLocalStatus` |
| `framework/src/localmedia.ts` (create) | `localMedia(ops?)` SDK: JSON parse + validate, clamp, id checks |
| `hosts/sim/localmedia.ts` (create) | `createSimLocalMedia(library, options)` fake on a virtual clock |
| `contracts/spec/platforms.ts` (modify) | register `"media.local"` capability |
| `package.json` (modify) | export `"./localmedia"` |
| `tools/3ds.ts` (modify) | forward `--font-regular/--font-bold/--extra-chars` to the guest build |
| `hosts/sim/sim.ts` (modify) | `BundleOptions.extraGlobals`; reset `globalThis.localmedia` per boot |
| `tests/localmedia.test.ts`, `tests/localmedia-sim.test.ts`, `tests/3ds-arguments.test.ts` (create); `tests/sim-bundle.test.ts` (modify) | fork tests |

**ipo-ds**

| File | Responsibility |
|---|---|
| `.gitmodules` (modify) | submodule URL → fork, branch `ipo-ds` |
| `pocket.json` (modify) | `input.touch.auxiliary` required; `input.analog.left`, `media.local` enhanced |
| `package.json`, `tsconfig.json` (modify) | `test` script; typecheck `tests/` |
| `scripts/build.ts` (modify) | do not copy stale products when `--package-outdir` is given |
| `tests/support/app-world.ts` (create) | build guest once, `bootApp`, `screenText` |
| `tests/fixtures/tracks.ts` (create) | shared `LocalTrack[]` fixture |
| `app/library/normalize.ts` (create) | case/accent/whitespace folding |
| `app/library/library.ts` (create) | `buildLibrary`, `rows`, `View`, `Row` |
| `app/library/status.ts` (create) | `libraryLine` (top-screen status copy) |
| `app/player/reducer.ts` (create) | pure player reducer |
| `app/player/controller.ts` (create) | runs reducer commands against `LocalMedia`, polls status |
| `app/app.tsx` (modify) | two-screen shell; scans at launch |
| `tests/library.test.ts`, `tests/player.test.ts`, `tests/controller.test.ts`, `tests/app.test.ts` (create) | ipo-ds tests |

---

### Task 1: Pin ipo-ds to the PocketJS fork and build the WASM core

**Files:**
- Modify: `.gitmodules`
- Modify: `runtime` (submodule pin)

**Interfaces:**
- Consumes: nothing.
- Produces: `runtime/` tracking branch `ipo-ds` on the fork remote `fork`; `runtime/hosts/web/pocketjs.wasm` built locally (ignored by Git, needed by every `bootBundle` test). Shell variable `FORK_URL` used by later tasks' push steps means the fork's HTTPS/SSH URL.

- [ ] **Step 1: Create the fork on GitHub (outward-facing — the user runs or approves this)**

```bash
gh repo fork pocket-nexus/pocketjs --clone=false
gh repo view --json url -q .url "$(gh api user -q .login)/pocketjs"
```
Expected: prints the fork URL, e.g. `https://github.com/<user>/pocketjs`. Export it for the rest of the plan:
```bash
export FORK_URL=https://github.com/<user>/pocketjs   # value printed above
```

- [ ] **Step 2: Create the `ipo-ds` branch at the current pin and push it**

```bash
git -C runtime remote add fork "$FORK_URL"
git -C runtime switch -c ipo-ds 12dd7535dff67d31874afad1bc5f7c145bf09bb0
git -C runtime push -u fork ipo-ds
```
Expected: `branch 'ipo-ds' set up to track 'fork/ipo-ds'`.

- [ ] **Step 3: Point the submodule at the fork**

```bash
git config -f .gitmodules submodule.runtime.url "$FORK_URL"
git config -f .gitmodules submodule.runtime.branch ipo-ds
git submodule sync runtime
cat .gitmodules
```
Expected:
```
[submodule "runtime"]
	path = runtime
	url = https://github.com/<user>/pocketjs
	branch = ipo-ds
```

- [ ] **Step 4: Build the WASM core the sim host needs**

```bash
rustup target add wasm32-unknown-unknown
bun run --cwd runtime wasm
ls -la runtime/hosts/web/pocketjs.wasm
```
Expected: the file exists (a few MB). `git -C runtime status --short` shows nothing new (the wasm is ignored).

- [ ] **Step 5: Verify the app still builds and typechecks**

```bash
bun run check && bun run 3ds --pocket-only
```
Expected: no type errors; `dist/ipo-ds-main.pocket` written.

- [ ] **Step 6: Commit**

```bash
git add .gitmodules runtime
git commit -m "chore: track the PocketJS fork's ipo-ds branch"
```

---

### Task 2: Forward font and extra-character flags through the 3DS build (fork)

**Files:**
- Modify: `runtime/tools/3ds.ts:176-194` (argument loop in `parse3dsArguments`)
- Test: `runtime/tests/3ds-arguments.test.ts` (create)

**Interfaces:**
- Consumes: `parse3dsArguments(argv, { workingDirectory })` from `runtime/tools/3ds.ts`.
- Produces: `ThreeDsArguments.buildFlags` carries `--font-regular=<abs>`, `--font-bold=<abs>`, `--extra-chars=<s>` to `tools/build.ts`; Plan 2 passes the W95FA font this way via `bun run 3ds --font-regular=… --font-bold=…`.

- [ ] **Step 1: Write the failing test**

`runtime/tests/3ds-arguments.test.ts`:
```ts
import { expect, test } from "bun:test";
import { parse3dsArguments } from "../tools/3ds.ts";

test("font overrides and extra characters reach the guest build, resolved against the working directory", () => {
  const args = parse3dsArguments(
    ["--font-regular=fonts/W95FA.otf", "--font-bold=/abs/W95FA-Bold.otf", "--extra-chars=♪▶"],
    { workingDirectory: "/work/app" },
  );
  expect(args.buildFlags).toEqual([
    "--font-regular=/work/app/fonts/W95FA.otf",
    "--font-bold=/abs/W95FA-Bold.otf",
    "--extra-chars=♪▶",
  ]);
  expect(args.cargoArgs).toEqual([]);
});

test("unrecognized flags still go to cargo", () => {
  expect(parse3dsArguments(["--locked"], { workingDirectory: "/w" }).cargoArgs).toEqual(["--locked"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd runtime && bun test tests/3ds-arguments.test.ts`
Expected: FAIL — `buildFlags` is `[]` and `cargoArgs` holds the three flags.

- [ ] **Step 3: Implement**

In `runtime/tools/3ds.ts`, inside `parse3dsArguments`, add a working-directory constant before the loop and three branches before the `--config=` branch:
```ts
  const workingDirectory = options.workingDirectory ?? process.cwd();
```
```ts
    else if (a.startsWith("--font-regular=")) buildFlags.push(`--font-regular=${resolvePath(workingDirectory, a.slice("--font-regular=".length))}`);
    else if (a.startsWith("--font-bold=")) buildFlags.push(`--font-bold=${resolvePath(workingDirectory, a.slice("--font-bold=".length))}`);
    else if (a.startsWith("--extra-chars=")) buildFlags.push(a);
```
Add to the `USAGE` string after `[--cia]`: ` [--font-regular=<path>] [--font-bold=<path>] [--extra-chars=<s>]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd runtime && bun test tests/3ds-arguments.test.ts tests/3ds-profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit, push, bump the pin**

```bash
git -C runtime add tools/3ds.ts tests/3ds-arguments.test.ts
git -C runtime commit -m "feat(3ds): forward font and extra-character flags to the guest build"
git -C runtime push fork ipo-ds
git add runtime && git commit -m "chore(runtime): bump pin for 3DS font flags"
```

---

### Task 3: Let `bootBundle` mount host module namespaces (fork)

**Files:**
- Modify: `runtime/hosts/sim/sim.ts` (`BundleOptions` ~line 322; global resets in `bootBundle` ~line 506-518; global resets in `bootWorld` ~line 248-251)
- Test: `runtime/tests/sim-bundle.test.ts` (add one test)

**Interfaces:**
- Consumes: `bootBundle(options: BundleOptions)`.
- Produces: `BundleOptions.extraGlobals?: Record<string, unknown>` — assigned onto `globalThis` after the per-boot resets and before the bundle evaluates. `globalThis.localmedia` is reset to `undefined` on every boot. ipo-ds's harness (Task 6) passes `{ localmedia: host.ns }`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe("bootBundle", …)` block of `runtime/tests/sim-bundle.test.ts`:
```ts
  test("extraGlobals mount host namespaces before the bundle runs, and the next boot starts without them", async () => {
    const source = "console.log(typeof globalThis.localmedia, String(globalThis.probe));\nglobalThis.frame = function () {};";
    const mounted = await bootBundle({ js: bundle("mounted", source), extraGlobals: { localmedia: {}, probe: 7 } });
    expect(mounted.logs[0]!.text).toBe("object 7");
    (globalThis as Record<string, unknown>).probe = undefined;
    const bare = await bootBundle({ js: bundle("bare", source) });
    expect(bare.logs[0]!.text).toBe("undefined undefined");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd runtime && bun test tests/sim-bundle.test.ts -t "extraGlobals"`
Expected: FAIL — first log is `undefined undefined` (and a type error on `extraGlobals`).

- [ ] **Step 3: Implement**

In `BundleOptions` add:
```ts
  /** Host module namespaces (e.g. `{ localmedia: host.ns }`), set on globalThis after the per-boot resets and before the bundle evaluates. */
  extraGlobals?: Record<string, unknown>;
```
In `bootBundle`, after `g.fs = undefined;` add `g.localmedia = undefined;`, and after `g.__pocketDevtoolsTransport = undefined;` add:
```ts
  if (options.extraGlobals) Object.assign(g, options.extraGlobals);
```
In `bootWorld`, after `g.fs = undefined; // fs module namespace…` add:
```ts
  g.localmedia = undefined; // local media module namespace: absent unless extraGlobals mounts one
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd runtime && bun test tests/sim-bundle.test.ts -t "extraGlobals|exception|console"`
Expected: PASS (the café tests need `dist/cafe-main.*`; they are not part of this filter).

- [ ] **Step 5: Commit, push, bump the pin**

```bash
git -C runtime add hosts/sim/sim.ts tests/sim-bundle.test.ts
git -C runtime commit -m "feat(sim): bootBundle mounts host module namespaces through extraGlobals"
git -C runtime push fork ipo-ds
git add runtime && git commit -m "chore(runtime): bump pin for bootBundle extraGlobals"
```

---

### Task 4: `media.local` contract, SDK and capability (fork)

**Files:**
- Create: `runtime/contracts/spec/localmedia.ts`
- Create: `runtime/framework/src/localmedia.ts`
- Modify: `runtime/contracts/spec/platforms.ts:185` (after `"media.playback",`)
- Modify: `runtime/package.json` (exports, after `"./media/audio"`)
- Test: `runtime/tests/localmedia.test.ts` (create)

**Interfaces:**
- Consumes: `resolve3dsBuildPlan` from `runtime/tools/3ds-profile.ts` (test only).
- Produces (exact, used by Tasks 5–10 and Plans 3–4):
  - `LOCALMEDIA = { version: 1, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 }`
  - `type LocalPhase = "idle" | "loading" | "playing" | "paused" | "ended" | "error"`
  - `interface LocalTrack { id; file; title; artist; album; track; durationMs; hasArt }`
  - `interface LocalStatus { phase; trackId; positionMs; durationMs; scanning; scanGeneration; underruns; error }`
  - `interface LocalMediaOps { scan(): boolean; tracks(): string; open(id): boolean; paused(v): void; seek(ms): void; volume(v): void; status(): string; artwork(id): number; releaseArtwork(h): void }`
  - `validLocalTrack(x): x is LocalTrack`, `validLocalStatus(x): x is LocalStatus`
  - `localMedia(ops?): LocalMedia` with `scan()`, `tracks(): LocalTrack[]`, `open(id)`, `pause(value)`, `seek(ms)`, `volume(v)`, `status(): LocalStatus`, `artwork(id): number`, `releaseArtwork(handle)`; import path `@pocketjs/framework/localmedia`.

- [ ] **Step 1: Write the failing test**

`runtime/tests/localmedia.test.ts`:
```ts
import { expect, test } from "bun:test";
import { LOCALMEDIA, validLocalStatus, validLocalTrack, type LocalMediaOps } from "../contracts/spec/localmedia.ts";
import { POCKET_CAPABILITIES } from "../contracts/spec/platforms.ts";
import { localMedia } from "../framework/src/localmedia.ts";
import { resolve3dsBuildPlan } from "../tools/3ds-profile.ts";

const STATUS = { phase: "playing", trackId: 1, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, underruns: 0, error: "" };

function recorder(over: Partial<LocalMediaOps> = {}) {
  const calls: string[] = [];
  const ops: LocalMediaOps = {
    scan: () => (calls.push("scan"), true),
    tracks: () => "[]",
    open: (id) => (calls.push(`open ${id}`), true),
    paused: (v) => void calls.push(`paused ${v}`),
    seek: (ms) => void calls.push(`seek ${ms}`),
    volume: (v) => void calls.push(`volume ${v}`),
    status: () => JSON.stringify(STATUS),
    artwork: (id) => (calls.push(`artwork ${id}`), 3),
    releaseArtwork: (h) => void calls.push(`release ${h}`),
    ...over,
  };
  return { calls, ops };
}

test("a realm without the namespace fails loudly", () => {
  expect(() => localMedia()).toThrow("Host does not implement media.local");
});

test("volume and seek are clamped before they cross; ids must be track ids", () => {
  const { calls, ops } = recorder();
  const media = localMedia(ops);
  media.volume(2); media.volume(-1); media.volume(NaN);
  media.seek(-5); media.seek(12.6); media.seek(Infinity);
  media.pause(true);
  expect(calls).toEqual(["volume 1", "volume 0", "volume 0", "seek 0", "seek 13", "seek 0", "paused true"]);
  expect(() => media.open(-1)).toThrow("Invalid track id");
  expect(() => media.open(1.5)).toThrow("Invalid track id");
  expect(() => media.artwork(-2)).toThrow("Invalid track id");
});

test("artwork handle 0 means none and is never released", () => {
  const { calls, ops } = recorder();
  const media = localMedia(ops);
  media.releaseArtwork(0);
  expect(calls).toEqual([]);
  media.releaseArtwork(3);
  expect(calls).toEqual(["release 3"]);
});

test("status and tracks are parsed and validated", () => {
  expect(localMedia(recorder().ops).status()).toEqual(STATUS);
  expect(() => localMedia(recorder({ status: () => JSON.stringify({ ...STATUS, phase: "scanning" }) }).ops).status()).toThrow("malformed status");
  expect(() => localMedia(recorder({ tracks: () => '[{"id":0}]' }).ops).tracks()).toThrow("malformed track list");
  expect(validLocalTrack({ id: 0, file: "a.mp3", title: "A", artist: "B", album: "C", track: 0, durationMs: 0, hasArt: false })).toBe(true);
  expect(validLocalStatus({ ...STATUS, trackId: -2 })).toBe(false);
  expect(validLocalStatus({ ...STATUS, trackId: -1 })).toBe(true);
  expect(LOCALMEDIA).toEqual({ version: 1, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 });
});

test("media.local is a registered capability that the 3DS profile does not advertise yet", () => {
  expect(POCKET_CAPABILITIES).toContain("media.local");
  const plan = resolve3dsBuildPlan({
    pocket: 2, id: "dev.example.probe", name: "probe", title: "Probe", version: "0.1.0",
    engine: { capabilities: { requires: ["text.glyphs.baked", "input.buttons", "display.auxiliary"], enhances: ["media.local"] } },
    app: {
      entry: "app/main.tsx", output: "probe-main", framework: "solid",
      viewport: { fixed: { logical: [400, 240], presentation: "native" } },
      surfaces: { auxiliary: { fixed: { logical: [320, 240], presentation: "native" } } },
    },
  });
  expect(plan.features["media.local"]).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd runtime && bun test tests/localmedia.test.ts`
Expected: FAIL — `Cannot find module '../contracts/spec/localmedia.ts'`.

- [ ] **Step 3: Write the contract**

`runtime/contracts/spec/localmedia.ts`:
```ts
/** Local encoded-media playback from the device's own storage. Control stays
 * on the guest; directory scan, tag parsing, decode and audio scheduling
 * belong to the native worker. Binary audio data never enters JS.
 *
 * Snapshot rule: every command updates the status snapshot before it
 * returns. open(id) reads back { trackId: id, phase: "loading",
 * positionMs: 0 }; seek(ms) reads back the clamped position, and an ended
 * track becomes paused; paused(v) reads back paused/playing. The worker
 * never publishes state for a command a newer command superseded. */
export const LOCALMEDIA = Object.freeze({
  version: 1,
  /** Scanned non-recursively for *.mp3 (extension case-insensitive). */
  root: "sdmc:/music/",
  maxTracks: 2048,
  /** Longest artwork edge after downscale; the texture is power-of-two. */
  artMax: 128,
});

export type LocalPhase = "idle" | "loading" | "playing" | "paused" | "ended" | "error";
const PHASES: ReadonlySet<string> = new Set<LocalPhase>(["idle", "loading", "playing", "paused", "ended", "error"]);

export interface LocalTrack {
  /** Stable for the session: the track's index in scan order. */
  id: number;
  /** File name relative to LOCALMEDIA.root. */
  file: string;
  /** Tag text as UTF-8; the host applies the fallbacks (file stem, "Unknown Artist", "Unknown Album"). */
  title: string;
  artist: string;
  album: string;
  /** Track number; 0 when unknown. */
  track: number;
  /** 0 when unknown or the file does not decode. */
  durationMs: number;
  hasArt: boolean;
}

export interface LocalStatus {
  phase: LocalPhase;
  /** -1 before the first open. */
  trackId: number;
  positionMs: number;
  durationMs: number;
  /** A scan is running; independent of the playback phase. */
  scanning: boolean;
  /** Completed scans; 0 before the first finishes. A change means tracks() has a new list. */
  scanGeneration: number;
  underruns: number;
  error: string;
}

export interface LocalMediaOps {
  /** Starts a scan of LOCALMEDIA.root; false while one is already running. */
  scan(): boolean;
  /** JSON LocalTrack[] of the last completed scan ("[]" before the first). */
  tracks(): string;
  /** Stops the current track and starts id; false for an id the last scan did not list. */
  open(id: number): boolean;
  paused(value: boolean): void;
  /** Milliseconds; the host clamps to [0, durationMs]. */
  seek(ms: number): void;
  /** 0..1. */
  volume(value: number): void;
  /** JSON LocalStatus. Non-blocking: no file, decoder or audio calls on the UI thread. */
  status(): string;
  /** Texture handle of the track's embedded art at up to artMax × artMax; 0 when it has none or decoding failed. */
  artwork(id: number): number;
  releaseArtwork(handle: number): void;
}

const isInt = (value: unknown, min = 0): value is number => Number.isInteger(value) && (value as number) >= min;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export function validLocalTrack(value: unknown): value is LocalTrack {
  return isObject(value) && isInt(value.id) && typeof value.file === "string"
    && typeof value.title === "string" && typeof value.artist === "string" && typeof value.album === "string"
    && isInt(value.track) && isInt(value.durationMs) && typeof value.hasArt === "boolean";
}

export function validLocalStatus(value: unknown): value is LocalStatus {
  return isObject(value) && typeof value.phase === "string" && PHASES.has(value.phase)
    && isInt(value.trackId, -1) && isInt(value.positionMs) && isInt(value.durationMs)
    && typeof value.scanning === "boolean" && isInt(value.scanGeneration)
    && isInt(value.underruns) && typeof value.error === "string";
}
```

- [ ] **Step 4: Write the SDK**

`runtime/framework/src/localmedia.ts`:
```ts
import {
  LOCALMEDIA,
  validLocalStatus,
  validLocalTrack,
  type LocalMediaOps,
  type LocalStatus,
  type LocalTrack,
} from "../../contracts/spec/localmedia.ts";
export { LOCALMEDIA };
export type { LocalMediaOps, LocalPhase, LocalStatus, LocalTrack } from "../../contracts/spec/localmedia.ts";

export interface LocalMedia {
  scan(): boolean;
  tracks(): LocalTrack[];
  open(id: number): boolean;
  pause(value: boolean): void;
  seek(ms: number): void;
  volume(value: number): void;
  status(): LocalStatus;
  artwork(id: number): number;
  releaseArtwork(handle: number): void;
}

function trackId(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid track id: ${value}`);
  return value;
}

/** The host's local media module (capability media.local). */
export function localMedia(ops = (globalThis as unknown as { localmedia?: LocalMediaOps }).localmedia): LocalMedia {
  if (!ops) throw new Error("Host does not implement media.local");
  return {
    scan: () => ops.scan(),
    tracks() {
      const list = JSON.parse(ops.tracks()) as unknown;
      if (!Array.isArray(list) || !list.every(validLocalTrack)) throw new Error("Host returned a malformed track list");
      return list;
    },
    open: (id) => ops.open(trackId(id)),
    pause: (value) => ops.paused(value),
    seek: (ms) => ops.seek(Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0),
    volume: (value) => ops.volume(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0),
    status() {
      const status = JSON.parse(ops.status()) as unknown;
      if (!validLocalStatus(status)) throw new Error("Host returned a malformed status");
      return status;
    },
    artwork: (id) => ops.artwork(trackId(id)),
    releaseArtwork(handle) {
      if (handle > 0) ops.releaseArtwork(handle);
    },
  };
}
```

- [ ] **Step 5: Register the capability and the export**

In `runtime/contracts/spec/platforms.ts`, directly after `"media.playback",` insert:
```ts
  // Encoded audio from the device's own storage behind the local media
  // module's namespace (`globalThis.localmedia`, contracts/spec/localmedia.ts):
  // directory scan, tags, decode, seek and artwork stay in a native worker;
  // the guest sends commands and reads a JSON status snapshot. The sim host
  // implements the contract (hosts/sim/localmedia.ts); a device target
  // appends the id to its profile when its native host ships the module.
  "media.local",
```
In `runtime/package.json` exports, after `"./media/audio": "./contracts/spec/media-adpcm.ts",` add:
```json
    "./localmedia": "./framework/src/localmedia.ts",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd runtime && bun test tests/localmedia.test.ts tests/platform-contracts.test.ts tests/3ds-profile.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit, push, bump the pin**

```bash
git -C runtime add contracts/spec/localmedia.ts framework/src/localmedia.ts contracts/spec/platforms.ts package.json tests/localmedia.test.ts
git -C runtime commit -m "feat(localmedia): media.local contract and SDK for on-device encoded audio"
git -C runtime push fork ipo-ds
git add runtime && git commit -m "chore(runtime): bump pin for the media.local contract"
```

---

### Task 5: `media.local` sim fake (fork)

**Files:**
- Create: `runtime/hosts/sim/localmedia.ts`
- Test: `runtime/tests/localmedia-sim.test.ts` (create)

**Interfaces:**
- Consumes: Task 4 types and `localMedia()`.
- Produces (used by Tasks 9–10 and Plan 3 tests):
  - `interface SimLocalTrack { file: string; title?; artist?; album?; track?; durationMs: number; art?: boolean; corrupt?: boolean }`
  - `createSimLocalMedia(library: readonly SimLocalTrack[], options?: { scanMs?: number }): SimLocalMediaHost`
  - `SimLocalMediaHost { ns: LocalMediaOps; log: string[]; volume(): number; liveArtwork(): number[]; advance(ms: number): void; dispose(): void }`
  - Behaviour: ids are fixture indices; `advance` turns `loading` into `playing` (or `error` with message `"MP3 frame sync not found"` for `corrupt`) without moving the position, then later advances move the position and reach `ended` at `durationMs`. Log entries look like `"scan()"`, `"open(2)"`, `"paused(true)"`, `"seek(0)"`.

- [ ] **Step 1: Write the failing test**

`runtime/tests/localmedia-sim.test.ts`:
```ts
import { expect, test } from "bun:test";
import { createSimLocalMedia, type SimLocalTrack } from "../hosts/sim/localmedia.ts";
import { localMedia } from "../framework/src/localmedia.ts";

const LIB: SimLocalTrack[] = [
  { file: "01 Intro.mp3", title: "Intro", artist: "Band", album: "First", track: 1, durationMs: 1000, art: true },
  { file: "untagged.mp3", title: "  ", artist: "", durationMs: 2000 },
  { file: "broken.mp3", title: "Broken", durationMs: 3000, corrupt: true },
];

function setup(options = {}) {
  const host = createSimLocalMedia(LIB, options);
  return { host, media: localMedia(host.ns) };
}

test("a scan lists every fixture with the native tag fallbacks, blank tags included", () => {
  const { media } = setup();
  expect(media.tracks()).toEqual([]);
  expect(media.scan()).toBe(true);
  expect(media.status()).toMatchObject({ scanning: false, scanGeneration: 1 });
  expect(media.tracks()).toEqual([
    { id: 0, file: "01 Intro.mp3", title: "Intro", artist: "Band", album: "First", track: 1, durationMs: 1000, hasArt: true },
    { id: 1, file: "untagged.mp3", title: "untagged", artist: "Unknown Artist", album: "Unknown Album", track: 0, durationMs: 2000, hasArt: false },
    { id: 2, file: "broken.mp3", title: "Broken", artist: "Unknown Artist", album: "Unknown Album", track: 0, durationMs: 0, hasArt: false },
  ]);
});

test("a timed scan reports scanning until its virtual time passes", () => {
  const { host, media } = setup({ scanMs: 500 });
  media.scan();
  expect(media.status()).toMatchObject({ scanning: true, scanGeneration: 0 });
  expect(media.scan()).toBe(false);
  host.advance(499);
  expect(media.status().scanning).toBe(true);
  host.advance(1);
  expect(media.status()).toMatchObject({ scanning: false, scanGeneration: 1 });
  expect(media.tracks()).toHaveLength(3);
});

test("every command is visible in the next status read", () => {
  const { host, media } = setup();
  media.scan();
  expect(media.open(0)).toBe(true);
  expect(media.status()).toMatchObject({ phase: "loading", trackId: 0, positionMs: 0, durationMs: 1000 });
  host.advance(16);
  expect(media.status()).toMatchObject({ phase: "playing", positionMs: 0 });
  host.advance(400);
  expect(media.status().positionMs).toBe(400);
  media.pause(true);
  expect(media.status().phase).toBe("paused");
  host.advance(400);
  expect(media.status().positionMs).toBe(400);
  media.pause(false);
  media.seek(5000);
  expect(media.status()).toMatchObject({ phase: "playing", positionMs: 1000 });
  host.advance(1);
  expect(media.status()).toMatchObject({ phase: "ended", positionMs: 1000 });
  media.open(0);
  expect(media.status()).toMatchObject({ phase: "loading", trackId: 0, positionMs: 0 });
});

test("a seek on an ended track pauses it at the target", () => {
  const { host, media } = setup();
  media.scan();
  media.open(0);
  host.advance(16);
  host.advance(1000);
  expect(media.status().phase).toBe("ended");
  media.seek(0);
  expect(media.status()).toMatchObject({ phase: "paused", positionMs: 0 });
});

test("an undecodable file reaches error after loading; an unscanned id does not open", () => {
  const { host, media } = setup();
  media.scan();
  expect(media.open(7)).toBe(false);
  expect(media.status().trackId).toBe(-1);
  media.open(2);
  host.advance(16);
  expect(media.status()).toMatchObject({ phase: "error", trackId: 2, error: "MP3 frame sync not found" });
  media.seek(10);
  expect(media.status().positionMs).toBe(0);
});

test("artwork handles exist only for tracks with art and stay live until released", () => {
  const { host, media } = setup();
  media.scan();
  const handle = media.artwork(0);
  expect(handle).toBeGreaterThan(0);
  expect(media.artwork(1)).toBe(0);
  expect(host.liveArtwork()).toEqual([handle]);
  media.releaseArtwork(handle);
  expect(host.liveArtwork()).toEqual([]);
  media.volume(0.25);
  expect(host.volume()).toBe(0.25);
  expect(host.log).toEqual(["scan()", "artwork(0)", "artwork(1)", `releaseArtwork(${handle})`, "volume(0.25)"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd runtime && bun test tests/localmedia-sim.test.ts`
Expected: FAIL — `Cannot find module '../hosts/sim/localmedia.ts'`.

- [ ] **Step 3: Implement the fake**

`runtime/hosts/sim/localmedia.ts`:
```ts
// hosts/sim/localmedia.ts — the in-memory implementation of the local media
// module (contracts/spec/localmedia.ts) for the headless sim host.
//
// The library is a fixture list, not a directory: each entry declares its
// tags, duration, whether it carries art and whether its file decodes. Time
// passes only through advance(ms), so a run is a pure function of the
// fixture and the calls. Every command updates the snapshot before it
// returns (the contract's snapshot rule). Inject via bootWorld/bootBundle
// extraGlobals: { localmedia: host.ns }.

import { LOCALMEDIA, type LocalMediaOps, type LocalStatus, type LocalTrack } from "../../contracts/spec/localmedia.ts";

export interface SimLocalTrack {
  file: string;
  title?: string;
  artist?: string;
  album?: string;
  track?: number;
  durationMs: number;
  /** The file carries embedded art. */
  art?: boolean;
  /** The file does not decode: open() reaches "error" on the next advance. */
  corrupt?: boolean;
}

export interface SimLocalMediaOptions {
  /** Virtual time a scan takes. 0 (default) completes inside scan(). */
  scanMs?: number;
}

export interface SimLocalMediaHost {
  /** The `globalThis.localmedia` namespace. */
  ns: LocalMediaOps;
  /** Every op call except tracks()/status(), in order. */
  log: string[];
  volume(): number;
  /** Artwork handles issued and not yet released. */
  liveArtwork(): number[];
  /** Move the virtual clock. */
  advance(ms: number): void;
  dispose(): void;
}

const stem = (file: string) => file.replace(/\.[^.]*$/, "");

export function createSimLocalMedia(library: readonly SimLocalTrack[], options: SimLocalMediaOptions = {}): SimLocalMediaHost {
  const log: string[] = [];
  const art = new Set<number>();
  let nextArt = 1;
  let volume = 1;
  let scanLeft = -1;
  let tracks: LocalTrack[] = [];
  let position = 0;
  const status: LocalStatus = {
    phase: "idle", trackId: -1, positionMs: 0, durationMs: 0,
    scanning: false, scanGeneration: 0, underruns: 0, error: "",
  };

  const finishScan = () => {
    tracks = library.slice(0, LOCALMEDIA.maxTracks).map((entry, id) => ({
      id,
      file: entry.file,
      title: entry.title?.trim() || stem(entry.file),
      artist: entry.artist?.trim() || "Unknown Artist",
      album: entry.album?.trim() || "Unknown Album",
      track: entry.track ?? 0,
      durationMs: entry.corrupt ? 0 : entry.durationMs,
      hasArt: entry.art === true,
    }));
    scanLeft = -1;
    status.scanning = false;
    status.scanGeneration++;
  };
  const setPosition = (ms: number) => {
    position = ms;
    status.positionMs = Math.floor(ms);
  };

  const ns: LocalMediaOps = {
    scan() {
      log.push("scan()");
      if (status.scanning) return false;
      status.scanning = true;
      const scanMs = options.scanMs ?? 0;
      if (scanMs <= 0) finishScan();
      else scanLeft = scanMs;
      return true;
    },
    tracks: () => JSON.stringify(tracks),
    open(id) {
      log.push(`open(${id})`);
      const track = tracks[id];
      if (!track) return false;
      Object.assign(status, { phase: "loading", trackId: id, durationMs: track.durationMs, error: "" });
      setPosition(0);
      return true;
    },
    paused(value) {
      log.push(`paused(${value})`);
      if (value && (status.phase === "playing" || status.phase === "loading")) status.phase = "paused";
      else if (!value && status.phase === "paused") status.phase = "playing";
    },
    seek(ms) {
      log.push(`seek(${ms})`);
      if (status.trackId < 0 || status.phase === "idle" || status.phase === "error") return;
      setPosition(Math.min(Math.max(0, ms), status.durationMs));
      if (status.phase === "ended") status.phase = "paused";
    },
    volume(value) {
      log.push(`volume(${value})`);
      volume = value;
    },
    status: () => JSON.stringify(status),
    artwork(id) {
      log.push(`artwork(${id})`);
      if (!tracks[id]?.hasArt) return 0;
      const handle = nextArt++;
      art.add(handle);
      return handle;
    },
    releaseArtwork(handle) {
      log.push(`releaseArtwork(${handle})`);
      art.delete(handle);
    },
  };

  return {
    ns,
    log,
    volume: () => volume,
    liveArtwork: () => [...art],
    advance(ms) {
      if (scanLeft >= 0) {
        scanLeft -= ms;
        if (scanLeft <= 0) finishScan();
      }
      if (status.phase === "loading") {
        if (library[status.trackId]?.corrupt) Object.assign(status, { phase: "error", error: "MP3 frame sync not found" });
        else status.phase = "playing";
        return;
      }
      if (status.phase !== "playing") return;
      if (position + ms >= status.durationMs) {
        setPosition(status.durationMs);
        status.phase = "ended";
      } else setPosition(position + ms);
    },
    dispose() {
      art.clear();
      tracks = [];
      log.length = 0;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd runtime && bun test tests/localmedia-sim.test.ts tests/localmedia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit, push, bump the pin**

```bash
git -C runtime add hosts/sim/localmedia.ts tests/localmedia-sim.test.ts
git -C runtime commit -m "feat(sim): deterministic media.local host on a virtual clock"
git -C runtime push fork ipo-ds
git add runtime && git commit -m "chore(runtime): bump pin for the media.local sim host"
```

---

### Task 6: ipo-ds headless harness, capabilities and two-screen shell

**Files:**
- Modify: `pocket.json` (`engine.capabilities`)
- Modify: `package.json` (`scripts`)
- Modify: `tsconfig.json` (`include`)
- Modify: `scripts/build.ts` (copy step)
- Modify: `app/app.tsx` (replace the scaffold)
- Create: `tests/support/app-world.ts`
- Test: `tests/app.test.ts` (create)

**Interfaces:**
- Consumes: `bootBundle({ js, pak, viewport, extraGlobals })` and `SimNode` from `runtime/hosts/sim/sim.ts` (Task 3).
- Produces (used by Task 10 and Plan 3):
  - `bootApp(extraGlobals?: Record<string, unknown>): Promise<BundleWorld>` — builds the guest once per test process, boots at 400×240 + auxiliary 320×240.
  - `screenText(world: BundleWorld, surface?: "primary" | "auxiliary"): string` — every node's text on that surface concatenated in tree order.
  - `disposeGuest(): void` — removes the temp build.
  - `bun run test` runs `bun test ./tests`.

- [ ] **Step 1: Declare capabilities and the test script**

`pocket.json` → replace the `engine` block:
```json
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
```
`package.json` → `scripts`:
```json
  "scripts": {
    "3ds": "bun scripts/build.ts",
    "check": "bun runtime/node_modules/typescript/bin/tsc --noEmit",
    "test": "bun test ./tests"
  }
```
`tsconfig.json` → `"include": ["app", "scripts", "tests", "runtime/framework/src/jsx.d.ts"]`.

`scripts/build.ts` → replace the final `for (const ext …)` loop with:
```ts
// A caller that names its own package directory (the test harness) keeps the
// products there; copying runtime/dist/3ds would publish a stale build.
if (!process.argv.some((a) => a.startsWith("--package-outdir="))) {
  for (const ext of ["3dsx", "pocket", "cia"]) {
    const from = resolve(root, `runtime/dist/3ds/${plan.app.output}.${ext}`);
    if (existsSync(from)) copyFileSync(from, resolve(root, `dist/${plan.app.output}.${ext}`));
  }
}
```

- [ ] **Step 2: Write the harness**

`tests/support/app-world.ts`:
```ts
// Builds the ipo-ds guest once per test process (--pocket-only: no Docker)
// and boots it on the sim's WASM core with the 3DS geometry.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bootBundle, type BundleWorld, type SimNode } from "../../runtime/hosts/sim/sim.ts";

const ROOT = resolve(import.meta.dir, "../..");
let built: { dir: string; js: string; pak: string } | null = null;

function buildGuest() {
  if (built) return built;
  const dir = mkdtempSync(join(tmpdir(), "ipo-ds-guest-"));
  const run = Bun.spawnSync(
    [process.execPath, "scripts/build.ts", "--pocket-only", `--outdir=${join(dir, "guest")}`, `--package-outdir=${dir}`],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (run.exitCode !== 0) throw new Error(`ipo-ds guest build failed\n${run.stdout}${run.stderr}`);
  built = { dir, js: join(dir, "guest", "ipo-ds-main.js"), pak: join(dir, "guest", "ipo-ds-main.pak") };
  return built;
}

export function disposeGuest(): void {
  if (built) rmSync(built.dir, { recursive: true, force: true });
  built = null;
}

export async function bootApp(extraGlobals?: Record<string, unknown>): Promise<BundleWorld> {
  const { js, pak } = buildGuest();
  return bootBundle({ js, pak, extraGlobals, viewport: { width: 400, height: 240, auxiliary: [320, 240] } });
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
```

- [ ] **Step 3: Write the failing test**

`tests/app.test.ts`:
```ts
import { afterAll, expect, test } from "bun:test";
import { bootApp, disposeGuest, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

test("both screens mount: the explorer on top, the now-playing deck below", async () => {
  const world = await bootApp();
  for (let frame = 0; frame < 5; frame++) world.step();
  expect(world.failure).toBeNull();
  expect(screenText(world, "primary")).toContain("iPoDS");
  expect(screenText(world, "auxiliary")).toContain("Nothing playing — pick a song above");
}, 120_000);
```

- [ ] **Step 4: Run it to verify it fails**

Run: `bun run test`
Expected: FAIL — auxiliary text is `""` (the scaffold renders nothing on the bottom screen) and the top shows `Count: 0`.

- [ ] **Step 5: Replace the scaffold with the two-screen shell**

`app/app.tsx`:
```tsx
// iPoDS — a walkman-style MP3 player. The top screen browses the library;
// the bottom screen is the now-playing deck.
import { AuxiliarySurface, Text, View } from "@pocketjs/framework/components";

export default function App() {
  return (
    <>
      <View class="w-full h-full flex-col items-center justify-center gap-2 bg-slate-950">
        <Text class="text-xl text-white font-bold">iPoDS</Text>
      </View>
      <AuxiliarySurface>
        <View class="w-full h-full flex-col items-center justify-center bg-slate-900">
          <Text class="text-sm text-slate-400">Nothing playing — pick a song above</Text>
        </View>
      </AuxiliarySurface>
    </>
  );
}
```

- [ ] **Step 6: Run tests and checks**

Run: `bun run test && bun run check && bun run 3ds --pocket-only`
Expected: 1 test PASS; no type errors; `dist/ipo-ds-main.pocket` written.

- [ ] **Step 7: Commit**

```bash
git add pocket.json package.json tsconfig.json scripts/build.ts app/app.tsx tests/support/app-world.ts tests/app.test.ts
git commit -m "feat: two-screen shell and headless sim harness"
```

---

### Task 7: Library model — indexes, folding, search

**Files:**
- Create: `app/library/normalize.ts`
- Create: `app/library/library.ts`
- Create: `tests/fixtures/tracks.ts`
- Test: `tests/library.test.ts` (create)

**Interfaces:**
- Consumes: `LocalTrack` type from `@pocketjs/framework/localmedia` (Task 4).
- Produces (used by Task 10 and Plan 3):
  - `normalize(text: string): string`
  - `interface Artist { key: string; name: string; trackIds: number[] }` (trackIds by album, track number, title)
  - `interface Album { key: string; name: string; artist: string; trackIds: number[] }` (trackIds by track number — 0 last — then title)
  - `interface Library { tracks: Map<number, LocalTrack>; songs: number[]; artists: Artist[]; albums: Album[] }`
  - `buildLibrary(tracks: readonly LocalTrack[]): Library`
  - `type View = { kind: "songs" } | { kind: "artists" } | { kind: "albums" } | { kind: "artist"; key: string } | { kind: "album"; key: string }`
  - `type Row = { kind: "song"; id: number } | { kind: "artist"; key: string } | { kind: "album"; key: string }`
  - `rows(library: Library, view: View, query: string): Row[]`
  - Keys: artist key = `normalize(artist)`; album key = `normalize(album) + "\u0000" + normalize(artist)`.
  - `TRACKS: LocalTrack[]` fixture in `tests/fixtures/tracks.ts`.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/tracks.ts`:
```ts
import type { LocalTrack } from "@pocketjs/framework/localmedia";

const t = (id: number, title: string, artist: string, album: string, track: number, durationMs = 180_000): LocalTrack =>
  ({ id, file: `${id}.mp3`, title, artist, album, track, durationMs, hasArt: false });

export const TRACKS: LocalTrack[] = [
  t(0, "One More Time", "Daft Punk", "Discovery", 1),
  t(1, "Aerodynamic", "Daft Punk", "Discovery", 2),
  t(2, "Digital Love", "Daft Punk", "Discovery", 3),
  t(3, "Hoppípolla", "Sigur Rós", "Takk...", 2),
  t(4, "Greatest Hit", "Beyoncé", "Greatest Hits", 1),
  t(5, "Another Hit", "Queen", "Greatest Hits", 1),
  t(6, "untitled-demo", "Unknown Artist", "Unknown Album", 0),
];
```

- [ ] **Step 2: Write the failing test**

`tests/library.test.ts`:
```ts
import { expect, test } from "bun:test";
import type { LocalTrack } from "@pocketjs/framework/localmedia";
import { buildLibrary, rows } from "../app/library/library.ts";
import { normalize } from "../app/library/normalize.ts";
import { TRACKS } from "./fixtures/tracks.ts";

const ids = (list: ReturnType<typeof rows>) => list.map((row) => (row.kind === "song" ? row.id : row.key));

test("normalize folds case, Latin accents, ligatures and whitespace", () => {
  expect(normalize("Beyoncé")).toBe("beyonce");
  expect(normalize("  Sigur   Rós ")).toBe("sigur ros");
  expect(normalize("Ærøskøbing")).toBe("aeroskobing");
  expect(normalize("Straße")).toBe("strasse");
  expect(normalize("MOTÖRHEAD")).toBe("motorhead");
  expect(normalize("Łódź Œuvre")).toBe("lodz oeuvre");
});

test("songs sort by folded title", () => {
  const library = buildLibrary(TRACKS);
  expect(library.songs).toEqual([1, 5, 2, 4, 3, 0, 6]);
  expect(library.tracks.get(3)!.title).toBe("Hoppípolla");
});

test("artists sort by folded name and list their songs by album, track, title", () => {
  const library = buildLibrary(TRACKS);
  expect(library.artists.map((a) => a.name)).toEqual(["Beyoncé", "Daft Punk", "Queen", "Sigur Rós", "Unknown Artist"]);
  expect(library.artists[1]).toEqual({ key: "daft punk", name: "Daft Punk", trackIds: [0, 1, 2] });
});

test("albums with the same name by different artists stay separate", () => {
  const library = buildLibrary(TRACKS);
  const hits = library.albums.filter((a) => a.name === "Greatest Hits");
  expect(hits.map((a) => a.artist)).toEqual(["Beyoncé", "Queen"]);
  expect(hits.map((a) => a.trackIds)).toEqual([[4], [5]]);
  expect(library.albums.map((a) => a.name)).toEqual(["Discovery", "Greatest Hits", "Greatest Hits", "Takk...", "Unknown Album"]);
});

test("album songs follow track number, unknown numbers last, then title", () => {
  const t = (id: number, title: string, track: number): LocalTrack =>
    ({ id, file: `${id}.mp3`, title, artist: "X", album: "A", track, durationMs: 1, hasArt: false });
  const library = buildLibrary([t(10, "B", 0), t(11, "A", 2), t(12, "C", 1), t(13, "A", 0)]);
  expect(library.albums[0]!.trackIds).toEqual([12, 11, 13, 10]);
});

test("blank tag strings fall back like missing tags", () => {
  const library = buildLibrary([{ id: 0, file: "demo take.mp3", title: " ", artist: "", album: "  ", track: 0, durationMs: 1, hasArt: false }]);
  expect(library.tracks.get(0)).toMatchObject({ title: "demo take", artist: "Unknown Artist", album: "Unknown Album" });
  expect(library.artists[0]!.name).toBe("Unknown Artist");
});

test("search folds accents and case, and a blank query shows everything", () => {
  const library = buildLibrary(TRACKS);
  expect(ids(rows(library, { kind: "songs" }, ""))).toEqual([1, 5, 2, 4, 3, 0, 6]);
  expect(ids(rows(library, { kind: "songs" }, "   "))).toEqual([1, 5, 2, 4, 3, 0, 6]);
  expect(ids(rows(library, { kind: "songs" }, "beyonce"))).toEqual([4]);
  expect(ids(rows(library, { kind: "songs" }, "DAFT"))).toEqual([1, 2, 0]);
  expect(ids(rows(library, { kind: "songs" }, "hoppipolla"))).toEqual([3]);
  expect(ids(rows(library, { kind: "artists" }, "rós"))).toEqual(["sigur ros"]);
  expect(ids(rows(library, { kind: "albums" }, "greatest"))).toEqual(["greatest hits\u0000beyonce", "greatest hits\u0000queen"]);
  expect(ids(rows(library, { kind: "songs" }, "zzz"))).toEqual([]);
});

test("drill-down views list the artist's or album's songs and filter them", () => {
  const library = buildLibrary(TRACKS);
  expect(ids(rows(library, { kind: "artist", key: "daft punk" }, ""))).toEqual([0, 1, 2]);
  expect(ids(rows(library, { kind: "album", key: "discovery\u0000daft punk" }, "love"))).toEqual([2]);
  expect(rows(library, { kind: "artist", key: "nobody" }, "")).toEqual([]);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test ./tests/library.test.ts`
Expected: FAIL — `Cannot find module '../app/library/library.ts'`.

- [ ] **Step 4: Implement folding**

`app/library/normalize.ts`:
```ts
// Search and sort keys: lowercase, Latin-1 and Latin Extended-A letters
// folded to ASCII, runs of whitespace collapsed. A fixed table rather than
// String.prototype.normalize, which the 3DS QuickJS build is not assumed to
// carry.
const GROUPS: readonly (readonly [string, string])[] = [
  ["a", "àáâãäåāăą"], ["c", "çćĉċč"], ["d", "ďđð"], ["e", "èéêëēĕėęě"], ["g", "ĝğġģ"],
  ["h", "ĥħ"], ["i", "ìíîïĩīĭįı"], ["j", "ĵ"], ["k", "ķĸ"], ["l", "ĺļľŀł"],
  ["n", "ñńņňŉŋ"], ["o", "òóôõöøōŏő"], ["r", "ŕŗř"], ["s", "śŝşšſ"], ["t", "ţťŧ"],
  ["u", "ùúûüũūŭůűų"], ["w", "ŵ"], ["y", "ýÿŷ"], ["z", "źżž"],
  ["ae", "æ"], ["oe", "œ"], ["ss", "ß"], ["th", "þ"],
];
const FOLD = new Map<string, string>();
for (const [ascii, letters] of GROUPS) for (const letter of letters) FOLD.set(letter, ascii);

export function normalize(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) out += FOLD.get(ch) ?? ch;
  return out.replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 5: Implement the library**

`app/library/library.ts`:
```ts
import type { LocalTrack } from "@pocketjs/framework/localmedia";
import { normalize } from "./normalize.ts";

export interface Artist { key: string; name: string; trackIds: number[] }
export interface Album { key: string; name: string; artist: string; trackIds: number[] }
export interface Library { tracks: Map<number, LocalTrack>; songs: number[]; artists: Artist[]; albums: Album[] }

export type View =
  | { kind: "songs" } | { kind: "artists" } | { kind: "albums" }
  | { kind: "artist"; key: string } | { kind: "album"; key: string };
export type Row = { kind: "song"; id: number } | { kind: "artist"; key: string } | { kind: "album"; key: string };

const stem = (file: string) => file.replace(/\.[^.]*$/, "");
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const albumKey = (album: string, artist: string) => `${normalize(album)}\u0000${normalize(artist)}`;
/** Track number order with unknown (0) after every numbered track. */
const trackOrder = (n: number) => (n > 0 ? n : Number.MAX_SAFE_INTEGER);

/** The host applies these fallbacks too; repeating them keeps a blank tag from any host out of the UI. */
function withFallbacks(track: LocalTrack): LocalTrack {
  return {
    ...track,
    title: track.title.trim() || stem(track.file),
    artist: track.artist.trim() || "Unknown Artist",
    album: track.album.trim() || "Unknown Album",
  };
}

export function buildLibrary(input: readonly LocalTrack[]): Library {
  const tracks = new Map<number, LocalTrack>();
  const titleKey = new Map<number, string>();
  for (const raw of input) {
    const track = withFallbacks(raw);
    tracks.set(track.id, track);
    titleKey.set(track.id, normalize(track.title));
  }
  const byTitle = (a: number, b: number) => compare(titleKey.get(a)!, titleKey.get(b)!) || a - b;
  const byAlbumTrack = (a: number, b: number) => {
    const x = tracks.get(a)!, y = tracks.get(b)!;
    return trackOrder(x.track) - trackOrder(y.track) || byTitle(a, b);
  };

  const artistMap = new Map<string, Artist>();
  const albumMap = new Map<string, Album>();
  for (const track of tracks.values()) {
    const aKey = normalize(track.artist);
    const artist = artistMap.get(aKey) ?? { key: aKey, name: track.artist, trackIds: [] };
    artist.trackIds.push(track.id);
    artistMap.set(aKey, artist);
    const bKey = albumKey(track.album, track.artist);
    const album = albumMap.get(bKey) ?? { key: bKey, name: track.album, artist: track.artist, trackIds: [] };
    album.trackIds.push(track.id);
    albumMap.set(bKey, album);
  }

  const albums = [...albumMap.values()].sort((a, b) => compare(a.key, b.key));
  for (const album of albums) album.trackIds.sort(byAlbumTrack);
  const albumRank = new Map<number, number>();
  albums.forEach((album, rank) => album.trackIds.forEach((id) => albumRank.set(id, rank)));

  const artists = [...artistMap.values()].sort((a, b) => compare(a.key, b.key));
  for (const artist of artists) artist.trackIds.sort((a, b) => albumRank.get(a)! - albumRank.get(b)! || byAlbumTrack(a, b));

  return { tracks, songs: [...tracks.keys()].sort(byTitle), artists, albums };
}

function songMatches(track: LocalTrack, query: string): boolean {
  return normalize(track.title).includes(query) || normalize(track.artist).includes(query) || normalize(track.album).includes(query);
}

export function rows(library: Library, view: View, query: string): Row[] {
  const q = normalize(query);
  const songs = (list: readonly number[]): Row[] =>
    list.filter((id) => q === "" || songMatches(library.tracks.get(id)!, q)).map((id) => ({ kind: "song", id }));
  switch (view.kind) {
    case "songs":
      return songs(library.songs);
    case "artists":
      return library.artists.filter((a) => q === "" || a.key.includes(q)).map((a) => ({ kind: "artist", key: a.key }));
    case "albums":
      return library.albums.filter((a) => q === "" || normalize(a.name).includes(q)).map((a) => ({ kind: "album", key: a.key }));
    case "artist":
      return songs(library.artists.find((a) => a.key === view.key)?.trackIds ?? []);
    case "album":
      return songs(library.albums.find((a) => a.key === view.key)?.trackIds ?? []);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test ./tests/library.test.ts && bun run check`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/library/normalize.ts app/library/library.ts tests/fixtures/tracks.ts tests/library.test.ts
git commit -m "feat(library): song, artist and album indexes with accent-folding search"
```

---

### Task 8: Player reducer — queue, shuffle, repeat, auto-advance

**Files:**
- Create: `app/player/reducer.ts`
- Test: `tests/player.test.ts` (create)

**Interfaces:**
- Consumes: `LocalStatus` type from `@pocketjs/framework/localmedia`.
- Produces (used by Task 9 and Plan 3):
  - `type Repeat = "off" | "all" | "one"`
  - `interface PlayerState { queue: readonly number[]; order: readonly number[]; index: number; shuffle: boolean; repeat: Repeat; status: LocalStatus; failures: number }`
  - `type PlayerAction = { type: "playFrom"; ids: readonly number[]; startId: number } | { type: "toggle" } | { type: "next" } | { type: "prev" } | { type: "seek"; ms: number } | { type: "toggleShuffle" } | { type: "cycleRepeat" } | { type: "hostStatus"; status: LocalStatus }`
  - `type PlayerCommand = { type: "open"; id: number } | { type: "paused"; value: boolean } | { type: "seek"; ms: number }`
  - `reducePlayer(state, action, random?: () => number): { state: PlayerState; commands: PlayerCommand[] }`
  - `initialPlayer(): PlayerState`, `currentId(state): number` (-1 when none), `shuffled(ids, random): number[]`, `IDLE_STATUS: LocalStatus`, `RESTART_THRESHOLD_MS = 3000`

- [ ] **Step 1: Write the failing test**

`tests/player.test.ts`:
```ts
import { expect, test } from "bun:test";
import type { LocalStatus } from "@pocketjs/framework/localmedia";
import {
  IDLE_STATUS, currentId, initialPlayer, reducePlayer, shuffled,
  type PlayerAction, type PlayerState,
} from "../app/player/reducer.ts";

const zero = () => 0;
const status = (over: Partial<LocalStatus>): LocalStatus => ({ ...IDLE_STATUS, ...over });
function run(state: PlayerState, ...actions: PlayerAction[]) {
  let commands: unknown[] = [];
  for (const action of actions) ({ state, commands } = reducePlayer(state, action, zero));
  return { state, commands };
}
const playing = (ids: number[], startId: number, over: Partial<PlayerState> = {}) =>
  run({ ...initialPlayer(), ...over }, { type: "playFrom", ids, startId }).state;

test("shuffled is Fisher–Yates driven by the given random source", () => {
  expect(shuffled([1, 2, 3], zero)).toEqual([2, 3, 1]);
  expect(shuffled([], zero)).toEqual([]);
});

test("playing a song snapshots the visible list as the queue and opens the song", () => {
  const { state, commands } = run(initialPlayer(), { type: "playFrom", ids: [5, 6, 7], startId: 6 });
  expect(state).toMatchObject({ queue: [5, 6, 7], order: [5, 6, 7], index: 1 });
  expect(commands).toEqual([{ type: "open", id: 6 }]);
  const ignored = run(initialPlayer(), { type: "playFrom", ids: [5], startId: 9 });
  expect(ignored.commands).toEqual([]);
  expect(currentId(ignored.state)).toBe(-1);
});

test("with shuffle on, the chosen song plays first and the rest is shuffled", () => {
  const state = playing([0, 1, 2, 3], 0, { shuffle: true });
  expect(state).toMatchObject({ queue: [0, 1, 2, 3], order: [0, 2, 3, 1], index: 0 });
});

test("shuffle keeps the current song first; turning it off restores list order at the current song", () => {
  let state = playing([0, 1, 2, 3], 2);
  state = run(state, { type: "toggleShuffle" }).state;
  expect(state).toMatchObject({ shuffle: true, order: [2, 1, 3, 0], index: 0 });
  state = run(state, { type: "toggleShuffle" }).state;
  expect(state).toMatchObject({ shuffle: false, order: [0, 1, 2, 3], index: 2 });
});

test("next walks the queue; at the end it stops with repeat off and wraps with repeat all", () => {
  let state = playing([0, 1], 0);
  let out = run(state, { type: "next" });
  expect(out.commands).toEqual([{ type: "open", id: 1 }]);
  state = out.state;
  expect(run(state, { type: "next" }).commands).toEqual([]);
  expect(run({ ...state, repeat: "all" }, { type: "next" }).commands).toEqual([{ type: "open", id: 0 }]);
  expect(run({ ...state, repeat: "one" }, { type: "next" }).commands).toEqual([]);
});

test("previous restarts after 3 s, otherwise opens the previous song", () => {
  const state = playing([0, 1, 2], 1);
  expect(run({ ...state, status: status({ trackId: 1, phase: "playing", positionMs: 3001 }) }, { type: "prev" }).commands)
    .toEqual([{ type: "seek", ms: 0 }]);
  expect(run({ ...state, status: status({ trackId: 1, phase: "playing", positionMs: 3000 }) }, { type: "prev" }).commands)
    .toEqual([{ type: "open", id: 0 }]);
});

test("previous on the first song restarts it, or wraps to the last with repeat all", () => {
  const state = playing([0, 1, 2], 0);
  expect(run(state, { type: "prev" }).commands).toEqual([{ type: "seek", ms: 0 }]);
  expect(run({ ...state, repeat: "all" }, { type: "prev" }).commands).toEqual([{ type: "open", id: 2 }]);
});

test("an ended song advances; repeat one replays it; the last song stops at 0:00 or wraps", () => {
  const ended = (id: number) => ({ type: "hostStatus", status: status({ trackId: id, phase: "ended", positionMs: 1000, durationMs: 1000 }) }) as const;
  expect(run(playing([0, 1], 0), ended(0)).commands).toEqual([{ type: "open", id: 1 }]);
  expect(run(playing([0, 1], 0, { repeat: "one" }), ended(0)).commands).toEqual([{ type: "open", id: 0 }]);
  expect(run(playing([0, 1], 1), ended(1)).commands).toEqual([{ type: "seek", ms: 0 }, { type: "paused", value: true }]);
  expect(run(playing([0, 1], 1, { repeat: "all" }), ended(1)).commands).toEqual([{ type: "open", id: 0 }]);
});

test("a status for another track is stored but never acted on", () => {
  const stale = status({ trackId: 0, phase: "ended" });
  const { state, commands } = run(playing([0, 1], 1), { type: "hostStatus", status: stale });
  expect(commands).toEqual([]);
  expect(state.status).toEqual(stale);
  expect(state.index).toBe(1);
});

test("an error skips forward without retrying under repeat one, and an all-failing queue stops", () => {
  const error = (id: number) => ({ type: "hostStatus", status: status({ trackId: id, phase: "error", error: "bad" }) }) as const;
  let out = run(playing([0, 1, 2], 0, { repeat: "one" }), error(0));
  expect(out.commands).toEqual([{ type: "open", id: 1 }]);
  out = run(playing([0, 1, 2], 0, { repeat: "all" }), error(0), error(1));
  expect(out.commands).toEqual([{ type: "open", id: 2 }]);
  const stopped = run(out.state, error(2));
  expect(stopped.commands).toEqual([]);
  expect(stopped.state.failures).toBe(3);
  const recovered = run(out.state, { type: "hostStatus", status: status({ trackId: 2, phase: "playing" }) });
  expect(recovered.state.failures).toBe(0);
});

test("toggle pauses, resumes, and reopens a song the host is not holding", () => {
  const state = playing([0, 1], 0);
  expect(run({ ...state, status: status({ trackId: 0, phase: "playing" }) }, { type: "toggle" }).commands).toEqual([{ type: "paused", value: true }]);
  expect(run({ ...state, status: status({ trackId: 0, phase: "loading" }) }, { type: "toggle" }).commands).toEqual([{ type: "paused", value: true }]);
  expect(run({ ...state, status: status({ trackId: 0, phase: "paused" }) }, { type: "toggle" }).commands).toEqual([{ type: "paused", value: false }]);
  expect(run({ ...state, status: status({ trackId: -1, phase: "idle" }) }, { type: "toggle" }).commands).toEqual([{ type: "open", id: 0 }]);
});

test("seek is clamped to the song and ignored when the host holds another song", () => {
  const state = { ...playing([0], 0), status: status({ trackId: 0, phase: "playing", durationMs: 5000 }) };
  expect(run(state, { type: "seek", ms: 9999 }).commands).toEqual([{ type: "seek", ms: 5000 }]);
  expect(run(state, { type: "seek", ms: -10 }).commands).toEqual([{ type: "seek", ms: 0 }]);
  expect(run(state, { type: "seek", ms: NaN }).commands).toEqual([{ type: "seek", ms: 0 }]);
  expect(run({ ...state, status: status({ trackId: 3 }) }, { type: "seek", ms: 10 }).commands).toEqual([]);
});

test("repeat cycles off, all, one, off", () => {
  let state = initialPlayer();
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    state = run(state, { type: "cycleRepeat" }).state;
    seen.push(state.repeat);
  }
  expect(seen).toEqual(["all", "one", "off"]);
});

test("transport actions with nothing queued do nothing", () => {
  for (const action of [{ type: "next" }, { type: "prev" }, { type: "toggle" }, { type: "seek", ms: 5 },
    { type: "hostStatus", status: status({ phase: "ended", trackId: 0 }) }] as PlayerAction[]) {
    expect(run(initialPlayer(), action).commands).toEqual([]);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/player.test.ts`
Expected: FAIL — `Cannot find module '../app/player/reducer.ts'`.

- [ ] **Step 3: Implement**

`app/player/reducer.ts`:
```ts
// The player as a pure function: (state, action) -> (state, commands). The
// host adapter runs the commands against media.local and feeds each status
// snapshot back as a hostStatus action.
import type { LocalStatus } from "@pocketjs/framework/localmedia";

export type Repeat = "off" | "all" | "one";
export interface PlayerState {
  /** The list the user played from, in its original order. */
  queue: readonly number[];
  /** The play order: queue, or queue shuffled with the current song first. */
  order: readonly number[];
  /** Position in order; -1 before anything plays. */
  index: number;
  shuffle: boolean;
  repeat: Repeat;
  /** The last host snapshot. */
  status: LocalStatus;
  /** Consecutive songs that failed to play. */
  failures: number;
}
export type PlayerAction =
  | { type: "playFrom"; ids: readonly number[]; startId: number }
  | { type: "toggle" } | { type: "next" } | { type: "prev" }
  | { type: "seek"; ms: number }
  | { type: "toggleShuffle" } | { type: "cycleRepeat" }
  | { type: "hostStatus"; status: LocalStatus };
export type PlayerCommand = { type: "open"; id: number } | { type: "paused"; value: boolean } | { type: "seek"; ms: number };
export interface Reduced { state: PlayerState; commands: PlayerCommand[] }

export const RESTART_THRESHOLD_MS = 3000;
export const IDLE_STATUS: LocalStatus = Object.freeze({
  phase: "idle", trackId: -1, positionMs: 0, durationMs: 0, scanning: false, scanGeneration: 0, underruns: 0, error: "",
});

export function initialPlayer(): PlayerState {
  return { queue: [], order: [], index: -1, shuffle: false, repeat: "off", status: IDLE_STATUS, failures: 0 };
}

export function currentId(state: PlayerState): number {
  return state.index >= 0 ? state.order[state.index]! : -1;
}

/** Fisher–Yates over a copy; `random` returns [0, 1). */
export function shuffled(ids: readonly number[], random: () => number): number[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const none = (state: PlayerState): Reduced => ({ state, commands: [] });
const openAt = (state: PlayerState, index: number): Reduced =>
  ({ state: { ...state, index }, commands: [{ type: "open", id: state.order[index]! }] });

/** auto: the host finished or failed the song; failed: it failed. */
function advance(state: PlayerState, auto: boolean, failed: boolean): Reduced {
  if (auto && !failed && state.repeat === "one") return openAt(state, state.index);
  if (state.index + 1 < state.order.length) return openAt(state, state.index + 1);
  if (state.repeat === "all") return openAt(state, 0);
  if (!auto || failed) return none(state);
  return { state, commands: [{ type: "seek", ms: 0 }, { type: "paused", value: true }] };
}

export function reducePlayer(state: PlayerState, action: PlayerAction, random: () => number = Math.random): Reduced {
  switch (action.type) {
    case "playFrom": {
      if (!action.ids.includes(action.startId)) return none(state);
      const queue = [...action.ids];
      const order = state.shuffle
        ? [action.startId, ...shuffled(queue.filter((id) => id !== action.startId), random)]
        : queue;
      return openAt({ ...state, queue, order, failures: 0 }, order.indexOf(action.startId));
    }
    case "toggle": {
      if (state.index < 0) return none(state);
      const { phase, trackId } = state.status;
      if (trackId !== currentId(state) || phase === "idle" || phase === "error" || phase === "ended") return openAt(state, state.index);
      if (phase === "paused") return { state, commands: [{ type: "paused", value: false }] };
      return { state, commands: [{ type: "paused", value: true }] };
    }
    case "next":
      return state.index < 0 ? none(state) : advance({ ...state, failures: 0 }, false, false);
    case "prev": {
      if (state.index < 0) return none(state);
      const restart = state.status.trackId === currentId(state) && state.status.positionMs > RESTART_THRESHOLD_MS;
      if (!restart && state.index > 0) return openAt(state, state.index - 1);
      if (!restart && state.repeat === "all") return openAt(state, state.order.length - 1);
      return { state, commands: [{ type: "seek", ms: 0 }] };
    }
    case "seek": {
      if (state.index < 0 || state.status.trackId !== currentId(state)) return none(state);
      const max = state.status.durationMs > 0 ? state.status.durationMs : Number.MAX_SAFE_INTEGER;
      const ms = Number.isFinite(action.ms) ? Math.round(action.ms) : 0;
      return { state, commands: [{ type: "seek", ms: Math.min(max, Math.max(0, ms)) }] };
    }
    case "toggleShuffle": {
      const id = currentId(state);
      if (state.shuffle) return none({ ...state, shuffle: false, order: state.queue, index: id < 0 ? -1 : state.queue.indexOf(id) });
      const rest = shuffled(state.queue.filter((queued) => queued !== id), random);
      return none({ ...state, shuffle: true, order: id < 0 ? rest : [id, ...rest], index: id < 0 ? -1 : 0 });
    }
    case "cycleRepeat":
      return none({ ...state, repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" });
    case "hostStatus": {
      const next = { ...state, status: action.status };
      if (state.index < 0 || action.status.trackId !== currentId(state)) return none(next);
      if (action.status.phase === "playing") return none({ ...next, failures: 0 });
      if (action.status.phase === "ended") return advance({ ...next, failures: 0 }, true, false);
      if (action.status.phase === "error") {
        const failures = state.failures + 1;
        if (failures >= state.order.length) return none({ ...next, failures });
        return advance({ ...next, failures }, true, true);
      }
      return none(next);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test ./tests/player.test.ts && bun run check`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/player/reducer.ts tests/player.test.ts
git commit -m "feat(player): queue, shuffle, repeat and auto-advance reducer"
```

---

### Task 9: Player controller over `media.local`

**Files:**
- Create: `app/player/controller.ts`
- Test: `tests/controller.test.ts` (create)

**Interfaces:**
- Consumes: `reducePlayer`, `initialPlayer`, `PlayerAction`, `PlayerCommand`, `PlayerState` (Task 8); `LocalMedia` (Task 4); `createSimLocalMedia` (Task 5, tests only).
- Produces (used by Plan 3's screens):
  - `runCommands(media: LocalMedia, commands: readonly PlayerCommand[]): void`
  - `createPlayerController(media: LocalMedia, options?: { random?: () => number; onChange?: (state: PlayerState) => void }): PlayerController`
  - `PlayerController { state(): PlayerState; dispatch(action: PlayerAction): void; poll(): void }` — `poll()` is called once per frame; `dispatch` re-reads status after issuing commands so the UI never sees the previous song's snapshot.

- [ ] **Step 1: Write the failing test**

`tests/controller.test.ts`:
```ts
import { expect, test } from "bun:test";
import { localMedia } from "@pocketjs/framework/localmedia";
import { createSimLocalMedia, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { createPlayerController } from "../app/player/controller.ts";

const song = (file: string, extra: Partial<SimLocalTrack> = {}): SimLocalTrack => ({ file, durationMs: 1000, ...extra });

function setup(library: SimLocalTrack[]) {
  const host = createSimLocalMedia(library);
  const media = localMedia(host.ns);
  media.scan();
  const changes: number[] = [];
  const player = createPlayerController(media, { random: () => 0, onChange: (s) => changes.push(s.status.trackId) });
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) {
      host.advance(100);
      player.poll();
    }
  };
  return { host, player, frames, changes };
}

test("dispatch shows the new song's snapshot before the next frame", () => {
  const { player, changes } = setup([song("a.mp3"), song("b.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1], startId: 1 });
  expect(player.state().status).toMatchObject({ trackId: 1, phase: "loading" });
  expect(changes).toEqual([1]);
});

test("a queue plays through and stops on its last song at 0:00", () => {
  const { host, player, frames } = setup([song("a.mp3"), song("b.mp3"), song("c.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1, 2], startId: 0 });
  frames(40);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(1)", "open(2)"]);
  expect(player.state().status).toMatchObject({ trackId: 2, phase: "paused", positionMs: 0 });
});

test("a corrupt file in the queue is skipped", () => {
  const { host, player, frames } = setup([song("a.mp3"), song("bad.mp3", { corrupt: true }), song("c.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1, 2], startId: 0 });
  frames(15);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(1)", "open(2)"]);
  expect(player.state().status).toMatchObject({ trackId: 2, phase: "playing" });
});

test("an all-corrupt queue under repeat all stops instead of cycling", () => {
  const { host, player, frames } = setup([song("x.mp3", { corrupt: true }), song("y.mp3", { corrupt: true })]);
  player.dispatch({ type: "cycleRepeat" });
  player.dispatch({ type: "playFrom", ids: [0, 1], startId: 0 });
  frames(20);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(1)"]);
});

test("seek and toggle reach the host", () => {
  const { player, frames } = setup([song("a.mp3", { durationMs: 10_000 })]);
  player.dispatch({ type: "playFrom", ids: [0], startId: 0 });
  frames(1);
  player.dispatch({ type: "seek", ms: 5000 });
  expect(player.state().status.positionMs).toBe(5000);
  player.dispatch({ type: "toggle" });
  expect(player.state().status.phase).toBe("paused");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test ./tests/controller.test.ts`
Expected: FAIL — `Cannot find module '../app/player/controller.ts'`.

- [ ] **Step 3: Implement**

`app/player/controller.ts`:
```ts
// Runs the player reducer against the host's local media module. The UI
// calls poll() once per frame and dispatch() for user actions; after a
// dispatch that issued commands, the status is read again so the UI never
// renders the previous song's snapshot for a frame.
import type { LocalMedia } from "@pocketjs/framework/localmedia";
import { initialPlayer, reducePlayer, type PlayerAction, type PlayerCommand, type PlayerState } from "./reducer.ts";

export interface PlayerController {
  state(): PlayerState;
  dispatch(action: PlayerAction): void;
  poll(): void;
}

export function runCommands(media: LocalMedia, commands: readonly PlayerCommand[]): void {
  for (const command of commands) {
    if (command.type === "open") media.open(command.id);
    else if (command.type === "paused") media.pause(command.value);
    else media.seek(command.ms);
  }
}

export function createPlayerController(
  media: LocalMedia,
  options: { random?: () => number; onChange?: (state: PlayerState) => void } = {},
): PlayerController {
  const random = options.random ?? Math.random;
  let state = initialPlayer();
  const apply = (action: PlayerAction): number => {
    const reduced = reducePlayer(state, action, random);
    state = reduced.state;
    runCommands(media, reduced.commands);
    return reduced.commands.length;
  };
  return {
    state: () => state,
    dispatch(action) {
      if (apply(action) > 0) apply({ type: "hostStatus", status: media.status() });
      options.onChange?.(state);
    },
    poll() {
      apply({ type: "hostStatus", status: media.status() });
      options.onChange?.(state);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test ./tests/controller.test.ts ./tests/player.test.ts && bun run check`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/player/controller.ts tests/controller.test.ts
git commit -m "feat(player): controller that runs the reducer against media.local"
```

---

### Task 10: Scan the library at launch

**Files:**
- Create: `app/library/status.ts`
- Modify: `app/app.tsx`
- Test: `tests/app.test.ts` (add tests), `tests/library.test.ts` (add one test)

**Interfaces:**
- Consumes: `localMedia`, `LOCALMEDIA`, `LocalTrack` (Task 4); `onFrame` from `@pocketjs/framework/lifecycle`; `bootApp`, `screenText` (Task 6); `createSimLocalMedia` (Task 5).
- Produces: `libraryLine(available: boolean, scanning: boolean, count: number): string`; an app that calls `scan()` once at launch and re-reads `tracks()` whenever `scanGeneration` changes — Plan 3 replaces the status line with the Explorer but keeps this loading pattern.

- [ ] **Step 1: Write the failing tests**

Append to `tests/library.test.ts`:
```ts
import { libraryLine } from "../app/library/status.ts";

test("the library status line covers no host, scanning, empty and counted", () => {
  expect(libraryLine(false, false, 0)).toBe("Music playback is unavailable on this build");
  expect(libraryLine(true, true, 0)).toBe("Scanning sdmc:/music/…");
  expect(libraryLine(true, false, 0)).toBe("No music found in sdmc:/music/");
  expect(libraryLine(true, false, 1)).toBe("1 track");
  expect(libraryLine(true, false, 312)).toBe("312 tracks");
});
```
(Move the new `import` line to the top of the file with the other imports.)

Append to `tests/app.test.ts` (add the import at the top):
```ts
import { createSimLocalMedia } from "../runtime/hosts/sim/localmedia.ts";

test("a build without media.local says so", async () => {
  const world = await bootApp();
  for (let frame = 0; frame < 3; frame++) world.step();
  expect(screenText(world, "primary")).toContain("Music playback is unavailable on this build");
}, 120_000);

test("the library is scanned once at launch and counted when the scan completes", async () => {
  const host = createSimLocalMedia([{ file: "a.mp3", durationMs: 1000 }, { file: "b.mp3", durationMs: 1000 }], { scanMs: 100 });
  const world = await bootApp({ localmedia: host.ns });
  world.step();
  expect(screenText(world, "primary")).toContain("Scanning sdmc:/music/…");
  host.advance(100);
  world.step();
  world.step();
  expect(world.failure).toBeNull();
  expect(screenText(world, "primary")).toContain("2 tracks");
  expect(host.log.filter((entry) => entry === "scan()")).toHaveLength(1);
}, 120_000);

test("an empty music folder is reported", async () => {
  const host = createSimLocalMedia([]);
  const world = await bootApp({ localmedia: host.ns });
  for (let frame = 0; frame < 3; frame++) world.step();
  expect(screenText(world, "primary")).toContain("No music found in sdmc:/music/");
}, 120_000);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test`
Expected: FAIL — `Cannot find module '../app/library/status.ts'`, and the app tests do not find the status lines.

- [ ] **Step 3: Implement the status line**

`app/library/status.ts`:
```ts
import { LOCALMEDIA } from "@pocketjs/framework/localmedia";

/** The top screen's library line until the Explorer replaces it. */
export function libraryLine(available: boolean, scanning: boolean, count: number): string {
  if (!available) return "Music playback is unavailable on this build";
  if (scanning) return `Scanning ${LOCALMEDIA.root}…`;
  if (count === 0) return `No music found in ${LOCALMEDIA.root}`;
  return `${count} ${count === 1 ? "track" : "tracks"}`;
}
```

- [ ] **Step 4: Scan at launch**

`app/app.tsx`:
```tsx
// iPoDS — a walkman-style MP3 player. The top screen browses the library;
// the bottom screen is the now-playing deck.
import { createSignal } from "solid-js";
import { AuxiliarySurface, Text, View } from "@pocketjs/framework/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { localMedia, type LocalMedia, type LocalTrack } from "@pocketjs/framework/localmedia";
import { libraryLine } from "./library/status.ts";

/** The host's local media module, or null on a build without media.local. */
function connect(): LocalMedia | null {
  try {
    return localMedia();
  } catch {
    return null;
  }
}

export default function App() {
  const media = connect();
  const [tracks, setTracks] = createSignal<LocalTrack[]>([]);
  const [scanning, setScanning] = createSignal(media !== null);
  if (media) {
    let generation = 0;
    media.scan();
    onFrame(() => {
      const status = media.status();
      setScanning(status.scanning);
      if (status.scanGeneration !== generation) {
        generation = status.scanGeneration;
        setTracks(media.tracks());
      }
    });
  }
  return (
    <>
      <View class="w-full h-full flex-col items-center justify-center gap-2 bg-slate-950">
        <Text class="text-xl text-white font-bold">iPoDS</Text>
        <Text class="text-sm text-slate-400">{libraryLine(media !== null, scanning(), tracks().length)}</Text>
      </View>
      <AuxiliarySurface>
        <View class="w-full h-full flex-col items-center justify-center bg-slate-900">
          <Text class="text-sm text-slate-400">Nothing playing — pick a song above</Text>
        </View>
      </AuxiliarySurface>
    </>
  );
}
```

- [ ] **Step 5: Run the whole gate**

Run: `bun run test && bun run check && bun run 3ds --pocket-only`
Expected: every ipo-ds test PASS; no type errors; `dist/ipo-ds-main.pocket` written.

- [ ] **Step 6: Commit**

```bash
git add app/library/status.ts app/app.tsx tests/library.test.ts tests/app.test.ts
git commit -m "feat: scan the music folder at launch and report the library"
```

---

## Plan 1 exit gate

- ipo-ds: `bun run test`, `bun run check`, `bun run 3ds --pocket-only` green on the fork pin.
- Fork: `cd runtime && bun test tests/3ds-arguments.test.ts tests/localmedia.test.ts tests/localmedia-sim.test.ts tests/platform-contracts.test.ts tests/3ds-profile.test.ts` green; `tests/sim-bundle.test.ts -t extraGlobals` green.
- Next: write Plan 2 (visual design) per the roadmap; Plan 4 (native) can start in parallel from the Task 4 contract.
