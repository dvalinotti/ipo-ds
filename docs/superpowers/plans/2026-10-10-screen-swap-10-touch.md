# Screen Swap Plan 10 — The Touch Explorer (ipo-ds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With the screens swapped, the Explorer on the bottom screen is driven by touch: drag and flick the list, drag the scrollbar thumb or tap its track, tap a tab, tap a song to play it or an album to open it, tap the footer gels, the breadcrumb and the LCD; all within the frame budgets on both models.

**Architecture:** In narrow layout the Explorer owns a framework kinetic scroller whose pixel offset splits into a settled whole-row `top` for the recycled list and a per-frame sub-row `shift` on two paint-only translates. One gesture over the list body (a geometry region that stops short of the scrollbar) feeds the scroller and resolves taps to rows by arithmetic, since the rows tile the body exactly. A second gesture over the scrollbar drags the thumb or pages. The chrome parts (tabs, footer gels, breadcrumb, LCD) each own a tap recognizer when given a handler. The arithmetic is pure in `app/explorer/scroll.ts`. Four perf scenarios with touch tapes measure it in Azahar.

**Tech Stack:** TypeScript, Solid (`solid-js`), PocketJS `@pocketjs/framework/gesture` and `@pocketjs/framework/kinetics`, Bun tests on the PocketJS sim, Azahar for perf.

**Spec:** `docs/superpowers/specs/2026-10-10-screen-swap-design.md` (§5, §7, §8, §9). Read it before any task. Plan 9 (`docs/superpowers/plans/2026-10-10-screen-swap-09-layouts.md`) must be complete on this branch: 205 tests pass, `Explorer` takes `layout`, hold SELECT swaps.

**Execution:** Opus (high effort) orchestrates; every task runs as one Sonnet implementer subagent plus one Sonnet reviewer subagent (`model: "sonnet"`), per `superpowers:subagent-driven-development`. The orchestrator runs each task's verification commands itself before starting the next task, and runs the Azahar perf scenarios of Task 6 itself (they need Azahar, Docker and `dist/test-music`).

## Global Constraints

- Work on branch `feature/screen-switch-mode` in the worktree `~/orca/workspaces/ds-man/cornetfish`. No fork code changes; the `runtime` pin stays at `2c72e830`.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives and control flow from `solid-js`. The gesture layer is `createGesture` from `@pocketjs/framework/gesture`; the scroller is `createScroller` from `@pocketjs/framework/kinetics`.
- Theme slots are complete class literals; never build one by concatenation.
- Commits: Conventional Commits (`feat(swap): …`, `test(swap): …`, `perf(swap): …`, `docs(swap): …`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Keep build products, logs and captures out of Git.
- Run tests with `bun run test` or `bun test --conditions=browser tests/<file>`; never discover tests through `runtime/`. Every task ends with `bun run check` and `bun run test` green. The baseline is 205 tests.
- Geometry (narrow Explorer, logical px): the list body starts at y 51 + 21 per strip (toolbar 34 + rule 1, header 15 + rule 1, each strip 20 + rule 1) and is 168 − 21 × strips tall; rows are 21 px and tile it exactly; the scrollbar's drawn track is the right 14 px and its hit region the right 24 px (x ≥ 296); the toolbar is y 0–34 and the LCD sits at x 48–140 in it.
- Scrolling: no rubber band (`overscroll: 0`); the rest position snaps to a row; the release velocity is clamped to `FLING_MAX_PX_PER_S = 5000` (about 4 rows per frame); page tweens use the scroller's default 200 ms.
- Per-frame rule (spec §8): nothing in a gesture handler reads the row memo; `top` stays a settled signal; only `shift`, the overlay translate and the thumb translate move per frame; store writes happen on settle and on cleanup, never per frame.
- Budgets: CPU max ≤ 14 ms on New, ≤ 30 ms on Old, per `docs/perf.md`.

## Review Focus

1. **A tap that stops a fling** must leave the list row-aligned and act on the row under the finger. Pinned in Task 3 (`a tap during a fling stops it on a row and plays that row`).
2. **A drag that starts on the scrollbar** must move the list by the thumb's ratio, not by the finger's pixels, and never also scroll it as a list drag. Pinned in Task 4 (`dragging the thumb scrolls by the track ratio`).
3. **The rows shrinking under a scrolled list** (a search typed while scrolled down) must clamp the offset and show the matches from the top without a crash. Pinned in Task 5 (`a search typed while scrolled shows the matches from the top`).
4. **A touch over a state panel** (scanning, empty) must do nothing except the Scan again gel. Pinned in Task 5 (`over the empty panel only the Scan again gel does anything`).
5. **Returning from a tapped album** by the breadcrumb or the Back gel must land on the album list with that album highlighted, not at the top with the focus lost. Pinned in Task 5 (`the breadcrumb returns to the albums with the opened album highlighted`).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/explorer/scroll.ts` (new) | Pure scroll arithmetic: offset split, snap, velocity cap, row under a point, thumb mapping, page and centred offsets, the body's top. |
| `app/controls.ts` | `FLING_MAX_PX_PER_S`. |
| `app/explorer/window.ts` | `poolSize`. |
| `app/explorer/recycled-list.tsx` | `shift` and `shiftable` props. |
| `app/theme/aqua.ts`, `app/theme/parts/list.tsx` | The thumb moves by translate. |
| `app/explorer/explorer.tsx` | Narrow: the scroller, the list and scrollbar gestures, row taps, chrome wiring, per-view scroll memory. |
| `app/theme/parts/toolbar.tsx`, `strips.tsx` | Tap recognizers on tabs, the LCD, the footer gels and the breadcrumb. |
| `scripts/perf.ts`, `docs/perf.md`, `tests/perf.test.ts` | Touch tapes; four scenarios; results. |
| `README.md`, the spec | The touch paragraph; recorded deviations. |
| `tests/scroll.test.ts`, `tests/touch.test.ts` (new); `tests/recycled-list.test.ts` | Unit and headless tests. |

---

### Task 1: Scroll arithmetic

**Files:**
- Create: `app/explorer/scroll.ts`
- Modify: `app/controls.ts` (add `FLING_MAX_PX_PER_S`)
- Test: `tests/scroll.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all pure, exported from `app/explorer/scroll.ts`):
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
import { bodyTopPx, centredOffset, clampVelocity, offsetForThumb, pageOffset, rowAt, snapToRow, splitOffset, thumbFor } from "../app/explorer/scroll.ts";

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

