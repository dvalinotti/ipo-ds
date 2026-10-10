# Screen Swap Plan 9 — Layouts, Placement and Controls (ipo-ds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold SELECT swaps the screens: Now Playing moves to the 400 px top screen in a wide layout and the Explorer to the 320 px bottom screen in a narrow layout, with the buttons driving playback while swapped. No touch handling on the Explorer yet (that is Plan 10), so after this plan alone a swapped user cannot search or start a song from the bottom screen: the footer gels are drawn but inert and the idle panel's "Tap a song below" is written for Plan 10. The branch is not releasable between the two plans.

**Architecture:** A pure `placement()` function maps three flags (swapped, DJ on, keyboard open) to what each screen shows, and `app/app.tsx` renders both screens from it. `Explorer` and `NowPlaying` take a `layout` prop that is constant for a mount (they remount when they change sides), so each registers only the handlers its layout owns. Theme slots whose width depends on the screen become variant functions over the layout. A pure `BINDINGS` table is the README's source for the controls table, and a test keeps the two equal (the handlers themselves are registered by the screens, so `BINDINGS` documents the mapping rather than driving it).

**Tech Stack:** TypeScript, Solid (`solid-js`), PocketJS framework APIs (`@pocketjs/framework/*`), Bun tests on the PocketJS sim (`bootApp` / `bootGallery` from `tests/support/app-world.ts`).

**Spec:** `docs/superpowers/specs/2026-10-10-screen-swap-design.md` (§4, §5.1, §5.5 labels only, §6, §7, §9, §10). Read it before any task.

**Execution:** Opus (high effort) orchestrates; every task runs as one Sonnet implementer subagent plus one Sonnet reviewer subagent (`model: "sonnet"`), per `superpowers:subagent-driven-development`. The orchestrator runs each task's verification commands itself before starting the next task.

## Global Constraints

- Work on branch `feature/screen-switch-mode` in the worktree `~/orca/workspaces/ds-man/cornetfish`. Framework code goes in the fork (`runtime/`), never here; this plan changes no fork code and the `runtime` pin stays at `2c72e830`.
- The sim needs `runtime/hosts/web/pocketjs.wasm`. If a test says `sim: the wasm core is missing`, copy it from `~/orca/workspaces/ds-man/tang/runtime/hosts/web/pocketjs.wasm` (built at the pinned commit). It is ignored by Git.
- Import framework APIs from `@pocketjs/framework/*` and Solid primitives and control flow from `solid-js`.
- Theme slots are complete Tailwind-like class literals (the build compiles only literal class strings); variants are functions that choose between literals. Never build a class string by concatenation.
- Commits: Conventional Commits (`feat(swap): …`, `test(swap): …`, `docs(swap): …`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Keep build products, logs and captures out of Git.
- Do not discover tests or sources through `runtime/`: run `bun run test` (it targets `./tests`) or a single file with `bun test --conditions=browser tests/<file>`.
- Every task ends with `bun run check` and `bun run test` green. The baseline is 189 tests passing.
- Layout names mean screen width everywhere: `"wide"` is the 400 px top screen, `"narrow"` the 320 px bottom screen. The Explorer's layout today is wide; the deck's is narrow.
- Narrow Explorer numbers: LCD 92 px (text 80), tabs without the L / R hints and with 6 px tab padding, header left cell 162, row title cell 134 (margin 6), wide title 238, footer gels 18 px tall. Rows stay 21 px, the footer 20 px, the list body 168 px minus 21 per strip.
- Wide deck numbers: info LCD at left 118, 272 wide (text 256); idle panel 380 wide; seek capsule 380 wide with a 280 px track (256 with hours), inner widths 278 / 254; transport row 380 wide, gap 20. `seekTrackLeft` is unchanged.
- Seek: 5 s per tap, 2 s per repeat (every 80 ms after 300 ms), clamped to `[0, duration]`, nothing while idle or with a 0 duration. A held button previews through the deck's scrubber and sends **one** host seek on release, as the capsule drag does: a seek is a host command that forces a status re-read and can flush the decoder, so it never runs at the repeat rate.
- The wide Explorer is the measured `scroll` path (Old 3DS peak 25.6–28.6 ms against 30). Task 10 runs `bun run perf scroll --model both --check` and `bun run perf now-playing --model both --check` (one scenario per invocation) and blocks on a regression.
- Hold SELECT = 60 frames (`HOLD_FRAMES`). Any press of SELECT during which L or R was held does nothing, tap or hold.
- 3DS face buttons by position: A = `BTN.CIRCLE`, B = `BTN.CROSS`, X = `BTN.TRIANGLE`, Y = `BTN.SQUARE`.

## Review Focus

1. **A button still held when a screen mounts** (A or Y held through a swap; in Plan 10, the keyboard opening from the footer gel remounts the Explorer on top) must not fire in the fresh screen. Pinned in Task 8 (`a swap while A is held does not touch playback`); the helpers in `app/input.ts` start latched, the press handlers use `latched: true`, and the shoulder stepper is seeded as "everything held".
2. **SELECT with L or R at any point during the press** must neither toggle DJ Mode nor swap, including L pressed after SELECT went down. Pinned in Task 8 (`L with SELECT neither toggles nor swaps`).
3. **X over the empty-library panel while swapped** must rescan, not toggle shuffle. Pinned in Task 8 (`X over the empty panel rescans in swapped mode`).
4. **Seek at the ends** must clamp to 0 and to the duration, and do nothing with a 0 duration or nothing playing. Pinned in Task 2 (`seekTarget`) and Task 8 (`A and left do nothing with nothing playing`).
5. **The narrow toolbar must fit 320 px**: the tab group's right edge is at or left of 314. Pinned in Task 7 (the swap test measures the Albums tab) and Task 9 (the gallery's `swapped` state).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/placement.ts` (new) | Pure: which screen shows what. |
| `app/controls.ts` (new) | Pure: the bindings table, the seek steps, `seekTarget`, the README rows. |
| `app/input.ts` | Helpers start latched; `onTapOrHold` passes the held mask; `onRepeat` passes a repeat flag. |
| `app/theme/theme.ts`, `app/theme/aqua.ts` | `Layout`; width variants; the footer gel. |
| `app/theme/parts/toolbar.tsx`, `list.tsx`, `strips.tsx`, `panels.tsx`, `deck.tsx` | `layout` props; `FooterGels`; the deck's `touch` flag. |
| `app/explorer/model.ts` | `setTab`; `touchLegendOf`. |
| `app/explorer/explorer.tsx` | `layout` prop; `scrollRow`; narrow bindings (X shuffle, Y repeat). |
| `app/now-playing/now-playing.tsx` | `layout` prop; wide bindings (A, left / right); no recognizers when wide. |
| `app/app.tsx` | `swapped`; placement; two Switches; SELECT tap-or-hold. |
| `app/gallery/states.tsx`, `app/gallery/names.ts` | `swapped`, `swapped-album` states. |
| `README.md` | The two-column controls table and the swap paragraph. |
| `tests/placement.test.ts`, `tests/controls.test.ts`, `tests/swap.test.ts` (new) | Unit and headless tests. |
| `tests/theme.test.ts`, `tests/gels.test.ts`, `tests/explorer-model.test.ts`, `tests/gallery.test.ts` | Extended. |

---

### Task 1: Placement model

**Files:**
- Create: `app/placement.ts`
- Test: `tests/placement.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `placement(swapped: boolean, dj: boolean, searching: boolean): Placement` with `Placement = { top: "explorer" | "deck"; bottom: "explorer" | "deck" | "dj" | "keyboard" }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/placement.test.ts
import { expect, test } from "bun:test";
import { placement } from "../app/placement.ts";

test("the keyboard and DJ Mode always take the bottom screen; the keyboard pulls the Explorer up", () => {
  expect(placement(false, false, false)).toEqual({ top: "explorer", bottom: "deck" });
  expect(placement(false, true, false)).toEqual({ top: "explorer", bottom: "dj" });
  expect(placement(false, false, true)).toEqual({ top: "explorer", bottom: "keyboard" });
  expect(placement(false, true, true)).toEqual({ top: "explorer", bottom: "keyboard" });
  expect(placement(true, false, false)).toEqual({ top: "deck", bottom: "explorer" });
  expect(placement(true, true, false)).toEqual({ top: "deck", bottom: "dj" });
  expect(placement(true, false, true)).toEqual({ top: "explorer", bottom: "keyboard" });
  expect(placement(true, true, true)).toEqual({ top: "explorer", bottom: "keyboard" });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `bun test --conditions=browser tests/placement.test.ts`
Expected: FAIL, `Cannot find module "../app/placement.ts"`.

- [ ] **Step 3: Write the module**

```ts
// app/placement.ts
// Which screen shows what (spec §4.1). The keyboard and DJ Mode always take
// the bottom screen; the keyboard pulls the Explorer to the top so its live
// results stay visible; DJ Mode hides whatever the bottom screen was showing.
export type TopScreen = "explorer" | "deck";
export type BottomScreen = "explorer" | "deck" | "dj" | "keyboard";

export interface Placement {
  top: TopScreen;
  bottom: BottomScreen;
}

