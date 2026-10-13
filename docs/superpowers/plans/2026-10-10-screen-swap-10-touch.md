# Screen Swap Plan 10 — The Touch Explorer (ipo-ds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With the screens swapped, the Explorer on the bottom screen is driven by touch: drag and flick the list, drag the scrollbar thumb or tap its track, tap a tab, tap a song to play it or an album to open it, tap the footer gels, the breadcrumb and the LCD; all within the frame budgets on both models.

**Architecture:** In narrow layout the Explorer owns a framework kinetic scroller whose pixel offset splits into a settled whole-row `top` for the recycled list and a per-frame sub-row `shift` on two paint-only translates. The scroller runs the framework's real fling (no `snap` option: with it the framework replaces the fling with a long tween) and aligns to a row when it comes to rest. One gesture over the list body (a geometry region that stops short of the scrollbar while a thumb exists) feeds the scroller and resolves taps to rows by arithmetic, since the rows tile the body exactly. A second gesture over the scrollbar drags the thumb or pages. The chrome parts (tabs, footer gels, breadcrumb, LCD) share one `tapTarget` helper. The arithmetic is pure in `app/explorer/scroll.ts`. Six perf scenarios with touch tapes measure it in Azahar.

**Tech Stack:** TypeScript, Solid (`solid-js`), PocketJS `@pocketjs/framework/gesture` and `@pocketjs/framework/kinetics`, Bun tests on the PocketJS sim, Azahar for perf.

**Spec:** `docs/superpowers/specs/2026-10-10-screen-swap-design.md` (§5, §7, §8, §9). Read it before any task. Plan 9 (`docs/superpowers/plans/2026-10-10-screen-swap-09-layouts.md`) must be complete on this branch: 206 tests pass, `Explorer` takes `layout`, hold SELECT swaps, `scrollRow` is written as `top` changes, the `scroll` and `now-playing` perf rows are re-measured.

**Execution:** Opus (high effort) orchestrates; every task runs as one Sonnet implementer subagent plus one Sonnet reviewer subagent (`model: "sonnet"`), per `superpowers:subagent-driven-development`. The orchestrator runs each task's verification commands itself before starting the next task, and runs the Azahar perf scenarios of Task 6 itself (they need Azahar, Docker and `dist/test-music`).

## Global Constraints

- Work on branch `feature/screen-switch-mode` in the worktree `~/orca/workspaces/ds-man/cornetfish`. No fork code changes; the `runtime` pin stays at `2c72e830`.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives and control flow from `solid-js`. The gesture layer is `createGesture` from `@pocketjs/framework/gesture`; the scroller is `createScroller` from `@pocketjs/framework/kinetics`.
- Theme slots are complete class literals; never build one by concatenation.
- Commits: Conventional Commits (`feat(swap): …`, `test(swap): …`, `perf(swap): …`, `docs(swap): …`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Keep build products, logs and captures out of Git.
- Run tests with `bun run test` or `bun test --conditions=browser tests/<file>`; never discover tests through `runtime/`. Every task ends with `bun run check` and `bun run test` green. The baseline is 206 tests.
- Geometry (narrow Explorer, logical px): the list body starts at y 51 + 21 per strip (toolbar 34 + rule 1, header 15 + rule 1, each strip 20 + rule 1) and is 168 − 21 × strips tall; rows are 21 px and tile it exactly; the drawn scrollbar track is the right 14 px; its hit region is the right 20 px (x ≥ 300) and exists only while a thumb does; the toolbar is y 0–34 and the LCD sits at about x 48–140 in it; the footer is y 220–240.
- Scrolling: no rubber band (`overscroll: 0`); **no `snap` option** on the scroller (it would replace the fling with a 150–450 ms tween whose first frames move up to 13 rows); the framework's fling runs from the release velocity clamped to `FLING_MAX_PX_PER_S = 5000` (83 px, about 4 rows, on its first frame); the window aligns to a row whenever the scroller comes to rest off one; page and align moves use short tweens.
- Per-frame rule (spec §8): no handler subscribes to or rebuilds the row memo (`max` and the thumb read a settled row count); `top` stays a settled signal; only `shift`, the overlay translate and the thumb translate move per frame; the store is written by Plan 9's computation on `top`, never per frame.
- Gesture facts the code relies on (`runtime/framework/src/gesture-core.ts`): a region given only `rect` matches by geometry and a null rect matches nothing; ownership is decided at the down edge; on a release the framework fires `onUp`, then `onPanEnd` (if panning), then `onTap` (if nothing claimed); the first `onPanMove` carries only that frame's `fdy`, so the travel inside the 6 px pan slop is fed from `c.dy - c.fdy` at `onPanStart`; handlers run inside the frame's batch, so settled values and effects are stale until the batch ends.
- Budgets: CPU max ≤ 14 ms on New, ≤ 30 ms on Old, per `docs/perf.md`, with no exception for remount frames.

## Review Focus

1. **A tap that stops a fling** must leave the list row-aligned and act on the row that was under the finger when it landed. Pinned in Task 3 (`a tap during a fling stops it on a row and plays the row under the finger`).
2. **A drag that starts on the scrollbar** must move the list by the thumb's ratio, not by the finger's pixels, and never also scroll it as a list drag. Pinned in Task 4 (`dragging the thumb scrolls by the track ratio`).
3. **Rows shrinking under a scrolled window** (a rescan while scrolled down) must clamp the offset at once and show the remaining rows from a row boundary without a crash. Pinned in Task 3 (`a rescan that drops rows under a scrolled window clamps it`).
4. **A touch over a state panel** (empty) must do nothing except the Scan again gel. Pinned in Task 5 (`over the empty panel only the Scan again gel does anything`).
5. **A reveal from another tab** must centre the playing song in the Songs list and not be undone by the view-change effect that runs after the batch. Pinned in Task 5 (`the LCD tap reveals the playing song from another tab`).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/explorer/scroll.ts` (new) | Pure scroll arithmetic and the narrow geometry constants. |
| `app/controls.ts` | `FLING_MAX_PX_PER_S`. |
| `app/explorer/recycled-list.tsx` | `shift` prop. |
| `app/theme/aqua.ts`, `app/theme/parts/list.tsx` | The thumb moves by translate. |
| `app/theme/parts/gel.tsx` | `tapTarget`. |
| `app/explorer/explorer.tsx` | Narrow: the scroller, the list and scrollbar gestures, row taps, the reveal, chrome wiring. |
| `app/theme/parts/toolbar.tsx`, `strips.tsx` | Tap handlers on tabs, the LCD, the footer gels and the breadcrumb. |
| `scripts/perf.ts`, `docs/perf.md`, `tests/perf.test.ts` | Touch tapes; six scenarios; results. |
| `README.md` | The touch paragraph. |
| `tests/support/rig.ts` (new) | The sim rig helpers the touch tests share. |
| `tests/scroll.test.ts`, `tests/touch.test.ts` (new) | Unit and headless tests. |

---

### Task 1: Scroll arithmetic

**Files:**
- Create: `app/explorer/scroll.ts`
- Modify: `app/controls.ts` (add `FLING_MAX_PX_PER_S`)
- Test: `tests/scroll.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `app/explorer/scroll.ts`):
  - `NARROW_W = 320`, `TRACK_HIT_PX = 20`
  - `splitOffset(offset: number, rowPx: number): { top: number; shift: number }`
  - `snapToRow(rest: number, rowPx: number, max: number): number`
  - `clampVelocity(v: number, max: number): number`
  - `rowAt(y: number, bodyTop: number, offset: number, rowPx: number, count: number): number` (−1 for none)
  - `thumbFor(offset: number, content: number, view: number): { top: number; height: number } | null`
  - `offsetForThumb(thumbTop: number, content: number, view: number, thumbHeight: number): number`
  - `pageOffset(offset: number, direction: -1 | 1, pagePx: number, max: number): number`
  - `centredOffset(row: number, page: number, rowPx: number, max: number): number`
  - `bodyTopPx(strips: number): number`
  - `FLING_MAX_PX_PER_S = 5000` from `app/controls.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/scroll.test.ts
import { expect, test } from "bun:test";
import { FLING_MAX_PX_PER_S } from "../app/controls.ts";
import {
  bodyTopPx, centredOffset, clampVelocity, NARROW_W, offsetForThumb, pageOffset, rowAt, snapToRow, splitOffset, thumbFor, TRACK_HIT_PX,
} from "../app/explorer/scroll.ts";

test("an offset splits into whole rows and a sub-row shift", () => {
  expect(splitOffset(0, 21)).toEqual({ top: 0, shift: 0 });
  expect(splitOffset(20, 21)).toEqual({ top: 0, shift: 20 });
  expect(splitOffset(21, 21)).toEqual({ top: 1, shift: 0 });
  expect(splitOffset(100.5, 21)).toEqual({ top: 4, shift: 16.5 });
});

test("the rest position snaps to the nearest row inside the range", () => {
  expect(snapToRow(10, 21, 252)).toBe(0);
  expect(snapToRow(11, 21, 252)).toBe(21);
  expect(snapToRow(250, 21, 252)).toBe(252);
  expect(snapToRow(-5, 21, 252)).toBe(0);
  expect(snapToRow(300, 21, 252)).toBe(252);
  expect(snapToRow(40, 21, 0)).toBe(0);
});

test("a release velocity is clamped to the fling cap, either way; the cap is about four rows a frame", () => {
  expect(FLING_MAX_PX_PER_S).toBe(5000);
  expect(FLING_MAX_PX_PER_S / 60 / 21).toBeLessThan(4.1);
  expect(clampVelocity(300, 5000)).toBe(300);
  expect(clampVelocity(9000, 5000)).toBe(5000);
  expect(clampVelocity(-9000, 5000)).toBe(-5000);
});

test("the row under a point comes from the body's top and the offset; outside the rows is -1", () => {
  expect(rowAt(51, 51, 0, 21, 20)).toBe(0);
  expect(rowAt(71, 51, 0, 21, 20)).toBe(0);
  expect(rowAt(72, 51, 0, 21, 20)).toBe(1);
  expect(rowAt(60, 51, 42, 21, 20)).toBe(2);
  expect(rowAt(60, 51, 10, 21, 20)).toBe(0);
  expect(rowAt(50, 51, 0, 21, 20)).toBe(-1);
  expect(rowAt(200, 51, 0, 21, 3)).toBe(-1);
});

test("the thumb's size and place follow the content; a short list has no thumb", () => {
  expect(thumbFor(0, 100, 168)).toBeNull();
  expect(thumbFor(0, 420, 168)).toEqual({ top: 0, height: 67 });
  expect(thumbFor(252, 420, 168)).toEqual({ top: 101, height: 67 });
  expect(thumbFor(126, 420, 168)).toEqual({ top: 51, height: 67 });
  expect(thumbFor(0, 10_000, 168)!.height).toBe(16);
});

test("a thumb position maps back to an offset, clamped to the range", () => {
  expect(offsetForThumb(0, 420, 168, 67)).toBe(0);
  expect(offsetForThumb(101, 420, 168, 67)).toBe(252);
  expect(offsetForThumb(50.5, 420, 168, 67)).toBeCloseTo(126, 0);
  expect(offsetForThumb(-20, 420, 168, 67)).toBe(0);
  expect(offsetForThumb(500, 420, 168, 67)).toBe(252);
});

test("paging moves a page and stops at the ends; a reveal centres the row", () => {
  expect(pageOffset(0, 1, 168, 252)).toBe(168);
  expect(pageOffset(168, 1, 168, 252)).toBe(252);
  expect(pageOffset(100, -1, 168, 252)).toBe(0);
  expect(centredOffset(10, 8, 21, 252)).toBe(126);
  expect(centredOffset(1, 8, 21, 252)).toBe(0);
  expect(centredOffset(19, 8, 21, 252)).toBe(252);
});

test("the list body starts under the toolbar and header, plus a strip each for the search and crumb; the track's hit region is the right 20 px", () => {
  expect(bodyTopPx(0)).toBe(51);
  expect(bodyTopPx(1)).toBe(72);
  expect(bodyTopPx(2)).toBe(93);
  expect([NARROW_W, TRACK_HIT_PX]).toEqual([320, 20]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/scroll.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Write the module and the constant**

Append to `app/controls.ts`:

```ts
/** The fastest flick the list accepts, px per virtual second: 83 px, about 4 rows, on the fling's first frame (spec §8). */
export const FLING_MAX_PX_PER_S = 5000;
```

```ts
// app/explorer/scroll.ts
// The touch Explorer's scroll arithmetic (spec §5.2–§5.4), pure: the Explorer binds it to the
// framework's kinetic scroller. Offsets are px of content above the window; `max` is the
// largest offset, (rows − page) × row height, never negative.

