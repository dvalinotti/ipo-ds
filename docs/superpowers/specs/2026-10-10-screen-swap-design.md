# iPoDS — Screen Swap

Date: 2026-10-10
Status: approved in conversation, pending written-spec review
Parent specs: `docs/superpowers/specs/2026-10-06-walkman-screens-design.md`, `docs/superpowers/specs/2026-10-07-walkman-hardening-design.md` (budgets), `docs/superpowers/specs/2026-10-08-dj-mode-design.md` (§6.2)
Plans: Plan 9 (layouts, placement, controls) and Plan 10 (the touch Explorer), written after this spec is approved

## 1. Outcome

A setting swaps the two screens: **Now Playing on top, the Explorer on the bottom.** With the Explorer on the touch screen the library is driven by hand:

- **Drag** the list to scroll it, **flick** it to fling, **drag the scrollbar thumb** or tap the track to page.
- **Tap a song** to play it (the visible list becomes the queue, as A does today); tap an artist or album to open it.
- **Tap a tab** to switch between Songs, Artists and Albums; tap the footer gels for Search and Back.
- **The buttons drive playback**: A play / pause, left / right seek, X shuffle, Y repeat.

Hold SELECT for one second to swap; hold it again to swap back. The setting lasts for the session.

Success: headless sim tests drive every behaviour in §6 and §7 with scripted buttons and bottom-screen touches, both layouts render in the gallery, and the frame budgets hold on both models with the Explorer scrolling under a finger. Normal mode behaves and measures as it does today.

## 2. Requirements

### Stated by the user
- A toggle or setting that reverses what each screen shows.
- On the bottom screen the Explorer is touchable: drag to scroll, drag the scrollbar, switch tabs and play songs by touch.
- The button mapping changes when the setting is on.
- The touch paths are designed and measured for performance.

### Decided in design (open to correction)
- **Buttons go to transport** in swapped mode (§6). Touch owns the list; A, X, Y and left / right drive playback; B still goes back in the list. L / R still switch tabs.
- **DJ Mode replaces the Explorer on the bottom** when swapped, and the deck stays on top. The rule in both modes: SELECT flips the bottom screen to the record and back.
- **The keyboard pulls the Explorer back to the top** while it is open, so live results stay visible; the swap restores when it closes.
- **The toggle is hold SELECT** (one second, the X tap-or-hold pattern). A tap of SELECT stays DJ Mode.
- **Session only.** The 3DS host does not ship the framework's `data.fs` module (`contracts/spec/platforms.ts`), so saving the setting would need a fork op. The app launches unswapped.
- **A wide Now Playing layout** for the 400 px top screen, not a letterboxed 320 deck.
- **A tap acts at once**: a song plays, an artist or album opens, and the selection highlight moves to the tapped row.
- **No rubber band** at the ends of the list, and the list is row-aligned whenever it is still (iTunes 4).
- **D-pad up / down and the circle pad are unbound** in swapped mode. The 3DS has a hardware volume slider; the app has no software volume and does not gain one.

### Out of scope
Persisting the setting, a software volume, a second theme, touch on the deck while it is on the top screen (the top screen has no digitizer), long-press actions on rows, multi-select, a swap animation.

## 3. Platform facts that shape the design

Verified against the pinned runtime `2c72e830` (`runtime/`):

