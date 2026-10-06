# Ds Man — Walkman Music Player Design

Date: 2026-10-06
Status: approved in conversation, pending written-spec review

## 1. Goal

A standalone, walkman-style MP3 player for the **New 3DS**, built as a PocketJS
app. The top screen is a music explorer; the bottom touchscreen is a
now-playing deck. The UI takes its look from early-2000s mobile/desktop
software (the exact direction is chosen in a dedicated design stage).

Success: on a New 3DS (and in Azahar) with no PC involved, the app lists the
MP3s in `sdmc:/music/`, lets the user browse, filter and search them, and plays
them with working transport, drag-to-seek, auto-advance, shuffle and repeat,
showing title/artist/album and embedded cover art.

## 2. Requirements

### Stated by the user
- Target hardware: **Old and New 3DS**. Originally New 3DS only; widened on 2026-10-06 after a hardware review. The New 3DS is the primary target; the Old 3DS (268 MHz, no L2 cache, no ZL/ZR/C-stick, 64 MB) must stay usable.
- Format: **MP3 only**.
- Library: **hundreds of tracks in one folder**; metadata from tags.
- Album art: **embedded tag art (ID3 APIC)**, with a **generated placeholder**
  when absent.
- Explorer: **tabs (Songs / Artists / Albums) with drill-down, plus text search**
  filtering the current view.
- Search entry: the **PocketJS on-screen keyboard** on the bottom screen.
- v1 playback: **queue from the visible list**, **shuffle**, **repeat**.
- v2 (deferred): **lid-closed playback**, **resume on launch**, **theme switching**.
- Text coverage: **Latin + accented characters**.
- Aesthetic: early-2000s, **undecided** — explored with mockups in its own stage.
- Framework changes live in a **personal PocketJS fork** pinned by the
  `runtime` submodule.
- Host architecture: **Approach A — native `localmedia` host module**.

### Assumptions (confirmed by review)
- Music root is `sdmc:/music/`, scanned non-recursively for `*.mp3`
  (case-insensitive extension).
- Missing tags fall back to: title = filename without extension,
  artist = "Unknown Artist", album = "Unknown Album".
- The library is scanned on every launch; no persisted index in v1. A manual
  rescan action exists.
- MP3s are decoded at their native sample rate (typically 44.1 kHz).
- Cover art is displayed at up to 96×96 on the bottom screen.
- Volume is the 3DS hardware slider; no software volume UI.

### Out of scope for v1
Lid-closed playback, resume-on-launch / any persistence, theme switching, formats other than
MP3, subfolder scanning, folder.jpg art, playlists, CJK text,
streaming/companion playback.

## 3. Platform findings that shape the design

Verified against the pinned runtime (`12dd7535`):

- The 3DS profile (`runtime/tools/3ds-profile.ts:44-55`) advertises
  `io.offload, media.playback, input.analog.left/right, input.buttons,
  input.cursor, input.touch.auxiliary, display.auxiliary, text.glyphs.baked,
  ui.physics`. There is **no `audio.pcm`, `data.fs` or `data.sqlite`** on 3DS
  (`runtime/hosts/3ds/README.md:528`, `runtime/docs/FS.md`, `runtime/docs/DB.md`).
- The framework has **no MP3/compressed codecs**, no tag parsing, and no
  JPEG/PNG decoding. `decodeWav` accepts PCM16 WAV only.
- `media.playback` streams H.264 + ADPCM from a desktop companion over TCP; it
  is not suitable for a standalone player.
- `.pocket` packages are capped at 24 MiB and loaded fully into RAM, so bundling
  music is not viable.
- Usable as-is: `<AuxiliarySurface>`, `VirtualList` (virtualized, D-pad focus,
  touch pan), `createGesture({surface: "auxiliary"})`, `createMediaScrubber`,
  `Osk`/`TextField` (`surface="auxiliary"`), `ResourceImage` over
  `uploadTexture` handles, bevel/gradient/shadow utilities, keyframe animation.
