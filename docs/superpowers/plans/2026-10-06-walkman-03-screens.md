# iPoDS Walkman — Plan 3: Explorer and Now Playing Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scanning shell with the real two-screen app.
- The top screen is the Explorer: tabs, drill-down, search, held-D-pad focus and rescan.
- The bottom screen is Now Playing: live info with marquee, drag-to-seek and touch transport.
- Both are built from the Plan 2 Aqua parts, wired to the library model and player controller, and run against the `media.local` sim fake.

**Architecture:**
- **Pure modules, unit-tested first:**
  - `app/format.ts`, `app/library/compose.ts`, player `prune`;
  - `app/explorer/model.ts` (Explorer state, reducer and selectors);
  - `app/input-timing.ts` and the marquee phase in `geometry.ts`.
- **Thin Solid layers:**
  - `app/session.ts` turns host status into signals;
  - `app/input.ts` holds the frame-driven button helpers;
  - `app/explorer/explorer.tsx`, `app/now-playing/now-playing.tsx` and `app/search.tsx` render through the theme parts;
  - `app/app.tsx` mounts both screens.
- **Fork change:** `media.local` ids become stable per file across rescans.

**Tech Stack:** Bun, TypeScript, SolidJS via `@pocketjs/framework` (`VirtualList`, `createGesture`, `createMediaScrubber`, `createOsk`/`Osk`, `onFrame`, `measureText`), PocketJS sim (WASM core), git submodule fork.

**Spec:** `docs/superpowers/specs/2026-10-06-walkman-screens-design.md` (parents: `…-walkman-player-design.md` §5, `…-walkman-visual-design.md`)

**Provenance:** this exact file set was built and run before the plan was written. Every task was then rehearsed in order on a clean tree, and the cumulative ipo-ds test counts below come from that run:

| After task | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Tests | 63 | 66 | 69 | 70 | 79 | 83 | 84 | 90 | 90 | 92 |

Fork: 12/12 `localmedia` tests, with the typecheck clean.

## Global Constraints

- Framework code changes go in the fork (`runtime/`, branch `ipo-ds`). **Pushing the fork is outward-facing: confirm with the user before the first push of this plan.**
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives/control flow from `solid-js`. Never run bare `bun test` at the repo root; use `bun run test` / `bun test ./tests/…`.
- Conventional Commits with the session's attribution trailer. `dist/` stays out of Git.
- **Class strings stay complete literals.** Text is single-line. Boxes default to `flex-row`. Borders paint inside a box without insetting content.
- **Framework behaviours this plan relies on** (each was found while prototyping; do not "simplify" them away):
  1. **`AuxiliarySurface` doesn't track a lone reactive child.** A bare `<Show>` as its only child renders once. Wrap the child in a `View`.
  2. **A `View`'s `onPress` fires on the focused node's A press, not on touch.** Bottom-screen touch buttons need `createGesture({ surface: "auxiliary", region: { node }, onTap })`.
  3. **`VirtualList` scrolls itself on held D-pad unless `inputActive` returns false.** The Explorer owns focus and scrolling, so it passes `inputActive={() => false}` and calls `scrollToIndex(focus, "nearest", false)`.
  4. **The `Osk` keyboard slides in and rests at the top of its parent box,** about 206 px tall at key height 43. It needs its own box below the search field, and `oskKeyHeight` 45 fills the 214 px below the field. Tests judge it after about 60 frames, never mid-slide.
  5. **Text measurement uses literal font slots** (`app/theme/fonts.ts`), with a test asserting they equal `fontSlotFor`.
- 3DS face buttons map by position: **A = `BTN.CIRCLE`, B = `CROSS`, X = `TRIANGLE`, Y = `SQUARE`**.
- **Target: Old and New 3DS.** ZL/ZR (and the C-stick) exist only on the New 3DS; the host leaves those bits unset on an Old 3DS. Every action needs a path without them, which is why Task 10 adds the Y + L/R skip chord. Keep per-frame work small: the Old 3DS runs the QuickJS guest at 268 MHz with no L2 cache.
- Timing is in virtual frames at 60 Hz:
  - repeat: 300 ms delay (18 frames), then 80 ms (5 frames);
  - hold: 60 frames;
  - marquee: 90-frame hold, 0.5 px per frame, 90-frame hold.

## Review Focus

- **A rescan removes the playing song's file:** playback continues and Now Playing keeps showing that song; the vanished id drops from the queue. Pinned in Task 8 ("holding X rescans…", which removes the playing `dp-02.mp3`).
- **Holding a direction on the D-pad:** focus repeats, and the focused row stays inside the list; the list's own D-pad scrolling must not add to it. Pinned in Task 8 ("a held D-pad repeats…").
- **The search keyboard at rest** (after its slide-in) sits below the field and reaches the foot of the screen, in the app and in the gallery. Pinned in Task 8 ("X opens the keyboard…", settled pixel checks) and Task 9 (gallery search test).
- **Bottom-screen transport buttons answer touch taps,** and disabled ones (idle) ignore them. Pinned in Task 8 ("transport taps…").
- **Tags with decomposed accents display composed;** an empty card's LCD reads "0 songs", not "0 songs · 0 min". Pinned in Task 3 and Task 8.
- **On an Old 3DS (no ZL/ZR), holding Y + L/R skips songs** without switching tabs, and a Y + L/R chord never also reveals on release. Pinned in Task 10 (unit and app tests).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `runtime/contracts/spec/localmedia.ts`, `runtime/hosts/sim/localmedia.ts`, `runtime/tests/localmedia*.test.ts` | ids stable per file; `setLibrary` test hook; typed test status | 1 |
| `app/format.ts` | `formatTime`, `formatRemaining`, `needsHours` | 2 |
| `scripts/gen-compose-table.ts`, `app/library/compose-table.ts` (generated), `app/library/compose.ts` | `composeMarks` | 3 |
| `app/player/reducer.ts` | `prune` action | 4 |
| `app/explorer/model.ts` | Explorer state, reducer, selectors | 5 |
| `app/input-timing.ts`, `app/theme/geometry.ts` | `repeatFires`, `stepHold`, `stepAnalog`; `marqueeOffset` | 6 |
| `app/theme/fonts.ts`, `app/theme/parts/marquee.tsx`, theme and part edits | `Marquee`; wide seek cells; seek ref; transport touch; row and LCD marquee | 7 |
| `app/session.ts`, `app/input.ts`, `app/search.tsx`, `app/explorer/explorer.tsx`, `app/now-playing/now-playing.tsx`, `app/app.tsx` | the live app | 8 |
| `app/gallery/states.tsx`, `scripts/gallery.ts` | gallery reuses the app's search screen; settled captures | 9 |
| tests | `format`, `compose`, `explorer-model`, `input-timing`, `marquee`, `app` (rewritten), `fixtures/library.ts`, and edits to `player`, `geometry`, `gallery`, `library` | 2–9 |

**Applying a patch step:** save the block to a file outside the repo (e.g. `$TMPDIR/tN.patch`) and run `git apply $TMPDIR/tN.patch` from the repo root, or `git -C runtime apply …` for fork patches. Every patch was checked with `git apply --check` against the state the previous task leaves.

---

### Task 1: `media.local` ids stable per file (fork)

**Files:**
- Modify: `runtime/contracts/spec/localmedia.ts` (id and `open` doc)
- Modify: `runtime/hosts/sim/localmedia.ts`: id map per file, `setLibrary(next)`, lookups by id
- Modify: `runtime/tests/localmedia-sim.test.ts` (new test), `runtime/tests/localmedia.test.ts` (type `STATUS` as `LocalStatus`; fixes a typecheck error carried over from Plan 1)

**Interfaces:**
- Consumes: Plan 1 `SimLocalMediaHost`.
- Produces:
  - `SimLocalMediaHost.setLibrary(next: readonly SimLocalTrack[]): void`; the next `scan()` lists `next`.
  - Ids are stable per file for the host's life: a rescan keeps a listed file's id and gives a new file the next unused id. `open(id)` returns 0 for ids the last scan did not list.

- [ ] **Step 1: Apply the fork patch (test and implementation are in one patch; run the new test against the old fake first)**

```diff
--- a/contracts/spec/localmedia.ts
+++ b/contracts/spec/localmedia.ts
@@ -27,7 +27,8 @@
 const PHASES: ReadonlySet<string> = new Set<LocalPhase>(["idle", "loading", "playing", "paused", "ended", "error"]);
 
 export interface LocalTrack {
-  /** Stable for the session: the track's index in scan order. */
+  /** Stable for the session per file: a rescan keeps a listed file's id and gives a new file the
+   * next unused id. Ids are not positions; tracks() lists in scan order. */
   id: number;
   /** File name relative to LOCALMEDIA.root. */
   file: string;
@@ -63,7 +64,8 @@
   scan(): boolean;
   /** JSON LocalTrack[] of the last completed scan ("[]" before the first). */
   tracks(): string;
-  /** Stops the current track and starts id. Returns the open's serial (> 0), or 0 for an id the last scan did not list. */
+  /** Stops the current track and starts id. Returns the open's serial (> 0), or 0 for an id the last
+   * completed scan did not list (a file removed since is refused; the track playing keeps playing). */
   open(id: number): number;
   paused(value: boolean): void;
   /** Milliseconds; the host clamps to [0, durationMs]. */
--- a/hosts/sim/localmedia.ts
+++ b/hosts/sim/localmedia.ts
@@ -38,12 +38,20 @@
   liveArtwork(): number[];
   /** Move the virtual clock. */
   advance(ms: number): void;
+  /** Replace what the "card" holds; the next scan() lists it (ids stay with their files). */
+  setLibrary(next: readonly SimLocalTrack[]): void;
   dispose(): void;
 }
 
 const stem = (file: string) => file.replace(/\.[^.]*$/, "");
 
-export function createSimLocalMedia(library: readonly SimLocalTrack[], options: SimLocalMediaOptions = {}): SimLocalMediaHost {
+export function createSimLocalMedia(initial: readonly SimLocalTrack[], options: SimLocalMediaOptions = {}): SimLocalMediaHost {
+  let library = initial;
+  // Ids follow files for the life of the host: a rescan keeps a listed file's
+  // id and gives a new file the next unused one.
+  const idByFile = new Map<string, number>();
+  let nextId = 0;
+  const entryOf = new Map<number, SimLocalTrack>();
   const log: string[] = [];
   const art = new Set<number>();
   let nextArt = 1;
@@ -58,7 +66,15 @@
   };
 
   const finishScan = () => {
-    tracks = library.slice(0, LOCALMEDIA.maxTracks).map((entry, id) => ({
+    entryOf.clear();
+    tracks = library.slice(0, LOCALMEDIA.maxTracks).map((entry) => {
+      let id = idByFile.get(entry.file);
+      if (id === undefined) {
+        id = nextId++;
+        idByFile.set(entry.file, id);
+      }
+      entryOf.set(id, entry);
+      return {
       id,
       file: entry.file,
       title: entry.title?.trim() || stem(entry.file),
@@ -67,7 +83,8 @@
       track: entry.track ?? 0,
       durationMs: entry.corrupt ? 0 : entry.durationMs,
       hasArt: entry.art === true,
-    }));
+      };
+    });
     scanLeft = -1;
     status.scanning = false;
     status.scanGeneration++;
@@ -90,7 +107,7 @@
     tracks: () => JSON.stringify(tracks),
     open(id) {
       log.push(`open(${id})`);
-      const track = tracks[id];
+      const track = tracks.find((t) => t.id === id);
       if (!track) return 0;
       serial++;
       Object.assign(status, { phase: "loading", trackId: id, openSerial: serial, durationMs: track.durationMs, error: "" });
@@ -115,7 +132,7 @@
     status: () => JSON.stringify(status),
     artwork(id) {
       log.push(`artwork(${id})`);
-      if (!tracks[id]?.hasArt) return 0;
+      if (!tracks.find((t) => t.id === id)?.hasArt) return 0;
       const handle = nextArt++;
       art.add(handle);
       return handle;
@@ -137,7 +154,7 @@
         if (scanLeft <= 0) finishScan();
       }
       if (status.phase === "loading") {
-        if (library[status.trackId]?.corrupt) Object.assign(status, { phase: "error", error: "MP3 frame sync not found" });
+        if (entryOf.get(status.trackId)?.corrupt) Object.assign(status, { phase: "error", error: "MP3 frame sync not found" });
         else status.phase = "playing";
         return;
       }
@@ -147,6 +164,9 @@
         status.phase = "ended";
       } else setPosition(position + ms);
     },
+    setLibrary(next) {
+      library = next;
+    },
     dispose() {
       art.clear();
       tracks = [];
--- a/tests/localmedia-sim.test.ts
+++ b/tests/localmedia-sim.test.ts
@@ -96,3 +96,18 @@
   expect(host.volume()).toBe(0.25);
   expect(host.log).toEqual(["scan()", "artwork(0)", "artwork(1)", `releaseArtwork(${handle})`, "volume(0.25)"]);
 });
+
+test("ids stay with their files across a rescan; new files get fresh ids; a vanished file does not open", () => {
+  const host = createSimLocalMedia(LIB);
+  const media = localMedia(host.ns);
+  media.scan();
+  expect(media.tracks().map((t) => [t.id, t.file])).toEqual([[0, "01 Intro.mp3"], [1, "untagged.mp3"], [2, "broken.mp3"]]);
+  host.setLibrary([{ file: "00 New.mp3", durationMs: 500 }, LIB[1]!, LIB[0]!]);
+  media.scan();
+  expect(media.status().scanGeneration).toBe(2);
+  expect(media.tracks().map((t) => [t.id, t.file])).toEqual([[3, "00 New.mp3"], [1, "untagged.mp3"], [0, "01 Intro.mp3"]]);
+  expect(media.open(2)).toBe(0);
+  expect(media.open(3)).toBeGreaterThan(0);
+  expect(media.status()).toMatchObject({ trackId: 3, durationMs: 500 });
+  expect(media.artwork(0)).toBeGreaterThan(0);
+});
--- a/tests/localmedia.test.ts
+++ b/tests/localmedia.test.ts
@@ -1,10 +1,10 @@
 import { expect, test } from "bun:test";
-import { LOCALMEDIA, validLocalStatus, validLocalTrack, type LocalMediaOps } from "../contracts/spec/localmedia.ts";
+import { LOCALMEDIA, validLocalStatus, validLocalTrack, type LocalMediaOps, type LocalStatus } from "../contracts/spec/localmedia.ts";
 import { POCKET_CAPABILITIES } from "../contracts/spec/platforms.ts";
 import { localMedia } from "../framework/src/localmedia.ts";
 import { resolve3dsBuildPlan } from "../tools/3ds-profile.ts";
 
-const STATUS = { phase: "playing", trackId: 1, openSerial: 4, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, underruns: 0, error: "" };
+const STATUS: LocalStatus = { phase: "playing", trackId: 1, openSerial: 4, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, underruns: 0, error: "" };
 
 function recorder(over: Partial<LocalMediaOps> = {}) {
   const calls: string[] = [];
```