- **Only the bottom screen is touch.** `pocket.json` declares the 400×240 primary viewport and the 320×240 `surfaces.auxiliary`; `input.touch.auxiliary` is the only touch capability (`docs/MODALITY.md`). DJ Mode and the search keyboard need that screen.
- **Placement is one file today.** `app/app.tsx` renders `<Explorer>` on the primary screen and an `<AuxiliarySurface>` holding Now Playing, DJ Mode or the keyboard. Each bottom-screen component unmounts and remounts as the Switch changes; the Explorer store, the search controller and the session live in the shell and survive.
- **Gestures:** `createGesture({ surface: "auxiliary", region, axis })` delivers `onDown`, `onPanStart` / `onPanMove` / `onPanEnd` (with `fdy` per frame and `vy` on release in px per virtual second), `onTap` (an up within 8 px with nothing claimed) and `onCancel`. The first recognizer past `panSlop` (6 px) claims the contact and the others cancel. Priority is registration order, last wins. Each contact carries `hit`, the node id the host resolved under the finger at the down edge; the 3DS host resolves it natively (`hosts/3ds/src/main.c`, `ui_touch_hits_auxiliary`), so no JavaScript hit test runs.
- **The gesture pump returns at once with no contact down** (`gesture-core.ts`, `__runGestures`), so idle recognizers cost nothing per frame.
- **Kinetics:** `createScroller({ max, overscroll, snap, onSettle })` from `@pocketjs/framework/kinetics` owns a px offset through tracking, fling, spring, chase and tween states. `beginDrag` / `drag(delta)` / `endDrag(velocity)` wire to a pan; `scrollTo` / `chaseTo` move it programmatically; `step()` runs once per frame. Fling and spring integrate per core tick, so a 30 Hz world's trajectory is the 60 Hz one subsampled. `overscroll: 0` hard-clamps at the edges.
- **VirtualList** (`framework/src/virtual-list.ts`) is the reference for touch over a windowed list: stop the fling on down, pan feeds the scroller, a tap resolves its row by walking up from the hit node to a mounted row node. The app's own `RecycledList` was built in Plan 5 because VirtualList did not meet the Old 3DS scroll budget; it keeps that role and gains the touch model.
- **Paint-only properties:** `translateY` is one `setProp` per moving frame with no relayout (`kinetics-core.ts` header). Insets relayout.
- **Widths are baked.** The Explorer's parts assume 400 px (header left 242, title cell 214, wide title 318, LCD 144 plus tabs with L / R hints); the deck's assume 320 (art at 10, LCD at 118 × 192, capsule and transport row 300 wide). Theme slots are complete class literals; variants are functions that choose between literals, so the build can compile them (`app/theme/theme.ts`).
- **Buttons:** `onTapOrHold` (`app/input.ts`) with `HOLD_FRAMES = 60`; `stepShoulders` emits `reveal` on an unchorded Y release; `onRepeat` fires on press then every 80 ms after 300 ms. SELECT toggles DJ Mode unless L or R is held (the host's devmenu chord).
- **Perf capture tapes carry touch.** The 3DS host bakes `POCKETJS_CAPTURE_TOUCH` as `frame:id,x,y@frame:-` (`hosts/3ds/Makefile`, `main.c` `scripted_touch`); `scripts/perf.ts` passes only the button tape today.
- **Budgets** (`docs/perf.md`): CPU max ≤ 14 ms on New, ≤ 30 ms on Old. The Old 3DS `scroll` peak is 28.6 ms.

## 4. Architecture

### 4.1 Placement (`app/placement.ts`, pure)

```ts
export type TopScreen = "explorer" | "deck";
export type BottomScreen = "explorer" | "deck" | "dj" | "keyboard";
export function placement(swapped: boolean, dj: boolean, searching: boolean): { top: TopScreen; bottom: BottomScreen };
```

| swapped | dj | searching | top | bottom |
|---|---|---|---|---|
| off | off | off | Explorer | Now Playing |
| off | on | off | Explorer | DJ Mode |
| off | any | on | Explorer | Keyboard |
| on | off | off | Now Playing (wide) | Explorer (narrow) |
| on | on | off | Now Playing (wide) | DJ Mode |
| on | any | on | Explorer | Keyboard |

In words: the keyboard and DJ Mode always take the bottom screen; the keyboard pulls the Explorer to the top; DJ Mode hides whatever the bottom screen was showing. A swap while DJ is on keeps DJ on the bottom and moves the deck to the top.

### 4.2 The shell (`app/app.tsx`)

- `const [swapped, setSwapped] = createSignal(false)` beside `mode`.
- `const place = createMemo(() => placement(swapped(), mode() === "dj", osk.isOpen()))`.
- Two Switch blocks, one per screen, render from `place()`. `<Explorer layout="wide">` on top or `<Explorer layout="narrow">` on the bottom; `<NowPlaying layout="wide">` on top or `<NowPlaying layout="narrow">` on the bottom. The Explorer and Now Playing remount when they change sides. That is how DJ Mode and the keyboard already behave.
- SELECT: `onTapOrHold(BTN.SELECT, tap, hold, notSearching)`. The tap toggles `mode`, now on release; the hold toggles `swapped`. `onTapOrHold` passes the held mask to its callbacks, and both ignore a press with L or R held. The existing `dj.test.ts` presses SELECT for one frame, a tap.
- The empty root `FocusScope` stays.

### 4.3 Layout props

- `Explorer` takes `layout: "wide" | "narrow"`. Wide is today's screen. Narrow is the 320 px touch screen (§5).
- `NowPlaying` takes `layout: "narrow" | "wide"`. Narrow is today's deck. Wide is the 400 px deck (§6.3).
- The prop is constant for a mount, so each screen registers at mount only the handlers and recognizers its layout owns. No handler branches per press.

### 4.4 Store additions (`app/explorer/explorer.tsx`, `app/explorer/model.ts`)

- `ExplorerAction` gains `{ type: "setTab"; tab: Tab }` (a tab tap).
- `ExplorerStore` gains a non-reactive `scrollRow: Map<string, number>` keyed by `viewKey`: the list's first row for a view. Both layouts write it from a computation on the settled `top` and the view, so it changes when a row boundary is crossed and never per frame, and skip the write while the list is empty. It is written as the list moves rather than on cleanup because the two screens' remount order on a swap is not defined, and the new Explorer may mount before the old one is disposed. Both layouts read it at mount to seed the window, so a swap, a keyboard round trip or a drill-down and back lands where the list was. The wide layout keeps the focused row visible, so a narrow scroll position survives a swap while the focused row (a tapped row) is inside the window.

### 4.5 Controls (`app/controls.ts`, pure)

```ts
export interface Binding { button: string; normal: string; swapped: string }
export const BINDINGS: readonly Binding[];           // the table in §6.1
export const SEEK_TAP_MS = 5000;
export const SEEK_REPEAT_MS = 2000;
export const FLING_MAX_PX_PER_S = 5000;              // §8
```

`BINDINGS` is the single statement of the mapping. A test parses the README's controls table and asserts it matches, so the docs cannot drift.

## 5. The narrow Explorer (320 px, touch)

### 5.1 Geometry

Row height, footer height and the body arithmetic (168 px minus 21 per strip) do not change.

| Part | Wide (today) | Narrow |
|---|---|---|
| Toolbar | lights, LCD 144, tabs with L / R hints | lights, LCD 92 (text 80), tabs without hints at 6 px padding; the group's right edge is at or left of 314 (the measured group is 165 px wide at 8 px padding, so both changes are needed) |
| Column header left cell | 242 | 162 |
| Row title cell | 214 (+ 6 margin) | 134 (+ 6 margin); the detail cell keeps its 144 px |
| Wide title (Artists / Albums) | 318 | 238 |
| Footer | key badges with labels | touch gels with labels (§5.5) |

Theme: `lcdStatus`, `headerLeft`, `rowTitleCell`, `rowWideCell`, `footerItem` and the badge gels become variant functions over the layout; `Toolbar`, `ColumnHeader`, `ListRow` and `FooterLegend` take a `layout` prop and pass the matching marquee widths.

### 5.2 Scrolling

- The arithmetic is pure, in `app/explorer/scroll.ts`: the offset split, the snap, the velocity cap, the thumb mapping both ways and the page offsets. The Explorer binds it.
- A `createScroller` with `max` from a settled row count (`Math.max(0, count - page) * ROW_PX`) and `overscroll: 0`. No `snap` option: with `snap` set, the framework's `endDrag` replaces the fling with a 150–450 ms tween to the projected rest, whose first frames move up to 13 rows at once, so the fling state would never run and the velocity cap would mean nothing. The real fling decays from the clamped release velocity; `onSettle` then tweens to the nearest row when the rest position is not on one (`alignToRow`). `step()` runs in the Explorer's `onFrame`. A rescan that shrinks the rows below the offset clamps it to the new `max` at once.
- Each frame the offset splits: `top = Math.floor(offset / ROW_PX)` and `shift = offset - top * ROW_PX`. `top` stays a settled signal, so frames that cross no row boundary re-run nothing downstream. `shift` is its own signal read by exactly two translates.
- `RecycledList` gains an optional `shift` px prop: the canvas translate becomes `-(top * rowHeight + shift)`. The pool does not grow: a shifted window shows rows `top` to `top + rows`, that is `rows + 1` rows, which the existing pool of `rows + 1` rounded up to even already holds (10 slots for 8 rows, 8 for 7).
- The selection overlay translates by `(focus - top) * ROW_PX - shift`.
- One gesture over the list body (`surface: "auxiliary"`, `axis: "y"`, a geometry `region.rect` covering the body short of the scrollbar's hit region): `onDown` stops the fling and remembers the row under the finger; `onPanStart` begins the drag and feeds the travel the pan slop swallowed (`c.dy - c.fdy`), so the content follows the finger exactly; `onPanMove` passes `-c.fdy`; `onPanEnd` passes `-clamp(c.vy)` (§8); `onUp` (which the framework fires before `onPanEnd` and `onTap`) aligns a stopped, idle scroller to a row; `onCancel` ends a tracking drag with velocity 0.
- In narrow layout `top` does not follow focus. The wide layout keeps `nearestTop` focus-follow and creates no scroller.

### 5.3 Row tap

- The row is arithmetic: the rows tile the body exactly from `bodyTopPx(strips)`, so `rowAt(y, bodyTop, offset, 21, count)` names the row under the finger with no hit walk (the framework's hit resolver is not public API, and the geometry is fixed). It is read at the down edge, after the fling is stopped, and used by `onTap`. A point below the last row is a gap: nothing happens.
- A song row dispatches `playFrom` with `songIds(rows())` and its id. An artist or album row dispatches `open`. Both dispatch `focus` to the row first, so the highlight moves to it.
- No pressed look during the down (rows stay cheap). A finger that moves past the pan slop is a scroll; the framework never fires `onTap` for it.

### 5.4 Scrollbar

- The drawn track stays 14 px. A second gesture (`axis: "y"`) owns a geometry region 20 px wide over the track (x ≥ 300), and only while a thumb exists; with a short list the region is null and the list's region spans the full width.
- A down on the thumb (the contact y within the thumb) starts a thumb drag: `offset = (y - grabOffset) / (view - thumbHeight) * (content - view)`, clamped, set with `scrollTo(…, { immediate: true })` each `onPanMove`; the release aligns to a row.
- A tap on the track above the thumb pages up, below it pages down, through `scrollTo(offset ∓ page() * ROW_PX)` (the 200 ms tween).
- The thumb's position comes from the offset and moves by `translateY`, not inset, so it never relayouts. Its size still comes from `rows()` and `bodyPx()`.

### 5.5 Chrome taps

- **Tabs:** `SegmentedTabs` takes `onSelect?: (tab: Tab) => void`; with it, each tab gel owns a tap recognizer and dispatches `setTab`. L / R still step tabs.
- **Footer gels** (`touchLegendOf(state, panel)` in `model.ts`): `Search` or `Edit search`; `Back`, `Clear`, `Artists` or `Albums`, the labels `legendOf` uses today. Over the empty and read-error panels one gel reads `Scan again` and a tap rescans in both cases (a deliberate tap on a dedicated gel does not need the hold that protects X). Scanning and unavailable show no gels. Each gel owns a tap recognizer.
- **Breadcrumb** taps anywhere on the strip go back (`dispatch({ type: "back" })`); a 20 px label alone is too small a target.
- **LCD** taps reveal the playing song (`reveal`, as Y does in wide layout) and tween the window to centre its row. Gesture handlers run inside the frame's batch, where the settled values and effects are stale until the batch ends: when the reveal changes the view or query, the view-change effect performs the centring after the batch instead of restoring that view's remembered row.
- Every tap target is one helper, `tapTarget(onTap?)` in `parts/gel.tsx`: a ref setter that registers an auxiliary-surface tap recognizer on its node only when a handler is given. The footer gels are 18 px tall inside the 20 px footer so the target is not smaller than it must be.

## 6. Controls and the wide deck

### 6.1 Mapping

| Button | Normal (today) | Swapped |
|---|---|---|
| D-pad up / down, circle pad | Move focus | Unbound |
| D-pad left / right | Page | Seek back / forward: 5 s per tap, then 2 s every 80 ms while held |
| A | Play or open | Play / pause |
| B | Back, clear search | Back, clear search |
| X tap / hold | Search / rescan | Shuffle on-off / rescan |
| Y tap (unchorded) | Reveal the playing song | Cycle repeat |
| Y + L / R, ZL / ZR | Previous / next | Previous / next |
| L / R | Tabs | Tabs |
| START | Play / pause | Play / pause |
| SELECT tap / hold | DJ Mode / swap screens | DJ Mode / swap screens |
| L + R held | Diagnostics in the LCD | Diagnostics in the LCD (top screen) |

### 6.2 Ownership

- **The Explorer owns X, Y, B and the shoulders in both layouts.** Narrow: X tap dispatches `toggleShuffle` to the session (the hold still rescans); the shoulder stepper's `reveal` dispatches `cycleRepeat`. B is unchanged. D-pad, circle pad and A are registered in wide layout only.
- **Now Playing owns A and left / right in wide layout only.** A dispatches `toggle`. Left / right seek through the same scrubber as the capsule drag: the press previews `position ∓ 5 s`, each repeat moves the preview 2 s further, and the release sends the one `seek`, clamped to `[0, durationMs]`; nothing happens while idle or when the duration is 0 (the capsule's rule). A seek is a host command that forces a status re-read and can flush the decoder, so a held button never sends one at the repeat rate. `onRepeat` gains a `repeat: boolean` argument to its callback and a `release` callback.
- Tap-or-hold and repeat steppers stay latched by the keyboard as today (`stepLatch`).

### 6.3 The wide deck (400 px)

| Part | Narrow (today) | Wide |
|---|---|---|
| Art frame | (10, 10) 100×100 | unchanged |
| Info LCD | left 118, width 192, text 176 | left 118, width 272, text 256 |
| Idle panel | width 300 | width 380 |
| Seek capsule | width 300; track 200 (176 with hours) | width 380; track 280 (256 with hours) |
| Transport row | width 300, gap 10 | width 380, gap 20 |
| DJ gel | tappable | drawn as the DJ state indicator, not tappable |

- `seekTrackLeft` is unchanged (capsule 10 + padding 8 + time cell + gap 8 + border 1). The knob math takes the track width from the layout rather than from constants.
- In wide layout the deck creates no recognizers: `TransportButton` and `SeekCapsule`'s drag take a `touch` flag that is off on the top screen. The L + R diagnostics `onFrame` is unchanged.
- Theme: `infoLcd`, `idlePanel`, `seekCapsule`, `seekTrack`, `seekTrackWide` and `transportRow` become variant functions over the layout.

### 6.4 Gallery

Two new states, `swapped` (wide deck top, narrow Songs list bottom) and `swapped-album` (the album drill-down with its breadcrumb and footer gels). The snapshot test and the build test cover the new literals.

## 7. Edge cases

- **Swap with a finger down.** The Explorer unmounts; its gestures dispose (`onCleanup`) and the scroller goes with it. `scrollRow` already holds the last row boundary crossed, so the remount lands where the finger left it.
- **DJ Mode or the keyboard while swapped** rebuilds screens in one frame: DJ Mode replaces the narrow Explorer; the keyboard tears down both screens' contents and builds the wide Explorer and the keyboard. Both are measured (§8); if one exceeds the budget, the second mount is delayed by a frame.
- **Swap or keyboard while DJ is on.** Placement handles both: DJ stays on the bottom; the keyboard replaces it and restores it on close, as today.
- **Tap during a fling.** The down stops the fling; the release is a tap only if the finger stayed within slop, so catching a moving list does not play a song.
- **Rows shrink under a scrolled list** (rescan, search). The scroller reads `max` every step and clamps; focus clamps as today; a slot whose row vanished renders nothing (the null-safe reads stay).
- **Tap on a row gap or over a panel.** No slot under the hit, nothing happens. Over a state panel the body has no list and no list recognizer.
- **SELECT with L or R.** A tap or hold with L or R held does nothing, on release as on press today. The host strips the full L + R + SELECT chord from the mask.
- **Seek with no duration.** Left and right do nothing; the capsule stays empty.
- **Reveal in swapped mode** is the LCD tap; the marker keeps working in both layouts.
- **Status errors and diagnostics** show in the deck wherever it is.
- **Keyboard latch.** A finger still down when the keyboard closes is handled by the framework's touch block; buttons by `stepLatch`.

## 8. Performance

Budgets stay as Plan 5 set them: CPU max 14 ms on New, 30 ms on Old; the Old 3DS scroll peak is 28.6 ms, so touch scrolling has about 1.4 ms of headroom and must not add per-row work.

- **Per-frame work while scrolling is bounded by the pool, not the finger.** `RecycledList` computes each slot's row from the final `top` once per frame, so a slot that crosses three rows in one frame rebinds once. The worst frame is a whole-pool rebind: every slot rebinds its three texts. That is the work of a D-pad page move today. Expected host writes per frame: three translates on a sub-row frame (canvas, overlay, thumb), plus about four per slot that rebinds.
- **Two values move per frame.** `shift` feeds the canvas translate and the overlay translate; the thumb translate derives from the offset. All are paint-only. `top` stays settled.
- **No handler subscribes to or rebuilds the row memo.** The scroller's `max` and the thumb mapping read a settled row count, not the rows. Pan handlers make one call into the scroller. The down handler stops the fling and computes the row from the contact's y; a tap then reads the visible rows once, as an A press does today.
- **Recognizers:** one for the list body, one for the scrollbar, one per tappable chrome part (three tabs, up to two footer gels, the crumb strip, the LCD). Idle recognizers cost zero. The deck already carries six.
- **The fling is capped.** `endDrag` receives the release velocity clamped to `FLING_MAX_PX_PER_S` (5000 px/s). In the framework's fling state the first frame moves `v / 60` px, 83 px or about 4 rows at the cap, and decays from there (0.9672 per tick), so the cap bounds the worst frame. The perf run lowers the constant if Old 3DS measures over budget.
- **Remount spikes.** A swap rebuilds both screens in one frame; opening DJ Mode while swapped rebuilds the bottom screen; opening the keyboard while swapped rebuilds both. Opening DJ Mode today measured 16 ms on Old. All are user-initiated and rare; all are measured, and the budget is not relaxed for them: if one exceeds it, the second screen's content mounts one frame after the first.
- **Scenarios** in `scripts/perf.ts`, which gains a `touch` tape per scenario passed through `POCKETJS_CAPTURE_TOUCH` (every touch tape starts inside the list body, y 51–218): `swapped-idle` (hold SELECT, then nothing), `touch-drag` (a slow finger-follow drag still down through the window), `touch-fling` (a flick at the cap lifted just before the window), `swap` (the hold's frame inside the window), `swap-dj` (a SELECT tap while swapped), `swap-search` (a tap on the Search gel while swapped). Plan 9 re-measures `scroll` and `now-playing` before any touch work lands. Rows in `docs/perf.md` next to the existing ones.
- **Unchanged paths.** Wide layout creates no scroller and no Explorer recognizers, so normal mode measures as today; the narrow Explorer and wide deck have the same node counts as their current layouts.

## 9. Testing

**Pure (`tests/`):**
- `placement.test.ts`: every row of §4.1.
- `controls.test.ts`: `BINDINGS` matches the README's controls table.
- `scroll.test.ts`: offset to `top` and `shift`, the row snap, the velocity cap, the row under a point, the thumb mapping both ways, page and centred offsets, the body's top per strip.
- `explorer-model.test.ts`: `setTab`, `touchLegendOf` for every view and panel.
- `input-timing.test.ts`: `onRepeat`'s first-fire flag.

**Sim (`tests/app.test.ts`, `tests/swap.test.ts`), with the existing auxiliary-touch helpers:**
- Hold SELECT swaps: the Explorer's text moves to the auxiliary tree and the deck's to the primary; a second hold swaps back. A one-frame SELECT still toggles DJ Mode. L + SELECT held does neither.
- A tap on a row plays it and the host log shows one `open`; the visible list is the queue (ZR opens the next visible song). A tap on an album opens it; the breadcrumb root tap goes back.
- A drag moves the list by the finger's travel; a flick flings and settles row-aligned (`top * 21`); a drag cannot pass the ends.
- Dragging the thumb scrolls proportionally; a tap below it pages.
- A tab tap switches tabs; the footer gels search, go back and rescan; the LCD tap reveals the playing song.
- Opening the keyboard in swapped mode shows the Explorer on top and the keyboard below; closing it restores the swap. SELECT in swapped mode shows DJ Mode below the deck; the panel's gel returns to the Explorer.
- Swapped buttons: A toggles, left / right seek by 5 s then 2 s, X toggles shuffle, Y cycles repeat, B goes back, D-pad up does not move focus.
- Normal mode: the existing tests stay green unchanged.

**Gallery:** the two new states render; the others change only where parts gained a `layout` prop.

**Perf:** §8's four scenarios on both models within budget; rows added to `docs/perf.md`.

**Device (Azahar, then hardware, the PR's checklist):** stylus scroll and flick feel, thumb drag, tab and row taps, hold SELECT, the keyboard round trip in swapped mode, DJ Mode from swapped mode, the frame-time diagnostics while scrolling on an Old 3DS.

## 10. Execution

- **Two plans.** Plan 9: placement, hold SELECT, the narrow Explorer and wide deck layouts without touch, the mapping and its owners, the gallery states, the README table. Plan 10: the touch Explorer (scroller, row tap, scrollbar, chrome taps), the perf scenarios and rows, the device checklist. Plan 10 starts on Plan 9's branch.
- **Main session:** Opus at high effort writes the plans, dispatches tasks, judges reviews. It does not write product code.
- **Implementation:** `superpowers:subagent-driven-development`, one implementer and one reviewer subagent per task, both `model: "sonnet"`. TDD for every task; each ends with `bun run check` and `bun run test` green; Plan 10's perf task runs `bun run perf`.
- **Repos:** app work on `feature/screen-switch-mode` here. No fork change; the `runtime` pin stays at `2c72e830`.

## 11. Risks

- **Old 3DS headroom.** 1.4 ms between the measured scroll peak and the budget. Mitigations: bounded rebinds, paint-only moving values, the fling cap. If `touch-fling` still exceeds 30 ms, the cap comes down.
- **Remount spikes** on swap, and on DJ Mode or the keyboard while swapped. Measured against the same budget. If one exceeds it, the second screen's content mounts one frame after the first; keeping the Explorer mounted on both surfaces is the fallback, at the cost of idle nodes.
- **Toolbar fit at 320.** The tab labels' widths are set by the baked font; the gallery snapshot confirms the fit, and tab padding is the adjustable value.
- **Resistive panel feel.** A stylus produces clean contacts; a finger on the 3DS panel can jitter, which the framework's slops absorb. Hardware decides the fling cap and the tap slop.
- **Hit facts for rows.** The 3DS host resolves the node under the finger by bounds. Row Views fill their slots, so a hit always names a node inside a slot or the body itself (a gap).
