# Ds Man — Screens (Plan 3): Explorer and Now Playing

Date: 2026-10-06
Status: approved in conversation, pending written-spec review
Parent specs:
- `docs/superpowers/specs/2026-10-06-walkman-player-design.md` (§5 screens and controls)
- `docs/superpowers/specs/2026-10-06-walkman-visual-design.md` (Aqua theme and parts)

## 1. Outcome

The app's two real screens are built from the Plan 2 parts and wired to live data:
- **Explorer** (top, 400×240): Songs / Artists / Albums tabs, drill-down, search, D-pad focus with held repeat.
- **Now Playing** (bottom, 320×240, touch): live track info, drag-to-seek, transport.

Both run against the `media.local` sim fake today and against the native host once Plan 4 lands. The gallery bundle remains a static storyboard.

Success: headless sim tests drive every behaviour in §4 with scripted buttons and bottom-screen touches. The app build boots in Azahar showing the Explorer, and on a build without `media.local` it shows "Music playback is unavailable on this build".

## 2. Decisions made in brainstorming

| Topic | Decision |
|---|---|
| Long text | **Marquee.** Text that fits stays still and centred. Text too long starts left-aligned, pauses 1.5 s, scrolls at about 30 px/s to reveal its end, pauses 1.5 s, snaps back, and repeats. It applies to the Now Playing title, artist and album, the top LCD line, and the focused row's title. Other rows clip. |
| Rescan | **Hold X for 1 s** in the Explorer (a tap of X still opens search). Playback continues. Songs that vanished drop from the queue. |
| Track ids | **Stable per file for the session** (contract change in the fork). A rescan keeps the ids of files it already listed and gives new files fresh ids. `open` refuses ids whose files vanished, and the controller already skips refused ids. |
| Tabs | L / R step through Songs → Artists → Albums **without wrapping**. Each tab remembers its own drill-down and focused row. |
| Search scope | **One query** filters whichever tab is showing. The search strip stays visible across tabs while a query is set. Focus returns to the first row whenever the query changes. |
| Y | Jumps to the playing song in the Songs tab, clearing the query if the song is filtered out. |
| Artist drill-down rows | Title plus album. Album drill-down rows show #, title and time. |
| Empty library | X tap scans again (search is meaningless without songs). |
| Time format | `m:ss`; `h:mm:ss` when the duration is an hour or more, with a wider seek-time cell for that case. |
| Skip without ZL / ZR | **Hold Y + L / R** skips to the previous / next song. The Old 3DS has no ZL / ZR (the host leaves those bits unset). L / R alone still step tabs. A tap of Y alone still reveals the playing song, firing on release so a chord never also reveals. |

## 3. Architecture

```
app/session.ts               connect media.local (null when absent), scan at launch, build the
                             Library on each scanGeneration change (after composing decomposed
                             accents), own the PlayerController, poll status once per frame;
                             exposes Solid signals: library, player, status, scanning, available
app/library/compose.ts       composeMarks(text): base letter + U+0300–036F → the precomposed
                             Latin-1 / Latin Extended-A letter, from a generated table
                             (app/library/compose-table.ts, committed)
app/format.ts                formatTime(ms) → "m:ss" or "h:mm:ss"; remaining time with "-"
app/explorer/model.ts        PURE explorer state + reducer + selectors (§4.1)
app/explorer/explorer.tsx    top screen from parts: Toolbar, SearchStrip / Breadcrumb,
                             ColumnHeader, VirtualList of ListRow (21 px rows, focusRows=false,
                             app-owned focus), Scrollbar, FooterLegend
app/now-playing/now-playing.tsx  bottom screen from parts: ArtFrame (placeholder until Plan 4),
                             InfoLcd, SeekCapsule (createGesture + createMediaScrubber),
                             TransportRow; IdlePanel when nothing has played
app/search.ts                createOsk over the explorer query; KeyboardField + Osk replace Now
                             Playing while open; Explorer input gated by !isOpen()
app/input.ts                 createRepeat(button, fn) (300 ms delay, 80 ms rate, onFrame-driven),
                             createHold(button, ms, fn); the button map of §4.2
app/theme/parts/marquee.tsx  Marquee part (§4.4); theme gains marquee timing and font-slot info
app/app.tsx                  Explorer on top; AuxiliarySurface: search keyboard while open,
                             else Now Playing
fork (runtime/):             contracts/spec/localmedia.ts doc + hosts/sim/localmedia.ts: ids stable
                             per file across rescans, open() of a vanished file returns 0
```

**Data flow.**
1. `session` turns host status into player state, and scans into the library.
2. The explorer model plus its selectors decide what the top screen shows.
3. The screens render through the theme parts.
4. Input dispatches explorer actions (model) or player actions (controller).

The parts stay presentational.

**Player reducer additions:** `prune(validIds)` removes ids missing after a rescan from `queue`/`order`. The current song stays, so it plays out.

## 4. Behaviour

### 4.1 Explorer model (pure)

**State.**
- `tab: Tab`.
- Per tab: a drill stack (empty, or one entry for an artist or album key).
- `focus`: a map from view key (tab plus drill key) to row index.
- `query: string`.

**Actions.**
- `tab(+1 | -1)`: clamped, no wrap.
- `open(row)`: drills into an artist or album row. Song rows are handled by the screen, which plays them.
- `back`: pops the drill stack and restores the parent's focus; with an empty stack, clears the query.
- `setQuery(text)`: resets focus to 0 for every view.
- `focus(index)`: clamped to the visible rows.
- `move(delta)`: D-pad or paging.
- `revealPlaying(id, library)`: switches to Songs, clears the drill stack and, if the id is filtered out, the query, then focuses that row.