/** The bottom screen's width, and the scrollbar's hit region at its right edge (the drawn track is 14). */
export const NARROW_W = 320;
export const TRACK_HIT_PX = 20;

const clamp = (value: number, max: number) => Math.min(Math.max(0, max), Math.max(0, value));

/** Whole rows above the window and the sub-row remainder the canvas is shifted by. */
export function splitOffset(offset: number, rowPx: number): { top: number; shift: number } {
  const top = Math.floor(offset / rowPx);
  return { top, shift: offset - top * rowPx };
}

/** The row boundary nearest a rest position, inside the range. */
export function snapToRow(rest: number, rowPx: number, max: number): number {
  return clamp(Math.round(rest / rowPx) * rowPx, max);
}

export function clampVelocity(v: number, max: number): number {
  return Math.min(max, Math.max(-max, v));
}

/** The row under screen y, or −1 above the body or past the last row. */
export function rowAt(y: number, bodyTop: number, offset: number, rowPx: number, count: number): number {
  if (y < bodyTop) return -1;
  const index = Math.floor((y - bodyTop + offset) / rowPx);
  return index < count ? index : -1;
}

/** Thumb top and height for `offset` px of `content` in a `view` px window; null when it all fits. */
export function thumbFor(offset: number, content: number, view: number): { top: number; height: number } | null {
  if (content <= view) return null;
  const height = Math.max(16, Math.round((view * view) / content));
  return { top: Math.round((clamp(offset, content - view) / (content - view)) * (view - height)), height };
}

/** The offset that puts the thumb's top at `thumbTop` px down the track. */
export function offsetForThumb(thumbTop: number, content: number, view: number, thumbHeight: number): number {
  const travel = view - thumbHeight;
  if (travel <= 0) return 0;
  return clamp((thumbTop / travel) * (content - view), content - view);
}

export function pageOffset(offset: number, direction: -1 | 1, pagePx: number, max: number): number {
  return clamp(offset + direction * pagePx, max);
}

/** The offset that shows `row` in the middle of a `page`-row window. */
export function centredOffset(row: number, page: number, rowPx: number, max: number): number {
  return clamp((row - Math.floor(page / 2)) * rowPx, max);
}

