# Ds Man — Hardening (Plan 5)

Date: 2026-10-07
Status: approved; amended after the prototype (§11)
Parent specs: `docs/superpowers/specs/2026-10-06-walkman-player-design.md` (§7, §8 stage 8), `docs/superpowers/specs/2026-10-06-walkman-native-localmedia-design.md`
Roadmap: `docs/superpowers/plans/2026-10-06-walkman-roadmap.md` (Plan 5)

## 1. Outcome

ds-man runs smoothly on both 3DS models in Azahar:
- **New 3DS:** 60 fps, idle and while scrolling.
- **Old 3DS:** a steady 30 fps, idle and while scrolling.

The library also loads fast:
- **First scan:** of 323 files, at most 10 s.
- **Later launches:** the list shows within 1 s from a scan cache, then updates in the background.

The deferred minors from Plans 3 and 4 are fixed. The look and the behavior stay as approved; this plan only removes cost and fixes those bugs.

Every claim is measured. A `bun run perf` tool runs scripted scenarios in Azahar's Old and New modes, and the results are kept in `docs/perf.md`.

## 2. Decisions made in brainstorming

| Topic | Decision |
|---|---|
| Real consoles | **Dropped.** The user has none on hand; Azahar (Old and New modes) is the only measuring device. |
| Targets | **New 3DS 60 fps** and **Old 3DS a steady 30 fps**, idle and while scrolling. Measured as CPU work (JS + tick + draw) per frame: **max ≤ 14 ms** on New and **max ≤ 30 ms** on Old, over a 60-frame window. |
| Approach | **Measure, then fix in the app first.** Fork-level list recycling and a `measureText` cache come in only if the measurements still miss the targets after the app-side fixes. |
| Scan | **Faster per-file I/O plus a scan cache on the SD card.** Later launches publish the cached list at once and confirm it in the background. |
| Minors | Plan 4's items 1–7 and 9, and Plan 3's two. Two are left as they are (§6). |
| Look | **Unchanged.** Gallery captures must stay byte-identical to a baseline taken before the first optimization; the only intended visual change is the new `F:` value in the L+R diagnostics line. |

## 3. Measurement

### 3.1 Frame timing in capture builds (fork)

- `hosts/3ds/src/main.c` already times each frame's phases (`phase_js`, `phase_tick`, `phase_draw`, `phase_draw_end`, `phase_gpu`) and hands them to `devserver_set_frame_timing`. It does so only when neither `POCKETJS_CAPTURE` nor `POCKETJS_OFFLOAD` is defined.
- Plan 5 enables that block in capture builds too (it stays off under `POCKETJS_OFFLOAD`). The block only reads the tick counter and fills `devserver.c`'s 60-frame window, so rendering and the existing goldens are unchanged.
- When the capture window ends, `capture_done()` writes `stats.json` next to `done` in the capture folder. It holds:
  - the string from `devserver_debug_stats()`, with `timingUs.{js, tick, draw, gpu, frame}` as `[mean, max]` in µs, `slowFrames`, and `gfx`;
  - a `localmedia` object, from a new `localmedia_stats_json(char *out, size_t cap)`:
    - `cachedMs`: from `scan()` to the cached list's publish, or -1 when there was no cache;
    - `scanMs`: the last completed scan walk;
    - `files`: tracks listed;
    - `parsed`: files fully read in that scan.
- Capture builds wait for each GPU frame (`C3D_FRAME_SYNCDRAW`), which inflates `frame` and `gpu`. Budgets therefore use **CPU work = js + tick + draw**, for which the host already provides per-phase means and maxes. The tool reports the sum of the maxes as a pessimistic CPU max.

### 3.2 `bun run perf` (ds-man, `scripts/perf.ts`)

- **Usage:** `bun run perf [scenario…] [--model old|new|both] [--out <dir>]`. The defaults are all scenarios, both models, and `dist/perf/`.
- **For each scenario and model:**
  - **Build:** a capture `.3dsx`, via `scripts/build.ts --capture` with the scenario's tape (`POCKETJS_CAPTURE_INPUT`, `POCKETJS_CAP_START`, `POCKETJS_CAP_N` = 1).
  - **Fixture `$HOME`:** it is set up the way `runtime/tests/e2e/azahar.ts` does it:
    - `nand/` and `sysdata/` are cloned from the user's Azahar folder;
    - the config is pinned (`graphics_api=2` Vulkan, `resolution_factor=1`, `use_vsync=false`, `frame_limit=100`, `is_new_3ds` per model);
    - `sdmc/music/` is a copy of `dist/test-music/` (generated first with `bun run test-library` when it is missing);
    - `sdmc/3ds/dspfirm.cdc` is a 64 KiB placeholder.
  - **Run:** Azahar launches through `open -n -a Azahar --env HOME=… --args <rom>`. The tool waits for `done` (timeout 180 s), then SIGKILLs Azahar.
  - **Output:** it reads `stats.json` and saves the final top and bottom frames as PNG. The PNGs are decoded as in `azahar.ts`.