export function placement(swapped: boolean, dj: boolean, searching: boolean): Placement {
  if (searching) return { top: "explorer", bottom: "keyboard" };
  if (dj) return { top: swapped ? "deck" : "explorer", bottom: "dj" };
  return swapped ? { top: "deck", bottom: "explorer" } : { top: "explorer", bottom: "deck" };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test --conditions=browser tests/placement.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add app/placement.ts tests/placement.test.ts
git commit -m "feat(swap): placement: which screen shows what"
```

---

### Task 2: Controls table, seek steps and the README

**Files:**
- Create: `app/controls.ts`
- Modify: `README.md:17-38` (the Controls section)
- Test: `tests/controls.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BINDINGS: readonly Binding[]` (`Binding = { button: string; normal: string; swapped: string }`), `SEEK_TAP_MS = 5000`, `SEEK_REPEAT_MS = 2000`, `seekTarget(positionMs: number, durationMs: number, direction: -1 | 1, repeat: boolean): number | null`, `controlsTable(): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/controls.test.ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BINDINGS, controlsTable, SEEK_REPEAT_MS, SEEK_TAP_MS, seekTarget } from "../app/controls.ts";

const ROOT = new URL("..", import.meta.url).pathname;

test("the README's controls table is the bindings table, row for row", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const header = "| Button | Normal | Swapped |";
  const start = readme.indexOf(header);
  expect(start).toBeGreaterThan(0);
  const lines = readme.slice(start).split("\n");
  expect(lines[1]).toBe("|---|---|---|");
  const rows = lines.slice(2, lines.indexOf("", 2));
  expect(rows).toEqual(controlsTable());
  expect(BINDINGS.map((b) => b.button)).toEqual([
    "D-pad up / down", "Circle pad", "D-pad left / right", "A", "B", "X", "Y", "L / R", "Y + L / R", "ZL / ZR", "START", "SELECT", "L + R (hold)",
  ]);
});

