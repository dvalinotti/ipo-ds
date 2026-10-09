# DJ Mode Plan 8 — The DJ Screen (ipo-ds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DJ Mode on the bottom screen: a vinyl record that spins while the song plays, stops when it pauses, and scratches the audio when dragged in circles (clockwise forward, counter-clockwise reverse), entered from a DJ gel on the deck or SELECT.

**Architecture:** The runtime pin moves to Plan 7's fork branch (contract v3). The player controller and session expose `scratch.begin/rate/end`. A pure module turns finger angles into rates. A baked vinyl PNG and label PNG rotate as one View over the cover texture; a side panel carries title, time, prev/next and the exit gel. `app/app.tsx` switches the bottom screen between the deck, DJ Mode and the search keyboard.

**Tech Stack:** TypeScript, Solid (`solid-js`), PocketJS framework APIs (`@pocketjs/framework/*`), Bun tests on the PocketJS sim (`bootBundle`), Azahar for perf.

**Spec:** `docs/superpowers/specs/2026-10-08-dj-mode-design.md` (§2, §6, §7 ipo-ds and Performance). Read it before any task. Plan 7 (`docs/superpowers/plans/2026-10-08-dj-mode-07-scratch-engine.md`) must be complete: `runtime/` on branch `dj-mode` with its six commits.

**Execution:** Opus (high effort) orchestrates; every task runs as one Sonnet implementer subagent plus one Sonnet reviewer subagent (`model: "sonnet"`), per `superpowers:subagent-driven-development`. The orchestrator runs each task's verification commands itself before starting the next task.

## Global Constraints

- Work on branch `feature/dj-mode` in this repo (`~/orca/workspaces/ds-man/tang`). Framework code goes in the fork (`runtime/`), never here; this plan changes no fork code.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives and control flow from `solid-js`.
- Theme slots are complete Tailwind-like class literals (the build compiles only literal class strings). Image keys (`.png`/`.svg` paths relative to `app/`) are string literals too.
- Commits: Conventional Commits (`feat(dj): …`, `test(dj): …`, `chore: …`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Keep build products, logs and captures out of Git (`dist/` is ignored).
- Do not discover tests or sources through `runtime/`: run `bun run test` (it targets `./tests`) or a single file under `tests/`.
- Every task ends with `bun run check` and `bun run test` green.
- Layout numbers (logical px, bottom screen 320×240): platter box at (10, 20), 200×200, centre (110, 120); label 88×88 at (56, 56) inside it; side panel at (220, 10), 90×220; the panel's DJ gel (34 px) at (28, 176) inside the panel, centre (265, 203) on screen; the deck's DJ gel is the sixth transport gel, centre (293, 196).
- Platter math: 33⅓ RPM = 200°/s = 10/3° per 60 Hz frame; rate = Δ° per frame × 60 / 200; EMA α = 0.5; clamp ±4; snap to 0 below 1/64; 16 px dead zone around the centre.
- SELECT toggles DJ Mode only while not searching and while neither L nor R is held.

## Review Focus

1. **Leaving DJ Mode mid-drag** (SELECT, opening the keyboard with X, or a track change): the host must get `scratchEnd()`, or playback stays silent with the platter grabbed. Pinned in Task 7 (unmount during a drag; open mid-drag).
2. **A finger that crosses the 12 o'clock line or the spindle** must not produce a 360° jump in rate. Pinned in Task 3 (`wrapDelta` across 0/360) and Task 7 (dead-zone re-entry sends no spike).
3. **A finger held still on the record** must settle on exactly `scratchRate(0)` and stop sending. Pinned in Task 3 (`smoothRate` snap) and Task 7.
4. **Touching the record with nothing playing** must not send scratch ops or crash. Pinned in Task 7.
5. **The deck's sixth gel** re-centres the transport row, so every existing target moves left by 22 px: a tap on an old coordinate lands in a gap. Pinned in Task 5 (the tap tests move to the new centres 27, 75, 138, 201, 249 and still hit; the gallery's gel rows grow to six).

---

## File Structure

| File | Responsibility |
|---|---|
| `runtime` (submodule pin) | Moves to the fork's `dj-mode` branch. |
| `app/player/reducer.ts` | `IDLE_STATUS.scratching`. |
| `app/player/controller.ts` | `scratch(active)`, `scratchRate(rate)`. |
| `app/session.ts` | `Session.scratching`, `Session.scratch`; every-frame polling while held. |
| `app/dj/platter.ts` (new) | Pure platter numbers: layout, angles, rates, spin. |
| `scripts/vinyl-png.ts` (new) | Generates `app/theme/vinyl.png` and `app/theme/label.png`. |
| `app/theme/vinyl.png`, `app/theme/label.png`, `app/images.json` (new) | Baked rotating art, sampled linear. |
| `app/theme/icons/dj-ink.svg`, `dj-white.svg` (new) | The DJ gel's record glyph. |
| `app/theme/theme.ts`, `app/theme/aqua.ts` | `"dj"` kind and icon; platter and panel slots. |
| `app/theme/parts/deck.tsx` | `TransportRow.onDj` and the sixth gel. |
| `app/theme/parts/platter.tsx` (new) | `Platter` (rotating disc, label, spindle) and `DjPanel`. |
| `app/dj/dj-mode.tsx` (new) | The DJ screen: spin, gesture, rates, panel wiring. |
| `app/now-playing/now-playing.tsx` | Passes `onDj` to the transport row. |
| `app/app.tsx` | Bottom-screen mode: deck / DJ / keyboard; SELECT. |
| `app/gallery/states.tsx`, `app/gallery/names.ts` | `dj` state; gel sheet rows with the DJ gel. |
| `tests/platter.test.ts`, `tests/vinyl-png.test.ts`, `tests/dj.test.ts` (new) | Unit and headless tests. |
| `tests/controller.test.ts`, `tests/session.test.ts`, `tests/gallery.test.ts`, `tests/gels.test.ts`, `tests/theme.test.ts`, `tests/perf.test.ts` | Extended. |
| `scripts/perf.ts`, `docs/perf.md`, `README.md` | `dj` perf scenario and results; SELECT in the controls table. |

---

### Task 1: Pin the runtime to the scratch engine

**Files:**
- Modify: `runtime` (submodule pointer)
- Modify: `app/player/reducer.ts:37-40`

**Interfaces:**
- Consumes: Plan 7's contract v3 (`LocalStatus.scratching`, `LocalMedia.scratchBegin/scratchRate/scratchEnd`, sim fake ops).
- Produces: `IDLE_STATUS.scratching === false`; ipo-ds type-checks against contract v3.

- [ ] **Step 1: See the type error**

```bash
git -C runtime rev-parse --abbrev-ref HEAD   # dj-mode
git -C runtime log --oneline -1
bun run check
```
Expected: `bun run check` FAILS in `app/player/reducer.ts` — `Property 'scratching' is missing in type … but required in type 'LocalStatus'`.

- [ ] **Step 2: Add the field**

In `app/player/reducer.ts`, change `IDLE_STATUS` to:

```ts
export const IDLE_STATUS: LocalStatus = Object.freeze({
  phase: "idle", trackId: -1, openSerial: 0, positionMs: 0, durationMs: 0, scanning: false, scanGeneration: 0, underruns: 0, error: "",
  decodeLoad: 0, artHandles: 0, scanMs: 0, scratching: false,
});
```

- [ ] **Step 3: Verify**

Run: `bun run check && bun run test`
Expected: tsc clean; 154 tests pass.

- [ ] **Step 4: Commit**