/** Toolbar 34 + rule, header 15 + rule, and 21 per strip (search, crumb) above the list body. */
export function bodyTopPx(strips: number): number {
  return 51 + strips * 21;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bun test --conditions=browser tests/scroll.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add app/explorer/scroll.ts app/controls.ts tests/scroll.test.ts
git commit -m "feat(swap): pure scroll arithmetic for the touch list"
```

---

### Task 2: A shiftable recycled list, a translating thumb, and the tap-target helper

**Files:**
- Modify: `app/explorer/recycled-list.tsx` (`shift` prop)
- Modify: `app/theme/aqua.ts` (`SCROLL_THUMB.body` gains `top-[0]`), `app/theme/parts/list.tsx` (`Scrollbar` uses `translateY`)
- Modify: `app/theme/parts/gel.tsx` (`tapTarget`)

**Interfaces:**
- Consumes: nothing.
- Produces: `RecycledList` prop `shift?: number` (px, default 0); `tapTarget(onTap?: () => void): (node: unknown) => void` in `gel.tsx`.

No new test: the pool does not change (a shifted window shows rows `top` to `top + rows`, that is `rows + 1` rows, which the existing pool of `rows + 1` rounded to even already holds: 10 slots for 8 rows, 8 for 7), the thumb's new translate renders the same gallery, and Task 3's tests drive `shift` and Task 5's drive `tapTarget`.

- [ ] **Step 1: The shift**

`app/explorer/recycled-list.tsx`: add to the props:

```ts
  /** Sub-row px the window is scrolled past `top` (touch scrolling); 0 keeps the window on a row. The pool
   * already holds one row past the window, so a shifted window's partial row at the bottom has a slot. */
  shift?: number;
```

and change the canvas translate to `style={{ translateY: -(props.top * props.rowHeight + (props.shift ?? 0)) }}`.

- [ ] **Step 2: The thumb**

`app/theme/aqua.ts`: `SCROLL_THUMB.body` becomes `"absolute left-[1] top-[0] w-[11] rounded-[6] …"` (the rest unchanged).

`app/theme/parts/list.tsx`, `Scrollbar`: `style={{ translateY: props.thumbTop, height: props.thumbHeight }}` with the comment `// translate, not inset: the thumb moves every frame under a finger and must not relayout`.

- [ ] **Step 3: The tap-target helper**

In `app/theme/parts/gel.tsx`, import `createGesture` from `@pocketjs/framework/gesture` and add:

```ts
/**
 * A ref setter that makes its node a tap target on the bottom screen. With no handler nothing is
 * registered (the top screen has no touch). Call it in a component scope: the recognizer disposes
 * with it. Reading a handler prop once here is right because a part's handlers are constant for
 * a mount (the Explorer passes them per layout, and it remounts when the layout changes).
 */
export function tapTarget(onTap?: () => void): (node: unknown) => void {
  let node: unknown = null;
  if (onTap) createGesture({ surface: "auxiliary", region: { node: () => node as never }, onTap });
  return (n) => {
    node = n;
  };
}
```

- [ ] **Step 4: Run the checks**

Run: `bun run check && bun run test`
Expected: check clean; 214 pass (206 + 8 scroll). The gallery `gels` state still shows the three thumbs where they were.

- [ ] **Step 5: Commit**

```bash
git add app/explorer/recycled-list.tsx app/theme/aqua.ts app/theme/parts/list.tsx app/theme/parts/gel.tsx
git commit -m "feat(swap): the recycled list takes a sub-row shift; the thumb translates; a tap-target helper"
```

---

### Task 3: Finger scrolling and row taps

**Files:**
- Create: `tests/support/rig.ts`
- Modify: `app/explorer/explorer.tsx`
- Test: `tests/touch.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's functions, Task 2's `shift`, `createScroller` / `createGesture`, Plan 9's `scrollRow` computation.
- Produces: the narrow Explorer scrolls under a finger, flings, aligns to a row at rest, clamps when rows shrink, and plays or opens a tapped row. In the component: `count` (settled row count), `maxOffset()`, `bodyTop()`, `alignToRow()`, `pendingReveal` (used by Task 5).

- [ ] **Step 1: The shared rig**

```ts
// tests/support/rig.ts
// A booted app with a sim media host, stepped at 60 Hz, and readers for the bottom screen's list.
// The narrow list: rows are 21 px from y 51 (plus 21 per strip); the fixture's sorted songs are
// Aerodynamic, Around the World, Bohemian Rhapsody, Crescendolls, Da Funk, DARE, Death on Two Legs,
// Digital Love, Dirty Harry, Feel Good Inc., Glósóli, Gong, … (20 songs: content 420, window 168).
import { expect } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "../fixtures/library.ts";
import { bootApp, screenText } from "./app-world.ts";

export const SELECTED_ROW = 0xffd77538;
export const BODY_TOP = 51, ROW = 21, BODY_PX = 168;
export type Surface = "primary" | "auxiliary";

export interface Rig {
  world: BundleWorld;
  host: SimLocalMediaHost;
}

export function frames(rig: Rig, count: number, input?: StepInput): void {
  for (let i = 0; i < count; i++) {
    rig.world.step(input);
    rig.host.advance(1000 / 60);
  }
}

export function press(rig: Rig, button: number, held = 1): void {
  frames(rig, held, { buttons: button });
  frames(rig, 2);
}

/** Holds SELECT past the hold time: a swap. */
export function holdSelect(rig: Rig): void {
  frames(rig, 62, { buttons: BTN.SELECT });
  frames(rig, 3);
}

/** A tap: one frame down on the bottom screen, then lifted. */
export function tap(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

/** A finger moving `step` px in y per frame for `count` frames, left down (lift it with `frames(rig, n)`). */
export function drag(rig: Rig, x: number, y0: number, step: number, count: number): void {
  for (let i = 0; i < count; i++) frames(rig, 1, { touches: [{ x, y: y0 + step * i }], surface: "auxiliary" });
}

export async function boot(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const host = createSimLocalMedia(library);
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

/** Boots and swaps the screens: the narrow Explorer is on the bottom. */
export async function bootSwapped(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const rig = await boot(library);
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("iPoDS");
  return rig;
}

export function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

const isRow = (n: SimNode) => n.rect !== null && n.rect[0] === 0 && n.rect[2] === 320 && n.rect[3] === ROW;
const inBody = (n: SimNode, bodyTop: number, bodyPx: number) => n.rect![1] > bodyTop - ROW && n.rect![1] < bodyTop + bodyPx;

/** The y of every row View on the bottom screen inside the body (slot rows and the overlay; pooled rows off-screen are left out). */
export function rowYs(world: BundleWorld, bodyTop = BODY_TOP, bodyPx = BODY_PX): number[] {
  return flat(world.tree("auxiliary")).filter((n) => isRow(n) && inBody(n, bodyTop, bodyPx)).map((n) => n.rect![1]);
}

export const aligned = (ys: number[], bodyTop = BODY_TOP) => ys.every((y) => (y - bodyTop) % ROW === 0);

/** The text of the striped list rows inside the body, joined with "|": not the overlay, not pooled rows outside the body. */
export function listText(world: BundleWorld, bodyTop = BODY_TOP, bodyPx = BODY_PX): string {
  return flat(world.tree("auxiliary"))
    .filter((n) => isRow(n) && inBody(n, bodyTop, bodyPx) && n.bgColor >>> 0 !== 0 && n.bgColor >>> 0 !== SELECTED_ROW)
    .map((n) => flat(n).map((c) => c.text).join(""))
    .join("|");
}

/** The text of the striped row whose top is at screen y. */
export function rowTextAt(world: BundleWorld, y: number): string {
  const row = flat(world.tree("auxiliary")).find((n) => isRow(n) && n.rect![1] === y && n.bgColor >>> 0 !== 0 && n.bgColor >>> 0 !== SELECTED_ROW);
  return row ? flat(row).map((c) => c.text).join("") : "";
}

/** The text of the focused (selected) list row on a surface. */
export function selectedRow(world: BundleWorld, surface: Surface): string {
  const row = flat(world.tree(surface)).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row ? flat(row).map((node) => node.text).join("") : "";
}

export const opens = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("open("));
export const scans = (host: SimLocalMediaHost) => host.log.filter((entry) => entry === "scan()");
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/touch.test.ts
// The touch Explorer (spec §5): with the screens swapped, the list on the bottom screen is dragged,
// flicked, tapped and paged by hand. Geometry and fixture facts: tests/support/rig.ts.
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import { LIBRARY } from "./fixtures/library.ts";
import { disposeGuest, screenText } from "./support/app-world.ts";
import { aligned, BODY_TOP, bootSwapped, drag, frames, holdSelect, listText, opens, press, rowYs, ROW, scans, selectedRow, tap } from "./support/rig.ts";

afterAll(disposeGuest);

const X = BTN.TRIANGLE;

test("a tap plays the song under the finger with the visible list as the queue, and moves the highlight to it", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + ROW + 10); // row 1: Around the World
  expect(opens(rig.host)).toEqual(["open(7)"]);
  expect(selectedRow(rig.world, "auxiliary")).toContain("Around the World");
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Around the World");
  press(rig, BTN.ZR);
  expect(opens(rig.host)).toEqual(["open(7)", "open(16)"]); // the next visible song, as A's queue does
}, 120_000);