- Fonts are baked at build time. Unbaked characters render as a hollow box;
  coverage is declared in `app/fonts.json`. `tools/3ds.ts` does not currently
  forward `--font-regular/--font-bold`, so a custom pixel font needs a fork fix.
- `pocket.json` is missing `input.touch.auxiliary` (needed for bottom-screen
  touch) and `input.analog.left` (circle pad, as an enhancement).
- `runtime/hosts/3ds/src/media.c` already runs an NDSP worker with a
  position/status snapshot — the pattern the new module copies.

## 4. Architecture

```
ds-man (this repo)                         PocketJS fork (runtime/ submodule)
─────────────────                          ─────────────────────────────────
app/app.tsx        top tree + <AuxiliarySurface>
app/library/       tracks → indexes, search    contracts/spec/localmedia.ts
app/player/        reducer, queue, shuffle     framework/src/localmedia.ts
app/explorer/      top-screen UI               hosts/3ds/src/localmedia.c
app/nowplaying/    bottom-screen UI            hosts/sim/localmedia.ts
app/theme/         skin tokens + parts kit     tools/3ds-profile.ts  (+media.local)
app/fonts.json     Latin + accents coverage    tools/3ds.ts          (font flags)
pocket.json        + media.local, touch.aux
tests/             unit + headless sim tests
```

### 4.1 `media.local` capability (fork)

Follows the conventions of `contracts/spec/media.ts` and `framework/src/media.ts`:
guest owns control, the native worker owns file I/O, decoding and audio
scheduling, and **binary audio data never enters JS**.

Contract (`contracts/spec/localmedia.ts`):

```ts
export const LOCALMEDIA = Object.freeze({
  version: 1,
  root: "sdmc:/music/",
  maxTracks: 2048,
  artMax: 128,          // longest art edge after downscale, power-of-two texture
});
export type LocalPhase = "idle" | "loading" | "playing" | "paused"
  | "ended" | "error";
export interface LocalTrack {
  id: number;           // stable for the session (scan order)
  file: string;         // filename relative to root
  title: string; artist: string; album: string;
  track: number;        // 0 when unknown
  durationMs: number;   // 0 when unknown
  hasArt: boolean;
}
export interface LocalStatus {
  phase: LocalPhase;
  trackId: number;      // -1 when none
  openSerial: number;   // serial of the open this snapshot describes; 0 before the first
  positionMs: number;
  durationMs: number;
  scanning: boolean;    // a scan is running (independent of playback phase)
  scanGeneration: number; // completed scans; 0 before the first finishes
  underruns: number;
  error: string;
}
export interface LocalMediaOps {
  scan(): boolean;                 // starts async scan; status.scanning → true
  tracks(): string;                // JSON LocalTrack[] of the last completed scan
  open(id: number): number;        // stop current, load + play id; returns its serial (0 = refused)
  paused(value: boolean): void;
  seek(ms: number): void;
  volume(value: number): void;     // 0..1
  status(): string;                // JSON LocalStatus snapshot, non-blocking
  artwork(id: number): number;     // texture handle, 0 if none/failed
  releaseArtwork(handle: number): void;
}
```

**Snapshot rule:** every command updates the status snapshot before it
returns — `open(id)` reads back `{trackId: id, phase: "loading", positionMs: 0}`,
`seek(ms)` reads back the clamped position (an `ended` track becomes `paused`),
`paused(v)` reads back `paused`/`playing`. The worker never publishes state for
a command that a newer command superseded. This keeps a stale `ended` from a
previous track from reaching the guest after it opened the next one.

**Open serial:** each accepted `open` returns a serial one greater than the
last, and every snapshot carries the serial of the open it describes. The
guest acts only on snapshots carrying its latest serial, so a stale snapshot
is ignored even when it names the same track (repeat one) or the host breaks
the snapshot rule.

SDK (`framework/src/localmedia.ts`): `localMedia(ops = globalThis.localmedia)`
returning typed wrappers (parse JSON, clamp volume, validate ids), throwing
"Host does not implement media.local" when absent. Exported as
`@pocketjs/framework/localmedia`.