```bash
git add runtime app/player/reducer.ts
git commit -m "chore: pin runtime to the media.local scratch engine (contract v3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scratch commands in the controller and session

**Files:**
- Modify: `app/player/controller.ts`
- Modify: `app/session.ts`
- Test: `tests/controller.test.ts`, `tests/session.test.ts`

**Interfaces:**
- Consumes: SDK `LocalMedia.scratchBegin(): void; scratchRate(rate: number): void; scratchEnd(): void;`, `LocalStatus.scratching`.
- Produces (used by Task 7):
  - `PlayerController.scratch(active: boolean): void` — sends begin/end, re-reads the status, notifies `onChange`.
  - `PlayerController.scratchRate(rate: number): void` — sends only.
  - `Session.scratching: Accessor<boolean>`
  - `Session.scratch: { begin(): void; rate(rate: number): void; end(): void }` — inert without `media.local`; a host error marks `readFailed` instead of throwing.
  - While `status().scratching`, the session reads the status every frame.

- [ ] **Step 1: Write the failing tests**

Append to `tests/controller.test.ts`:

```ts
test("scratch grabs and lets go with the status read back; the rate only sends", () => {
  const { host, player, frames } = setup([song("a.mp3", { durationMs: 10_000 })]);
  player.dispatch({ type: "playFrom", ids: [0], startId: 0 });
  frames(6); // loading, then 500 ms of playback
  expect(player.state().status).toMatchObject({ phase: "playing", positionMs: 500, scratching: false });
  player.scratch(true);
  expect(player.state().status.scratching).toBe(true);
  player.scratchRate(-1);
  frames(2);
  expect(player.state().status.positionMs).toBe(300);
  player.scratch(false);
  expect(player.state().status.scratching).toBe(false);
  expect(host.log.filter((entry) => entry.startsWith("scratch"))).toEqual(["scratchBegin()", "scratchRate(-1)", "scratchEnd()"]);
});
```

In `tests/session.test.ts`, inside the first test after `session.rescan();`, add:

```ts
    session.scratch.begin();
    session.scratch.rate(2);
    session.scratch.end();
    expect(session.scratching()).toBe(false);
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test --conditions=browser tests/controller.test.ts tests/session.test.ts`
Expected: FAIL — `player.scratch is not a function`; `session.scratch` is undefined.

- [ ] **Step 3: Implement the controller entries**

In `app/player/controller.ts`, extend the interface:

```ts
export interface PlayerController {
  state(): PlayerState;
  dispatch(action: PlayerAction): void;
  poll(): void;
  /** Grabs (true) or lets go of (false) the platter, then reads the status back. */
  scratch(active: boolean): void;
  /** The platter's rate while held. Sends only: it runs every frame of a drag. */
  scratchRate(rate: number): void;
}
```

and add to the returned object, after `poll`:

```ts
    scratch: (active) => {
      if (active) media.scratchBegin();
      else media.scratchEnd();
      step({ type: "hostStatus", status: media.status() });
    },
    scratchRate: (rate) => media.scratchRate(rate),
```

- [ ] **Step 4: Implement the session entries**

In `app/session.ts`:

1. In `interface Session`, after `coverLoading: Accessor<boolean>;` add:

```ts
  /** The guest holds the platter (DJ Mode). */
  scratching: Accessor<boolean>;
  /** The platter: grab, rate while held (a signed multiple of normal speed), let go. Inert without media.local. */
  scratch: { begin(): void; rate(rate: number): void; end(): void };
```

2. In the `onFrame` poll, change the skip condition to read the status every frame while scratching:

```ts
      if (!pollNext && !statusFailed() && status().phase !== "loading" && !status().scratching && frame % POLL_EVERY !== 0) return;