test("a tap on an album opens it", async () => {
  const rig = await bootSwapped();
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER); // Albums
  tap(rig, 100, BODY_TOP + 10); // the first album
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  expect(opens(rig.host)).toEqual([]);
}, 120_000);

test("a tap on the gap below the last row does nothing", async () => {
  const rig = await bootSwapped([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  tap(rig, 100, BODY_TOP + 5 * ROW); // below three rows
  expect(opens(rig.host)).toEqual([]);
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
}, 120_000);

test("a drag follows the finger mid-row; a flick flings and comes to rest on a row; the list never passes its end", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 180, -8, 4); // 24 px of travel: panning, mid-row
  expect(aligned(rowYs(rig.world))).toBe(false);
  drag(rig, 100, 148, -8, 6); // 72 px in all, then lift at 480 px/s
  frames(rig, 150);
  const ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  // 20 rows, 8 per window: the end is top 12, rows 12–19 at y 51–198, nothing drawn below.
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(Math.max(...ys)).toBe(BODY_TOP + 7 * ROW);
  expect(opens(rig.host)).toEqual([]); // dragging never plays
}, 120_000);

test("a tap during a fling stops it on a row and plays the row under the finger", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -10, 8);
  frames(rig, 2); // lifted: flinging
  const moving = rowYs(rig.world);
  frames(rig, 1);
  expect(rowYs(rig.world)).not.toEqual(moving);
  tap(rig, 100, BODY_TOP + 3 * ROW + 10);
  frames(rig, 30);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(opens(rig.host)).toHaveLength(1);
  expect(selectedRow(rig.world, "auxiliary")).not.toContain("Aerodynamic"); // the highlight left row 0
  expect(listText(rig.world)).toContain(selectedRow(rig.world, "auxiliary").slice(0, 6)); // and sits on a visible row
}, 120_000);

test("the list keeps its touch-scrolled place across a swap and back when the tapped row is still in view", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 7 * ROW + 10); // Digital Love plays; the highlight is on row 7
  drag(rig, 100, 200, -20, 3); // 60 px up, then held still so the lift has no velocity
  drag(rig, 100, 140, 0, 6);
  frames(rig, 60); // rests on row 3: rows 3–10 shown, the highlighted row 7 among them
  const before = rowYs(rig.world);
  expect(aligned(before)).toBe(true);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  holdSelect(rig); // normal: the wide list keeps the window, since the focused row is inside it
  expect(screenText(rig.world, "primary")).not.toContain("Aerodynamic");
  expect(selectedRow(rig.world, "primary")).toContain("Digital Love");
  holdSelect(rig);
  expect(rowYs(rig.world)).toEqual(before);
}, 120_000);

test("a rescan that drops rows under a scrolled window clamps it and shows the rest from a row", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -8, 10);
  frames(rig, 150); // at the end: top 12
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  rig.host.setLibrary([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  press(rig, X, 70); // hold X: a rescan, in narrow layout too
  frames(rig, 6);
  expect(rig.world.failure).toBeNull();
  expect(scans(rig.host)).toHaveLength(2);
  const ys = rowYs(rig.world);
  expect(ys.length).toBeGreaterThan(0);
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(aligned(ys)).toBe(true);
  expect(listText(rig.world)).toContain("Aerodynamic");
}, 120_000);
```

The wide layout keeps the focused row visible (`nearestTop`), so a narrow scroll position survives a swap only while the focused row is inside the window; the swap test tapes a row first for that reason.

- [ ] **Step 3: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/touch.test.ts`
Expected: the tap, drag, fling, place and rescan tests FAIL (touches do nothing yet).

- [ ] **Step 4: The scroller and the list gesture**

In `app/explorer/explorer.tsx`:

Imports: `createGesture` from `@pocketjs/framework/gesture`; `createScroller, type Scroller` from `@pocketjs/framework/kinetics`; `FLING_MAX_PX_PER_S` from `../controls.ts`; `bodyTopPx, centredOffset, clampVelocity, NARROW_W, rowAt, snapToRow, thumbFor, TRACK_HIT_PX` from `./scroll.ts`; `rowsKey` is already imported from `./model.ts`.

After `const page = …` add:

```ts
  const bodyTop = () => bodyTopPx(strips());
  /** The row count as a settled value: what the scroller's range and the thumb read, so no per-frame path touches the row memo. */
  const count = settled(() => rows().length);
  /** The largest offset: the rows past the window, in px. */
  const maxOffset = () => Math.max(0, count() - page()) * ROW_PX;
```

Replace the `// --- list ---` block's `previousTop` / `top` lines and the `thumb` memo with:

```ts
  // --- list ----------------------------------------------------------------
  // Wide: the first row in the window is the least scrolling that keeps the focused row visible.
  // Narrow: a kinetic scroller owns a px offset under the finger; `top` is its whole-row part (settled,
  // so a frame that crosses no row boundary re-runs nothing downstream) and `shift` the remainder, read
  // by exactly two paint-only translates. The store is written by the computation on `top` (Plan 9).
  const key0 = viewKey(currentView(untrack(state)));
  let previousTop = props.store.scrollRow.get(key0) ?? 0;
  let scroller: Scroller | null = null;
  /** A reveal that changed the view: the view-change effect centres the row after the batch (see reveal). */
  let pendingReveal = false;
  /** Rest on a row: a fling, or a tween a finger stopped, can leave the window mid-row. */
  const alignToRow = () => {
    const s = scroller!;
    if (s.state() !== "idle") return;
    const to = snapToRow(s.offset(), ROW_PX, maxOffset());
    if (to !== s.offset()) s.scrollTo(to, { durMs: 120 });
  };
  if (!wide) {
    // No `snap` option: with it the framework's endDrag replaces the fling with a 150–450 ms tween whose
    // first frames move up to 13 rows, so the fling state would never run and the velocity cap would mean
    // nothing. The real fling decays from the clamped release velocity; onSettle aligns the rest.
    const s = createScroller({ max: maxOffset, extent: bodyPx, initial: previousTop * ROW_PX, overscroll: 0, onSettle: () => alignToRow() });
    scroller = s;
    onFrame(() => s.step());
    // A view change (tab, drill, back) shows that view where it was left; a query change starts at the top;
    // a reveal into another view centres the revealed row instead (effects run after the batch, when the
    // settled values are fresh).
    let shownKey = key0;
    createEffect(on(key, () => {
      const now = viewKey(currentView(untrack(state)));
      if (pendingReveal) {
        pendingReveal = false;
        shownKey = now;
        s.scrollTo(centredOffset(focus(), page(), ROW_PX, maxOffset()));
        return;
      }
      if (now === shownKey) {
        s.scrollTo(0, { immediate: true });
        return;
      }
      shownKey = now;
      s.scrollTo((props.store.scrollRow.get(now) ?? 0) * ROW_PX, { immediate: true });
    }, { defer: true }));
    // A rescan that drops rows under the window: clamp at once, or the list would show nothing.
    createEffect(on(count, () => {
      if (s.offset() > maxOffset()) s.scrollTo(maxOffset(), { immediate: true });
    }, { defer: true }));
  }
  const top = wide
    ? settled(() => (previousTop = nearestTop(previousTop, focus(), page(), count())))
    : settled(() => Math.floor(scroller!.offset() / ROW_PX));
  const shift = wide ? () => 0 : createMemo(() => scroller!.offset() - top() * ROW_PX);
  const thumb = createMemo(() => thumbFor(wide ? top() * ROW_PX : scroller!.offset(), count() * ROW_PX, bodyPx()));
```