test("a release velocity is clamped to the fling cap, either way", () => {
  expect(FLING_MAX_PX_PER_S).toBe(5000);
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

test("the list body starts under the toolbar and header, plus a strip each for the search and crumb", () => {
  expect(bodyTopPx(0)).toBe(51);
  expect(bodyTopPx(1)).toBe(72);
  expect(bodyTopPx(2)).toBe(93);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/scroll.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Write the module and the constant**

Append to `app/controls.ts`:

```ts
/** The fastest flick the list accepts, px per virtual second: about 4 rows per frame (spec §8). */
export const FLING_MAX_PX_PER_S = 5000;
```

```ts
// app/explorer/scroll.ts
// The touch Explorer's scroll arithmetic (spec §5.2–§5.4), pure: the Explorer binds it to the
// framework's kinetic scroller. Offsets are px of content above the window; `max` is the
// largest offset, (rows − page) × row height, never negative.

const clamp = (value: number, max: number) => Math.min(Math.max(0, max), Math.max(0, value));

/** Whole rows above the window and the sub-row remainder the canvas is shifted by. */
export function splitOffset(offset: number, rowPx: number): { top: number; shift: number } {
  const top = Math.floor(offset / rowPx);
  return { top, shift: offset - top * rowPx };
}

/** The row boundary nearest a projected rest position, inside the range. */
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

### Task 2: A shiftable recycled list and a translating thumb

**Files:**
- Modify: `app/explorer/window.ts` (`poolSize`)
- Modify: `app/explorer/recycled-list.tsx` (`shift`, `shiftable`)
- Modify: `app/theme/aqua.ts` (`SCROLL_THUMB.body` gains `top-[0]`), `app/theme/parts/list.tsx` (`Scrollbar` uses `translateY`)
- Test: `tests/recycled-list.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `poolSize(count: number, rows: number, extra: 1 | 2): number`; `RecycledList` props `shift?: number` (px, default 0) and `shiftable?: boolean` (a pool of `rows + 2`, default false).

- [ ] **Step 1: Write the failing test**

Append to `tests/recycled-list.test.ts` (add `poolSize` to the import):

```ts
test("the pool is one slot past the window, two when the window can start mid-row, rounded to even, never past the rows", () => {
  expect(poolSize(20, 8, 1)).toBe(10);
  expect(poolSize(20, 8, 2)).toBe(10);
  expect(poolSize(20, 7, 1)).toBe(8);
  expect(poolSize(20, 7, 2)).toBe(10);
  expect(poolSize(5, 8, 2)).toBe(5);
  expect(poolSize(0, 8, 1)).toBe(0);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `bun test --conditions=browser tests/recycled-list.test.ts`
Expected: FAIL, `poolSize` is not exported.

- [ ] **Step 3: Extract the pool size and add the shift**

`app/explorer/window.ts`:

```ts
/**
 * Slots for a window of `rows`: `extra` past the window (1, or 2 when the window can start mid-row
 * and a partial row shows at the bottom), rounded up to even so a slot's rows share a parity and
 * its stripe never changes, and never more than the rows.
 */
export function poolSize(count: number, rows: number, extra: 1 | 2): number {
  const n = rows + extra;
  return Math.min(count, n + (n % 2));
}
```

`app/explorer/recycled-list.tsx`: import `poolSize`; add to the props:

```ts
  /** Sub-row px the window is scrolled past `top` (touch scrolling); 0 keeps the window on a row. */
  shift?: number;
  /** The window can start mid-row: one more slot, so a partial row at the bottom has one. */
  shiftable?: boolean;
```

Replace the pool memo with `const pool = createMemo(() => poolSize(props.count, props.rows, props.shiftable ? 2 : 1));` and the canvas translate with `style={{ translateY: -(props.top * props.rowHeight + (props.shift ?? 0)) }}`.

`app/theme/aqua.ts`: `SCROLL_THUMB.body` becomes `"absolute left-[1] top-[0] w-[11] rounded-[6] …"` (the rest unchanged).

`app/theme/parts/list.tsx`, `Scrollbar`: `style={{ translateY: props.thumbTop, height: props.thumbHeight }}` with the comment `// translate, not inset: the thumb moves every frame under a finger and must not relayout`.

- [ ] **Step 4: Run the checks**

Run: `bun run check && bun run test`
Expected: check clean; 214 pass (205 + 8 scroll + 1 pool). The gallery `gels` state still shows the three thumbs where they were.

- [ ] **Step 5: Commit**

```bash
git add app/explorer/window.ts app/explorer/recycled-list.tsx app/theme/aqua.ts app/theme/parts/list.tsx tests/recycled-list.test.ts
git commit -m "feat(swap): the recycled list takes a sub-row shift; the thumb moves by translate"
```

---

### Task 3: Finger scrolling and row taps

**Files:**
- Modify: `app/explorer/explorer.tsx`
- Modify: `docs/superpowers/specs/2026-10-10-screen-swap-design.md` §5.3 (rows resolved by geometry)
- Test: `tests/touch.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's functions, Task 2's props, `createScroller` / `createGesture`.
- Produces: the narrow Explorer scrolls under a finger, flings, snaps, and plays or opens a tapped row; `ExplorerStore.scrollRow` is kept per view from the scroller.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/touch.test.ts
// The touch Explorer (spec §5): with the screens swapped, the list on the bottom screen is dragged,
// flicked, tapped and paged by hand. Rows are 21 px from y 51; the fixture's sorted songs start
// Aerodynamic, Around the World, Bohemian Rhapsody, Crescendolls, Da Funk, DARE, Death on Two Legs,
// Digital Love, Dirty Harry, Feel Good Inc., Glósóli, Gong, … (20 songs: content 420, window 168).
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, pathTo, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

const A = BTN.CIRCLE;
const SELECTED_ROW = 0xffd77538;
const BODY_TOP = 51, ROW = 21;
type Surface = "primary" | "auxiliary";

interface Rig {
  world: BundleWorld;
  host: SimLocalMediaHost;
}

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

function holdSelect(rig: Rig): void {
  frames(rig, 62, { buttons: BTN.SELECT });
  frames(rig, 3);
}

/** A tap: one frame down, then lifted. */
function tap(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

/** A finger moving `step` px in y per frame for `count` frames, left down (lift with `frames(rig, n)`). */
function drag(rig: Rig, x: number, y0: number, step: number, count: number): void {
  for (let i = 0; i < count; i++) frames(rig, 1, { touches: [{ x, y: y0 + step * i }], surface: "auxiliary" });
}

/** Boots, plays nothing, and swaps the screens: the narrow Explorer is on the bottom. */
async function bootSwapped(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const host = createSimLocalMedia(library);
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("iPoDS");
  return rig;
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

/** The y of every 320 × 21 row View inside the bottom screen (slot rows and the selection overlay; an overlay scrolled off-screen is left out). */
function rowYs(world: BundleWorld): number[] {
  return flat(world.tree("auxiliary"))
    .filter((n) => n.rect && n.rect[0] === 0 && n.rect[2] === 320 && n.rect[3] === ROW && n.rect[1] > BODY_TOP - ROW && n.rect[1] < 240)
    .map((n) => n.rect![1]);
}

const aligned = (ys: number[]) => ys.every((y) => (y - BODY_TOP) % ROW === 0);

function selectedRow(world: BundleWorld, surface: Surface): string {
  const row = flat(world.tree(surface)).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row ? flat(row).map((node) => node.text).join("") : "";
}

const opens = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("open("));

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

test("a tap on an album opens it; a tap on the gap below the last row does nothing", async () => {
  const rig = await bootSwapped();
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER); // Albums
  tap(rig, 100, BODY_TOP + 10); // the first album
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  expect(opens(rig.host)).toEqual([]);
  const rig2 = await bootSwapped([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  tap(rig2, 100, BODY_TOP + 5 * ROW); // below three rows
  expect(opens(rig2.host)).toEqual([]);
}, 120_000);

test("a drag follows the finger mid-row; a flick flings and settles on a row; the list never passes its end", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 180, -8, 4); // 24 px of travel: panning, mid-row
  expect(aligned(rowYs(rig.world))).toBe(false);
  drag(rig, 100, 148, -8, 6); // 72 px in all, then lift at 480 px/s
  frames(rig, 150);
  const ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  // 20 rows, 8 per window: the end is top 12, rows 12–19 at y 51–198, nothing drawn below.
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(Math.max(...ys)).toBe(BODY_TOP + 7 * ROW);
  expect(opens(rig.host)).toEqual([]); // dragging never plays
}, 120_000);

test("a tap during a fling stops it on a row and plays that row", async () => {
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
  expect(selectedRow(rig.world, "auxiliary")).not.toBe("");
}, 120_000);

test("the list keeps its touch-scrolled place across a swap and back when the tapped row is still in view", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 7 * ROW + 10); // Digital Love plays; the highlight is on row 7
  drag(rig, 100, 200, -20, 3); // 60 px up, then held still so the lift has no velocity
  drag(rig, 100, 140, 0, 6);
  frames(rig, 60); // snaps to row 3: rows 3–10 shown, the highlighted row 7 among them
  const before = rowYs(rig.world);
  expect(aligned(before)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  holdSelect(rig); // normal: the wide list keeps the window, since the focused row is inside it
  expect(screenText(rig.world, "primary")).not.toContain("Aerodynamic");
  expect(selectedRow(rig.world, "primary")).toContain("Digital Love");
  holdSelect(rig);
  expect(rowYs(rig.world)).toEqual(before);
}, 120_000);
```

The wide layout keeps the focused row visible (`nearestTop`), so a narrow scroll position survives a swap only while the focused row is inside the window; a window scrolled away from the focus snaps back to it on the wide side. The test tapes a row first for that reason.

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/touch.test.ts`
Expected: the tap, drag, fling and place tests FAIL (touches do nothing yet).

- [ ] **Step 3: The scroller and the list gesture**

In `app/explorer/explorer.tsx`:

Imports: `createGesture` from `@pocketjs/framework/gesture`; `createScroller, type Scroller` from `@pocketjs/framework/kinetics`; `FLING_MAX_PX_PER_S` from `../controls.ts`; `bodyTopPx, centredOffset, clampVelocity, rowAt, snapToRow, splitOffset, thumbFor` from `./scroll.ts`; `poolSize` is not needed here.

After `const page = …` add:

```ts
  const bodyTop = () => bodyTopPx(strips());
  /** The largest offset: the rows past the window, in px. */
  const maxOffset = () => Math.max(0, rows().length - page()) * ROW_PX;
  /** The scrollbar's hit region: the right 24 px of the body (the drawn track is 14). */
  const TRACK_HIT_PX = 24;
```

Replace the `// --- list ---` block's `previousTop` / `top` lines with:

```ts
  // --- list ----------------------------------------------------------------
  // Wide: the first row in the window is the least scrolling that keeps the focused row visible.
  // Narrow: a kinetic scroller owns a px offset under the finger; `top` is its whole-row part (settled,
  // so a frame that crosses no row boundary re-runs nothing downstream) and `shift` the remainder, read
  // by exactly two paint-only translates. Store writes happen on settle and on cleanup, never per frame.
  const key0 = viewKey(currentView(untrack(state)));
  let previousTop = props.store.scrollRow.get(key0) ?? 0;
  let scroller: Scroller | null = null;
  if (!wide) {
    scroller = createScroller({
      max: maxOffset,
      extent: bodyPx,
      initial: previousTop * ROW_PX,
      overscroll: 0,
      snap: (rest) => snapToRow(rest, ROW_PX, maxOffset()),
      onSettle: (offset) => props.store.scrollRow.set(viewKey(currentView(untrack(state))), Math.round(offset / ROW_PX)),
    });
    const s = scroller;
    onFrame(() => s.step());
    // A view change (tab, drill, back) shows that view where it was left; a query change starts at the top.
    let shownKey = key0;
    createEffect(on(key, () => {
      const now = viewKey(currentView(untrack(state)));
      if (now === shownKey) {
        s.scrollTo(0, { immediate: true });
        return;
      }
      props.store.scrollRow.set(shownKey, Math.round(s.offset() / ROW_PX));
      shownKey = now;
      s.scrollTo((props.store.scrollRow.get(now) ?? 0) * ROW_PX, { immediate: true });
    }, { defer: true }));
  }
  onCleanup(() => {
    const row = scroller ? Math.round(scroller.offset() / ROW_PX) : previousTop;
    props.store.scrollRow.set(viewKey(currentView(untrack(state))), row);
  });
  const top = wide
    ? settled(() => (previousTop = nearestTop(previousTop, focus(), page(), rows().length)))
    : settled(() => splitOffset(scroller!.offset(), ROW_PX).top);
  const shift = wide ? () => 0 : createMemo(() => splitOffset(scroller!.offset(), ROW_PX).shift);
  const thumb = createMemo(() => thumbFor(wide ? top() * ROW_PX : scroller!.offset(), rows().length * ROW_PX, bodyPx()));
```

(Delete the old `thumb` memo; Task 5 of Plan 9 added `onCleanup` for `scrollRow`, replace it with the one above.)

Then the gesture, after the thumb memo:

```ts
  // --- touch (narrow) --------------------------------------------------------
  /** A stopped fling or a lifted thumb can leave the window mid-row: tween to the nearest row. */
  const settle = () => {
    const s = scroller!;
    if (s.state() !== "idle") return;
    const target = snapToRow(s.offset(), ROW_PX, maxOffset());
    if (target !== s.offset()) s.scrollTo(target);
  };
  if (!wide) {
    const s = scroller!;
    // The list body, short of the scrollbar's hit region. A geometry region, not a node: the rows tile
    // the body exactly, so the row under a finger is arithmetic (rowAt) and no hit walk is needed.
    createGesture({
      surface: "auxiliary",
      axis: "y",
      region: { rect: () => ({ x: 0, y: bodyTop(), w: 320 - TRACK_HIT_PX, h: bodyPx() }) },
      onDown: () => { if (listActive()) s.stop(); },
      onPanStart: () => { if (listActive()) s.beginDrag(); },
      onPanMove: (c) => { if (listActive()) s.drag(-c.fdy); },
      onPanEnd: (c) => { if (listActive()) s.endDrag(-clampVelocity(c.vy, FLING_MAX_PX_PER_S)); },
      onUp: () => { if (listActive()) settle(); },
      onCancel: () => { if (s.state() === "tracking") s.endDrag(0); },
      onTap: (c) => {
        if (!listActive()) return;
        const lib = library();
        if (!lib) return;
        const now = state();
        const list = visibleRows(lib, now);
        const index = rowAt(c.y, bodyTop(), s.offset(), ROW_PX, list.length);
        if (index < 0) return;
        dispatch({ type: "focus", index, count: list.length });
        const row = list[index]!;
        if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: songIds(list), startId: row.id });
        else dispatch({ type: "open", row });
      },
    });
  }
```

`onUp` fires on every release, taps included, after `onPanEnd`; a release that ends a fling leaves the state `fling`, so `settle` only acts on a stopped, idle scroller (a tap that arrested one).

JSX: `<RecycledList … top={top()} shift={shift()} shiftable={!wide} …>` and the overlay `style={{ translateY: (focus() - top()) * ROW_PX - shift() }}`.

- [ ] **Step 4: Record the geometry decision in the spec**

In the spec's §5.3 replace the first bullet with:

`- ` + "`onTap` resolves the row by arithmetic: the rows tile the body exactly from `bodyTopPx(strips)`, so `rowAt(y, bodyTop, offset, 21, count)` names it with no hit walk (the framework's hit resolver is not public API, and the geometry is fixed). A point below the last row is a gap: nothing happens."

And in §8 change `The down handler stops the fling and walks about four parents from the hit node to a slot, once per touch.` to `The down handler stops the fling; the tap handler computes the row from the contact's y.`

And in §4.4 append: `The wide layout keeps the focused row visible, so a narrow scroll position survives a swap while the focused row (a tapped row) is inside the window.`

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/touch.test.ts && bun run test`
Expected: check clean; touch 5 pass; 219 pass in all. If the fling test's end rows differ, print `rowYs` and `screenText`: the fixture has 20 songs and the window 8 rows, so the end is top 12.

- [ ] **Step 6: Commit**

```bash
git add app/explorer/explorer.tsx tests/touch.test.ts docs/superpowers/specs/2026-10-10-screen-swap-design.md
git commit -m "feat(swap): the narrow Explorer scrolls under a finger, flings to a row, and plays a tapped song"
```

---

### Task 4: The scrollbar: thumb drag and track paging

**Files:**
- Modify: `app/explorer/explorer.tsx`
- Test: `tests/touch.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's scroller, `thumb`, `settle`; Task 1's `offsetForThumb`, `pageOffset`.
- Produces: a second gesture over the right 24 px of the body.

- [ ] **Step 1: Write the failing tests**

```ts
test("dragging the thumb scrolls by the track ratio, not the finger's pixels, and lands on a row", async () => {
  const rig = await bootSwapped();
  // 20 rows in a 168 px window: the thumb is 67 px tall, its travel 101 px for 252 px of content.
  drag(rig, 313, BODY_TOP + 10, 0, 1); // down on the thumb
  drag(rig, 313, BODY_TOP + 10, 10, 6); // 50 px down the track: about 125 px of content, 6 rows
  frames(rig, 40);
  const ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  expect(screenText(rig.world, "auxiliary")).toContain("Death on Two Legs"); // row 6 at the top
  expect(opens(rig.host)).toEqual([]);
}, 120_000);

test("a tap on the track below the thumb pages down; above it pages up", async () => {
  const rig = await bootSwapped();
  tap(rig, 313, BODY_TOP + 150); // below the thumb (0–67)
  frames(rig, 30);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(screenText(rig.world, "auxiliary")).toContain("Dirty Harry"); // row 8 at the top
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  tap(rig, 313, BODY_TOP + 2); // above the thumb now
  frames(rig, 30);
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
}, 120_000);
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/touch.test.ts`
Expected: the two new tests FAIL (the track region belongs to no recognizer; the list region stops short of it).

- [ ] **Step 3: The scrollbar gesture**

In the `if (!wide)` touch block of `app/explorer/explorer.tsx`, after the list gesture:

```ts
    // The scrollbar: a down on the thumb drags it (finger travel maps to the offset by the track ratio);
    // a tap on the track above or below it pages. Registered after the list's recognizer, and the list's
    // region stops at x 296, so a contact here is the scrollbar's alone.
    let grab: number | null = null; // the finger's y inside the thumb while dragging it
    const thumbAt = (y: number) => {
      const t = thumb();
      if (!t) return null;
      const local = y - bodyTop();
      return local >= t.top && local < t.top + t.height ? local - t.top : null;
    };
    createGesture({
      surface: "auxiliary",
      axis: "y",
      region: { rect: () => ({ x: 320 - TRACK_HIT_PX, y: bodyTop(), w: TRACK_HIT_PX, h: bodyPx() }) },
      onDown: (c) => {
        grab = null;
        if (!listActive()) return;
        s.stop();
        grab = thumbAt(c.y);
      },
      onPanMove: (c) => {
        const t = thumb();
        if (grab === null || !t || !listActive()) return;
        s.scrollTo(offsetForThumb(c.y - bodyTop() - grab, rows().length * ROW_PX, bodyPx(), t.height), { immediate: true });
      },
      onPanEnd: () => {
        grab = null;
        if (listActive()) settle();
      },
      onUp: () => { if (listActive()) settle(); },
      onCancel: () => { grab = null; },
      onTap: (c) => {
        const t = thumb();
        if (!t || !listActive() || thumbAt(c.y) !== null) return;
        s.scrollTo(pageOffset(s.offset(), c.y - bodyTop() < t.top ? -1 : 1, page() * ROW_PX, maxOffset()));
      },
    });
```

Add `offsetForThumb` and `pageOffset` to the `./scroll.ts` import. `rows().length` in `onPanMove` reads the settled row count, not the row memo's cells; it runs only while a thumb drag moves.

- [ ] **Step 4: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/touch.test.ts && bun run test`
Expected: check clean; touch 7 pass; 221 pass.

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
- Modify: `app/explorer/explorer.tsx` (wiring; the LCD reveal)
- Modify: the spec §5.5 (the breadcrumb strip is the target)
- Test: `tests/touch.test.ts` (append)

**Interfaces:**
- Consumes: Task 3's scroller; `setTab`, `touchLegendOf`, `TouchAction` (Plan 9).
- Produces: `SegmentedTabs` / `Toolbar` take `onSelect?: (tab: Tab) => void`; `LcdStatus` / `Toolbar` take `onPress?: () => void`; `FooterGels` takes `onPress?: (action: TouchAction) => void`; `Breadcrumb` takes `onBack?: () => void`. Each recognizer exists only when its handler is given, on the auxiliary surface.

- [ ] **Step 1: Write the failing tests**

```ts
/** Taps the centre of the first text node reading `text` on the bottom screen (inside its gel). */
function tapText(rig: Rig, text: string): void {
  const [x, y, w, h] = pathTo(rig.world, "auxiliary", text).at(-2)!.rect!;
  tap(rig, x + w / 2, y + h / 2);
}

/** Taps a key of the open keyboard by its label. */
function typeKeys(rig: Rig, keys: string): void {
  for (const key of keys) {
    const [x, y, w, h] = pathTo(rig.world, "auxiliary", key).at(-2)!.rect!;
    tap(rig, x + w / 2, y + h / 2);
  }
}

test("tapping a tab switches to it; L / R still step", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Albums");
  expect(screenText(rig.world, "auxiliary")).toContain("Album");
  expect(screenText(rig.world, "auxiliary")).toContain("Discovery");
  tapText(rig, "Artists");
  expect(screenText(rig.world, "auxiliary")).toContain("Daft Punk");
  expect(screenText(rig.world, "auxiliary")).not.toContain("Discovery");
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
  for (const part of ["Search:gor", "Edit search", "Clear", "DARE"]) expect(bottom).toContain(part);
  expect(bottom).not.toContain("Aerodynamic");
  tapText(rig, "Clear");
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
}, 120_000);

test("a search typed while scrolled shows the matches from the top", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -6, 10);
  frames(rig, 150);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  tapText(rig, "Search");
  typeKeys(rig, "dig");
  press(rig, BTN.START);
  expect(rig.world.failure).toBeNull();
  expect(screenText(rig.world, "auxiliary")).toContain("Digital Love");
  expect(Math.min(...rowYs(rig.world))).toBe(BODY_TOP);
  expect(aligned(rowYs(rig.world))).toBe(true);
}, 120_000);

test("the breadcrumb returns to the albums with the opened album highlighted; the Back gel does the same", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Albums");
  tap(rig, 100, BODY_TOP + 2 * ROW + 10); // the third album
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  const crumb = pathTo(rig.world, "auxiliary", "›").at(-2)!.rect!;
  tap(rig, 200, crumb[1] + crumb[3] / 2); // anywhere on the strip
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
  const highlight = flat(rig.world.tree("auxiliary")).find((n) => n.type === "view" && n.bgColor >>> 0 === SELECTED_ROW)!.rect!;
  expect(highlight[1]).toBe(BODY_TOP + 2 * ROW); // the tapped album is highlighted where it was
  tap(rig, 100, BODY_TOP + 2 * ROW + 10);
  const [x, y, w, h] = pathsTo(rig.world, "auxiliary", "Albums").at(-1)!.at(-2)!.rect!; // the footer's Back gel, not the tab
  tap(rig, x + w / 2, y + h / 2);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
}, 120_000);

