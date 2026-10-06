# Ds Man — Visual Design (Plan 2): Aqua / iTunes 4

Date: 2026-10-06
Status: approved in conversation, pending written-spec review
Parent spec: `docs/superpowers/specs/2026-10-06-walkman-player-design.md` (§6 visual design stage)

## 1. Outcome

Ds Man adopts the **Mac OS X Aqua / iTunes 4 (2003)** look on both 3DS screens.
Plan 2 turns the approved mockups into an app-owned theme and a kit of
presentational parts. A static gallery bundle built from those parts must
reproduce the mockups in the PocketJS sim. Plan 3 then wires real data and input
into the same parts.

Success: `bun scripts/gallery.ts` writes PNGs of both screens for six states,
and they match the approved mockups (user sign-off). The headless tests show
every gallery state renders without a guest failure. The selected row, LCD and
aqua elements read back their token colours from the sim tree. Every character
the UI uses is inside the baked font coverage.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Direction | Aqua / iTunes 4 (picked from four mockup directions) | User choice |
| Font | **Inter** regular + bold, the framework's bundled default | Lucida Grande is proprietary and cannot ship; Inter is OFL and needs no font flags |
| Icons missing from Inter (⤮ ⏮ ⏭ ❚❚ ▴) | Baked SVG images, white + ink variants | Crisper than a fallback font, and the 3ds-demo bakes SVG through `<Image src>` |
| Key badges Ⓐ Ⓑ Ⓧ Ⓨ | Drawn as a circle View plus a letter | Matches the gel look; no glyph dependency |
| On-screen keyboard | Framework `Osk` with `theme="classic"` (metallic gradient) | Close to brushed metal; no fork change |
| Traffic-light dots | Kept, decorative only | User kept them |
| Theme structure | A `Theme` interface implemented by `AQUA`; parts read only from the theme | Keeps **theme switching (v2)** a new object plus a setting, not a refactor |

Reference mockups:
- Superdesign project: https://superdesign.dev/teams/41eb78a5-b92a-4209-afb7-cfebdaf0b69f/projects/d47931a4-b04c-46dd-9843-f003a0860dc6
  - main draft `e5fe742e-90b3-42a4-b683-062af5bfec61` v2
  - states draft `2c864518-a400-4e5f-b26e-7a9c6fb59f69`
- In repo: `docs/design/aqua/main.html` and `docs/design/aqua/states.html`. Each screen is authored at logical size and shown at 2×.

## 3. Visual system

### 3.1 Type (Inter only)
| Size / weight | Use |
|---|---|
| 12 regular | list rows, column header, footer legend, LCD lines, chips, keyboard legend |
| 12 bold | toolbar LCD title, LCD time readouts, badge letters |
| 14 bold | state panel messages ("No music found", "Nothing playing") |
| 16 bold | Now Playing title |

No other sizes (the `Osk` keyboard sets its own key labels). Text is single-line and clipped.

### 3.2 Colour tokens
| Token | Value |
|---|---|
| `metal` | vertical `#d6d6d6 → #c2c2c2 → #a8a8a8`; rule `#6e6e6e` |
| `lcd` | vertical `#f4f6e6 → #e9ecd5 → #d9ddc0`; border `#7d7f6e`; ink `#1f2018` (title), `#3c3e31` (text), `#6a6c5a` (muted) |
| `aqua` gel | vertical `#b9dcff → #5aa7f0 → #1c6fd1`; border `#1a4f99`; ink `#ffffff` |
| `graphite` gel | vertical `#ffffff → #e2e2e2 → #c4c4c4`; border `#7d7d7d`; ink `#2b2b2b` |
| rows | odd `#edf3fe`, even `#ffffff`, selected `#3875d7` (white ink, including number/count), detail ink `#2b2b2b`, muted `#6a6a6a`, ♪ marker `#1c6fd1` |
| column header | vertical `#ffffff → #e7e7e7 → #d4d4d4`, rule `#a5a5a5`; sorted column vertical `#d9ebff → #a9cdf6 → #8fbbef` |
| scrollbar | track horizontal `#d4d4d4 → #f1f1f1 → #d4d4d4`; thumb `aqua` gel |
| lights | red `#ffb3a8 → #e0443a`, amber `#ffe2a1 → #e3a21a`, green `#c9f0a8 → #4fa83a` |
| progress (seek fill) | `#4a4c3f` on track `#c9cbb3` with border `#8a8c78` |
| list body | `#ffffff` |