(Plan 9's `createComputed` that writes `scrollRow` from `top()` and `view()` stays as it is.)

Then the gesture, after the thumb memo:

```ts
  // --- touch (narrow) --------------------------------------------------------
  if (!wide) {
    const s = scroller!;
    // The list body, short of the scrollbar's hit region while a thumb exists. A geometry region, not a
    // node: the rows tile the body exactly, so the row under a finger is arithmetic (rowAt), read at the
    // down edge once the fling is stopped. The framework fires onUp before onPanEnd and onTap.
    let rowDown = -1;
    createGesture({
      surface: "auxiliary",
      axis: "y",
      region: { rect: () => ({ x: 0, y: bodyTop(), w: thumb() ? NARROW_W - TRACK_HIT_PX : NARROW_W, h: bodyPx() }) },
      onDown: (c) => {
        rowDown = -1;
        if (!listActive()) return;
        s.stop();
        rowDown = rowAt(c.y, bodyTop(), s.offset(), ROW_PX, count());
      },
      onPanStart: (c) => {
        if (!listActive()) return;
        s.beginDrag();
        s.drag(-(c.dy - c.fdy)); // the travel inside the pan slop, which no onPanMove carries
      },
      onPanMove: (c) => { if (listActive()) s.drag(-c.fdy); },
      onPanEnd: (c) => { if (listActive()) s.endDrag(-clampVelocity(c.vy, FLING_MAX_PX_PER_S)); },
      onUp: () => { if (listActive()) alignToRow(); },
      onCancel: () => { if (s.state() === "tracking") s.endDrag(0); },
      onTap: () => {
        if (!listActive() || rowDown < 0) return;
        const lib = library();
        if (!lib) return;
        const list = visibleRows(lib, state());
        if (rowDown >= list.length) return;
        dispatch({ type: "focus", index: rowDown, count: list.length });
        const row = list[rowDown]!;
        if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: songIds(list), startId: row.id });
        else dispatch({ type: "open", row });
      },
    });
  }
```

On a pan release `onUp` sees the scroller still `tracking`, so `alignToRow` does nothing and `endDrag` then starts the fling; on a tap that caught a fling, `onDown` already stopped it, `onUp` starts the align tween, and `onTap` uses the row captured at the down edge.

JSX: `<RecycledList … top={top()} shift={shift()} …>` and the overlay `style={{ translateY: (focus() - top()) * ROW_PX - shift() }}`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/touch.test.ts && bun run test`
Expected: check clean; touch 7 pass; 221 pass in all. If the fling test's end rows differ, print `rowYs` and `listText`: the fixture has 20 songs and the window 8 rows, so the end is top 12.

- [ ] **Step 6: Commit**

```bash
git add app/explorer/explorer.tsx tests/support/rig.ts tests/touch.test.ts
git commit -m "feat(swap): the narrow Explorer scrolls under a finger, flings to rest on a row, and plays a tapped song"
```

---

### Task 4: The scrollbar: thumb drag and track paging

**Files:**
- Modify: `app/explorer/explorer.tsx`
- Test: `tests/touch.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's scroller, `thumb`, `alignToRow`, `count`; Task 1's `offsetForThumb`, `pageOffset`.
- Produces: a second gesture over the right 20 px of the body, live only while a thumb exists.

- [ ] **Step 1: Write the failing tests**

```ts
test("dragging the thumb scrolls by the track ratio, not the finger's pixels, and rests on a row", async () => {
  const rig = await bootSwapped();
  // 20 rows in a 168 px window: the thumb is 67 px tall, its travel 101 px for 252 px of content.
  drag(rig, 313, BODY_TOP + 10, 0, 1); // down on the thumb
  drag(rig, 313, BODY_TOP + 10, 10, 6); // 50 px down the track: about 125 px of content, 6 rows
  frames(rig, 40);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Death on Two Legs"); // row 6 at the top
  expect(opens(rig.host)).toEqual([]);
}, 120_000);

test("a tap on the track below the thumb pages down; above it pages up; a short list has no track to tap", async () => {
  const rig = await bootSwapped();
  tap(rig, 313, BODY_TOP + 150); // below the thumb (0–67)
  frames(rig, 30);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Dirty Harry"); // row 8 at the top
  tap(rig, 313, BODY_TOP + 2); // above the thumb now
  frames(rig, 30);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Aerodynamic");
  const short = await bootSwapped([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  tap(short, 313, BODY_TOP + ROW + 10); // no thumb: the right edge belongs to the rows
  expect(opens(short.host)).toEqual(["open(7)"]);
}, 120_000);
```

(`rowTextAt` joins the import from `./support/rig.ts`.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/touch.test.ts`
Expected: the two new tests FAIL (the track belongs to no recognizer yet, and the list region already spans the full width without a thumb, so only the last assertion of the second test passes).

- [ ] **Step 3: The scrollbar gesture**

In the `if (!wide)` touch block of `app/explorer/explorer.tsx`, after the list gesture:

```ts
    // The scrollbar: a down on the thumb drags it (finger travel maps to the offset by the track ratio);
    // a tap on the track above or below it pages. Its region exists only while a thumb does, and the
    // list's region stops where it starts, so a contact is one recognizer's alone.
    let grab: number | null = null; // the finger's y inside the thumb while dragging it
    const thumbAt = (y: number) => {
      const t = thumb();
      if (!t) return null;
      const local = y - bodyTop() - t.top;
      return local >= 0 && local < t.height ? local : null;
    };
    createGesture({
      surface: "auxiliary",
      axis: "y",
      region: { rect: () => (thumb() ? { x: NARROW_W - TRACK_HIT_PX, y: bodyTop(), w: TRACK_HIT_PX, h: bodyPx() } : null) },
      onDown: (c) => {
        grab = null;
        if (!listActive()) return;
        s.stop();
        grab = thumbAt(c.y);
      },
      onPanMove: (c) => {
        const t = thumb();
        if (grab === null || !t || !listActive()) return;
        s.scrollTo(offsetForThumb(c.y - bodyTop() - grab, count() * ROW_PX, bodyPx(), t.height), { immediate: true });
      },
      onPanEnd: () => { grab = null; },
      onUp: () => { if (listActive()) alignToRow(); },
      onCancel: () => { grab = null; },
      onTap: (c) => {
        const t = thumb();
        if (!t || !listActive() || thumbAt(c.y) !== null) return;
        s.scrollTo(pageOffset(s.offset(), c.y - bodyTop() < t.top ? -1 : 1, page() * ROW_PX, maxOffset()));
      },
    });
```

Add `offsetForThumb` and `pageOffset` to the `./scroll.ts` import. A thumb release reaches `onUp` with the scroller idle (each move was an immediate `scrollTo`), so `alignToRow` tweens it onto a row; `onPanEnd` then only clears `grab`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/touch.test.ts && bun run test`
Expected: check clean; touch 9 pass; 223 pass.

- [ ] **Step 5: Commit**

```bash
git add app/explorer/explorer.tsx tests/touch.test.ts
git commit -m "feat(swap): the scrollbar thumb drags and its track pages under a finger"
```

---

### Task 5: Chrome taps: tabs, footer gels, breadcrumb, LCD

**Files:**
- Modify: `app/theme/parts/toolbar.tsx` (`SegmentedTabs.onSelect`, `LcdStatus.onPress`, `Toolbar` passes both)
- Modify: `app/theme/parts/strips.tsx` (`FooterGels.onPress`, `Breadcrumb.onBack`)
- Modify: `app/explorer/explorer.tsx` (wiring; the reveal)
- Test: `tests/touch.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `tapTarget`; Task 3's scroller, `pendingReveal`, `maxOffset`; `setTab`, `touchLegendOf`, `TouchAction` (Plan 9).
- Produces: `SegmentedTabs` / `Toolbar` take `onSelect?: (tab: Tab) => void`; `LcdStatus` / `Toolbar` take `onPress?: () => void`; `FooterGels` takes `onPress?: (action: TouchAction) => void`; `Breadcrumb` takes `onBack?: () => void`. Each recognizer exists only when its handler is given.

- [ ] **Step 1: Write the failing tests**

```ts
/** Taps the centre of the text node reading `text` on the bottom screen (inside its gel); `last` takes the last match in tree order. */
function tapText(rig: Rig, text: string, last = false): void {
  const paths = pathsTo(rig.world, "auxiliary", text);
  const [x, y, w, h] = (last ? paths.at(-1)! : paths[0]!).at(-2)!.rect!;
  tap(rig, x + w / 2, y + h / 2);
}

/** Taps a key of the open keyboard by its label. */
function typeKeys(rig: Rig, keys: string): void {
  for (const key of keys) tapText(rig, key);
}

test("tapping a tab switches to it; L / R still step", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Albums");
  expect(screenText(rig.world, "auxiliary")).toContain("Album");
  expect(listText(rig.world)).toContain("Discovery");
  tapText(rig, "Artists");
  expect(listText(rig.world)).toContain("Daft Punk");
  expect(listText(rig.world)).not.toContain("Discovery");
  press(rig, BTN.LTRIGGER);
  expect(screenText(rig.world, "auxiliary")).toContain("Song Name");
}, 120_000);

test("the Search gel opens the keyboard with the Explorer pulled up; START closes it and the swap returns", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Search");
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(screenText(rig.world, "primary")).not.toContain("Nothing playing");
  typeKeys(rig, "gor"); // Gorillaz: the search covers artists too, so "da" would keep Daft Punk's songs
  expect(screenText(rig.world, "primary")).toContain("Search:gor");
  press(rig, BTN.START);
  expect(screenText(rig.world, "primary")).toContain("Nothing playing");
  const bottom = screenText(rig.world, "auxiliary");
  for (const part of ["Search:gor", "Edit search", "Clear"]) expect(bottom).toContain(part);
  const matches = listText(rig.world, bodyTopPx(1), BODY_PX - ROW); // one strip: the body starts at 72
  expect(matches).toContain("DARE");
  expect(matches).not.toContain("Aerodynamic");
  tapText(rig, "Clear");
  expect(listText(rig.world)).toContain("Aerodynamic");
}, 120_000);