To watch it fail first:
- Apply only the `runtime/tests/localmedia-sim.test.ts` hunk: `git -C runtime apply --include=tests/localmedia-sim.test.ts $TMPDIR/t1.patch`.
- Run `cd runtime && bun test tests/localmedia-sim.test.ts`. Expected: FAIL, `TypeError: host.setLibrary is not a function`.
- Then apply the rest: `git -C runtime apply --exclude=tests/localmedia-sim.test.ts $TMPDIR/t1.patch`.

- [ ] **Step 2: Run the fork tests and typecheck**

Run: `cd runtime && bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts && npx --no-install tsc --noEmit -p . 2>&1 | grep -c localmedia`
Expected: 12 pass; `0`.

- [ ] **Step 3: Commit in the fork, push (after the user confirms), bump the pin**

```bash
git -C runtime add contracts/spec/localmedia.ts hosts/sim/localmedia.ts tests/localmedia-sim.test.ts tests/localmedia.test.ts
git -C runtime commit -m "feat(localmedia): ids stay with their files across rescans"
git -C runtime push fork ipo-ds
git add runtime && git commit -m "chore(runtime): bump pin for stable media.local ids"
```
Run: `bun run test`. Expected: 63 pass.

---

### Task 2: Time formatting

**Files:** Create `app/format.ts`; Test `tests/format.test.ts`

**Interfaces:**
- Produces:
  - `formatTime(ms): string`: `m:ss`, or `h:mm:ss` from an hour; NaN and negative values read as `0:00`.
  - `formatRemaining(positionMs, durationMs)`: `-m:ss`.
  - `needsHours(durationMs): boolean`.

- [ ] **Step 1: Write the failing test** `tests/format.test.ts`:

```ts
import { expect, test } from "bun:test";
import { formatRemaining, formatTime, needsHours } from "../app/format.ts";

test("times read m:ss below an hour and h:mm:ss from an hour", () => {
  expect([formatTime(0), formatTime(9_999), formatTime(102_000), formatTime(3_599_999), formatTime(3_600_000), formatTime(45_153_000)])
    .toEqual(["0:00", "0:09", "1:42", "59:59", "1:00:00", "12:32:33"]);
});

test("negative and non-finite times read as zero", () => {
  expect([formatTime(-5_000), formatTime(NaN), formatTime(Infinity)]).toEqual(["0:00", "0:00", "0:00"]);
});

test("remaining time carries a minus sign and never goes below zero", () => {
  expect([formatRemaining(102_000, 340_000), formatRemaining(400_000, 340_000), formatRemaining(0, 3_754_000)]).toEqual(["-3:58", "-0:00", "-1:02:34"]);
  expect([needsHours(3_599_999), needsHours(3_600_000)]).toEqual([false, true]);
});
```

- [ ] **Step 2: Run it.** `bun test ./tests/format.test.ts`. Expected: FAIL, `Cannot find module '../app/format.ts'`.

- [ ] **Step 3: Implement** `app/format.ts`:

```ts
// Time display: "m:ss", or "h:mm:ss" once a duration reaches an hour.

const HOUR_MS = 3_600_000;

/** "m:ss" below an hour, "h:mm:ss" from an hour; NaN and negative values read as 0. */
export function formatTime(ms: number): string {
  const total = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Time left, with a leading "-": "-3:58". */
export function formatRemaining(positionMs: number, durationMs: number): string {
  return `-${formatTime(durationMs - positionMs)}`;
}

/** Whether times for this duration use the h:mm:ss form (and the wider seek time cells). */
export function needsHours(durationMs: number): boolean {
  return durationMs >= HOUR_MS;
}
```

- [ ] **Step 4: Run tests.** `bun test ./tests/format.test.ts && bun run check`. Expected: 3 pass; no errors.

- [ ] **Step 5: Commit.** `git add app/format.ts tests/format.test.ts && git commit -m "feat: m:ss and h:mm:ss time formatting"`

---

### Task 3: Compose decomposed accents

**Files:** Create `scripts/gen-compose-table.ts`, `app/library/compose.ts`, generated `app/library/compose-table.ts`; Test `tests/compose.test.ts`

**Interfaces:**
- Produces:
  - `composeMarks(text): string`: base letter + U+0300–036F → the precomposed Latin-1 / Extended-A letter.
  - `COMPOSE` table (161 entries).

- [ ] **Step 1: Write the failing test** `tests/compose.test.ts`:

```ts
import { expect, test } from "bun:test";
import { composeMarks } from "../app/library/compose.ts";
import { COMPOSE } from "../app/library/compose-table.ts";

test("every decomposed Latin-1 / Latin Extended-A letter composes", () => {
  for (const [decomposed, letter] of Object.entries(COMPOSE)) expect(composeMarks(decomposed)).toBe(letter);
  expect(Object.keys(COMPOSE).length).toBeGreaterThan(150);
});

test("decomposed tags compose in place; other text passes through unchanged", () => {
  expect(composeMarks("Sigur Ro\u0301s — Hoppi\u0301polla")).toBe("Sigur Rós — Hoppípolla");
  expect(composeMarks("Beyoncé")).toBe("Beyoncé");
  expect(composeMarks("Plain ASCII")).toBe("Plain ASCII");
});

test("a mark with no composed form, or with nothing before it, stays as it is", () => {
  expect(composeMarks("x\u0301")).toBe("x\u0301");
  expect(composeMarks("\u0301a")).toBe("\u0301a");
});
```

- [ ] **Step 2: Run it.** `bun test ./tests/compose.test.ts`. Expected: FAIL, `Cannot find module '../app/library/compose.ts'`.

- [ ] **Step 3: Write the generator and run it** `scripts/gen-compose-table.ts`:

```ts
// Writes app/library/compose-table.ts: base letter + one combining mark →
// the precomposed letter, for every letter in Latin-1 Supplement and Latin
// Extended-A (U+00C0–017F) that canonically decomposes that way. Generated
// with the build machine's String.prototype.normalize so the 3DS needs none.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const entries: string[] = [];
for (let cp = 0xc0; cp <= 0x17f; cp++) {
  const ch = String.fromCodePoint(cp);
  const parts = [...ch.normalize("NFD")];
  if (parts.length === 2 && /[̀-ͯ]/.test(parts[1]!)) {
    const key = parts[0]! + "\\u" + parts[1]!.codePointAt(0)!.toString(16).padStart(4, "0");
    entries.push(`  "${key}": "${ch}",`);
  }
}
const out = [
  "// Generated by scripts/gen-compose-table.ts — do not edit.",
  "// Base letter + combining mark → precomposed Latin-1 / Latin Extended-A letter.",
  "export const COMPOSE: Readonly<Record<string, string>> = {",
  ...entries,
  "};",
  "",
].join("\n");
writeFileSync(join(import.meta.dir, "..", "app", "library", "compose-table.ts"), out);
console.log(`${entries.length} compositions`);
```

Run: `bun scripts/gen-compose-table.ts`. Expected output: `161 compositions`, and `app/library/compose-table.ts` written.

- [ ] **Step 4: Implement** `app/library/compose.ts`. Write it with an editor or Python, not a shell heredoc that may turn `\u` escapes into raw characters; the font test rejects raw combining marks in app source.

```ts
// Tag text from some taggers (macOS tools, decomposed filenames) carries
// accents as a base letter plus a combining mark. The baked font draws the
// precomposed letter, so compose them before anything is shown.
import { COMPOSE } from "./compose-table.ts";

const MARK = /[\u0300-\u036f]/;

export function composeMarks(text: string): string {
  if (!MARK.test(text)) return text;
  let out = "";
  for (const ch of text) {
    const composed = MARK.test(ch) && out.length > 0 ? COMPOSE[out[out.length - 1]! + ch] : undefined;
    out = composed ? out.slice(0, -1) + composed : out + ch;
  }
  return out;
}
```

- [ ] **Step 5: Run tests.** `bun test ./tests/compose.test.ts ./tests/fonts.test.ts && bun run check`. Expected: 5 pass; no errors.

- [ ] **Step 6: Commit.** `git add scripts/gen-compose-table.ts app/library/compose.ts app/library/compose-table.ts tests/compose.test.ts && git commit -m "feat(library): compose decomposed accents for display"`

---

### Task 4: Player `prune`

**Files:** Modify `app/player/reducer.ts`, `tests/player.test.ts`

**Interfaces:**
- Produces: `PlayerAction | { type: "prune"; ids: readonly number[] }`. It keeps the current song and listed ids in `queue`/`order`, and recomputes `index`. No commands.

- [ ] **Step 1: Apply the patch** (watch the test fail first: apply with `--include=tests/player.test.ts`, run `bun test ./tests/player.test.ts` → FAIL on the unknown action, then apply with `--exclude=tests/player.test.ts`):

```diff
--- a/app/player/reducer.ts
+++ b/app/player/reducer.ts
@@ -27,7 +27,9 @@
   | { type: "toggleShuffle" } | { type: "cycleRepeat" }
   | { type: "hostStatus"; status: LocalStatus }
   /** The host accepted the latest open command and returned this serial. */
-  | { type: "opened"; serial: number };
+  | { type: "opened"; serial: number }
+  /** A rescan listed these ids; drop the rest from the queue (the current song stays). */
+  | { type: "prune"; ids: readonly number[] };
 export type PlayerCommand = { type: "open"; id: number } | { type: "paused"; value: boolean } | { type: "seek"; ms: number };
 export interface Reduced { state: PlayerState; commands: PlayerCommand[] }
 
@@ -107,6 +109,13 @@
     }
     case "opened":
       return none({ ...state, serial: action.serial });
+    case "prune": {
+      const id = currentId(state);
+      const keep = new Set(action.ids);
+      const kept = (list: readonly number[]) => list.filter((queued) => queued === id || keep.has(queued));
+      const order = kept(state.order);
+      return none({ ...state, queue: kept(state.queue), order, index: id < 0 ? -1 : order.indexOf(id) });
+    }
     case "cycleRepeat":
       return none({ ...state, repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" });
     case "hostStatus": {
--- a/tests/player.test.ts
+++ b/tests/player.test.ts
@@ -137,3 +137,14 @@
   expect(run(state, { type: "hostStatus", status: status({ trackId: 0, openSerial: 5, phase: "ended" }) }).commands)
     .toEqual([{ type: "open", id: 0 }]);
 });
+
+test("prune drops ids a rescan no longer lists, keeping the current song and its place", () => {
+  let state = playing([0, 1, 2, 3], 2);
+  state = run(state, { type: "prune", ids: [0, 3] }).state;
+  expect(state).toMatchObject({ queue: [0, 2, 3], order: [0, 2, 3], index: 1 });
+  expect(currentId(state)).toBe(2);
+  expect(run(state, { type: "next" }).commands).toEqual([{ type: "open", id: 3 }]);
+  const idle = run(initialPlayer(), { type: "prune", ids: [] });
+  expect(idle.state.index).toBe(-1);
+  expect(idle.commands).toEqual([]);
+});
```

- [ ] **Step 2: Run tests.** `bun test ./tests/player.test.ts && bun run check`. Expected: 16 pass.

- [ ] **Step 3: Commit.** `git add app/player/reducer.ts tests/player.test.ts && git commit -m "feat(player): prune ids a rescan no longer lists"`

---

### Task 5: Explorer model

**Files:** Create `app/explorer/model.ts`; Test `tests/explorer-model.test.ts`

**Interfaces:**
- Consumes: `rows`, `Library`, `Row`, `View` (library); `formatTime` (Task 2); types `LegendItem`, `Tab` (Plan 2).
- Produces:
  - `TAB_ORDER`, `ExplorerState`, `ExplorerAction` (`tab`, `open`, `back`, `setQuery`, `focus`, `move`, `reveal`), `initialExplorer`, `currentView`, `viewKey`, `focusOf`, `reduceExplorer`.
  - Selectors: `visibleRows`, `visibleSongIds`, `headerOf` → `HeaderSpec`, `rowCells` → `RowCells`, `crumbOf` → `CrumbSpec | null`, `legendOf`, `lcdLine`.

- [ ] **Step 1: Write the failing test** `tests/explorer-model.test.ts`:

```ts
import { expect, test } from "bun:test";
import { buildLibrary } from "../app/library/library.ts";
import {
  crumbOf, currentView, focusOf, headerOf, initialExplorer, lcdLine, legendOf, reduceExplorer, rowCells, visibleRows, visibleSongIds,
  type ExplorerAction, type ExplorerState,
} from "../app/explorer/model.ts";
import { TRACKS } from "./fixtures/tracks.ts";

const library = buildLibrary(TRACKS);
const run = (state: ExplorerState, ...actions: ExplorerAction[]) => actions.reduce(reduceExplorer, state);
const count = (state: ExplorerState) => visibleRows(library, state).length;

test("tabs step Songs → Artists → Albums without wrapping", () => {
  let state = initialExplorer();
  state = run(state, { type: "tab", delta: -1 });
  expect(state.tab).toBe("Songs");
  state = run(state, { type: "tab", delta: 1 }, { type: "tab", delta: 1 }, { type: "tab", delta: 1 });
  expect(state.tab).toBe("Albums");
});

test("each tab remembers its drill-down and focused row", () => {
  let state = run(initialExplorer(), { type: "move", delta: 3, count: 7 });
  state = run(state, { type: "tab", delta: 1 }, { type: "move", delta: 1, count: 5 }, { type: "open", row: { kind: "artist", key: "daft punk" } });
  expect(currentView(state)).toEqual({ kind: "artist", key: "daft punk" });
  state = run(state, { type: "tab", delta: -1 });
  expect([state.tab, focusOf(state)]).toEqual(["Songs", 3]);
  state = run(state, { type: "tab", delta: 1 });
  expect(currentView(state)).toEqual({ kind: "artist", key: "daft punk" });
  state = run(state, { type: "back" });
  expect([currentView(state).kind, focusOf(state)]).toEqual(["artists", 1]);
});

test("focus is clamped to the visible rows; paging moves by a screenful", () => {
  let state = run(initialExplorer(), { type: "move", delta: -5, count: 7 });
  expect(focusOf(state)).toBe(0);
  state = run(state, { type: "move", delta: 8, count: 7 });
  expect(focusOf(state)).toBe(6);
  state = run(state, { type: "focus", index: 2, count: 7 });
  expect(focusOf(state)).toBe(2);
  expect(focusOf(run(initialExplorer(), { type: "move", delta: 1, count: 0 }))).toBe(0);
});

test("one query filters whichever tab shows, resets focus, and B clears it once no drill-down is open", () => {
  let state = run(initialExplorer(), { type: "move", delta: 4, count: 7 }, { type: "setQuery", query: "daft" });
  expect(visibleSongIds(library, state)).toEqual([1, 2, 0]);
  expect(focusOf(state)).toBe(0);
  state = run(state, { type: "tab", delta: 1 });
  expect(visibleRows(library, state)).toEqual([{ kind: "artist", key: "daft punk" }]);
  state = run(state, { type: "open", row: { kind: "artist", key: "daft punk" } }, { type: "back" });
  expect(state.query).toBe("daft");
  state = run(state, { type: "back" });
  expect(state.query).toBe("");
  expect(run(initialExplorer(), { type: "back" })).toEqual(initialExplorer());
});

test("song rows do not drill", () => {
  const state = run(initialExplorer(), { type: "open", row: { kind: "song", id: 0 } });
  expect(currentView(state)).toEqual({ kind: "songs" });
});

test("reveal jumps to the playing song in Songs, clearing a query that hides it", () => {
  let state = run(initialExplorer(), { type: "tab", delta: 1 }, { type: "setQuery", query: "gorillaz" });
  state = run(state, { type: "reveal", id: 0, library });
  expect([state.tab, state.query]).toEqual(["Songs", ""]);
  expect(visibleRows(library, state)[focusOf(state)]).toEqual({ kind: "song", id: 0 });
  const kept = run(initialExplorer(), { type: "setQuery", query: "daft" }, { type: "reveal", id: 2, library });
  expect([kept.query, focusOf(kept)]).toEqual(["daft", 1]);
  expect(run(initialExplorer(), { type: "reveal", id: 99, library })).toEqual(initialExplorer());
});

test("headers, row cells and breadcrumbs follow the view", () => {
  let state = initialExplorer();
  expect(headerOf(state)).toEqual({ left: "Song Name", right: "Artist", count: false });
  expect(rowCells(library, state, { kind: "song", id: 0 })).toEqual({ title: "One More Time", detail: "Daft Punk", count: false });
  state = run(state, { type: "tab", delta: 1 });
  expect(headerOf(state)).toEqual({ left: "Artist", right: "Songs", count: true });
  expect(rowCells(library, state, { kind: "artist", key: "daft punk" })).toEqual({ title: "Daft Punk", detail: "3", count: true });
  state = run(state, { type: "open", row: { kind: "artist", key: "daft punk" } });
  expect(headerOf(state)).toEqual({ left: "Song Name", right: "Album", count: false });
  expect(rowCells(library, state, { kind: "song", id: 1 })).toEqual({ title: "Aerodynamic", detail: "Discovery", count: false });
  expect(crumbOf(library, state)).toEqual({ root: "Artists", leaf: "Daft Punk", detail: "3 songs" });
  state = run(state, { type: "tab", delta: 1 });
  expect(headerOf(state)).toEqual({ left: "Album", right: "Artist", count: false });
  state = run(state, { type: "open", row: { kind: "album", key: "discovery\u0000daft punk" } });
  expect(headerOf(state)).toEqual({ left: "Song Name", right: "Time", lead: "#", count: false });
  expect(rowCells(library, state, { kind: "song", id: 2 })).toEqual({ title: "Digital Love", detail: "3:00", lead: "3", count: false });
  expect(crumbOf(library, state)).toEqual({ root: "Albums", leaf: "Discovery", detail: "Daft Punk · 3 songs" });
  expect(crumbOf(library, initialExplorer())).toBeNull();
  expect(count(state)).toBe(3);
});

test("legends name what each button does in this view", () => {
  const labels = (state: ExplorerState, songs = true) => legendOf(state, songs).map((item) => `${item.key} ${item.label}`);
  expect(labels(initialExplorer())).toEqual(["A Play", "X Search", "B Back", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "setQuery", query: "x" }))).toEqual(["A Play", "X Edit search", "B Clear", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "tab", delta: 1 }))).toEqual(["A Open", "X Search", "B Back", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "tab", delta: 1 }, { type: "open", row: { kind: "artist", key: "queen" } }))[2]).toBe("B Artists");
  expect(labels(initialExplorer(), false)).toEqual(["X Scan again"]);
});

test("the LCD line reports availability, scanning, and the library's size and length", () => {
  expect(lcdLine(false, false, null)).toBe("Unavailable");
  expect(lcdLine(true, true, library)).toBe("Scanning…");
  expect(lcdLine(true, false, null)).toBe("0 songs");
  expect(lcdLine(true, false, buildLibrary([]))).toBe("0 songs");
  expect(lcdLine(true, false, library)).toBe("7 songs · 21 min");
  expect(lcdLine(true, false, buildLibrary([{ ...TRACKS[0]!, durationMs: 7_920_000 }]))).toBe("1 song · 2.2 hrs");
});
```

- [ ] **Step 2: Run it.** `bun test ./tests/explorer-model.test.ts`. Expected: FAIL, `Cannot find module '../app/explorer/model.ts'`.

- [ ] **Step 3: Implement** `app/explorer/model.ts`:

```ts
// The Explorer as pure state: which tab, which drill-down, the search query
// and the focused row of every view. Selectors turn it (plus the library)
// into what the top screen shows. No Solid, no host: unit-tested directly.
import { formatTime } from "../format.ts";
import { rows, type Library, type Row, type View } from "../library/library.ts";
import type { LegendItem } from "../theme/parts/strips.tsx";
import type { Tab } from "../theme/theme.ts";

export const TAB_ORDER: readonly Tab[] = ["Songs", "Artists", "Albums"];

export interface ExplorerState {
  tab: Tab;
  /** The drill-down open in each tab (Songs never drills). */
  drill: Readonly<Record<Tab, View | null>>;
  /** Focused row per view (see viewKey); absent means row 0. */
  focus: Readonly<Record<string, number>>;
  query: string;
}

export type ExplorerAction =
  | { type: "tab"; delta: 1 | -1 }
  /** Drill into an artist or album row. Song rows play instead (the screen handles them). */
  | { type: "open"; row: Row }
  | { type: "back" }
  | { type: "setQuery"; query: string }
  /** `count` is the number of visible rows, so focus stays on a row. */
  | { type: "focus"; index: number; count: number }
  | { type: "move"; delta: number; count: number }
  | { type: "reveal"; id: number; library: Library };

export function initialExplorer(): ExplorerState {
  return { tab: "Songs", drill: { Songs: null, Artists: null, Albums: null }, focus: {}, query: "" };
}

const BASE_VIEW: Readonly<Record<Tab, View>> = { Songs: { kind: "songs" }, Artists: { kind: "artists" }, Albums: { kind: "albums" } };

export function currentView(state: ExplorerState): View {
  return state.drill[state.tab] ?? BASE_VIEW[state.tab];
}

export function viewKey(view: View): string {
  return view.kind === "artist" || view.kind === "album" ? `${view.kind}:${view.key}` : view.kind;
}

export function focusOf(state: ExplorerState): number {
  return state.focus[viewKey(currentView(state))] ?? 0;
}

const clamp = (index: number, count: number) => (count <= 0 ? 0 : Math.min(count - 1, Math.max(0, index)));

function withFocus(state: ExplorerState, index: number): ExplorerState {
  return { ...state, focus: { ...state.focus, [viewKey(currentView(state))]: index } };
}

export function reduceExplorer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "tab": {
      const next = TAB_ORDER.indexOf(state.tab) + action.delta;
      return next < 0 || next >= TAB_ORDER.length ? state : { ...state, tab: TAB_ORDER[next]! };
    }
    case "open": {
      if (action.row.kind === "song") return state;
      const view: View = action.row.kind === "artist" ? { kind: "artist", key: action.row.key } : { kind: "album", key: action.row.key };
      return { ...state, drill: { ...state.drill, [state.tab]: view } };
    }
    case "back":
      if (state.drill[state.tab]) return { ...state, drill: { ...state.drill, [state.tab]: null } };
      return state.query === "" ? state : { ...state, query: "", focus: {} };
    case "setQuery":
      return action.query === state.query ? state : { ...state, query: action.query, focus: {} };
    case "focus":
      return withFocus(state, clamp(action.index, action.count));
    case "move":
      return withFocus(state, clamp(focusOf(state) + action.delta, action.count));
    case "reveal": {
      const songs: ExplorerState = { ...state, tab: "Songs" };
      const visible = (s: ExplorerState) => rows(action.library, BASE_VIEW.Songs, s.query).findIndex((row) => row.kind === "song" && row.id === action.id);
      let at = visible(songs);
      let next = songs;
      if (at < 0) {
        next = { ...songs, query: "", focus: {} };
        at = visible(next);
      }
      return at < 0 ? state : withFocus(next, at);
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function visibleRows(library: Library, state: ExplorerState): Row[] {
  return rows(library, currentView(state), state.query);
}

/** Song ids of the visible rows, in order: the queue a song played from this view gets. */
export function visibleSongIds(library: Library, state: ExplorerState): number[] {
  return visibleRows(library, state).flatMap((row) => (row.kind === "song" ? [row.id] : []));
}

export interface HeaderSpec {
  left: string;
  right: string;
  /** Label over the lead column ("#" over track numbers). */
  lead?: string;
  /** Right label aligns over right-aligned counts. */
  count: boolean;
}

export function headerOf(state: ExplorerState): HeaderSpec {
  const view = currentView(state);
  switch (view.kind) {
    case "songs":
      return { left: "Song Name", right: "Artist", count: false };
    case "artists":
      return { left: "Artist", right: "Songs", count: true };
    case "albums":
      return { left: "Album", right: "Artist", count: false };
    case "artist":
      return { left: "Song Name", right: "Album", count: false };
    case "album":
      return { left: "Song Name", right: "Time", lead: "#", count: false };
  }
}

export interface RowCells {
  title: string;
  detail: string;
  /** Lead column text (album track numbers). */
  lead?: string;
  /** `detail` is a right-aligned count. */
  count: boolean;
}

export function rowCells(library: Library, state: ExplorerState, row: Row): RowCells {
  if (row.kind === "artist") {
    const artist = library.artists.find((a) => a.key === row.key)!;
    return { title: artist.name, detail: String(artist.trackIds.length), count: true };
  }
  if (row.kind === "album") {
    const album = library.albums.find((a) => a.key === row.key)!;
    return { title: album.name, detail: album.artist, count: false };
  }
  const track = library.tracks.get(row.id)!;
  const view = currentView(state);
  if (view.kind === "artist") return { title: track.title, detail: track.album, count: false };
  if (view.kind === "album") return { title: track.title, detail: formatTime(track.durationMs), lead: track.track > 0 ? String(track.track) : "", count: false };
  return { title: track.title, detail: track.artist, count: false };
}

export interface CrumbSpec {
  root: string;
  leaf: string;
  detail: string;
}

const songsLabel = (n: number) => `${n} ${n === 1 ? "song" : "songs"}`;

export function crumbOf(library: Library, state: ExplorerState): CrumbSpec | null {
  const view = currentView(state);
  if (view.kind === "artist") {
    const artist = library.artists.find((a) => a.key === view.key);
    return artist ? { root: "Artists", leaf: artist.name, detail: songsLabel(artist.trackIds.length) } : null;
  }
  if (view.kind === "album") {
    const album = library.albums.find((a) => a.key === view.key);
    return album ? { root: "Albums", leaf: album.name, detail: `${album.artist} · ${songsLabel(album.trackIds.length)}` } : null;
  }
  return null;
}

export function legendOf(state: ExplorerState, hasSongs: boolean): LegendItem[] {
  if (!hasSongs) return [{ key: "X", label: "Scan again", primary: true }];
  const view = currentView(state);
  const opens = view.kind === "artists" || view.kind === "albums";
  const back = state.drill[state.tab] ? (state.tab === "Artists" ? "Artists" : "Albums") : state.query ? "Clear" : "Back";
  return [
    { key: "A", label: opens ? "Open" : "Play", primary: true },
    { key: "X", label: state.query ? "Edit search" : "Search" },
    { key: "B", label: back },
    { key: "Y", label: "Now Playing" },
  ];
}

/** The toolbar LCD's second line. */
export function lcdLine(available: boolean, scanning: boolean, library: Library | null): string {
  if (!available) return "Unavailable";
  if (scanning) return "Scanning…";
  if (!library || library.tracks.size === 0) return "0 songs";
  let ms = 0;
  for (const track of library.tracks.values()) ms += track.durationMs;
  const length = ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} hrs` : `${Math.round(ms / 60_000)} min`;
  return `${songsLabel(library.tracks.size)} · ${length}`;
}
```

- [ ] **Step 4: Run tests.** `bun test ./tests/explorer-model.test.ts && bun run check`. Expected: 9 pass.

- [ ] **Step 5: Commit.** `git add app/explorer/model.ts tests/explorer-model.test.ts && git commit -m "feat(explorer): pure explorer model and selectors"`

---

### Task 6: Input timing and the marquee phase

**Files:** Create `app/input-timing.ts`; Modify `app/theme/geometry.ts`, `tests/geometry.test.ts`; Test `tests/input-timing.test.ts`

**Interfaces:**
- Produces:
  - `REPEAT_DELAY_FRAMES`, `REPEAT_RATE_FRAMES`, `HOLD_FRAMES`, `repeatFires(heldFrames)`.
  - `HoldState`, `HOLD_UP`, `stepHold(state, down, holdFrames?)`: emits `"tap"` or `"hold"`. The hold fires on the `holdFrames`-th frame down.
  - `stepAnalog(accumulated, deflection)`.
  - `marqueeOffset(frame, overflow)`, `MARQUEE_HOLD_FRAMES`, `MARQUEE_PX_PER_FRAME`.

- [ ] **Step 1: Write the failing test** `tests/input-timing.test.ts`:

```ts
import { expect, test } from "bun:test";
import { HOLD_UP, repeatFires, stepAnalog, stepHold, type HoldState } from "../app/input-timing.ts";

test("a held button fires on the down frame, after 300 ms, then every 80 ms", () => {
  const fired = Array.from({ length: 30 }, (_, frame) => frame).filter((frame) => repeatFires(frame));
  expect(fired).toEqual([0, 18, 23, 28]);
});