- **Scenarios** (frame numbers at 60 Hz):

  | Scenario | Tape | Window (last 60 frames before capture) |
  |---|---|---|
  | `idle` | nothing pressed | frames 1140–1200, Songs list after the scan |
  | `scroll` | A at 600 (plays the first row), D-pad down held from 900 | frames 1140–1200, while scrolling |
  | `now-playing` | A at 600 (plays the first row, whose title overflows the LCD), nothing pressed after | frames 1140–1200, the LCD title marquee running |
  | `scan-first` | nothing pressed; the fixture SD card has no cache | capture at frame 3600; reads `localmedia.scanMs` |
  | `scan-cached` | `scan-first`'s fixture SD card again (now holding the cache), nothing pressed | capture at frame 3600; reads `localmedia.cachedMs` and `localmedia.scanMs` |

  The test library gains one track titled "A Very Long Title That Keeps Scrolling Across The Display (Extended Mix)". It sorts first in the Songs list and overflows the LCD, so `scroll` and `now-playing` both start from it.

  The tool reports `scanMs` for the scan scenarios. For the frame scenarios it reports `js/tick/draw` mean and max, and the CPU max.
- **Output:** a Markdown table on stdout, and `dist/perf/results.json`. The tool exits non-zero if any frame scenario breaks its budget, when run with `--check`.

### 3.3 In-app frame time

- The L+R diagnostics line becomes `U:<underruns> D:<load>% A:<art> F:<mean>/<max>`.
- `F:` is the whole-frame interval in ms, mean and max over the last 60 frames, read from `getOps().debugStats()` (`timingUs.frame`), rounded to whole ms.
- It is read only while L+R are held.
- On builds without timing (capture, offload), it shows `F:-`.

### 3.4 Record

- `docs/perf.md` holds:
  - the baseline table (before any optimization);
  - one row per optimization (scenario × model, CPU max before and after, kept or reverted);
  - the scan numbers;
  - the final table against the targets.
- An optimization that doesn't move its scenario's numbers is reverted, and the attempt is recorded.

## 4. Frame-cost fixes (ds-man, in order; each measured)

1. **Explorer reactivity:** focus moves touch only the rows whose highlight changes.
   - Each row's `cells` becomes a `createMemo` that depends on `rows()[index]`, `library()` and `currentView(state())` through `rowsKey`, not on the focus.
   - `kindAt` and `marquee` stay per-row derivations of `focus()`.
   - `headerOf`, `legendOf` and `crumbOf` are memoized on the values they read: the view key, the query, and `hasSongs`.
   - `rowCells` stops using `library.artists.find` and `library.albums.find`: `buildLibrary` adds `artistByKey` and `albumByKey` maps.
2. **Text measurement:** `Marquee` caches `measureText(text, slot)` in a module-level `Map` keyed by `slot + "\u0000" + text`, bounded at 512 entries and evicted oldest-first.
3. **One input dispatcher:** `app/input.ts` gains `createInputRouter()`, one `onFrame` that runs the steppers for every registered binding:
   - repeat (D-pad), tap-or-hold (X), the analog rows, the shoulders (`stepShoulders`) and A/B/START/ZL/ZR presses.
   - When the button mask is 0, no binding is mid-hold or mid-repeat, and the analog is at rest, it returns after one comparison.
   - The Explorer and `app.tsx` register through it. Behavior is pinned by the existing input tests.
4. **Status polling:**
   - **SDK (fork, `framework/src/localmedia.ts`):** `status()` keeps the last raw string and parsed object, and returns the same object when the string is identical.
   - **Controller (`app/player/controller.ts`):** `poll()` skips the `hostStatus` step when the status object is the previous one.
   - **`onChange`:** fires only when `step` returned a new state.
   - **Session:** sets its signals only when the values change. Solid's equality already guards primitives; the status object is now reference-stable when unchanged.