Capability: `media.local` added to the registry in
`contracts/spec/platforms.ts` and to the 3DS profile; gated by
`-DPOCKETJS_LOCALMEDIA` in `tools/3ds.ts`, mirroring `POCKETJS_MEDIA`.

### 4.2 Native module (`hosts/3ds/src/localmedia.c`)

- **Worker thread** (libctru `threadCreate`, lower priority than the UI loop)
  owns: directory scan, tag parsing, decoding, NDSP buffer refill, seeking.
  The UI thread only posts commands into a latest-wins mailbox and reads an
  atomically updated status snapshot — same discipline as `media.c`.
- **Scan:** `opendir("sdmc:/music/")`, filter `.mp3`, cap at `maxTracks`.
  Per file: parse ID3v2.3/2.4 (TIT2, TPE1, TALB, TRCK, APIC presence; UTF-8,
  UTF-16 and Latin-1 text encodings converted to UTF-8; unsynchronisation
  handled), fall back to ID3v1, then to filename. Duration from the Xing/VBRI
  header when present, else by walking frame headers (bounded cost; hundreds of
  files are acceptable at launch). Result held natively and returned as JSON.
- **Decode:** vendored `minimp3` (CC0, single header). Output PCM16 stereo
  (mono duplicated) at the file's sample rate; `ndspChnSetRate` per track.
  Several `ndspWaveBuf`s in linear memory, refilled by the worker;
  underruns counted.
- **Seek:** Xing TOC when present, otherwise linear byte estimate from
  `ms / durationMs × audioBytes`; then resync to the next valid frame header,
  reset decoder state, clear queued wavebufs. Position is reported from the
  seek target plus `ndspChnGetSamplePos`.
- **End of track:** phase → `ended`; the guest decides what plays next.
- **Artwork:** on request, re-read the APIC frame, decode JPEG/PNG with
  vendored `stb_image` (JPEG + PNG only), box-downscale to fit
  `artMax`×`artMax`, convert to RGB565, upload as a texture, return the handle.
  Handles are freed by `releaseArtwork`; the module also frees any live handle
  on shutdown.
- **NDSP ownership:** if NDSP is already initialised by another module, `open`
  fails with an error status. ds-man does not declare `media.playback`.
- **Errors:** unreadable/corrupt files produce a track with `durationMs: 0`
  at scan, and `phase: "error"` with a message on open; the decoder skips
  bad frames rather than aborting.

### 4.3 Sim fake (`hosts/sim/localmedia.ts`)

Implements `LocalMediaOps` over an in-memory fixture library injected via
`bootWorld` `extraGlobals`, on the sim's virtual clock: `open` → `playing`,
position advances per tick, reaching `durationMs` sets `ended`; `seek`,
`paused`, `scan` (immediate) behave per contract; `artwork` returns a fake
handle for `hasArt` tracks and tracks live handles so tests can assert
releases. This is what all ds-man headless tests run against.

### 4.4 App core (ds-man, pure TS)

- **Library model** (`app/library/`): builds `songs` (sorted by title),
  `artists` (name + track count), `albums` (name + artist, songs sorted by
  track number then title). `normalize(s)` lowercases and strips diacritics
  (explicit Latin-1/Latin Extended-A fold table — no `Intl`/`normalize` in
  QuickJS assumed). `filter(view, query)` does substring match: songs on
  title/artist/album, artists on name, albums on name.
