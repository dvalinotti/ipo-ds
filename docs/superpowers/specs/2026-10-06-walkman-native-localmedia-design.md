# Ds Man — Native Local Media (Plan 4)

Date: 2026-10-06
Status: approved in conversation, pending written-spec review
Parent spec: `docs/superpowers/specs/2026-10-06-walkman-player-design.md` (§4.1 contract, §4.2 native module, §7 testing, §9 risks)
Roadmap: `docs/superpowers/plans/2026-10-06-walkman-roadmap.md` (Plan 4, "Old 3DS support")

## 1. Outcome

The PocketJS fork's 3DS host implements `media.local` natively:
- it scans `sdmc:/music/` and reads ID3 tags and durations;
- it decodes MP3 with minimp3 into NDSP, the 3DS sound service;
- it seeks, ends tracks and publishes the status snapshot;
- it decodes embedded cover art into textures.

ds-man then plays a real library from the SD card, shows real covers on Now Playing, and requires the capability.

This replaces the parent spec's §4.2 where the two differ. §2 lists every difference.

Success: a real library plays, seeks (CBR and VBR) and auto-advances in Azahar, on a New 3DS and on an Old 3DS, and covers display. After 50+ track changes, the live art-handle count returns to 0 or 1. On the Old 3DS, no underrun occurs through 60 s of held D-pad scrolling while a 320 kbps track plays.

## 2. Decisions made in brainstorming

| Topic | Decision |
|---|---|
| Test hardware | **Azahar, New 3DS and Old 3DS.** The Old 3DS underrun check is part of this plan's exit gate, not deferred to Plan 5. |
| Audio scheduling | **Audio thread one priority step above the UI thread, same core, about 1.7 s buffered** (approach A). Every thread shares the app core: `.3dsx` builds inherit hbmenu's core settings and the CIA's `AffinityMask` is 1. The decoder outranks the UI, so a slow UI frame cannot starve it; the UI loses a small, even share of CPU instead. The system core (`APT_SetAppCpuTimeLimit`) and a low-priority decoder with a deep buffer were rejected. |
| Art and the UI frame | **Art is decoded off the UI thread**, on a worker below the UI's priority, so it runs only while the UI waits for vsync and never while the audio thread needs the CPU. `artwork(id)` becomes request-then-ready (§4.3). The parent spec's synchronous `artwork` would have decoded a JPEG inside a frame. |
| Art shape | **128 × 128 square, always**: centre-crop to a square, then box-downscale (or upscale small sources) to 128. |
| Vanish and return | **A file that returns after vanishing gets its original id back.** Ids are never reused for a different file. This matches the sim fake's behaviour. |
| Duration | **Exact from a Xing/Info/VBRI header; otherwise estimated from the first frame's bitrate.** The parent spec's frame-header walk would read every file end to end at scan time, which is gigabytes for a few hundred files and minutes on an Old 3DS SD card. Positions during playback are always exact (counted samples). |
| NDSP ownership | **`media.playback` and `media.local` are mutually exclusive at build time**: `tools/3ds.ts` rejects a plan selecting both. `localmedia` initialises NDSP once at module start. |
| Diagnostics | Status gains `decodeLoad` and `artHandles`. Holding SELECT on Now Playing shows `U:<underruns> D:<load>% A:<art handles>` in place of the LCD status line. |
| Art cache | **None.** Reopening a track decodes its art again. |

## 3. Architecture

### 3.1 Files