function press(frames: boolean[]): string[] {
  let state: HoldState = HOLD_UP;
  const events: string[] = [];
  for (const down of frames) {
    const step = stepHold(state, down, 4);
    state = step.state;
    if (step.event) events.push(step.event);
  }
  return events;
}

test("a short press is a tap on release; a long press fires hold once and no tap", () => {
  expect(press([true, true, false])).toEqual(["tap"]);
  expect(press([true, true, true, true, true, true, false])).toEqual(["hold"]);
  expect(press([false, false])).toEqual([]);
  expect(press([true, false, true, true, true, true, false, true, false])).toEqual(["tap", "hold", "tap"]);
});

test("the circle pad moves whole rows in proportion to deflection and stops at rest", () => {
  const roll = (deflection: number, frames: number) => {
    let accumulated = 0;
    let rows = 0;
    for (let frame = 0; frame < frames; frame++) {
      const step = stepAnalog(accumulated, deflection);
      accumulated = step.accumulated;
      rows += step.rows;
    }
    return rows;
  };
  expect(roll(1, 20)).toBe(4);
  expect(roll(-0.5, 20)).toBe(-2);
  expect(stepAnalog(0.9, 0)).toEqual({ accumulated: 0, rows: 0 });
});
```

- [ ] **Step 2: Run it.** `bun test ./tests/input-timing.test.ts`. Expected: FAIL, missing module.

- [ ] **Step 3: Implement** `app/input-timing.ts`:

```ts
// Pure timing for held buttons and the circle pad, in virtual frames (60 Hz).
// app/input.ts runs these once per frame against the live button mask.

/** First repeat after 300 ms, then every 80 ms. */
export const REPEAT_DELAY_FRAMES = 18;
export const REPEAT_RATE_FRAMES = 5;
/** Hold this long for the hold action (X: rescan). */
export const HOLD_FRAMES = 60;

/** Whether a button held for `heldFrames` (0 on the down frame) fires this frame. */
export function repeatFires(heldFrames: number, delay = REPEAT_DELAY_FRAMES, rate = REPEAT_RATE_FRAMES): boolean {
  if (heldFrames === 0) return true;
  return heldFrames >= delay && (heldFrames - delay) % rate === 0;
}

export interface HoldState {
  /** Frames held so far; -1 while up. */
  held: number;
  /** The hold action already fired for this press. */
  fired: boolean;
}

export const HOLD_UP: HoldState = { held: -1, fired: false };

/** One frame of a tap-or-hold button: "hold" once at `holdFrames`, "tap" on a release before it. */
export function stepHold(state: HoldState, down: boolean, holdFrames = HOLD_FRAMES): { state: HoldState; event: "tap" | "hold" | null } {
  if (!down) return { state: HOLD_UP, event: state.held >= 0 && !state.fired ? "tap" : null };
  const held = state.held + 1;
  // held counts from 0 on the down frame, so the hold fires on the holdFrames-th frame down.
  if (!state.fired && held + 1 >= holdFrames) return { state: { held, fired: true }, event: "hold" };
  return { state: { held, fired: state.fired }, event: null };
}

/** Rows per frame at full circle-pad deflection: one row every 80 ms. */
export const ANALOG_ROWS_PER_FRAME = 1 / REPEAT_RATE_FRAMES;

/** One frame of circle-pad scrolling: accumulate deflection (-1..1), emit whole-row moves. */
export function stepAnalog(accumulated: number, deflection: number): { accumulated: number; rows: number } {
  if (deflection === 0) return { accumulated: 0, rows: 0 };
  const total = accumulated + deflection * ANALOG_ROWS_PER_FRAME;
  // Sums of fractional steps drift (ten -0.1 steps make -0.9999…); nudge before truncating.
  const rows = Math.trunc(total + Math.sign(total) * 1e-9);
  return { accumulated: total - rows, rows };
}
```

- [ ] **Step 4: Apply the marquee phase patch** (the test hunk first: `--include=tests/geometry.test.ts` → FAIL `marqueeOffset is not a function`; then `--exclude=…`):

```diff
--- a/app/theme/geometry.ts
+++ b/app/theme/geometry.ts
@@ -8,3 +8,18 @@
 export function trackOffset(fraction: number, inner: number): number {
   return Math.round(inner * clampFraction(fraction));
 }
+
+/** Marquee timing, in virtual frames (60 Hz): hold, scroll at 30 px/s, hold, snap back. */
+export const MARQUEE_HOLD_FRAMES = 90;
+export const MARQUEE_PX_PER_FRAME = 0.5;
+
+/** translateX (≤ 0) of a marquee `frame` frames into its cycle, for text `overflow` px wider than its box. */
+export function marqueeOffset(frame: number, overflow: number): number {
+  if (overflow <= 0) return 0;
+  const scroll = Math.ceil(overflow / MARQUEE_PX_PER_FRAME);
+  const cycle = MARQUEE_HOLD_FRAMES + scroll + MARQUEE_HOLD_FRAMES;
+  const f = ((frame % cycle) + cycle) % cycle;
+  if (f < MARQUEE_HOLD_FRAMES) return 0;
+  if (f < MARQUEE_HOLD_FRAMES + scroll) return 0 - Math.min(overflow, Math.round((f - MARQUEE_HOLD_FRAMES) * MARQUEE_PX_PER_FRAME));
+  return -overflow;
+}
--- a/tests/geometry.test.ts
+++ b/tests/geometry.test.ts
@@ -8,3 +8,10 @@
 test("track offsets round to whole pixels within the inner width", () => {
   expect([trackOffset(0.3, 198), trackOffset(2, 198), trackOffset(-1, 198), trackOffset(NaN, 218)]).toEqual([59, 198, 0, 0]);
 });
+
+test("a marquee holds, scrolls to reveal the end, holds, then snaps back", async () => {
+  const { marqueeOffset } = await import("../app/theme/geometry.ts");
+  // 40 px too wide: 90 frames hold, 80 frames scroll, 90 frames hold → 260-frame cycle.
+  expect([0, 89, 90, 91, 130, 170, 200, 259, 260].map((f) => marqueeOffset(f, 40))).toEqual([0, 0, 0, -1, -20, -40, -40, -40, 0]);
+  expect([0, 500].map((f) => marqueeOffset(f, 0))).toEqual([0, 0]);
+});
```

- [ ] **Step 5: Run tests.** `bun test ./tests/input-timing.test.ts ./tests/geometry.test.ts && bun run check`. Expected: 6 pass.

- [ ] **Step 6: Commit.** `git add app/input-timing.ts app/theme/geometry.ts tests/input-timing.test.ts tests/geometry.test.ts && git commit -m "feat: held-button, tap-or-hold, circle-pad and marquee timing"`

---

### Task 7: Marquee part and theme additions

**Files:**
- Create: `app/theme/fonts.ts`, `app/theme/parts/marquee.tsx`; Test `tests/marquee.test.ts`.
- Modify (patch): `app/theme/aqua.ts`, `app/theme/theme.ts`, `app/theme/parts/deck.tsx`, `app/theme/parts/list.tsx`, `app/theme/parts/toolbar.tsx`, `tests/gallery.test.ts`.

**Interfaces:**
- Produces:
  - `FONT_12`, `FONT_12_BOLD`, `FONT_16_BOLD`.
  - `Marquee { text; class; slot; width; active? }`.
- Changes to existing parts:
  - `SeekCapsule` gains `hours?` and `ref?`.
  - `SEEK_TRACK_WIDE_PX`, `seekTrackLeft(hours)` and `INFO_TEXT_PX` are exported.
  - `TransportButton` answers bottom-screen touch taps through `createGesture`.
  - `ListRow` gains `marquee?`.
  - `LcdStatus` and `InfoLcd` lines marquee.
- Theme:
  - New slots `seekTimeWide`, `seekTimeRightWide`, `seekTrackWide`.
  - `lcdStatus` is fixed at 144 px. It already rendered at 144, shrunk inside the toolbar row.
  - `oskKeyHeight` becomes 45.
- Gallery tests: a marquee'd line's clip box (`at(-3)`) lies inside its panel (`at(-4)`).

- [ ] **Step 1: Write the failing test** `tests/marquee.test.ts`:

```ts
import { expect, test } from "bun:test";
import { fontSlotFor } from "../runtime/framework/compiler/tailwind.ts";
import { FONT_12, FONT_12_BOLD, FONT_16_BOLD } from "../app/theme/fonts.ts";

test("the marquee's font slots are the ones the build assigns to its text classes", () => {
  expect(FONT_12).toBe(fontSlotFor(12, false));
  expect(FONT_12_BOLD).toBe(fontSlotFor(12, true));
  expect(FONT_16_BOLD).toBe(fontSlotFor(16, true));
});
```

Run `bun test ./tests/marquee.test.ts`. Expected: FAIL, missing `app/theme/fonts.ts`.

- [ ] **Step 2: Create** `app/theme/fonts.ts` and `app/theme/parts/marquee.tsx`:

```ts
// Baked font-atlas slots for the text classes the marquee measures. They are
// literals because compiler source must stay out of the app's import graph;
// tests/marquee.test.ts asserts they equal the build's fontSlotFor().
export const FONT_12 = 0; //      fontSlotFor(12, false): text-xs
export const FONT_12_BOLD = 7; // fontSlotFor(12, true):  text-xs font-bold
export const FONT_16_BOLD = 9; // fontSlotFor(16, true):  text-base font-bold
```

```tsx
// Text that fits its box sits still (aligned by its class). Text too wide
// starts at the left edge and, while active, scrolls to reveal its end on a
// hold–scroll–hold cycle (geometry.marqueeOffset), restarting when it changes.
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { getOps } from "@pocketjs/framework";
import { Text, View } from "@pocketjs/framework/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { virtualFrame } from "@pocketjs/framework/clock";
import { marqueeOffset } from "../geometry.ts";