test("a search typed while scrolled shows the matches from the top, under the search strip", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -6, 10);
  frames(rig, 150);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  tapText(rig, "Search");
  typeKeys(rig, "dig");
  press(rig, BTN.START);
  expect(rig.world.failure).toBeNull();
  const ys = rowYs(rig.world, bodyTopPx(1), BODY_PX - ROW);
  expect(Math.min(...ys)).toBe(bodyTopPx(1));
  expect(aligned(ys, bodyTopPx(1))).toBe(true);
  expect(listText(rig.world, bodyTopPx(1), BODY_PX - ROW)).toContain("Digital Love");
}, 120_000);

test("inside an album a tap under the breadcrumb plays; the breadcrumb and the Back gel return with the album highlighted", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Albums");
  tap(rig, 100, BODY_TOP + 2 * ROW + 10); // the third album
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  tap(rig, 100, bodyTopPx(1) + 10); // the album's first song, under the crumb strip
  expect(opens(rig.host)).toHaveLength(1);
  const crumb = pathTo(rig.world, "auxiliary", "›").at(-2)!.rect!;
  tap(rig, 200, crumb[1] + crumb[3] / 2); // anywhere on the strip
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
  const highlight = flat(rig.world.tree("auxiliary")).find((n) => n.type === "view" && n.bgColor >>> 0 === SELECTED_ROW)!.rect!;
  expect(highlight[1]).toBe(BODY_TOP + 2 * ROW); // the tapped album is highlighted where it was
  tap(rig, 100, BODY_TOP + 2 * ROW + 10);
  tapText(rig, "Albums", true); // the footer's Back gel reads "Albums" in a drill-down; the tab is the first match
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
}, 120_000);

test("the LCD tap reveals the playing song and scrolls it into view", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 10); // Aerodynamic plays
  drag(rig, 100, 200, -8, 10);
  frames(rig, 150);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  tapText(rig, "iPoDS");
  frames(rig, 40);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Aerodynamic");
  expect(listText(rig.world)).toContain("♪");
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
  expect(aligned(rowYs(rig.world))).toBe(true);
}, 120_000);

test("the LCD tap reveals the playing song from another tab, centred in the Songs list", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 7 * ROW + 10); // Digital Love, row 7
  tapText(rig, "Albums");
  expect(listText(rig.world)).not.toContain("Digital Love");
  tapText(rig, "iPoDS");
  frames(rig, 40);
  expect(screenText(rig.world, "auxiliary")).toContain("Song Name");
  expect(selectedRow(rig.world, "auxiliary")).toContain("Digital Love");
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(rowTextAt(rig.world, BODY_TOP + 4 * ROW)).toContain("Digital Love"); // centred: row 7 in a window from row 3
}, 120_000);

test("over the empty panel only the Scan again gel does anything", async () => {
  const rig = await bootSwapped([]);
  expect(screenText(rig.world, "auxiliary")).toContain("No music found");
  drag(rig, 100, 150, -8, 6);
  frames(rig, 10);
  tap(rig, 100, 120);
  expect(scans(rig.host)).toHaveLength(1);
  tapText(rig, "Scan again");
  expect(scans(rig.host)).toHaveLength(2);
}, 120_000);
```

Imports to add: `pathsTo`, `pathTo` from `./support/app-world.ts`; `BODY_PX`, `flat`, `rowTextAt`, `SELECTED_ROW`, `type Rig` from `./support/rig.ts`; `bodyTopPx` from `../app/explorer/scroll.ts`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/touch.test.ts`
Expected: the seven new tests FAIL.

- [ ] **Step 3: The parts' tap handlers**

`app/theme/parts/toolbar.tsx`: import `tapTarget` from `./gel.tsx`.

```tsx
export function LcdStatus(props: { title: string; line: string; layout?: Layout; onPress?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  return (
    <View class={t().lcdStatus(layout())} ref={tapTarget(props.onPress) as never}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX[layout()]} />
    </View>
  );
}

/** One tab gel; with `onSelect` (the narrow Explorer) it is a tap target. */
function TabGel(props: { tab: Tab; active: boolean; layout: Layout; onSelect?: (tab: Tab) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const onSelect = props.onSelect;
  return (
    <Gel classes={t().tab(props.active, props.layout)} ref={tapTarget(onSelect && (() => onSelect(props.tab)))}>
      <GelLabel text={props.tab} class={t().tabText(props.active)} shadow={props.active ? t().tabTextShadow : undefined} />
    </Gel>
  );
}
```

`SegmentedTabs` gains `onSelect?: (tab: Tab) => void` and renders `<TabGel tab={tab} active={tab === props.active} layout={layout()} onSelect={props.onSelect} theme={props.theme} />` in place of the inline `Gel`. `Toolbar` gains `onSelect?` and `onPress?` and passes `onPress` to `LcdStatus`, `onSelect` to `SegmentedTabs`.

`app/theme/parts/strips.tsx`: import `tapTarget` from `./gel.tsx`.

```tsx
/** One footer gel; with `onPress` it is a tap target. */
function FooterGel(props: { item: TouchLegendItem; onPress?: (action: TouchAction) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const onPress = props.onPress;
  return (
    <Gel classes={t().footerGel} ref={tapTarget(onPress && (() => onPress(props.item.action)))}>
      <GelLabel text={props.item.label} class={t().footerText} />
    </Gel>
  );
}

export function FooterGels(props: { items: readonly TouchLegendItem[]; onPress?: (action: TouchAction) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().footerRule} />
      <View class={t().footer}>
        <For each={props.items}>{(item) => <FooterGel item={item} onPress={props.onPress} theme={props.theme} />}</For>
      </View>
    </>
  );
}
```

`Breadcrumb` gains `onBack?: () => void`; the whole strip is the target (a 20 px label alone is too small, and the strip reads as one "up" control): `<View class={t().crumb} ref={tapTarget(props.onBack) as never}>` with its children unchanged.

- [ ] **Step 4: Wire the Explorer**

In `app/explorer/explorer.tsx` add, next to the shoulder handling, a reveal that both Y (wide) and the LCD (narrow) use:

```ts
  /**
   * Jump to the playing song: the Songs tab, focus on it; narrow also tweens the window to centre it.
   * Handlers run inside the frame's batch, where the settled values and effects are stale until it ends:
   * in the same view the tween starts now; when the reveal changes the view or clears the query, the
   * view-change effect centres the row after the batch, instead of restoring that view's remembered row.
   */
  const reveal = () => {
    const lib = library();
    const id = playingId();
    if (!lib || id < 0) return;
    const before = rowsKey(state());
    dispatch({ type: "reveal", id, library: lib });
    if (!scroller) return;
    if (rowsKey(state()) === before) scroller.scrollTo(centredOffset(focusOf(state()), page(), ROW_PX, maxOffset()));
    else pendingReveal = true;
  };
```

The wide shoulder branch calls `reveal()` instead of its inline dispatch. The footer actions:

```ts
  const onFooter = (action: TouchAction) => {
    if (action === "search") props.openSearch();
    else if (action === "back") dispatch({ type: "back" });
    else props.session.rescan();
  };
```

JSX: `<Toolbar … layout={props.layout} onSelect={wide ? undefined : (tab) => dispatch({ type: "setTab", tab })} onPress={wide ? undefined : reveal} />`; `<Breadcrumb … onBack={wide ? undefined : () => dispatch({ type: "back" })} />`; `<FooterGels items={gels!()} onPress={onFooter} />`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/touch.test.ts && bun run test`
Expected: check clean; touch 16 pass; 230 pass.

- [ ] **Step 6: Commit**

```bash
git add app/theme/parts/toolbar.tsx app/theme/parts/strips.tsx app/explorer/explorer.tsx tests/touch.test.ts
git commit -m "feat(swap): tabs, footer gels, the breadcrumb and the LCD answer taps"
```

---

### Task 6: Perf scenarios and results

**Files:**
- Modify: `scripts/perf.ts` (`Scenario.touch`, six scenarios, the touch tape env)
- Modify: `tests/perf.test.ts:11`
- Modify: `docs/perf.md` (a Screen Swap section)

**Interfaces:**
- Consumes: hold SELECT (Plan 9), the touch Explorer (Tasks 3–5), the host's `POCKETJS_CAPTURE_TOUCH` tape (`frame:id,x,y@frame:-`, x ≤ 319, y ≤ 239).
- Produces: scenarios `swapped-idle`, `touch-drag`, `touch-fling`, `swap`, `swap-dj`, `swap-search`.

- [ ] **Step 1: Measure the Search gel**

The `swap-search` tape taps the footer's Search gel, whose x depends on the baked font. Read it from the sim once: in a scratch test (not committed) boot swapped as `tests/support/rig.ts` does and print `pathTo(world, "auxiliary", "Search").at(-2)!.rect`; its centre is `SEARCH_GEL` below. The y is inside the footer (220–240).

- [ ] **Step 2: Extend the scenario test**

In `tests/perf.test.ts` the names assertion becomes:

```ts
  expect(SCENARIOS.map((s) => s.name)).toEqual(["idle", "scroll", "now-playing", "dj", "swapped-idle", "touch-drag", "touch-fling", "swap", "swap-dj", "swap-search", "scan-first", "scan-cached"]);
```

Add:

```ts
test("the touch tapes land where they mean to: list drags inside the body, the search tap in the footer, the swap inside the window", () => {
  const points = (name: string) => scenario(name).touch!.split("@").map((entry) => {
    const [frame, payload] = entry.split(":");
    if (payload === "-") return { frame: Number(frame), lift: true, x: 0, y: 0 };
    const [, x, y] = payload!.split(",").map(Number);
    return { frame: Number(frame), lift: false, x: x!, y: y! };
  });
  for (const name of ["touch-drag", "touch-fling"]) {
    const tape = points(name);
    expect(tape[0]!.frame).toBeGreaterThan(2525); // after the swap hold (2460–2525)
    expect(tape[0]!.y).toBeGreaterThanOrEqual(51); // the down lands in the list body…
    expect(tape[0]!.y).toBeLessThan(219);
    expect(tape[0]!.x).toBeLessThan(300); // …left of the scrollbar's hit region
    for (const p of tape) if (!p.lift) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(319); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(239); }
    expect(tape.at(-1)!.lift).toBe(true);
  }
  const search = points("swap-search");
  expect(search[0]!.y).toBeGreaterThanOrEqual(220); // the footer
  expect(search[0]!.frame).toBeGreaterThanOrEqual(3000); // inside the capture window
  expect(scenario("swap").tape).toBe("0:0x0,2950:0x1,3016:0x0"); // the hold fires at 3009, inside 3000–3059
  expect(scenario("swap-dj").tape.endsWith("3005:0x1,3007:0x0")).toBe(true);
  expect(scenario("swapped-idle").touch).toBeUndefined();
});
```

Run: `bun test --conditions=browser tests/perf.test.ts` → FAIL.

- [ ] **Step 3: The scenarios**

In `scripts/perf.ts`:

```ts
export interface Scenario {
  name: string;
  /** POCKETJS_CAPTURE_INPUT: frame:mask steps (the mask holds until the next step). */
  tape: string;
  /** POCKETJS_CAPTURE_TOUCH: `frame:id,x,y` entries joined by `@`, `frame:-` lifts; one bottom-screen contact. */
  touch?: string;
  capture: number;
  kind: "frame" | "scan";
  keepCard?: boolean;
}