```
PocketJS fork (runtime/)                     role
────────────────────────                     ────
contracts/spec/localmedia.ts                 contract v2 (§4)
framework/src/localmedia.ts                  SDK: artwork() → number | "pending"
hosts/sim/localmedia.ts                      sim fake: pending art, decodeLoad/artHandles
hosts/3ds/vendor/minimp3.h (+ LICENSE)       vendored, CC0
hosts/3ds/vendor/stb_image.h (+ LICENSE)     vendored, MIT/PD; STBI_ONLY_JPEG, STBI_ONLY_PNG
hosts/3ds/src/localmedia_tags.{c,h}          pure: ID3v2.2/2.3/2.4 + v1 → fields, APIC offset/length
hosts/3ds/src/localmedia_mp3.{c,h}           pure: frame header, Xing/Info/VBRI, duration, seek offset, resync
hosts/3ds/src/localmedia_art.{c,h}           pure: stb_image decode, crop + box scale → 128×128 RGBA8
hosts/3ds/src/localmedia_ids.{c,h}           pure: file-name → id registry, scan merge
hosts/3ds/src/localmedia.{c,h}               libctru: threads, mailbox, NDSP, status JSON, texture upload
hosts/3ds/src/main.c, qjs.c                  #ifdef POCKETJS_LOCALMEDIA start/stop + `localmedia` namespace
hosts/3ds/Makefile                           objects, -I vendor, POCKETJS_LOCALMEDIA
tools/3ds.ts                                 feature → -DPOCKETJS_LOCALMEDIA; reject media.playback + media.local
tools/3ds-profile.ts                         + media.local, hostAbi 11 → 12
tests/localmedia-native-*.test.ts            host-compiled C tests (cc, ASan/UBSan)
tests/fixtures/localmedia/                   generated MP3 + cover fixtures and the script that makes them

ds-man
app/session.ts                               cover lifecycle (§5.1), diagnostics accessor
app/now-playing/now-playing.tsx              cover in ArtFrame; SELECT diagnostics line
app/theme/parts/deck.tsx                     cover child sized to the frame interior
pocket.json                                  media.local: enhances → requires
scripts/make-test-library.ts                 ffmpeg-generated device test library (§6.4)
tests/                                       headless cover + diagnostics tests
runtime                                      submodule pin bump
```

The four `localmedia_*.c` pure units have no libctru dependency, following the fork's `native.c` pattern, so the fork's bun tests compile them with the host `cc`.

### 3.2 Threads

All threads run on the app core (core id -2).

| Thread | Priority | Owns | Never does |
|---|---|---|---|
| UI (existing) | as today; read with `svcGetThreadPriority` at module start | JS calls: posting commands, publishing command snapshots, reading status, uploading finished art pixels, freeing textures | file, decoder or NDSP calls |
| Audio | UI priority − 1 (higher), clamped to ≥ 0x18 | NDSP, minimp3, the open file, seeking, end of track, underrun and decode-load accounting | tag parsing, art |
| Library worker | 0x3f (below the UI, same as offload) | scan, tag parsing, duration, art read + decode into a pixel buffer | NDSP, textures |

**Audio thread loop.** It waits on a `LightEvent` with a 20 ms timeout. NDSP's frame callback (`ndspSetCallback`) signals the event. On each wake it:
- handles a pending command, if any;
- then fills every free or done wavebuf;
- then publishes position.

It reads the file in 64 KB chunks into a read-ahead buffer. Decoding runs only while a wavebuf is free.

**Buffers.**
- 16 wavebufs, each holding up to 4 Layer III frames: 4 × 1152 samples (MPEG-1) or 4 × 576 (MPEG-2/2.5).
- Each is allocated for 4608 stereo PCM16 frames (18 KB) in linear memory, about 295 KB in total.
- At 44.1 kHz stereo that is about 1.67 s queued.
- Mono files use `NDSP_FORMAT_MONO_PCM16`.

**Rate.**
- `ndspChnSetRate` takes the first frame's sample rate.
- If a later frame changes rate or channel count, it is decoded at the first frame's settings: mono↔stereo is converted, and the rate is not resampled.

**Mailbox and status.** These follow `media.c`:
- The mailbox is a 4-slot SPSC ring with acquire/release atomics, carrying a generation number per command. A command whose generation is not the latest is dropped.
- The status is a set of `_Atomic` fields. The UI thread writes them out as JSON with `snprintf` in `status()`.
- **Snapshot rule:** the UI thread writes the command's snapshot fields before posting. The audio thread publishes only while its command's generation is still the latest.

### 3.3 NDSP lifecycle

`localmedia_start()` runs on the UI thread at host start under `POCKETJS_LOCALMEDIA`:
- It calls `ndspInit()`, configures channel 0 (linear interpolation, stereo output), creates both threads, and allocates the wavebufs.
- If `ndspInit` fails, the module still starts: scans work, and `open` reaches phase `error` with "DSP firmware missing; dump it in Rosalina" (the message `media.c` uses for `RD_NOT_FOUND`), or "Audio unavailable" for other failures.