- **Player reducer** (`app/player/`): `reduce(state, action) → {state,
  commands}`.
  - State: `queue: number[]` (original order), `order: number[]` (current
    play order), `index`, `shuffle`, `repeat: "off" | "all" | "one"`,
    `status` (last host snapshot).
  - Actions: `playFrom(ids, startId)`, `toggle`, `next`, `prev`,
    `seek(ms)`, `toggleShuffle`, `cycleRepeat`, `hostStatus(status)`.
  - Commands: `open(id)`, `paused(bool)`, `seek(ms)`.
  - Rules: playing a song snapshots the visible list as the queue. Shuffle on
    reshuffles the remainder keeping the current track first; shuffle off
    restores original order at the current track. `prev` restarts if
    position > 3000 ms, else previous track. On `ended`: repeat one → reopen
    same; otherwise next; at end of order, repeat all → wrap, repeat off →
    stop on last track at 0:00. A status whose `trackId` is not the current
    track is stored but never acted on. On `error` the reducer skips forward
    (repeat one does not retry; repeat all wraps); after as many consecutive
    failures as the queue has tracks, it stops.
  - Shuffle uses an injectable seeded RNG for deterministic tests.
- **Adapter** (`app/player/host.ts`): executes commands against
  `localMedia()` and feeds `status()` (polled once per frame) back as
  `hostStatus`. Solid signals derive UI state from the reducer state.

## 5. Screens and interaction

### 5.1 Top screen (400×240) — Explorer

```
┌ Ds Man ─────── ◄L [Songs] Artists  Albums R► ┐  title bar + tabs (~24px)
│ Search: "daft"                      12 found │  only while a query is set
│ ♪ One More Time            Daft Punk         │  VirtualList, ~30px rows
│ ▸ Aerodynamic              Daft Punk         │
│   Digital Love             Daft Punk         │
└ Ⓐ Play  Ⓧ Search  Ⓑ Back  Ⓨ Now Playing ────┘  footer legend (~18px)
```

- Songs: title + artist, sorted by title. Artists: name + count; A drills
  into that artist's songs. Albums: name + artist; A drills into the album's
  songs in track order. Drill-down shows a breadcrumb (`Artists › Daft Punk`);
  B returns and restores the focused row.
- Search filters the current view (Section 4.4). The ♪ marker shows the
  playing track; Y jumps to it in the Songs tab.
- States: scanning indicator; "No music found in sdmc:/music/"; "No matches".

### 5.2 Bottom screen (320×240) — Now Playing

```
┌──────────────────────────────────────┐
│ ┌──────┐  One More Time  (marquee)   │
│ │ ART  │  Daft Punk                  │
│ │ 96²  │  Discovery                  │
│ └──────┘                 3 / 12  ⤮ ↻ │
│ 1:42 ━━━━━━━━●───────────── -3:58    │  seek row: full-width touch region
│  [⤮]   [⏮]   [ ▶ / ❚❚ ]   [⏭]   [↻]  │  transport, ≥36px targets
└──────────────────────────────────────┘
```

- Seek: `createGesture({surface: "auxiliary", axis: "x"})` on the seek row
  feeds `createMediaScrubber`; the time label and knob preview live while
  dragging; one `seek` on release; tap seeks directly.
- Art: `ResourceImage` over the `artwork` handle (96×96 display). Without art,
  a placeholder: a gradient chosen by hashing the album name, with the album's
  initials. The previous handle is released on track change.
- Long titles scroll as a marquee (clip + `translateX` animation).
- Idle: "Nothing playing — pick a song above".
- While searching, the OSK covers this screen; Now Playing returns when it
  closes.

### 5.3 Controls

| Input | Action |
|---|---|
| D-pad ↑↓ / circle pad | move list focus (held D-pad auto-repeats) |
| D-pad ←→ | page up / page down |
| A | play focused song (queue = visible list) / drill into artist or album |
| B | back from drill-down; else clear active query |
| X | open search (OSK on bottom screen; live filtering; START/B closes, keeps query) |
| Y | jump to now-playing track |
| L / R | switch tabs |
| START | play / pause |
| ZL / ZR | previous / next track |
| Touch (bottom) | transport, shuffle, repeat, seek |

SELECT and the host-reserved L+R combinations are not used.

## 6. Visual design stage