test("a seek steps 5 s on the tap and 2 s on each repeat, clamped to the song", () => {
  expect([SEEK_TAP_MS, SEEK_REPEAT_MS]).toEqual([5000, 2000]);
  expect(seekTarget(60_000, 200_000, 1, false)).toBe(65_000);
  expect(seekTarget(60_000, 200_000, 1, true)).toBe(62_000);
  expect(seekTarget(60_000, 200_000, -1, false)).toBe(55_000);
  expect(seekTarget(2_000, 200_000, -1, false)).toBe(0);
  expect(seekTarget(198_500, 200_000, 1, false)).toBe(200_000);
  expect(seekTarget(10_000, 0, 1, false)).toBeNull();
  expect(seekTarget(10_000, Number.NaN, 1, false)).toBeNull();
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/controls.test.ts`
Expected: FAIL, `Cannot find module "../app/controls.ts"`.

- [ ] **Step 3: Write the module**

```ts
// app/controls.ts
// The button mapping in both modes (spec §6.1): the one table the README's
// controls table must equal (tests/controls.test.ts), and the seek steps the
// wide deck's left / right use. Handlers are registered by the screen that
// owns each button; this file is the statement, not the wiring.

export interface Binding {
  button: string;
  normal: string;
  swapped: string;
}

export const BINDINGS: readonly Binding[] = [
  { button: "D-pad up / down", normal: "Move", swapped: "—" },
  { button: "Circle pad", normal: "Move", swapped: "—" },
  { button: "D-pad left / right", normal: "Page", swapped: "Seek back / forward: 5 s, then 2 s while held" },
  { button: "A", normal: "Play the song, or open the artist or album", swapped: "Play / pause" },
  { button: "B", normal: "Back; clear the search", swapped: "Back; clear the search" },
  { button: "X", normal: "Search; hold to scan the card again", swapped: "Shuffle on / off; hold to scan the card again" },
  { button: "Y", normal: "Jump to the song that is playing", swapped: "Repeat off / all / one" },
  { button: "L / R", normal: "Switch tabs", swapped: "Switch tabs" },
  { button: "Y + L / R", normal: "Previous / next song", swapped: "Previous / next song" },
  { button: "ZL / ZR", normal: "Previous / next song", swapped: "Previous / next song" },
  { button: "START", normal: "Play / pause", swapped: "Play / pause" },
  { button: "SELECT", normal: "DJ Mode on / off; hold to swap the screens", swapped: "DJ Mode on / off; hold to swap the screens" },
  { button: "L + R (hold)", normal: "Diagnostics in the Now Playing LCD", swapped: "Diagnostics in the Now Playing LCD" },
];

/** A left / right tap seeks this far; each repeat while held (every 80 ms after 300 ms) this far. */
export const SEEK_TAP_MS = 5000;
export const SEEK_REPEAT_MS = 2000;

/** Where a left / right press seeks to, or null when there is nothing to seek (no duration). */
export function seekTarget(positionMs: number, durationMs: number, direction: -1 | 1, repeat: boolean): number | null {
  if (!(durationMs > 0)) return null;
  const step = repeat ? SEEK_REPEAT_MS : SEEK_TAP_MS;
  return Math.min(durationMs, Math.max(0, positionMs + direction * step));
}

/** The README's table rows, one per binding. */
export function controlsTable(): string[] {
  return BINDINGS.map((b) => `| ${b.button} | ${b.normal} | ${b.swapped} |`);
}
```

- [ ] **Step 4: Replace the README's Controls section**

Replace everything from `## Controls` up to (not including) `## Music` with:

```markdown
## Controls

Hold SELECT for a second to swap the screens: Now Playing moves to the top
screen, the library moves to the touch screen, and the buttons drive playback.
Hold SELECT again to swap back. The setting lasts until the app closes.

| Button | Normal | Swapped |
|---|---|---|
| D-pad up / down | Move | — |
| Circle pad | Move | — |
| D-pad left / right | Page | Seek back / forward: 5 s, then 2 s while held |
| A | Play the song, or open the artist or album | Play / pause |
| B | Back; clear the search | Back; clear the search |
| X | Search; hold to scan the card again | Shuffle on / off; hold to scan the card again |
| Y | Jump to the song that is playing | Repeat off / all / one |
| L / R | Switch tabs | Switch tabs |
| Y + L / R | Previous / next song | Previous / next song |
| ZL / ZR | Previous / next song | Previous / next song |
| START | Play / pause | Play / pause |
| SELECT | DJ Mode on / off; hold to swap the screens | DJ Mode on / off; hold to swap the screens |
| L + R (hold) | Diagnostics in the Now Playing LCD | Diagnostics in the Now Playing LCD |

The bottom screen is touch. In normal mode it is Now Playing: shuffle,
previous, play/pause, next, repeat, DJ Mode, and a drag-to-seek capsule. In DJ
Mode the record spins while the song plays; drag it clockwise to play forward
at your finger's speed, counter-clockwise to play backwards, and hold it still
for silence. Lifting your finger lets the song play on from there. Swapped, the
bottom screen is the library. DJ Mode takes the bottom screen in either mode, so
while it is open in swapped mode the library and its buttons (B, X, Y, L, R)
wait until you leave it.

```

The blank line after the table must stay: the test reads rows up to it. In the README's opening paragraph (line 3), change `The top screen browses your library` to `By default the top screen browses your library`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun test --conditions=browser tests/controls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/controls.ts tests/controls.test.ts README.md
git commit -m "feat(swap): the bindings table, seek steps and the two-column controls table"
```

---

### Task 3: Theme layout variants

**Files:**
- Modify: `app/theme/theme.ts` (the `Theme` interface, `Layout`)
- Modify: `app/theme/aqua.ts` (the variant literals, the footer gel)
- Modify: `tests/theme.test.ts:11-35`, `tests/gels.test.ts:43-44`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type Layout = "wide" | "narrow"` in `theme.ts`; `Theme.lcdStatus(layout)`, `Theme.tab(active, layout)`, `Theme.headerLeft(sorted, layout)`, `Theme.rowTitleCell(layout)`, `Theme.footerGel: GelClasses`, `Theme.infoLcd(layout)`, `Theme.idlePanel(layout)`, `Theme.seekCapsule(layout)`, `Theme.seekTrack(layout)`, `Theme.seekTrackWide(layout)`, `Theme.transportRow(layout)`.

- [ ] **Step 1: Extend the theme test and the gel sheet test**

In `tests/theme.test.ts`, add `Layout` to the type import from `../app/theme/theme.ts` and replace the `for (const flag of [true, false])` block and the three `gel(…)` lines after it with:

```ts
  for (const flag of [true, false]) {
    gel(AQUA.badge(flag));
    out.push(AQUA.tabText(flag), AQUA.badgeText(flag));
  }
  for (const layout of ["wide", "narrow"] as Layout[]) {
    for (const flag of [true, false]) {
      gel(AQUA.tab(flag, layout));
      out.push(AQUA.headerLeft(flag, layout));
    }
    out.push(
      AQUA.lcdStatus(layout), AQUA.rowTitleCell(layout), AQUA.infoLcd(layout), AQUA.idlePanel(layout),
      AQUA.seekCapsule(layout), AQUA.seekTrack(layout), AQUA.seekTrackWide(layout), AQUA.transportRow(layout),
    );
  }
  gel(AQUA.footerGel);
  gel(AQUA.scrollThumb);
  gel(AQUA.progressFill);
  gel(AQUA.seekKnob);
```

Add a test:

```ts
test("the narrow and wide variants carry their widths", () => {
  expect(AQUA.lcdStatus("narrow")).toContain("w-[92]");
  expect(AQUA.lcdStatus("wide")).toContain("w-[144]");
  expect(AQUA.headerLeft(true, "narrow")).toContain("w-[162]");
  expect(AQUA.rowTitleCell("narrow")).toContain("w-[134]");
  expect(AQUA.tab(true, "narrow").body).toContain("px-[6]");
  expect(AQUA.tab(true, "wide").body).toContain("px-[8]");
  expect(AQUA.infoLcd("wide")).toContain("w-[272]");
  expect(AQUA.idlePanel("wide")).toContain("w-[380]");
  expect(AQUA.seekCapsule("wide")).toContain("w-[380]");
  expect(AQUA.seekTrack("wide")).toContain("w-[280]");
  expect(AQUA.seekTrackWide("wide")).toContain("w-[256]");
  expect(AQUA.transportRow("wide")).toContain("w-[380]");
  expect(AQUA.transportRow("wide")).toContain("gap-[20]");
  expect(AQUA.transportRow("narrow")).toContain("w-[300]");
});
```

In `tests/gels.test.ts:43-44`, change `AQUA.tab(true)` to `AQUA.tab(true, "wide")` and `AQUA.tab(false)` to `AQUA.tab(false, "wide")`, and add after them the new gels so their gloss geometry is checked too:

```ts
  out.push({ name: "tab active narrow", gel: AQUA.tab(true, "narrow"), tone: "blue", outline: false, shadow: false, sizes: [[36, 18], [56, 18]] });
  out.push({ name: "tab narrow", gel: AQUA.tab(false, "narrow"), tone: "grey", outline: false, shadow: false, sizes: [[36, 18], [56, 18]] });
  out.push({ name: "footer gel", gel: AQUA.footerGel, tone: "grey", outline: true, shadow: false, sizes: [[40, 18], [80, 18]] });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/theme.test.ts tests/gels.test.ts`
Expected: FAIL (type errors or `is not a function`).

- [ ] **Step 3: Change the interface**

In `app/theme/theme.ts`, after `TAB_ORDER`, add:

```ts
/** Which screen a part is laid out for: wide is the 400 px top screen, narrow the 320 px bottom screen. */
export type Layout = "wide" | "narrow";
```

Change these members of `Theme` (keep their doc comments, add the layout):

```ts
  /** 144 px wide on the top screen, 92 px on the bottom screen. */
  lcdStatus(layout: Layout): string;
  /** Tab padding is 8 px wide, 6 px narrow (the narrow toolbar has no L / R hints and must fit 320 px). */
  tab(active: boolean, layout: Layout): GelClasses;
  /** First column: 242 wide on the top screen, 162 on the bottom (holds the sort marker when sorted). */
  headerLeft(sorted: boolean, layout: Layout): string;
  /** 214 wide beside the detail column on the top screen, 134 on the bottom. */
  rowTitleCell(layout: Layout): string;
  /** The narrow footer's touch buttons (one per action); their label uses `footerText`. */
  footerGel: GelClasses;
  /** 192 wide on the bottom screen, 272 on the top. */
  infoLcd(layout: Layout): string;
  /** 300 wide on the bottom screen, 380 on the top. */
  seekCapsule(layout: Layout): string;
  seekTrack(layout: Layout): string;
  seekTrackWide(layout: Layout): string;
  /** 300 wide with a 10 px gap on the bottom screen, 380 with 20 px on the top. */
  transportRow(layout: Layout): string;
  idlePanel(layout: Layout): string;
```

- [ ] **Step 4: Write the Aqua literals**

In `app/theme/aqua.ts`, add beside `TAB_BLUE` / `TAB_GREY`:

```ts
const TAB_BLUE_NARROW: GelClasses = {
  body: "relative h-[18] px-[6] items-center justify-center bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6]",
  gloss: TAB_BLUE.gloss,
};
const TAB_GREY_NARROW: GelClasses = {
  body: "relative h-[18] px-[6] items-center justify-center bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4]",
  gloss: TAB_GREY.gloss,
};
// The narrow footer's touch buttons: a grey gel 18 px tall inside the 20 px footer (the gel is the touch
// target, so it is as tall as the footer allows) with a 5 px gloss band under the label.
const FOOTER_GEL: GelClasses = {
  body: "relative h-[18] px-[8] rounded-[9] items-center justify-center bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "absolute left-[3] right-[3] top-[1] h-[5] rounded-[2] bg-gradient-to-b from-[#fdfdfd] via-[#ececec] to-[#d6d6d6]",
};
```

Replace the slots:

```ts
  lcdStatus: (layout) => layout === "wide"
    ? "w-[144] h-[30] shrink-0 ml-[4] px-[6] flex-col items-center justify-center overflow-hidden rounded-[6] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]"
    : "w-[92] h-[30] shrink-0 ml-[4] px-[6] flex-col items-center justify-center overflow-hidden rounded-[6] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  tab: (active, layout) => (layout === "wide" ? (active ? TAB_BLUE : TAB_GREY) : (active ? TAB_BLUE_NARROW : TAB_GREY_NARROW)),
  headerLeft: (sorted, layout) => layout === "wide"
    ? (sorted
      ? "w-[242] h-[15] flex-row items-center bg-gradient-to-b from-[#d9ebff] via-[#a9cdf6] to-[#8fbbef]"
      : "w-[242] h-[15] flex-row items-center")
    : (sorted
      ? "w-[162] h-[15] flex-row items-center bg-gradient-to-b from-[#d9ebff] via-[#a9cdf6] to-[#8fbbef]"
      : "w-[162] h-[15] flex-row items-center"),
  rowTitleCell: (layout) => layout === "wide"
    ? "w-[214] h-[21] mr-[6] flex-col justify-center overflow-hidden"
    : "w-[134] h-[21] mr-[6] flex-col justify-center overflow-hidden",
  footerGel: FOOTER_GEL,
  infoLcd: (layout) => layout === "narrow"
    ? "absolute left-[118] top-[10] w-[192] h-[100] flex-col items-center px-[8] pt-[6] overflow-hidden rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]"
    : "absolute left-[118] top-[10] w-[272] h-[100] flex-col items-center px-[8] pt-[6] overflow-hidden rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  seekCapsule: (layout) => layout === "narrow"
    ? "absolute left-[10] top-[120] w-[300] h-[30] flex-row items-center px-[8] gap-[8] rounded-[15] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]"
    : "absolute left-[10] top-[120] w-[380] h-[30] flex-row items-center px-[8] gap-[8] rounded-[15] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  seekTrack: (layout) => layout === "narrow"
    ? "w-[200] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]"
    : "w-[280] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
  seekTrackWide: (layout) => layout === "narrow"
    ? "w-[176] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]"
    : "w-[256] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
  transportRow: (layout) => layout === "narrow"
    ? "absolute left-[10] top-[160] w-[300] h-[72] flex-row items-center justify-center gap-[10]"
    : "absolute left-[10] top-[160] w-[380] h-[72] flex-row items-center justify-center gap-[20]",
  idlePanel: (layout) => layout === "narrow"
    ? "absolute left-[10] top-[10] w-[300] h-[100] flex-col items-center justify-center gap-[4] rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]"
    : "absolute left-[10] top-[10] w-[380] h-[100] flex-col items-center justify-center gap-[4] rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
```

- [ ] **Step 5: Fix the call sites to the wide / narrow defaults so the build type-checks**

The parts get real `layout` props in Tasks 4 and 6; here each call site passes today's layout so nothing moves:

- `app/theme/parts/toolbar.tsx:28` → `t().lcdStatus("wide")`; `:47` → `t().tab(tab === props.active, "wide")`.
- `app/theme/parts/list.tsx:20` → `t().headerLeft(props.sorted ?? true, "wide")`; `:65` → `t().rowTitleCell("wide")`.
- `app/theme/parts/panels.tsx:54` → `t().idlePanel("narrow")`.
- `app/theme/parts/deck.tsx:77` → `t().infoLcd("narrow")`; `:130` → `t().seekCapsule("narrow")`; `:132` → `props.hours ? t().seekTrackWide("narrow") : t().seekTrack("narrow")`; `:191` → `t().transportRow("narrow")`.
- `app/gallery/states.tsx:188` → `AQUA.seekTrack("narrow")`.

- [ ] **Step 6: Run the checks**

Run: `bun run check && bun run test`
Expected: check clean; 193 pass (189 + 1 placement + 2 controls + 1 theme).

- [ ] **Step 7: Commit**

```bash
git add app/theme/theme.ts app/theme/aqua.ts app/theme/parts app/gallery/states.tsx tests/theme.test.ts tests/gels.test.ts
git commit -m "feat(swap): theme width variants for the narrow Explorer and the wide deck"
```

---

### Task 4: Narrow Explorer parts and model

**Files:**
- Modify: `app/explorer/model.ts` (`ExplorerAction`, `reduceExplorer`, `legendOf`, new `touchLegendOf`)
- Modify: `app/theme/parts/strips.tsx` (`TouchLegendItem`, `FooterGels`)
- Modify: `app/theme/parts/toolbar.tsx` (`layout` on `LcdStatus`, `SegmentedTabs`, `Toolbar`)
- Modify: `app/theme/parts/list.tsx` (`layout` on `ColumnHeader`, `ListRow`)
- Test: `tests/explorer-model.test.ts`

**Interfaces:**
- Consumes: `Layout` (Task 3).
- Produces: `ExplorerAction` gains `{ type: "setTab"; tab: Tab }`; `touchLegendOf(state: ExplorerState, panel: ListPanel | null): TouchLegendItem[]`; `TouchLegendItem = { action: "search" | "back" | "rescan"; label: string }` and `FooterGels(props: { items: readonly TouchLegendItem[]; theme?: Theme })` in `strips.tsx`; `Toolbar`, `ColumnHeader`, `ListRow` take `layout?: Layout` (default `"wide"`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/explorer-model.test.ts` (add `touchLegendOf` to the import):

```ts
test("setTab jumps straight to a tab and keeps the state object when it is already there", () => {
  const state = initialExplorer();
  expect(run(state, { type: "setTab", tab: "Albums" }).tab).toBe("Albums");
  expect(run(state, { type: "setTab", tab: "Songs" })).toBe(state);
});

test("the touch footer offers Search and Back with the same labels as the badges, or Scan again over a panel", () => {
  let state = initialExplorer();
  expect(touchLegendOf(state, null)).toEqual([{ action: "search", label: "Search" }, { action: "back", label: "Back" }]);
  state = run(state, { type: "setQuery", query: "da" });
  expect(touchLegendOf(state, null)).toEqual([{ action: "search", label: "Edit search" }, { action: "back", label: "Clear" }]);
  state = run(initialExplorer(), { type: "setTab", tab: "Artists" }, { type: "open", row: { kind: "artist", key: "daft punk" } });
  expect(touchLegendOf(state, null).at(-1)).toEqual({ action: "back", label: "Artists" });
  state = run(initialExplorer(), { type: "setTab", tab: "Albums" }, { type: "open", row: { kind: "album", key: "discovery\u0000daft punk" } });
  expect(touchLegendOf(state, null).at(-1)).toEqual({ action: "back", label: "Albums" });
  for (const panel of ["empty", "readError"] as ListPanel[]) expect(touchLegendOf(initialExplorer(), panel)).toEqual([{ action: "rescan", label: "Scan again" }]);
  for (const panel of ["scanning", "unavailable"] as ListPanel[]) expect(touchLegendOf(initialExplorer(), panel)).toEqual([]);
});
```

(`"discovery\u0000daft punk"` is the fixture's Discovery album key, as `tests/explorer-model.test.ts` already uses.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/explorer-model.test.ts`
Expected: FAIL (`touchLegendOf` is not exported; `setTab` is not a case).

- [ ] **Step 3: Extend the model**

In `app/explorer/model.ts`:

```ts
import type { LegendItem, TouchLegendItem } from "../theme/parts/strips.tsx";
```

Add to `ExplorerAction`, after the `tab` member:

```ts
  /** A tab tap (narrow layout). */
  | { type: "setTab"; tab: Tab }
```

Add to `reduceExplorer`, after `case "tab"`:

```ts
    case "setTab":
      return action.tab === state.tab ? state : { ...state, tab: action.tab };
```

Extract the back label and add the touch legend after `legendOf`:

```ts
/** What B (or the Back gel) does here: up a drill-down, clear the search, or nothing to go back to. */
function backLabel(state: ExplorerState): string {
  return state.drill[state.tab] ? (state.tab === "Artists" ? "Artists" : "Albums") : state.query ? "Clear" : "Back";
}

/** The narrow footer's gels: Search and Back, or Scan again over the empty / read-error panel (spec §5.5). */
export function touchLegendOf(state: ExplorerState, panel: ListPanel | null): TouchLegendItem[] {
  if (panel === "unavailable" || panel === "scanning") return [];
  if (panel === "readError" || panel === "empty") return [{ action: "rescan", label: "Scan again" }];
  return [{ action: "search", label: state.query ? "Edit search" : "Search" }, { action: "back", label: backLabel(state) }];
}
```

and in `legendOf` replace the inline `const back = …` with `const back = backLabel(state);`.

- [ ] **Step 4: Add the footer gels to `strips.tsx`**

```ts
export type TouchAction = "search" | "back" | "rescan";

export interface TouchLegendItem {
  action: TouchAction;
  label: string;
}

/** The narrow (touch) footer: a gel per action. Plan 10 gives each a tap recognizer. */
export function FooterGels(props: { items: readonly TouchLegendItem[]; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().footerRule} />
      <View class={t().footer}>
        <For each={props.items}>
          {(item) => (
            <Gel classes={t().footerGel}>
              <GelLabel text={item.label} class={t().footerText} />
            </Gel>
          )}
        </For>
      </View>
    </>
  );
}
```

- [ ] **Step 5: Give the toolbar and list parts a layout**

`app/theme/parts/toolbar.tsx`: import `Layout`; replace `LCD_TEXT_PX` and the three components:

```ts
/** Text width inside the LCD (6 px padding each side of 144 / 92). */
const LCD_TEXT_PX: Record<Layout, number> = { wide: 132, narrow: 80 };

export function LcdStatus(props: { title: string; line: string; layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  return (
    <View class={t().lcdStatus(layout())}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX[layout()]} />
    </View>
  );
}

/** Narrow (the touch screen) drops the L / R hints: there is no room, and the tabs are tapped. */
export function SegmentedTabs(props: { active: Tab; layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  return (
    <View class={t().tabs}>
      <Show when={layout() === "wide"}>
        <Text class={t().hint}>L</Text>
      </Show>
      <View class={t().tabGroup}>
        <For each={TAB_ORDER}>
          {(tab, i) => (
            <>
              <Show when={i() > 0}>
                <View class={t().tabDivider} />
              </Show>
              <Gel classes={t().tab(tab === props.active, layout())}>
                <GelLabel text={tab} class={t().tabText(tab === props.active)} shadow={tab === props.active ? t().tabTextShadow : undefined} />
              </Gel>
            </>
          )}
        </For>
        <View class={t().tabFrame} />
      </View>
      <Show when={layout() === "wide"}>
        <Text class={t().hint}>R</Text>
      </Show>
    </View>
  );
}

export function Toolbar(props: { title: string; line: string; active: Tab; layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().toolbar}>
        <Lights theme={props.theme} />
        <LcdStatus title={props.title} line={props.line} layout={props.layout} theme={props.theme} />
        <SegmentedTabs active={props.active} layout={props.layout} theme={props.theme} />
      </View>
      <View class={t().toolbarRule} />
    </>
  );
}
```

`app/theme/parts/list.tsx`: import `Layout`; replace the two width constants and thread the prop:

```ts
/** Title cell widths (px): beside a detail column, and spanning the row beside a count. */
const TITLE_PX: Record<Layout, number> = { wide: 214, narrow: 134 };
const WIDE_TITLE_PX: Record<Layout, number> = { wide: 318, narrow: 238 };
```

`ColumnHeader` gains `layout?: Layout` and uses `t().headerLeft(props.sorted ?? true, props.layout ?? "wide")`. `ListRowProps` gains `layout?: Layout`; `ListRow` uses `t().rowTitleCell(props.layout ?? "wide")`, `width={TITLE_PX[props.layout ?? "wide"]}` and `width={WIDE_TITLE_PX[props.layout ?? "wide"]}`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/explorer-model.test.ts && bun run test`
Expected: check clean; 195 pass.

- [ ] **Step 7: Commit**

```bash
git add app/explorer/model.ts app/theme/parts/strips.tsx app/theme/parts/toolbar.tsx app/theme/parts/list.tsx tests/explorer-model.test.ts
git commit -m "feat(swap): narrow toolbar, header and rows; setTab and the touch footer's labels"
```

---

### Task 5: The Explorer's layout prop

**Files:**
- Modify: `app/explorer/explorer.tsx`
- Modify: `app/app.tsx:40` (pass `layout="wide"`)

**Interfaces:**
- Consumes: `Layout`, `touchLegendOf`, `FooterGels`, the parts' `layout` props (Tasks 3, 4).
- Produces: `Explorer(props: { layout: Layout; session; store; searching; openSearch })`; `ExplorerStore.scrollRow: Map<string, number>` (first visible row per `viewKey`, written as `top` changes).

No new test file: the wide layout is pinned by the existing sim tests, the narrow layout by Task 8's `tests/swap.test.ts`, which cannot mount it before Task 7's shell exists.

- [ ] **Step 1: Add the store's scroll memory**

In `app/explorer/explorer.tsx`:

```ts
export interface ExplorerStore {
  state: Accessor<ExplorerState>;
  dispatch(action: ExplorerAction): void;
  /** The list's first visible row per view (viewKey), written as an Explorer scrolls and read when one mounts, so
   * a swap or a keyboard round trip lands where the list was. Not reactive: nothing renders from it. */
  scrollRow: Map<string, number>;
}

export function createExplorerStore(): ExplorerStore {
  const [state, setState] = createSignal(initialExplorer());
  return { state, dispatch: (action) => setState((current) => reduceExplorer(current, action)), scrollRow: new Map() };
}
```

- [ ] **Step 2: Take the layout and split the bindings**

Change the signature and the input section:

```ts
export function Explorer(props: { layout: Layout; session: Session; store: ExplorerStore; searching: () => boolean; openSearch: () => void }) {
  // The layout is constant for a mount (the shell remounts the Explorer when it changes sides), so the
  // handlers below are registered once for the layout that owns them: the d-pad, the circle pad and A
  // belong to the wide (top-screen) list; narrow (the touch screen) leaves them to the deck.
  const wide = props.layout === "wide";
```

Imports: add `createComputed` to the `solid-js` import, `Layout` from `../theme/theme.ts`, `touchLegendOf` and `viewKey` (already) from `./model.ts`, `FooterGels` and `TouchLegendItem` from `../theme/parts/strips.tsx`.

Replace the input block from `const move = …` through the `onButtonPress(BTN.CROSS…)` line with:

```ts
  const move = (delta: number) => dispatch({ type: "move", delta, count: rows().length });
  if (wide) {
    onRepeat(BTN.UP, () => move(-1), listActive);
    onRepeat(BTN.DOWN, () => move(1), listActive);
    onRepeat(BTN.LEFT, () => move(-page()), listActive);
    onRepeat(BTN.RIGHT, () => move(page()), listActive);
    onAnalogRows(move, listActive);
  }
  // latched: a button already down when this Explorer mounts (a swap, the keyboard closing) is not a press.
  onButtonPress(BTN.CROSS, () => dispatch({ type: "back" }), { active: listActive, latched: true });
```

Seed the shoulder stepper as "everything held, chorded" so a Y or L held through a mount is not a press or a reveal on its release: replace `let shoulders = SHOULDERS_UP;` with

```ts
  // Everything held and chorded at mount: a button already down (Y through a swap) is ignored until released.
  let shoulders = { mask: ~0, chorded: true };
```

In the shoulder `onFrame`, the `else` branch (the reveal) becomes:

```ts
      else if (wide) {
        const lib = library();
        const id = playingId();
        if (lib && id >= 0) dispatch({ type: "reveal", id, library: lib });
      } else props.session.dispatch({ type: "cycleRepeat" }); // narrow: Y is repeat (spec §6.2)
```

Wrap the A handler: `if (wide) onButtonPress(BTN.CIRCLE, () => { … }, { active: listActive, latched: true });` (the body is unchanged).

Replace `tapX`:

```ts
  // X: wide, a tap searches; narrow, it toggles shuffle (the touch footer searches). Over the empty-library
  // panel a tap scans again in both layouts; the read-error panel asks for a hold. A 1 s hold always rescans.
  const tapX = () => {
    const panel = kind();
    if (panel === null) {
      if (wide) props.openSearch();
      else props.session.dispatch({ type: "toggleShuffle" });
    } else if (panel === "empty") props.session.rescan();
  };
```

- [ ] **Step 3: Seed and save the scroll position**

Replace `let previousTop = 0;` with:

```ts
  let previousTop = props.store.scrollRow.get(viewKey(currentView(untrack(state)))) ?? 0;
```

and after the `top` settled value add a computation that records it for the current view whenever either changes. It is written as it changes, not on cleanup: when the screens swap, the new Explorer on one surface can mount before the old one on the other surface is disposed, so a cleanup-time write would come too late for the seed. (A `Map.set` per row change is nothing; an empty list is skipped so a rescan's empty frame does not overwrite a real row.)

```ts
  createComputed(() => {
    if (rows().length > 0) props.store.scrollRow.set(viewKey(view()), top());
  });
```

Add `createComputed` to the `solid-js` import; `onCleanup` is not needed.

- [ ] **Step 4: Thread the layout into the parts and pick the footer**

- `<Toolbar … layout={props.layout} />`
- `<ColumnHeader … layout={props.layout} />`
- both `<ListRow … layout={props.layout} />` (the slot rows and the selection overlay)
- Only the footer model the layout renders is created (each `settled` re-runs on every state write, so an unused one would cost a press). Replace the `legend` settled with:

```ts
  const sameItems = <T extends { label: string }>(key: (item: T) => string) => (a: T[], b: T[]) => a.length === b.length && a.every((item, i) => key(item) === key(b[i]!) && item.label === b[i]!.label);
  const legend = wide ? settled<LegendItem[]>(() => legendOf(state(), kind()), sameItems((item) => item.key)) : null;
  const gels = wide ? null : settled<TouchLegendItem[]>(() => touchLegendOf(state(), kind()), sameItems((item) => item.action));
```

- Replace `<FooterLegend items={legend()} />` with `{wide ? <FooterLegend items={legend!()} /> : <FooterGels items={gels!()} />}` (a plain conditional: `wide` is a constant for the mount).

- [ ] **Step 5: Pass the layout from the shell**

In `app/app.tsx`, `<Explorer layout="wide" session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />`.

- [ ] **Step 6: Run the checks**

Run: `bun run check && bun run test`
Expected: check clean; 195 pass (nothing moved in wide layout).

- [ ] **Step 7: Commit**

```bash
git add app/explorer/explorer.tsx app/app.tsx
git commit -m "feat(swap): the Explorer takes a layout; narrow binds X to shuffle and Y to repeat"
```

---

### Task 6: The wide deck

**Files:**
- Modify: `app/theme/parts/deck.tsx` (`layout` on `InfoLcd`, `SeekCapsule`, `TransportRow`; `touch` on `TransportButton`; `seekTrackPx`)
- Modify: `app/theme/parts/panels.tsx` (`IdlePanel` layout)
- Modify: `app/input.ts` (`onRepeat` repeat flag; both helpers start latched)
- Modify: `app/now-playing/now-playing.tsx`
- Modify: `app/app.tsx` (pass `layout="narrow"`)

**Interfaces:**
- Consumes: `Layout`, theme variants (Task 3); `seekTarget` (Task 2).
- Produces: `NowPlaying(props: { layout: Layout; session: Session; onDj?: () => void })`; `seekTrackPx(hours: boolean, layout: Layout): number`; `onRepeat(button, fire: (repeat: boolean) => void, active, release?: () => void)`; `TransportButton` / `TransportRow` take `touch?: boolean` (default true); `InfoLcd`, `SeekCapsule`, `TransportRow`, `IdlePanel` take `layout?: Layout` (default `"narrow"`).

- [ ] **Step 1: The input helpers**

In `app/input.ts`:

```ts
/**
 * Fire on press, then repeat while held (300 ms delay, 80 ms rate); `repeat` is false on the press, and
 * `release` runs once when a press that fired ends. Latched: see stepLatch. Starts latched, so a button
 * already down when the screen mounts (a swap, the keyboard closing) is ignored until it is released.
 */
export function onRepeat(button: number, fire: (repeat: boolean) => void, active: () => boolean, release?: () => void): void {
  let held = -1;
  let ignoring = true;
  onFrame((buttons) => {
    const latch = stepLatch(ignoring, (buttons & button) !== 0, active());
    ignoring = latch.ignoring;
    if (!latch.down) {
      if (held >= 0) release?.();
      held = -1;
      return;
    }
    held++;
    if (repeatFires(held)) fire(held > 0);
  });
}
```

and in `onTapOrHold` change `let ignoring = false;` to `let ignoring = true;` with the same sentence in its doc comment. (Task 7 extends its callbacks.)

- [ ] **Step 2: The deck parts**

In `app/theme/parts/deck.tsx`, import `Layout`; replace the constants after `SeekCapsule`'s doc block:

```ts
/** Inner width of the seek track (1 px border): 200 / 280 wide, or 176 / 256 with h:mm:ss times. */
const SEEK_TRACK_PX: Record<Layout, number> = { narrow: 198, wide: 278 };
const SEEK_TRACK_WIDE_PX: Record<Layout, number> = { narrow: 174, wide: 254 };
export function seekTrackPx(hours: boolean, layout: Layout): number {
  return hours ? SEEK_TRACK_WIDE_PX[layout] : SEEK_TRACK_PX[layout];
}
/** Screen x of the track's inner left edge: capsule 10 + padding 8 + time cell + gap 8 + border 1. */
export function seekTrackLeft(hours: boolean): number {
  return 10 + 8 + (hours ? 46 : 34) + 8 + 1;
}
/** Text width inside the info LCD (8 px padding each side of 192 / 272). */
const INFO_TEXT_PX: Record<Layout, number> = { narrow: 176, wide: 256 };
```

`InfoLcd` gains `layout?: Layout`; `const layout = () => props.layout ?? "narrow";` and uses `t().infoLcd(layout())` and `width={INFO_TEXT_PX[layout()]}` on all four marquees.

`SeekCapsule` gains `layout?: Layout`; `const layout = () => props.layout ?? "narrow";`, `const x = () => trackOffset(props.fraction, seekTrackPx(props.hours ?? false, layout()));`, `t().seekCapsule(layout())`, `props.hours ? t().seekTrackWide(layout()) : t().seekTrack(layout())`.

`TransportButton` gains `touch?: boolean`:

```ts
  // A View's onPress answers the focused node's A press; a touch on the bottom screen needs its own
  // recognizer over this button. On the top screen (touch false) there is no digitizer: no recognizer.
  let node: unknown = null;
  if (props.touch ?? true) {
    createGesture({ /* unchanged */ });
  }
```

`TransportRow` gains `layout?: Layout` and `touch?: boolean`; uses `t().transportRow(props.layout ?? "narrow")` and passes `touch={props.touch}` to all six buttons.

In `app/theme/parts/panels.tsx`, `IdlePanel` gains `layout?: Layout`:

```tsx
export function IdlePanel(props: { layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "narrow";
  return (
    <View class={t().idlePanel(layout())}>
      <Text class={t().panelTitle}>Nothing playing</Text>
      <Show when={layout() === "narrow"} fallback={<Text class={t().panelText}>Tap a song below to play it</Text>}>
        <Line line={["Pick a song above and press", "A", ""]} theme={props.theme} />
      </Show>
    </View>
  );
}
```

- [ ] **Step 3: Now Playing's layout**

In `app/now-playing/now-playing.tsx`:

- Header comment: add `On the top screen (layout "wide", swapped) the deck is 400 px wide, has no touch, and owns A (play / pause) and left / right (seek).`
- Imports: `BTN` (already), `onButtonPress` from `@pocketjs/framework/lifecycle`, `onRepeat` from `../input.ts`, `seekTarget` from `../controls.ts`, `seekTrackPx` instead of the two constants, `Layout` from `../theme/theme.ts`.
- Signature: `export function NowPlaying(props: { layout: Layout; session: Session; onDj?: () => void })` and `const wide = props.layout === "wide";`.
- `const trackPx = () => seekTrackPx(hours(), props.layout);`
- Wrap the seek `createGesture({ … })` in `if (!wide) { … }` with the comment `// The top screen has no digitizer: no drag recognizer there.`
- After the gesture block:

```ts
  // Wide (top screen, swapped): A and left / right drive playback (spec §6.2). This screen is unmounted
  // while the keyboard is open, so the handlers need no search gate; latched keeps a button that was
  // already down at mount (A through a swap) from firing.
  if (wide) {
    onButtonPress(BTN.CIRCLE, () => { if (!idle()) dispatch({ type: "toggle" }); }, { latched: true });
    // Left / right seek through the same scrubber as the capsule drag: the press previews ±5 s, each repeat
    // ±2 s more from the preview, and the release sends the one seek. A seek is a host command that forces
    // a status re-read and can flush the decoder, so a held button must not send one at the repeat rate.
    const seekBy = (direction: -1 | 1, repeat: boolean) => {
      if (idle() || duration() <= 0) return;
      const from = repeat && scrubber.active() ? scrubber.preview() * 1000 : status().positionMs;
      const target = seekTarget(from, duration(), direction, repeat);
      if (target === null) return;
      if (scrubber.active()) scrubber.move(target / duration(), duration() / 1000);
      else scrubber.begin(target / duration(), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    };
    const commitSeek = () => {
      if (!scrubber.active()) return;
      scrubber.commit();
      setPreview(null);
    };
    onRepeat(BTN.LEFT, (repeat) => seekBy(-1, repeat), () => true, commitSeek);
    onRepeat(BTN.RIGHT, (repeat) => seekBy(1, repeat), () => true, commitSeek);
  }
```

- JSX: `<IdlePanel layout={props.layout} />`, `<InfoLcd … layout={props.layout} />`, `<SeekCapsule … layout={props.layout} />`, `<TransportRow … layout={props.layout} touch={!wide} />`.

- [ ] **Step 4: Pass the layout from the shell**

In `app/app.tsx`, the Switch's fallback becomes `<NowPlaying layout="narrow" session={session} onDj={() => setMode("dj")} />`.

- [ ] **Step 5: Run the checks**

Run: `bun run check && bun run test`
Expected: check clean; 195 pass (the narrow deck is unchanged; the seek test and the transport tap tests still hit their coordinates).

- [ ] **Step 6: Commit**

```bash
git add app/theme/parts/deck.tsx app/theme/parts/panels.tsx app/input.ts app/now-playing/now-playing.tsx app/app.tsx
git commit -m "feat(swap): the wide deck: 400 px layout, no recognizers, A and left / right drive playback"
```

---

### Task 7: The shell: swapped, placement and hold SELECT

**Files:**
- Modify: `app/app.tsx`
- Modify: `app/input.ts` (`onTapOrHold` callbacks receive the held mask)
- Test: `tests/swap.test.ts` (new; the first tests)

**Interfaces:**
- Consumes: `placement` (Task 1), `Explorer`/`NowPlaying` layouts (Tasks 5, 6), `onTapOrHold`.
- Produces: `onTapOrHold(button, tap: (held: number) => void, hold: (held: number) => void, active)` where `held` is the OR of every button mask seen while `button` was down; the shell's `swapped` signal.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/swap.test.ts
// Screen Swap (spec §4, §6): hold SELECT swaps the screens; the Explorer goes narrow on the bottom,
// the deck wide on top, and the buttons drive playback.
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, pathsTo, pathTo, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

const A = BTN.CIRCLE, B = BTN.CROSS, X = BTN.TRIANGLE, Y = BTN.SQUARE, L = BTN.LTRIGGER;
const SELECTED_ROW = 0xffd77538;
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

/** Holds SELECT past the hold time (with `extra` held too): a swap, unless `extra` is a shoulder. */
function holdSelect(rig: Rig, extra = 0): void {
  frames(rig, 62, { buttons: BTN.SELECT | extra });
  frames(rig, 3);
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

/** The text of the focused (selected) list row on a surface. */
function selectedRow(world: BundleWorld, surface: Surface): string {
  const row = flat(world.tree(surface)).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row ? flat(row).map((node) => node.text).join("") : "";
}

const platterShown = (world: BundleWorld) => flat(world.tree("auxiliary")).some((node) => node.rect?.join(",") === "10,20,200,200");
const seeks = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("seek(")).map((entry) => Number(entry.slice(5, -1)));

test("holding SELECT swaps the screens: the wide deck on top, the narrow list below; holding again swaps back", async () => {
  const rig = await boot();
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
  holdSelect(rig);
  const top = screenText(rig.world, "primary");
  for (const part of ["Nothing playing", "Tap a song below"]) expect(top).toContain(part);
  const bottom = screenText(rig.world, "auxiliary");
  for (const part of ["iPoDS", "Song Name", "Artist", "Aerodynamic", "Search", "Back"]) expect(bottom).toContain(part);
  expect(bottom).not.toContain("Now Playing");
  // The narrow toolbar fits: the Albums tab's gel ends at or before x 314.
  const albums = pathTo(rig.world, "auxiliary", "Albums").at(-3)!.rect!;
  expect(albums[0] + albums[2]).toBeLessThanOrEqual(314);
  // Eight 21 px rows: the list body is still 168 px tall (the app's rows sit under the recycled list's
  // slots, so the body is found by its rect rather than by walking up from a title).
  expect(flat(rig.world.tree("auxiliary")).some((node) => node.rect?.join(",") === "0,51,320,168")).toBe(true);
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
  holdSelect(rig);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
}, 120_000);

test("a SELECT tap still toggles DJ Mode; L with SELECT neither toggles nor swaps, even when L comes later", async () => {
  const rig = await boot();
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(false);
  press(rig, BTN.SELECT | L);
  expect(platterShown(rig.world)).toBe(false);
  holdSelect(rig, L);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  frames(rig, 30, { buttons: BTN.SELECT });
  frames(rig, 35, { buttons: BTN.SELECT | L });
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(platterShown(rig.world)).toBe(false);
}, 120_000);

test("the list keeps its place and its focus across a swap", async () => {
  const rig = await boot();
  // Down 12 scrolls the window to row 5; up 4 leaves the focus on row 8, still inside it. A fresh Explorer
  // that forgot the window would show row 1 at the top (the least scrolling for focus 8), so the rows on
  // screen tell whether scrollRow carried the window across.
  for (let i = 0; i < 12; i++) press(rig, BTN.DOWN);
  for (let i = 0; i < 4; i++) press(rig, BTN.UP);
  const focused = selectedRow(rig.world, "primary");
  const shown = screenText(rig.world, "primary");
  expect(shown).not.toContain("Around the World"); // row 1 is above the window
  expect(shown).toContain("DARE"); // row 5 is its first row
  holdSelect(rig);
  expect(selectedRow(rig.world, "auxiliary")).toBe(focused);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Around the World");
  expect(screenText(rig.world, "auxiliary")).toContain("DARE");
  holdSelect(rig);
  expect(selectedRow(rig.world, "primary")).toBe(focused);
  expect(screenText(rig.world, "primary")).not.toContain("Around the World");
}, 120_000);
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/swap.test.ts`
Expected: the first and third FAIL (no swap happens); the second passes.

- [ ] **Step 3: `onTapOrHold` reports what was held**

In `app/input.ts`:

```ts
/**
 * A release before the hold time is a tap; holding fires `hold` once instead. Both receive `held`, the OR
 * of every button mask seen while the button was down (a chord anywhere in the press shows there).
 * Latched: see stepLatch; starts latched like onRepeat.
 */
export function onTapOrHold(button: number, tap: (held: number) => void, hold: (held: number) => void, active: () => boolean): void {
  let state = HOLD_UP;
  let ignoring = true;
  let held = 0;
  onFrame((buttons) => {
    const latch = stepLatch(ignoring, (buttons & button) !== 0, active());
    ignoring = latch.ignoring;
    if (!active()) {
      // A hold the keyboard interrupted ends without a tap.
      state = HOLD_UP;
      held = 0;
      return;
    }
    if (latch.down) held |= buttons;
    const step = stepHold(state, latch.down);
    state = step.state;
    if (step.event === "tap") tap(held);
    else if (step.event === "hold") hold(held);
    if (!latch.down) held = 0;
  });
}
```

(`held` is reset after the tap fires on the release frame, so the tap sees the whole press.)

- [ ] **Step 4: The shell**

Replace `app/app.tsx` with:

```tsx
// iPoDS — a walkman-style MP3 player. Normally the top screen is the Explorer
// and the bottom screen is Now Playing, DJ Mode (a SELECT tap, or the DJ gel,
// flips them) or the search keyboard while it is open. Holding SELECT swaps
// the screens: Now Playing goes to the top, the Explorer to the touch screen,
// and the buttons drive playback (app/placement.ts says what shows where).
import { createMemo, createSignal, Match, Switch } from "solid-js";
import { AuxiliarySurface, FocusScope, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { DjMode } from "./dj/dj-mode.tsx";
import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
import { onTapOrHold } from "./input.ts";
import { NowPlaying } from "./now-playing/now-playing.tsx";
import { placement } from "./placement.ts";
import { createSearch, SearchKeyboard } from "./search.tsx";
import { createSession } from "./session.ts";

export default function App() {
  const session = createSession();
  const store = createExplorerStore();
  const osk = createSearch(store);
  const notSearching = () => !osk.isOpen();
  const [mode, setMode] = createSignal<"deck" | "dj">("deck");
  const [swapped, setSwapped] = createSignal(false);
  const place = createMemo(() => placement(swapped(), mode() === "dj", osk.isOpen()));
  // Transport from either screen (the keyboard uses START to commit while open).
  onButtonPress(BTN.START, () => session.dispatch({ type: "toggle" }), { active: notSearching });
  onButtonPress(BTN.ZL, () => session.dispatch({ type: "prev" }), { active: notSearching });
  onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
  // A SELECT tap flips the bottom screen to DJ Mode and back; a 1 s hold swaps the screens. Neither
  // with L or R anywhere in the press (the host's devmenu chord is L+R+SELECT).
  const chorded = (held: number) => (held & (BTN.LTRIGGER | BTN.RTRIGGER)) !== 0;
  onTapOrHold(
    BTN.SELECT,
    (held) => { if (!chorded(held)) setMode((now) => (now === "dj" ? "deck" : "dj")); },
    (held) => { if (!chorded(held)) setSwapped((now) => !now); },
    notSearching,
  );
  const explorer = (layout: "wide" | "narrow") => (
    <Explorer layout={layout} session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
  );
  return (
    <>
      {/* The app moves its own focus; this empty scope keeps the framework's d-pad traversal
          from walking the whole tree on every press (the keyboard pushes its own scope). */}
      <FocusScope class="absolute left-[0] top-[0] w-[0] h-[0]" />
      {/* A wrapping View here too: the primary root now holds a reactive Switch, as the auxiliary always has. */}
      <View class="relative w-full h-full flex-col">
        <Switch>
          <Match when={place().top === "explorer"}>{explorer("wide")}</Match>
          <Match when={place().top === "deck"}>
            <NowPlaying layout="wide" session={session} />
          </Match>
        </Switch>
      </View>
      <AuxiliarySurface>
        {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Switch> renders once). */}
        <View class="relative w-full h-full flex-col">
          <Switch>
            <Match when={place().bottom === "keyboard"}>
              <SearchKeyboard osk={osk} />
            </Match>
            <Match when={place().bottom === "dj"}>
              <DjMode session={session} onDeck={() => setMode("deck")} />
            </Match>
            <Match when={place().bottom === "explorer"}>{explorer("narrow")}</Match>
            <Match when={place().bottom === "deck"}>
              <NowPlaying layout="narrow" session={session} onDj={() => setMode("dj")} />
            </Match>
          </Switch>
        </View>
      </AuxiliarySurface>
    </>
  );
}
```

`explorer(...)` is a plain function called inside each Match, so each call builds its own tree in that Match's scope. Solid's Switch memoises the index of the matched branch, so a Match whose condition stays true across a placement change does not re-render: opening the keyboard in normal mode leaves the top Explorer mounted, as before, and only the screens that change sides remount. The two screens' remount order is not defined, which is why `scrollRow` is written as the list scrolls (Task 5) and not on cleanup.

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/swap.test.ts && bun run test`
Expected: check clean; swap 3 pass; 198 pass in all. `tests/dj.test.ts` still passes: its one-frame SELECT presses are taps (DJ Mode now toggles on the release frame, inside the two idle frames every `press` adds).

- [ ] **Step 6: Commit**

```bash
git add app/app.tsx app/input.ts tests/swap.test.ts
git commit -m "feat(swap): hold SELECT swaps the screens; the shell renders both screens from placement"
```

---

### Task 8: Swapped-mode buttons and DJ Mode, pinned

**Files:**
- Test: `tests/swap.test.ts` (append)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new; these tests pin spec §6.1, §6.2 and §7.

- [ ] **Step 1: Append the tests**

```ts
test("swapped: A pauses and resumes, left and right seek by 5 s then 2 s, X shuffles, Y cycles repeat, up does not move focus", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN);
  press(rig, A); // Around the World, 2 of 20
  frames(rig, 3);
  holdSelect(rig);
  expect(screenText(rig.world, "primary")).toContain("2 of 20");
  press(rig, A);
  expect(rig.host.log.at(-1)).toBe("paused(true)");
  press(rig, A);
  expect(rig.host.log.at(-1)).toBe("paused(false)");
  frames(rig, 400); // about 6.7 s into the song
  const position = () => (JSON.parse(rig.host.ns.status()) as { positionMs: number }).positionMs; // the host replies in JSON
  const before = position();
  expect(before).toBeGreaterThan(5000);
  press(rig, BTN.LEFT); // a tap: one seek of 5 s, sent on the release
  expect(seeks(rig.host)).toHaveLength(1);
  expect(Math.abs(seeks(rig.host)[0]! - (before - 5000))).toBeLessThan(300);
  const beforeHold = position();
  frames(rig, 24, { buttons: BTN.RIGHT }); // press (+5 s), repeats at frames 18 and 23 (+2 s each): one seek of +9 s on release
  frames(rig, 2);
  expect(seeks(rig.host)).toHaveLength(2);
  expect(Math.abs(seeks(rig.host)[1]! - (beforeHold + 9000))).toBeLessThan(300);
  frames(rig, 60, { buttons: BTN.RIGHT }); // a long hold is still one seek
  frames(rig, 2);
  expect(seeks(rig.host)).toHaveLength(3);
  press(rig, X); // shuffle: the current song moves to the head of the order
  expect(screenText(rig.world, "primary")).toContain("1 of 20");
  press(rig, Y); // repeat all: no "1" flag yet
  expect(pathsTo(rig.world, "primary", "1")).toHaveLength(0);
  press(rig, Y); // repeat one: the LCD shows its "1"
  expect(pathsTo(rig.world, "primary", "1")).toHaveLength(1);
  const focused = selectedRow(rig.world, "auxiliary");
  press(rig, BTN.UP);
  press(rig, BTN.DOWN);
  expect(selectedRow(rig.world, "auxiliary")).toBe(focused);
}, 120_000);

test("swapped: A and left do nothing with nothing playing; B still backs out of a drill-down", async () => {
  const rig = await boot();
  holdSelect(rig);
  press(rig, A);
  press(rig, BTN.LEFT);
  expect(rig.host.log).toEqual(["scan()"]);
  holdSelect(rig); // back to normal: drill into an artist with the buttons
  press(rig, BTN.RTRIGGER);
  press(rig, A);
  expect(screenText(rig.world, "primary")).toContain("Artists›"); // the breadcrumb: root and › are separate texts, joined without a space
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("Artists›");
  press(rig, B);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Artists›");
}, 120_000);

test("a swap while A is held does not touch playback", async () => {
  const rig = await boot();
  frames(rig, 62, { buttons: BTN.SELECT | A }); // A plays Aerodynamic on frame 0; the swap lands at frame 60
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Aerodynamic");
  expect(rig.host.log.filter((entry) => entry.startsWith("paused("))).toEqual([]);
}, 120_000);

test("X over the empty panel rescans in swapped mode", async () => {
  const rig = await boot([]);
  frames(rig, 4);
  expect(screenText(rig.world, "primary")).toContain("No music found");
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("Scan again");
  press(rig, X);
  expect(rig.host.log.filter((entry) => entry === "scan()")).toHaveLength(2);
}, 120_000);

test("swapped: SELECT shows DJ Mode over the Explorer, the deck stays on top, and the panel's gel returns to the list", async () => {
  const rig = await boot();
  press(rig, A);
  frames(rig, 3);
  holdSelect(rig);
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "primary")).toContain("Aerodynamic");
  touch(rig, 265, 203); // the panel's gel back to the deck: here, back to the Explorer
  expect(platterShown(rig.world)).toBe(false);
  expect(screenText(rig.world, "auxiliary")).toContain("Song Name");
  // Swapping back while DJ Mode is on keeps the record below and moves the Explorer back up.
  press(rig, BTN.SELECT);
  holdSelect(rig);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
}, 120_000);
```


Also append an efficiency pin, with `recordOps` copied from `tests/app.test.ts` (it wraps the sim's `ui` ops and records their names):

```ts
test("swapped presses touch no nodes: A, X, Y and a held RIGHT create nothing", async () => {
  const rig = await boot();
  press(rig, A);
  frames(rig, 3);
  holdSelect(rig);
  frames(rig, 10);
  const ops = recordOps();
  press(rig, A);
  press(rig, A);
  press(rig, X);
  press(rig, Y);
  frames(rig, 24, { buttons: BTN.RIGHT });
  frames(rig, 2);
  ops.stop();
  expect(ops.calls.filter((name) => name === "createNode")).toEqual([]);
}, 120_000);
```

- [ ] **Step 2: Run the tests**

Run: `bun test --conditions=browser tests/swap.test.ts`
Expected: PASS (9 tests). If `the list keeps its place` or the seek values fail, the defect is in Tasks 5–7, not in the test: fix there.

- [ ] **Step 3: Run everything**

Run: `bun run check && bun run test`
Expected: check clean; 204 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/swap.test.ts
git commit -m "test(swap): swapped-mode buttons, the held-button latch, the empty panel and DJ Mode"
```

---

### Task 9: Gallery states

**Files:**
- Modify: `app/gallery/names.ts`
- Modify: `app/gallery/states.tsx` (`Top`, `NowPlaying`, `Idle` take a layout; two states)
- Test: `tests/gallery.test.ts`

**Interfaces:**
- Consumes: `FooterGels`, `TouchLegendItem`, the parts' `layout` props.
- Produces: gallery states `swapped` and `swapped-album`, in `GALLERY_STATES` before `search`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/gallery.test.ts` (before any `search` test, since states are visited in order):

```ts
/** Whether some node on `surface` has exactly this rect. */
function hasRect(surface: "primary" | "auxiliary", rect: Rect): boolean {
  const walk = (node: SimNode): boolean => node.rect?.join(",") === rect.join(",") || node.children.some(walk);
  const root = world.tree(surface);
  return root ? walk(root) : false;
}

test("swapped: the wide deck on top, the narrow Songs list with footer gels below", () => {
  show("swapped");
  expectAll(screenText(world, "primary"), ["One More Time", "Daft Punk", "3 of 12", "1:42", "-3:58"]);
  expect(hasRect("primary", [118, 10, 272, 100])).toBe(true); // the info LCD
  expect(hasRect("primary", [10, 120, 380, 30])).toBe(true); // the seek capsule
  expect(hasRect("primary", [10, 160, 380, 72])).toBe(true); // the transport row
  const bottom = screenText(world, "auxiliary");
  expectAll(bottom, ["iPoDS", "142 songs · 9.6 hrs", "Song Name", "Artist", "Digital Love", "♪", "Search", "Back"]);
  expect(bottom).not.toContain("Now Playing");
  const albums = pathTo(world, "auxiliary", "Albums").at(-3)!.rect!;
  expect(albums[0] + albums[2]).toBeLessThanOrEqual(314);
  expect(backgroundOf(pathTo(world, "auxiliary", "Digital Love"))).toBe(SELECTED_ROW);
  expect(pathTo(world, "auxiliary", "Aerodynamic").at(-5)!.rect![3]).toBe(168);
});

test("swapped-album: the album drill-down with its breadcrumb and an Albums gel", () => {
  show("swapped-album");
  expectAll(screenText(world, "auxiliary"), ["Discovery", "Daft Punk · 14 songs", "Song Name", "Time", "#", "Search", "Albums"]);
  expectAll(screenText(world, "primary"), ["Aerodynamic", "2 of 14"]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test --conditions=browser tests/gallery.test.ts`
Expected: FAIL, `no gallery state "swapped"`.

- [ ] **Step 3: Add the states**

`app/gallery/names.ts`:

```ts
export const GALLERY_STATES = ["main", "artists", "album", "scanning", "empty", "stress", "loading", "gels", "dj", "swapped", "swapped-album", "search"] as const;
```

In `app/gallery/states.tsx`:

- Import `FooterGels` and `TouchLegendItem` from `../theme/parts/strips.tsx`, `Layout` from `../theme/theme.ts`.
- `Top` gains `layout?: Layout` and `gels?: readonly TouchLegendItem[]`; it passes `layout={props.layout}` to `Toolbar`, `ColumnHeader` and every `ListRow`, and renders the footer as `{props.gels ? <FooterGels items={props.gels} /> : <FooterLegend items={props.legend} />}` (make `legend` optional: `legend?: readonly LegendItem[]`, default `[]`).
- `NowPlaying` and `Idle` gain `layout?: Layout` and pass it to `InfoLcd`, `SeekCapsule`, `TransportRow` and `IdlePanel`; `TransportRow` also gets `touch={props.layout !== "wide"}`.
- Add before the `search` state:

```tsx
  {
    name: "swapped",
    top: () => <NowPlaying layout="wide" album="Discovery" title="One More Time" artist="Daft Punk" position="3 of 12" elapsed="1:42" remaining="-3:58" fraction={0.3} playing />,
    bottom: () => (
      <Top layout="narrow" tab="Songs" header={["Song Name", "Artist"]} rows={SONG_ROWS} selected={3} playing={6} scroll={[18, 44]}
        gels={[{ action: "search", label: "Search" }, { action: "back", label: "Back" }]} />
    ),
  },
  {
    name: "swapped-album",
    top: () => <NowPlaying layout="wide" album="Discovery" title="Aerodynamic" artist="Daft Punk" position="2 of 14" elapsed="0:12" remaining="-3:15" fraction={0.05} playing />,
    bottom: () => (
      <Top
        layout="narrow"
        tab="Albums"
        strip={<Breadcrumb root="Albums" leaf="Discovery" detail="Daft Punk · 14 songs" />}
        header={["Song Name", "Time"]}
        headerLead="#"
        rows={[["One More Time", "5:20", "1"], ["Aerodynamic", "3:27", "2"], ["Digital Love", "4:58", "3"], ["Harder, Better, Faster, Stronger (Extended Club Mix)", "3:44", "4"], ["Crescendolls", "3:31", "5"], ["Nightvision", "1:44", "6"], ["Superheroes", "3:57", "7"]]}
        selected={1}
        scroll={[4, 52]}
        gels={[{ action: "search", label: "Search" }, { action: "back", label: "Albums" }]}
      />
    ),
  },
```

Neither state uses `cover`: the gallery test counts one `cover-built` log at boot and the swapped states must not add a second when shown.

- [ ] **Step 4: Run the tests to see them pass**

Run: `bun run check && bun test --conditions=browser tests/gallery.test.ts && bun run test`
Expected: check clean; 206 pass.

- [ ] **Step 5: Render the gallery and look**

Run: `bun run gallery`
Expected: `dist/gallery/10-swapped-{top,bottom}@2x.png` and `11-swapped-album-{top,bottom}@2x.png` exist. Open them: the tabs sit inside the narrow toolbar, the wide LCD reaches x 390, the transport gels are spread across 380 px. `dist/` is ignored; commit nothing from it.

- [ ] **Step 6: Commit**

```bash
git add app/gallery/names.ts app/gallery/states.tsx tests/gallery.test.ts
git commit -m "feat(swap): gallery states for the swapped layouts"
```

---

### Task 10: Whole-branch review

- [ ] **Step 1:** The orchestrator dispatches one Sonnet reviewer over `git diff main...feature/screen-switch-mode -- app tests README.md`, with the spec (§4–§7, §9) and this plan's Review Focus as the acceptance criteria. Findings that are defects are fixed in `fix(swap): …` commits with a pinning test each; style findings are judged by the orchestrator.
- [ ] **Step 2:** `bun run check && bun run test` green (206 pass); `bun run gallery` renders.
- [ ] **Step 2b (the orchestrator, with Azahar and Docker):** `bun run perf scroll --model both --check`, then `bun run perf now-playing --model both --check`, one scenario per invocation. Both within budget and within a few tenths of the Plan 8 rows in `docs/perf.md` (Old `scroll` 25.6 ms); a regression is fixed before Plan 10 starts, and the rows are appended to `docs/perf.md` under a "Screen Swap (Plan 9)" heading.
- [ ] **Step 3:** Hand over to Plan 10 (`docs/superpowers/plans/2026-10-10-screen-swap-10-touch.md`) on the same branch.