`localmedia_stop()` runs from `qjs_shutdown`. It:
- sets `running = false`;
- signals the event;
- joins both threads;
- clears channel 0;
- frees every outstanding art texture with `ui_free_texture`;
- frees the reserved texture (§4.3);
- frees the wavebufs;
- calls `ndspExit()`.

## 4. Contract v2 (`contracts/spec/localmedia.ts`)

`LOCALMEDIA.version` becomes **2**. `root`, `maxTracks` and `artMax` (128) are unchanged. ds-man is the only consumer.

### 4.1 Ids

The new `LocalTrack.id` doc text:

> Stable for the session per file name: a rescan keeps a listed file's id, gives a new file the next unused id, and gives a file that returns after vanishing its original id. Ids are never reused for a different file. Ids are not positions; tracks() lists in scan order.

### 4.2 Duration

The new `LocalTrack.durationMs` doc text:

> Exact when the file has a Xing/Info/VBRI header; otherwise estimated from the first frame's bitrate (exact for constant-bitrate files). 0 when unknown or the file does not decode.

### 4.3 Artwork

`LocalMediaOps.artwork(id): number` is non-blocking. It returns:
- **-1**: pending. The first call for an id starts its decode on the library worker. A call for a different id cancels the earlier request. A decode already running finishes, and its pixels are discarded.
- **> 0**: a texture handle for a 128 × 128 RGBA8 texture (centre-crop, then box scale). The upload happens inside this call, on the UI thread. The handle belongs to the guest until `releaseArtwork(handle)`. A second call for the same id after its handle was handed out starts a fresh request.
- **0**: the track has no art, its art failed to decode (unsupported format, corrupt data, larger than the limits in §5.4), or the id is not in the last scan.

Handle 0 is never returned. If `ui_upload_texture` returns 0 (the first upload into a fresh core), the module keeps that slot as a reserved 8 × 8 blank texture for the session and uploads again.

`releaseArtwork(handle)` frees a handle this module issued. Unknown handles are ignored.

### 4.4 Status additions

```ts
/** Percent of real time the audio thread spent decoding over the last second (0..100). */
decodeLoad: number;
/** Artwork handles issued and not yet released. */
artHandles: number;
```

`validLocalStatus` checks both as non-negative integers.

### 4.5 SDK (`framework/src/localmedia.ts`)

`artwork(id): number | "pending"` maps -1 to `"pending"`. `releaseArtwork` still ignores handles ≤ 0.

### 4.6 Sim fake (`hosts/sim/localmedia.ts`)

- `artwork(id)` returns -1 on the first request for an id. The handle becomes ready on the first `advance()` at least `artworkMs` later. `artworkMs` is a new `SimLocalMediaOptions` field, default 0, meaning ready at the next `advance`. Tracks without art return 0 immediately.
- `decodeLoad` is a fixed 0 unless set through a new host method `setDecodeLoad(n)`. `artHandles` is the live-handle count.
- A new test pins vanish-and-return: the returning file gets its original id back.

## 5. Native behaviour

### 5.1 Scan (library worker)

- `scan()` returns false while a scan runs. Otherwise it sets `scanning` and posts the scan to the worker.
- The worker:
  - runs `opendir(LOCALMEDIA.root)`;
  - keeps entries whose names end in `.mp3`, in any letter case, in `readdir` order, up to `maxTracks`;
  - parses each file (§5.2, §5.3);
  - merges ids through the registry (§4.1);
  - builds the full `tracks()` JSON in one heap buffer.
- The worker then swaps the new list and JSON in under an atomic pointer exchange and increments `scanGeneration`. `tracks()` copies the current JSON into a JS string, and the previous list is freed after the swap.
- A missing `sdmc:/music/` directory produces an empty list, not an error.
- Playback continues during a scan. The open track keeps playing even if its file is no longer listed.

### 5.2 Tags (`localmedia_tags.c`)

- **ID3v2.2, 2.3 and 2.4:**
  - Fields: TIT2/TT2, TPE1/TP1, TALB/TAL, TRCK/TRK.
  - Track numbers like `"3/12"` read as 3; non-numeric values read as 0.
  - Text encodings: Latin-1, UTF-16 with BOM, UTF-16BE without BOM, and UTF-8, all converted to UTF-8. A string stops at its first NUL.
  - Unsynchronisation: tag-level in 2.2/2.3, frame-level in 2.4.
  - The extended header and v2.4 footers are skipped.