The aesthetic is undecided. A dedicated stage produces 2–3 early-2000s
directions (e.g. Winamp-style media skin, Windows XP Luna, Sony Ericsson
Walkman phone) as native-resolution mockups of both screens, using
Superdesign. The user picks one. Output: theme tokens (`app/theme/`), a parts
kit (bevelled buttons, panels, list rows, tab strip, seek bar, footer legend)
built only from supported styling (gradients, `bevel-*`, borders, shadows,
fixed-size bitmaps — no 9-slice), a pixel font (e.g. the runtime's W95FA) wired
through the fork's font flag fix, and `app/fonts.json` covering
`U+0020-007E, U+00A0-017F` plus UI glyphs (♪ ▶ ❚ ⏮ ⏭ ⤮ ↻ or bitmap icons if
glyphs are unsuitable).

## 7. Testing

- **Fork:** contract tests for `localmedia` (SDK parsing/clamping, capability
  gating), sim-fake behaviour tests, and native parser tests for ID3 /
  Xing / frame-walk against fixture MP3s where the fork's harness allows
  host-compiled C tests; otherwise verified on device.
- **ds-man unit:** library indexes, normalization/search, every reducer rule
  in Section 4.4 (deterministic shuffle).
- **ds-man headless:** `bootBundle` at 400×240 + auxiliary 320×240 with the
  sim fake; scripted buttons and auxiliary touches assert tab switching,
  drill-down, search filtering, play/queue, seek drag (one seek on release),
  transport taps, auto-advance.
- **Device:** Azahar and New 3DS hardware checklist — scan of a few hundred
  real MP3s, playback quality, seek accuracy (CBR and VBR), auto-advance,
  art display, no texture leaks across 50+ track changes, underrun count.
- Test discovery stays within ds-man's own `tests/`; do not discover through
  the runtime submodule.

## 8. Implementation stages

Stages 6–7 depend only on the Stage 1 contract and can proceed in parallel
with Stages 3–5.

| # | Stage | Repo | Exit criteria |
|---|---|---|---|
| 0 | Foundations: fork PocketJS, repoint submodule to the fork's `ds-man` branch; add `input.touch.auxiliary` + `input.analog.left` (enhances) to `pocket.json`; forward font flags in `tools/3ds.ts`; headless sim test harness in ds-man | both | `bun run check`, `bun run 3ds --pocket-only`, smoke sim test green on the fork pin |
| 1 | `media.local` contract, SDK, capability registration, sim fake | fork | contract + fake tests green; sim plays/seeks/ends a fake track |
| 2 | App core: library model + player reducer | ds-man | unit tests cover Section 4.4 rules |
| 3 | Visual design: mockups → chosen direction → tokens, parts kit, font, `fonts.json` | ds-man | approved mockup; kit renders in sim |
| 4 | Top screen Explorer | ds-man | headless tests drive tabs/search/drill-down |
| 5 | Bottom screen Now Playing | ds-man | headless tests drag seek, tap transport |
| 6 | Native playback: scan, ID3, duration, minimp3 → NDSP, seek, status | fork | real library plays/seeks/auto-advances in Azahar and on New 3DS |
| 7 | Native album art: APIC → stb_image → RGB565 texture, release | fork + ds-man | covers display on device; no leaks across 50+ changes |
| 8 | Hardening: scan time, CPU, memory, underruns, corrupt files, Azahar e2e capture | both | device checklist passes |
| v2 | Lid-closed playback (APT sleep hooks), resume-on-launch (persistence), theme switching (second theme + setting) | both | — |

## 9. Risks

- **DSP firmware:** NDSP needs `/3ds/dspfirm.cdc` on the console and in Azahar.
  The app should surface a clear error if `ndspInit` fails.
- **NDSP contention:** `media.c` also initialises NDSP; ds-man must not declare
  `media.playback`, and `localmedia` refuses to start if NDSP is owned.
- **VBR seek accuracy:** files without a Xing TOC seek approximately.
- **Fork drift:** the fork diverges from upstream PocketJS; periodic rebase is
  a maintenance cost.
- **Emulator fidelity:** Azahar audio timing may differ from hardware; hardware
  is the final arbiter.
- **Font memory:** each baked size × weight costs atlas memory; keep the set of
  sizes small.