export function Marquee(props: {
  text: string;
  /** The text's class (size, weight, colour, alignment). */
  class: string;
  /** Font slot of that class (app/theme/fonts.ts). */
  slot: number;
  /** Box width in px. */
  width: number;
  active?: boolean;
}) {
  const textWidth = createMemo(() => getOps().measureText(props.text, props.slot));
  const overflow = () => Math.max(0, Math.ceil(textWidth() - props.width));
  const [start, setStart] = createSignal(virtualFrame());
  createEffect(on(() => [props.text, props.active] as const, () => setStart(virtualFrame()), { defer: true }));
  const [offset, setOffset] = createSignal(0);
  onFrame(() => {
    const next = overflow() > 0 && (props.active ?? true) ? marqueeOffset(virtualFrame() - start(), overflow()) : 0;
    if (next !== offset()) setOffset(next);
  });
  return (
    <View class="overflow-hidden" style={{ width: props.width }}>
      <Text class={props.class} style={{ width: overflow() > 0 ? Math.ceil(textWidth()) : props.width, translateX: offset() }}>
        {props.text}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Apply the theme and parts patch**:

```diff
--- a/app/theme/aqua.ts
+++ b/app/theme/aqua.ts
@@ -29,7 +29,7 @@
 export const AQUA: Theme = {
   name: "aqua",
   osk: "classic",
-  oskKeyHeight: 43,
+  oskKeyHeight: 45,
 
   topScreen: "w-full h-full flex-col bg-[#c2c2c2] overflow-hidden",
   bottomScreen: "relative w-full h-full bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8] overflow-hidden",
@@ -40,7 +40,7 @@
     color === "red" ? "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#ffb3a8] to-[#e0443a]"
     : color === "amber" ? "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#ffe2a1] to-[#e3a21a]"
     : "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#c9f0a8] to-[#4fa83a]",
-  lcdStatus: "w-[160] h-[30] ml-[4] px-[6] flex-col items-center justify-center overflow-hidden rounded-[6] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
+  lcdStatus: "w-[144] h-[30] shrink-0 ml-[4] px-[6] flex-col items-center justify-center overflow-hidden rounded-[6] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
   lcdTitle: "w-full leading-[13] text-center text-xs font-bold text-[#2b2b2b]",
   lcdLine: "w-full leading-[13] text-center text-xs text-[#4a4c3f]",
   tabs: "flex-row items-center ml-[6] gap-[3]",
@@ -129,7 +129,10 @@
   seekCapsule: "absolute left-[10] top-[120] w-[300] h-[30] flex-row items-center px-[8] gap-[8] rounded-[15] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
   seekTime: "w-[34] text-xs font-bold text-[#1f2018]",
   seekTimeRight: "w-[34] text-xs font-bold text-[#1f2018] text-right",
+  seekTimeWide: "w-[46] text-xs font-bold text-[#1f2018]",
+  seekTimeRightWide: "w-[46] text-xs font-bold text-[#1f2018] text-right",
   seekTrack: "w-[200] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
+  seekTrackWide: "w-[176] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
   seekFill: "absolute left-[1] top-[1] h-[6] rounded-[3] bg-[#4a4c3f]",
   seekKnob: "absolute top-[-6] w-[18] h-[18] rounded-[9] bg-gradient-to-b from-[#b9dcff] via-[#5aa7f0] to-[#1c6fd1] border border-[#1a4f99]",
 
--- a/app/theme/theme.ts
+++ b/app/theme/theme.ts
@@ -21,7 +21,7 @@
   name: string;
   /** The framework Osk theme the search keyboard uses. */
   osk: "dark" | "light" | "classic";
-  /** Key height (logical px) that lets the keyboard fill the bottom screen below the search field. */
+  /** Key height (logical px) that makes the keyboard panel fill the 214 px below the search field. */
   oskKeyHeight: number;
 
   topScreen: string;
@@ -119,7 +119,11 @@
   seekCapsule: string;
   seekTime: string;
   seekTimeRight: string;
+  /** Wider time cells and a shorter track when times read h:mm:ss. */
+  seekTimeWide: string;
+  seekTimeRightWide: string;
   seekTrack: string;
+  seekTrackWide: string;
   seekFill: string;
   seekKnob: string;
 
--- a/app/theme/parts/deck.tsx
+++ b/app/theme/parts/deck.tsx
@@ -3,11 +3,14 @@
 // the handlers.
 import { children, Show } from "solid-js";
 import { Image, Text, View } from "@pocketjs/framework/components";
+import { createGesture } from "@pocketjs/framework/gesture";
 import type { JSX as SolidJSX } from "solid-js";
 import { AQUA } from "../aqua.ts";
 import { trackOffset } from "../geometry.ts";
 import { placeholderArt } from "../placeholder.ts";
 import type { RepeatMode, Theme, TransportKind } from "../theme.ts";
+import { FONT_12, FONT_16_BOLD } from "../fonts.ts";
+import { Marquee } from "./marquee.tsx";
 
 export function PlaceholderArt(props: { album: string; theme?: Theme }) {
   const t = () => props.theme ?? AQUA;
@@ -51,9 +54,9 @@
   const t = () => props.theme ?? AQUA;
   return (
     <View class={t().infoLcd}>
-      <Text class={t().infoTitle}>{props.title}</Text>
-      <Text class={t().infoArtist}>{props.artist}</Text>
-      <Text class={t().infoAlbum}>{props.album}</Text>
+      <Marquee text={props.title} class={t().infoTitle} slot={FONT_16_BOLD} width={INFO_TEXT_PX} />
+      <Marquee text={props.artist} class={t().infoArtist} slot={FONT_12} width={INFO_TEXT_PX} />
+      <Marquee text={props.album} class={t().infoAlbum} slot={FONT_12} width={INFO_TEXT_PX} />
       <View class={t().infoStatus}>
         <Text class={t().infoStatusText}>{props.position}</Text>
         <Show when={props.shuffle}>
@@ -72,20 +75,37 @@
 
 /** Inner width of the seek track (200 wide with a 1 px border); the fill starts at x 1 and the 18 px knob centres on its end. */
 export const SEEK_TRACK_PX = 198;
+/** The same with h:mm:ss times (176 wide). */
+export const SEEK_TRACK_WIDE_PX = 174;
+/** Screen x of the track's inner left edge: capsule 10 + padding 8 + time cell + gap 8 + border 1. */
+export function seekTrackLeft(hours: boolean): number {
+  return 10 + 8 + (hours ? 46 : 34) + 8 + 1;
+}
+/** Text width inside the 192 px info LCD (8 px padding each side). */
+export const INFO_TEXT_PX = 176;
 
-export function SeekCapsule(props: { elapsed: string; remaining: string; fraction: number; enabled: boolean; theme?: Theme }) {
+export function SeekCapsule(props: {
+  elapsed: string;
+  remaining: string;
+  fraction: number;
+  enabled: boolean;
+  /** Times read h:mm:ss: wider time cells, shorter track. */
+  hours?: boolean;
+  ref?: (node: unknown) => void;
+  theme?: Theme;
+}) {
   const t = () => props.theme ?? AQUA;
-  const x = () => trackOffset(props.fraction, SEEK_TRACK_PX);
+  const x = () => trackOffset(props.fraction, props.hours ? SEEK_TRACK_WIDE_PX : SEEK_TRACK_PX);
   return (
-    <View class={t().seekCapsule}>
-      <Text class={t().seekTime}>{props.elapsed}</Text>
-      <View class={t().seekTrack}>
+    <View class={t().seekCapsule} ref={props.ref as never}>
+      <Text class={props.hours ? t().seekTimeWide : t().seekTime}>{props.elapsed}</Text>
+      <View class={props.hours ? t().seekTrackWide : t().seekTrack}>
         <Show when={props.enabled}>
           <View class={t().seekFill} style={{ width: x() }} />
           <View class={t().seekKnob} style={{ insetL: x() - 8 }} />
         </Show>
       </View>
-      <Text class={t().seekTimeRight}>{props.remaining}</Text>
+      <Text class={props.hours ? t().seekTimeRightWide : t().seekTimeRight}>{props.remaining}</Text>
     </View>
   );
 }
@@ -96,8 +116,18 @@
   const big = () => props.kind === "play" || props.kind === "pause";
   // Aqua gels carry white ink: play/pause, and shuffle/repeat while on. Graphite carries dark ink.
   const ink = () => (enabled() && (big() || ((props.kind === "shuffle" || props.kind === "repeat") && props.on)) ? "white" : "ink");
+  // A View's onPress answers the focused node's A press; a touch on the bottom
+  // screen needs its own recognizer over this button.
+  let node: unknown = null;
+  createGesture({
+    surface: "auxiliary",
+    region: { node: () => node as never },
+    onTap: () => {
+      if (enabled()) props.onPress?.();
+    },
+  });
   return (
-    <View class={t().transport(props.kind, props.on ?? false, enabled())} onPress={enabled() ? props.onPress : undefined}>
+    <View class={t().transport(props.kind, props.on ?? false, enabled())} ref={(n: unknown) => (node = n)}>
       <Show
         when={big()}
         fallback={<Image class="w-[16] h-[16]" src={t().icon(props.kind as "shuffle" | "repeat" | "prev" | "next", ink())} />}
--- a/app/theme/parts/list.tsx
+++ b/app/theme/parts/list.tsx
@@ -3,6 +3,12 @@
 import { Image, Text, View } from "@pocketjs/framework/components";
 import { AQUA } from "../aqua.ts";
 import type { RowKind, Theme } from "../theme.ts";
+import { FONT_12 } from "../fonts.ts";
+import { Marquee } from "./marquee.tsx";
+
+/** Title cell widths (px): beside a detail column, and spanning the row beside a count. */
+const TITLE_PX = 214;
+const WIDE_TITLE_PX = 318;
 
 /** `lead` labels the rows' lead column ("#" over track numbers); `count` right-aligns the second label over counts. */
 export function ColumnHeader(props: { left: string; right: string; lead?: string; sorted?: boolean; count?: boolean; theme?: Theme }) {
@@ -38,6 +44,8 @@
   playing?: boolean;
   /** Title spans the row and `detail` is a right-aligned count (Artists / Albums views). */
   count?: boolean;
+  /** Scroll a title too wide for its cell (the focused row). */
+  marquee?: boolean;
   onPress?: () => void;
   theme?: Theme;
 }
@@ -54,7 +62,9 @@
         fallback={
           <>
             <View class={t().rowTitleCell}>
-              <Text class={t().rowTitle(props.kind)}>{props.title}</Text>
+              <Show when={props.marquee} fallback={<Text class={t().rowTitle(props.kind)}>{props.title}</Text>}>
+                <Marquee text={props.title} class={t().rowTitle(props.kind)} slot={FONT_12} width={TITLE_PX} />
+              </Show>
             </View>
             <View class={t().rowDetailCell}>
               <Text class={t().rowDetail(props.kind)}>{props.detail}</Text>
@@ -63,7 +73,9 @@
         }
       >
         <View class={t().rowWideCell}>
-          <Text class={t().rowTitle(props.kind)}>{props.title}</Text>
+          <Show when={props.marquee} fallback={<Text class={t().rowTitle(props.kind)}>{props.title}</Text>}>
+            <Marquee text={props.title} class={t().rowTitle(props.kind)} slot={FONT_12} width={WIDE_TITLE_PX} />
+          </Show>
         </View>
         <View class={t().rowCountCell}>
           <Text class={t().rowMuted(props.kind)}>{props.detail}</Text>
--- a/app/theme/parts/toolbar.tsx
+++ b/app/theme/parts/toolbar.tsx
@@ -4,6 +4,11 @@
 import { Text, View } from "@pocketjs/framework/components";
 import { AQUA } from "../aqua.ts";
 import type { Tab, Theme } from "../theme.ts";
+import { FONT_12 } from "../fonts.ts";
+import { Marquee } from "./marquee.tsx";
+
+/** Text width inside the 144 px LCD (6 px padding each side). */
+const LCD_TEXT_PX = 132;
 
 export const TABS: readonly Tab[] = ["Songs", "Artists", "Albums"];
 
@@ -23,7 +28,7 @@
   return (
     <View class={t().lcdStatus}>
       <Text class={t().lcdTitle}>{props.title}</Text>
-      <Text class={t().lcdLine}>{props.line}</Text>
+      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX} />
     </View>
   );
 }
--- a/tests/gallery.test.ts
+++ b/tests/gallery.test.ts
@@ -62,7 +62,8 @@
 
   const line = pathTo(world, "primary", "142 songs · 9.6 hrs");
   const [, ly, , lh] = rect(line.at(-2));
-  const [, by, , bh] = rect(line.at(-3));
+  // The line is a marquee: run → Text → clip box → LCD pill.
+  const [, by, , bh] = rect(line.at(-4));
   const [, ty] = rect(pathTo(world, "primary", "iPoDS").at(-2));
   expect(ty).toBeGreaterThanOrEqual(by + 2);
   expect(ly + lh).toBeLessThanOrEqual(by + bh - 2);
@@ -157,10 +158,10 @@
   expect(screenText(world, "auxiliary")).toContain("Nothing playing");
 });
 
-/** A text run's <Text> element (path[-2]) lies inside the box that holds it (path[-3]). */
+/** A marquee's clip box (run → Text → clip box → panel) lies inside its panel, so a long line never paints outside it. */
 function expectInside(path: ReturnType<typeof pathTo>): void {
-  const [x, , w] = path[path.length - 2]!.rect!;
-  const [bx, , bw] = path[path.length - 3]!.rect!;
+  const [x, , w] = path[path.length - 3]!.rect!;
+  const [bx, , bw] = path[path.length - 4]!.rect!;
   expect(x).toBeGreaterThanOrEqual(bx);
   expect(x + w).toBeLessThanOrEqual(bx + bw);
 }
```

- [ ] **Step 4: Run everything.** `bun run test && bun run check`. Expected: 84 pass, 0 fail; no type errors.

- [ ] **Step 5: Commit.** `git add app/theme tests/marquee.test.ts tests/gallery.test.ts && git commit -m "feat(theme): marquee text, wide seek times, touch transport"`

---

### Task 8: The live app — session, Explorer, Now Playing, search

**Files:**
- Create: `app/session.ts`, `app/input.ts`, `app/search.tsx`, `app/explorer/explorer.tsx`, `app/now-playing/now-playing.tsx`, `tests/fixtures/library.ts`.
- Replace: `tests/app.test.ts` (the Plan 1 shell tests describe text this task removes).
- Modify (patch): `app/app.tsx`, `tests/library.test.ts`.
- Delete: `app/library/status.ts`.

**Interfaces:**
- Consumes: everything above; `createSimLocalMedia(...).setLibrary` (Task 1).
- Produces:
  - `Session` and `createSession(media?)`.
  - `onRepeat`, `onTapOrHold`, `onAnalogRows`.
  - `createSearch(store)` and `SearchKeyboard { osk }`.
  - `ExplorerStore`, `createExplorerStore`, `Explorer { session; store; searching; openSearch }`, `UNAVAILABLE`, `READ_ERROR`.
  - `NowPlaying { session }`.
  - `App`.

- [ ] **Step 1: Write the fixture and the failing app tests.** `tests/fixtures/library.ts` (write it with an editor or Python so the `́` escape stays an escape):

```ts
import type { SimLocalTrack } from "../../runtime/hosts/sim/localmedia.ts";

const song = (file: string, title: string, artist: string, album: string, track: number, seconds: number): SimLocalTrack =>
  ({ file, title, artist, album, track, durationMs: seconds * 1000 });

/** 20 songs, 4 artists, 5 albums; one over-long title and one decomposed accent (Hoppi + U+0301). */
export const LIBRARY: SimLocalTrack[] = [
  song("dp-01.mp3", "One More Time", "Daft Punk", "Discovery", 1, 320),
  song("dp-02.mp3", "Aerodynamic", "Daft Punk", "Discovery", 2, 207),
  song("dp-03.mp3", "Digital Love", "Daft Punk", "Discovery", 3, 298),
  song("dp-04.mp3", "Harder, Better, Faster, Stronger", "Daft Punk", "Discovery", 4, 224),
  song("dp-05.mp3", "Crescendolls", "Daft Punk", "Discovery", 5, 211),
  song("dp-11.mp3", "Revolution 909", "Daft Punk", "Homework", 2, 326),
  song("dp-12.mp3", "Da Funk", "Daft Punk", "Homework", 3, 328),
  song("dp-13.mp3", "Around the World", "Daft Punk", "Homework", 7, 429),
  song("gz-01.mp3", "Feel Good Inc.", "Gorillaz", "Demon Days", 6, 221),
  song("gz-02.mp3", "DARE", "Gorillaz", "Demon Days", 11, 244),
  song("gz-03.mp3", "Kids with Guns", "Gorillaz", "Demon Days", 4, 225),
  song("gz-04.mp3", "Dirty Harry", "Gorillaz", "Demon Days", 9, 223),
  song("sr-01.mp3", "Glósóli", "Sigur Rós", "Takk...", 2, 375),
  song("sr-02.mp3", "Hoppi\u0301polla", "Sigur Rós", "Takk...", 3, 268),
  song("sr-03.mp3", "Sæglópur", "Sigur Rós", "Takk...", 5, 492),
  song("sr-04.mp3", "Gong", "Sigur Rós", "Takk...", 6, 330),
  song("qu-01.mp3", "Bohemian Rhapsody (Remastered 2011, Live at Wembley Stadium, Extended)", "Queen", "A Night at the Opera", 11, 355),
  song("qu-02.mp3", "You're My Best Friend", "Queen", "A Night at the Opera", 4, 172),
  song("qu-03.mp3", "Love of My Life", "Queen", "A Night at the Opera", 9, 219),
  song("qu-04.mp3", "Death on Two Legs", "Queen", "A Night at the Opera", 1, 223),
];
```

`tests/app.test.ts` (replace the whole file):

```ts
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, pathTo, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

// 3DS face buttons map by position: A = CIRCLE, B = CROSS, X = TRIANGLE, Y = SQUARE.
const A = BTN.CIRCLE, B = BTN.CROSS, X = BTN.TRIANGLE, Y = BTN.SQUARE;
const SELECTED_ROW = 0xffd77538;

interface Rig {
  world: BundleWorld;
  host: SimLocalMediaHost;
}

/** Steps frames with the host clock moving in step (60 Hz). */
function frames(rig: Rig, count: number, input?: StepInput): void {
  for (let i = 0; i < count; i++) {
    rig.world.step(input);
    rig.host.advance(1000 / 60);
  }
}

function press(rig: Rig, button: number, held = 1): void {
  frames(rig, held, { buttons: button });
  frames(rig, 2);
}

function touch(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

async function boot(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const host = createSimLocalMedia(library);
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

/** The text of the focused (selected) list row. */
function selectedRow(world: BundleWorld): string {
  const row = flat(world.tree("primary")).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row ? flat(row).map((node) => node.text).join("") : "";
}

const opens = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("open("));

test("launch: the Explorer lists the library, sorted, first row focused; Now Playing is idle", async () => {
  const rig = await boot();
  const top = screenText(rig.world, "primary");
  for (const part of ["iPoDS", "20 songs · 1.6 hrs", "Song Name", "Artist", "Aerodynamic", "Around the World", "A", "Play", "Search"]) expect(top).toContain(part);
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
}, 120_000);

test("A plays the focused song; Now Playing shows it; the visible list is the queue", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).toContain("Around the World");
  press(rig, A);
  expect(opens(rig.host)).toEqual(["open(7)"]);
  frames(rig, 3);
  const bottom = screenText(rig.world, "auxiliary");
  for (const part of ["Around the World", "Daft Punk", "Homework", "2 of 20", "0:0"]) expect(bottom).toContain(part);
  press(rig, BTN.ZR);
  expect(opens(rig.host)).toEqual(["open(7)", "open(16)"]);
}, 120_000);

test("tabs do not wrap; drilling into an artist and backing out restores the focused row", async () => {
  const rig = await boot();
  press(rig, BTN.LTRIGGER);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER);
  expect(screenText(rig.world, "primary")).toContain("Album");
  press(rig, BTN.LTRIGGER);
  press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).toContain("Gorillaz");
  press(rig, A);
  const drilled = screenText(rig.world, "primary");
  for (const part of ["Artists", "›", "Gorillaz", "4 songs", "Song Name", "Album", "Demon Days", "Kids with Guns"]) expect(drilled).toContain(part);
  press(rig, B);
  expect(selectedRow(rig.world)).toContain("Gorillaz");
}, 120_000);

test("X opens the keyboard; typing filters live; START keeps the query; B clears it", async () => {
  const rig = await boot();
  press(rig, X);
  expect(screenText(rig.world, "auxiliary")).toContain("START confirm");
  for (const key of ["d", "a", "f", "t"]) {
    const [x, y, w, h] = pathTo(rig.world, "auxiliary", key).at(-2)!.rect!;
    touch(rig, x + w / 2, y + h / 2);
  }
  let top = screenText(rig.world, "primary");
  for (const part of ["Search:", "daft", "8 found", "Edit search", "Clear"]) expect(top).toContain(part);
  expect(screenText(rig.world, "auxiliary")).toContain("daft|");
  // Once the keyboard's slide-in settles, the field sits above it, not under it, and the keys reach the foot of the screen.
  frames(rig, 60);
  const { width, rgba } = rig.world.pixels("auxiliary");
  const bluish = (y: number) => rgba[(y * width + 4) * 4 + 2]! - rgba[(y * width + 4) * 4]! >= 6;
  expect([bluish(20), bluish(30), bluish(236)]).toEqual([false, true, true]);
  const [, fy, , fh] = pathTo(rig.world, "auxiliary", "daft|").at(-3)!.rect!;
  const [, hy] = pathTo(rig.world, "auxiliary", "B close · START confirm").at(-2)!.rect!;
  expect(fy + fh).toBeLessThanOrEqual(hy);
  press(rig, BTN.START);
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
  top = screenText(rig.world, "primary");
  expect(top).toContain("daft");
  expect(top).not.toContain("Gorillaz");
  press(rig, B);
  expect(screenText(rig.world, "primary")).not.toContain("Search:");
}, 120_000);

test("seek: dragging previews the time with no seek until release, then exactly one seek", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic, 3:27
  frames(rig, 60);
  const y = 135;
  frames(rig, 1, { touches: [{ x: 80, y }], surface: "auxiliary" });
  for (let x = 90; x <= 160; x += 10) frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  // 160 is the track's midpoint (inner left 61 + 198 / 2): half of 207 s.
  expect(screenText(rig.world, "auxiliary")).toContain("1:43");
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual([]);
  frames(rig, 3);
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual(["seek(103500)"]);
}, 120_000);

test("transport taps pause, skip, shuffle and cycle repeat", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN);
  press(rig, A); // Around the World, 2 of 20
  frames(rig, 3);
  touch(rig, 160, 196); // play / pause
  expect(rig.host.log).toContain("paused(true)");
  touch(rig, 223, 196); // next
  expect(opens(rig.host).at(-1)).toBe("open(16)");
  frames(rig, 3);
  expect(screenText(rig.world, "auxiliary")).toContain("3 of 20");
  touch(rig, 49, 196); // shuffle: the current song moves to the head of the order
  expect(screenText(rig.world, "auxiliary")).toContain("1 of 20");
  touch(rig, 271, 196); // repeat all
  touch(rig, 271, 196); // repeat one: the LCD shows its "1"
  expect(pathTo(rig.world, "auxiliary", "1").length).toBeGreaterThan(0);
}, 120_000);

test("holding X rescans: playback continues and a removed file drops from the queue", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic; the queue continues with Around the World
  frames(rig, 3);
  rig.host.setLibrary(LIBRARY.filter((song) => song.file !== "dp-13.mp3" && song.file !== "dp-02.mp3"));
  press(rig, X, 70);
  frames(rig, 3);
  expect(rig.host.log.filter((entry) => entry === "scan()")).toHaveLength(2);
  expect(screenText(rig.world, "primary")).toContain("18 songs");
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
  expect(screenText(rig.world, "auxiliary")).not.toContain("START confirm");
  press(rig, BTN.ZR);
  expect(opens(rig.host).at(-1)).toBe("open(16)");
}, 120_000);

test("Y jumps back to the playing song", async () => {
  const rig = await boot();
  press(rig, A);
  for (let i = 0; i < 5; i++) press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).not.toContain("Aerodynamic");
  press(rig, Y);
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
}, 120_000);

test("a held D-pad repeats and the focused row stays inside the list", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN, 60); // fires on frames 0, 18, 23 … 58: ten moves
  expect(selectedRow(rig.world)).toContain("Glósóli");
  const row = flat(rig.world.tree("primary")).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW)!;
  const [, y, , h] = row.rect!;
  expect(y).toBeGreaterThanOrEqual(52);
  expect(y + h).toBeLessThanOrEqual(220);
}, 120_000);

test("a long title marquees in Now Playing; a short one stays still", async () => {
  const region = (world: BundleWorld) => {
    const { width, rgba } = world.pixels("auxiliary");
    const out: number[] = [];
    for (let y = 16; y < 34; y++) for (let x = 126; x < 302; x++) out.push(rgba[(y * width + x) * 4]!);
    return out.join(",");
  };
  const rig = await boot();
  press(rig, BTN.DOWN);
  press(rig, BTN.DOWN);
  press(rig, A); // Bohemian Rhapsody (Remastered 2011, Live at Wembley Stadium, Extended)
  frames(rig, 30);
  const before = region(rig.world);
  frames(rig, 150);
  expect(region(rig.world)).not.toBe(before);

  const still = await boot();
  press(still, A); // Aerodynamic
  frames(still, 30);
  const shortBefore = region(still.world);
  frames(still, 150);
  expect(region(still.world)).toBe(shortBefore);
}, 120_000);

test("decomposed accents in tags are composed before they are shown", async () => {
  const rig = await boot();
  for (let i = 0; i < 13; i++) press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).toContain("Hoppípolla");
}, 120_000);

test("a build without media.local, a garbled host reply, and an empty card each explain themselves", async () => {
  const bare = { host: createSimLocalMedia([]), world: await bootApp() };
  frames(bare, 3);
  expect(screenText(bare.world, "primary")).toContain("Music playback is unavailable on this build");
  expect(screenText(bare.world, "primary")).toContain("Unavailable");
  expect(screenText(bare.world, "auxiliary")).toContain("Nothing playing");

  const garbledHost = createSimLocalMedia(LIBRARY);
  const garbled = { host: garbledHost, world: await bootApp({ localmedia: { ...garbledHost.ns, tracks: () => "[{" } }) };
  frames(garbled, 3);
  expect(garbled.world.failure).toBeNull();
  expect(screenText(garbled.world, "primary")).toContain("Could not read the music library");

  const empty = await boot([]);
  expect(screenText(empty.world, "primary")).toContain("No music found");
  expect(screenText(empty.world, "primary")).toContain("0 songs");
  expect(screenText(empty.world, "primary")).not.toContain("0 min");
  press(empty, X);
  expect(empty.host.log.filter((entry) => entry === "scan()")).toHaveLength(2);
}, 120_000);
```

- [ ] **Step 2: Run them.** `bun test ./tests/app.test.ts`. Expected: FAIL. The current shell has no Explorer: no "20 songs · 1.6 hrs", no list rows, no keyboard.

- [ ] **Step 3: Session and input.** `app/session.ts`:

```ts
// The app's connection to the host's local media module: scans at launch,
// rebuilds the library after every completed scan (composing decomposed
// accents first), runs the player controller and polls status once per frame.
// Everything the screens read is a Solid signal here.
import { createSignal, type Accessor } from "solid-js";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { localMedia, type LocalMedia, type LocalStatus, type LocalTrack } from "@pocketjs/framework/localmedia";
import { composeMarks } from "./library/compose.ts";
import { buildLibrary, type Library } from "./library/library.ts";
import { createPlayerController, type PlayerController } from "./player/controller.ts";
import { IDLE_STATUS, initialPlayer, type PlayerAction, type PlayerState } from "./player/reducer.ts";

export interface Session {
  /** False on a build without media.local. */
  available: boolean;
  /** Null until the first scan completes. */
  library: Accessor<Library | null>;
  player: Accessor<PlayerState>;
  status: Accessor<LocalStatus>;
  scanning: Accessor<boolean>;
  /** A host reply failed validation; the screens report it instead of crashing the frame. */
  readFailed: Accessor<boolean>;
  dispatch(action: PlayerAction): void;
  rescan(): void;
}

/** The host's local media module, or null on a build without media.local. */
function connect(): LocalMedia | null {
  try {
    return localMedia();
  } catch {
    return null;
  }
}

function composed(track: LocalTrack): LocalTrack {
  return { ...track, title: composeMarks(track.title), artist: composeMarks(track.artist), album: composeMarks(track.album) };
}

export function createSession(media: LocalMedia | null = connect()): Session {
  const [library, setLibrary] = createSignal<Library | null>(null);
  const [player, setPlayer] = createSignal<PlayerState>(initialPlayer(), { equals: false });
  const [status, setStatus] = createSignal<LocalStatus>(IDLE_STATUS);
  const [scanning, setScanning] = createSignal(media !== null);
  const [readFailed, setReadFailed] = createSignal(false);
  let controller: PlayerController | null = null;

  if (media) {
    controller = createPlayerController(media, { onChange: setPlayer });
    let generation = 0;
    media.scan();
    // A frame that throws tears the guest down on the 3DS host, so a host
    // reply that does not validate becomes an on-screen error instead.
    onFrame(() => {
      try {
        controller!.poll();
        const now = controller!.state().status;
        setStatus(now);
        setScanning(now.scanning);
        if (now.scanGeneration !== generation) {
          generation = now.scanGeneration;
          const next = buildLibrary(media.tracks().map(composed));
          setLibrary(next);
          controller!.dispatch({ type: "prune", ids: [...next.tracks.keys()] });
          setReadFailed(false);
        }
      } catch {
        setReadFailed(true);
      }
    });
  }

  return {
    available: media !== null,
    library,
    player,
    status,
    scanning,
    readFailed,
    dispatch: (action) => controller?.dispatch(action),
    rescan: () => {
      media?.scan();
    },
  };
}
```

`app/input.ts`:

```ts
// Frame-driven input helpers over the pure steppers in input-timing.ts. They
// read the raw held-button mask once per frame; `active` gates them (the
// search keyboard owns input while it is open).
import { analogY, onFrame } from "@pocketjs/framework/lifecycle";
import { HOLD_UP, repeatFires, stepAnalog, stepHold } from "./input-timing.ts";

/** Fire on press, then repeat while held (300 ms delay, 80 ms rate). */
export function onRepeat(button: number, fire: () => void, active: () => boolean): void {
  let held = -1;
  onFrame((buttons) => {
    if (!active() || (buttons & button) === 0) {
      held = -1;
      return;
    }
    held++;
    if (repeatFires(held)) fire();
  });
}

/** A release before the hold time is a tap; holding fires `hold` once instead. */
export function onTapOrHold(button: number, tap: () => void, hold: () => void, active: () => boolean): void {
  let state = HOLD_UP;
  onFrame((buttons) => {
    const step = stepHold(state, active() && (buttons & button) !== 0);
    state = step.state;
    if (step.event === "tap") tap();
    else if (step.event === "hold") hold();
  });
}

/** Circle-pad Y as whole-row moves, faster with deflection. */
export function onAnalogRows(move: (rows: number) => void, active: () => boolean): void {
  let accumulated = 0;
  onFrame(() => {
    const step = stepAnalog(accumulated, active() ? analogY() : 0);
    accumulated = step.accumulated;
    if (step.rows !== 0) move(step.rows);
  });
}
```

- [ ] **Step 4: Search, Explorer and Now Playing.** `app/search.tsx`:

```tsx
// Search: the on-screen keyboard edits the Explorer's query live. While it is
// open it replaces Now Playing on the bottom screen and owns input.
import { View } from "@pocketjs/framework/components";
import { createOsk, Osk, type OskController } from "@pocketjs/framework/osk";
import type { ExplorerStore } from "./explorer/explorer.tsx";
import { AQUA } from "./theme/aqua.ts";
import { KeyboardField } from "./theme/parts/strips.tsx";

export function createSearch(store: ExplorerStore): OskController {
  return createOsk({ value: () => store.state().query, setValue: (query) => store.dispatch({ type: "setQuery", query }) });
}

export function SearchKeyboard(props: { osk: OskController }) {
  return (
    <View class={AQUA.bottomScreen}>
      <View class="absolute left-[8] top-[3] w-[304]">
        <KeyboardField text={props.osk.display("|")} />
      </View>
      {/* The keyboard rests at the top of its own box (it slides in from below), so the box starts under the field. */}
      <View class="absolute left-[0] top-[26] w-[320] h-[214]">
        <Osk osk={props.osk} surface="auxiliary" theme={AQUA.osk} keyHeight={AQUA.oskKeyHeight} />
      </View>
    </View>
  );
}
```

`app/explorer/explorer.tsx`:

```tsx
// The top screen: Toolbar, search strip / breadcrumb, column header, the
// library list (app-owned focus over a VirtualList) and the footer legend.
// Model logic lives in model.ts; this file renders it and maps buttons.
import { createEffect, createMemo, createSignal, Show, type Accessor } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { VirtualList, type VirtualListHandle } from "@pocketjs/framework/virtual-list";
import { onAnalogRows, onRepeat, onTapOrHold } from "../input.ts";
import { currentId } from "../player/reducer.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
import { StatePanel } from "../theme/parts/panels.tsx";
import { Breadcrumb, FooterLegend, SearchStrip } from "../theme/parts/strips.tsx";
import { Toolbar } from "../theme/parts/toolbar.tsx";
import type { RowKind } from "../theme/theme.ts";
import {
  crumbOf, focusOf, headerOf, initialExplorer, lcdLine, legendOf, reduceExplorer, rowCells, visibleRows, visibleSongIds,
  type ExplorerAction, type ExplorerState,
} from "./model.ts";

export interface ExplorerStore {
  state: Accessor<ExplorerState>;
  dispatch(action: ExplorerAction): void;
}

export function createExplorerStore(): ExplorerStore {
  const [state, setState] = createSignal(initialExplorer());
  return { state, dispatch: (action) => setState((current) => reduceExplorer(current, action)) };
}

const ROW_PX = 21;
/** List body height with no strips: 240 − toolbar 35 − header 16 − footer 21. */
const BODY_PX = 168;

export const UNAVAILABLE = "Music playback is unavailable on this build";
export const READ_ERROR = "Could not read the music library";

export function Explorer(props: { session: Session; store: ExplorerStore; searching: () => boolean; openSearch: () => void }) {
  const state = props.store.state;
  const dispatch = props.store.dispatch;
  const library = props.session.library;
  const active = () => !props.searching();

  const rows = createMemo(() => {
    const lib = library();
    return lib ? visibleRows(lib, state()) : [];
  });
  const crumb = createMemo(() => {
    const lib = library();
    return lib ? crumbOf(lib, state()) : null;
  });
  const hasSongs = () => (library()?.tracks.size ?? 0) > 0;
  const strips = () => (state().query ? 1 : 0) + (crumb() ? 1 : 0);
  const bodyPx = () => BODY_PX - strips() * ROW_PX;
  const page = () => Math.floor(bodyPx() / ROW_PX);
  const focus = () => focusOf(state());
  const playingId = () => currentId(props.session.player());
  const songCount = () => rows().filter((row) => row.kind === "song").length;

  // --- input ---------------------------------------------------------------
  const move = (delta: number) => dispatch({ type: "move", delta, count: rows().length });
  onRepeat(BTN.UP, () => move(-1), active);
  onRepeat(BTN.DOWN, () => move(1), active);
  onRepeat(BTN.LEFT, () => move(-page()), active);
  onRepeat(BTN.RIGHT, () => move(page()), active);
  onAnalogRows(move, active);
  onButtonPress(BTN.LTRIGGER, () => dispatch({ type: "tab", delta: -1 }), { active });
  onButtonPress(BTN.RTRIGGER, () => dispatch({ type: "tab", delta: 1 }), { active });
  onButtonPress(BTN.CROSS, () => dispatch({ type: "back" }), { active });
  onButtonPress(BTN.SQUARE, () => {
    const lib = library();
    const id = playingId();
    if (lib && id >= 0) dispatch({ type: "reveal", id, library: lib });
  }, { active });
  onButtonPress(BTN.CIRCLE, () => {
    const lib = library();
    const row = rows()[focus()];
    if (!lib || !row) return;
    if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: visibleSongIds(lib, state()), startId: row.id });
    else dispatch({ type: "open", row });
  }, { active });
  // X: tap searches (or scans again on an empty library); a 1 s hold rescans.
  onTapOrHold(BTN.TRIANGLE, () => (hasSongs() ? props.openSearch() : props.session.rescan()), () => props.session.rescan(), active);

  // --- list ----------------------------------------------------------------
  const [handle, setHandle] = createSignal<VirtualListHandle | null>(null);
  createEffect(() => {
    const list = handle();
    if (list && rows().length > 0) list.scrollToIndex(focus(), "nearest", false);
  });
  const thumb = createMemo(() => {
    const content = rows().length * ROW_PX;
    const view = bodyPx();
    if (content <= view) return null;
    const height = Math.max(16, Math.round((view * view) / content));
    const offset = handle()?.scroller.offset() ?? 0;
    return { top: Math.round((offset / (content - view)) * (view - height)), height };
  });
  const kindAt = (index: number): RowKind => (index === focus() ? "selected" : index % 2 === 0 ? "odd" : "even");

  const panel = () => {
    if (!props.session.available) return { title: UNAVAILABLE, lines: ["This build has no media.local module."] };
    if (props.session.readFailed()) return { title: READ_ERROR, lines: [["Press and hold", "X", "to scan again."] as const] };
    if (!library()) return { title: "Scanning your music…", lines: ["sdmc:/music/"] };
    if (!hasSongs()) return { title: "No music found", lines: ["Copy .mp3 files to the /music folder on your SD card,", ["then press", "X", "to scan again."] as const] };
    return null;
  };

  return (
    <View class={AQUA.topScreen}>
      <Toolbar title="iPoDS" line={lcdLine(props.session.available, props.session.scanning(), library())} active={state().tab} />
      <Show when={panel()} fallback={
        <>
          <Show when={state().query}>
            <SearchStrip query={state().query} count={songCount()} />
          </Show>
          <Show when={crumb()}>{(c) => <Breadcrumb root={c().root} leaf={c().leaf} detail={c().detail} />}</Show>
          <ColumnHeader left={headerOf(state()).left} right={headerOf(state()).right} lead={headerOf(state()).lead} count={headerOf(state()).count} />
          <View class={AQUA.listBody}>
            <VirtualList
              count={rows().length}
              rowHeight={ROW_PX}
              height={bodyPx()}
              focusRows={false}
              // The Explorer moves focus and scrolls itself; the list's own d-pad scrolling would
              // run on top of it while a direction is held (the top screen has no touch).
              inputActive={() => false}
              ref={setHandle}
              renderRow={(index) => {
                const row = () => rows()[index];
                const cells = () => rowCells(library()!, state(), row()!);
                return (
                  <Show when={row()}>
                    <ListRow
                      kind={kindAt(index)}
                      title={cells().title}
                      detail={cells().detail}
                      lead={cells().lead}
                      count={cells().count}
                      playing={row()!.kind === "song" && (row() as { id: number }).id === playingId()}
                      marquee={index === focus()}
                    />
                  </Show>
                );
              }}
            />
            <Show when={thumb()}>{(t) => <Scrollbar thumbTop={t().top} thumbHeight={t().height} />}</Show>
          </View>
        </>
      }>
        {(p) => <StatePanel title={p().title} lines={p().lines} />}
      </Show>
      <FooterLegend items={legendOf(state(), hasSongs())} />
    </View>
  );
}
```

`app/now-playing/now-playing.tsx`:

```tsx
// The bottom screen while not searching: the playing song's art, info LCD,
// a drag-to-seek capsule (one seek on release) and the transport row.
import { createMemo, createSignal, Show } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { createMediaScrubber } from "@pocketjs/framework/media";
import type { LocalTrack } from "@pocketjs/framework/localmedia";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ArtFrame, InfoLcd, SEEK_TRACK_PX, SEEK_TRACK_WIDE_PX, SeekCapsule, seekTrackLeft, TransportRow } from "../theme/parts/deck.tsx";
import { IdlePanel } from "../theme/parts/panels.tsx";

export function NowPlaying(props: { session: Session }) {
  const status = props.session.status;
  const player = props.session.player;
  const dispatch = props.session.dispatch;
  // A rescan can drop the playing song's file while the host keeps streaming
  // it, so the last details seen for the open id stay on screen.
  let last: LocalTrack | null = null;
  const track = createMemo(() => {
    const id = status().trackId;
    if (id < 0) return null;
    const known = props.session.library()?.tracks.get(id) ?? null;
    if (known) last = known;
    return known ?? (last?.id === id ? last : null);
  });
  const idle = () => player().index < 0 || track() === null;
  const duration = () => status().durationMs;
  const hours = () => needsHours(duration());

  // Drag-to-seek: preview locally while the contact moves, one seek on release.
  const [preview, setPreview] = createSignal<number | null>(null);
  const scrubber = createMediaScrubber((seconds) => dispatch({ type: "seek", ms: seconds * 1000 }));
  const fractionAt = (x: number) => (x - seekTrackLeft(hours())) / (hours() ? SEEK_TRACK_WIDE_PX : SEEK_TRACK_PX);
  let capsule: unknown = null;
  createGesture({
    surface: "auxiliary",
    axis: "x",
    region: { node: () => capsule as never },
    onDown: (c) => {
      if (idle()) return;
      scrubber.begin(fractionAt(c.x), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    },
    onMove: (c) => {
      if (!scrubber.active()) return;
      scrubber.move(fractionAt(c.x), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    },
    onUp: () => {
      scrubber.commit();
      setPreview(null);
    },
    onCancel: () => {
      scrubber.cancel();
      setPreview(null);
    },
  });
  const position = () => preview() ?? status().positionMs;
  const playing = () => status().phase === "playing" || status().phase === "loading";

  return (
    <View class={AQUA.bottomScreen}>
      <Show when={!idle()} fallback={<IdlePanel />}>
        <ArtFrame album={track()!.album} />
        <InfoLcd
          title={track()!.title}
          artist={track()!.artist}
          album={track()!.album}
          position={`${player().index + 1} of ${player().order.length}`}
          shuffle={player().shuffle}
          repeat={player().repeat}
        />
      </Show>
      <SeekCapsule
        ref={(node) => (capsule = node)}
        elapsed={idle() ? "--:--" : formatTime(position())}
        remaining={idle() ? "--:--" : formatRemaining(position(), duration())}
        fraction={duration() > 0 ? position() / duration() : 0}
        enabled={!idle()}
        hours={hours()}
      />
      <TransportRow
        playing={playing()}
        shuffle={player().shuffle}
        repeat={player().repeat}
        enabled={!idle()}
        onShuffle={() => dispatch({ type: "toggleShuffle" })}
        onPrev={() => dispatch({ type: "prev" })}
        onToggle={() => dispatch({ type: "toggle" })}
        onNext={() => dispatch({ type: "next" })}
        onRepeat={() => dispatch({ type: "cycleRepeat" })}
      />
    </View>
  );
}
```

- [ ] **Step 5: Mount them; drop the shell's status line.**

```diff
--- a/app/app.tsx
+++ b/app/app.tsx
@@ -1,53 +1,32 @@
-// iPoDS — a walkman-style MP3 player. The top screen browses the library;
-// the bottom screen is the now-playing deck.
-import { createSignal } from "solid-js";
-import { AuxiliarySurface, Text, View } from "@pocketjs/framework/components";
-import { onFrame } from "@pocketjs/framework/lifecycle";
-import { localMedia, type LocalMedia, type LocalTrack } from "@pocketjs/framework/localmedia";
-import { LIBRARY_READ_ERROR, libraryLine } from "./library/status.ts";
-
-/** The host's local media module, or null on a build without media.local. */
-function connect(): LocalMedia | null {
-  try {
-    return localMedia();
-  } catch {
-    return null;
-  }
-}
+// iPoDS — a walkman-style MP3 player. The top screen is the Explorer; the
+// bottom screen is Now Playing, or the search keyboard while it is open.
+import { Show } from "solid-js";
+import { AuxiliarySurface, View } from "@pocketjs/framework/components";
+import { BTN } from "@pocketjs/framework/input";
+import { onButtonPress } from "@pocketjs/framework/lifecycle";
+import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
+import { NowPlaying } from "./now-playing/now-playing.tsx";
+import { createSearch, SearchKeyboard } from "./search.tsx";
+import { createSession } from "./session.ts";
 
 export default function App() {
-  const media = connect();
-  const [tracks, setTracks] = createSignal<LocalTrack[]>([]);
-  const [scanning, setScanning] = createSignal(media !== null);
-  const [readFailed, setReadFailed] = createSignal(false);
-  if (media) {
-    let generation = 0;
-    media.scan();
-    onFrame(() => {
-      // A frame that throws tears the guest down on the 3DS host, so a host
-      // reply that does not validate becomes an on-screen error instead.
-      try {
-        const status = media.status();
-        setScanning(status.scanning);
-        if (status.scanGeneration !== generation) {
-          generation = status.scanGeneration;
-          setTracks(media.tracks());
-          setReadFailed(false);
-        }
-      } catch {
-        setReadFailed(true);
-      }
-    });
-  }
+  const session = createSession();
+  const store = createExplorerStore();
+  const osk = createSearch(store);
+  const notSearching = () => !osk.isOpen();
+  // Transport from either screen (the keyboard uses START to commit while open).
+  onButtonPress(BTN.START, () => session.dispatch({ type: "toggle" }), { active: notSearching });
+  onButtonPress(BTN.ZL, () => session.dispatch({ type: "prev" }), { active: notSearching });
+  onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
   return (
     <>
-      <View class="w-full h-full flex-col items-center justify-center gap-2 bg-slate-950">
-        <Text class="text-xl text-white font-bold">iPoDS</Text>
-        <Text class="text-sm text-slate-400">{readFailed() ? LIBRARY_READ_ERROR : libraryLine(media !== null, scanning(), tracks().length)}</Text>
-      </View>
+      <Explorer session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
       <AuxiliarySurface>
-        <View class="w-full h-full flex-col items-center justify-center bg-slate-900">
-          <Text class="text-sm text-slate-400">Nothing playing — pick a song above</Text>
+        {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Show> renders once). */}
+        <View class="relative w-full h-full flex-col">
+          <Show when={osk.isOpen()} fallback={<NowPlaying session={session} />}>
+            <SearchKeyboard osk={osk} />
+          </Show>
         </View>
       </AuxiliarySurface>
     </>
--- a/tests/library.test.ts
+++ b/tests/library.test.ts
@@ -2,7 +2,6 @@
 import type { LocalTrack } from "@pocketjs/framework/localmedia";
 import { buildLibrary, rows } from "../app/library/library.ts";
 import { normalize } from "../app/library/normalize.ts";
-import { libraryLine } from "../app/library/status.ts";
 import { TRACKS } from "./fixtures/tracks.ts";
 
 const ids = (list: ReturnType<typeof rows>) => list.map((row) => (row.kind === "song" ? row.id : row.key));
@@ -68,13 +67,6 @@
   expect(rows(library, { kind: "artist", key: "nobody" }, "")).toEqual([]);
 });
 
-test("the library status line covers no host, scanning, empty and counted", () => {
-  expect(libraryLine(false, false, 0)).toBe("Music playback is unavailable on this build");
-  expect(libraryLine(true, true, 0)).toBe("Scanning sdmc:/music/…");
-  expect(libraryLine(true, false, 0)).toBe("No music found in sdmc:/music/");
-  expect(libraryLine(true, false, 1)).toBe("1 track");
-  expect(libraryLine(true, false, 312)).toBe("312 tracks");
-});
 
 test("normalize strips decomposed accents and folds the rest of Latin Extended-A", () => {
   expect(normalize("Hoppípolla")).toBe("hoppipolla");
```

Then run `git rm app/library/status.ts`.

- [ ] **Step 6: Run the whole gate.** `bun run test && bun run check && bun run 3ds --pocket-only`. Expected: 90 pass, 0 fail; no type errors; `output: …ipo-ds-main.pocket (≈1151000 bytes …)`. The package grows because the app now bakes the keyboard's 14 and 16 px atlases.

- [ ] **Step 7: Commit.** `git add -A app tests && git commit -m "feat: the Explorer and Now Playing screens on live data"`

---

### Task 9: Gallery reuses the app's search screen; settled captures

**Files:** Modify (patch) `app/gallery/states.tsx`, `scripts/gallery.ts`, `tests/gallery.test.ts`

**Interfaces:**
- Consumes: `SearchKeyboard` (Task 8).
- Produces: the gallery's search state renders the app's own search screen. `bun run gallery` waits 30 frames per state, so captures show slide-ins at rest.

- [ ] **Step 1: Apply the test patch.** It judges the keyboard after its slide-in settles:

```diff
--- a/tests/gallery.test.ts
+++ b/tests/gallery.test.ts
@@ -190,6 +190,8 @@
   const [, hy] = rect(pathTo(world, "auxiliary", "B close · START confirm").at(-2));
   expect(fy).toBeGreaterThanOrEqual(0);
   expect(fy + fh).toBeLessThanOrEqual(hy);
+  // Let the keyboard's slide-in finish: its resting place is what the user sees.
+  for (let frame = 0; frame < 60; frame++) world.step();
   // …and the keyboard keeps its docked place, filling the screen below the field:
   // at (4, 60) the pixel is the keyboard panel's bluish grey, not the neutral metal behind it.
   const aux = world.pixels("auxiliary");
```

Run: `bun test ./tests/gallery.test.ts -t search`. Expected: FAIL. The gallery's own keyboard copy rests at the top of the screen, so the pixel at (4,236) is bare metal: `Expected: >= 6, Received: 0`.

- [ ] **Step 2: Apply the implementation patch**:

```diff
--- a/app/gallery/states.tsx
+++ b/app/gallery/states.tsx
@@ -2,13 +2,14 @@
 // theme parts with fixture data. Gallery-only: Plan 3 composes the real screens.
 import { createSignal, For, onMount } from "solid-js";
 import { Text, View } from "@pocketjs/framework/components";
-import { createOsk, Osk } from "@pocketjs/framework/osk";
+import { createOsk } from "@pocketjs/framework/osk";
+import { SearchKeyboard as KeyboardScreen } from "../search.tsx";
 import type { JSX as SolidJSX } from "solid-js";
 import { AQUA } from "../theme/aqua.ts";
 import { ArtFrame, InfoLcd, SeekCapsule, TransportRow } from "../theme/parts/deck.tsx";
 import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
 import { IdlePanel, StatePanel } from "../theme/parts/panels.tsx";
-import { Breadcrumb, FooterLegend, KeyboardField, SearchStrip, type LegendItem } from "../theme/parts/strips.tsx";
+import { Breadcrumb, FooterLegend, SearchStrip, type LegendItem } from "../theme/parts/strips.tsx";
 import { Toolbar } from "../theme/parts/toolbar.tsx";
 import type { RowKind, Tab } from "../theme/theme.ts";
 import type { GalleryStateName } from "./names.ts";
@@ -113,15 +114,7 @@
   const [query, setQuery] = createSignal("daft");
   const osk = createOsk({ value: query, setValue: setQuery });
   onMount(() => osk.open());
-  return (
-    <View class={AQUA.bottomScreen}>
-      {/* The keyboard docks itself at the foot of the screen; the field sits in the band above it. */}
-      <View class="absolute left-[8] top-[3] w-[304]">
-        <KeyboardField text={osk.display("|")} />
-      </View>
-      <Osk osk={osk} surface="auxiliary" theme={AQUA.osk} keyHeight={AQUA.oskKeyHeight} />
-    </View>
-  );
+  return <KeyboardScreen osk={osk} />;
 }
 
 const SONG_ROWS: Row[] = [
--- a/scripts/gallery.ts
+++ b/scripts/gallery.ts
@@ -21,7 +21,8 @@
       console.log(file);
     }
     world.step({ buttons: BTN.RTRIGGER });
-    for (let f = 0; f < 3; f++) world.step();
+    // Settle slide-ins (the search keyboard) before the next capture.
+    for (let f = 0; f < 30; f++) world.step();
   }
   if (world.failure) throw new Error(`gallery failed: ${world.failure.message}`);
 } finally {
```

- [ ] **Step 3: Run the gate.** `bun run test && bun run check && bun run gallery`. Expected: 90 pass; no errors; 14 PNGs in `dist/gallery/`.

- [ ] **Step 4: Commit.** `git add app/gallery/states.tsx scripts/gallery.ts tests/gallery.test.ts && git commit -m "fix(gallery): reuse the app's search screen and capture settled states"`

---

### Task 10: Skip songs without ZL / ZR (Y + L / R)

**Files:** Modify (patch) `app/input-timing.ts`, `app/explorer/explorer.tsx`, `tests/input-timing.test.ts`, `tests/app.test.ts`

**Interfaces:**
- Consumes: Task 6 timing module; Task 8 Explorer.
- Produces:
  - `ShoulderEvent = "tabPrev" | "tabNext" | "prev" | "next" | "reveal"`.
  - `ShoulderState`, `SHOULDERS_UP`.
  - `stepShoulders(state, buttons, { y, l, r }) → { state, events }`.
- One `onFrame` handler in the Explorer replaces the separate L, R and Y `onButtonPress` handlers. It is gated by `active` and re-seeded with the live mask while the keyboard is open, so a button held across closing it is not a new press.

- [ ] **Step 1: Apply the test patch**:

```diff
--- a/tests/input-timing.test.ts
+++ b/tests/input-timing.test.ts
@@ -1,5 +1,5 @@
 import { expect, test } from "bun:test";
-import { HOLD_UP, repeatFires, stepAnalog, stepHold, type HoldState } from "../app/input-timing.ts";
+import { HOLD_UP, repeatFires, SHOULDERS_UP, stepAnalog, stepHold, stepShoulders, type HoldState, type ShoulderEvent } from "../app/input-timing.ts";
 
 test("a held button fires on the down frame, after 300 ms, then every 80 ms", () => {
   const fired = Array.from({ length: 30 }, (_, frame) => frame).filter((frame) => repeatFires(frame));
@@ -39,3 +39,22 @@
   expect(roll(-0.5, 20)).toBe(-2);
   expect(stepAnalog(0.9, 0)).toEqual({ accumulated: 0, rows: 0 });
 });
+
+test("L / R alone step tabs; Y held with L / R skips songs; a Y tap alone reveals on release", () => {
+  const BITS = { y: 1, l: 2, r: 4 };
+  const run = (masks: number[]) => {
+    let state = SHOULDERS_UP;
+    const events: ShoulderEvent[] = [];
+    for (const mask of masks) {
+      const step = stepShoulders(state, mask, BITS);
+      state = step.state;
+      events.push(...step.events);
+    }
+    return events;
+  };
+  expect(run([2, 0, 4, 4, 0])).toEqual(["tabPrev", "tabNext"]);
+  expect(run([1, 1, 0])).toEqual(["reveal"]);
+  expect(run([1, 1 | 4, 1, 1 | 2, 1, 0])).toEqual(["next", "prev"]);
+  expect(run([1 | 4, 1, 0])).toEqual(["next"]);
+  expect(run([1, 1 | 4, 4, 0])).toEqual(["next"]);
+});
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -171,6 +171,23 @@
   expect(opens(rig.host).at(-1)).toBe("open(16)");
 }, 120_000);
 
+test("holding Y with L / R skips songs without ZL / ZR, and leaves the tab alone", async () => {
+  const rig = await boot();
+  press(rig, A); // Aerodynamic; next in the list is Around the World
+  frames(rig, 3);
+  frames(rig, 2, { buttons: Y });
+  frames(rig, 1, { buttons: Y | BTN.RTRIGGER });
+  frames(rig, 2, { buttons: Y });
+  frames(rig, 3);
+  expect(opens(rig.host)).toEqual(["open(1)", "open(7)"]);
+  expect(screenText(rig.world, "primary")).toContain("Song Name");
+  expect(selectedRow(rig.world)).toContain("Aerodynamic");
+  frames(rig, 2, { buttons: Y });
+  frames(rig, 1, { buttons: Y | BTN.LTRIGGER });
+  frames(rig, 3);
+  expect(opens(rig.host).at(-1)).toBe("open(1)");
+}, 120_000);
+
 test("Y jumps back to the playing song", async () => {
   const rig = await boot();
   press(rig, A);
```

Run: `bun test ./tests/input-timing.test.ts && bun test ./tests/app.test.ts -t "holding Y"`. Expected: FAIL. The unit test reports `Export named 'SHOULDERS_UP' not found`; the app test's Y + R does not open the next song.

- [ ] **Step 2: Apply the implementation patch**:

```diff
--- a/app/input-timing.ts
+++ b/app/input-timing.ts
@@ -42,3 +42,41 @@
   const rows = Math.trunc(total + Math.sign(total) * 1e-9);
   return { accumulated: total - rows, rows };
 }
+
+export type ShoulderEvent = "tabPrev" | "tabNext" | "prev" | "next" | "reveal";
+
+export interface ShoulderState {
+  /** Last frame's held mask (press edges are bits newly set this frame). */
+  mask: number;
+  /** L or R was pressed during the current Y hold, so its release is not a reveal. */
+  chorded: boolean;
+}
+
+export const SHOULDERS_UP: ShoulderState = { mask: 0, chorded: false };
+
+/**
+ * One frame of Y / L / R. L or R alone steps tabs. Held with Y they skip to
+ * the previous / next song: the skip path for consoles without ZL / ZR (the
+ * Old 3DS). A Y press with neither is a "reveal", fired on release.
+ */
+export function stepShoulders(
+  state: ShoulderState,
+  buttons: number,
+  bits: { y: number; l: number; r: number },
+): { state: ShoulderState; events: ShoulderEvent[] } {
+  const pressed = buttons & ~state.mask;
+  const yDown = (buttons & bits.y) !== 0;
+  const yWas = (state.mask & bits.y) !== 0;
+  const events: ShoulderEvent[] = [];
+  let chorded = yWas ? state.chorded : false;
+  if (yDown) {
+    if (pressed & bits.l) { events.push("prev"); chorded = true; }
+    if (pressed & bits.r) { events.push("next"); chorded = true; }
+  } else {
+    if (yWas && !chorded) events.push("reveal");
+    if (pressed & bits.l) events.push("tabPrev");
+    if (pressed & bits.r) events.push("tabNext");
+    chorded = false;
+  }
+  return { state: { mask: buttons, chorded }, events };
+}
--- a/app/explorer/explorer.tsx
+++ b/app/explorer/explorer.tsx
@@ -4,9 +4,10 @@
 import { createEffect, createMemo, createSignal, Show, type Accessor } from "solid-js";
 import { View } from "@pocketjs/framework/components";
 import { BTN } from "@pocketjs/framework/input";
-import { onButtonPress } from "@pocketjs/framework/lifecycle";
+import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
 import { VirtualList, type VirtualListHandle } from "@pocketjs/framework/virtual-list";
 import { onAnalogRows, onRepeat, onTapOrHold } from "../input.ts";
+import { SHOULDERS_UP, stepShoulders } from "../input-timing.ts";
 import { currentId } from "../player/reducer.ts";
 import type { Session } from "../session.ts";
 import { AQUA } from "../theme/aqua.ts";
@@ -66,14 +67,28 @@
   onRepeat(BTN.LEFT, () => move(-page()), active);
   onRepeat(BTN.RIGHT, () => move(page()), active);
   onAnalogRows(move, active);
-  onButtonPress(BTN.LTRIGGER, () => dispatch({ type: "tab", delta: -1 }), { active });
-  onButtonPress(BTN.RTRIGGER, () => dispatch({ type: "tab", delta: 1 }), { active });
   onButtonPress(BTN.CROSS, () => dispatch({ type: "back" }), { active });
-  onButtonPress(BTN.SQUARE, () => {
-    const lib = library();
-    const id = playingId();
-    if (lib && id >= 0) dispatch({ type: "reveal", id, library: lib });
-  }, { active });
+  // L / R step tabs; held with Y they skip songs (the path without ZL / ZR on an
+  // Old 3DS); a Y tap alone reveals the playing song when it is released.
+  let shoulders = SHOULDERS_UP;
+  onFrame((buttons) => {
+    if (!active()) {
+      shoulders = { mask: buttons, chorded: false };
+      return;
+    }
+    const step = stepShoulders(shoulders, buttons, { y: BTN.SQUARE, l: BTN.LTRIGGER, r: BTN.RTRIGGER });
+    shoulders = step.state;
+    for (const event of step.events) {
+      if (event === "tabPrev") dispatch({ type: "tab", delta: -1 });
+      else if (event === "tabNext") dispatch({ type: "tab", delta: 1 });
+      else if (event === "prev" || event === "next") props.session.dispatch({ type: event });
+      else {
+        const lib = library();
+        const id = playingId();
+        if (lib && id >= 0) dispatch({ type: "reveal", id, library: lib });
+      }
+    }
+  });
   onButtonPress(BTN.CIRCLE, () => {
     const lib = library();
     const row = rows()[focus()];
```

- [ ] **Step 3: Run the gate.** `bun run test && bun run check`. Expected: 92 pass, 0 fail; no type errors.

- [ ] **Step 4: Commit.** `git add app/input-timing.ts app/explorer/explorer.tsx tests/input-timing.test.ts tests/app.test.ts && git commit -m "feat(explorer): Y + L/R skips songs where ZL/ZR are missing (Old 3DS)"`

---

## Plan 3 exit gate

- `bun run test` (92), `bun run check`, `bun run 3ds --pocket-only` and `bun run gallery` are green. The fork's `localmedia` tests pass (12).
- **Manual device pass:** `bun run 3ds` then `open -a Azahar dist/ipo-ds-main.3dsx`. Without `media.local` (until Plan 4), the Explorer shows "Music playback is unavailable on this build". The gallery build shows the theme.
- Next: Plan 4 (native `media.local` in the fork, with stable ids, album art and a hostAbi bump), or Plan 5 hardening.