- **Pictures:** APIC (2.3/2.4) or PIC (2.2) records only the picture data's file offset and length, plus the MIME type or format. The front-cover type (3) is preferred, otherwise the first picture.
  - The picture bytes are skipped with `fseek` and never read at scan time.
  - When the tag is unsynchronised, the picture offset is recorded as such, so the art reader undoes unsynchronisation on the bytes it reads.
- **ID3v1** (the last 128 bytes, `"TAG"`) fills fields v2 left empty. Its text is read as Latin-1.
- **Fallbacks:** the file stem, `"Unknown Artist"`, `"Unknown Album"`.
- **Bounds:**
  - Every length is checked against the remaining tag and file size.
  - A tag larger than the file, or a frame overrunning its tag, ends parsing with whatever was read so far.
  - Fields are capped at 255 UTF-8 bytes, cut on a code-point boundary.

### 5.3 MP3 frames and duration (`localmedia_mp3.c`)

- **Frame header:** MPEG 1, 2 and 2.5, Layer III only. Bitrate and sample-rate tables are complete. Free-format bitrate (index 0) and reserved values are rejected.
- **Sync:**
  - Search from the end of the ID3v2 tag through at most 64 KB.
  - A sync counts only when the next frame computed from its length also has a valid, compatible header (same version, layer and sample rate).
- **Duration:**
  - Xing/Info frame with a frames field: frames × samples per frame ÷ rate.
  - Otherwise VBRI: the same, from its frames field.
  - Otherwise: (file size − audio start − ID3v1 size) × 8 ÷ the first frame's bitrate.
  - No sync means `durationMs: 0`.
- **Seek offset:**
  - With a Xing TOC: interpolate the 100-entry table at `ms ÷ durationMs`.
  - Otherwise: linear across the audio bytes.
  - Then resync forward (same two-frame check) from that offset, at most 64 KB.

### 5.4 Art (`localmedia_art.c`, library worker)

- **Read:** the worker reads the recorded picture span, undoing unsynchronisation if flagged.
  - Pictures over **2 MB** compressed are refused (`0`).
  - `stbi_info_from_memory` refuses pictures over **1500 × 1500** pixels before decoding.
- **Decode:** `stbi_load_from_memory`, JPEG and PNG only, forced to 3 channels.
- **Resize:** centre-crop to the shorter edge, then box-filter to 128 × 128. Each output pixel averages its source rectangle; sources under 128 use nearest-neighbour upscale. Output is RGBA8 with alpha 255.
- **Hand-off:** the 64 KB result is held in a single slot tagged with the request generation. The UI thread's next `artwork(id)` for that id uploads it with `ui_upload_texture(…, 128, 128, 3)` and frees the slot.

### 5.5 Open, pause, seek, volume

- **`open(id)`:**
  - An id not in the last completed scan returns 0, and the playing track continues.
  - Otherwise: serial + 1, generation + 1, publish `{phase: "loading", trackId: id, openSerial, positionMs: 0, durationMs: <scan value>, error: ""}`, and post. The paused flag clears.
  - The audio thread then:
    - stops channel 0 and clears its wavebufs;
    - opens the file;
    - syncs (§5.3);
    - sets rate and format;
    - prefills at least 4 wavebufs;
    - publishes `playing`, or `paused` if `paused(true)` arrived while loading;
    - starts the channel, paused if needed.
  - Failures publish `error` with "File not found", "MP3 frame sync not found", or the NDSP message (§3.3).
- **`paused(v)`:**
  - From `playing` or `loading`, true gives `paused`.
  - From `paused`, false gives `playing`, even if the load has not finished: the snapshot rule's read-back is `paused`/`playing`, matching the sim, and the audio thread starts the channel unpaused when its load completes.
  - The change applies through `ndspChnSetPaused` once the channel is running.
- **`seek(ms)`:**
  - Ignored when there is no track or the phase is `idle` or `error`.
  - Otherwise it clamps to `[0, durationMs]`, publishes the clamped position, turns `ended` into `paused`, and posts.
  - The audio thread then:
    - computes the offset (§5.3);
    - resyncs;
    - resets minimp3 (`mp3dec_init`);
    - clears the wavebufs;
    - sets the sample base to the target time;
    - refills;
    - resumes in the published phase.
  - A newer seek supersedes an older one.