test("the LCD tap reveals the playing song and scrolls it into view", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 10); // Aerodynamic plays
  drag(rig, 100, 200, -8, 10);
  frames(rig, 150);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  tapText(rig, "iPoDS");
  frames(rig, 40);
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
  expect(screenText(rig.world, "auxiliary")).toContain("♪");
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
  expect(aligned(rowYs(rig.world))).toBe(true);
}, 120_000);

test("over the empty panel only the Scan again gel does anything", async () => {
  const rig = await bootSwapped([]);
  expect(screenText(rig.world, "auxiliary")).toContain("No music found");
  drag(rig, 100, 150, -8, 6);
  frames(rig, 10);
  tap(rig, 100, 120);
  expect(rig.host.log).toEqual(["scan()"]);
  tapText(rig, "Scan again");
  expect(rig.host.log).toEqual(["scan()", "scan()"]);
}, 120_000);
```

Add `pathsTo` to the `./support/app-world.ts` import: the footer's "Albums" gel is the last match in tree order, after the tab.

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/touch.test.ts`
Expected: the six new tests FAIL.

- [ ] **Step 3: The parts' recognizers**

`app/theme/parts/toolbar.tsx`: import `createGesture` from `@pocketjs/framework/gesture`.

```tsx
export function LcdStatus(props: { title: string; line: string; layout?: Layout; onPress?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  // A tap target only when asked for (the narrow Explorer: reveal the playing song); the top screen has no touch.
  let node: unknown = null;
  if (props.onPress) createGesture({ surface: "auxiliary", region: { node: () => node as never }, onTap: () => props.onPress?.() });
  return (
    <View class={t().lcdStatus(layout())} ref={(n: unknown) => (node = n)}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX[layout()]} />
    </View>
  );
}

/** One tab gel; with `onSelect` it owns a tap recognizer on the bottom screen. */
function TabGel(props: { tab: Tab; active: boolean; layout: Layout; onSelect?: (tab: Tab) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  let node: unknown = null;
  if (props.onSelect) createGesture({ surface: "auxiliary", region: { node: () => node as never }, onTap: () => props.onSelect?.(props.tab) });
  return (
    <Gel classes={t().tab(props.active, props.layout)} ref={(n: unknown) => (node = n)}>
      <GelLabel text={props.tab} class={t().tabText(props.active)} shadow={props.active ? t().tabTextShadow : undefined} />
    </Gel>
  );
}
```