```

   and extend the comment above it with: `While the platter is held the status is read every frame, so the time follows the finger.`

3. Before `return {`, add:

```ts
  const scratching = createMemo(() => status().scratching);
  /** Grab or let go: like a command, the reply is published on this frame. */
  function scratchCommand(active: boolean): void {
    pollNext = true;
    if (!controller) return;
    try {
      controller.scratch(active);
    } catch {
      setStatusFailed(true);
      return;
    }
    publish(controller.state().status);
  }
```

4. In the returned object, after `coverLoading,` add:

```ts
    scratching,
    scratch: {
      begin: () => scratchCommand(true),
      rate: (rate) => {
        try {
          controller?.scratchRate(rate);
        } catch {
          setStatusFailed(true);
        }
      },
      end: () => scratchCommand(false),
    },
```

- [ ] **Step 5: Verify**

Run: `bun run check && bun run test`
Expected: tsc clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/player/controller.ts app/session.ts tests/controller.test.ts tests/session.test.ts
git commit -m "feat(dj): scratch begin, rate and end through the controller and session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Platter math

**Files:**
- Create: `app/dj/platter.ts`
- Test: `tests/platter.test.ts`

**Interfaces:**
- Produces (used by Tasks 6 and 7), all pure:
  - `PLATTER = { x: 10, y: 20, size: 200, cx: 110, cy: 120 }`
  - `MOTOR_DEG_PER_S = 200`, `SPIN_PER_FRAME = 200 / 60`, `DEAD_ZONE_PX = 16`, `MAX_RATE = 4`
  - `angleAt(cx: number, cy: number, x: number, y: number): number` — degrees clockwise from 12 o'clock, [0, 360)
  - `wrap360(deg: number): number` — [0, 360)
  - `wrapDelta(deg: number): number` — (−180, 180]
  - `inDeadZone(cx: number, cy: number, x: number, y: number): boolean`
  - `fingerRate(deltaDeg: number): number` — Δ° per frame → rate
  - `smoothRate(prev: number, next: number): number` — EMA α 0.5, clamp ±4, snap to 0 below 1/64

- [ ] **Step 1: Write the failing test**

`tests/platter.test.ts`:

```ts
import { expect, test } from "bun:test";
import { angleAt, DEAD_ZONE_PX, fingerRate, inDeadZone, MAX_RATE, PLATTER, smoothRate, SPIN_PER_FRAME, wrap360, wrapDelta } from "../app/dj/platter.ts";

const { cx, cy } = PLATTER;

test("the platter sits left of the side panel, centred in its box", () => {
  expect(PLATTER).toEqual({ x: 10, y: 20, size: 200, cx: 110, cy: 120 });
  expect(PLATTER.x + PLATTER.size).toBeLessThanOrEqual(220 - 10);
});

test("angles run clockwise from 12 o'clock", () => {
  expect(angleAt(cx, cy, cx, cy - 60)).toBeCloseTo(0);
  expect(angleAt(cx, cy, cx + 60, cy)).toBeCloseTo(90);
  expect(angleAt(cx, cy, cx, cy + 60)).toBeCloseTo(180);
  expect(angleAt(cx, cy, cx - 60, cy)).toBeCloseTo(270);
  expect(angleAt(cx, cy, cx + 60, cy - 60)).toBeCloseTo(45);
});

test("wrap360 and wrapDelta keep turns short across 12 o'clock", () => {
  expect(wrap360(-10)).toBeCloseTo(350);
  expect(wrap360(370)).toBeCloseTo(10);
  expect(wrapDelta(5 - 355)).toBeCloseTo(10);   // 355° → 5°: 10° clockwise, not -350°
  expect(wrapDelta(355 - 5)).toBeCloseTo(-10);
  expect(wrapDelta(180)).toBe(180);
  expect(wrapDelta(-180)).toBe(180);
  expect(wrapDelta(190)).toBeCloseTo(-170);
});

test("a finger moving with the motor plays at 1x; one turn is 1.8 s of audio", () => {
  expect(SPIN_PER_FRAME).toBeCloseTo(10 / 3);
  expect(fingerRate(SPIN_PER_FRAME)).toBeCloseTo(1);
  expect(fingerRate(-SPIN_PER_FRAME * 2)).toBeCloseTo(-2);
  expect(fingerRate(0)).toBe(0);
  expect((360 / 200) * 1000).toBe(1800);
});

test("rates are smoothed, clamped to ±4 and settle on exactly 0", () => {
  expect(smoothRate(0, 3)).toBe(1.5);
  expect(smoothRate(1.5, 3)).toBe(2.25);
  expect(smoothRate(4, 10)).toBe(MAX_RATE);
  expect(smoothRate(-4, -10)).toBe(-MAX_RATE);
  let rate = 3;
  for (let i = 0; i < 20; i++) rate = smoothRate(rate, 0);
  expect(rate).toBe(0);
  expect(smoothRate(0.01, 0)).toBe(0);
});

test("the spindle is a dead zone", () => {
  expect(inDeadZone(cx, cy, cx, cy)).toBe(true);
  expect(inDeadZone(cx, cy, cx + DEAD_ZONE_PX - 1, cy)).toBe(true);
  expect(inDeadZone(cx, cy, cx + DEAD_ZONE_PX, cy)).toBe(false);
  expect(inDeadZone(cx, cy, cx + 12, cy + 12)).toBe(false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test --conditions=browser tests/platter.test.ts`
Expected: FAIL — cannot find module `../app/dj/platter.ts`.

- [ ] **Step 3: Implement**

`app/dj/platter.ts`:

```ts
// DJ Mode's platter as numbers: where it sits on the bottom screen, how a
// finger's angle becomes a playback rate, and how far the motor turns it each
// frame. Pure (tests/platter.test.ts); app/dj/dj-mode.tsx wires it up.

/** The platter's 200×200 box on the bottom screen (logical px) and its centre. */
export const PLATTER = { x: 10, y: 20, size: 200, cx: 110, cy: 120 } as const;
/** 33⅓ RPM. */
export const MOTOR_DEG_PER_S = 200;
/** The motor's turn per 60 Hz frame. */
export const SPIN_PER_FRAME = MOTOR_DEG_PER_S / 60;
/** A finger this close to the spindle holds the record still. */
export const DEAD_ZONE_PX = 16;
/** The fastest scratch either way (LOCALMEDIA.maxScratchRate). */
export const MAX_RATE = 4;
/** A smoothed rate below this settles on 0, so a still finger sends one final 0. */
const REST = 1 / 64;

export function wrap360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** The short way round: (−180, 180]. */
export function wrapDelta(deg: number): number {
  const d = wrap360(deg);
  return d > 180 ? d - 360 : d;
}

/** The angle of (x, y) around (cx, cy) in degrees, clockwise from 12 o'clock (screen y grows down). */
export function angleAt(cx: number, cy: number, x: number, y: number): number {
  return wrap360((Math.atan2(x - cx, cy - y) * 180) / Math.PI);
}

export function inDeadZone(cx: number, cy: number, x: number, y: number): boolean {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < DEAD_ZONE_PX * DEAD_ZONE_PX;
}

/** Degrees the finger turned the platter this frame, as a multiple of normal speed. */
export function fingerRate(deltaDeg: number): number {
  return (deltaDeg * 60) / MOTOR_DEG_PER_S;
}

/** Half the previous rate plus half this frame's, clamped to ±MAX_RATE, settling on 0. */
export function smoothRate(prev: number, next: number): number {
  const rate = Math.max(-MAX_RATE, Math.min(MAX_RATE, (prev + next) / 2));
  return Math.abs(rate) < REST ? 0 : rate;
}
```

- [ ] **Step 4: Verify**

Run: `bun run check && bun run test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/dj/platter.ts tests/platter.test.ts
git commit -m "feat(dj): platter math: angles, rates, smoothing, dead zone, motor spin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Vinyl and label art

**Files:**
- Create: `scripts/vinyl-png.ts`
- Create (generated, committed): `app/theme/vinyl.png`, `app/theme/label.png`
- Create: `app/images.json`
- Test: `tests/vinyl-png.test.ts`

**Interfaces:**
- Consumes: `encodePng(width, height, rgba)` from `scripts/png.ts`; `decodePng(bytes)` from `runtime/framework/compiler/pak.ts` (returns `{ width, height, rgba }`).
- Produces (used by Task 6): image keys `"theme/vinyl.png"` (256×256 RGBA, drawn at 200×200) and `"theme/label.png"` (128×128, drawn at 88×88), both bilinear via `app/images.json`. Script exports `VINYL_PX = 256`, `LABEL_PX = 128`, `vinylPixels(): Uint8Array`, `labelPixels(): Uint8Array`.

- [ ] **Step 1: Write the failing test**

`tests/vinyl-png.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "../runtime/framework/compiler/pak.ts";
import { LABEL_PX, labelPixels, VINYL_PX, vinylPixels } from "../scripts/vinyl-png.ts";

const ROOT = join(import.meta.dir, "..");
const vinyl = vinylPixels();
const label = labelPixels();
const at = (rgba: Uint8Array, size: number, x: number, y: number) => {
  const i = (Math.floor(y) * size + Math.floor(x)) * 4;
  return { r: rgba[i]!, g: rgba[i + 1]!, b: rgba[i + 2]!, a: rgba[i + 3]! };
};
/** The vinyl pixel at `radius` (texture px) and `deg` clockwise from 12 o'clock. */
const polar = (radius: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return at(vinyl, VINYL_PX, 128 + radius * Math.sin(rad), 128 - radius * Math.cos(rad));
};

test("the vinyl is an opaque disc with a transparent centre hole and transparent corners", () => {
  expect(vinyl.length).toBe(VINYL_PX * VINYL_PX * 4);
  expect(at(vinyl, VINYL_PX, 128, 128).a).toBe(0);
  expect(polar(40, 0).a).toBe(0);    // inside the 84 px (at 200) hole
  expect(polar(90, 0).a).toBe(255);
  expect(polar(120, 200).a).toBe(255);
  expect(at(vinyl, VINYL_PX, 2, 2).a).toBe(0);
  expect(at(vinyl, VINYL_PX, 253, 253).a).toBe(0);
});

test("the vinyl shows its rotation: a sheen on one side, grooves along every radius", () => {
  expect(polar(100, 45).r - polar(100, 225).r).toBeGreaterThanOrEqual(20);
  const shades = new Set<number>();
  for (let r = 64; r < 120; r++) shades.add(polar(r, 135).r);
  expect(Math.max(...shades) - Math.min(...shades)).toBeGreaterThanOrEqual(8);
});

test("the label is opaque Aqua blue with an off-centre cream mark", () => {
  expect(label.length).toBe(LABEL_PX * LABEL_PX * 4);
  const mark = at(label, LABEL_PX, 40, 40);
  expect(mark.r).toBeGreaterThan(0xe0);
  const blue = at(label, LABEL_PX, 100, 30);
  expect(blue.b).toBeGreaterThan(blue.r);
  expect(blue.a).toBe(255);
  // The mark is not mirrored: the opposite corner is blue.
  expect(at(label, LABEL_PX, 88, 88).b).toBeGreaterThan(at(label, LABEL_PX, 88, 88).r);
});

test("the committed PNGs are the generator's output", () => {
  const committed = decodePng(new Uint8Array(readFileSync(join(ROOT, "app/theme/vinyl.png"))));
  expect([committed.width, committed.height]).toEqual([VINYL_PX, VINYL_PX]);
  expect(Buffer.from(committed.rgba).equals(Buffer.from(vinyl))).toBe(true);
  const committedLabel = decodePng(new Uint8Array(readFileSync(join(ROOT, "app/theme/label.png"))));
  expect([committedLabel.width, committedLabel.height]).toEqual([LABEL_PX, LABEL_PX]);
  expect(Buffer.from(committedLabel.rgba).equals(Buffer.from(label))).toBe(true);
});

test("both are sampled linear, for rotation", () => {
  const images = JSON.parse(readFileSync(join(ROOT, "app/images.json"), "utf8"));
  expect(images).toEqual({ "theme/vinyl.png": { linear: true }, "theme/label.png": { linear: true } });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test --conditions=browser tests/vinyl-png.test.ts`
Expected: FAIL — cannot find module `../scripts/vinyl-png.ts`.

- [ ] **Step 3: Write the generator**

`scripts/vinyl-png.ts`:

```ts
// DJ Mode's platter art, generated: a 256 px vinyl record (drawn at 200 px,
// over the label) with grooves and a one-sided sheen so its rotation reads,
// and a 128 px Aqua label (drawn at 88 px) for tracks without cover art, with
// an off-centre mark. The SVG baker draws flat shapes only, so these are PNGs.
//
//   bun scripts/vinyl-png.ts      (rewrites app/theme/vinyl.png and label.png)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.ts";

export const VINYL_PX = 256;
export const LABEL_PX = 128;

/** Radii in texture px (×200/256 on screen): the disc, its centre hole (84 px across on screen), the grooved band. */
const R_OUTER = 128;
const R_HOLE = 54;
const R_GROOVES_IN = 62;
const R_GROOVES_OUT = 122;

/** How much of a pixel at distance r lies inside a circle of radius edge (1 px soft edge). */
function inside(edge: number, r: number): number {
  return Math.max(0, Math.min(1, edge - r + 0.5));
}

export function vinylPixels(): Uint8Array {
  const out = new Uint8Array(VINYL_PX * VINYL_PX * 4);
  const c = VINYL_PX / 2;
  for (let y = 0; y < VINYL_PX; y++) {
    for (let x = 0; x < VINYL_PX; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const alpha = inside(R_OUTER, r) * (1 - inside(R_HOLE, r));
      let shade = 22;
      if (r < R_GROOVES_IN) shade = 14; // the run-out beside the label
      else if (r > R_GROOVES_OUT) shade = 30; // the rim
      else if (Math.floor(r) % 4 === 0) shade = 32; // a groove ring every 4 px
      // One soft wedge of light centred on 45°: a turn moves it.
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const off = Math.abs(((deg - 45 + 540) % 360) - 180);
      shade += Math.round(40 * Math.max(0, 1 - off / 30));
      const i = (y * VINYL_PX + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = shade;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

const TOP = [0x4a, 0x80, 0xda];
const BOTTOM = [0x2b, 0x4f, 0x8c];
const CREAM = [0xf4, 0xf6, 0xe6];

export function labelPixels(): Uint8Array {
  const out = new Uint8Array(LABEL_PX * LABEL_PX * 4);
  for (let y = 0; y < LABEL_PX; y++) {
    for (let x = 0; x < LABEL_PX; x++) {
      const t = y / (LABEL_PX - 1);
      let rgb = TOP.map((top, k) => top + (BOTTOM[k]! - top) * t);
      // A cream dot up and to the left, and a cream bar lower right of centre.
      const dot = inside(12, Math.hypot(x + 0.5 - 40, y + 0.5 - 40));
      const bar = x >= 70 && x < 100 && y >= 60 && y < 66 ? 1 : 0;
      const mark = Math.max(dot, bar);
      rgb = rgb.map((v, k) => v + (CREAM[k]! - v) * mark);
      const i = (y * LABEL_PX + x) * 4;
      out[i] = Math.round(rgb[0]!);
      out[i + 1] = Math.round(rgb[1]!);
      out[i + 2] = Math.round(rgb[2]!);
      out[i + 3] = 255;
    }
  }
  return out;
}

if (import.meta.main) {
  const theme = join(import.meta.dir, "../app/theme");
  writeFileSync(join(theme, "vinyl.png"), encodePng(VINYL_PX, VINYL_PX, vinylPixels()));
  writeFileSync(join(theme, "label.png"), encodePng(LABEL_PX, LABEL_PX, labelPixels()));
  console.log("wrote app/theme/vinyl.png and app/theme/label.png");
}
```

`app/images.json`:

```json
{
  "theme/vinyl.png": { "linear": true },
  "theme/label.png": { "linear": true }
}
```

- [ ] **Step 4: Generate the PNGs and verify**

```bash
bun scripts/vinyl-png.ts
bun run check && bun run test
```
Expected: `wrote app/theme/vinyl.png and app/theme/label.png`; all tests pass. Open both PNGs in Preview to confirm they look like a black record with a hole and a blue label with a cream dot (`open app/theme/vinyl.png app/theme/label.png`); the orchestrator checks this before the commit.

- [ ] **Step 5: Commit**

```bash
git add scripts/vinyl-png.ts app/theme/vinyl.png app/theme/label.png app/images.json tests/vinyl-png.test.ts
git commit -m "feat(dj): generated vinyl and label art, sampled linear for rotation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: The DJ gel on the deck

**Files:**
- Create: `app/theme/icons/dj-ink.svg`, `app/theme/icons/dj-white.svg`
- Modify: `app/theme/theme.ts` (`TransportKind`, `IconName`)
- Modify: `app/theme/aqua.ts` (`ICONS`, `transportClass`)
- Modify: `app/theme/parts/deck.tsx` (`TransportButton`, `TransportRow`)
- Modify: `app/gallery/states.tsx` (`GelSheetBottom`)
- Test: `tests/theme.test.ts`, `tests/gels.test.ts`, `tests/gallery.test.ts`, `tests/app.test.ts`

**Interfaces:**
- Produces (used by Tasks 6 and 7):
  - `TransportKind` includes `"dj"`; `IconName` includes `"dj"`; `AQUA.icon("dj", ink)` returns `"theme/icons/dj-white.svg"` for `"white"`, `"theme/icons/dj-ink.svg"` otherwise.
  - `"dj"` is a 34 px mode gel (`MODE_BLUE` on, `MODE_GREY` off, `MODE_OFF` disabled), white ink when on.
  - `TransportRow` props gain `dj?: boolean` (the gel's on state, default false) and `onDj?: () => void`. The DJ gel is the sixth child and is always enabled (DJ Mode opens with nothing playing too).
  - Transport centres on the bottom screen (y 196): shuffle 27, prev 75, play/pause 138, next 201, repeat 249, DJ 293.

- [ ] **Step 1: Write the failing tests**

`tests/theme.test.ts`, in `"every icon the theme names exists and bakes to an opaque image of its size"`: change the name list to `["shuffle", "repeat", "prev", "next", "play", "pause", "dj"] as IconName[]`. In `aquaLiterals`, change the transport kind list to `["shuffle", "prev", "play", "pause", "next", "repeat", "dj"] as TransportKind[]`.

`tests/gels.test.ts`: change `KINDS` to `["shuffle", "prev", "play", "pause", "next", "repeat", "dj"]` and in `gelCases` change `const small = kind === "shuffle" || kind === "repeat";` to `const small = kind === "shuffle" || kind === "repeat" || kind === "dj";`.

`tests/gallery.test.ts`, in `"gels: the reference pill, every transport state, …"`, change the transport rows block to:

```ts
  // Transport: an enabled blue/grey row, an enabled grey row, a disabled row (no gloss: it would show through at 45 %).
  const rows = findAll(world.tree("auxiliary"), (node) => node.children.length === 6 && node.children.every((child) => child.rect !== null && child.rect[2] === child.rect[3] && child.rect[2] >= 34));
  expect(rows).toHaveLength(3);
  expect(rows[0]!.children.map(glossOffset)).toEqual([[5, 3, 24, 16], [6, 3, 30, 20], [10, 3, 44, 30], [6, 3, 30, 20], [5, 3, 24, 16], [5, 3, 24, 16]]);
  expect(rows[2]!.children.every((button) => button.children[0]!.hidden)).toBe(true);
```

`tests/app.test.ts`: the row re-centres, so move the taps to the new centres:
- `"transport taps pause, skip, shuffle and cycle repeat"`: `touch(rig, 160, 196)` → `touch(rig, 138, 196)`; `touch(rig, 223, 196)` → `touch(rig, 201, 196)`; `touch(rig, 49, 196)` → `touch(rig, 27, 196)`; both `touch(rig, 271, 196)` → `touch(rig, 249, 196)`.
- `"transport taps do nothing while nothing has played"`: `for (const x of [49, 97, 160, 223, 271])` → `for (const x of [27, 75, 138, 201, 249])`.
- Every other `touch(rig, 160, 196)` in the file → `touch(rig, 138, 196)` (the play/pause gel; 160 still hits it, but keep one centre).
- Add, after `"transport taps do nothing while nothing has played"`:

```ts
test("the deck's transport row ends with the DJ gel, centred at 293", async () => {
  const rig = await boot();
  const row = flat(rig.world.tree("auxiliary")).find((node) => node.rect !== null && node.rect[1] === 160 && node.rect[3] === 72)!;
  expect(row.children).toHaveLength(6);
  const dj = row.children[5]!.rect!;
  expect([dj[0] + dj[2] / 2, dj[1] + dj[3] / 2, dj[2]]).toEqual([293, 196, 34]);
}, 120_000);
```

- [ ] **Step 2: Run to see them fail**

Run: `bun run check; bun test --conditions=browser tests/theme.test.ts tests/gels.test.ts tests/gallery.test.ts tests/app.test.ts`
Expected: tsc FAILS (`"dj"` is not a `TransportKind`); the tests fail on the missing icons, five-gel rows and moved centres.

- [ ] **Step 3: Draw the icons**

`app/theme/icons/dj-ink.svg` (a 16-gon record with an 8-gon grey label):

```svg
<svg width="16" height="16" viewBox="0 0 16 16"><path d="M15 8L14.47 10.68L12.95 12.95L10.68 14.47L8 15L5.32 14.47L3.05 12.95L1.53 10.68L1 8L1.53 5.32L3.05 3.05L5.32 1.53L8 1L10.68 1.53L12.95 3.05L14.47 5.32Z" fill="#2b2b2b"/><path d="M10.5 8L9.77 9.77L8 10.5L6.23 9.77L5.5 8L6.23 6.23L8 5.5L9.77 6.23Z" fill="#8a8a8a"/></svg>
```

`app/theme/icons/dj-white.svg` (white record, Aqua-blue label):

```svg
<svg width="16" height="16" viewBox="0 0 16 16"><path d="M15 8L14.47 10.68L12.95 12.95L10.68 14.47L8 15L5.32 14.47L3.05 12.95L1.53 10.68L1 8L1.53 5.32L3.05 3.05L5.32 1.53L8 1L10.68 1.53L12.95 3.05L14.47 5.32Z" fill="#ffffff"/><path d="M10.5 8L9.77 9.77L8 10.5L6.23 9.77L5.5 8L6.23 6.23L8 5.5L9.77 6.23Z" fill="#4a80da"/></svg>
```

- [ ] **Step 4: Add the kind to the theme**

`app/theme/theme.ts`:

```ts
export type TransportKind = "shuffle" | "prev" | "play" | "pause" | "next" | "repeat" | "dj";
export type IconName = "shuffle" | "repeat" | "prev" | "next" | "play" | "pause" | "dj";
```

`app/theme/aqua.ts`:
- In `ICONS`, after the `pause` entry add:

```ts
  dj: { white: "theme/icons/dj-white.svg", ink: "theme/icons/dj-ink.svg", blue: "theme/icons/dj-ink.svg" },
```

- In `transportClass`, change `const mode = kind === "shuffle" || kind === "repeat";` to `const mode = kind === "shuffle" || kind === "repeat" || kind === "dj";`.

- [ ] **Step 5: Add the gel to the deck**

In `app/theme/parts/deck.tsx`, `TransportButton`:
- Change the `ink` line to:

```ts
  const ink = () => (enabled() && (big() || ((props.kind === "shuffle" || props.kind === "repeat" || props.kind === "dj") && props.on)) ? "white" : "ink");
```

- In the fallback `<Image …>`, change the cast to `props.kind as "shuffle" | "repeat" | "prev" | "next" | "dj"`.

`TransportRow`: add the props `dj?: boolean;` and `onDj?: () => void;` (after `onRepeat?`), and after the repeat button add:

```tsx
      <TransportButton kind="dj" on={props.dj ?? false} onPress={props.onDj} theme={props.theme} />
```

Update the file's header comment: `… transport buttons (shuffle, previous, play/pause, next, repeat, and the DJ Mode gel).`

In `app/gallery/states.tsx`, `GelSheetBottom`: add `<TransportButton kind="dj" on />` after `<TransportButton kind="repeat" on />`, `<TransportButton kind="dj" />` after the second row's repeat, and `<TransportButton kind="dj" enabled={false} />` after the third row's repeat. Update its doc comment to mention the DJ gel.

- [ ] **Step 6: Verify**

Run: `bun run check && bun run test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/theme/icons/dj-ink.svg app/theme/icons/dj-white.svg app/theme/theme.ts app/theme/aqua.ts app/theme/parts/deck.tsx app/gallery/states.tsx tests/theme.test.ts tests/gels.test.ts tests/gallery.test.ts tests/app.test.ts
git commit -m "feat(dj): a DJ gel ends the deck's transport row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The platter and side panel parts

**Files:**
- Create: `app/theme/parts/platter.tsx`
- Modify: `app/theme/theme.ts` (new slots), `app/theme/aqua.ts` (their values)
- Modify: `app/gallery/names.ts`, `app/gallery/states.tsx` (the `dj` state)
- Test: `tests/gallery.test.ts`, `tests/theme.test.ts`

**Interfaces:**
- Consumes: Task 4's image keys; Task 5's `TransportButton kind="dj"`.
- Produces (used by Task 7):
  - `Platter(props: { angle: number; cover: number; loading?: boolean; ref?: (node: unknown) => void; theme?: Theme })` — the 200×200 box at (10, 20); everything but the spindle and the loading spinner turns by `angle` degrees about the centre; `cover > 0` shows that texture as the label, else `theme/label.png`.
  - `DjPanel(props: { title: string; artist: string; elapsed: string; remaining: string; enabled: boolean; onPrev?: () => void; onNext?: () => void; onDeck?: () => void; theme?: Theme })` — the 90×220 panel at (220, 10); its DJ gel (on) sits at (248, 186), 34×34.
  - `DJ_TEXT_PX = 78`.
  - Theme slots: `platter`, `platterDisc`, `platterLabel`, `platterLoading`, `spindle`, `vinylArt`, `labelArt`, `djPanel`, `djTime`, `djRemaining`, `djSkipRow`, `djDeckGel`.

- [ ] **Step 1: Write the failing tests**

In `tests/theme.test.ts`, `aquaLiterals`: change the string filter so image keys are not treated as classes:

```ts
    if (typeof value === "string" && key !== "name" && key !== "osk" && !value.endsWith(".svg") && !value.endsWith(".png")) out.push(value);
```

and add a test:

```ts
test("the platter's art keys name the generated PNGs", () => {
  expect(AQUA.vinylArt).toBe("theme/vinyl.png");
  expect(AQUA.labelArt).toBe("theme/label.png");
  for (const key of [AQUA.vinylArt, AQUA.labelArt]) expect(existsSync(join(ROOT, "app", key)), key).toBe(true);
});
```

In `app/gallery/names.ts`: `export const GALLERY_STATES = ["main", "artists", "album", "scanning", "empty", "stress", "loading", "gels", "dj", "search"] as const;`

In `tests/gallery.test.ts`, before the `"search: …"` test, add:

```ts
test("dj: the platter's box and spindle; the side panel with the song, its time and the deck gel", () => {
  show("dj");
  expectAll(screenText(world, "auxiliary"), ["One More Time", "Daft Punk", "1:42", "-3:58"]);
  const boxes = findAll(world.tree("auxiliary"), (node) => node.rect !== null).map((node) => node.rect!.join(","));
  expect(boxes).toContain("10,20,200,200");  // the platter
  expect(boxes).toContain("107,117,6,6");    // the spindle at its centre
  expect(boxes).toContain("220,10,90,220");  // the side panel
  expect(boxes).toContain("248,186,34,34");  // its gel back to the deck
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun run check; bun test --conditions=browser tests/theme.test.ts tests/gallery.test.ts`
Expected: tsc FAILS (`vinylArt` is not on `Theme`); the gallery test fails (no `dj` state).

- [ ] **Step 3: Add the theme slots**

In `app/theme/theme.ts`, in `interface Theme`, after `idlePanel: string;` add:

```ts
  /** DJ Mode (app/dj): the platter's 200×200 box, its turning disc, the label well inside it, the
   * cover spinner's place over the label, and the still spindle. */
  platter: string;
  platterDisc: string;
  platterLabel: string;
  platterLoading: string;
  spindle: string;
  /** Image keys (generated by scripts/vinyl-png.ts): the vinyl, drawn over the label, and the label shown without cover art. */
  vinylArt: string;
  labelArt: string;
  /** The side panel: an LCD column with the song, its time, prev / next and the gel back to the deck. */
  djPanel: string;
  djTime: string;
  djRemaining: string;
  djSkipRow: string;
  /** Holds the panel's DJ gel at a fixed place (the touch target tests rely on it). */
  djDeckGel: string;
```

In `app/theme/aqua.ts`, in `AQUA`, after `idlePanel: …,` add:

```ts
  platter: "absolute left-[10] top-[20] w-[200] h-[200]",
  platterDisc: "absolute left-[0] top-[0] w-[200] h-[200]",
  platterLabel: "absolute left-[56] top-[56] w-[88] h-[88]",
  platterLoading: "absolute left-[84] top-[84] w-[32] h-[32]",
  spindle: "absolute left-[97] top-[97] w-[6] h-[6] rounded-[3] border border-[#5a5a5a] bg-gradient-to-b from-[#f4f4f4] via-[#d6d6d6] to-[#a8a8a8]",
  vinylArt: "theme/vinyl.png",
  labelArt: "theme/label.png",
  djPanel: "absolute left-[220] top-[10] w-[90] h-[220] flex-col items-center pt-[8] gap-[4] overflow-hidden rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  djTime: "text-base font-bold text-[#1f2018] mt-[4]",
  djRemaining: "text-xs text-[#3c3e31]",
  djSkipRow: "flex-row items-center gap-[2] mt-[6]",
  djDeckGel: "absolute left-[28] top-[176] w-[34] h-[34]",
```

- [ ] **Step 4: Write the parts**

`app/theme/parts/platter.tsx`:

```tsx
// DJ Mode's parts: the platter (a vinyl record turning over the cover, or over
// the generated label, with a still spindle) and the side panel (the song, its
// time, prev / next and the gel back to the deck). app/dj/dj-mode.tsx turns the
// platter and wires the touch.
import { Show } from "solid-js";
import { Image, Sprite, Text, View } from "@pocketjs/framework/components";
import { ready, ResourceImage } from "@pocketjs/framework/resource";
import { AQUA } from "../aqua.ts";
import { FONT_12, FONT_16_BOLD } from "../fonts.ts";
import type { Theme } from "../theme.ts";
import { TransportButton } from "./deck.tsx";
import { Marquee } from "./marquee.tsx";

/** Text width in the 90 px side panel. */
export const DJ_TEXT_PX = 78;

/** The record. One View turns: the label (cover or generated) under the vinyl. The spindle and the
 * cover spinner stay still on top. */
export function Platter(props: { angle: number; cover: number; loading?: boolean; ref?: (node: unknown) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().platter} ref={props.ref as never}>
      <View class={t().platterDisc} style={{ rotate: props.angle }}>
        <View class={t().platterLabel}>
          <Show when={props.cover > 0} fallback={<Image class="w-[88] h-[88]" src={t().labelArt} />}>
            <ResourceImage class="w-[88] h-[88]" state={() => ready({ handle: props.cover, width: 88, height: 88 })} fallback={() => null} />
          </Show>
        </View>
        <Image class="absolute left-[0] top-[0] w-[200] h-[200]" src={t().vinylArt} />
      </View>
      <Show when={props.loading}>
        <View class={t().platterLoading}>
          <Sprite class="w-[32] h-[32]" sprite="theme/icons/spinner-atlas.svg" />
        </View>
      </Show>
      <View class={t().spindle} />
    </View>
  );
}

export function DjPanel(props: {
  title: string;
  artist: string;
  elapsed: string;
  remaining: string;
  enabled: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onDeck?: () => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().djPanel}>
      <Marquee text={props.title} class={t().infoTitle} slot={FONT_16_BOLD} width={DJ_TEXT_PX} />
      <Marquee text={props.artist} class={t().infoArtist} slot={FONT_12} width={DJ_TEXT_PX} />
      <Text class={t().djTime}>{props.elapsed}</Text>
      <Text class={t().djRemaining}>{props.remaining}</Text>
      <View class={t().djSkipRow}>
        <TransportButton kind="prev" enabled={props.enabled} onPress={props.onPrev} theme={props.theme} />
        <TransportButton kind="next" enabled={props.enabled} onPress={props.onNext} theme={props.theme} />
      </View>
      <View class={t().djDeckGel}>
        <TransportButton kind="dj" on onPress={props.onDeck} theme={props.theme} />
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Add the gallery state**

In `app/gallery/states.tsx`:
- Import: `import { DjPanel, Platter } from "../theme/parts/platter.tsx";`
- Insert before the `search` state (keep `search` last):

```tsx
  {
    name: "dj",
    top: () => <Top tab="Songs" header={["Song Name", "Artist"]} rows={SONG_ROWS} selected={3} playing={6} scroll={[18, 44]} legend={SONGS_LEGEND} />,
    bottom: () => (
      <View class={AQUA.bottomScreen}>
        <Platter angle={24} cover={0} />
        <DjPanel title="One More Time" artist="Daft Punk" elapsed="1:42" remaining="-3:58" enabled />
      </View>
    ),
  },
```

- [ ] **Step 6: Verify, and look at it**

```bash
bun run check && bun run test
bun run gallery
open dist/gallery/9-dj-bottom@2x.png
```
Expected: all tests pass; the gallery writes ten states. The orchestrator looks at the DJ PNG: a black record with grooves and a light wedge up-right of its centre, the blue label with its cream dot, a grey spindle, and the cream panel on the right with the title, artist, `1:42`, `-3:58`, prev/next and a blue DJ gel. If the file number differs, list `dist/gallery/` and open the `dj` one.

- [ ] **Step 7: Commit**

```bash
git add app/theme/parts/platter.tsx app/theme/theme.ts app/theme/aqua.ts app/gallery/names.ts app/gallery/states.tsx tests/gallery.test.ts tests/theme.test.ts
git commit -m "feat(dj): the platter and side panel parts, and their gallery state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The DJ screen

**Files:**
- Create: `app/dj/dj-mode.tsx`
- Modify: `app/app.tsx`
- Modify: `app/now-playing/now-playing.tsx`
- Test: `tests/dj.test.ts` (new)

**Interfaces:**
- Consumes: Task 2's `Session.scratch` / `Session.scratching`; Task 3's platter math; Task 6's `Platter` / `DjPanel`; Task 5's `TransportRow.onDj`.
- Produces: `DjMode(props: { session: Session; onDeck: () => void })`; `NowPlaying(props: { session: Session; onDj?: () => void })`; the app's bottom-screen mode.

- [ ] **Step 1: Write the failing test**

`tests/dj.test.ts`:

```ts
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost } from "../runtime/hosts/sim/localmedia.ts";
import { PLATTER } from "../app/dj/platter.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

const A = BTN.CIRCLE, X = BTN.TRIANGLE;

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

function press(rig: Rig, button: number): void {
  frames(rig, 1, { buttons: button });
  frames(rig, 2);
}

function touch(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

async function boot(status?: () => void): Promise<Rig> {
  const host = createSimLocalMedia(LIBRARY);
  const ns = status ? { ...host.ns, status: () => (status(), host.ns.status()) } : host.ns;
  const rig = { host, world: await bootApp({ localmedia: ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

/** Plays the focused song (the first, Aerodynamic) and lets it start. */
function play(rig: Rig): void {
  press(rig, A);
  frames(rig, 3);
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

const platterShown = (world: BundleWorld) => flat(world.tree("auxiliary")).some((node) => node.rect?.join(",") === "10,20,200,200");

/** The platter's pixels on the bottom screen. */
function platterPixels(world: BundleWorld): Buffer {
  const { width, rgba } = world.pixels("auxiliary");
  const d = width / 320;
  const rows: Buffer[] = [];
  for (let y = PLATTER.y * d; y < (PLATTER.y + PLATTER.size) * d; y++) {
    rows.push(Buffer.from(rgba.subarray((y * width + PLATTER.x * d) * 4, (y * width + (PLATTER.x + PLATTER.size) * d) * 4)));
  }
  return Buffer.concat(rows);
}

/** A contact on the platter, `deg` clockwise from 12 o'clock, 60 px out. */
function onRecord(deg: number, extra: Partial<StepInput> = {}): StepInput {
  const rad = (deg * Math.PI) / 180;
  return { touches: [{ x: Math.round(PLATTER.cx + 60 * Math.sin(rad)), y: Math.round(PLATTER.cy - 60 * Math.cos(rad)) }], surface: "auxiliary", ...extra } as StepInput;
}

/** One frame per step, turning `degPerFrame` (positive clockwise) from `from`; returns the final angle. */
function turn(rig: Rig, from: number, degPerFrame: number, steps: number): number {
  for (let i = 0; i <= steps; i++) frames(rig, 1, onRecord(from + degPerFrame * i));
  return from + degPerFrame * steps;
}

const scratchLog = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("scratch"));
const rates = (host: SimLocalMediaHost) => scratchLog(host).filter((entry) => entry.startsWith("scratchRate(")).map((entry) => Number(entry.slice("scratchRate(".length, -1)));

test("SELECT and the deck's DJ gel open DJ Mode; SELECT and the panel's gel go back; L+SELECT does nothing", async () => {
  const rig = await boot();
  play(rig);
  expect(platterShown(rig.world)).toBe(false);
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(false);
  touch(rig, 293, 196); // the deck's DJ gel
  expect(platterShown(rig.world)).toBe(true);
  touch(rig, 265, 203); // the panel's gel back to the deck
  expect(platterShown(rig.world)).toBe(false);
  press(rig, BTN.SELECT | BTN.LTRIGGER);
  expect(platterShown(rig.world)).toBe(false);
  expect(scratchLog(rig.host)).toEqual([]);
}, 120_000);

test("the record turns while the song plays and holds while it is paused", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  const before = platterPixels(rig.world);
  frames(rig, 10);
  expect(platterPixels(rig.world).equals(before)).toBe(false);
  press(rig, BTN.START);
  expect(rig.host.log).toContain("paused(true)");
  frames(rig, 2);
  const paused = platterPixels(rig.world);
  frames(rig, 10);
  expect(platterPixels(rig.world).equals(paused)).toBe(true);
}, 120_000);

test("a clockwise circle scratches forward, a still finger settles on 0 and stops sending, counter-clockwise scratches backward, the lift lets go", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  let at = turn(rig, 0, 10, 18); // 10° a frame: 3x forward
  expect(scratchLog(rig.host)[0]).toBe("scratchBegin()");
  const forward = rates(rig.host);
  expect(forward.length).toBeGreaterThan(5);
  expect(forward.every((rate) => rate > 0)).toBe(true);
  expect(Math.max(...forward)).toBeCloseTo(3, 1);
  frames(rig, 20, onRecord(at)); // held still
  expect(rates(rig.host).at(-1)).toBe(0);
  const settled = rates(rig.host).length;
  frames(rig, 10, onRecord(at));
  expect(rates(rig.host)).toHaveLength(settled);
  at = turn(rig, at, -10, 18);
  const backward = rates(rig.host).slice(settled);
  expect(backward.some((rate) => rate < 0)).toBe(true);
  expect(Math.min(...backward)).toBeCloseTo(-3, 1);
  frames(rig, 2); // lift
  expect(scratchLog(rig.host).at(-1)).toBe("scratchEnd()");
  expect(scratchLog(rig.host).filter((entry) => entry === "scratchBegin()")).toHaveLength(1);
}, 120_000);

test("while the record is held the status is read every frame, and at 15 Hz again after the lift", async () => {
  let reads = 0;
  const rig = await boot(() => reads++);
  play(rig);
  press(rig, BTN.SELECT);
  frames(rig, 2, onRecord(0));
  reads = 0;
  frames(rig, 30, onRecord(0));
  expect(reads).toBeGreaterThanOrEqual(30);
  frames(rig, 3);
  reads = 0;
  frames(rig, 60);
  expect(reads).toBeLessThanOrEqual(16);
}, 120_000);

test("crossing the spindle sends no spike", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  for (const x of [-40, -30, -20, -8, 0, 8, 20, 30, 40]) frames(rig, 1, { touches: [{ x: PLATTER.cx + x, y: PLATTER.cy }], surface: "auxiliary" });
  frames(rig, 2);
  expect(scratchLog(rig.host)[0]).toBe("scratchBegin()");
  expect(rates(rig.host).every((rate) => Math.abs(rate) < 0.01)).toBe(true);
}, 120_000);

test("a track change mid-scratch lets go, and the finger sends nothing more", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  const at = turn(rig, 0, 10, 6);
  frames(rig, 1, onRecord(at + 10, { buttons: BTN.ZR }));
  frames(rig, 2, onRecord(at + 20));
  const log = rig.host.log;
  const opened = log.findLastIndex((entry) => entry.startsWith("open("));
  expect(opened).toBeGreaterThan(0);
  expect(log.slice(opened)).toContain("scratchEnd()");
  const sent = rates(rig.host).length;
  turn(rig, at + 20, 10, 6);
  expect(rates(rig.host)).toHaveLength(sent);
  frames(rig, 2);
}, 120_000);

test("leaving DJ Mode mid-scratch lets go: SELECT, and the keyboard, which returns to DJ Mode when it closes", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  let at = turn(rig, 0, 10, 4);
  frames(rig, 1, onRecord(at, { buttons: BTN.SELECT }));
  frames(rig, 2);
  expect(platterShown(rig.world)).toBe(false);
  expect(scratchLog(rig.host).at(-1)).toBe("scratchEnd()");
  press(rig, BTN.SELECT);
  at = turn(rig, 0, 10, 4);
  // X opens the keyboard (on press or on release): keep the finger down through both, so the
  // let-go comes from DJ Mode unmounting, not from the lift.
  frames(rig, 1, onRecord(at, { buttons: X }));
  frames(rig, 2, onRecord(at));
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  expect(scratchLog(rig.host).at(-1)).toBe("scratchEnd()");
  expect(scratchLog(rig.host).filter((entry) => entry === "scratchEnd()")).toHaveLength(2);
  frames(rig, 2); // lift
  press(rig, BTN.START); // closes the keyboard, keeping the (empty) query
  frames(rig, 2);
  expect(platterShown(rig.world)).toBe(true);
}, 120_000);

test("with nothing playing the record holds still, the panel says so, and touching it sends nothing", async () => {
  const rig = await boot();
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
  const before = platterPixels(rig.world);
  turn(rig, 0, 10, 10);
  frames(rig, 2);
  expect(platterPixels(rig.world).equals(before)).toBe(true);
  expect(scratchLog(rig.host)).toEqual([]);
  expect(rig.host.log).toEqual(["scan()"]);
}, 120_000);
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test --conditions=browser tests/dj.test.ts`
Expected: FAIL — SELECT does nothing, so `platterShown` stays false (first test), and every later test fails the same way.

- [ ] **Step 3: Write the DJ screen**

`app/dj/dj-mode.tsx`:

```tsx
// The bottom screen in DJ Mode. The record turns at 33⅓ RPM while the song
// plays and holds while it does not. A finger on it owns it: each frame, the
// angle it turned the record since the last frame becomes the scratch rate
// (app/dj/platter.ts) and turns the record by as much. Lifting the finger, a
// track change, or leaving DJ Mode lets go. The side panel carries the song,
// its time, prev / next and the gel back to the deck.
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { DjPanel, Platter } from "../theme/parts/platter.tsx";
import { angleAt, fingerRate, inDeadZone, PLATTER, smoothRate, SPIN_PER_FRAME, wrap360, wrapDelta } from "./platter.ts";

export function DjMode(props: { session: Session; onDeck: () => void }) {
  const session = props.session;
  const status = session.status;
  const idle = () => session.player().index < 0 || session.track() === null;
  const [angle, setAngle] = createSignal(0);

  // The finger: whether it holds the record, its last angle (null over the spindle, so leaving the
  // dead zone starts afresh), the turn since the last frame, the smoothed rate and the rate last sent.
  let held = false;
  let last: number | null = null;
  let turned = 0;
  let rate = 0;
  let sent = 0;
  const follow = (x: number, y: number) => {
    if (inDeadZone(PLATTER.cx, PLATTER.cy, x, y)) {
      last = null;
      return;
    }
    const now = angleAt(PLATTER.cx, PLATTER.cy, x, y);
    if (last !== null) turned += wrapDelta(now - last);
    last = now;
  };
  const release = () => {
    if (!held) return;
    held = false;
    session.scratch.end();
  };
  let platter: unknown = null;
  createGesture({
    surface: "auxiliary",
    axis: "any",
    region: { node: () => platter as never },
    onDown: (c) => {
      if (idle()) return;
      held = true;
      last = null;
      turned = 0;
      rate = sent = 0;
      follow(c.x, c.y);
      session.scratch.begin();
    },
    onMove: (c) => {
      if (held) follow(c.x, c.y);
    },
    onUp: release,
    onCancel: release,
  });
  // A grab belongs to the song it started on, as a seek drag does: another open lets go.
  const opened = createMemo(() => status().openSerial);
  createEffect(on(opened, () => release(), { defer: true }));
  // Leaving DJ Mode (SELECT, the keyboard) with the finger down lets go too.
  onCleanup(release);

  onFrame(() => {
    if (held) {
      rate = smoothRate(rate, fingerRate(turned));
      if (rate !== sent) {
        session.scratch.rate(rate);
        sent = rate;
      }
      if (turned !== 0) setAngle(wrap360(angle() + turned));
      turned = 0;
      return;
    }
    if (status().phase === "playing") setAngle(wrap360(angle() + SPIN_PER_FRAME));
  });

  const duration = () => status().durationMs;
  const hours = () => needsHours(duration());
  return (
    <View class={AQUA.bottomScreen}>
      <Platter
        ref={(node) => (platter = node)}
        angle={angle()}
        cover={idle() ? 0 : session.cover()}
        loading={!idle() && session.coverLoading()}
      />
      <DjPanel
        title={idle() ? "Nothing playing" : session.track()!.title}
        artist={idle() ? "Pick a song above" : session.track()!.artist}
        elapsed={idle() ? "--:--" : formatTime(status().positionMs, hours())}
        remaining={idle() ? "--:--" : formatRemaining(status().positionMs, duration())}
        enabled={!idle()}
        onPrev={() => session.dispatch({ type: "prev" })}
        onNext={() => session.dispatch({ type: "next" })}
        onDeck={props.onDeck}
      />
    </View>
  );
}
```

- [ ] **Step 4: Switch the bottom screen**

`app/app.tsx` — replace the file with:

```tsx
// iPoDS — a walkman-style MP3 player. The top screen is the Explorer; the
// bottom screen is Now Playing or DJ Mode (SELECT, or the DJ gel, flips them),
// or the search keyboard while it is open.
import { createSignal, Match, Switch } from "solid-js";
import { AuxiliarySurface, FocusScope, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { DjMode } from "./dj/dj-mode.tsx";
import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
import { NowPlaying } from "./now-playing/now-playing.tsx";
import { createSearch, SearchKeyboard } from "./search.tsx";
import { createSession } from "./session.ts";

export default function App() {
  const session = createSession();
  const store = createExplorerStore();
  const osk = createSearch(store);
  const notSearching = () => !osk.isOpen();
  const [mode, setMode] = createSignal<"deck" | "dj">("deck");
  // Transport from either screen (the keyboard uses START to commit while open).
  onButtonPress(BTN.START, () => session.dispatch({ type: "toggle" }), { active: notSearching });
  onButtonPress(BTN.ZL, () => session.dispatch({ type: "prev" }), { active: notSearching });
  onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
  // SELECT flips the bottom screen between the deck and DJ Mode; not with L or R held (the host's
  // devmenu chord is L+R+SELECT).
  onButtonPress(
    BTN.SELECT,
    (_pressed, buttons) => {
      if (buttons & (BTN.LTRIGGER | BTN.RTRIGGER)) return;
      setMode((now) => (now === "dj" ? "deck" : "dj"));
    },
    { active: notSearching },
  );
  return (
    <>
      {/* The app moves its own focus; this empty scope keeps the framework's d-pad traversal
          from walking the whole tree on every press (the keyboard pushes its own scope). */}
      <FocusScope class="absolute left-[0] top-[0] w-[0] h-[0]" />
      <Explorer session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
      <AuxiliarySurface>
        {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Switch> renders once). */}
        <View class="relative w-full h-full flex-col">
          <Switch fallback={<NowPlaying session={session} onDj={() => setMode("dj")} />}>
            <Match when={osk.isOpen()}>
              <SearchKeyboard osk={osk} />
            </Match>
            <Match when={mode() === "dj"}>
              <DjMode session={session} onDeck={() => setMode("deck")} />
            </Match>
          </Switch>
        </View>
      </AuxiliarySurface>
    </>
  );
}
```

`app/now-playing/now-playing.tsx`:
- Change the signature to `export function NowPlaying(props: { session: Session; onDj?: () => void }) {`.
- In `<TransportRow …>`, add `onDj={props.onDj}` after `onRepeat={…}`.
- Header comment: append ` The transport row's last gel opens DJ Mode.`

- [ ] **Step 5: Verify**

Run: `bun run check && bun run test`
Expected: all pass, including the eight DJ tests and every existing app test.

If `"the record turns while the song plays"` fails because the platter pixels do not change, check that `app/images.json` is picked up (`bun scripts/build.ts --pocket-only` prints `image: theme/vinyl.png … sampled linear`) and that `Platter` puts `rotate` on the disc View, not on the box the gesture uses.

- [ ] **Step 6: Commit**

```bash
git add app/dj/dj-mode.tsx app/app.tsx app/now-playing/now-playing.tsx tests/dj.test.ts
git commit -m "feat(dj): DJ Mode: a spinning record that scratches under the finger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Performance, docs, and the device check

**Files:**
- Modify: `scripts/perf.ts` (`SCENARIOS`)
- Modify: `tests/perf.test.ts`
- Modify: `docs/perf.md` (new section)
- Modify: `README.md` (Controls)

**Interfaces:**
- Consumes: everything above.
- Produces: a `dj` perf scenario (A at 40 s plays the first song, SELECT at 41 s opens DJ Mode, capture at 50 s).

- [ ] **Step 1: Add the scenario (test first)**

`tests/perf.test.ts`: change the names expectation to `["idle", "scroll", "now-playing", "dj", "scan-first", "scan-cached"]`.

Run: `bun test --conditions=browser tests/perf.test.ts` — Expected: FAIL (no `dj` scenario).

`scripts/perf.ts`: change `const A = 0x2000, DOWN = 0x40;` to `const A = 0x2000, DOWN = 0x40, SELECT = 0x1;` and, after the `now-playing` scenario, add:

```ts
  { name: "dj", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2460:0x${SELECT.toString(16)},2466:0x0`, capture: 3000, kind: "frame" },
```

Update the usage comment at the top of `scripts/perf.ts` to list `dj`.

Run: `bun run check && bun run test` — Expected: all pass.

- [ ] **Step 2: Measure in Azahar**

Docker and Azahar must be available (`docker info`, `/Applications/Azahar.app`). One scenario per invocation, as `docs/perf.md` notes:

```bash
bun run perf dj --model both --check
bun run perf now-playing --model both --check
```

Expected: both within budget (CPU max ≤ 14 ms New, ≤ 30 ms Old). `now-playing` should stay within a few tenths of the Plan 6 rows (the ring adds one 18 KB copy per 104 ms slot on the audio thread). If `dj` on Old exceeds 30 ms, report the row and the 240-frame trace's worst frames (the orchestrator decides; the likely lever is drawing the cover label only when it is ready).

- [ ] **Step 3: Record the results**

Append to `docs/perf.md`:

```markdown
## DJ Mode (Plan 8)

The DJ Mode branch (`feature/dj-mode`, `docs/superpowers/plans/2026-10-08-dj-mode-08-dj-screen.md`): the platter turns one View holding the label and a 256 px vinyl texture (two textured quads under rotation), and the native player decodes through a 2 MiB PCM ring. `dj` opens DJ Mode on the playing song; it measures the motor spin, not a scratch (the tape has no touches). `bun run perf dj --model both --check` and `bun run perf now-playing --model both --check`:

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
<the four rows the runs printed, verbatim>
```

followed by one or two sentences comparing `now-playing` with the Plan 6 rows and stating whether `dj` fits both budgets. Use the rows exactly as `bun run perf` printed them.

- [ ] **Step 4: Document the controls**

In `README.md`:
- Add to the Controls table, after the `START` row: `| SELECT | DJ Mode on / off |`
- Replace the paragraph under the table with:

```markdown
The bottom screen is touch: shuffle, previous, play/pause, next, repeat, DJ
Mode, and a drag-to-seek capsule. In DJ Mode the record spins while the song
plays; drag it clockwise to play forward at your finger's speed, counter-
clockwise to play backwards, and hold it still for silence. Lifting your
finger lets the song play on from there.
```

- Change the intro's bottom-screen sentence to `the bottom screen is Now Playing, with cover art, a seek capsule and a touch transport row, or DJ Mode, a record you can scratch.`

- [ ] **Step 5: Verify and commit**

```bash
bun run check && bun run test
git add scripts/perf.ts tests/perf.test.ts docs/perf.md README.md
git commit -m "docs(dj): perf rows for DJ Mode, the dj scenario, SELECT in the controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Build for a device and hand over the device check**

```bash
bun run 3ds
```
Expected: `dist/ipo-ds-main.3dsx`. The orchestrator copies it to `~/git/ds-man/dist/ipo-ds-dj-<short sha>.3dsx` (outside this worktree, for the user) and gives the user this checklist, which needs a person and hardware:

1. In Azahar, then on a 3DS: SELECT and the DJ gel open DJ Mode; the record spins while playing and stops when paused.
2. Slow and fast clockwise circles play forward with the pitch following the finger; counter-clockwise plays audibly backwards; a still finger is silent.
3. Lifting the finger resumes playback from the heard spot with no repeat or skip; no clicks louder than a light tick at grab and lift.
4. Finger-to-sound latency feels immediate (under about 80 ms).
5. Old 3DS: DJ Mode stays smooth; a fast forward scratch at the 4× limit does not stutter; L+R diagnostics show no new underruns after normal playback resumes.
6. A long counter-clockwise drag stops at about 10 s back and goes silent.
7. Old 3DS: a grab scratches. The 2 MiB ring was allocated; if it fell back to 32 KiB, scratching stays silent and `scratching` stays false.
8. Old 3DS, forward at the 4× limit: scratch forward fast, return to the deck and hold L+R within a second. Note `D:` (decode load) and `U:` (underruns).
9. Normal playback is unchanged by the ring: compare the L+R `D:` and `U:` readings on a plain song with the Plan 6 build, if available.
10. A lift sometimes resumes noticeably ahead of where the finger stopped (the slot-handover skew, up to about 93 ms at 4×). Note how often and how far.

---

## Finishing

After Task 8, run `superpowers:finishing-a-development-branch`. Before opening the ipo-ds PR, push the fork branch so the pinned commit is reachable: `git -C runtime push -u origin dj-mode`. Then push `feature/dj-mode` and open the PR titled `feat(dj): DJ Mode`, whose description lists the fork commits, the perf rows and the device checklist, ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Pushing and opening the PR are outward-facing: confirm with the user first.