- **`volume(v)`:** applies `ndspChnSetMix` directly on the UI thread (front left and right = v). This is a register write, not a file or decoder call.

### 5.6 Decode, position, end, underruns, load

- **Decode:** each free wavebuf is filled with up to 4 decoded frames, then `DSP_FlushDataCache` and `ndspChnWaveBufAdd`.
  - minimp3 skips undecodable frames (0 samples) and resumes at the next sync.
  - 64 KB consecutive bytes yielding no samples ends the track as `error` with "MP3 data unreadable".
- **Position:** the playing buffer's start time plus `ndspChnGetSamplePos` × 1000 ÷ rate. The position never decreases within one open or seek.
- **End:** at EOF the queued wavebufs drain. When the last one is done, the phase becomes `ended` and the position becomes `durationMs`. The guest decides what plays next.
  - If the estimated duration was off, the published `durationMs` changes at `ended` to the counted length.
- **Underruns:** counted once each time all queued wavebufs are done while `playing` and not at EOF.
- **Decode load:** ticks spent in `mp3dec_decode_frame` (`svcGetSystemTick`) over a rolling 1 s window, divided by the window's ticks, as a percentage rounded down.
- **Read error:** if a read fails mid-track, the queued audio drains, then the phase becomes `error` with "Read error", and the position stays where it stopped.

## 6. ds-man changes

### 6.1 Cover lifecycle (`app/session.ts`)

- **Requesting:** while the open track has `hasArt`, every status poll calls `artwork(id)` until it returns a handle or 0. Tracks without art never call it.
- **Exposure:** the session exposes `cover(): number`, which is 0 for "show the placeholder".
- **Track change:** the previous handle stays shown until the new track's request resolves:
  - a handle replaces it;
  - 0 shows the placeholder;
  - either way, the old handle is released then, exactly once.
- **Teardown:** releases the current handle.
- **Diagnostics:** the session also exposes `diagnostics()`, giving `{underruns, decodeLoad, artHandles}` from the latest status.

### 6.2 Now Playing

- **Cover:** `ArtFrame` receives a cover child when `cover() > 0`. The child draws the texture at the frame's 98 × 98 interior, letting the GPU scale 128 → 98.
  - The plan's first task prototypes the framework primitive (an image node over a texture handle) in the sim and verifies it in a gallery capture. The gallery's `SunsetCover` stays for the storyboard.
- **Diagnostics:** holding SELECT replaces the LCD status line with `U:<underruns> D:<load>% A:<art handles>`. Releasing SELECT restores the line.

### 6.3 Manifest and pin

- `pocket.json` moves `media.local` from `enhances` to `requires`.
- The runtime submodule pin moves to the fork commit carrying this plan.
- The "Music playback is unavailable on this build" path stays, for hosts without the capability (sim tests boot without the fake).

### 6.4 Device test library (`scripts/make-test-library.ts`)

- Uses `ffmpeg` to write about 300 short sine-tone MP3s into an output folder (default `dist/test-music/`, git-ignored). The set covers:
  - about 30 artists and 40 albums;
  - accented and NFD-decomposed names;
  - 128 kbps CBR, 320 kbps CBR, V2 VBR with Xing, and VBR with the Xing header stripped;
  - a mono 22.05 kHz file;
  - ID3 v2.3, v2.4, and v1-only tags;
  - JPEG covers, PNG covers, and no cover;
  - one 65-minute track;
  - one file of random bytes named `.mp3`.
- The script prints how to copy the folder to `sdmc:/music/`, and where Azahar keeps its emulated SD card.

## 7. Testing

### 7.1 Fork, host-compiled C (`cc -std=c11`, ASan + UBSan)

- **Tags:**
  - v2.2, v2.3 and v2.4 fields;
  - each text encoding;
  - tag-level and frame-level unsynchronisation;
  - extended header;
  - `"3/12"` track numbers;
  - v1 fallback per field;
  - cover offset, length and type selection;
  - truncated tags, oversized lengths and garbage, with no out-of-bounds reads under ASan;
  - 255-byte cap on a code-point boundary.