`SegmentedTabs` gains `onSelect?: (tab: Tab) => void` and renders `<TabGel tab={tab} active={tab === props.active} layout={layout()} onSelect={props.onSelect} theme={props.theme} />` in place of the inline `Gel`. `Toolbar` gains `onSelect?` and `onPress?` and passes `onPress` to `LcdStatus`, `onSelect` to `SegmentedTabs`.

`app/theme/parts/strips.tsx`: import `createGesture`.

```tsx
/** One footer gel; with `onPress` it owns a tap recognizer on the bottom screen. */
function FooterGel(props: { item: TouchLegendItem; onPress?: (action: TouchAction) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  let node: unknown = null;
  if (props.onPress) createGesture({ surface: "auxiliary", region: { node: () => node as never }, onTap: () => props.onPress?.(props.item.action) });
  return (
    <Gel classes={t().footerGel} ref={(n: unknown) => (node = n)}>
      <GelLabel text={props.item.label} class={t().footerGelText} />
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

`Breadcrumb` gains `onBack?: () => void`; the whole strip is the target (a 20 px text alone is too small a target; the strip reads as one "up" control):

```tsx
export function Breadcrumb(props: { root: string; leaf: string; detail: string; onBack?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  let node: unknown = null;
  if (props.onBack) createGesture({ surface: "auxiliary", region: { node: () => node as never }, onTap: () => props.onBack?.() });
  return (
    <>
      <View class={t().crumb} ref={(n: unknown) => (node = n)}>
        …unchanged children…
      </View>
      <View class={t().crumbRule} />
    </>
  );
}
```

- [ ] **Step 4: Wire the Explorer**

In `app/explorer/explorer.tsx` add, next to the shoulder handling, a reveal that both Y (wide) and the LCD (narrow) use:

```ts
  /** Jump to the playing song: Songs tab, focus on it; narrow also tweens the window to centre it. */
  const reveal = () => {
    const lib = library();
    const id = playingId();
    if (!lib || id < 0) return;
    dispatch({ type: "reveal", id, library: lib });
    if (scroller) scroller.scrollTo(centredOffset(focusOf(state()), page(), ROW_PX, maxOffset()));
  };
```

The wide shoulder branch calls `reveal()` instead of its inline dispatch. (`reveal` reads `state()` after the dispatch: the view-change effect from Task 3 has already jumped to the Songs view's stored row by then, and this tween overrides it.)

The footer actions:

```ts
  const onFooter = (action: TouchAction) => {
    if (action === "search") props.openSearch();
    else if (action === "back") dispatch({ type: "back" });
    else props.session.rescan();
  };
```

JSX: `<Toolbar … layout={props.layout} onSelect={wide ? undefined : (tab) => dispatch({ type: "setTab", tab })} onPress={wide ? undefined : reveal} />`; `<Breadcrumb … onBack={wide ? undefined : () => dispatch({ type: "back" })} />`; `<FooterGels items={gels()} onPress={onFooter} />`.

- [ ] **Step 5: Record the breadcrumb decision in the spec**

In the spec's §5.5 change `**Breadcrumb root** taps go back` to `**Breadcrumb** taps anywhere on the strip go back (a 20 px label alone is too small a target)`, and in §8 change `the crumb root` to `the crumb strip`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/touch.test.ts && bun run test`
Expected: check clean; touch 13 pass; 227 pass.

- [ ] **Step 7: Commit**

```bash
git add app/theme/parts/toolbar.tsx app/theme/parts/strips.tsx app/explorer/explorer.tsx tests/touch.test.ts docs/superpowers/specs/2026-10-10-screen-swap-design.md
git commit -m "feat(swap): tabs, footer gels, the breadcrumb and the LCD answer taps"
```

---

### Task 6: Perf scenarios and results

**Files:**
- Modify: `scripts/perf.ts` (`Scenario.touch`, four scenarios, the touch tape env)
- Modify: `tests/perf.test.ts:11`
- Modify: `docs/perf.md` (a Screen Swap section)

**Interfaces:**
- Consumes: hold SELECT (Plan 9), the touch Explorer (Tasks 3–5), the host's `POCKETJS_CAPTURE_TOUCH` tape (`frame:id,x,y@frame:-`, x ≤ 319, y ≤ 239).
- Produces: scenarios `swapped-idle`, `touch-drag`, `touch-fling`, `swap`.

- [ ] **Step 1: Extend the scenario test**

In `tests/perf.test.ts` the names assertion becomes:

```ts
  expect(SCENARIOS.map((s) => s.name)).toEqual(["idle", "scroll", "now-playing", "dj", "swapped-idle", "touch-drag", "touch-fling", "swap", "scan-first", "scan-cached"]);
```

Add:

```ts
test("the touch scenarios carry a touch tape inside the bottom screen, and the swap lands inside the capture window", () => {
  for (const name of ["touch-drag", "touch-fling"]) {
    const tape = scenario(name).touch!;
    for (const entry of tape.split("@")) {
      const [frame, payload] = entry.split(":");
      expect(Number(frame)).toBeGreaterThan(2525); // after the swap hold (2460–2525)
      if (payload === "-") continue;
      const [, x, y] = payload!.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(319);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(239);
    }
  }
  expect(scenario("touch-fling").touch!.endsWith(":-")).toBe(true);
  expect(scenario("swap").tape).toBe("0:0x0,2950:0x1,3016:0x0"); // the hold fires at 3009, inside 3000–3059
  expect(scenario("swapped-idle").touch).toBeUndefined();
});
```

Run: `bun test --conditions=browser tests/perf.test.ts` → FAIL.

- [ ] **Step 2: The scenarios**

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
// Presses wait until 40 s, well after the first scan (about 6 s in Azahar), so frame scenarios
// measure the settled app. The capture window is frames 3000–3059.
export const SCENARIOS: readonly Scenario[] = [
  { name: "idle", tape: "0:0x0", capture: 3000, kind: "frame" },
  { name: "scroll", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2700:0x${DOWN.toString(16)}`, capture: 3000, kind: "frame" },
  { name: "now-playing", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0`, capture: 3000, kind: "frame" },
  { name: "dj", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2460:0x${SELECT.toString(16)},2466:0x0`, capture: 3000, kind: "frame" },
  // Swapped: the wide deck idle on top, the narrow list below.
  { name: "swapped-idle", tape: `0:0x0,${holdSelect(2460)}`, capture: 3000, kind: "frame" },
  // A slow finger-follow drag (2 px per frame) that is still down through the window: sub-row shifts
  // every frame, a row boundary every ~10.
  { name: "touch-drag", tape: `0:0x0,${holdSelect(2460)}`, touch: dragTape(2960, 160, 236, -2, 110), capture: 3000, kind: "frame" },
  // The fastest flick the cap allows (83 px per frame ≈ 5000 px/s), lifted 4 frames before the window:
  // the fling crosses up to 4 rows per frame at the start of the window and decays through it.
  { name: "touch-fling", tape: `0:0x0,${holdSelect(2460)}`, touch: dragTape(2993, 160, 230, -83, 3), capture: 3000, kind: "frame" },
  // The swap itself: the hold fires at 3009, so the remount spike is inside the window.
  { name: "swap", tape: `0:0x0,${holdSelect(2950)}`, capture: 3000, kind: "frame" },
  { name: "scan-first", tape: "0:0x0", capture: 3600, kind: "scan" },
  { name: "scan-cached", tape: "0:0x0", capture: 3600, kind: "scan", keepCard: true },
];
```

In `build()` the env gains `POCKETJS_CAPTURE_TOUCH: scenario.touch ?? ""`.

Run: `bun test --conditions=browser tests/perf.test.ts` → PASS.

- [ ] **Step 3: Run the scenarios (the orchestrator, on the machine with Azahar and Docker)**

One scenario per invocation (see the harness note in `docs/perf.md`):

```bash
bun run perf swapped-idle --model both --check
bun run perf touch-drag --model both --check
bun run perf touch-fling --model both --check
bun run perf swap --model both --check
bun run perf scroll --model both --check   # the control: unchanged by this branch
```

Expected: every row within budget (`--check` exits non-zero otherwise). If `touch-fling` on Old exceeds 30 ms, lower `FLING_MAX_PX_PER_S` in `app/controls.ts` (4000, then 3000), update `tests/scroll.test.ts`'s expectation and rerun. If `swap` on Old exceeds 30 ms, note it in the doc as a one-frame user-initiated spike and raise it as a risk (spec §11), do not hide it.

- [ ] **Step 4: Record the rows**

Append to `docs/perf.md`:

```markdown
## Screen Swap (Plan 10)

The Screen Swap branch (`feature/screen-switch-mode`, `docs/superpowers/plans/2026-10-10-screen-swap-10-touch.md`): with the screens swapped the Explorer is a 320 px touch list on the bottom screen over the framework's kinetic scroller (a settled whole-row `top`, a per-frame sub-row translate, a translating thumb), and the deck is 400 px wide on top with no recognizers. `swapped-idle` is the swapped app at rest; `touch-drag` a finger-follow drag at 2 px per frame through the window; `touch-fling` a flick at the 5000 px/s cap lifted 4 frames before the window; `swap` the hold's remount frame inside the window. `bun run perf <scenario> --model both --check`, one scenario per invocation:

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| swapped-idle | new | | | | | | |
| touch-drag | new | | | | | | |
| touch-fling | new | | | | | | |
| swap | new | | | | | | |
| scroll | new | | | | | | |
| swapped-idle | old | | | | | | |
| touch-drag | old | | | | | | |
| touch-fling | old | | | | | | |
| swap | old | | | | | | |
| scroll | old | | | | | | |

<two or three sentences: how `touch-fling` and `swap` on Old compare with the 30 ms budget and the Plan 8 `scroll` row of 25.6 ms; whether the cap was lowered; whether `scroll` moved.>
```

Fill every cell from the runs' output (the same columns the earlier sections use) and replace the angle-bracket note with the sentences. No empty cells and no placeholder may remain when this task is committed.

- [ ] **Step 5: Run the checks and commit**

Run: `bun run check && bun run test`
Expected: check clean; 228 pass.

```bash
git add scripts/perf.ts tests/perf.test.ts docs/perf.md
git commit -m "perf(swap): swapped-idle, touch-drag, touch-fling and swap scenarios, measured on both models"
```

(If `FLING_MAX_PX_PER_S` changed, add `app/controls.ts tests/scroll.test.ts` to the commit and say so in the body.)

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
Expected: check clean; 228 pass; the gallery renders.

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
2. A stylus drag follows the finger with no lag or jitter; lifting mid-row settles on a row.
3. A flick flings and decays; the fastest flick does not skip more than a few rows per frame visibly; the list stops hard at both ends (no bounce).
4. Tapping a song plays it at once and moves the highlight; a slow drag that starts on a row does not play it.
5. The thumb follows a stylus drag and lands on a row; a tap on the track pages up and down.
6. Tabs switch on a tap; L and R still switch them.
7. Search gel: the keyboard opens below, the list moves up with live results; START returns the swap; Clear clears.
8. Breadcrumb tap returns to the albums where they were; Back gel does the same.
9. The iPoDS LCD tap scrolls to the playing song.
10. SELECT tap in swapped mode: the record replaces the list; scratching works; the panel's gel returns to the list.
11. Swapped buttons: A pauses, left and right seek with the capsule following, X shuffles, Y cycles repeat.
12. L + R in swapped mode shows the frame time in the top LCD; scroll and flick the list on an Old 3DS and read it: no sustained frames over 30 ms.