**Selectors.**
- `visibleRows(library, state)`: `rows(library, view, query)` from Plan 1.
- `header(state)`: left/right labels, `lead` "#" for album songs, `count` for the Artists tab.
- `legend(state, hasLibrary)`.
- `crumb(state, library)`.
- `lcdLine(library, scanning, available)`.

### 4.2 Buttons

| Input | Action |
|---|---|
| D-pad ↑↓ (held repeats 300 ms / 80 ms) | `move(±1)` |
| Circle pad Y | `move` with speed by deflection (one row per 80 ms at full tilt, slower near the dead zone) |
| D-pad ←→ | `move(±visibleRowCount)` |
| A | song row: `player.playFrom(visible song ids, id)`; artist/album row: `open` |
| B | `back` |
| X tap | open search; on the empty library, rescan |
| X hold 1 s | rescan (`media.scan()`) |
| Y (tap, fires on release) | `revealPlaying` |
| L / R | `tab(-1 / +1)` |
| Y held + L / R | player `prev` / `next` (works without ZL / ZR) |
| START / ZL / ZR | player `toggle` / `prev` / `next` (from either screen; ZL / ZR are New 3DS only) |

Every Explorer handler is inactive while the search keyboard is open.

### 4.3 Now Playing

- **Idle** (no song opened yet): `IdlePanel`, disabled seek capsule, disabled transport.
- **Playing / paused / loading:** `ArtFrame` with the placeholder for the album, plus `InfoLcd` showing title, artist, album, `n of m`, shuffle and repeat. Times use `formatTime(position)` and `-formatTime(duration - position)`.
- **Seek:** `createGesture({ surface: "auxiliary", axis: "x", region: seek capsule })`.
  - Down on the track starts `createMediaScrubber`, and moving previews the knob and the elapsed time.
  - Up commits one `seek`; a tap is a down and up in place.
  - Cancel (the contact leaves the surface) issues none.
  - The fraction is clamped by `trackOffset`.
- **Transport:**
  - Taps dispatch `toggleShuffle`, `prev`, `toggle`, `next` and `cycleRepeat`.
  - Repeat-one adds "1" in the LCD.
  - Disabled while idle.

### 4.4 Marquee

**Props.** `Marquee { text; class; width; align: "center" | "start"; active?: boolean }`.

**Behaviour.**
- It measures with the host's `measureText(text, fontSlot)`. The slot comes from the class's size and weight via the framework's font-slot table (`fontSlotFor` at build time, or the generated `FONT_SLOTS` the runtime carries; the plan picks whichever the app can import).
- If `width ≥ textWidth`, the text renders still and aligned as `align` says.
- Otherwise it renders start-aligned and, while `active`, runs the cycle: 1.5 s hold, scroll at 30 px/s until the end is visible, 1.5 s hold, snap back. A pure phase function computes the offset from elapsed frames.
- The offset is applied as `translateX` inside a clipping box.

**Users.** InfoLcd lines and the top LCD line (`active` always); the focused list row's title (`active` only on the focused row).

### 4.5 Rescan and ids

- Hold X starts `scan()`. The LCD line shows `Scanning…` while `status.scanning` is true, and the list stays visible.
- On the next `scanGeneration`, `session` rebuilds the library and dispatches `prune(ids in the new library)`.
- With stable ids, the current song keeps playing even if its file vanished: the host is already streaming it.

## 5. Testing

- **Unit (pure):**
  - explorer model: every action, selector and rule in §4.1;
  - `composeMarks`: each decomposed Latin-1 / Extended-A letter composes, other text passes through, and an unpaired mark stays;
  - `formatTime`: under a minute, minutes, hours, negative remaining;
  - `createRepeat` timing via a frame-counter shim, and the marquee phase function;
  - player `prune`.
- **Fork:** the sim fake keeps ids per file across a rescan, gives new files fresh ids, and refuses to `open` a vanished file. The contract doc states the rule.
- **Headless app** (the sim fake with a fixture of about 20 tracks across 4 artists and 5 albums, with one long title and one decomposed accent):
  - **Launch and play:** the Explorer lists the songs after launch; A plays the focused song, Now Playing shows it, and the queue is the visible list.
  - **Tabs and drill-down:** L/R move tabs without wrapping; A drills into an artist, and B restores the focused row.
  - **Search:** X opens the keyboard; tapping keys filters live; START closes it and keeps the query; B clears the query.
  - **Seek:** dragging on the seek capsule moves the knob and elapsed time with no seek until release, then exactly one seek.
  - **Transport:** taps toggle pause, skip, and cycle shuffle and repeat.
  - **Rescan:** holding X rescans with playback continuing, and a removed fixture file drops from the queue.
  - **Y and the marquee:** Y focuses the playing row; the long title's x changes over frames while a short title's x does not.
  - **Geometry:** the focused row is always within the list viewport.
- **Device:** a manual pass in Azahar of `ds-man-main.3dsx` (without `media.local` until Plan 4) and of the gallery.

## 6. Out of scope

- Native playback and album-art textures (Plan 4); device performance budgets (Plan 5).
- Volume UI (the hardware slider), playlists, and the v2 items: lid-closed playback, resume on launch, theme switching.

## 7. Risks

- **Per-frame work on the ARM11** (status JSON parse, marquee, repeat timers): keep each to O(1) signal writes per frame. Plan 5 measures.
- **Sim keyboard typing** depends on the `classic` layout's key positions. Tests tap keys found by their text nodes' rects.
- **`fontSlotFor` coupling:** the marquee's measurement must use the same slot the build assigns to its class. The test compares the measured width with the rendered text box width.
- **Contract change (stable ids):** Plan 4's native scan must honour it. The contract doc and fake test make it explicit.