### 3.3 Metrics (logical px)
**Top screen 400×240.**

| Element | Placement |
|---|---|
| toolbar | 34 tall: lights 10×10 ×3, LCD 160×30, segmented tabs 20 tall with L/R hints |
| column header | 16 |
| rows | 21 tall, 8 visible |
| footer legend | 20 tall, badges 14×14 |
| scrollbar | 14 wide |
| search strip / breadcrumb (when present) | 20 tall, under the toolbar; pushes the header down, leaving 7 rows |

**Bottom screen 320×240.**

| Element | Placement |
|---|---|
| art frame | 100×100 at (10,10): 3 px white mat, 1 px `#7d7d7d` border, 92×92 art |
| info LCD | 192×100 at (118,10), radius 10: title 16 bold, artist 12, album 12, position line 12 with ⤮/↻ state |
| seek capsule | 300×30 at (10,120), radius 15: times 12 bold, 8 px track, 18 px aqua knob |
| transport | centred row at y 160: 34 / 42 / 64 / 42 / 34 round. Shuffle/repeat use aqua when on and graphite when off; prev/next graphite; play/pause aqua 64. Disabled = graphite at 45 % opacity |
| idle | LCD panel 300×140 with "Nothing playing" (14 bold) and "Pick a song above and press Ⓐ" (12); disabled transport |