- **Frames:**
  - header parsing across every version × sample-rate × bitrate entry;
  - free-format and reserved values rejected;
  - two-frame sync rejecting a false sync;
  - Xing, Info and VBRI durations;
  - CBR estimate;
  - TOC and linear seek offsets.
- **Decode:** each MP3 fixture decodes through minimp3 to the expected sample count, ±1 frame.
- **Art:**
  - square, wide, tall and tiny sources crop and scale to 128 × 128;
  - box-filter averages checked on a known pattern;
  - JPEG and PNG fixtures decode;
  - over-limit dimensions and bytes refused.
- **Ids:** files kept, added, vanished and returning across four scans; ids never reused.
- **Fixtures:**
  - `tests/fixtures/localmedia/` holds 1–2 s tone MP3s and small JPEG/PNG covers, generated once by a checked-in script (`ffmpeg`, `lame`) and committed, so the tests themselves need no encoder.
  - Pure tag and frame cases are built as byte arrays inside the C test fixtures.

### 7.2 Fork, TypeScript

- **Contract:** version 2; `validLocalStatus` accepts and rejects `decodeLoad` and `artHandles`.
- **SDK:** `artwork` maps -1 to `"pending"`; release ignores handles ≤ 0.
- **Sim:**
  - pending → ready after `artworkMs`;
  - 0 for tracks without art;
  - the vanish-and-return id;
  - `artHandles` counts live handles.
- **Profile:**
  - `media.local` is in the 3DS profile at host ABI 12;
  - `plan.features["media.local"]` is true for 3DS;
  - `tools/3ds.ts` rejects `media.playback` + `media.local`;
  - the Makefile receives `POCKETJS_LOCALMEDIA`.

### 7.3 ds-man headless (`bootBundle` + sim fake)

- The cover appears once art is ready. The placeholder shows while it's pending and for tracks without art.
- No `artwork()` call happens for tracks without art.
- The previous cover stays until the next resolves, then is released exactly once.
- After 50 track changes the sim's live-handle count is ≤ 1, and 0 after teardown.
- Holding SELECT shows the diagnostics line, and releasing restores it.
- The existing 103 tests stay green.

### 7.4 Device checklist (exit gate)

Run on Azahar, a New 3DS and an Old 3DS with the §6.4 library:
1. The scan lists every file, with correct tags, accents and durations. The random-bytes file shows with no duration and reports an error when opened.
2. CBR, VBR-with-Xing, VBR-without-header and mono tracks play cleanly at the right pitch.
3. Seeking lands within about 1 s of the target on CBR and Xing-VBR files, and within about 5 s on the headerless VBR file.
4. Auto-advance, shuffle and repeat work across the library.
5. Covers display for JPEG and PNG, and the placeholder shows otherwise.
6. After 50+ track changes, `A:` reads 0 or 1.
7. On the Old 3DS, `U:` stays 0 through 60 s of held D-pad scrolling in the Songs list while a 320 kbps track plays. Record `D:` for Plan 5.
8. A card with no `music/` folder shows the empty library. Removing `dspfirm.cdc` in Azahar shows the firmware error on open.

## 8. Out of scope

- Old 3DS UI frame-time budgets and the corrupt-file corpus (Plan 5).
- Lid-closed playback, resume on launch, theme switching (v2).
- Gapless playback; Layer I/II files; resampling mid-file rate changes; an art cache; recursive folders.

## 9. Risks

- **Decoder cost on the Old 3DS.**
  - If minimp3 at 320 kbps takes most of the core, the UI frame rate drops, though audio still plays.
  - `D:` measures this. If it is over about 50%, Plan 5 considers the system core.
- **Art memory.** A 1500 × 1500 JPEG decodes to about 6.75 MB. On an Old 3DS `.3dsx` under hbmenu this is the largest transient allocation. The limits in §5.4 bound it, and allocation failure returns 0.
- **NDSP callback timing in Azahar** may differ from hardware. The 20 ms wait timeout bounds the damage, and hardware is the arbiter.
- **Estimated durations** on headerless VBR files can be wrong until the track ends. Seeking in them is approximate.
- **Fork drift:** more native code in the fork raises the cost of rebasing on upstream PocketJS.