const A = 0x2000, DOWN = 0x40, SELECT = 0x1;
/** SELECT held 66 frames from `at`: the hold fires at `at + 59` and swaps the screens. */
const holdSelect = (at: number) => `${at}:0x${SELECT.toString(16)},${at + 66}:0x0`;
/** One finger at x moving `step` px in y per frame from y0 for `count` frames, then lifted. */
function dragTape(start: number, x: number, y0: number, step: number, count: number): string {
  const entries: string[] = [];
  for (let i = 0; i < count; i++) entries.push(`${start + i}:1,${x},${y0 + step * i}`);
  entries.push(`${start + count}:-`);
  return entries.join("@");
}
/** The narrow footer's Search gel, measured in the sim (Task 6 Step 1). */
const SEARCH_GEL = { x: <measured>, y: <measured> };
// Presses wait until 40 s, well after the first scan (about 6 s in Azahar), so frame scenarios
// measure the settled app. The capture window is frames 3000–3059. Touch tapes start inside the
// list body (y 51–218): a contact's owner is decided where it lands.
export const SCENARIOS: readonly Scenario[] = [
  { name: "idle", tape: "0:0x0", capture: 3000, kind: "frame" },
  { name: "scroll", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2700:0x${DOWN.toString(16)}`, capture: 3000, kind: "frame" },
  { name: "now-playing", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0`, capture: 3000, kind: "frame" },
  { name: "dj", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2460:0x${SELECT.toString(16)},2466:0x0`, capture: 3000, kind: "frame" },
  // Swapped: the wide deck idle on top, the narrow list below.
  { name: "swapped-idle", tape: `0:0x0,${holdSelect(2460)}`, capture: 3000, kind: "frame" },
  // A slow finger-follow drag (2 px per frame, y 214 → 16) still down through the window: a sub-row
  // shift every frame, a row boundary about every 10.
  { name: "touch-drag", tape: `0:0x0,${holdSelect(2460)}`, touch: dragTape(2960, 160, 214, -2, 100), capture: 3000, kind: "frame" },
  // The fastest flick the cap allows (83 px per frame ≈ 5000 px/s over 215 → 132 → 49), lifted 4 frames
  // before the window: the fling crosses about 4 rows per frame at the start of the window and decays.
  { name: "touch-fling", tape: `0:0x0,${holdSelect(2460)}`, touch: dragTape(2993, 160, 215, -83, 3), capture: 3000, kind: "frame" },
  // The swap itself: the hold fires at 3009, so both screens' remount is inside the window.
  { name: "swap", tape: `0:0x0,${holdSelect(2950)}`, capture: 3000, kind: "frame" },
  // DJ Mode replacing the narrow Explorer: a SELECT tap at 3005, released at 3007.
  { name: "swap-dj", tape: `0:0x0,${holdSelect(2460)},3005:0x${SELECT.toString(16)},3007:0x0`, capture: 3000, kind: "frame" },
  // The keyboard while swapped: both screens rebuild in one frame when the Search gel is tapped.
  { name: "swap-search", tape: `0:0x0,${holdSelect(2460)}`, touch: `3005:1,${SEARCH_GEL.x},${SEARCH_GEL.y}@3006:-`, capture: 3000, kind: "frame" },
  { name: "scan-first", tape: "0:0x0", capture: 3600, kind: "scan" },
  { name: "scan-cached", tape: "0:0x0", capture: 3600, kind: "scan", keepCard: true },
];
```

Replace `<measured>` with the two integers from Step 1. In `build()` the env gains `POCKETJS_CAPTURE_TOUCH: scenario.touch ?? ""`.

Run: `bun test --conditions=browser tests/perf.test.ts` → PASS.

- [ ] **Step 4: Run the scenarios (the orchestrator, on the machine with Azahar and Docker)**

One scenario per invocation (see the harness note in `docs/perf.md`):

```bash
bun run perf swapped-idle --model both --check
bun run perf touch-drag --model both --check
bun run perf touch-fling --model both --check
bun run perf swap --model both --check
bun run perf swap-dj --model both --check
bun run perf swap-search --model both --check
bun run perf scroll --model both --check   # the control: unchanged by this plan
```

Expected: every row within budget (`--check` exits non-zero otherwise). The budget is not relaxed for remount frames. If a scenario fails on Old:
- `touch-fling`: lower `FLING_MAX_PX_PER_S` in `app/controls.ts` (4000, then 3000), update the two expectations in `tests/scroll.test.ts`, rerun.
- `swap`, `swap-dj` or `swap-search`: delay the bottom screen's new content by one frame. In `app/app.tsx`, derive the bottom Switch from a `bottomPlace` signal that an `onFrame` copies from `place()` one frame after it changes (the top screen mounts first, the bottom the frame after); pin it with a sim test in `tests/swap.test.ts` (`the bottom screen follows the top one frame later`) and rerun.

- [ ] **Step 5: Record the rows**

Append to `docs/perf.md`:

```markdown
## Screen Swap (Plan 10)

The Screen Swap branch (`feature/screen-switch-mode`, `docs/superpowers/plans/2026-10-10-screen-swap-10-touch.md`): with the screens swapped the Explorer is a 320 px touch list on the bottom screen over the framework's kinetic scroller (a settled whole-row `top`, a per-frame sub-row translate, a translating thumb, the real fling from a capped release velocity), and the deck is 400 px wide on top with no recognizers. `swapped-idle` is the swapped app at rest; `touch-drag` a finger-follow drag at 2 px per frame through the window; `touch-fling` a flick at the 5000 px/s cap lifted 4 frames before the window; `swap` the hold's remount frame inside the window; `swap-dj` DJ Mode replacing the list; `swap-search` the keyboard rebuilding both screens. `bun run perf <scenario> --model both --check`, one scenario per invocation:

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| swapped-idle | new | | | | | | |
| touch-drag | new | | | | | | |
| touch-fling | new | | | | | | |
| swap | new | | | | | | |
| swap-dj | new | | | | | | |
| swap-search | new | | | | | | |
| scroll | new | | | | | | |
| swapped-idle | old | | | | | | |
| touch-drag | old | | | | | | |
| touch-fling | old | | | | | | |
| swap | old | | | | | | |
| swap-dj | old | | | | | | |
| swap-search | old | | | | | | |
| scroll | old | | | | | | |

<two or three sentences: how `touch-fling` and the three remount rows on Old compare with the 30 ms budget and the Plan 9 `scroll` row; whether the cap was lowered or the bottom screen delayed; whether `scroll` moved.>
```

Fill every cell from the runs' output (the same columns the earlier sections use) and replace the angle-bracket note with the sentences. No empty cells and no placeholder may remain when this task is committed.

- [ ] **Step 6: Run the checks and commit**

Run: `bun run check && bun run test`
Expected: check clean; 231 pass.

```bash
git add scripts/perf.ts tests/perf.test.ts docs/perf.md
git commit -m "perf(swap): six swapped and touch scenarios, measured on both models"
```

(If `FLING_MAX_PX_PER_S` or the shell changed, add those files and say so in the body.)

---

### Task 7: Docs, the device checklist and the branch review

**Files:**
- Modify: `README.md` (the touch paragraph)
- Modify: `app/explorer/explorer.tsx:1-3` (the header comment)

- [ ] **Step 1: README**

In the Controls section's closing paragraph, replace `Swapped, the bottom screen is the library.` with:

```markdown
Swapped, the bottom screen is the library: drag the list to scroll it and flick
it to fling, drag the scrollbar's thumb or tap its track to page, tap a tab to
switch, tap a song to play it or an album to open it, and tap the footer's
Search and Back, the breadcrumb, or the iPoDS LCD to jump to the playing song.
```

The controls table is untouched (its test still passes).

- [ ] **Step 2: The Explorer's header comment**

Replace the first three lines of `app/explorer/explorer.tsx` with:

```ts
// The Explorer: Toolbar, search strip / breadcrumb, column header, the library list (app-owned
// focus over a pool of recycled rows) and the footer. Wide (the 400 px top screen) it is driven by
// the buttons; narrow (the 320 px touch screen, swapped) by a finger: a kinetic scroller, row taps,
// the scrollbar, the tabs, the footer gels, the breadcrumb and the LCD. Model logic lives in
// model.ts and the scroll arithmetic in scroll.ts; this file renders them and binds the input.
```

- [ ] **Step 3: Verify and commit**

Run: `bun run check && bun run test && bun run gallery`
Expected: check clean; 231 pass; the gallery renders.

```bash
git add README.md app/explorer/explorer.tsx
git commit -m "docs(swap): the touch controls in the README; the Explorer's header"
```

- [ ] **Step 4: Whole-branch review**

The orchestrator dispatches one Sonnet reviewer over `git diff main...feature/screen-switch-mode`, with the spec (§4–§9) and both plans' Review Focus lists as the acceptance criteria. Defects are fixed in `fix(swap): …` commits with a pinning test each.

- [ ] **Step 5: Hand over**

Build the device binary (`bun run 3ds`, copy `dist/ipo-ds-main.3dsx` to `~/git/ds-man/dist/ipo-ds-swap-<sha>.3dsx`, outside Git) and hand Dan the PR text with this checklist, per `superpowers:finishing-a-development-branch`. Opening the PR is Dan's call.

**Device checklist (Azahar, then hardware)**

1. Hold SELECT one second: the deck moves to the top screen at 400 px with the LCD reaching x 390; the list sits on the bottom with the tabs inside the toolbar; hold again to return.
2. A stylus drag follows the finger exactly, with no lag or jitter; lifting mid-row settles on a row.
3. A flick flings and decays; the fastest flick does not visibly skip more than a few rows per frame; the list stops hard at both ends (no bounce).
4. Tapping a song plays it at once and moves the highlight; a slow drag that starts on a row does not play it; a tap that catches a moving list plays the row under the stylus.
5. The thumb follows a stylus drag and lands on a row; a tap on the track pages up and down.
6. Tabs switch on a tap; L and R still switch them.
7. Search gel: the keyboard opens below, the list moves up with live results; START returns the swap; Clear clears.
8. Breadcrumb tap returns to the albums with the opened album highlighted; the Back gel does the same.
9. The iPoDS LCD tap scrolls to the playing song, from any tab.
10. SELECT tap in swapped mode: the record replaces the list; scratching works; the panel's gel returns to the list.
11. Swapped buttons: A pauses; holding left or right walks the capsule's time and seeks once on release; X shuffles; Y cycles repeat.
12. L + R in swapped mode shows the frame time in the top LCD; scroll and flick the list on an Old 3DS and read it: no sustained frames over 30 ms; open DJ Mode and the keyboard from swapped mode and watch the one-frame spike.