### 3.4 Placeholder art
`placeholderArt(album)` hashes the album name (FNV-1a over the normalized name, finished with MurmurHash3's fmix32 so short names spread across hues) to one of six hues:

| Hue | Gradient |
|---|---|
| blue | `#12204a → #5aa7f0` |
| teal | `#0f3b3a → #5fc4b4` |
| plum | `#3a1640 → #c98ad8` |
| amber | `#4a2a08 → #f0b860` |
| green | `#173a14 → #86cf72` |
| graphite | `#2b2b2b → #a8a8a8` |

- Layout: a vertical gradient with two cream (`#f4f6e6`, 85 % opacity) rings at 76 and 48 px.
- A 32 px cream hub shows the **initials**: the first two letters of the album name, the first upper-case and the second lower-case. One-letter names show one letter, and empty names show "♪".
- The hub ink is the hue's dark colour.

### 3.5 States the gallery reproduces
The gallery cycles in this order. Search is last because the open keyboard is modal and takes the L/R buttons.
1. **Main:** Songs tab, 8 rows, selected and ♪ rows; Now Playing with embedded art.
2. **Artists tab:** artist + count rows; idle Now Playing.
3. **Album drill-down:** breadcrumb `Albums › Discovery`, numbered rows with times; Now Playing with placeholder art.
4. **Scanning:** LCD `Scanning…`, state panel with progress; idle Now Playing.
5. **Empty library:** `No music found` + guidance; idle Now Playing.
6. **Search active:** search strip `Search: daft` + `4 found`; the framework keyboard (`classic`) fills the bottom screen. The query shows in the top strip, so the bottom screen has no separate field.

Footer legends follow the mockups. For example search shows `Ⓐ Play Ⓧ Edit search Ⓑ Clear Ⓨ Now Playing`, scanning shows only `Ⓨ Now Playing`, and empty shows `Ⓧ Scan again`.

## 4. Architecture

All of this lives in ds-man. There are no framework (fork) changes.

```
app/theme/theme.ts         Theme interface (semantic slots; functions for state variants)
app/theme/aqua.ts          AQUA: Theme — complete class literals built from §3 tokens
app/theme/placeholder.ts   placeholderArt(album): { hue, dark, light, initials }
app/theme/icons/*.svg      shuffle, prev, next, pause, play, sort-up — each in white and #2b2b2b
app/theme/parts/toolbar.tsx  Lights, LcdStatus, SegmentedTabs
app/theme/parts/list.tsx     ColumnHeader, ListRow, Scrollbar
app/theme/parts/strips.tsx   SearchStrip, Breadcrumb, FooterLegend, KeyBadge
app/theme/parts/panels.tsx   StatePanel, IdlePanel
app/theme/parts/deck.tsx     ArtFrame, PlaceholderArt, InfoLcd, SeekCapsule, TransportButton
app/fonts.json             U+0020–007E, U+00A0–017F, plus ♪ › … ↻ ▶ ⌫ Ⓐ Ⓑ Ⓧ Ⓨ
app/theme/geometry.ts      clampFraction, trackOffset (seek/progress px, clamped for odd host values)
gallery.pocket.json        second manifest (same viewports/capabilities as the app), entry app/gallery.tsx
app/gallery.tsx, app/gallery/{names.ts,states.tsx}  static storyboard of §3.5 built only from parts; L/R flips
                           (the entry lives in app/ because the build reads fonts.json and images beside it)
scripts/build.ts           accepts --manifest=<path> (default pocket.json)
scripts/sim.ts             builds + boots any manifest in the sim (tests and the gallery script share it)
scripts/png.ts, scripts/gallery.ts  writes dist/gallery/<n>-<state>-{top,bottom}@2x.png
```

**Theme interface.** It is semantic, not visual. Every slot returns a complete class literal, because the build compiles only literal class strings, and variants are functions over booleans or small enums. The slots are:
- **Screens and chrome:** top screen, bottom screen, toolbar, lights, LCD and its inks, `tab(active)`, tab text, hints.
- **List:** header, `headerColumn(sorted)`, `row(kind)` and `rowText(kind, playing)`, marker, number, count, scroll track and thumb.
- **Strips and footer:** footer, `badge(primary)`, search strip and field, breadcrumb.
- **Panels:** panel, panel inks, progress track and fill.
- **Deck:** art frame, info LCD, seek capsule, track, fill, knob, time, `transport(size, on, enabled)`.
- **Other:** `placeholderHues`, icon image keys by ink, `osk` (the `Osk` theme name).

**Parts** are Solid components with plain props and a `theme` prop that defaults to `AQUA`. They hold no state and no input handling, except `TransportButton`/`ListRow` exposing `onPress`, which Plan 3 wires. `ArtFrame` takes either `texture` (a `ResourceImage` handle, Plan 4) or `album` (placeholder).

**Gallery.** It is a separate bundle (`ds-man-gallery`) so the app itself stays free of storyboard code. Its state index changes on L/R. `scripts/gallery.ts` boots it through the sim harness and steps to each state. It writes `dist/gallery/<n>-<state>-{top,bottom}.png` with a minimal PNG encoder (`node:zlib`). These go in `dist/`, which is not committed.

## 5. Testing

- **Unit:** `placeholderArt` is deterministic (same album gives the same hue). It spreads six fixture names across at least four hues. Initials cover "Discovery" → "Di", "é" → "É", "x" → "X", "" → "♪", and leading whitespace.
- **Headless (gallery bundle in the sim):** each of the six states boots and steps with `failure === null`. Key text appears (`4 found`, `Albums`, `Discovery`, `Nothing playing`, `Scanning`, `No music found`). The node colours match the tokens: the selected row background is `#3875d7`, a row's text colour is white when selected, and the idle transport is dimmed.
- **Font coverage:** a test collects every literal string in `app/theme/**` and `gallery/**` and asserts each character lies in `app/fonts.json`'s ranges.
- **Visual gate:** the user compares the `scripts/gallery.ts` PNGs with the Superdesign drafts.
- The existing 38 tests stay green. `bun run check` and `bun run 3ds --pocket-only` keep passing.

## 6. Out of scope (Plan 3/4)

- Real library data, `VirtualList` scrolling, D-pad focus and held-key repeat.
- Search behaviour and keyboard wiring, the seek gesture and scrubber, and transport actions.
- Album-art textures (Plan 4) and marquee animation of long titles.
- Theme switching itself (v2): only the interface exists now.

## 7. Risks

- **Mockup-to-engine colour drift.** CSS gradients and the engine's 3-stop gradient may interpolate differently. The visual gate catches it, and tokens adjust in `aqua.ts`.
- **SVG icon baking at 16 px.** Thin strokes may blur. If they do, author icons on a 16 px grid with 2 px strokes, or ship PNG.
- **Inter 12 px legibility on the 3DS (~133 ppi).** Check on device in Plan 5. The fallback is 14 px rows with 7 visible.
- **Rounded segmented tabs.** The engine has a uniform radius only, so the pill ends of the segmented control become separate rounded end segments, or the tabs become uniformly rounded buttons. The gallery shows which.
- **fonts.json memory.** Latin-1 + Extended-A × three sizes × two weights is small, but the Plan 5 memory budget confirms it.