5. **Now Playing:**
   - The elapsed and remaining labels, the `n of m` text and the LCD status row sit in fixed width × height boxes, so the core skips relayout on text swaps (`lib.rs` fast path).
   - `SeekCapsule`'s fill and knob take a rounded pixel position, so they update only when the pixel changes.
6. **Contingency (fork, only if §8's targets are still missed after 1–5):**
   - `VirtualList` row recycling: keep row nodes, rebind their index instead of disposing and creating.
   - A core-side `measureText` cache.
   - Each is specified at that point in an addendum to this spec, reviewed with the user before it is built.

## 5. Scanning (fork)

### 5.1 Cheaper per file (`localmedia_library.c`)

- Each file opened for scanning gets `setvbuf(f, buffer, _IOFBF, 16384)` with a scan-owned buffer, so tag and frame reads within 16 KB of each other hit memory.
- `readdir`'s `d_type` decides regular-file-ness. Only `DT_UNKNOWN` falls back to `stat`. The size comes from `fseek(f, 0, SEEK_END)` / `ftell` on the open file.
- `lm_tags_read` and `lm_stream_probe` keep their interfaces. The buffer is what makes their small reads cheap.

### 5.2 Scan cache (`localmedia_cache.{h,c}`, pure C)

- **Path:** `sdmc:/pocketjs/localmedia/library.cache`. The folder is created if missing.
- **Format, little-endian:**
  - **Header:** `"LMC1"`, a `u32` version (1), a `u32` entry count.
  - **Each entry:**
    - `u16` name length, then the name bytes;
    - `u64` size and `s64` mtime;
    - three `u16`-length-prefixed UTF-8 fields (title, artist, album, each ≤ 255 bytes);
    - `u32` track and `u32` durationMs;
    - `u8` hasArt, `s64` artOffset, `s64` artRawBytes, `u8` artUnsync.
  - **Trailer:** a `u32` checksum (FNV-1a over everything before it).
- **Reading** is fully bounds-checked. A bad magic, version, length, count or checksum yields an empty cache, never a partial one.
- **Writing:** the file is written to `library.cache.tmp`, then renamed over the cache.
- **Validity:** an entry is reused when name, size and mtime match the file's `stat`.
  - The plan's first task checks in Azahar that `st_mtime` changes when a file is rewritten.
  - If it doesn't, the key becomes name and size, and this spec's wording is amended (a re-tag that keeps the size would then be missed until a manual rescan).
- **Memory:** entries are kept only for the scan's duration, then freed. The `LmLibrary` it produces is the same structure as today.

### 5.3 Cached-then-confirmed scan (`localmedia.c` library worker)

1. `scan()` posts as today.
2. If a cache exists, the worker:
   - builds an `LmLibrary` from it (ids through the same registry; titles, fallbacks and JSON exactly as a parsed scan would produce);
   - publishes it as a completed generation, with `scanning` kept `true`.
3. It then walks the folder:
   - each entry whose name, size and mtime match the cache is reused without opening the file;
   - every other `.mp3` is parsed as in §5.1;
   - between files, it serves a pending art request (Plan 4 minor 3).
4. When the walk ends, it publishes the confirmed list (a new generation, `scanning` false), writes the cache, and records `scanMs` (the walk's duration) and the `files` and `parsed` counts.
5. If the confirmed list's JSON is byte-identical to the cached one, it still counts as a generation (the app's rebuild is cheap and idempotent).

### 5.4 Contract (`contracts/spec/localmedia.ts`)

- The `scanGeneration` doc gains: "A scan may complete more than one generation: a cached list first (while `scanning` stays true), then the confirmed list."
- `LocalStatus` gains `scanMs: number`, the duration of the last completed scan walk in ms (0 before the first).
- The sim fake mirrors both:
  - it gains `options.cached` (a fixture list to publish first);
  - `scanMs` follows the virtual time of the scan.

## 6. Minors

| # | Fix | Test |
|---|---|---|
| 4.1 | `lm_player_position` treats queued-but-none-playing as not yet heard (keeps `position_ms`) | player-test, with a fake-sink mode where a queued slot is not playing until the test starts it |
| 4.2 | A failed open publishes the scan's `durationMs` for that track (UI command snapshot), not the previous track's | glue-test |
| 4.3 | The worker serves an art request between scanned files | glue-test (art requested during a slow scan resolves before the scan ends) |
| 4.4 | Path buffers in `localmedia.c` (`Mail.path`, `open` and `artwork` paths) grow to 1024 bytes | glue-test with a 250-character UTF-8 name |
| 4.5 | The audio thread checks `current(generation)` before the prefill pump | glue-test (a superseded open queues no audio) |
| 4.6 | A scan that runs out of memory keeps the current library and reports `scanning` false | library-test with a failing allocator hook (`LM_TEST_ALLOC_FAIL`) |
| 4.7 | The prefill's decode ticks count toward `decodeLoad` | glue-test |
| 4.9 | The reserved handle-0 texture is an 8×8 blank | glue-test (upload sizes recorded by the fake) |
| P3a | Player `onChange` fires only on change | controller test (§4 item 4) |
| P3b | X does nothing over the read-error panel; holding X still rescans | app test |

Left as they are:
- **Plan 4 minor 8, rare unsynchronised tags read byte by byte:** the 16 KB scan buffer makes those reads memory reads.
- **Plan 4 minor 10, the formal C11 data race in the seqlock payload:** it is fenced and correct on the single app core, and rewriting it adds complexity without a behavior change.

## 7. Testing

- **TDD throughout:** every change starts with a test that fails for the stated reason.
- **Fork:**
  - **`localmedia-native.test.ts`:**
    - cache tests (round trip; corrupt, truncated and wrong-version files; fuzz under ASan);
    - scan-with-cache tests (reused, changed, new and removed files);
    - glue-test cases for the minors.
  - **`localmedia.test.ts` / `localmedia-sim.test.ts`:** `scanMs`, stable `status()` objects, and the sim's cached-then-confirmed scan.
  - **`3ds-profile.test.ts`:** unchanged.
  - **Existing e2e goldens:** unchanged, because capture timing doesn't touch rendering.
- **ds-man:**
  - **App tests:**
    - a focus move recomputes no other row's cells (counted through an `extraGlobals`-injected op-counting wrapper on `setText` / `setProp`);
    - the input router keeps every existing key behavior;
    - `F:` appears in diagnostics;
    - X does nothing on the read-error panel.
  - **Controller tests:** `onChange` only on change; a repeated status is skipped.
  - **Gallery:** the PNGs are byte-identical to the baseline captured before Task 1 of the optimizations.
- The existing suites stay green: ds-man 115 and fork 44 at the start.

## 8. Exit gate

- `bun run perf --check` passes on both models:
  - **CPU max:** ≤ 14 ms on New and ≤ 30 ms on Old in `idle`, `scroll` and `now-playing`.
  - **`scan-first`:** `scanMs` ≤ 10 000.
  - **`scan-cached`:** the cached list published ≤ 1 000 ms after `scan()`, and the confirmation ≤ 3 000 ms.
- `docs/perf.md` records the baseline, each optimization, and the final numbers.
- If a target can't be met after §4 items 1–5 and the §4.6 contingency, the shortfall and what was tried are reported to the user, who decides.
- The suites, typecheck and 3DS build are green, and the gallery is byte-identical to the baseline.

## 9. Out of scope

- Real-console runs.
- v2: lid-closed playback, resume on launch, theme switching.
- New features or visual changes beyond the `F:` diagnostics value.

## 10. Risks

- **Azahar is not hardware:** emulated CPU timing approximates the Old 3DS, and its SD timing differs from a card. The numbers guide the work; hardware may differ.
- **The capture build's SYNCDRAW pacing** can hide GPU-bound costs. The budgets use CPU phases only, and GPU-bound costs need a non-capture check (the in-app `F:`, read by the user).
- **mtime reliability** on 3DS sdmc (§5.2) could force the name-and-size key.
- **The QuickJS ceiling:** if the app-side fixes leave Old 3DS scrolling above 30 ms, the remaining cost may be the core or the framework. That is the §4.6 contingency, with fork drift as its cost.

## 11. Amendments from the prototype

The plan was prototyped and measured in Azahar before it was written. Where a measurement contradicted this spec, the spec yields to §11; each item names the section it replaces.

### 11.1 Measurement (replaces parts of §3.1, §3.2)

- **New 3DS = 300 % CPU clock.** Azahar runs the ARM11 at the Old 3DS clock in both models; the New 3DS speed-up is not emulated. The New model therefore sets `cpu_clock_percentage=300` (checked: 50 % doubled the JS time, 300 % cut it to a third). The Old model keeps 100 %.
- **A `work` series replaces the sum of maxima.** `timingUs` gains `work: [mean, max]`, each frame's js + tick + draw, so the CPU max is one real frame's. Budgets read `work`.
- **`stats.json` adds a `trace`:** the last 240 frames' `[js, tick, draw]` in µs.
- **Tapes start later:** A at frame 2400, D-pad down from 2700, capture at 3000 (scan scenarios at 3600). The first scan took 20–35 s when the tapes were written; it now takes about 6 s, and the later start is kept as margin. The Azahar timeout is 240 s.

### 11.2 Frame-cost fixes (replaces §4 items 1, 3, 5 and §4.6)

What the measurements led to, in order (numbers in `docs/perf.md`):
1. **Library key maps and Explorer memos** (§4 item 1, as specified).
2. **Status polling** (§4 item 4, as specified), plus: while a song plays the session reads status every fourth frame (15 Hz); commands and failed reads still read at once; the player signal ignores status-only changes.
3. **Marquee width cache** (§4 item 2, as specified), plus: an inactive marquee never measures.
4. **Recycled rows, in the app.** The Explorer's list keeps a fixed, even pool of row slots (`app/explorer/recycled-list.tsx`); scrolling a row rebinds one slot and moves the list by a transform. This is §4.6's first contingency, built in ds-man instead of the fork, so it adds no fork drift.
5. **A selection overlay.** The selected row is drawn once, above the list, and moved by a transform; rows ignore focus, so a focus move touches no row.
6. **Settled state.** Values derived from the Explorer state (`key`, `view`, `tab`, `query`, `legend`, `focus`, `top`) are `settled()` signals (`app/reactive.ts`): a write reaches only the readers whose value changed. Solid marks every transitive reader of a written signal before it knows whether a memo's value changed, and that marking was most of a focus move's cost in QuickJS.
7. **An empty root `FocusScope`** keeps the framework's D-pad traversal from walking the list's nodes on every press.

Not built, because the budgets were met without them: §4 item 3 (one input router), §4 item 5 (fixed-size Now Playing text boxes), and the core-side `measureText` cache.

### 11.3 Scanning (replaces §5.1 and the validity rule of §5.2)

Measured in Azahar (Old): opening a file costs about 17 ms and closing it about 12 ms; a read costs about 0.9 ms plus 0.2 ms per KB; libctru's `stat()` opens the file (26 ms) and reports `st_mtime` 0; `archive_getmtime` costs 13 ms and returns a constant; reading all 324 directory entries 32 at a time costs 0.4 s; two threads overlap their opens almost perfectly, a third adds nothing.
- **Listing:** names and sizes come from the SD card's directory entries (`FSDIR_Read`, 32 at a time, `localmedia_dir.c`); no file is opened to list it. On the host, the listing is `opendir` and `stat`.
- **Key:** an entry is reused when its **name and size** match. The format drops the mtime field. The cache serves only a launch's first scan, so a re-tag that keeps the file's size is missed until a manual rescan (hold X), which reads every file. A cache that lists no track publishes nothing, so a launch after an empty card shows the scan in progress, not "No music found" (final review).
- **Reads:** the stdio buffer is **4 KB**, not 16 KB (each refill is one SD read, priced by size).
- **Two readers:** files the cache does not cover are read by the library thread and one helper thread at the same priority; the library thread serves art between its files.

### 11.4 Minors (replaces rows of §6)

- **4.4:** the long-name test uses a 250-byte UTF-8 name (host file systems cap names at 255 bytes) under a long folder path.
- **4.6:** tested in the glue test with a hook that fails the scan's allocations of 64 bytes or more (on the console the big allocations fail first), plus a library test that fails each allocation in turn and gets no library or a whole one.
- **4.9:** handle 0 is freed and the upload retried. A texture handle carries its slot's generation, so the retry gets another handle and nothing is held back; no 8×8 texture is needed.

### 11.5 Testing (adds to §7)

- ds-man unit tests run with `bun test --conditions=browser`, so Solid is reactive in them (`settled()` is unit-tested).
- The fork's suite registers `tests/3ds-arguments.test.ts` and the three media.local test files in its unit stage; they were missing, which failed the suite's own declaration check.
- The fork suite's ESP-IDF incremental test needs Ninja and fails on a machine without it, before and after this plan.
