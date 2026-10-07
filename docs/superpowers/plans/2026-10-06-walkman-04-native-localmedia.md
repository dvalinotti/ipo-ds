# iPoDS Walkman — Plan 4: Native Local Media

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `media.local` natively in the PocketJS fork's 3DS host. It scans `sdmc:/music/`, reads ID3 tags and durations, plays MP3 through minimp3 and NDSP with seek and end-of-track, and decodes embedded covers into textures. ipo-ds then shows real covers, reports playback errors and diagnostics, and requires the capability.

**Architecture:**
- **Fork pure C units, host-tested with `cc` + ASan/UBSan from bun tests:**
  - `localmedia_ids` (file → id registry);
  - `localmedia_tags` (ID3);
  - `localmedia_mp3` (frames, VBR headers, durations, seek offsets);
  - `localmedia_art` (stb_image decode, crop, scale);
  - `localmedia_library` (folder scan + `tracks()` JSON);
  - `localmedia_player` (decode engine over an abstract audio sink).
- **One libctru file, `localmedia.c`,** runs three threads on the app core:
  - the UI-side calls;
  - an audio thread one priority step above the UI, which owns NDSP and the player;
  - a library worker below the UI, for scans and art.

  They exchange commands through latest-wins seqlock mail slots and status through atomics. QuickJS bindings, `main.c` start/stop, the Makefile and `tools/3ds.ts` gate it on `POCKETJS_LOCALMEDIA`, and the 3DS profile advertises `media.local` at hostAbi 12.
- **Contract v2:**
  - `artwork(id)` returns -1 while pending, then a handle (or 0);
  - status gains `decodeLoad` and `artHandles`;
  - a returning file keeps its id.
- **ipo-ds:**
  - the session's cover lifecycle;
  - `CoverImage` in Now Playing;
  - playback errors and L+R diagnostics in the LCD;
  - a device test-library generator.

**Tech Stack:** C11 / gnu11 (devkitARM in Docker, libctru, citro3d, NDSP), minimp3 (CC0), stb_image (MIT/PD), Bun tests, TypeScript, SolidJS via `@pocketjs/framework`, the PocketJS sim, Azahar.

**Spec:** `docs/superpowers/specs/2026-10-06-walkman-native-localmedia-design.md` (parent: `…-walkman-player-design.md` §4.1–4.2, §7, §9).

**Provenance:**
- This file set was first built as a prototype.
- The prototype ran in Azahar (New 3DS mode, Vulkan) against a copy of the user's own MP3s. The scan, tags, playback, positions and a real cover (upright, correct colours) all worked.
- Every task was then staged as its own commit and rehearsed in order on clean trees:
  - each task's tests were run against the previous commit (**RED**, for the reason given in its step), then at its commit (**GREEN**);
  - every patch below reproduces its staged commit exactly.

| After task | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Fork tests named in the task | 15 | 1 | 2 | 3 | 4 | 5 | 6 | 43 | — | — |
| ipo-ds `bun run test` | — | — | — | — | — | — | — | — | 106 | 109 |

## Global Constraints

- **Where code lives:** framework and host code go in the fork (`runtime/`, branch `ipo-ds`). Each fork task commits there. **Pushing the fork is outward-facing: confirm with the user before the push in Task 8.** The ipo-ds pin moves in Task 9.
- **Commits:** Conventional Commits with the session's attribution trailer.
- **Tests:**
  - In ipo-ds, run `bun run test` or `bun test ./tests/…`; never discover tests through `runtime/`.
  - Fork tests run from `runtime/` with explicit paths.
  - `dist/` stays out of Git.
- **Pure units stay pure:** no `#include <3ds.h>` in `localmedia_{ids,tags,mp3,art,library,player}.c`. Only `localmedia.c` uses libctru. The host tests compile with `cc -std=c11 -D_DEFAULT_SOURCE -Wall -Wextra -fsanitize=address,undefined`; the 3DS build uses `-std=gnu11`.
- **No warnings from `localmedia*.c` in the 3DS build.** The existing `qjs.c` `-Wswitch` warnings for `HostMedia*` predate this plan.
- **Exact values from the spec:**
  - `LOCALMEDIA = { version: 2, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 }`.
  - Buffers: 16 slots (`LM_SLOTS`) of 4608 per-channel frames (`LM_SLOT_FRAMES`), and 4 slots prefilled before a track starts (`PREFILL_SLOTS`).
  - Threads: audio at UI priority − 1, clamped to ≥ 0x18; library worker at 0x3f; both on core −2.
  - Art limits: pictures over 2 MB (`LM_ART_MAX_BYTES`) or over 1500 px on either edge (`LM_ART_MAX_DIM`) are refused.
  - Tag text is capped at 255 UTF-8 bytes (`LM_FIELD_BYTES` 256).
  - The sync search reads at most 64 KB (`LM_SYNC_WINDOW`). After 64 KB of bytes that decode to nothing (`LM_JUNK_LIMIT`), the track reports "MP3 data unreadable".
  - Error strings: "File not found", "MP3 frame sync not found", "MP3 data unreadable", "Read error", "DSP firmware missing; dump it in Rosalina", "Audio unavailable".
- **Vendored libraries** are fetched at pinned commits and checked by SHA-256 (Task 2). Never edit them.
- **Fixtures** come from `tests/fixtures/localmedia/make-fixtures.sh` (ffmpeg 6.0, LAME 3.100). The output is deterministic, the SHA-256 values are listed in Task 2, and the fixtures are committed.
- **Target: Old and New 3DS.**
  - ZL/ZR exist only on the New 3DS.
  - **SELECT is reserved by the framework HIG** (`runtime/docs/HIG.md` §4) for the system sheet, so diagnostics use **L+R**.
- **Azahar:** `ndspInit` needs `sdmc:/3ds/dspfirm.cdc`. Under Azahar's HLE DSP a placeholder file works (64 KiB of zeros); a console needs a real dump from Rosalina. Without it every open fails, which Task 10 now reports on screen.
- **Refinements of the spec** (recorded here so the reviewer weighs them):
  1. **Diagnostics chord.** It is L+R, not SELECT: the user chose this after the HIG conflict was raised. A shoulder pressed while the other is held does not step tabs.
  2. **Audio thread wake.** It waits on a `LightEvent` with a 10 ms timeout, and commands signal the event; the spec had NDSP's frame callback with a 20 ms timeout. Above the 4-slot floor it decodes one slot per wake, which spreads a track's initial fill so the UI keeps CPU while a song starts on the Old 3DS.
  3. **Volume.** The audio thread applies it within 10 ms, so no NDSP call runs on the UI thread (spec §3.2 table, over §5.5's wording).
  4. **Mailboxes.** These are latest-wins seqlock slots (open/stop, seek, art), not a 4-slot ring. A full ring cannot drop safely, and an open must never be lost behind a burst of seeks.
  5. **Errors on screen.** Playback errors appear in the LCD status row. This is new, and it came from the Azahar smoke test, where a missing `dspfirm.cdc` gave a silent stop at "7 of 7".
  6. **No JS-side release on teardown.** `localmedia_forget_guest` frees every outstanding art texture natively on guest teardown, and the sim has no teardown to test the JS release against.
  7. **Diagnostics source.** Now Playing reads the diagnostics from `session.status()`, which already carries `underruns`, `decodeLoad` and `artHandles`, instead of from a separate `session.diagnostics()` accessor.
  8. **Test library size.** Tracks run 20–90 s (323 files, about 370 MB) so the library fits beside real music on an SD card.

## Review Focus

- **Bursts of skips and seeks** (ZR held, a long scrub drag, ZR then an immediate seek). The newest open must always win; a seek older than the open that follows it must never apply; the snapshot's serial and position must stay consistent. This is glue code (`localmedia.c`), so it is pinned by Task 12's device checklist items 4 and 9, and the reviewer should read `audio_main` and `post` deliberately.
- **A large library on the Old 3DS** (hundreds to 2048 files). The scan runs on the low-priority worker while the UI stays responsive, and memory stays bounded (a slim `LmTrack` plus one JSON buffer). Pinned by Task 6's library tests (cap, fallbacks, rescans) and Task 12 items 1 and 7.
- **Covers that cannot decode** (over the size limits, corrupt, unsupported). They show the placeholder, without a crash or a leaked handle. Pinned by Task 5's art tests (limits, corrupt and truncated input) and Task 9's release tests.
- **A file that vanishes between the scan and an open or art request.** Open reports "File not found", and art returns 0. Pinned by Task 7's player test (missing file) and Task 5 (`lm_art_read` failures).
- **Consecutive tracks with different formats** (mono 22.05 kHz after stereo 44.1 kHz). Every open resets the channel's rate and format. Pinned by Task 7 (mono fixture plays as mono) and Task 12 item 2.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `runtime/contracts/spec/localmedia.ts`, `runtime/framework/src/localmedia.ts`, `runtime/hosts/sim/localmedia.ts`, `runtime/tests/localmedia{,-sim}.test.ts` | contract v2, SDK `"pending"`, sim pending art | 1 |
| `runtime/hosts/3ds/vendor/*` | minimp3, stb_image, provenance | 2 |
| `runtime/tests/fixtures/localmedia/*`, `runtime/tests/localmedia-native.test.ts` | fixtures + generator, C harnesses, the bun runner | 2–7 |
| `runtime/hosts/3ds/src/localmedia_ids.{h,c}` | file → id registry | 2 |
| `runtime/hosts/3ds/src/localmedia_tags.{h,c}` | ID3v2.2–2.4 + v1 → `LmTags` | 3 |
| `runtime/hosts/3ds/src/localmedia_mp3.{h,c}` | frame parse, probe, seek offset, resync | 4 |
| `runtime/hosts/3ds/src/localmedia_art.{h,c}` | art read, decode, fit | 5 |
| `runtime/hosts/3ds/src/localmedia_library.{h,c}` | scan + JSON | 6 |
| `runtime/hosts/3ds/src/localmedia_player.{h,c}` | playback engine over `LmSink` | 7 |
| `runtime/hosts/3ds/src/localmedia.{h,c}`, `qjs.c`, `main.c`, `Makefile`, `tools/3ds.ts`, `tools/3ds-profile.ts`, tests | threads, NDSP, bindings, gating, profile | 8 |
| `pocket.json`, `app/player/reducer.ts`, `app/session.ts`, `app/theme/parts/deck.tsx`, `app/now-playing/now-playing.tsx`, `tests/app.test.ts` | covers | 9 |
| `app/theme/{theme,aqua}.ts`, `deck.tsx`, `now-playing.tsx`, `app/input-timing.ts`, tests | errors + L+R diagnostics | 10 |
| `scripts/make-test-library.ts`, `package.json` | device test library | 11 |

**Applying a patch step:** save the block to a file outside the repo (for example `$TMPDIR/tN.patch`) and run `git apply $TMPDIR/tN.patch` from the repo root, or `git -C runtime apply …` for fork patches. Where a step says to watch a test fail first, apply with `--include` (tests), run, then apply with `--exclude` (the rest).

---

### Task 1: Contract v2 (fork)

**Files:**
- Modify: `runtime/contracts/spec/localmedia.ts`:
  - version 2;
  - the artwork, id and duration docs;
  - `decodeLoad` and `artHandles`;
  - the validator.
- Modify: `runtime/framework/src/localmedia.ts`: `LocalArtwork`; `artwork()` maps -1 to `"pending"`.
- Modify: `runtime/hosts/sim/localmedia.ts`:
  - `artworkMs`;
  - pending art on the virtual clock;
  - `setDecodeLoad`;
  - `artHandles`.
- Modify: `runtime/tests/localmedia.test.ts`, `runtime/tests/localmedia-sim.test.ts`.

**Interfaces:**
- Produces:
  - `LocalStatus.decodeLoad: number` and `LocalStatus.artHandles: number`.
  - `LocalMediaOps.artwork(id)`: -1 pending, a handle > 0, or 0.
  - SDK `LocalMedia.artwork(id): LocalArtwork` (`number | "pending"`).
  - `SimLocalMediaOptions.artworkMs?: number`; the art is ready on the first `advance()` at least that long after the request.
  - `SimLocalMediaHost.setDecodeLoad(percent)`.

- [ ] **Step 1: Watch the tests fail.**
  - Save the patch as `$TMPDIR/t1.patch`.
  - Run `git -C runtime apply --include='tests/*' $TMPDIR/t1.patch`, then `cd runtime && bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts`.
  - Expected: `10 pass, 5 fail` (e.g. `Expected: "pending"`).

```diff
diff --git a/contracts/spec/localmedia.ts b/contracts/spec/localmedia.ts
index 6d9f6c3d..cbac812b 100644
--- a/contracts/spec/localmedia.ts
+++ b/contracts/spec/localmedia.ts
@@ -13,13 +13,20 @@
  * the last, and every snapshot carries the serial of the open it describes.
  * A guest acts only on snapshots carrying the serial its latest open
  * returned, so a stale snapshot is ignored even when it names the same
- * track (repeat one). */
+ * track (repeat one).
+ *
+ * Artwork: artwork(id) never blocks. The first call for an id starts a decode
+ * off the UI thread and returns -1 (pending); a later call returns the texture
+ * handle once the decode finished, or 0 when the track has no art or it failed
+ * to decode. One request is in flight: asking for another id abandons the
+ * earlier one. A handle belongs to the guest until releaseArtwork(handle); a
+ * call for the same id after its handle was handed out starts a new request. */
 export const LOCALMEDIA = Object.freeze({
-  version: 1,
+  version: 2,
   /** Scanned non-recursively for *.mp3 (extension case-insensitive). */
   root: "sdmc:/music/",
   maxTracks: 2048,
-  /** Longest artwork edge after downscale; the texture is power-of-two. */
+  /** Edge of the square artwork texture: the picture is centre-cropped to a square, then scaled. */
   artMax: 128,
 });
 
@@ -27,8 +34,9 @@ export type LocalPhase = "idle" | "loading" | "playing" | "paused" | "ended" | "
 const PHASES: ReadonlySet<string> = new Set<LocalPhase>(["idle", "loading", "playing", "paused", "ended", "error"]);
 
 export interface LocalTrack {
-  /** Stable for the session per file: a rescan keeps a listed file's id and gives a new file the
-   * next unused id. Ids are not positions; tracks() lists in scan order. */
+  /** Stable for the session per file name: a rescan keeps a listed file's id, gives a new file the
+   * next unused id, and gives a file that returns after vanishing its original id. Ids are never
+   * reused for a different file. Ids are not positions; tracks() lists in scan order. */
   id: number;
   /** File name relative to LOCALMEDIA.root. */
   file: string;
@@ -38,7 +46,8 @@ export interface LocalTrack {
   album: string;
   /** Track number; 0 when unknown. */
   track: number;
-  /** 0 when unknown or the file does not decode. */
+  /** Exact when the file has a Xing/Info/VBRI header; otherwise estimated from the first frame's
+   * bitrate (exact for constant-bitrate files). 0 when unknown or the file does not decode. */
   durationMs: number;
   hasArt: boolean;
 }
@@ -57,6 +66,10 @@ export interface LocalStatus {
   scanGeneration: number;
   underruns: number;
   error: string;
+  /** Percent of real time the audio thread spent decoding over the last second (0..100). */
+  decodeLoad: number;
+  /** Artwork handles issued and not yet released. */
+  artHandles: number;
 }
 
 export interface LocalMediaOps {
@@ -74,7 +87,8 @@ export interface LocalMediaOps {
   volume(value: number): void;
   /** JSON LocalStatus. Non-blocking: no file, decoder or audio calls on the UI thread. */
   status(): string;
-  /** Texture handle of the track's embedded art at up to artMax × artMax; 0 when it has none or decoding failed. */
+  /** -1 while pending; a texture handle (> 0) of artMax × artMax art once decoded; 0 when the track
+   * has none, decoding failed, or the id is not in the last scan. Never blocks (see Artwork above). */
   artwork(id: number): number;
   releaseArtwork(handle: number): void;
 }
@@ -92,5 +106,6 @@ export function validLocalStatus(value: unknown): value is LocalStatus {
   return isObject(value) && typeof value.phase === "string" && PHASES.has(value.phase)
     && isInt(value.trackId, -1) && isInt(value.openSerial) && isInt(value.positionMs) && isInt(value.durationMs)
     && typeof value.scanning === "boolean" && isInt(value.scanGeneration)
-    && isInt(value.underruns) && typeof value.error === "string";
+    && isInt(value.underruns) && typeof value.error === "string"
+    && isInt(value.decodeLoad) && isInt(value.artHandles);
 }
diff --git a/framework/src/localmedia.ts b/framework/src/localmedia.ts
index 70811183..e104ea94 100644
--- a/framework/src/localmedia.ts
+++ b/framework/src/localmedia.ts
@@ -9,6 +9,9 @@ import {
 export { LOCALMEDIA };
 export type { LocalMediaOps, LocalPhase, LocalStatus, LocalTrack } from "../../contracts/spec/localmedia.ts";
 
+/** A texture handle (> 0), 0 for no art, or "pending" while the host decodes it. */
+export type LocalArtwork = number | "pending";
+
 export interface LocalMedia {
   scan(): boolean;
   tracks(): LocalTrack[];
@@ -18,7 +21,7 @@ export interface LocalMedia {
   seek(ms: number): void;
   volume(value: number): void;
   status(): LocalStatus;
-  artwork(id: number): number;
+  artwork(id: number): LocalArtwork;
   releaseArtwork(handle: number): void;
 }
 
@@ -46,7 +49,10 @@ export function localMedia(ops = (globalThis as unknown as { localmedia?: LocalM
       if (!validLocalStatus(status)) throw new Error("Host returned a malformed status");
       return status;
     },
-    artwork: (id) => ops.artwork(trackId(id)),
+    artwork(id) {
+      const handle = ops.artwork(trackId(id));
+      return handle < 0 ? "pending" : handle;
+    },
     releaseArtwork(handle) {
       if (handle > 0) ops.releaseArtwork(handle);
     },
diff --git a/hosts/sim/localmedia.ts b/hosts/sim/localmedia.ts
index 02513a5e..a8d16de1 100644
--- a/hosts/sim/localmedia.ts
+++ b/hosts/sim/localmedia.ts
@@ -26,6 +26,9 @@ export interface SimLocalTrack {
 export interface SimLocalMediaOptions {
   /** Virtual time a scan takes. 0 (default) completes inside scan(). */
   scanMs?: number;
+  /** Virtual time an artwork decode takes; the handle is ready on the first advance() at least
+   * this long after the request. 0 (default): ready at the next advance(). */
+  artworkMs?: number;
 }
 
 export interface SimLocalMediaHost {
@@ -36,6 +39,8 @@ export interface SimLocalMediaHost {
   volume(): number;
   /** Artwork handles issued and not yet released. */
   liveArtwork(): number[];
+  /** The decodeLoad the status reports. */
+  setDecodeLoad(percent: number): void;
   /** Move the virtual clock. */
   advance(ms: number): void;
   /** Replace what the "card" holds; the next scan() lists it (ids stay with their files). */
@@ -55,6 +60,8 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
   const log: string[] = [];
   const art = new Set<number>();
   let nextArt = 1;
+  /** The one artwork request in flight: its id, virtual age and whether time has passed since. */
+  let artRequest: { id: number; age: number; advanced: boolean } | null = null;
   let volume = 1;
   let scanLeft = -1;
   let tracks: LocalTrack[] = [];
@@ -62,7 +69,7 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
   let serial = 0;
   const status: LocalStatus = {
     phase: "idle", trackId: -1, openSerial: 0, positionMs: 0, durationMs: 0,
-    scanning: false, scanGeneration: 0, underruns: 0, error: "",
+    scanning: false, scanGeneration: 0, underruns: 0, error: "", decodeLoad: 0, artHandles: 0,
   };
 
   const finishScan = () => {
@@ -133,13 +140,21 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
     artwork(id) {
       log.push(`artwork(${id})`);
       if (!tracks.find((t) => t.id === id)?.hasArt) return 0;
+      if (artRequest?.id !== id) {
+        artRequest = { id, age: 0, advanced: false };
+        return -1;
+      }
+      if (!artRequest.advanced || artRequest.age < (options.artworkMs ?? 0)) return -1;
+      artRequest = null;
       const handle = nextArt++;
       art.add(handle);
+      status.artHandles = art.size;
       return handle;
     },
     releaseArtwork(handle) {
       log.push(`releaseArtwork(${handle})`);
       art.delete(handle);
+      status.artHandles = art.size;
     },
   };
 
@@ -148,7 +163,14 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
     log,
     volume: () => volume,
     liveArtwork: () => [...art],
+    setDecodeLoad(percent) {
+      status.decodeLoad = percent;
+    },
     advance(ms) {
+      if (artRequest) {
+        artRequest.age += ms;
+        artRequest.advanced = true;
+      }
       if (scanLeft >= 0) {
         scanLeft -= ms;
         if (scanLeft <= 0) finishScan();
@@ -169,6 +191,7 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
     },
     dispose() {
       art.clear();
+      artRequest = null;
       tracks = [];
       log.length = 0;
     },
diff --git a/tests/localmedia-sim.test.ts b/tests/localmedia-sim.test.ts
index 29f2aa45..d94d0df7 100644
--- a/tests/localmedia-sim.test.ts
+++ b/tests/localmedia-sim.test.ts
@@ -83,18 +83,52 @@ test("an undecodable file reaches error after loading; an unscanned id does not
   expect(media.status().positionMs).toBe(0);
 });
 
-test("artwork handles exist only for tracks with art and stay live until released", () => {
+test("artwork is pending until time passes, exists only for tracks with art, and stays live until released", () => {
   const { host, media } = setup();
   media.scan();
+  expect(media.artwork(0)).toBe("pending");
+  expect(media.artwork(0)).toBe("pending");
+  expect(media.artwork(1)).toBe(0);
+  host.advance(16);
   const handle = media.artwork(0);
   expect(handle).toBeGreaterThan(0);
-  expect(media.artwork(1)).toBe(0);
-  expect(host.liveArtwork()).toEqual([handle]);
-  media.releaseArtwork(handle);
+  expect(host.liveArtwork()).toEqual([handle as number]);
+  expect(media.status().artHandles).toBe(1);
+  media.releaseArtwork(handle as number);
   expect(host.liveArtwork()).toEqual([]);
+  expect(media.status().artHandles).toBe(0);
   media.volume(0.25);
   expect(host.volume()).toBe(0.25);
-  expect(host.log).toEqual(["scan()", "artwork(0)", "artwork(1)", `releaseArtwork(${handle})`, "volume(0.25)"]);
+  expect(host.log).toEqual(["scan()", "artwork(0)", "artwork(0)", "artwork(1)", "artwork(0)", `releaseArtwork(${handle})`, "volume(0.25)"]);
+});
+
+test("a slow artwork decode stays pending for its virtual time; asking for another id abandons it", () => {
+  const { host, media } = setup({ artworkMs: 100 });
+  media.scan();
+  host.setLibrary([LIB[0]!, { ...LIB[1]!, art: true }]);
+  media.scan();
+  expect(media.artwork(0)).toBe("pending");
+  host.advance(60);
+  expect(media.artwork(0)).toBe("pending");
+  expect(media.artwork(1)).toBe("pending"); // abandons 0
+  host.advance(60);
+  expect(media.artwork(0)).toBe("pending"); // a fresh request
+  host.advance(100);
+  expect(media.artwork(0)).toBeGreaterThan(0);
+  expect(media.artwork(0)).toBe("pending"); // after hand-out, a new request
+  host.setDecodeLoad(37);
+  expect(media.status().decodeLoad).toBe(37);
+});
+
+test("a file that vanishes and returns gets its original id back", () => {
+  const host = createSimLocalMedia(LIB);
+  const media = localMedia(host.ns);
+  media.scan();
+  host.setLibrary([LIB[1]!]);
+  media.scan();
+  host.setLibrary([{ file: "new.mp3", durationMs: 10 }, LIB[0]!, LIB[1]!]);
+  media.scan();
+  expect(media.tracks().map((t) => [t.id, t.file])).toEqual([[3, "new.mp3"], [0, "01 Intro.mp3"], [1, "untagged.mp3"]]);
 });
 
 test("ids stay with their files across a rescan; new files get fresh ids; a vanished file does not open", () => {
@@ -109,5 +143,7 @@ test("ids stay with their files across a rescan; new files get fresh ids; a vani
   expect(media.open(2)).toBe(0);
   expect(media.open(3)).toBeGreaterThan(0);
   expect(media.status()).toMatchObject({ trackId: 3, durationMs: 500 });
+  expect(media.artwork(0)).toBe("pending");
+  host.advance(1);
   expect(media.artwork(0)).toBeGreaterThan(0);
 });
diff --git a/tests/localmedia.test.ts b/tests/localmedia.test.ts
index d441ba61..2de4ac5e 100644
--- a/tests/localmedia.test.ts
+++ b/tests/localmedia.test.ts
@@ -4,7 +4,7 @@ import { POCKET_CAPABILITIES } from "../contracts/spec/platforms.ts";
 import { localMedia } from "../framework/src/localmedia.ts";
 import { resolve3dsBuildPlan } from "../tools/3ds-profile.ts";
 
-const STATUS: LocalStatus = { phase: "playing", trackId: 1, openSerial: 4, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, underruns: 0, error: "" };
+const STATUS: LocalStatus = { phase: "playing", trackId: 1, openSerial: 4, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, underruns: 0, error: "", decodeLoad: 12, artHandles: 1 };
 
 function recorder(over: Partial<LocalMediaOps> = {}) {
   const calls: string[] = [];
@@ -40,6 +40,16 @@ test("volume and seek are clamped before they cross; ids must be track ids", ()
   expect(() => media.artwork(-2)).toThrow("Invalid track id");
 });
 
+test("artwork -1 reads as pending; handles pass through", () => {
+  let next = -1;
+  const media = localMedia(recorder({ artwork: () => next }).ops);
+  expect(media.artwork(4)).toBe("pending");
+  next = 0;
+  expect(media.artwork(4)).toBe(0);
+  next = 9;
+  expect(media.artwork(4)).toBe(9);
+});
+
 test("artwork handle 0 means none and is never released", () => {
   const { calls, ops } = recorder();
   const media = localMedia(ops);
@@ -58,7 +68,9 @@ test("status and tracks are parsed and validated", () => {
   expect(validLocalStatus({ ...STATUS, trackId: -1 })).toBe(true);
   expect(validLocalStatus({ ...STATUS, openSerial: undefined })).toBe(false);
   expect(validLocalStatus({ ...STATUS, openSerial: -1 })).toBe(false);
-  expect(LOCALMEDIA).toEqual({ version: 1, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 });
+  expect(validLocalStatus({ ...STATUS, decodeLoad: undefined })).toBe(false);
+  expect(validLocalStatus({ ...STATUS, artHandles: -1 })).toBe(false);
+  expect(LOCALMEDIA).toEqual({ version: 2, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 });
 });
 
 test("media.local is a registered capability that the 3DS profile does not advertise yet", () => {
```

- [ ] **Step 2: Implement.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t1.patch`.

- [ ] **Step 3: Run.**
  - Run `cd runtime && bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts && npx --no-install tsc --noEmit -p . 2>&1 | grep -c localmedia`.
  - Expected: `15 pass, 0 fail`, then `0`.

- [ ] **Step 4: Commit in the fork.**

```bash
git -C runtime add contracts/spec/localmedia.ts framework/src/localmedia.ts hosts/sim/localmedia.ts tests/localmedia.test.ts tests/localmedia-sim.test.ts
git -C runtime commit -m "feat(localmedia): contract v2: artwork pending then ready, decodeLoad and artHandles, returning files keep their ids"
```

---

### Task 2: Vendored libraries, fixtures, the native test harness, and the id registry (fork)

**Files:**
- Create: `runtime/hosts/3ds/vendor/{minimp3.h, minimp3.LICENSE, stb_image.h, README.md}`.
- Create: `runtime/tests/fixtures/localmedia/make-fixtures.sh`, the generated fixtures (`*.mp3`, `cover-wide.jpg`, `cover-small.png`), `check.h` and `ids-test.c`.
- Create: `runtime/tests/localmedia-native.test.ts`.
- Create: `runtime/hosts/3ds/src/localmedia_ids.{h,c}`.

**Interfaces:**
- Produces:
  - `LmIds *lm_ids_create(void)`.
  - `void lm_ids_destroy(LmIds *)`.
  - `int lm_ids_get(LmIds *, const char *file)`: the file's id, assigned on first sight and never reused; -1 when out of memory.
  - The `run(harness, sources)` test helper, which compiles a harness under ASan/UBSan and runs it in the fixtures folder.

- [ ] **Step 1: Vendor the libraries at their pinned commits and verify them.**

```bash
V=runtime/hosts/3ds/vendor; mkdir -p $V
curl -fsSL -o $V/minimp3.h https://raw.githubusercontent.com/lieff/minimp3/ea99364f61c14656440e8d77e9c233ccf3124633/minimp3.h
curl -fsSL -o $V/minimp3.LICENSE https://raw.githubusercontent.com/lieff/minimp3/ea99364f61c14656440e8d77e9c233ccf3124633/LICENSE
curl -fsSL -o $V/stb_image.h https://raw.githubusercontent.com/nothings/stb/2c980bb59875b0d32144a71867fbdebb2f77cd20/stb_image.h
shasum -a 256 $V/minimp3.h $V/minimp3.LICENSE $V/stb_image.h
```
Expected:
```
57e437c5c1f0e8b243885d3929c8973b5e6c778451e0100ab4251d19915cb3ad  …/minimp3.h
6a1ee543e5282cd9061881edf462e6fdab181f328da71fc2c9a6950a80e94d01  …/minimp3.LICENSE
594c2fe35d49488b4382dbfaec8f98366defca819d916ac95becf3e75f4200b3  …/stb_image.h
```

Create `runtime/hosts/3ds/vendor/README.md`:

```markdown
# Vendored single-header libraries

Used by the `media.local` module (`hosts/3ds/src/localmedia_*.c`). Each file is
an unmodified copy at the commit listed; `shasum -a 256` must match.

| File | Source | Commit | SHA-256 | Licence |
|---|---|---|---|---|
| `minimp3.h` | https://github.com/lieff/minimp3 | `ea99364f61c14656440e8d77e9c233ccf3124633` | `57e437c5c1f0e8b243885d3929c8973b5e6c778451e0100ab4251d19915cb3ad` | CC0 1.0 (`minimp3.LICENSE`) |
| `minimp3.LICENSE` | same | same | `6a1ee543e5282cd9061881edf462e6fdab181f328da71fc2c9a6950a80e94d01` | — |
| `stb_image.h` | https://github.com/nothings/stb | `2c980bb59875b0d32144a71867fbdebb2f77cd20` | `594c2fe35d49488b4382dbfaec8f98366defca819d916ac95becf3e75f4200b3` | MIT or public domain (text at the end of the file) |

`localmedia_player.c` defines `MINIMP3_IMPLEMENTATION`, `MINIMP3_ONLY_MP3` and
`MINIMP3_NO_SIMD`; `localmedia_art.c` defines `STB_IMAGE_IMPLEMENTATION` with
`STBI_ONLY_JPEG`, `STBI_ONLY_PNG` and `STBI_NO_STDIO`.
```

- [ ] **Step 2: Generate the fixtures.** Create `runtime/tests/fixtures/localmedia/make-fixtures.sh`, run `chmod +x` on it, then run it:

```sh
#!/bin/sh
# Regenerates the media.local native-test fixtures. Needs ffmpeg and lame;
# the tests themselves read the committed outputs and need neither.
set -eu
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=1:sample_rate=44100" -ac 2 "$tmp/tone44.wav"
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=1:sample_rate=22050" -ac 1 "$tmp/tone22.wav"
lame --quiet --noreplaygain -b 128 "$tmp/tone44.wav" cbr-info.mp3
lame --quiet --noreplaygain -b 128 -t "$tmp/tone44.wav" cbr-plain.mp3
lame --quiet --noreplaygain -V 2 "$tmp/tone44.wav" vbr-xing.mp3
lame --quiet --noreplaygain -V 2 -t "$tmp/tone44.wav" vbr-plain.mp3
lame --quiet --noreplaygain -m m -b 64 "$tmp/tone22.wav" mono22.mp3
ffmpeg -v error -y -f lavfi -i "testsrc=size=96x64:rate=1" -frames:v 1 cover-wide.jpg
ffmpeg -v error -y -f lavfi -i "testsrc=size=40x40:rate=1" -frames:v 1 cover-small.png
lame --quiet --noreplaygain -b 128 --id3v2-only --tt "Café" --ta "Björk" --tl "Début" --tn "3/12" \
  --ti cover-wide.jpg "$tmp/tone44.wav" tagged-v23.mp3
ffmpeg -v error -y -i cbr-info.mp3 -i cover-small.png -map 0:a -map 1:v -c copy -id3v2_version 4 \
  -metadata title="Ünïcødé" -metadata artist="Sigur Rós" -metadata album="Ágætis byrjun" -metadata track="7" \
  -metadata:s:v comment="Cover (front)" tagged-v24.mp3
lame --quiet --noreplaygain -b 128 --id3v1-only --tt "Old Tag" --ta "V1 Artist" --tl "V1 Album" --tn 5 \
  "$tmp/tone44.wav" tagged-v1.mp3
```

Run: `runtime/tests/fixtures/localmedia/make-fixtures.sh && (cd runtime/tests/fixtures/localmedia && shasum -a 256 *.mp3 *.jpg *.png)`
Expected:
```
78820e7f83ffa943463a9191d4a819697f93eec8aa8ef7e45b60b7720a674af5  cbr-info.mp3
9433d4665e9d1b41d239043aaad45b7e31c0df5d4353f1469f20fd4ef821724c  cbr-plain.mp3
583efd17a74a450dc8bf7ab114a55b0d75dae0f3d452599d4727b76e69ed3bcb  mono22.mp3
fae049c0989f32e940b0f033fc699b3f7a46c7255e9f644d1b55214bd73bea7f  tagged-v1.mp3
4f1397f126d7a4d0ddd0b4a300f348bb691cc3ca83630c1a1b66f9549747398c  tagged-v23.mp3
de3067e7d79c1cd5bbb644b1e7a9a6f7a9b75e30f1c28f5b83df9cd8251e9207  tagged-v24.mp3
e82b0cc8d00341e1453217880e867b02498a0e2625c3843eeb292307d3707be5  vbr-plain.mp3
84558d27ce8ed75f72ae5f13bc5b48ea459471d2f7ce31661c5bf956a6dd5540  vbr-xing.mp3
74539ec9c51e25459f973ffaefbc2037ab389cd3e2d11b6df8f98e9ebdb429ae  cover-wide.jpg
f5480ad39eb6e7213edc79e0e37e3d2e664170f0b034be7572f5e5b61a338055  cover-small.png
```
Different encoder versions can change these bytes. If they differ, stop: the tags, mp3 and art tests assert exact offsets and durations taken from these files.

- [ ] **Step 3: Write the failing test.**

`runtime/tests/fixtures/localmedia/check.h`:

```c
/* Assertions for the media.local native tests: report the line and keep going. */
#ifndef LOCALMEDIA_CHECK_H
#define LOCALMEDIA_CHECK_H
#include <stdio.h>
#include <string.h>
static int check_failures;
#define CHECK(cond) do { if (!(cond)) { fprintf(stderr, "%s:%d: CHECK(%s) failed\n", __FILE__, __LINE__, #cond); check_failures++; } } while (0)
#define CHECK_INT(actual, expected) do { long long a_ = (long long)(actual), e_ = (long long)(expected); \
  if (a_ != e_) { fprintf(stderr, "%s:%d: %s == %lld, expected %lld\n", __FILE__, __LINE__, #actual, a_, e_); check_failures++; } } while (0)
#define CHECK_STR(actual, expected) do { const char *a_ = (actual), *e_ = (expected); \
  if (strcmp(a_, e_) != 0) { fprintf(stderr, "%s:%d: %s == \"%s\", expected \"%s\"\n", __FILE__, __LINE__, #actual, a_, e_); check_failures++; } } while (0)
#define CHECK_DONE(name) do { if (check_failures) { fprintf(stderr, "%d check(s) failed\n", check_failures); return 1; } printf("%s verified\n", name); return 0; } while (0)
#endif
```

`runtime/tests/fixtures/localmedia/ids-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_ids.h"
#include "check.h"

int main(void) {
  LmIds *ids = lm_ids_create();
  /* First scan: ids in order of first sight. */
  CHECK_INT(lm_ids_get(ids, "a.mp3"), 0);
  CHECK_INT(lm_ids_get(ids, "b.mp3"), 1);
  CHECK_INT(lm_ids_get(ids, "c.mp3"), 2);
  /* Second scan: b vanished, d is new; a and c keep theirs. */
  CHECK_INT(lm_ids_get(ids, "c.mp3"), 2);
  CHECK_INT(lm_ids_get(ids, "a.mp3"), 0);
  CHECK_INT(lm_ids_get(ids, "d.mp3"), 3);
  /* Third scan: b returns with its original id; nothing is reused. */
  CHECK_INT(lm_ids_get(ids, "b.mp3"), 1);
  CHECK_INT(lm_ids_get(ids, "e.mp3"), 4);
  /* Names differ by case are different files. */
  CHECK_INT(lm_ids_get(ids, "A.mp3"), 5);
  /* Growth keeps every id. */
  char name[32];
  for (int i = 0; i < 3000; i++) { snprintf(name, sizeof name, "track-%04d.mp3", i); CHECK_INT(lm_ids_get(ids, name), 6 + i); }
  for (int i = 2999; i >= 0; i--) { snprintf(name, sizeof name, "track-%04d.mp3", i); CHECK_INT(lm_ids_get(ids, name), 6 + i); }
  CHECK_INT(lm_ids_get(ids, "b.mp3"), 1);
  lm_ids_destroy(ids);
  CHECK_DONE("localmedia ids");
}
```

`runtime/tests/localmedia-native.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const FIXTURES = join(ROOT, "tests/fixtures/localmedia");
const SRC = join(ROOT, "hosts/3ds/src");
const scratch = mkdtempSync(join(tmpdir(), "pocket-localmedia-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Compiles a harness with the given media.local sources under ASan/UBSan and runs it from the fixtures folder. */
function run(harness: string, sources: string[]): string {
  const binary = join(scratch, harness.replace(/\.c$/, ""));
  const compile = Bun.spawnSync(["cc", "-std=c11", "-D_DEFAULT_SOURCE", "-O1", "-g", "-Wall", "-Wextra", "-fsanitize=address,undefined", "-fno-sanitize-recover=undefined",
    `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`, join(FIXTURES, harness), ...sources.map((s) => join(SRC, s)), "-o", binary]);
  if (compile.exitCode !== 0) throw new Error(`compile ${harness} failed:\n${compile.stderr.toString()}`);
  const result = Bun.spawnSync([binary], { cwd: FIXTURES, timeout: 60_000 });
  if (result.exitCode !== 0) throw new Error(`${harness} failed (exit ${result.exitCode}):\n${result.stderr.toString()}${result.stdout.toString()}`);
  return result.stdout.toString();
}

describe("media.local native units (host-compiled)", () => {
  test("ids stay with their files: kept, added, vanished, returning, never reused", () => {
    expect(run("ids-test.c", ["localmedia_ids.c"])).toContain("localmedia ids verified");
  }, 60_000);
});
```

- [ ] **Step 4: Run it.**
  - Run `cd runtime && bun test tests/localmedia-native.test.ts`.
  - Expected: FAIL, `compile ids-test.c failed: … 'localmedia_ids.h' file not found`.

- [ ] **Step 5: Implement.**

`runtime/hosts/3ds/src/localmedia_ids.h`:

```c
/*
 * media.local track ids: one id per file name for the life of the module.
 * A rescan keeps a listed file's id, a new file takes the next unused id,
 * and a file that returns after vanishing gets its original id back. The
 * registry never forgets a name, so an id never moves to a different file.
 *
 * Pure C: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_IDS_H
#define POCKETJS_LOCALMEDIA_IDS_H

typedef struct LmIds LmIds;

LmIds *lm_ids_create(void);
void lm_ids_destroy(LmIds *ids);
/* The file's id, assigning the next unused one on first sight; -1 when out of memory. */
int lm_ids_get(LmIds *ids, const char *file);

#endif
```

`runtime/hosts/3ds/src/localmedia_ids.c`:

```c
/* Open-addressed hash of file name -> id; see localmedia_ids.h. */
#include "localmedia_ids.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  char *name; /* NULL when the slot is empty */
  int id;
} LmIdSlot;

struct LmIds {
  LmIdSlot *slots;
  unsigned capacity; /* power of two */
  unsigned count;
};

static uint32_t name_hash(const char *name) {
  uint32_t hash = 2166136261u; /* FNV-1a */
  for (const unsigned char *p = (const unsigned char *)name; *p; p++) hash = (hash ^ *p) * 16777619u;
  return hash;
}

static LmIdSlot *find_slot(LmIdSlot *slots, unsigned capacity, const char *name) {
  unsigned at = name_hash(name) & (capacity - 1);
  while (slots[at].name && strcmp(slots[at].name, name) != 0) at = (at + 1) & (capacity - 1);
  return &slots[at];
}

static int grow(LmIds *ids) {
  unsigned capacity = ids->capacity ? ids->capacity * 2 : 64;
  LmIdSlot *slots = calloc(capacity, sizeof *slots);
  if (!slots) return 0;
  for (unsigned i = 0; i < ids->capacity; i++)
    if (ids->slots[i].name) *find_slot(slots, capacity, ids->slots[i].name) = ids->slots[i];
  free(ids->slots);
  ids->slots = slots;
  ids->capacity = capacity;
  return 1;
}

LmIds *lm_ids_create(void) {
  return calloc(1, sizeof(LmIds));
}

void lm_ids_destroy(LmIds *ids) {
  if (!ids) return;
  for (unsigned i = 0; i < ids->capacity; i++) free(ids->slots[i].name);
  free(ids->slots);
  free(ids);
}

int lm_ids_get(LmIds *ids, const char *file) {
  if ((ids->count + 1) * 2 > ids->capacity && !grow(ids)) return -1;
  LmIdSlot *slot = find_slot(ids->slots, ids->capacity, file);
  if (slot->name) return slot->id;
  size_t length = strlen(file) + 1;
  char *name = malloc(length);
  if (!name) return -1;
  memcpy(name, file, length);
  slot->name = name;
  slot->id = (int)ids->count++;
  return slot->id;
}
```

- [ ] **Step 6: Run.** `cd runtime && bun test tests/localmedia-native.test.ts`. Expected: `1 pass, 0 fail`.

- [ ] **Step 7: Commit in the fork.**

```bash
git -C runtime add hosts/3ds/vendor tests/fixtures/localmedia tests/localmedia-native.test.ts hosts/3ds/src/localmedia_ids.h hosts/3ds/src/localmedia_ids.c
git -C runtime commit -m "feat(localmedia): vendored minimp3 and stb_image, generated fixtures, and the per-file id registry"
```

---

### Task 3: ID3 tag reader (fork)

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_tags.{h,c}`.
- Create: `runtime/tests/fixtures/localmedia/tags-test.c`.
- Modify: `runtime/tests/localmedia-native.test.ts`.

**Interfaces:**
- Produces `LmTags`:
  - `title`, `artist` and `album` as `char[LM_FIELD_BYTES]`;
  - `track`;
  - `audio_start` and `audio_end`;
  - `has_art`, `art_offset`, `art_raw_bytes` and `art_unsync`.
- Produces `void lm_tags_read(FILE *, long file_size, LmTags *)`. It never fails; missing tags leave fields empty, and the caller applies the fallbacks.
- Produces `void lm_tags_text(int encoding, const uint8_t *, size_t, char out[LM_FIELD_BYTES])`.

- [ ] **Step 1: Write the failing test.** Create `runtime/tests/fixtures/localmedia/tags-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_tags.h"
#include "check.h"

#include <stdlib.h>

/* Builds tags in memory: frames are appended to a buffer, then written as one file. */
typedef struct { uint8_t bytes[65536]; size_t length; } Buf;

static void put(Buf *b, const void *data, size_t length) { memcpy(b->bytes + b->length, data, length); b->length += length; }
static void put_byte(Buf *b, uint8_t value) { b->bytes[b->length++] = value; }
static void put_be32(Buf *b, uint32_t v) { uint8_t x[4] = {v >> 24, v >> 16, v >> 8, v}; put(b, x, 4); }
static void put_syncsafe(Buf *b, uint32_t v) { uint8_t x[4] = {v >> 21 & 0x7f, v >> 14 & 0x7f, v >> 7 & 0x7f, v & 0x7f}; put(b, x, 4); }

/* A v2.3 (or v2.4 when syncsafe) frame. */
static void frame(Buf *b, const char *id, int v24, uint8_t format, const void *body, size_t length) {
  put(b, id, 4);
  if (v24) put_syncsafe(b, (uint32_t)length); else put_be32(b, (uint32_t)length);
  put_byte(b, 0); put_byte(b, format);
  put(b, body, length);
}

static void text_frame(Buf *b, const char *id, int v24, uint8_t encoding, const void *text, size_t length) {
  uint8_t body[1024];
  body[0] = encoding;
  memcpy(body + 1, text, length);
  frame(b, id, v24, 0, body, length + 1);
}

/* Wraps frames in a tag header and writes header + frames + audio (+ v1) to path. */
static void write_file(const char *path, int version, uint8_t flags, const Buf *frames, size_t padding, const uint8_t *v1) {
  FILE *f = fopen(path, "wb");
  uint8_t header[10] = {'I', 'D', '3', (uint8_t)version, 0, flags};
  uint32_t size = (uint32_t)(frames->length + padding);
  header[6] = size >> 21 & 0x7f; header[7] = size >> 14 & 0x7f; header[8] = size >> 7 & 0x7f; header[9] = size & 0x7f;
  fwrite(header, 1, 10, f);
  fwrite(frames->bytes, 1, frames->length, f);
  for (size_t i = 0; i < padding; i++) fputc(0, f);
  uint8_t audio[400];
  memset(audio, 0x55, sizeof audio);
  fwrite(audio, 1, sizeof audio, f);
  if (v1) fwrite(v1, 1, 128, f);
  fclose(f);
}

static void read_path(const char *path, LmTags *tags) {
  FILE *f = fopen(path, "rb");
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  lm_tags_read(f, size, tags);
  fclose(f);
}

static void v1_tag(uint8_t out[128], const char *title, const char *artist, const char *album, int track) {
  memset(out, 0, 128);
  memcpy(out, "TAG", 3);
  memcpy(out + 3, title, strlen(title));
  memcpy(out + 33, artist, strlen(artist));
  memcpy(out + 63, album, strlen(album));
  if (track) out[126] = (uint8_t)track;
}

int main(void) {
  char out[LM_FIELD_BYTES];
  LmTags t;
  const char *tmp = "tags-test.tmp";

  /* Encodings. */
  lm_tags_text(0, (const uint8_t *)"Caf\xe9\0junk", 9, out); CHECK_STR(out, "Caf\xc3\xa9");
  lm_tags_text(1, (const uint8_t *)"\xff\xfe" "B\0j\0\xf6\0r\0k\0\0\0", 14, out); CHECK_STR(out, "Bj\xc3\xb6rk");
  lm_tags_text(1, (const uint8_t *)"\xfe\xff\0S\0i", 6, out); CHECK_STR(out, "Si");
  lm_tags_text(2, (const uint8_t *)"\0R\0\xf3\0s", 6, out); CHECK_STR(out, "R\xc3\xb3s");
  lm_tags_text(1, (const uint8_t *)"\xff\xfe\x3c\xd8\x35\xdf", 6, out); CHECK_STR(out, "\xf0\x9f\x8c\xb5"); /* surrogate pair */
  lm_tags_text(3, (const uint8_t *)"  D\xc3\xa9" "but  ", 9, out); CHECK_STR(out, "D\xc3\xa9" "but");
  lm_tags_text(3, (const uint8_t *)"a\xff" "b\xc3", 4, out); CHECK_STR(out, "a?b?"); /* invalid and truncated UTF-8 */
  lm_tags_text(3, (const uint8_t *)"a\nb", 3, out); CHECK_STR(out, "a b"); /* control characters become spaces */
  lm_tags_text(3, (const uint8_t *)"one\0two", 7, out); CHECK_STR(out, "one"); /* v2.4 lists: first value */
  /* 255-byte cap on a code-point boundary: 200 ASCII + 30 two-byte letters = 260 bytes. */
  uint8_t long_text[260];
  memset(long_text, 'x', 200);
  for (int i = 0; i < 30; i++) { long_text[200 + i * 2] = 0xc3; long_text[201 + i * 2] = 0xa9; }
  lm_tags_text(3, long_text, sizeof long_text, out);
  CHECK_INT(strlen(out), 254);
  CHECK(((uint8_t)out[253] & 0xc0) == 0x80 && (uint8_t)out[252] == 0xc3);

  /* v2.3 with padding, track "3/12", v1 filling the album. */
  {
    Buf b = {0};
    text_frame(&b, "TIT2", 0, 0, "Song", 4);
    text_frame(&b, "TPE1", 0, 1, "\xff\xfe" "A\0b\0", 6);
    text_frame(&b, "TRCK", 0, 0, "3/12", 4);
    text_frame(&b, "TXXX", 0, 0, "ignored", 7);
    uint8_t v1[128];
    v1_tag(v1, "V1 Title", "V1 Artist", "V1 Album", 9);
    write_file(tmp, 3, 0, &b, 100, v1);
    read_path(tmp, &t);
    CHECK_STR(t.title, "Song"); CHECK_STR(t.artist, "Ab"); CHECK_STR(t.album, "V1 Album");
    CHECK_INT(t.track, 3);
    CHECK_INT(t.audio_start, 10 + b.length + 100);
    CHECK_INT(t.audio_end, 10 + b.length + 100 + 400);
    CHECK(!t.has_art);
  }

  /* v2.4 UTF-8, syncsafe sizes, a footer, frame-level unsync and a data-length indicator. */
  {
    Buf b = {0};
    text_frame(&b, "TIT2", 1, 3, "\xc3\x9cn", 3);
    uint8_t unsynced[] = {3, 'A', 0xff, 0x00, 'B'}; /* "A\xffB" stuffed: invalid UTF-8 byte -> '?' */
    frame(&b, "TPE1", 1, 0x02, unsynced, sizeof unsynced);
    uint8_t dli[] = {0, 0, 0, 4, 3, 'A', 'l', 'b'};
    frame(&b, "TALB", 1, 0x01, dli, sizeof dli);
    write_file(tmp, 4, 0x10, &b, 0, NULL);
    read_path(tmp, &t);
    CHECK_STR(t.title, "\xc3\x9cn"); CHECK_STR(t.artist, "A?B"); CHECK_STR(t.album, "Alb");
    CHECK_INT(t.audio_start, 10 + b.length + 10);
  }

  /* v2.3 extended header, a grouped frame, a compressed frame skipped, non-numeric track. */
  {
    Buf b = {0};
    put_be32(&b, 6); put_byte(&b, 0); put_byte(&b, 0); put_be32(&b, 0); /* extended header: size 6 + 6 bytes */
    uint8_t grouped[] = {7, 0, 'G', 'r', 'p'};
    frame(&b, "TIT2", 0, 0x20, grouped, sizeof grouped);
    uint8_t zipped[] = {0, 0, 0, 9, 0x78, 0x9c};
    frame(&b, "TPE1", 0, 0x80, zipped, sizeof zipped);
    text_frame(&b, "TRCK", 0, 0, "A side", 6);
    write_file(tmp, 3, 0x40, &b, 0, NULL);
    read_path(tmp, &t);
    CHECK_STR(t.title, "Grp"); CHECK_STR(t.artist, ""); CHECK_INT(t.track, 0);
  }

  /* v2.3 tag-level unsync: text and the picture's raw offset. */
  {
    Buf b = {0};
    uint8_t title[] = {0, 'X', 0xff, 0x00, 'Y'}; /* Latin-1 "X\xffY" -> "XÿY" */
    put(&b, "TIT2", 4); put_be32(&b, 4); put_byte(&b, 0); put_byte(&b, 0); put(&b, title, sizeof title);
    uint8_t pic[] = {0, 'i', 'm', 'a', 'g', 'e', '/', 'p', 'n', 'g', 0, 3, 'd', 0, 0x89, 'P', 0xff, 0x00, 0xe0, 'N'};
    put(&b, "APIC", 4); put_be32(&b, 19); put_byte(&b, 0); put_byte(&b, 0); put(&b, pic, sizeof pic);
    write_file(tmp, 3, 0x80, &b, 0, NULL);
    read_path(tmp, &t);
    CHECK_STR(t.title, "X\xc3\xbfY");
    CHECK(t.has_art);
    CHECK_INT(t.art_offset, 10 + 10 + sizeof title + 10 + 14);
    CHECK(t.art_unsync);
    CHECK_INT(t.art_raw_bytes, 10 + b.length - t.art_offset);
  }

  /* Front cover wins over an earlier picture; v2.2 PIC. */
  {
    Buf b = {0};
    uint8_t other[] = {0, 'i', 'm', 'a', 'g', 'e', '/', 'j', 'p', 'e', 'g', 0, 0, 0, 1, 2, 3};
    frame(&b, "APIC", 0, 0, other, sizeof other);
    size_t front_at = b.length;
    uint8_t front[] = {1, 'i', 'm', 'a', 'g', 'e', '/', 'j', 'p', 'e', 'g', 0, 3, 'd', 0, 0, 0, 9, 9, 9, 9};
    frame(&b, "APIC", 0, 0, front, sizeof front);
    write_file(tmp, 3, 0, &b, 0, NULL);
    read_path(tmp, &t);
    CHECK(t.has_art);
    CHECK_INT(t.art_offset, 10 + front_at + 10 + 17);
    CHECK_INT(t.art_raw_bytes, 4);
    CHECK(!t.art_unsync);

    Buf c = {0};
    uint8_t tt2[] = {'T', 'T', '2', 0, 0, 4, 0, 'O', 'l', 'd'};
    put(&c, tt2, sizeof tt2);
    uint8_t pic[] = {'P', 'I', 'C', 0, 0, 9, 0, 'P', 'N', 'G', 3, 0, 0x89, 'P', 'N'};
    put(&c, pic, sizeof pic);
    write_file(tmp, 2, 0, &c, 0, NULL);
    read_path(tmp, &t);
    CHECK_STR(t.title, "Old");
    CHECK(t.has_art);
    CHECK_INT(t.art_offset, 10 + sizeof tt2 + 6 + 6);
    CHECK_INT(t.art_raw_bytes, 3);
  }

  /* Broken tags never read out of bounds: size past EOF, frame past tag, garbage ids, empty file. */
  {
    Buf b = {0};
    text_frame(&b, "TIT2", 0, 0, "Kept", 4);
    put(&b, "TPE1", 4); put_be32(&b, 100000); put_byte(&b, 0); put_byte(&b, 0); put(&b, "\0Lost", 5);
    write_file(tmp, 3, 0, &b, 0, NULL);
    read_path(tmp, &t);
    CHECK_STR(t.title, "Kept"); CHECK_STR(t.artist, "");

    FILE *f = fopen(tmp, "wb");
    uint8_t huge[] = {'I', 'D', '3', 3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f, 'T', 'I', 'T', '2', 0, 0, 0, 3, 0, 0, 0, 'h', 'i'};
    fwrite(huge, 1, sizeof huge, f);
    fclose(f);
    read_path(tmp, &t);
    CHECK_STR(t.title, "hi"); CHECK_INT(t.audio_start, sizeof huge);

    Buf g = {0};
    put(&g, "ti\x01t", 4); put_be32(&g, 2); put_byte(&g, 0); put_byte(&g, 0); put(&g, "\0x", 2);
    write_file(tmp, 3, 0, &g, 0, NULL);
    read_path(tmp, &t);
    CHECK_STR(t.title, "");

    f = fopen(tmp, "wb");
    fclose(f);
    read_path(tmp, &t);
    CHECK_INT(t.audio_start, 0); CHECK_INT(t.audio_end, 0); CHECK_STR(t.title, "");

    /* Random bytes. */
    srand(7);
    for (int round = 0; round < 200; round++) {
      f = fopen(tmp, "wb");
      uint8_t junk[600];
      for (size_t i = 0; i < sizeof junk; i++) junk[i] = (uint8_t)rand();
      if (round % 2) memcpy(junk, "ID3\x03\0\0\0\0\x04\0TIT2", 14);
      fwrite(junk, 1, (size_t)(rand() % 600), f);
      fclose(f);
      read_path(tmp, &t);
      CHECK(strlen(t.title) < LM_FIELD_BYTES);
    }
  }
  remove(tmp);

  /* Encoder-written fixtures. */
  read_path("tagged-v23.mp3", &t);
  CHECK_STR(t.title, "Caf\xc3\xa9"); CHECK_STR(t.artist, "Bj\xc3\xb6rk"); CHECK_STR(t.album, "D\xc3\xa9" "but");
  CHECK_INT(t.track, 3);
  CHECK(t.has_art && !t.art_unsync && t.art_raw_bytes == 2592);
  read_path("tagged-v24.mp3", &t);
  CHECK_STR(t.title, "\xc3\x9cn\xc3\xaf" "c\xc3\xb8" "d\xc3\xa9"); CHECK_STR(t.artist, "Sigur R\xc3\xb3s");
  CHECK_INT(t.track, 7);
  CHECK(t.has_art && t.art_raw_bytes == 379);
  read_path("tagged-v1.mp3", &t);
  CHECK_STR(t.title, "Old Tag"); CHECK_STR(t.artist, "V1 Artist"); CHECK_STR(t.album, "V1 Album");
  CHECK_INT(t.track, 5); CHECK_INT(t.audio_start, 0);
  read_path("cbr-plain.mp3", &t);
  CHECK_STR(t.title, ""); CHECK(!t.has_art);
  CHECK_DONE("localmedia tags");
}
```

Apply to `runtime/tests/localmedia-native.test.ts`:

```diff
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index 89e90d56..9a3cf679 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -24,4 +24,8 @@ describe("media.local native units (host-compiled)", () => {
   test("ids stay with their files: kept, added, vanished, returning, never reused", () => {
     expect(run("ids-test.c", ["localmedia_ids.c"])).toContain("localmedia ids verified");
   }, 60_000);
+
+  test("tags: v2.2/2.3/2.4 fields, encodings, unsync, pictures, v1 fallback, broken input", () => {
+    expect(run("tags-test.c", ["localmedia_tags.c"])).toContain("localmedia tags verified");
+  }, 60_000);
 });
```

- [ ] **Step 2: Run it.**
  - Run `cd runtime && bun test tests/localmedia-native.test.ts`.
  - Expected: `1 pass, 1 fail` (`compile tags-test.c failed`).

- [ ] **Step 3: Implement.**

`runtime/hosts/3ds/src/localmedia_tags.h`:

```c
/*
 * media.local tag reader: ID3v2.2/2.3/2.4 and ID3v1 text fields as UTF-8,
 * the track number, and where the embedded picture lives in the file. The
 * picture bytes are skipped, never read: lm_art_read fetches them on demand.
 *
 * Pure C over stdio: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_TAGS_H
#define POCKETJS_LOCALMEDIA_TAGS_H

#include <stdint.h>
#include <stdio.h>

/* 255 UTF-8 bytes plus the terminator; longer text is cut on a code-point boundary. */
#define LM_FIELD_BYTES 256

typedef struct {
  char title[LM_FIELD_BYTES];
  char artist[LM_FIELD_BYTES];
  char album[LM_FIELD_BYTES];
  int track;            /* 0 when unknown */
  long audio_start;     /* first byte after the ID3v2 tag (0 without one) */
  long audio_end;       /* file size, less a trailing ID3v1 tag */
  int has_art;
  long art_offset;      /* file offset of the picture data */
  long art_raw_bytes;   /* bytes to read from art_offset (before undoing unsynchronisation) */
  int art_unsync;       /* the picture bytes are unsynchronised */
} LmTags;

/* Reads the tags of an open file of file_size bytes. Missing or broken tags leave
 * fields empty; the caller applies the fallbacks. Never fails. */
void lm_tags_read(FILE *file, long file_size, LmTags *out);

/* Converts text in an ID3 encoding (0 Latin-1, 1 UTF-16 with BOM, 2 UTF-16BE, 3 UTF-8)
 * to trimmed UTF-8 in out (LM_FIELD_BYTES), stopping at the first terminator. */
void lm_tags_text(int encoding, const uint8_t *bytes, size_t length, char out[LM_FIELD_BYTES]);

#endif
```

`runtime/hosts/3ds/src/localmedia_tags.c`:

```c
/* ID3v2 + ID3v1 reader; see localmedia_tags.h. */
#include "localmedia_tags.h"

#include <string.h>

/* Text frames longer than this are read only this far (the field cap is 255 bytes). */
#define TEXT_READ_MAX 2048
/* APIC/PIC header bytes read to find the start of the picture data. */
#define PICTURE_HEADER_MAX 1024

/* ---------------------------------------------------------------------------
 * Text conversion
 * ------------------------------------------------------------------------ */

typedef struct {
  char *out;
  size_t used;
} Utf8Out;

/* Appends one code point, dropping it (and everything after) once the field is full. */
static int put_code_point(Utf8Out *u, uint32_t cp) {
  char bytes[4];
  size_t n;
  if (cp < 0x20 && cp != '\t') cp = ' ';
  if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) cp = '?';
  if (cp < 0x80) { bytes[0] = (char)cp; n = 1; }
  else if (cp < 0x800) { bytes[0] = (char)(0xc0 | cp >> 6); bytes[1] = (char)(0x80 | (cp & 0x3f)); n = 2; }
  else if (cp < 0x10000) { bytes[0] = (char)(0xe0 | cp >> 12); bytes[1] = (char)(0x80 | (cp >> 6 & 0x3f)); bytes[2] = (char)(0x80 | (cp & 0x3f)); n = 3; }
  else { bytes[0] = (char)(0xf0 | cp >> 18); bytes[1] = (char)(0x80 | (cp >> 12 & 0x3f)); bytes[2] = (char)(0x80 | (cp >> 6 & 0x3f)); bytes[3] = (char)(0x80 | (cp & 0x3f)); n = 4; }
  if (u->used + n > LM_FIELD_BYTES - 1) return 0;
  memcpy(u->out + u->used, bytes, n);
  u->used += n;
  return 1;
}

/* Decodes one UTF-8 sequence at bytes[*at]; invalid input yields '?' and advances one byte. */
static uint32_t next_utf8(const uint8_t *bytes, size_t length, size_t *at) {
  uint8_t lead = bytes[*at];
  size_t need = lead < 0x80 ? 0 : (lead & 0xe0) == 0xc0 ? 1 : (lead & 0xf0) == 0xe0 ? 2 : (lead & 0xf8) == 0xf0 ? 3 : 4;
  if (need == 0) { (*at)++; return lead; }
  if (need == 4 || *at + need >= length) { (*at)++; return '?'; }
  uint32_t cp = lead & (0x3f >> need);
  for (size_t i = 1; i <= need; i++) {
    uint8_t b = bytes[*at + i];
    if ((b & 0xc0) != 0x80) { (*at)++; return '?'; }
    cp = cp << 6 | (b & 0x3f);
  }
  static const uint32_t min[] = {0, 0x80, 0x800, 0x10000};
  *at += need + 1;
  return cp < min[need] ? '?' : cp;
}

void lm_tags_text(int encoding, const uint8_t *bytes, size_t length, char out[LM_FIELD_BYTES]) {
  Utf8Out u = {out, 0};
  if (encoding == 1 || encoding == 2) {
    int big = encoding == 2;
    size_t at = 0;
    if (encoding == 1 && length >= 2) {
      if (bytes[0] == 0xff && bytes[1] == 0xfe) { big = 0; at = 2; }
      else if (bytes[0] == 0xfe && bytes[1] == 0xff) { big = 1; at = 2; }
    }
    while (at + 1 < length) {
      uint32_t unit = big ? (uint32_t)bytes[at] << 8 | bytes[at + 1] : (uint32_t)bytes[at + 1] << 8 | bytes[at];
      at += 2;
      if (unit == 0) break;
      if (unit >= 0xd800 && unit <= 0xdbff && at + 1 < length) {
        uint32_t low = big ? (uint32_t)bytes[at] << 8 | bytes[at + 1] : (uint32_t)bytes[at + 1] << 8 | bytes[at];
        if (low >= 0xdc00 && low <= 0xdfff) { unit = 0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00); at += 2; }
      }
      if (!put_code_point(&u, unit)) break;
    }
  } else {
    size_t at = 0;
    while (at < length && bytes[at] != 0) {
      uint32_t cp = encoding == 3 ? next_utf8(bytes, length, &at) : bytes[at++];
      if (!put_code_point(&u, cp)) break;
    }
  }
  /* Trim ASCII whitespace at both ends. */
  size_t start = 0, end = u.used;
  while (start < end && (out[start] == ' ' || out[start] == '\t')) start++;
  while (end > start && (out[end - 1] == ' ' || out[end - 1] == '\t')) end--;
  memmove(out, out + start, end - start);
  out[end - start] = '\0';
}

/* ---------------------------------------------------------------------------
 * A byte reader over the tag body that can undo unsynchronisation
 * ------------------------------------------------------------------------ */

typedef struct {
  FILE *file;
  long end;     /* raw offset where the tag body ends */
  int unsync;   /* tag-level unsynchronisation: FF 00 reads as FF */
  int failed;
} Reader;

static long reader_pos(Reader *r) { return ftell(r->file); }

static int reader_byte(Reader *r) {
  if (r->failed || ftell(r->file) >= r->end) { r->failed = 1; return -1; }
  int c = fgetc(r->file);
  if (c == EOF) { r->failed = 1; return -1; }
  /* Swallow the 00 after FF now, so the position never sits on a stuffed byte. */
  if (r->unsync && c == 0xff && ftell(r->file) < r->end) {
    int next = fgetc(r->file);
    if (next != 0 && next != EOF) ungetc(next, r->file);
  }
  return c;
}

static size_t reader_read(Reader *r, uint8_t *out, size_t length) {
  if (!r->unsync) {
    long left = r->end - ftell(r->file);
    if (left <= 0) { r->failed = 1; return 0; }
    size_t take = length < (size_t)left ? length : (size_t)left;
    size_t got = fread(out, 1, take, r->file);
    if (got < length) r->failed = 1;
    return got;
  }
  size_t got = 0;
  while (got < length) {
    int c = reader_byte(r);
    if (c < 0) break;
    out[got++] = (uint8_t)c;
  }
  return got;
}

static void reader_skip(Reader *r, long length) {
  if (!r->unsync) {
    long target = ftell(r->file) + length;
    if (length < 0 || target > r->end) { r->failed = 1; fseek(r->file, r->end, SEEK_SET); return; }
    fseek(r->file, target, SEEK_SET);
    return;
  }
  while (length-- > 0 && reader_byte(r) >= 0) {}
}

/* Undoes unsynchronisation in place; returns the new length. */
static size_t unsync_buffer(uint8_t *bytes, size_t length) {
  size_t out = 0;
  for (size_t i = 0; i < length; i++) {
    bytes[out++] = bytes[i];
    if (bytes[i] == 0xff && i + 1 < length && bytes[i + 1] == 0) i++;
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * ID3v2
 * ------------------------------------------------------------------------ */

static uint32_t syncsafe(const uint8_t b[4]) {
  return (uint32_t)(b[0] & 0x7f) << 21 | (uint32_t)(b[1] & 0x7f) << 14 | (uint32_t)(b[2] & 0x7f) << 7 | (b[3] & 0x7f);
}

static uint32_t be32(const uint8_t b[4]) {
  return (uint32_t)b[0] << 24 | (uint32_t)b[1] << 16 | (uint32_t)b[2] << 8 | b[3];
}

static int parse_track(const char *text) {
  int value = 0, digits = 0;
  while (*text >= '0' && *text <= '9' && digits < 6) { value = value * 10 + (*text++ - '0'); digits++; }
  return digits ? value : 0;
}

/* Which field a frame id fills: 1 title, 2 artist, 3 album, 4 track, 5 picture, 0 none. */
static int frame_kind(const char *id, int v22) {
  static const char *const v22_ids[] = {"TT2", "TP1", "TAL", "TRK", "PIC"};
  static const char *const v23_ids[] = {"TIT2", "TPE1", "TALB", "TRCK", "APIC"};
  for (int i = 0; i < 5; i++)
    if (strcmp(id, v22 ? v22_ids[i] : v23_ids[i]) == 0) return i + 1;
  return 0;
}

/* Length of a terminated string in the given encoding, including its terminator. */
static size_t terminated_length(int encoding, const uint8_t *bytes, size_t length) {
  if (encoding == 1 || encoding == 2) {
    for (size_t i = 0; i + 1 < length; i += 2)
      if (bytes[i] == 0 && bytes[i + 1] == 0) return i + 2;
    return length;
  }
  for (size_t i = 0; i < length; i++)
    if (bytes[i] == 0) return i + 1;
  return length;
}

typedef struct {
  long offset;
  long raw_bytes;
  int unsync;
  int front;
} Picture;

/* Reads a picture frame's header from body (length bytes, already de-unsynchronised when
 * frame_unsync) and reports where its data starts relative to the frame body. Returns
 * the header length, 0 when the header does not fit. */
static size_t picture_header(const uint8_t *body, size_t length, int v22, int *type) {
  if (length < (v22 ? 5u : 4u)) return 0;
  int encoding = body[0];
  size_t at = 1;
  if (v22) at += 3; /* "JPG" / "PNG" */
  else {
    size_t mime = terminated_length(0, body + at, length - at);
    at += mime;
  }
  if (at >= length) return 0;
  *type = body[at++];
  if (at > length) return 0;
  at += terminated_length(encoding, body + at, length - at);
  return at < length ? at : 0;
}

static void read_v2(FILE *file, long file_size, LmTags *out) {
  uint8_t header[10];
  if (fseek(file, 0, SEEK_SET) != 0 || fread(header, 1, 10, file) != 10) return;
  if (memcmp(header, "ID3", 3) != 0 || header[3] < 2 || header[3] > 4 || header[4] == 0xff) return;
  int version = header[3], flags = header[5];
  long size = (long)syncsafe(header + 6);
  long end = 10 + size;
  out->audio_start = end + ((version == 4 && (flags & 0x10)) ? 10 : 0);
  if (out->audio_start > file_size) out->audio_start = file_size;
  if (end > file_size) end = file_size;
  int v22 = version == 2;
  Reader r = {file, end, (flags & 0x80) != 0 && version < 4, 0};
  if (v22 && (flags & 0x40)) return; /* v2.2 compression: undefined scheme */
  if (!v22 && (flags & 0x40)) {
    uint8_t ext[4];
    if (reader_read(&r, ext, 4) != 4) return;
    long ext_size = version == 4 ? (long)syncsafe(ext) - 4 : (long)be32(ext);
    reader_skip(&r, ext_size);
  }
  Picture picture = {0, 0, 0, 0};
  int have_picture = 0;
  size_t id_len = v22 ? 3 : 4, head_len = v22 ? 6 : 10;
  while (!r.failed) {
    uint8_t fh[10];
    if (reader_pos(&r) + (long)head_len > end) break;
    if (reader_read(&r, fh, head_len) != head_len || fh[0] == 0) break; /* padding */
    char id[5] = {0};
    memcpy(id, fh, id_len);
    for (size_t i = 0; i < id_len; i++)
      if (!((id[i] >= 'A' && id[i] <= 'Z') || (id[i] >= '0' && id[i] <= '9'))) return;
    long frame_size = v22 ? (long)fh[3] << 16 | (long)fh[4] << 8 | fh[5] : version == 4 ? (long)syncsafe(fh + 4) : (long)be32(fh + 4);
    int format = v22 ? 0 : fh[9];
    if (frame_size <= 0 || reader_pos(&r) + frame_size > end) break;
    int kind = frame_kind(id, v22);
    /* Frame-format flags. v2.3: compression 0x80, encryption 0x40, grouping 0x20.
     * v2.4: grouping 0x40, compression 0x08, encryption 0x04, unsync 0x02, data length 0x01. */
    int compressed = version == 3 ? (format & 0xc0) != 0 : version == 4 ? (format & 0x0c) != 0 : 0;
    long extra = 0;
    if (version == 3 && (format & 0x20)) extra += 1;
    if (version == 4 && (format & 0x40)) extra += 1;
    if (version == 4 && (format & 0x01)) extra += 4;
    int frame_unsync = version == 4 && (format & 0x02);
    if (kind == 0 || compressed || extra >= frame_size) { reader_skip(&r, frame_size); continue; }
    reader_skip(&r, extra);
    long body_size = frame_size - extra;
    if (kind == 5) {
      uint8_t body[PICTURE_HEADER_MAX];
      long frame_start = reader_pos(&r);
      size_t take = body_size < PICTURE_HEADER_MAX ? (size_t)body_size : PICTURE_HEADER_MAX;
      size_t got = reader_read(&r, body, take);
      int type = 0;
      size_t header_len;
      if (frame_unsync) {
        /* Find the header end in de-unsynchronised bytes, then map back to raw bytes. */
        uint8_t copy[PICTURE_HEADER_MAX];
        memcpy(copy, body, got);
        size_t clean = unsync_buffer(copy, got);
        header_len = picture_header(copy, clean, v22, &type);
        size_t raw = 0, produced = 0;
        while (produced < header_len && raw < got) {
          if (body[raw] == 0xff && raw + 1 < got && body[raw + 1] == 0) raw++;
          raw++;
          produced++;
        }
        header_len = header_len ? raw : 0;
      } else {
        header_len = picture_header(body, got, v22, &type);
      }
      if (header_len && (!have_picture || (type == 3 && !picture.front))) {
        if (r.unsync) {
          /* Tag-level unsync: the reader consumed raw bytes; re-read to find the raw data offset. */
          fseek(file, frame_start, SEEK_SET);
          uint8_t skip[PICTURE_HEADER_MAX];
          reader_read(&r, skip, header_len);
          picture.offset = reader_pos(&r);
          picture.raw_bytes = end - picture.offset;
          picture.unsync = 1;
        } else {
          picture.offset = frame_start + (long)header_len;
          picture.raw_bytes = body_size - (long)header_len;
          picture.unsync = frame_unsync;
        }
        picture.front = type == 3;
        have_picture = picture.raw_bytes > 0;
      }
      if (r.unsync) {
        fseek(file, frame_start, SEEK_SET);
        r.failed = 0;
        reader_skip(&r, body_size);
      } else {
        fseek(file, frame_start + body_size, SEEK_SET);
      }
      continue;
    }
    uint8_t text[TEXT_READ_MAX];
    size_t take = body_size < TEXT_READ_MAX ? (size_t)body_size : TEXT_READ_MAX;
    size_t got = reader_read(&r, text, take);
    if ((long)take < body_size) reader_skip(&r, body_size - (long)take);
    if (got < 1) continue;
    if (frame_unsync) got = unsync_buffer(text, got);
    char value[LM_FIELD_BYTES];
    lm_tags_text(text[0], text + 1, got - 1, value);
    if (!value[0]) continue;
    char *field = kind == 1 ? out->title : kind == 2 ? out->artist : kind == 3 ? out->album : NULL;
    if (field) memcpy(field, value, LM_FIELD_BYTES);
    else out->track = parse_track(value);
  }
  if (have_picture) {
    out->has_art = 1;
    out->art_offset = picture.offset;
    out->art_raw_bytes = picture.raw_bytes;
    out->art_unsync = picture.unsync;
  }
}

/* ---------------------------------------------------------------------------
 * ID3v1
 * ------------------------------------------------------------------------ */

static void read_v1(FILE *file, long file_size, LmTags *out) {
  uint8_t tag[128];
  if (file_size < 128 + out->audio_start) return;
  if (fseek(file, file_size - 128, SEEK_SET) != 0 || fread(tag, 1, 128, file) != 128) return;
  if (memcmp(tag, "TAG", 3) != 0) return;
  out->audio_end = file_size - 128;
  char value[LM_FIELD_BYTES];
  if (!out->title[0]) { lm_tags_text(0, tag + 3, 30, value); memcpy(out->title, value, sizeof value); }
  if (!out->artist[0]) { lm_tags_text(0, tag + 33, 30, value); memcpy(out->artist, value, sizeof value); }
  if (!out->album[0]) { lm_tags_text(0, tag + 63, 30, value); memcpy(out->album, value, sizeof value); }
  if (!out->track && tag[125] == 0 && tag[126] != 0) out->track = tag[126];
}

void lm_tags_read(FILE *file, long file_size, LmTags *out) {
  memset(out, 0, sizeof *out);
  out->audio_end = file_size;
  read_v2(file, file_size, out);
  read_v1(file, file_size, out);
}
```

- [ ] **Step 4: Run.** `cd runtime && bun test tests/localmedia-native.test.ts`. Expected: `2 pass, 0 fail`.

- [ ] **Step 5: Commit in the fork.**

```bash
git -C runtime add hosts/3ds/src/localmedia_tags.h hosts/3ds/src/localmedia_tags.c tests/fixtures/localmedia/tags-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): ID3v2.2-2.4 and ID3v1 tag reader"
```

---

### Task 4: MP3 frames, durations and seek offsets (fork)

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_mp3.{h,c}`.
- Create: `runtime/tests/fixtures/localmedia/mp3-test.c`.
- Modify: `runtime/tests/localmedia-native.test.ts`.

**Interfaces:**
- Produces `LmFrame`: `mpeg`, `bitrate_kbps`, `sample_rate`, `channels`, `samples` and `bytes`.
- Produces `LmStream`:
  - `first`;
  - `data_start` and `data_end`;
  - `duration_ms` and `exact`;
  - `has_toc`, `toc[100]`, `toc_bytes` and `toc_base`.
- Produces `int lm_frame_parse(const uint8_t[4], LmFrame *)`.
- Produces `int lm_stream_probe(FILE *, long start, long end, LmStream *)`.
- Produces `long lm_stream_seek_offset(const LmStream *, uint32_t ms)`.
- Produces `long lm_stream_resync(FILE *, long from, long end, const LmFrame *ref)`, which returns -1 when no frame is found.

- [ ] **Step 1: Write the failing test.** Create `runtime/tests/fixtures/localmedia/mp3-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_mp3.h"
#include "check.h"

static long file_size(FILE *f) { fseek(f, 0, SEEK_END); return ftell(f); }

static LmStream probe(const char *path) {
  LmStream s;
  FILE *f = fopen(path, "rb");
  long size = file_size(f);
  CHECK(lm_stream_probe(f, 0, size, &s));
  fclose(f);
  return s;
}

/* Writes n CBR MPEG-1 128 kbps 44.1 kHz frames (417 bytes, no padding) after `lead` junk
 * bytes; with false_sync, the junk holds a valid-looking header at byte 10. */
static void write_cbr(const char *path, int lead, int n, int false_sync) {
  FILE *f = fopen(path, "wb");
  uint8_t junk[1024];
  memset(junk, 0x11, sizeof junk);
  if (false_sync) { junk[10] = 0xff; junk[11] = 0xfb; junk[12] = 0x90; junk[13] = 0x64; }
  fwrite(junk, 1, (size_t)lead, f);
  uint8_t frame[417] = {0xff, 0xfb, 0x90, 0x64};
  for (int i = 4; i < 417; i++) frame[i] = 0x22;
  for (int i = 0; i < n; i++) fwrite(frame, 1, sizeof frame, f);
  fclose(f);
}

int main(void) {
  LmFrame f;
  /* Every MPEG version x sample rate x bitrate entry. */
  static const int rates[3][3] = {{44100, 48000, 32000}, {22050, 24000, 16000}, {11025, 12000, 8000}};
  static const int kbps[2][14] = {{32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320},
                                  {8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}};
  static const int version_bits[3] = {3, 2, 0};
  for (int v = 0; v < 3; v++)
    for (int r = 0; r < 3; r++)
      for (int b = 1; b <= 14; b++)
        for (int pad = 0; pad <= 1; pad++) {
          uint8_t h[4] = {0xff, (uint8_t)(0xe0 | version_bits[v] << 3 | 1 << 1 | 1), (uint8_t)(b << 4 | r << 2 | pad << 1), 0x44};
          CHECK(lm_frame_parse(h, &f));
          int rate = rates[v][r], bitrate = kbps[v ? 1 : 0][b - 1];
          CHECK_INT(f.sample_rate, rate);
          CHECK_INT(f.bitrate_kbps, bitrate);
          CHECK_INT(f.samples, v == 0 ? 1152 : 576);
          CHECK_INT(f.bytes, (v == 0 ? 144 : 72) * bitrate * 1000 / rate + pad);
          CHECK_INT(f.mpeg, v == 0 ? 1 : v == 1 ? 2 : 25);
          CHECK_INT(f.channels, 2);
        }
  uint8_t mono[4] = {0xff, 0xfb, 0x90, 0xc4};
  CHECK(lm_frame_parse(mono, &f) && f.channels == 1 && f.bytes == 417);
  uint8_t bad[][4] = {
    {0xff, 0xfb, 0x00, 0x00}, /* free format */
    {0xff, 0xfb, 0xf0, 0x00}, /* bitrate 15 */
    {0xff, 0xfb, 0x9c, 0x00}, /* reserved sample rate */
    {0xff, 0xeb, 0x90, 0x00}, /* reserved version */
    {0xff, 0xfd, 0x90, 0x00}, /* Layer II */
    {0xff, 0xff, 0x90, 0x00}, /* Layer I */
    {0xfe, 0xfb, 0x90, 0x00}, /* no sync */
  };
  for (size_t i = 0; i < sizeof bad / sizeof bad[0]; i++) CHECK(!lm_frame_parse(bad[i], &f));

  /* Encoder fixtures: Info/Xing counts are exact; headerless files are estimated. */
  LmStream s = probe("cbr-info.mp3");
  CHECK(s.exact); CHECK_INT(s.duration_ms, 1044); CHECK_INT(s.first.bitrate_kbps, 128);
  CHECK_INT(s.data_start, 417); /* the Info frame is not audio */
  s = probe("cbr-plain.mp3");
  CHECK(!s.exact); CHECK(s.duration_ms >= 1030 && s.duration_ms <= 1050); CHECK_INT(s.data_start, 0);
  s = probe("vbr-xing.mp3");
  CHECK(s.exact && s.has_toc); CHECK_INT(s.duration_ms, 1044);
  s = probe("vbr-plain.mp3");
  CHECK(!s.exact && s.duration_ms > 0);
  s = probe("mono22.mp3");
  CHECK(s.exact); CHECK_INT(s.first.mpeg, 2); CHECK_INT(s.first.channels, 1); CHECK_INT(s.first.sample_rate, 22050);
  CHECK_INT(s.duration_ms, 1071);
  { /* Probing starts after the ID3v2 tag. */
    FILE *t = fopen("tagged-v23.mp3", "rb");
    long size = file_size(t);
    CHECK(lm_stream_probe(t, 2786, size, &s)); /* 10-byte header + 2776-byte tag */
    CHECK(s.exact); CHECK_INT(s.duration_ms, 1044);
    fclose(t);
  }

  /* A false sync in junk before the audio is rejected by the two-frame check. */
  const char *tmp = "mp3-test.tmp";
  write_cbr(tmp, 300, 20, 1);
  s = probe(tmp);
  CHECK_INT(s.data_start, 300);
  CHECK(!s.exact);
  CHECK_INT(s.duration_ms, 20 * 417 * 8 / 128); /* bytes * 8 / kbps */
  /* Linear seek: halfway lands halfway through the audio bytes; resync finds the next frame. */
  long offset = lm_stream_seek_offset(&s, s.duration_ms / 2);
  CHECK(offset >= 300 + 417 * 10 - 417 && offset <= 300 + 417 * 10 + 417);
  FILE *t = fopen(tmp, "rb");
  long size = file_size(t);
  long at = lm_stream_resync(t, offset, size, &s.first);
  CHECK(at >= offset && (at - 300) % 417 == 0);
  CHECK_INT(lm_stream_resync(t, 300 + 417 * 19 + 1, size, &s.first), -1); /* inside the last frame: nothing follows */
  CHECK_INT(lm_stream_resync(t, 300 + 417 * 19, size, &s.first), 300 + 417 * 19); /* the last frame ends at EOF */
  fclose(t);
  CHECK_INT(lm_stream_seek_offset(&s, 0), 300);
  CHECK_INT(lm_stream_seek_offset(&s, s.duration_ms + 5000), size);
  /* No frames at all. */
  t = fopen(tmp, "wb");
  for (int i = 0; i < 70000; i++) fputc(0x11, t);
  fclose(t);
  t = fopen(tmp, "rb");
  CHECK(!lm_stream_probe(t, 0, 70000, &s));
  CHECK_INT(s.duration_ms, 0);
  fclose(t);
  remove(tmp);

  /* Xing TOC: a linear TOC maps halfway to halfway; a skewed one moves the offset. */
  LmStream toc = {0};
  toc.toc_base = 1000; toc.data_start = 1417; toc.data_end = 101000; toc.duration_ms = 100000; toc.has_toc = 1; toc.toc_bytes = 100000;
  for (int i = 0; i < 100; i++) toc.toc[i] = (uint8_t)(i * 256 / 100);
  CHECK_INT(lm_stream_seek_offset(&toc, 50000), 1000 + 50000);
  toc.toc[50] = 200;
  CHECK_INT(lm_stream_seek_offset(&toc, 50000), 1000 + (long)(200.0 / 256.0 * 100000));
  CHECK(lm_stream_seek_offset(&toc, 99999) <= toc.data_end);
  CHECK_INT(lm_stream_seek_offset(&toc, 1), toc.data_start); /* never inside the Xing frame */

  /* VBRI: frame count at offset 36 + 14. */
  {
    FILE *v = fopen(tmp, "wb");
    uint8_t frame[417] = {0xff, 0xfb, 0x90, 0x64};
    memcpy(frame + 36, "VBRI", 4);
    frame[36 + 14] = 0; frame[36 + 15] = 0; frame[36 + 16] = 0; frame[36 + 17] = 100;
    fwrite(frame, 1, sizeof frame, v);
    memset(frame + 4, 0x22, sizeof frame - 4);
    for (int i = 0; i < 5; i++) fwrite(frame, 1, sizeof frame, v);
    fclose(v);
    s = probe(tmp);
    CHECK(s.exact); CHECK_INT(s.duration_ms, 100 * 1152 * 1000 / 44100); CHECK_INT(s.data_start, 417);
    remove(tmp);
  }
  CHECK_DONE("localmedia mp3");
}
```

Apply to `runtime/tests/localmedia-native.test.ts`:

```diff
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index 9a3cf679..f524079e 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -28,4 +28,8 @@ describe("media.local native units (host-compiled)", () => {
   test("tags: v2.2/2.3/2.4 fields, encodings, unsync, pictures, v1 fallback, broken input", () => {
     expect(run("tags-test.c", ["localmedia_tags.c"])).toContain("localmedia tags verified");
   }, 60_000);
+
+  test("mp3: frame table, Xing/Info/VBRI durations, estimates, TOC and linear seek, resync", () => {
+    expect(run("mp3-test.c", ["localmedia_mp3.c"])).toContain("localmedia mp3 verified");
+  }, 60_000);
 });
```

- [ ] **Step 2: Run it.**
  - Run `cd runtime && bun test tests/localmedia-native.test.ts`.
  - Expected: `2 pass, 1 fail` (`compile mp3-test.c failed`).

- [ ] **Step 3: Implement.**

`runtime/hosts/3ds/src/localmedia_mp3.h`:

```c
/*
 * media.local MP3 stream probe: Layer III frame headers (MPEG 1, 2, 2.5),
 * the first real frame after the tag, Xing/Info/VBRI durations, the
 * bitrate estimate, and seek offsets (Xing TOC or linear) with a resync
 * that needs two consecutive valid frames.
 *
 * Pure C over stdio: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_MP3_H
#define POCKETJS_LOCALMEDIA_MP3_H

#include <stdint.h>
#include <stdio.h>

/* How far a sync search reads before giving up. */
#define LM_SYNC_WINDOW 65536

typedef struct {
  int mpeg;          /* 1, 2, or 25 (MPEG 2.5) */
  int bitrate_kbps;
  int sample_rate;
  int channels;      /* 1 or 2 */
  int samples;       /* per frame: 1152 (MPEG 1) or 576 */
  int bytes;         /* frame length including the header */
} LmFrame;

typedef struct {
  LmFrame first;         /* the first audio frame (after any Xing/Info/VBRI frame) */
  long data_start;       /* offset of the first audio frame */
  long data_end;         /* end of audio (before an ID3v1 tag) */
  uint32_t duration_ms;  /* 0 when no frame was found */
  int exact;             /* duration came from a Xing/Info/VBRI frame count */
  int has_toc;
  uint8_t toc[100];
  uint32_t toc_bytes;    /* Xing byte count the TOC is scaled by (0: data_end - toc_base) */
  long toc_base;         /* offset the TOC is measured from (the Xing frame) */
} LmStream;

/* Parses a 4-byte header. Returns 1 for a valid Layer III header (free-format and
 * reserved values rejected), else 0. */
int lm_frame_parse(const uint8_t header[4], LmFrame *out);

/* Finds the first frame at or after start (two-frame check, within LM_SYNC_WINDOW),
 * reads any Xing/Info/VBRI header and computes the duration. Returns 1 when a frame
 * was found, else 0 (out->duration_ms is 0). */
int lm_stream_probe(FILE *file, long start, long end, LmStream *out);

/* Byte offset to resync from for a seek to ms. */
long lm_stream_seek_offset(const LmStream *stream, uint32_t ms);

/* The offset of the first frame at or after from that matches ref (same MPEG version
 * and sample rate) and is followed by another such frame or by end. -1 when none is
 * found within LM_SYNC_WINDOW. */
long lm_stream_resync(FILE *file, long from, long end, const LmFrame *ref);

#endif
```

`runtime/hosts/3ds/src/localmedia_mp3.c`:

```c
/* MP3 frame headers, VBR headers, duration and seek; see localmedia_mp3.h. */
#include "localmedia_mp3.h"

#include <stdlib.h>
#include <string.h>

/* Layer III bitrates in kbps by [MPEG 1 ? 0 : 1][index]; index 0 (free format) and 15 are invalid. */
static const int BITRATES[2][16] = {
  {0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0},
  {0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0},
};
static const int RATES[3][3] = {{44100, 48000, 32000}, {22050, 24000, 16000}, {11025, 12000, 8000}};

int lm_frame_parse(const uint8_t h[4], LmFrame *out) {
  if (h[0] != 0xff || (h[1] & 0xe0) != 0xe0) return 0;
  int version_bits = h[1] >> 3 & 3; /* 0 MPEG 2.5, 1 reserved, 2 MPEG 2, 3 MPEG 1 */
  int layer_bits = h[1] >> 1 & 3;   /* 1 = Layer III */
  int bitrate_index = h[2] >> 4, rate_index = h[2] >> 2 & 3;
  if (version_bits == 1 || layer_bits != 1 || bitrate_index == 0 || bitrate_index == 15 || rate_index == 3) return 0;
  int mpeg1 = version_bits == 3;
  LmFrame f;
  f.mpeg = mpeg1 ? 1 : version_bits == 2 ? 2 : 25;
  f.bitrate_kbps = BITRATES[mpeg1 ? 0 : 1][bitrate_index];
  f.sample_rate = RATES[mpeg1 ? 0 : version_bits == 2 ? 1 : 2][rate_index];
  f.channels = (h[3] >> 6) == 3 ? 1 : 2;
  f.samples = mpeg1 ? 1152 : 576;
  int padding = h[2] >> 1 & 1;
  f.bytes = (mpeg1 ? 144 : 72) * f.bitrate_kbps * 1000 / f.sample_rate + padding;
  *out = f;
  return 1;
}

static int compatible(const LmFrame *a, const LmFrame *b) {
  return a->mpeg == b->mpeg && a->sample_rate == b->sample_rate;
}

/* Reads 4 bytes at offset; 0 when out of range or unreadable. */
static int header_at(FILE *file, long offset, long end, uint8_t h[4]) {
  if (offset < 0 || offset + 4 > end || fseek(file, offset, SEEK_SET) != 0) return 0;
  return fread(h, 1, 4, file) == 4;
}

/* Scans [from, from + window) for a frame (matching ref when given) confirmed by the next. */
static long find_frame(FILE *file, long from, long end, const LmFrame *ref, LmFrame *found) {
  long limit = from + LM_SYNC_WINDOW < end ? from + LM_SYNC_WINDOW : end;
  if (from < 0) from = 0;
  uint8_t chunk[4096 + 3];
  for (long base = from; base < limit; base += 4096) {
    long want = limit - base < 4096 ? limit - base : 4096;
    long avail = end - base < want + 3 ? end - base : want + 3;
    if (fseek(file, base, SEEK_SET) != 0) return -1;
    size_t got = fread(chunk, 1, (size_t)avail, file);
    for (long i = 0; i + 3 < (long)got && i < want; i++) {
      if (chunk[i] != 0xff || (chunk[i + 1] & 0xe0) != 0xe0) continue;
      LmFrame frame, next;
      if (!lm_frame_parse(chunk + i, &frame) || (ref && !compatible(&frame, ref))) continue;
      long at = base + i, follow = at + frame.bytes;
      uint8_t h[4];
      if (follow + 4 > end) {
        if (follow > end) continue;
      } else if (!header_at(file, follow, end, h) || !lm_frame_parse(h, &next) || !compatible(&frame, &next)) {
        continue;
      }
      *found = frame;
      return at;
    }
  }
  return -1;
}

static uint32_t read_be32(const uint8_t *b) {
  return (uint32_t)b[0] << 24 | (uint32_t)b[1] << 16 | (uint32_t)b[2] << 8 | b[3];
}

/* Offset of the Xing/Info header inside a frame: after the 4-byte header and side info. */
static int xing_offset(const LmFrame *f) {
  if (f->mpeg == 1) return 4 + (f->channels == 1 ? 17 : 32);
  return 4 + (f->channels == 1 ? 9 : 17);
}

int lm_stream_probe(FILE *file, long start, long end, LmStream *out) {
  memset(out, 0, sizeof *out);
  out->data_end = end;
  LmFrame first;
  long at = find_frame(file, start, end, NULL, &first);
  if (at < 0) return 0;
  out->first = first;
  out->data_start = at;
  uint8_t frame[2048];
  long take = first.bytes < (long)sizeof frame ? first.bytes : (long)sizeof frame;
  if (at + take > end) take = end - at;
  if (fseek(file, at, SEEK_SET) != 0 || fread(frame, 1, (size_t)take, file) != (size_t)take) take = 0;
  uint32_t frames = 0;
  int x = xing_offset(&first);
  if (take >= x + 8 && (memcmp(frame + x, "Xing", 4) == 0 || memcmp(frame + x, "Info", 4) == 0)) {
    uint32_t flags = read_be32(frame + x + 4);
    int p = x + 8;
    if ((flags & 1) && take >= p + 4) { frames = read_be32(frame + p); p += 4; }
    if ((flags & 2) && take >= p + 4) { out->toc_bytes = read_be32(frame + p); p += 4; }
    if ((flags & 4) && take >= p + 100) { memcpy(out->toc, frame + p, 100); out->has_toc = 1; out->toc_base = at; }
    out->data_start = at + first.bytes;
  } else if (take >= 4 + 32 + 18 && memcmp(frame + 36, "VBRI", 4) == 0) {
    frames = read_be32(frame + 36 + 14);
    out->data_start = at + first.bytes;
  }
  if (out->data_start != at) {
    /* The audio starts at the frame after the header frame; take its parameters when present. */
    uint8_t h[4];
    LmFrame next;
    if (header_at(file, out->data_start, end, h) && lm_frame_parse(h, &next) && compatible(&next, &first)) out->first = next;
  }
  if (frames > 0) {
    out->duration_ms = (uint32_t)((uint64_t)frames * first.samples * 1000 / first.sample_rate);
    out->exact = 1;
  } else {
    if (out->toc_bytes == 0) out->has_toc = 0;
    uint64_t bytes = (uint64_t)(end - out->data_start);
    out->duration_ms = (uint32_t)(bytes * 8 / (uint64_t)out->first.bitrate_kbps);
  }
  return 1;
}

long lm_stream_seek_offset(const LmStream *s, uint32_t ms) {
  long span = s->data_end - s->data_start;
  if (s->duration_ms == 0 || span <= 0 || ms == 0) return s->data_start;
  if (ms >= s->duration_ms) return s->data_end;
  double fraction = (double)ms / s->duration_ms;
  if (s->has_toc) {
    double percent = fraction * 100.0;
    int a = (int)percent;
    if (a > 99) a = 99;
    double fa = s->toc[a], fb = a < 99 ? s->toc[a + 1] : 256.0;
    double fx = fa + (fb - fa) * (percent - a);
    double scale = s->toc_bytes ? (double)s->toc_bytes : (double)(s->data_end - s->toc_base);
    long offset = s->toc_base + (long)(fx / 256.0 * scale);
    if (offset < s->data_start) offset = s->data_start;
    return offset < s->data_end ? offset : s->data_end;
  }
  return s->data_start + (long)(fraction * span);
}

long lm_stream_resync(FILE *file, long from, long end, const LmFrame *ref) {
  LmFrame found;
  return find_frame(file, from, end, ref, &found);
}
```

- [ ] **Step 4: Run.** `cd runtime && bun test tests/localmedia-native.test.ts`. Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit in the fork.**

```bash
git -C runtime add hosts/3ds/src/localmedia_mp3.h hosts/3ds/src/localmedia_mp3.c tests/fixtures/localmedia/mp3-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): MP3 frame headers, VBR headers, durations and seek offsets"
```

---

### Task 5: Cover art read, decode and fit (fork)

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_art.{h,c}`.
- Create: `runtime/tests/fixtures/localmedia/art-test.c`.
- Modify: `runtime/tests/localmedia-native.test.ts`.

**Interfaces:**
- Consumes: `LmTags` (Task 3), which the test uses to find embedded pictures.
- Produces:
  - `LM_ART_EDGE` (128), `LM_ART_PIXELS_BYTES`, `LM_ART_MAX_BYTES` and `LM_ART_MAX_DIM`.
  - `size_t lm_art_read(FILE *, long offset, long raw_bytes, int unsync, uint8_t **out)`.
  - `int lm_art_decode(const uint8_t *, size_t, uint8_t *out)`, which returns 128×128 RGBA8.
  - `void lm_art_fit(const uint8_t *rgb, int w, int h, uint8_t *out)`.

- [ ] **Step 1: Write the failing test.** Create `runtime/tests/fixtures/localmedia/art-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_art.h"
#include "../../../hosts/3ds/src/localmedia_tags.h"
#include "check.h"

#include <stdlib.h>

static uint8_t out[LM_ART_PIXELS_BYTES];

static const uint8_t *px(int x, int y) { return out + (y * LM_ART_EDGE + x) * 4; }

/* Reads a fixture's embedded picture through the tag reader and decodes it. */
static int decode_embedded(const char *path) {
  FILE *f = fopen(path, "rb");
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  LmTags tags;
  lm_tags_read(f, size, &tags);
  uint8_t *data;
  size_t length = lm_art_read(f, tags.art_offset, tags.art_raw_bytes, tags.art_unsync, &data);
  fclose(f);
  int ok = length > 0 && lm_art_decode(data, length, out);
  free(data);
  return ok;
}

static size_t slurp(const char *path, uint8_t **data) {
  FILE *f = fopen(path, "rb");
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  fseek(f, 0, SEEK_SET);
  *data = malloc((size_t)size);
  size_t got = fread(*data, 1, (size_t)size, f);
  fclose(f);
  return got;
}

int main(void) {
  /* Box filter: a 256x256 checkerboard of 1-pixel black/white averages to mid-grey. */
  uint8_t *rgb = malloc(256 * 256 * 3);
  for (int i = 0; i < 256 * 256; i++) { uint8_t v = ((i % 256) + (i / 256)) % 2 ? 255 : 0; rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v; }
  lm_art_fit(rgb, 256, 256, out);
  CHECK_INT(px(0, 0)[0], 128); CHECK_INT(px(127, 127)[1], 128); CHECK_INT(px(5, 9)[3], 255);

  /* Wide: 384x128 with red | green | blue thirds keeps only the green centre. */
  rgb = realloc(rgb, 384 * 128 * 3);
  for (int y = 0; y < 128; y++)
    for (int x = 0; x < 384; x++) { uint8_t *p = rgb + (y * 384 + x) * 3; p[0] = x < 128 ? 255 : 0; p[1] = x >= 128 && x < 256 ? 255 : 0; p[2] = x >= 256 ? 255 : 0; }
  lm_art_fit(rgb, 384, 128, out);
  CHECK(px(0, 0)[1] == 255 && px(0, 0)[0] == 0); CHECK(px(127, 64)[1] == 255 && px(127, 64)[2] == 0);

  /* Tall: 128x384 with top/middle/bottom thirds keeps the middle. */
  for (int y = 0; y < 384; y++)
    for (int x = 0; x < 128; x++) { uint8_t *p = rgb + (y * 128 + x) * 3; p[0] = y < 128 ? 255 : 0; p[1] = y >= 128 && y < 256 ? 255 : 0; p[2] = y >= 256 ? 255 : 0; }
  lm_art_fit(rgb, 128, 384, out);
  CHECK(px(64, 0)[1] == 255 && px(64, 127)[1] == 255 && px(64, 127)[2] == 0);

  /* Tiny: 2x2 grows by nearest neighbour into four 64x64 quadrants. */
  uint8_t tiny[12] = {255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255};
  lm_art_fit(tiny, 2, 2, out);
  CHECK(px(0, 0)[0] == 255 && px(63, 63)[0] == 255 && px(64, 0)[1] == 255 && px(0, 64)[2] == 255 && px(127, 127)[0] == 255 && px(127, 127)[2] == 255);

  /* A 200x150 non-square downscale: crop to 150, box sizes 1 or 2 source pixels. */
  rgb = realloc(rgb, 200 * 150 * 3);
  for (int i = 0; i < 200 * 150 * 3; i++) rgb[i] = 77;
  lm_art_fit(rgb, 200, 150, out);
  CHECK_INT(px(100, 100)[0], 77);
  free(rgb);

  /* Embedded JPEG (96x64, lame v2.3) and PNG (40x40, ffmpeg v2.4) decode through the tag offsets. */
  CHECK(decode_embedded("tagged-v23.mp3"));
  CHECK_INT(px(0, 0)[3], 255);
  CHECK(decode_embedded("tagged-v24.mp3"));
  uint8_t *png;
  size_t png_length = slurp("cover-small.png", &png);
  uint8_t direct[LM_ART_PIXELS_BYTES];
  CHECK(lm_art_decode(png, png_length, direct));
  CHECK(memcmp(direct, out, sizeof direct) == 0);

  /* Over-limit dimensions are refused before decoding: a PNG IHDR claiming 2000x10. */
  uint8_t big[33];
  memcpy(big, png, 33);
  big[16] = 0; big[17] = 0; big[18] = 0x07; big[19] = 0xd0;
  CHECK(!lm_art_decode(big, 33, out));
  /* Corrupt and truncated data. */
  CHECK(!lm_art_decode(png, 20, out));
  uint8_t junk[64];
  memset(junk, 0x5a, sizeof junk);
  CHECK(!lm_art_decode(junk, sizeof junk, out));
  CHECK(!lm_art_decode(png, 0, out));
  free(png);

  /* lm_art_read: unsynchronised bytes come back clean; oversize and short spans fail. */
  const char *tmp = "art-test.tmp";
  FILE *f = fopen(tmp, "wb");
  uint8_t raw[] = {9, 9, 0xff, 0x00, 0xd8, 0xff, 0x00, 0xe0, 1};
  fwrite(raw, 1, sizeof raw, f);
  fclose(f);
  f = fopen(tmp, "rb");
  uint8_t *data;
  size_t length = lm_art_read(f, 2, 7, 1, &data);
  CHECK_INT(length, 5);
  CHECK(data && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff && data[3] == 0xe0 && data[4] == 1);
  free(data);
  CHECK_INT(lm_art_read(f, 2, 50, 0, &data), 0); /* past EOF */
  CHECK(data == NULL);
  CHECK_INT(lm_art_read(f, 0, LM_ART_MAX_BYTES + 1, 0, &data), 0);
  CHECK_INT(lm_art_read(f, 0, 0, 0, &data), 0);
  fclose(f);
  remove(tmp);
  CHECK_DONE("localmedia art");
}
```

Apply to `runtime/tests/localmedia-native.test.ts`:

```diff
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index f524079e..0c5b8dec 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -32,4 +32,8 @@ describe("media.local native units (host-compiled)", () => {
   test("mp3: frame table, Xing/Info/VBRI durations, estimates, TOC and linear seek, resync", () => {
     expect(run("mp3-test.c", ["localmedia_mp3.c"])).toContain("localmedia mp3 verified");
   }, 60_000);
+
+  test("art: crop and box scale, embedded JPEG and PNG, limits, unsync reads", () => {
+    expect(run("art-test.c", ["localmedia_art.c", "localmedia_tags.c"])).toContain("localmedia art verified");
+  }, 60_000);
 });
```

- [ ] **Step 2: Run it.**
  - Run `cd runtime && bun test tests/localmedia-native.test.ts`.
  - Expected: `3 pass, 1 fail` (`compile art-test.c failed`).

- [ ] **Step 3: Implement.**

`runtime/hosts/3ds/src/localmedia_art.h`:

```c
/*
 * media.local cover art: reads an embedded picture span (undoing ID3
 * unsynchronisation), decodes JPEG or PNG with stb_image, centre-crops to a
 * square and scales to LM_ART_EDGE x LM_ART_EDGE RGBA8 (alpha 255).
 *
 * Pure C: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_ART_H
#define POCKETJS_LOCALMEDIA_ART_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define LM_ART_EDGE 128
#define LM_ART_PIXELS_BYTES (LM_ART_EDGE * LM_ART_EDGE * 4)
/* Pictures larger than this, compressed, are refused. */
#define LM_ART_MAX_BYTES (2L * 1024 * 1024)
/* Pictures wider or taller than this are refused before decoding. */
#define LM_ART_MAX_DIM 1500

/* Reads raw_bytes from offset (undoing unsynchronisation when unsync) into a malloc'd
 * buffer. Returns its length, 0 on failure or when larger than LM_ART_MAX_BYTES. */
size_t lm_art_read(FILE *file, long offset, long raw_bytes, int unsync, uint8_t **out);

/* Decodes a JPEG or PNG and fits it into out (LM_ART_PIXELS_BYTES). Returns 1 on success. */
int lm_art_decode(const uint8_t *data, size_t length, uint8_t *out);

/* Centre-crops an RGB image to a square and scales it to LM_ART_EDGE: box filter when
 * shrinking, nearest neighbour when growing. */
void lm_art_fit(const uint8_t *rgb, int width, int height, uint8_t *out);

#endif
```

`runtime/hosts/3ds/src/localmedia_art.c`:

```c
/* Cover art decode and fit; see localmedia_art.h. */
#include "localmedia_art.h"

#include <stdlib.h>
#include <string.h>

#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_STATIC
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#define STBI_NO_FAILURE_STRINGS
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wsign-compare"
#pragma GCC diagnostic ignored "-Wunused-parameter"
#endif
#include "stb_image.h"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

size_t lm_art_read(FILE *file, long offset, long raw_bytes, int unsync, uint8_t **out) {
  *out = NULL;
  if (raw_bytes <= 0 || offset < 0 || fseek(file, offset, SEEK_SET) != 0) return 0;
  /* An unsynchronised span may run to the tag end; only refuse what cannot shrink below the cap. */
  if (!unsync && raw_bytes > LM_ART_MAX_BYTES) return 0;
  long take = raw_bytes > LM_ART_MAX_BYTES * 2 ? LM_ART_MAX_BYTES * 2 : raw_bytes;
  uint8_t *bytes = malloc((size_t)take);
  if (!bytes) return 0;
  size_t got = fread(bytes, 1, (size_t)take, file);
  size_t length = got;
  if (unsync) {
    length = 0;
    for (size_t i = 0; i < got; i++) {
      bytes[length++] = bytes[i];
      if (bytes[i] == 0xff && i + 1 < got && bytes[i + 1] == 0) i++;
    }
  }
  if (length == 0 || (long)length > LM_ART_MAX_BYTES || (!unsync && got < (size_t)take)) { free(bytes); return 0; }
  *out = bytes;
  return length;
}

void lm_art_fit(const uint8_t *rgb, int width, int height, uint8_t *out) {
  int side = width < height ? width : height;
  int x0 = (width - side) / 2, y0 = (height - side) / 2;
  for (int y = 0; y < LM_ART_EDGE; y++) {
    for (int x = 0; x < LM_ART_EDGE; x++) {
      uint8_t *pixel = out + (y * LM_ART_EDGE + x) * 4;
      if (side < LM_ART_EDGE) {
        const uint8_t *src = rgb + ((y0 + y * side / LM_ART_EDGE) * width + x0 + x * side / LM_ART_EDGE) * 3;
        pixel[0] = src[0]; pixel[1] = src[1]; pixel[2] = src[2];
      } else {
        int sx0 = x * side / LM_ART_EDGE, sx1 = (x + 1) * side / LM_ART_EDGE;
        int sy0 = y * side / LM_ART_EDGE, sy1 = (y + 1) * side / LM_ART_EDGE;
        uint32_t sum[3] = {0, 0, 0}, count = (uint32_t)((sx1 - sx0) * (sy1 - sy0));
        for (int sy = sy0; sy < sy1; sy++) {
          const uint8_t *row = rgb + ((y0 + sy) * width + x0) * 3;
          for (int sx = sx0; sx < sx1; sx++) { sum[0] += row[sx * 3]; sum[1] += row[sx * 3 + 1]; sum[2] += row[sx * 3 + 2]; }
        }
        for (int c = 0; c < 3; c++) pixel[c] = (uint8_t)((sum[c] + count / 2) / count);
      }
      pixel[3] = 255;
    }
  }
}

int lm_art_decode(const uint8_t *data, size_t length, uint8_t *out) {
  int width, height, channels;
  if (length == 0 || length > (size_t)LM_ART_MAX_BYTES) return 0;
  if (!stbi_info_from_memory(data, (int)length, &width, &height, &channels)) return 0;
  if (width <= 0 || height <= 0 || width > LM_ART_MAX_DIM || height > LM_ART_MAX_DIM) return 0;
  uint8_t *rgb = stbi_load_from_memory(data, (int)length, &width, &height, &channels, 3);
  if (!rgb) return 0;
  lm_art_fit(rgb, width, height, out);
  stbi_image_free(rgb);
  return 1;
}
```

- [ ] **Step 4: Run.** `cd runtime && bun test tests/localmedia-native.test.ts`. Expected: `4 pass, 0 fail`.

- [ ] **Step 5: Commit in the fork.**

```bash
git -C runtime add hosts/3ds/src/localmedia_art.h hosts/3ds/src/localmedia_art.c tests/fixtures/localmedia/art-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): cover art read, decode, crop and scale"
```

---

### Task 6: Folder scan and `tracks()` JSON (fork)

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_library.{h,c}`.
- Create: `runtime/tests/fixtures/localmedia/library-test.c`.
- Modify: `runtime/tests/localmedia-native.test.ts`. The `run` helper gains `args`, and the test checks the JSON with the contract's `validLocalTrack`.

**Interfaces:**
- Consumes: `lm_ids_get` (Task 2), `lm_tags_read` and `lm_tags_text` (Task 3), and `lm_stream_probe` (Task 4).
- Produces:
  - `LmTrack`: `id`, `file`, `duration_ms`, `has_art`, `art_offset`, `art_raw_bytes` and `art_unsync`.
  - `LmLibrary`: `tracks`, `count`, `json` and `json_length`.
  - `LmLibrary *lm_library_scan(const char *root, LmIds *, int max_tracks, const atomic_int *stop)`.
  - `LmLibrary *lm_library_empty(void)`.
  - `void lm_library_free(LmLibrary *)`.
  - `const LmTrack *lm_library_find(const LmLibrary *, int id)`.

- [ ] **Step 1: Write the failing test.** Create `runtime/tests/fixtures/localmedia/library-test.c`:

```c
/* Scans each folder given on the command line with one id registry and prints each
 * tracks() JSON on its own line; the first argument is the track cap. */
#include "../../../hosts/3ds/src/localmedia_library.h"
#include "check.h"

#include <stdlib.h>

int main(int argc, char **argv) {
  LmIds *ids = lm_ids_create();
  int cap = atoi(argv[1]);
  for (int i = 2; i < argc; i++) {
    LmLibrary *library = lm_library_scan(argv[i], ids, cap, NULL);
    CHECK(library != NULL);
    if (!library) return 1;
    CHECK_INT(strlen(library->json), library->json_length);
    for (int t = 0; t < library->count; t++) CHECK(lm_library_find(library, library->tracks[t].id) == &library->tracks[t]);
    CHECK(lm_library_find(library, 99999) == NULL);
    printf("%s\n", library->json);
    lm_library_free(library);
  }
  /* A raised stop flag abandons the scan. */
  atomic_int stop = 1;
  CHECK(lm_library_scan(argv[2], ids, cap, &stop) == NULL);
  LmLibrary *empty = lm_library_empty();
  CHECK_STR(empty->json, "[]");
  lm_library_free(empty);
  lm_ids_destroy(ids);
  if (check_failures) return 1;
  return 0;
}
```

Apply to `runtime/tests/localmedia-native.test.ts`:

```diff
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index 0c5b8dec..1a9cf31f 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -1,5 +1,6 @@
 import { afterAll, describe, expect, test } from "bun:test";
-import { mkdtempSync, rmSync } from "node:fs";
+import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
+import { validLocalTrack, type LocalTrack } from "../contracts/spec/localmedia.ts";
 import { tmpdir } from "node:os";
 import { join, resolve } from "node:path";
 
@@ -10,12 +11,12 @@ const scratch = mkdtempSync(join(tmpdir(), "pocket-localmedia-"));
 afterAll(() => rmSync(scratch, { recursive: true, force: true }));
 
 /** Compiles a harness with the given media.local sources under ASan/UBSan and runs it from the fixtures folder. */
-function run(harness: string, sources: string[]): string {
+function run(harness: string, sources: string[], args: string[] = []): string {
   const binary = join(scratch, harness.replace(/\.c$/, ""));
   const compile = Bun.spawnSync(["cc", "-std=c11", "-D_DEFAULT_SOURCE", "-O1", "-g", "-Wall", "-Wextra", "-fsanitize=address,undefined", "-fno-sanitize-recover=undefined",
     `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`, join(FIXTURES, harness), ...sources.map((s) => join(SRC, s)), "-o", binary]);
   if (compile.exitCode !== 0) throw new Error(`compile ${harness} failed:\n${compile.stderr.toString()}`);
-  const result = Bun.spawnSync([binary], { cwd: FIXTURES, timeout: 60_000 });
+  const result = Bun.spawnSync([binary, ...args], { cwd: FIXTURES, timeout: 60_000 });
   if (result.exitCode !== 0) throw new Error(`${harness} failed (exit ${result.exitCode}):\n${result.stderr.toString()}${result.stdout.toString()}`);
   return result.stdout.toString();
 }
@@ -36,4 +37,48 @@ describe("media.local native units (host-compiled)", () => {
   test("art: crop and box scale, embedded JPEG and PNG, limits, unsync reads", () => {
     expect(run("art-test.c", ["localmedia_art.c", "localmedia_tags.c"])).toContain("localmedia art verified");
   }, 60_000);
+
+  test("library: lists *.mp3 only, applies fallbacks, keeps ids across rescans, caps the count", () => {
+    const folder = (name: string, files: Record<string, string>) => {
+      const dir = join(scratch, name);
+      mkdirSync(dir, { recursive: true });
+      for (const [file, from] of Object.entries(files)) {
+        if (from === "<dir>") mkdirSync(join(dir, file));
+        else if (from === "<junk>") writeFileSync(join(dir, file), Buffer.alloc(3000, 0x11));
+        else copyFileSync(join(FIXTURES, from), join(dir, file));
+      }
+      return `${dir}/`;
+    };
+    const first = folder("scan-1", {
+      "tagged-v23.mp3": "tagged-v23.mp3", "LOUD.MP3": "cbr-info.mp3", "plain \"quoted\".mp3": "cbr-plain.mp3",
+      "junk.mp3": "<junk>", "notes.txt": "cover-small.png", "folder.mp3": "<dir>", "v1.Mp3": "tagged-v1.mp3",
+    });
+    const second = folder("scan-2", { "tagged-v23.mp3": "tagged-v23.mp3", "new.mp3": "vbr-xing.mp3", "v1.Mp3": "tagged-v1.mp3" });
+    const third = folder("scan-3", { "LOUD.MP3": "cbr-info.mp3", "new.mp3": "vbr-xing.mp3" });
+    const capped = folder("scan-4", { "a.mp3": "cbr-info.mp3", "b.mp3": "cbr-info.mp3", "c.mp3": "cbr-info.mp3" });
+    const missing = join(scratch, "no-such-folder/");
+    const lines = run("library-test.c", ["localmedia_library.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"],
+      ["2048", first, second, third, missing, capped]).trim().split("\n");
+    const scans = lines.map((line) => JSON.parse(line) as LocalTrack[]);
+    for (const scan of scans) expect(scan.every(validLocalTrack)).toBe(true);
+    const byFile = (scan: LocalTrack[]) => Object.fromEntries(scan.map((t) => [t.file, t]));
+    const one = byFile(scans[0]!);
+    expect(Object.keys(one).sort()).toEqual(["LOUD.MP3", "junk.mp3", "plain \"quoted\".mp3", "tagged-v23.mp3", "v1.Mp3"]);
+    expect(one["tagged-v23.mp3"]).toMatchObject({ title: "Café", artist: "Björk", album: "Début", track: 3, durationMs: 1044, hasArt: true });
+    expect(one["LOUD.MP3"]).toMatchObject({ title: "LOUD", artist: "Unknown Artist", album: "Unknown Album", track: 0, durationMs: 1044, hasArt: false });
+    expect(one["plain \"quoted\".mp3"]!.title).toBe('plain "quoted"');
+    expect(one["junk.mp3"]).toMatchObject({ title: "junk", durationMs: 0, hasArt: false });
+    expect(one["v1.Mp3"]).toMatchObject({ title: "Old Tag", artist: "V1 Artist", album: "V1 Album", track: 5 });
+    expect(new Set(scans[0]!.map((t) => t.id)).size).toBe(5);
+    const two = byFile(scans[1]!), three = byFile(scans[2]!);
+    expect(two["tagged-v23.mp3"]!.id).toBe(one["tagged-v23.mp3"]!.id);
+    expect(two["v1.Mp3"]!.id).toBe(one["v1.Mp3"]!.id);
+    expect(two["new.mp3"]!.id).toBe(5);
+    expect(three["LOUD.MP3"]!.id).toBe(one["LOUD.MP3"]!.id); // vanished in scan 2, back with its id
+    expect(three["new.mp3"]!.id).toBe(5);
+    expect(scans[3]).toEqual([]);
+    expect(scans[4]!.map((t) => t.id).sort()).toEqual([6, 7, 8]);
+    const cappedLines = run("library-test.c", ["localmedia_library.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"], ["2", capped]);
+    expect((JSON.parse(cappedLines.trim()) as LocalTrack[]).length).toBe(2);
+  }, 60_000);
 });
```

- [ ] **Step 2: Run it.**
  - Run `cd runtime && bun test tests/localmedia-native.test.ts`.
  - Expected: `4 pass, 1 fail` (`compile library-test.c failed`).

- [ ] **Step 3: Implement.**

`runtime/hosts/3ds/src/localmedia_library.h`:

```c
/*
 * media.local library scan: lists *.mp3 in a folder (non-recursive, extension
 * case-insensitive, directory order, capped), reads each file's tags and
 * duration, assigns ids through the registry, and builds the tracks() JSON
 * once. A track keeps only what open() and artwork() need afterwards.
 *
 * Pure C over stdio and dirent: compiled into the 3DS host and the host tests.
 */
#ifndef POCKETJS_LOCALMEDIA_LIBRARY_H
#define POCKETJS_LOCALMEDIA_LIBRARY_H

#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>

#include "localmedia_ids.h"

typedef struct {
  int id;
  char *file;           /* name relative to the scanned folder */
  uint32_t duration_ms;
  int has_art;
  long art_offset;
  long art_raw_bytes;
  int art_unsync;
} LmTrack;

typedef struct {
  LmTrack *tracks;
  int count;
  char *json;           /* JSON LocalTrack[] */
  size_t json_length;
} LmLibrary;

/* Scans root (ending in '/'). Returns NULL when out of memory or when stop became
 * non-zero; a missing folder yields an empty library. */
LmLibrary *lm_library_scan(const char *root, LmIds *ids, int max_tracks, const atomic_int *stop);
/* An empty library ("[]"); NULL when out of memory. */
LmLibrary *lm_library_empty(void);
void lm_library_free(LmLibrary *library);
const LmTrack *lm_library_find(const LmLibrary *library, int id);

#endif
```

`runtime/hosts/3ds/src/localmedia_library.c`:

```c
/* Folder scan and tracks() JSON; see localmedia_library.h. */
#include "localmedia_library.h"
#include "localmedia_mp3.h"
#include "localmedia_tags.h"

#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

typedef struct {
  char *bytes;
  size_t length, capacity;
  int failed;
} Json;

static void json_raw(Json *j, const char *text, size_t length) {
  if (j->failed) return;
  if (j->length + length + 1 > j->capacity) {
    size_t capacity = j->capacity ? j->capacity : 4096;
    while (j->length + length + 1 > capacity) capacity *= 2;
    char *bytes = realloc(j->bytes, capacity);
    if (!bytes) { j->failed = 1; return; }
    j->bytes = bytes;
    j->capacity = capacity;
  }
  memcpy(j->bytes + j->length, text, length);
  j->length += length;
  j->bytes[j->length] = '\0';
}

static void json_text(Json *j, const char *text) { json_raw(j, text, strlen(text)); }

/* A JSON string: escapes quotes, backslashes and controls; invalid UTF-8 bytes become '?'. */
static void json_string(Json *j, const char *text) {
  json_raw(j, "\"", 1);
  const unsigned char *p = (const unsigned char *)text;
  while (*p) {
    unsigned char c = *p;
    if (c == '"' || c == '\\') { char e[2] = {'\\', (char)c}; json_raw(j, e, 2); p++; continue; }
    if (c < 0x20) { char e[7]; snprintf(e, sizeof e, "\\u%04x", c); json_raw(j, e, 6); p++; continue; }
    if (c < 0x80) { json_raw(j, (const char *)p, 1); p++; continue; }
    size_t need = (c & 0xe0) == 0xc0 ? 1 : (c & 0xf0) == 0xe0 ? 2 : (c & 0xf8) == 0xf0 ? 3 : 0;
    size_t ok = need > 0;
    for (size_t i = 1; ok && i <= need; i++) ok = (p[i] & 0xc0) == 0x80;
    if (ok) { json_raw(j, (const char *)p, need + 1); p += need + 1; }
    else { json_raw(j, "?", 1); p++; }
  }
  json_raw(j, "\"", 1);
}

static int is_mp3(const char *name) {
  size_t length = strlen(name);
  if (length < 5) return 0;
  const char *ext = name + length - 4;
  return ext[0] == '.' && (ext[1] | 0x20) == 'm' && (ext[2] | 0x20) == 'p' && ext[3] == '3';
}

/* The file name without its extension, as UTF-8 text (shared rules with tag text). */
static void stem_of(const char *name, char out[LM_FIELD_BYTES]) {
  size_t length = strlen(name) - 4;
  lm_tags_text(3, (const uint8_t *)name, length, out);
}

static void add_track_json(Json *j, int first, int id, const char *file, const LmTags *tags, uint32_t duration_ms, int track) {
  char number[64];
  char stem[LM_FIELD_BYTES];
  json_text(j, first ? "{\"id\":" : ",{\"id\":");
  snprintf(number, sizeof number, "%d", id);
  json_text(j, number);
  json_text(j, ",\"file\":");
  json_string(j, file);
  json_text(j, ",\"title\":");
  if (tags->title[0]) json_string(j, tags->title);
  else { stem_of(file, stem); json_string(j, stem); }
  json_text(j, ",\"artist\":");
  json_string(j, tags->artist[0] ? tags->artist : "Unknown Artist");
  json_text(j, ",\"album\":");
  json_string(j, tags->album[0] ? tags->album : "Unknown Album");
  snprintf(number, sizeof number, ",\"track\":%d,\"durationMs\":%u,\"hasArt\":%s}", track, (unsigned)duration_ms, tags->has_art ? "true" : "false");
  json_text(j, number);
}

LmLibrary *lm_library_empty(void) {
  LmLibrary *library = calloc(1, sizeof *library);
  if (!library) return NULL;
  library->json = malloc(3);
  if (!library->json) { free(library); return NULL; }
  memcpy(library->json, "[]", 3);
  library->json_length = 2;
  return library;
}

void lm_library_free(LmLibrary *library) {
  if (!library) return;
  for (int i = 0; i < library->count; i++) free(library->tracks[i].file);
  free(library->tracks);
  free(library->json);
  free(library);
}

const LmTrack *lm_library_find(const LmLibrary *library, int id) {
  for (int i = 0; library && i < library->count; i++)
    if (library->tracks[i].id == id) return &library->tracks[i];
  return NULL;
}

LmLibrary *lm_library_scan(const char *root, LmIds *ids, int max_tracks, const atomic_int *stop) {
  DIR *dir = opendir(root);
  if (!dir) return lm_library_empty();
  LmLibrary *library = calloc(1, sizeof *library);
  LmTrack *tracks = calloc((size_t)max_tracks, sizeof *tracks);
  Json j = {0};
  json_text(&j, "[");
  int ok = library && tracks;
  size_t root_length = strlen(root);
  struct dirent *entry;
  while (ok && library->count < max_tracks && (entry = readdir(dir))) {
    if (stop && atomic_load(stop)) { ok = 0; break; }
    if (!is_mp3(entry->d_name)) continue;
    size_t name_length = strlen(entry->d_name);
    char *path = malloc(root_length + name_length + 1);
    char *file = malloc(name_length + 1);
    if (!path || !file) { free(path); free(file); ok = 0; break; }
    memcpy(path, root, root_length);
    memcpy(path + root_length, entry->d_name, name_length + 1);
    memcpy(file, entry->d_name, name_length + 1);
    struct stat info;
    FILE *f = NULL;
    if (stat(path, &info) != 0 || !S_ISREG(info.st_mode) || !(f = fopen(path, "rb"))) { free(path); free(file); continue; }
    free(path);
    LmTags tags;
    LmStream stream;
    long size = (long)info.st_size;
    lm_tags_read(f, size, &tags);
    uint32_t duration = lm_stream_probe(f, tags.audio_start, tags.audio_end, &stream) ? stream.duration_ms : 0;
    fclose(f);
    int id = lm_ids_get(ids, file);
    if (id < 0) { free(file); ok = 0; break; }
    LmTrack *track = &tracks[library->count];
    *track = (LmTrack){id, file, duration, tags.has_art, tags.art_offset, tags.art_raw_bytes, tags.art_unsync};
    add_track_json(&j, library->count == 0, id, file, &tags, duration, tags.track);
    library->count++;
  }
  closedir(dir);
  json_text(&j, "]");
  if (!ok || j.failed) {
    if (library) { library->tracks = tracks; lm_library_free(library); }
    else free(tracks);
    free(j.bytes);
    return NULL;
  }
  library->tracks = tracks;
  library->json = j.bytes;
  library->json_length = j.length;
  return library;
}
```

- [ ] **Step 4: Run.** `cd runtime && bun test tests/localmedia-native.test.ts`. Expected: `5 pass, 0 fail`.

- [ ] **Step 5: Commit in the fork.**

```bash
git -C runtime add hosts/3ds/src/localmedia_library.h hosts/3ds/src/localmedia_library.c tests/fixtures/localmedia/library-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): folder scan and tracks() JSON"
```

---

### Task 7: The playback engine (fork)

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_player.{h,c}`.
- Create: `runtime/tests/fixtures/localmedia/player-test.c`.
- Modify: `runtime/tests/localmedia-native.test.ts`.

**Interfaces:**
- Consumes: `lm_tags_read` (Task 3); `lm_stream_probe`, `lm_stream_seek_offset` and `lm_stream_resync` (Task 4).
- Produces `LmSink`:
  - `ctx`;
  - `slot_free`, `slot_data` and `queue`;
  - `configure` and `clear`;
  - `playing`;
  - `ticks`.
- Produces `LmPlayer`:
  - `underruns`, `decode_ticks` and `message[48]`;
  - `int lm_player_open(LmPlayer *, const LmSink *, const char *path)`;
  - `void lm_player_close(LmPlayer *)`;
  - `void lm_player_seek(LmPlayer *, uint32_t ms)`;
  - `LmPump lm_player_pump(LmPlayer *, int max_slots)`, returning `LM_PUMP_PLAYING`, `LM_PUMP_ENDED` or `LM_PUMP_ERROR`;
  - `int lm_player_queued(const LmPlayer *)`;
  - `uint32_t lm_player_position(LmPlayer *)`;
  - `uint32_t lm_player_duration(const LmPlayer *)`.
- Produces `LM_SLOTS` (16) and `LM_SLOT_FRAMES` (4608).

- [ ] **Step 1: Write the failing test.** Create `runtime/tests/fixtures/localmedia/player-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_player.h"
#include "check.h"

#include <stdlib.h>

/* A fake sink: queued slots play in FIFO order as the test advances time. */
typedef struct {
  int16_t data[LM_SLOTS][LM_SLOT_FRAMES * 2];
  int frames[LM_SLOTS];
  int fifo[LM_SLOTS], head, count;
  uint32_t played;       /* frames played of the head slot */
  int rate, channels, clears;
  uint64_t played_total; /* frames played since the last clear */
  uint64_t tick;
} Fake;

static int fake_free(void *ctx, int slot) {
  Fake *f = ctx;
  for (int i = 0; i < f->count; i++) if (f->fifo[(f->head + i) % LM_SLOTS] == slot) return 0;
  return 1;
}
static int16_t *fake_data(void *ctx, int slot) { return ((Fake *)ctx)->data[slot]; }
static void fake_queue(void *ctx, int slot, int frames) {
  Fake *f = ctx;
  CHECK(frames > 0 && frames <= LM_SLOT_FRAMES);
  f->frames[slot] = frames;
  f->fifo[(f->head + f->count++) % LM_SLOTS] = slot;
}
static void fake_configure(void *ctx, int rate, int channels) { Fake *f = ctx; f->rate = rate; f->channels = channels; }
static void fake_clear(void *ctx) { Fake *f = ctx; f->count = 0; f->played = 0; f->played_total = 0; f->clears++; }
static int fake_playing(void *ctx, uint32_t *played) {
  Fake *f = ctx;
  if (f->count == 0) return -1;
  *played = f->played;
  return f->fifo[f->head];
}
static uint64_t fake_ticks(void *ctx) { return ++((Fake *)ctx)->tick; }

/* Plays n frames of queued audio. */
static void advance(Fake *f, uint32_t n) {
  while (n > 0 && f->count > 0) {
    int slot = f->fifo[f->head];
    uint32_t left = (uint32_t)f->frames[slot] - f->played;
    uint32_t step = n < left ? n : left;
    f->played += step; f->played_total += step; n -= step;
    if (f->played == (uint32_t)f->frames[slot]) { f->head = (f->head + 1) % LM_SLOTS; f->count--; f->played = 0; }
  }
}

static Fake fake;
static const LmSink sink = {&fake, fake_free, fake_data, fake_queue, fake_configure, fake_clear, fake_playing, fake_ticks};
static LmPlayer player;

/* Plays a file to the end, pumping every 1024 frames; returns frames played. */
static uint64_t play_through(LmPlayer *p, Fake *f) {
  LmPump state;
  int guard = 0;
  while ((state = lm_player_pump(p, LM_SLOTS)) == LM_PUMP_PLAYING && guard++ < 100000) advance(f, 1024);
  CHECK_INT(state, LM_PUMP_ENDED);
  return f->played_total;
}

int main(void) {
  /* CBR with an Info frame: 40 frames of 1152 at 44.1 kHz stereo. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, "cbr-info.mp3"));
  CHECK_INT(fake.rate, 44100); CHECK_INT(fake.channels, 2);
  CHECK_INT(lm_player_duration(&player), 1044);
  CHECK_INT(lm_player_pump(&player, 4), LM_PUMP_PLAYING);
  CHECK_INT(lm_player_queued(&player), 4); /* the prefill cap is respected */
  CHECK_INT(lm_player_position(&player), 0);
  advance(&fake, 8820);
  CHECK_INT(lm_player_position(&player), 200);
  uint64_t frames = play_through(&player, &fake);
  CHECK_INT(frames, 40 * 1152);
  CHECK_INT(lm_player_position(&player), 1044);
  CHECK_INT(lm_player_duration(&player), 1044);
  CHECK_INT(player.underruns, 0);
  CHECK(player.decode_ticks > 0);
  /* The decoded audio is a tone, not silence. */
  int16_t peak = 0;
  for (int i = 0; i < 1000; i++) if (fake.data[0][2000 + i] > peak) peak = fake.data[0][2000 + i];
  CHECK(peak > 1000);
  lm_player_close(&player);

  /* Mono MPEG-2 at 22.05 kHz plays as mono. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, "mono22.mp3"));
  CHECK_INT(fake.rate, 22050); CHECK_INT(fake.channels, 1);
  CHECK_INT(play_through(&player, &fake), 41 * 576);
  lm_player_close(&player);

  /* Headerless VBR: the estimate is replaced by the decoded length at the end. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, "vbr-plain.mp3"));
  uint32_t estimate = lm_player_duration(&player);
  play_through(&player, &fake);
  CHECK(lm_player_duration(&player) >= 1000 && lm_player_duration(&player) <= 1100);
  CHECK(estimate != lm_player_duration(&player) || estimate > 0);
  lm_player_close(&player);

  /* Seek: positions restart at the target and never go backwards. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, "cbr-plain.mp3"));
  lm_player_pump(&player, LM_SLOTS);
  advance(&fake, 4410);
  CHECK_INT(lm_player_position(&player), 100);
  lm_player_seek(&player, 600);
  CHECK_INT(fake.clears, 1);
  CHECK_INT(lm_player_queued(&player), 0);
  CHECK_INT(lm_player_position(&player), 600);
  lm_player_pump(&player, LM_SLOTS);
  CHECK_INT(lm_player_position(&player), 600);
  advance(&fake, 4410);
  CHECK_INT(lm_player_position(&player), 700);
  uint64_t rest = play_through(&player, &fake);
  /* About 0.44 s follow 0.6 s; up to two frames after a seek play no audio (bit reservoir). */
  CHECK(rest >= (uint64_t)(0.38 * 44100) && rest <= (uint64_t)(0.46 * 44100));
  CHECK(lm_player_position(&player) >= 1030 && lm_player_position(&player) <= 1050);
  /* Seeking past the end ends the track; a seek back plays again. */
  lm_player_seek(&player, 5000);
  CHECK_INT(lm_player_pump(&player, LM_SLOTS), LM_PUMP_ENDED);
  lm_player_seek(&player, 0);
  CHECK_INT(lm_player_pump(&player, LM_SLOTS), LM_PUMP_PLAYING);
  lm_player_close(&player);

  /* Xing TOC seek lands near the target on VBR. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, "vbr-xing.mp3"));
  lm_player_seek(&player, 500);
  rest = play_through(&player, &fake);
  CHECK(rest >= (uint64_t)(0.40 * 44100) && rest <= (uint64_t)(0.56 * 44100));
  /* The TOC put the restart where its time says: the end lands on the real length. */
  CHECK(lm_player_position(&player) >= 1030 && lm_player_position(&player) <= 1060);
  lm_player_close(&player);

  /* Underrun: everything queued plays out before the next pump; counted once. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, "cbr-plain.mp3"));
  lm_player_pump(&player, 1);
  advance(&fake, LM_SLOT_FRAMES);
  CHECK_INT(lm_player_queued(&player), 0);
  lm_player_pump(&player, 0);
  lm_player_pump(&player, 0);
  CHECK_INT(player.underruns, 1);
  lm_player_pump(&player, 1);
  advance(&fake, LM_SLOT_FRAMES);
  lm_player_pump(&player, 1);
  CHECK_INT(player.underruns, 2);
  lm_player_close(&player);

  /* Failures: a missing file, no frames, and frames followed by unreadable bytes. */
  memset(&fake, 0, sizeof fake);
  CHECK(!lm_player_open(&player, &sink, "no-such-file.mp3"));
  CHECK_STR(player.message, "File not found");
  const char *tmp = "player-test.tmp";
  FILE *f = fopen(tmp, "wb");
  for (int i = 0; i < 70000; i++) fputc(0x11, f);
  fclose(f);
  CHECK(!lm_player_open(&player, &sink, tmp));
  CHECK_STR(player.message, "MP3 frame sync not found");
  FILE *in = fopen("cbr-plain.mp3", "rb");
  uint8_t *audio = malloc(16718);
  size_t audio_length = fread(audio, 1, 16718, in);
  fclose(in);
  f = fopen(tmp, "wb");
  fwrite(audio, 1, audio_length, f);
  for (int i = 0; i < 80000; i++) fputc(0x11, f);
  fclose(f);
  free(audio);
  CHECK(lm_player_open(&player, &sink, tmp));
  LmPump state;
  int guard = 0;
  while ((state = lm_player_pump(&player, LM_SLOTS)) == LM_PUMP_PLAYING && guard++ < 100000) advance(&fake, 1024);
  CHECK_INT(state, LM_PUMP_ERROR);
  CHECK_STR(player.message, "MP3 data unreadable");
  lm_player_close(&player);
  lm_player_close(&player); /* closing twice is safe */
  remove(tmp);
  CHECK_DONE("localmedia player");
}
```

Apply to `runtime/tests/localmedia-native.test.ts`:

```diff
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index 1a9cf31f..ef4c22f3 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -81,4 +81,8 @@ describe("media.local native units (host-compiled)", () => {
     const cappedLines = run("library-test.c", ["localmedia_library.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"], ["2", capped]);
     expect((JSON.parse(cappedLines.trim()) as LocalTrack[]).length).toBe(2);
   }, 60_000);
+
+  test("player: decodes, positions, seeks, ends, counts underruns, reports unreadable files", () => {
+    expect(run("player-test.c", ["localmedia_player.c", "localmedia_mp3.c", "localmedia_tags.c"])).toContain("localmedia player verified");
+  }, 60_000);
 });
```

- [ ] **Step 2: Run it.**
  - Run `cd runtime && bun test tests/localmedia-native.test.ts`.
  - Expected: `5 pass, 1 fail` (`compile player-test.c failed`).

- [ ] **Step 3: Implement.**

`runtime/hosts/3ds/src/localmedia_player.h`:

```c
/*
 * media.local playback engine: one open MP3 decoded by minimp3 into a ring
 * of PCM16 slots that an audio sink plays in submission order. Owns the
 * file, the decoder, positions, seeking, end of stream and underrun and
 * decode-time accounting. The sink (NDSP on the 3DS, a fake in the tests)
 * owns the audio buffers and reports which slot is playing.
 *
 * Pure C over stdio: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_PLAYER_H
#define POCKETJS_LOCALMEDIA_PLAYER_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#include "localmedia_mp3.h"
#include "minimp3.h"

#define LM_SLOTS 16
/* Per-channel frames per slot: four MPEG-1 Layer III frames. */
#define LM_SLOT_FRAMES 4608
/* Consecutive bytes that decode to nothing before the stream counts as unreadable. */
#define LM_JUNK_LIMIT 65536

typedef struct {
  void *ctx;
  /* 1 when the slot is not queued (never used, or finished playing). */
  int (*slot_free)(void *ctx, int slot);
  /* LM_SLOT_FRAMES * 2 samples of PCM16 storage for the slot. */
  int16_t *(*slot_data)(void *ctx, int slot);
  /* Queues the slot's first `frames` per-channel frames after every queued slot. */
  void (*queue)(void *ctx, int slot, int frames);
  void (*configure)(void *ctx, int rate, int channels);
  /* Stops output and drops every queued slot. */
  void (*clear)(void *ctx);
  /* The slot playing now and how many of its frames have played; -1 when none. */
  int (*playing)(void *ctx, uint32_t *frames_played);
  /* A monotonic tick count, for decode-time accounting. */
  uint64_t (*ticks)(void *ctx);
} LmSink;

typedef enum { LM_PUMP_PLAYING, LM_PUMP_ENDED, LM_PUMP_ERROR } LmPump;

typedef struct {
  const LmSink *sink;
  FILE *file;
  LmStream stream;
  mp3dec_t decoder;
  int rate, channels;
  uint8_t input[16384];
  size_t input_length, input_used;
  long read_at;              /* file offset of the next byte to read into input */
  int eof;                   /* the decoder has consumed the last frame */
  int error;
  char message[48];
  uint32_t base_ms;          /* time of the first sample decoded since open/seek */
  uint64_t decoded;          /* per-channel frames decoded since base_ms */
  uint64_t slot_start[LM_SLOTS]; /* per-channel frames decoded before the slot, since base_ms */
  uint32_t position_ms;      /* last reported position (never decreases until a seek) */
  int queued_once;           /* a slot was queued since open/seek */
  int starved;               /* the current underrun was counted */
  uint32_t underruns;
  uint64_t decode_ticks;     /* ticks spent inside mp3dec_decode_frame */
  long junk;                 /* bytes skipped since the last decoded frame */
  mp3d_sample_t pcm[MINIMP3_MAX_SAMPLES_PER_FRAME];
} LmPlayer;

/* Opens path and configures the sink. Returns 1, or 0 with p->message set
 * ("File not found", "MP3 frame sync not found"). */
int lm_player_open(LmPlayer *p, const LmSink *sink, const char *path);
/* Clears the sink and closes the file. Safe on a closed player. */
void lm_player_close(LmPlayer *p);
/* Restarts output at ms (clamped to the duration). */
void lm_player_seek(LmPlayer *p, uint32_t ms);
/* Counts an underrun when everything queued has played before the end, then fills up
 * to max_slots free slots. Reports ENDED once the last slot has played. */
LmPump lm_player_pump(LmPlayer *p, int max_slots);
/* Slots queued and not yet played. */
int lm_player_queued(const LmPlayer *p);
uint32_t lm_player_position(LmPlayer *p);
/* The probed duration; after the end, the length actually decoded. */
uint32_t lm_player_duration(const LmPlayer *p);

#endif
```

`runtime/hosts/3ds/src/localmedia_player.c`:

```c
/* MP3 playback engine; see localmedia_player.h. */
#include "localmedia_player.h"
#include "localmedia_tags.h"

#include <string.h>

#define MINIMP3_IMPLEMENTATION
#define MINIMP3_ONLY_MP3
#define MINIMP3_NO_SIMD
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wsign-compare"
#pragma GCC diagnostic ignored "-Wunused-function"
#endif
#include "minimp3.h"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

static void set_message(LmPlayer *p, const char *message) {
  snprintf(p->message, sizeof p->message, "%s", message);
}

/* Moves unread input to the front and reads more, never past the end of the audio. */
static void refill(LmPlayer *p) {
  size_t left = p->input_length - p->input_used;
  memmove(p->input, p->input + p->input_used, left);
  p->input_length = left;
  p->input_used = 0;
  long room = (long)(sizeof p->input - left);
  long until_end = p->stream.data_end - p->read_at;
  long take = room < until_end ? room : until_end;
  if (take <= 0) return;
  if (fseek(p->file, p->read_at, SEEK_SET) != 0) { p->error = 1; set_message(p, "Read error"); return; }
  size_t got = fread(p->input + left, 1, (size_t)take, p->file);
  if (got == 0 && ferror(p->file)) { p->error = 1; set_message(p, "Read error"); return; }
  p->input_length += got;
  p->read_at += (long)got;
}

static void restart_input(LmPlayer *p, long offset) {
  mp3dec_init(&p->decoder);
  p->input_length = p->input_used = 0;
  p->read_at = offset;
  p->eof = 0;
  p->junk = 0;
}

/* Decodes the next frame into p->pcm. Returns its per-channel frame count, or 0 at the
 * end of the stream or on error. */
static int decode_frame(LmPlayer *p, int *channels) {
  for (;;) {
    if (p->error) return 0;
    size_t avail = p->input_length - p->input_used;
    if (avail < 2048 && p->read_at < p->stream.data_end) { refill(p); avail = p->input_length - p->input_used; }
    if (avail == 0) { p->eof = 1; return 0; }
    mp3dec_frame_info_t info;
    memset(&info, 0, sizeof info);
    uint64_t start = p->sink->ticks(p->sink->ctx);
    int samples = mp3dec_decode_frame(&p->decoder, p->input + p->input_used, (int)avail, p->pcm, &info);
    p->decode_ticks += p->sink->ticks(p->sink->ctx) - start;
    if (info.frame_bytes == 0) {
      /* Not enough data for a frame: read more, or stop at the end of the audio. */
      if (p->read_at >= p->stream.data_end) { p->eof = 1; return 0; }
      refill(p);
      if (p->input_length - p->input_used == avail) { p->eof = 1; return 0; }
      continue;
    }
    p->input_used += (size_t)info.frame_bytes;
    if (samples > 0) {
      p->junk = 0;
      *channels = info.channels;
      return samples;
    }
    if (info.hz > 0) {
      /* A valid frame whose bit reservoir was lost (the first frames after a seek):
       * its time passes without audio. */
      p->decoded += (uint64_t)p->stream.first.samples;
      continue;
    }
    p->junk += info.frame_bytes;
    if (p->junk >= LM_JUNK_LIMIT) { p->error = 1; set_message(p, "MP3 data unreadable"); return 0; }
  }
}

int lm_player_open(LmPlayer *p, const LmSink *sink, const char *path) {
  memset(p, 0, sizeof *p);
  p->sink = sink;
  p->file = fopen(path, "rb");
  if (!p->file) { set_message(p, "File not found"); return 0; }
  fseek(p->file, 0, SEEK_END);
  long size = ftell(p->file);
  LmTags tags;
  lm_tags_read(p->file, size, &tags);
  if (!lm_stream_probe(p->file, tags.audio_start, tags.audio_end, &p->stream)) {
    set_message(p, "MP3 frame sync not found");
    fclose(p->file);
    p->file = NULL;
    return 0;
  }
  p->rate = p->stream.first.sample_rate;
  p->channels = p->stream.first.channels;
  sink->configure(sink->ctx, p->rate, p->channels);
  restart_input(p, p->stream.data_start);
  return 1;
}

void lm_player_close(LmPlayer *p) {
  if (!p->file) return;
  p->sink->clear(p->sink->ctx);
  fclose(p->file);
  p->file = NULL;
}

void lm_player_seek(LmPlayer *p, uint32_t ms) {
  if (!p->file) return;
  uint32_t duration = lm_player_duration(p);
  long at = -1;
  if (ms >= duration) ms = duration;
  else {
    long offset = lm_stream_seek_offset(&p->stream, ms);
    if (offset < p->stream.data_end) at = lm_stream_resync(p->file, offset, p->stream.data_end, &p->stream.first);
  }
  p->sink->clear(p->sink->ctx);
  restart_input(p, at < 0 ? p->stream.data_end : at);
  p->error = 0;
  p->base_ms = ms;
  p->decoded = 0;
  p->position_ms = ms;
  p->queued_once = 0;
  p->starved = 0;
}

int lm_player_queued(const LmPlayer *p) {
  int queued = 0;
  for (int slot = 0; slot < LM_SLOTS; slot++) queued += !p->sink->slot_free(p->sink->ctx, slot);
  return queued;
}

static uint32_t frames_ms(const LmPlayer *p, uint64_t frames) {
  return p->base_ms + (uint32_t)(frames * 1000 / (uint64_t)p->rate);
}

static uint32_t decoded_ms(const LmPlayer *p) {
  return frames_ms(p, p->decoded);
}

/* Fills one slot; returns its frame count (0 when nothing was left to decode). */
static int fill_slot(LmPlayer *p, int slot) {
  int16_t *out = p->sink->slot_data(p->sink->ctx, slot);
  int frames = 0;
  uint64_t start = p->decoded;
  while (frames + 1152 <= LM_SLOT_FRAMES) {
    int channels = p->channels;
    int samples = decode_frame(p, &channels);
    if (samples == 0) break;
    int16_t *dst = out + frames * p->channels;
    if (channels == p->channels) memcpy(dst, p->pcm, (size_t)samples * (size_t)channels * sizeof *dst);
    else if (p->channels == 2) for (int i = 0; i < samples; i++) dst[i * 2] = dst[i * 2 + 1] = p->pcm[i];
    else for (int i = 0; i < samples; i++) dst[i] = (int16_t)((p->pcm[i * 2] + p->pcm[i * 2 + 1]) / 2);
    frames += samples;
    p->decoded += (uint64_t)samples;
  }
  if (frames > 0) {
    p->slot_start[slot] = start;
    p->sink->queue(p->sink->ctx, slot, frames);
    p->queued_once = 1;
    p->starved = 0;
  }
  return frames;
}

LmPump lm_player_pump(LmPlayer *p, int max_slots) {
  if (!p->file) return LM_PUMP_ERROR;
  int queued = lm_player_queued(p);
  if (queued == 0 && p->queued_once && !p->eof && !p->error && !p->starved) {
    p->underruns++;
    p->starved = 1;
  }
  for (int slot = 0; slot < LM_SLOTS && max_slots > 0 && !p->eof && !p->error; slot++) {
    if (!p->sink->slot_free(p->sink->ctx, slot)) continue;
    if (fill_slot(p, slot) > 0) { queued++; max_slots--; }
  }
  if (queued > 0) return LM_PUMP_PLAYING;
  if (p->error) return LM_PUMP_ERROR;
  if (p->eof) {
    p->position_ms = decoded_ms(p);
    return LM_PUMP_ENDED;
  }
  return LM_PUMP_PLAYING;
}

uint32_t lm_player_position(LmPlayer *p) {
  uint32_t played;
  int slot = p->sink->playing(p->sink->ctx, &played);
  if (slot >= 0) {
    uint32_t ms = frames_ms(p, p->slot_start[slot] + played);
    if (ms > p->position_ms) p->position_ms = ms;
  } else if (p->queued_once) {
    /* Nothing is playing: everything decoded so far has been heard. */
    uint32_t ms = decoded_ms(p);
    if (ms > p->position_ms) p->position_ms = ms;
  }
  return p->position_ms;
}

uint32_t lm_player_duration(const LmPlayer *p) {
  if (p->eof && lm_player_queued(p) == 0) return decoded_ms(p);
  return p->stream.duration_ms;
}
```

- [ ] **Step 4: Run.** `cd runtime && bun test tests/localmedia-native.test.ts`. Expected: `6 pass, 0 fail`.

- [ ] **Step 5: Commit in the fork.**

```bash
git -C runtime add hosts/3ds/src/localmedia_player.h hosts/3ds/src/localmedia_player.c tests/fixtures/localmedia/player-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): MP3 playback engine over an audio sink"
```

---

### Task 8: `media.local` in the 3DS host (fork)

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia.{h,c}`.
- Modify:
  - `runtime/hosts/3ds/src/qjs.c` (the `localmedia` namespace and `localmedia_forget_guest`);
  - `runtime/hosts/3ds/src/main.c` (start and stop);
  - `runtime/hosts/3ds/Makefile` (objects, `-I vendor`, `POCKETJS_LOCALMEDIA`);
  - `runtime/tools/3ds.ts` (the feature flag);
  - `runtime/tools/3ds-profile.ts` (`media.local`, hostAbi 12, and rejecting `media.playback` + `media.local`);
  - `runtime/tests/3ds-profile.test.ts`, `runtime/tests/localmedia.test.ts`.

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces the global `localmedia` namespace on a 3DS build with `media.local`: `scan`, `tracks`, `open`, `paused`, `seek`, `volume`, `status`, `artwork` and `releaseArtwork` (the contract v2 `LocalMediaOps`).
- Produces `THREE_DS_DEV_HOST_ABI = 12`. `resolve3dsBuildPlan` throws "media.playback and media.local both drive NDSP" when both are declared.

- [ ] **Step 1: Watch the tests fail.**
  - Save the patch as `$TMPDIR/t8.patch`.
  - Run `git -C runtime apply --include='tests/*' $TMPDIR/t8.patch`, then `cd runtime && bun test tests/3ds-profile.test.ts tests/localmedia.test.ts`.
  - Expected: `4 fail`, e.g. `target 3ds-dev does not provide media.local`.

```diff
diff --git a/hosts/3ds/Makefile b/hosts/3ds/Makefile
index 3f468f1d..1f88426d 100644
--- a/hosts/3ds/Makefile
+++ b/hosts/3ds/Makefile
@@ -84,7 +84,7 @@ CFLAGS := -Wall -Wextra -O2 -g -std=gnu11 -mword-relocations -ffunction-sections
   -DPOCKETJS_AUX_VIEW_W=$(POCKETJS_AUX_LOGICAL_WIDTH) \
   -DPOCKETJS_AUX_VIEW_H=$(POCKETJS_AUX_LOGICAL_HEIGHT) \
   -DPOCKETJS_RASTER_DENSITY=$(POCKETJS_RASTER_DENSITY) \
-  -I$(INCLUDE_DIR) -I$(POCKETJS_PICA_INCLUDE) -I$(BUILD) -I$(POCKETJS_QUICKJS_DIR) \
+  -I$(INCLUDE_DIR) -I$(CURDIR)/vendor -I$(POCKETJS_PICA_INCLUDE) -I$(BUILD) -I$(POCKETJS_QUICKJS_DIR) \
   -I$(DEVKITPRO)/libctru/include
 
 ifeq ($(POCKETJS_OFFLOAD),1)
@@ -95,6 +95,10 @@ ifeq ($(POCKETJS_MEDIA),1)
 CFLAGS += -DPOCKETJS_MEDIA
 endif
 
+ifeq ($(POCKETJS_LOCALMEDIA),1)
+CFLAGS += -DPOCKETJS_LOCALMEDIA
+endif
+
 ifeq ($(POCKETJS_CAPTURE),1)
 CFLAGS += -DPOCKETJS_CAPTURE \
   -DPOCKETJS_CAPTURE_INPUT='"$(POCKETJS_CAPTURE_INPUT)"' \
@@ -107,7 +111,7 @@ LDFLAGS := -specs=3dsx.specs $(ARCH) -Wl,--gc-sections -Wl,-Map,$(BUILD)/pocketj
 LIBPATHS := -L$(DEVKITPRO)/libctru/lib
 LIBS := -lcitro3d -lctru -lm
 
-OBJECTS := $(BUILD)/main.o $(BUILD)/media.o $(BUILD)/offload.o $(BUILD)/soc.o $(BUILD)/svcwire.o $(BUILD)/runtime.o $(BUILD)/dev_protocol.o $(BUILD)/devserver.o $(BUILD)/devmenu.o $(BUILD)/native.o $(BUILD)/hbldr.o $(BUILD)/gfx.o $(BUILD)/qjs.o $(BUILD)/input.o $(BUILD)/vshader_shbin.o
+OBJECTS := $(BUILD)/main.o $(BUILD)/media.o $(BUILD)/localmedia.o $(BUILD)/localmedia_ids.o $(BUILD)/localmedia_tags.o $(BUILD)/localmedia_mp3.o $(BUILD)/localmedia_art.o $(BUILD)/localmedia_library.o $(BUILD)/localmedia_player.o $(BUILD)/offload.o $(BUILD)/soc.o $(BUILD)/svcwire.o $(BUILD)/runtime.o $(BUILD)/dev_protocol.o $(BUILD)/devserver.o $(BUILD)/devmenu.o $(BUILD)/native.o $(BUILD)/hbldr.o $(BUILD)/gfx.o $(BUILD)/qjs.o $(BUILD)/input.o $(BUILD)/vshader_shbin.o
 ELF := $(BUILD)/pocketjs-3ds.elf
 SMDH := $(BUILD)/pocketjs-3ds.smdh
 
@@ -155,6 +159,14 @@ $(BUILD)/offload.o: $(SOURCE)/offload.h $(SOURCE)/offload_queue.h
 $(BUILD)/qjs.o: $(SOURCE)/offload.h $(SOURCE)/offload_coverage.h
 $(BUILD)/media.o: $(SOURCE)/media.h $(SOURCE)/media_wire.h $(SOURCE)/media_adpcm.h
 $(BUILD)/main.o $(BUILD)/qjs.o $(BUILD)/gfx.o: $(SOURCE)/media.h
+$(BUILD)/main.o $(BUILD)/qjs.o: $(SOURCE)/localmedia.h
+$(BUILD)/localmedia.o: $(wildcard $(SOURCE)/localmedia*.h)
+$(BUILD)/localmedia_library.o: $(SOURCE)/localmedia_library.h $(SOURCE)/localmedia_ids.h $(SOURCE)/localmedia_tags.h $(SOURCE)/localmedia_mp3.h
+$(BUILD)/localmedia_player.o: $(SOURCE)/localmedia_player.h $(SOURCE)/localmedia_mp3.h $(SOURCE)/localmedia_tags.h $(CURDIR)/vendor/minimp3.h
+$(BUILD)/localmedia_art.o: $(SOURCE)/localmedia_art.h $(CURDIR)/vendor/stb_image.h
+$(BUILD)/localmedia_ids.o: $(SOURCE)/localmedia_ids.h
+$(BUILD)/localmedia_tags.o: $(SOURCE)/localmedia_tags.h
+$(BUILD)/localmedia_mp3.o: $(SOURCE)/localmedia_mp3.h
 
 $(ELF): $(OBJECTS) $(POCKETJS_CORE_LIB) $(POCKETJS_QUICKJS_DIR)/libquickjs.a
 	$(CC) $(LDFLAGS) $(OBJECTS) $(POCKETJS_CORE_LIB) $(POCKETJS_QUICKJS_DIR)/libquickjs.a \
diff --git a/hosts/3ds/src/main.c b/hosts/3ds/src/main.c
index 12625dea..a4dce68d 100644
--- a/hosts/3ds/src/main.c
+++ b/hosts/3ds/src/main.c
@@ -34,6 +34,7 @@
 #include "qjs.h"
 #include "offload.h"
 #include "media.h"
+#include "localmedia.h"
 #include "devserver.h"
 #include "devmenu.h"
 #include "hbldr.h"
@@ -760,6 +761,9 @@ int main(void) {
 #ifdef POCKETJS_MEDIA
   if (!media_start()) { media_stop(); fail("Media worker allocation failed"); }
 #endif
+#ifdef POCKETJS_LOCALMEDIA
+  if (!localmedia_start()) { localmedia_stop(); fail("Local media allocation failed"); }
+#endif
 #ifdef POCKETJS_OFFLOAD
   GuestChoice guest = package_choice(embedded, 0, &runtime_state);
   guest.commit_on_accept = false;
@@ -1116,6 +1120,9 @@ int main(void) {
   offload_stop();
 #ifdef POCKETJS_MEDIA
   media_stop();
+#endif
+#ifdef POCKETJS_LOCALMEDIA
+  localmedia_stop();
 #endif
   input_shutdown();
   teardown_guest();
diff --git a/hosts/3ds/src/qjs.c b/hosts/3ds/src/qjs.c
index 5062f8be..edc0ee88 100644
--- a/hosts/3ds/src/qjs.c
+++ b/hosts/3ds/src/qjs.c
@@ -21,6 +21,7 @@
 #include "qjs.h"
 #include "offload.h"
 #include "media.h"
+#include "localmedia.h"
 #include "offload_coverage.h"
 
 #include <stdlib.h>
@@ -52,6 +53,8 @@
 
 typedef enum {
   HostMediaOpen, HostMediaClose, HostMediaPaused, HostMediaVolume, HostMediaTexture, HostMediaStatus,
+  HostLocalScan, HostLocalTracks, HostLocalOpen, HostLocalPaused, HostLocalSeek, HostLocalVolume, HostLocalStatus,
+  HostLocalArtwork, HostLocalReleaseArtwork,
   HostOffloadSession, HostOffloadSubmit, HostOffloadTake, HostOffloadCoverage,
   HostCreateNode,
   HostDestroyNode,
@@ -274,6 +277,25 @@ static JSValue host_operation(
     case HostMediaStatus: {
       char status[640]; media_snapshot(status,sizeof status); return JS_NewString(ctx,status);
     }
+#endif
+#ifdef POCKETJS_LOCALMEDIA
+    case HostLocalScan: return JS_NewBool(ctx, localmedia_scan());
+    case HostLocalTracks: {
+      size_t length = 0;
+      const char *json = localmedia_tracks(&length);
+      return JS_NewStringLen(ctx, json, length);
+    }
+    case HostLocalOpen: return JS_NewInt32(ctx, localmedia_open(argument_int(ctx, argc, argv, 0)));
+    case HostLocalPaused: localmedia_paused(argc > 0 && JS_ToBool(ctx, argv[0])); return JS_UNDEFINED;
+    case HostLocalSeek: localmedia_seek(argument_float(ctx, argc, argv, 0)); return JS_UNDEFINED;
+    case HostLocalVolume: localmedia_volume(argument_float(ctx, argc, argv, 0)); return JS_UNDEFINED;
+    case HostLocalStatus: {
+      char status[512];
+      localmedia_status(status, sizeof status);
+      return JS_NewString(ctx, status);
+    }
+    case HostLocalArtwork: return JS_NewInt32(ctx, localmedia_artwork(argument_int(ctx, argc, argv, 0)));
+    case HostLocalReleaseArtwork: localmedia_release_artwork(argument_int(ctx, argc, argv, 0)); return JS_UNDEFINED;
 #endif
     case HostCreateNode:
       return JS_NewInt32(ctx, ui_create_node((uint32_t)argument_int(ctx, argc, argv, 0)));
@@ -649,6 +671,19 @@ static void install_host(void) {
   add_operation(media,"status",0,HostMediaStatus);
   JS_SetPropertyStr(context,global,"media",media);
 #endif
+#ifdef POCKETJS_LOCALMEDIA
+  JSValue localmedia = JS_NewObject(context);
+  add_operation(localmedia, "scan", 0, HostLocalScan);
+  add_operation(localmedia, "tracks", 0, HostLocalTracks);
+  add_operation(localmedia, "open", 1, HostLocalOpen);
+  add_operation(localmedia, "paused", 1, HostLocalPaused);
+  add_operation(localmedia, "seek", 1, HostLocalSeek);
+  add_operation(localmedia, "volume", 1, HostLocalVolume);
+  add_operation(localmedia, "status", 0, HostLocalStatus);
+  add_operation(localmedia, "artwork", 1, HostLocalArtwork);
+  add_operation(localmedia, "releaseArtwork", 1, HostLocalReleaseArtwork);
+  JS_SetPropertyStr(context, global, "localmedia", localmedia);
+#endif
 #ifdef POCKETJS_OFFLOAD
   JSValue offload = JS_NewObject(context);
   add_operation(offload, "uploadCoverage", 6, HostOffloadCoverage);
@@ -921,6 +956,9 @@ const char *qjs_last_error(void) {
 void qjs_shutdown(void) {
 #ifdef POCKETJS_MEDIA
   media_forget_guest();
+#endif
+#ifdef POCKETJS_LOCALMEDIA
+  localmedia_forget_guest();
 #endif
   if (context != NULL) {
     JS_FreeValue(context, frame_function);
diff --git a/tests/3ds-profile.test.ts b/tests/3ds-profile.test.ts
index 1e8cb3c9..59b58e68 100644
--- a/tests/3ds-profile.test.ts
+++ b/tests/3ds-profile.test.ts
@@ -104,6 +104,7 @@ describe("private Nintendo 3DS build profile", () => {
       capabilities: [
         "io.offload",
         "media.playback",
+        "media.local",
         "input.analog.left",
         "input.analog.right",
         "input.buttons",
@@ -121,9 +122,10 @@ describe("private Nintendo 3DS build profile", () => {
     // hostAbi is one sequence across every profile, private ones included:
     // 1 psp, 2 vita, 3 macos-widget, 4 symbian-e7-dev, 5 pocketbook,
     // 6 iphone2g-dev, 7 top-screen-only 3DS, 8 dual-screen 3DS,
-    // 9 Blackberry Classic, 10 companion media, 11 2D bodies (ui.physics).
+    // 9 Blackberry Classic, 10 companion media, 11 2D bodies (ui.physics),
+    // 12 on-device MP3 playback (media.local).
     // A collision would let a bundle mount on the wrong host.
-    expect(THREE_DS_DEV_HOST_ABI).toBe(11);
+    expect(THREE_DS_DEV_HOST_ABI).toBe(12);
     expect(
       Object.values(POCKET_TARGETS).map((profile) => profile.hostAbi),
     ).not.toContain(THREE_DS_DEV_HOST_ABI);
diff --git a/tests/localmedia.test.ts b/tests/localmedia.test.ts
index 2de4ac5e..86211040 100644
--- a/tests/localmedia.test.ts
+++ b/tests/localmedia.test.ts
@@ -73,17 +73,22 @@ test("status and tracks are parsed and validated", () => {
   expect(LOCALMEDIA).toEqual({ version: 2, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 });
 });
 
-test("media.local is a registered capability that the 3DS profile does not advertise yet", () => {
+const probeManifest = (requires: string[]) => ({
+  $schema: "https://pocketjs.dev/schema/pocket-2.json",
+  pocket: 2, id: "dev.example.probe", name: "probe", title: "Probe", version: "0.1.0",
+  engine: { capabilities: { requires: ["text.glyphs.baked", "input.buttons", "display.auxiliary", ...requires] } },
+  app: {
+    entry: "app/main.tsx", output: "probe-main", framework: "solid",
+    viewport: { fixed: { logical: [400, 240], presentation: "native" } },
+    surfaces: { auxiliary: { fixed: { logical: [320, 240], presentation: "native" } } },
+  },
+});
+
+test("the 3DS profile ships media.local", () => {
   expect(POCKET_CAPABILITIES).toContain("media.local");
-  const plan = resolve3dsBuildPlan({
-    $schema: "https://pocketjs.dev/schema/pocket-2.json",
-    pocket: 2, id: "dev.example.probe", name: "probe", title: "Probe", version: "0.1.0",
-    engine: { capabilities: { requires: ["text.glyphs.baked", "input.buttons", "display.auxiliary"], enhances: ["media.local"] } },
-    app: {
-      entry: "app/main.tsx", output: "probe-main", framework: "solid",
-      viewport: { fixed: { logical: [400, 240], presentation: "native" } },
-      surfaces: { auxiliary: { fixed: { logical: [320, 240], presentation: "native" } } },
-    },
-  });
-  expect(plan.features["media.local"]).toBe(false);
+  expect(resolve3dsBuildPlan(probeManifest(["media.local"])).features["media.local"]).toBe(true);
+});
+
+test("a 3DS app cannot declare both NDSP owners", () => {
+  expect(() => resolve3dsBuildPlan(probeManifest(["media.local", "media.playback"]))).toThrow("media.playback and media.local both drive NDSP");
 });
diff --git a/tools/3ds-profile.ts b/tools/3ds-profile.ts
index 415115b8..a2461905 100644
--- a/tools/3ds-profile.ts
+++ b/tools/3ds-profile.ts
@@ -18,7 +18,7 @@ import { validateAndResolveBuildPlan } from "../framework/src/manifest/resolve.t
  * input.touch.auxiliary.
  */
 export const THREE_DS_DEV_TARGET_ID = "3ds-dev";
-export const THREE_DS_DEV_HOST_ABI = 11;
+export const THREE_DS_DEV_HOST_ABI = 12;
 export const THREE_DS_VIEWPORT = [400, 240] as const;
 export const THREE_DS_AUXILIARY_VIEWPORT = [320, 240] as const;
 
@@ -44,6 +44,7 @@ export const THREE_DS_DEV_CONTRACTS = definePlatformContractRegistry(
       capabilities: [
         "io.offload",
         "media.playback",
+        "media.local",
         "input.analog.left",
         "input.analog.right",
         "input.buttons",
@@ -70,5 +71,9 @@ export function resolve3dsBuildPlan(input: unknown): ResolvedBuildPlan {
         .join("; ")}`,
     );
   }
+  // media.c and localmedia.c each own NDSP channel 0 for the life of the host.
+  if (resolution.plan.features["media.playback"] && resolution.plan.features["media.local"]) {
+    throw new Error("pocket 3ds: media.playback and media.local both drive NDSP; declare only one");
+  }
   return resolution.plan;
 }
diff --git a/tools/3ds.ts b/tools/3ds.ts
index c01ab9d8..924fce2b 100644
--- a/tools/3ds.ts
+++ b/tools/3ds.ts
@@ -766,6 +766,7 @@ export async function build3ds(argv: readonly string[]): Promise<string> {
     POCKETJS_OUT_3DSX: containerPathFor(output, mounts),
     POCKETJS_OFFLOAD: plan.features["io.offload"] ? "1" : "",
     POCKETJS_MEDIA: plan.features["media.playback"] ? "1" : "",
+    POCKETJS_LOCALMEDIA: plan.features["media.local"] ? "1" : "",
     POCKETJS_OFFLOAD_SLOT: createHash("sha256").update(plan.app.id).digest("hex").slice(0, 16),
     POCKETJS_SMDH_TITLE: plan.app.title,
     POCKETJS_SMDH_AUTHOR: plan.app.id,
```

- [ ] **Step 2: Implement the wiring.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t8.patch`.

- [ ] **Step 3: Implement the host module.**

`runtime/hosts/3ds/src/localmedia.h`:

```c
#ifndef POCKETJS_3DS_LOCALMEDIA_H
#define POCKETJS_3DS_LOCALMEDIA_H
/* media.local on the 3DS: the UI-thread side of contracts/spec/localmedia.ts.
 * Every function here returns without file, decoder or NDSP work; the audio
 * thread and the library worker in localmedia.c do that. */
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
bool localmedia_start(void);
void localmedia_stop(void);
/* The guest is going away: stop playback and free the art textures it held. */
void localmedia_forget_guest(void);
bool localmedia_scan(void);
/* JSON LocalTrack[] of the last completed scan; valid until the next localmedia call. */
const char *localmedia_tracks(size_t *length);
int32_t localmedia_open(int32_t id);
void localmedia_paused(bool paused);
void localmedia_seek(double ms);
void localmedia_volume(double volume);
void localmedia_status(char *out, size_t capacity);
int32_t localmedia_artwork(int32_t id);
void localmedia_release_artwork(int32_t handle);
#endif
```

`runtime/hosts/3ds/src/localmedia.c`:

```c
/* media.local on the 3DS. Three threads share the app core:
 *   UI      — the localmedia_* calls: posts commands, publishes each command's
 *             snapshot, reads status, uploads finished art, frees textures.
 *   audio   — one priority step above the UI: NDSP, minimp3, the open file.
 *   library — below the UI: folder scan, tags, art decode.
 * Commands and results cross threads through atomics only (as media.c). */
#include "localmedia.h"
#include "localmedia_art.h"
#include "localmedia_ids.h"
#include "localmedia_library.h"
#include "localmedia_player.h"
#include "pocket_core.h"
#include <3ds.h>
#include <math.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ROOT "sdmc:/music/"
#define MAX_TRACKS 2048
#define CHANNEL 0
#define PREFILL_SLOTS 4
#define WAKE_NS 10000000LL
#define MAX_ART_HANDLES 32

enum { IDLE, LOADING, PLAYING, PAUSED, ENDED, FAILED };
enum { ERR_NONE, ERR_NOT_FOUND, ERR_NO_SYNC, ERR_UNREADABLE, ERR_READ, ERR_DSP_FIRMWARE, ERR_AUDIO };
static const char *const PHASES[] = {"idle", "loading", "playing", "paused", "ended", "error"};
static const char *const ERRORS[] = {"", "File not found", "MP3 frame sync not found", "MP3 data unreadable", "Read error",
                                     "DSP firmware missing; dump it in Rosalina", "Audio unavailable"};

/* A latest-wins mailbox slot. The UI thread writes under an odd sequence number;
 * a reader copies and retries until the sequence was even and unchanged. */
typedef struct {
  _Atomic unsigned sequence;
  unsigned generation;          /* 0: never written */
  uint32_t ms;
  long offset, raw_bytes;
  int unsync;
  char path[300];               /* open: the file ("" stops playback) */
} Mail;

_Static_assert(ATOMIC_INT_LOCK_FREE == 2, "media.local handoff must be lock-free");

static void mail_write(Mail *mail, const Mail *value) {
  unsigned sequence = atomic_load_explicit(&mail->sequence, memory_order_relaxed);
  atomic_store_explicit(&mail->sequence, sequence + 1, memory_order_relaxed);
  atomic_thread_fence(memory_order_release);
  mail->generation = value->generation;
  mail->ms = value->ms;
  mail->offset = value->offset;
  mail->raw_bytes = value->raw_bytes;
  mail->unsync = value->unsync;
  memcpy(mail->path, value->path, sizeof mail->path);
  atomic_store_explicit(&mail->sequence, sequence + 2, memory_order_release);
}

static void mail_read(Mail *mail, Mail *copy) {
  for (;;) {
    unsigned before = atomic_load_explicit(&mail->sequence, memory_order_acquire);
    if (before & 1) { svcSleepThread(100000); continue; }
    copy->generation = mail->generation;
    copy->ms = mail->ms;
    copy->offset = mail->offset;
    copy->raw_bytes = mail->raw_bytes;
    copy->unsync = mail->unsync;
    memcpy(copy->path, mail->path, sizeof copy->path);
    atomic_thread_fence(memory_order_acquire);
    if (atomic_load_explicit(&mail->sequence, memory_order_relaxed) == before) return;
  }
}

/* ---- shared state ---------------------------------------------------------- */
static _Atomic bool running;
static Thread audio_thread, library_thread;
static LightEvent audio_wake, library_wake;
static Mail open_mail, seek_mail, art_mail;
static _Atomic unsigned requested;       /* generation of the newest playback command */
static _Atomic unsigned published;       /* generation the audio thread's fields describe */
static _Atomic unsigned work_phase, work_position, work_duration, work_error;
static _Atomic unsigned underruns, decode_load;
static _Atomic bool paused_flag;
static _Atomic unsigned volume_percent = 100;
static bool audio_ok;
static Result audio_result;

/* Library worker. */
static _Atomic bool scan_requested, scanning;
static _Atomic int scan_stop;
static LmLibrary *_Atomic pending_library;
static _Atomic unsigned art_done_generation; /* request generation the result belongs to */
static _Atomic bool art_done_ok;
static uint8_t *art_pixels;               /* written by the worker before art_done_generation */

/* ---- UI-thread state ----------------------------------------------------------- */
static LmIds *ids;
static LmLibrary *library;
static unsigned scan_generation;
static unsigned open_serial;
static int32_t command_track = -1;
static unsigned command_phase = IDLE, command_position, command_duration;
static bool resumed_while_loading;
static int32_t art_id = -1;
static unsigned art_generation;
static bool art_handed_out;
static int32_t art_handles[MAX_ART_HANDLES];
static int art_handle_count;
static int32_t reserved_handle = -1;

/* ---- NDSP sink (audio thread) ----------------------------------------------- */
static ndspWaveBuf waves[LM_SLOTS];
static int16_t *wave_data[LM_SLOTS];
static int sink_channels = 2;

static int sink_free(void *ctx, int slot) {
  (void)ctx;
  return waves[slot].status == NDSP_WBUF_FREE || waves[slot].status == NDSP_WBUF_DONE;
}
static int16_t *sink_data(void *ctx, int slot) { (void)ctx; return wave_data[slot]; }
static void sink_queue(void *ctx, int slot, int frames) {
  (void)ctx;
  waves[slot].nsamples = (u32)frames;
  DSP_FlushDataCache(wave_data[slot], (u32)frames * (u32)sink_channels * 2);
  ndspChnWaveBufAdd(CHANNEL, &waves[slot]);
}
static void apply_mix(void) {
  float mix[12] = {0};
  mix[0] = mix[1] = (float)atomic_load(&volume_percent) / 100.f;
  ndspChnSetMix(CHANNEL, mix);
}
static void sink_configure(void *ctx, int rate, int channels) {
  (void)ctx;
  sink_channels = channels;
  ndspChnReset(CHANNEL);
  ndspChnSetInterp(CHANNEL, NDSP_INTERP_LINEAR);
  ndspChnSetRate(CHANNEL, (float)rate);
  ndspChnSetFormat(CHANNEL, channels == 1 ? NDSP_FORMAT_MONO_PCM16 : NDSP_FORMAT_STEREO_PCM16);
  apply_mix();
}
static void sink_clear(void *ctx) {
  (void)ctx;
  ndspChnWaveBufClear(CHANNEL);
  for (int i = 0; i < LM_SLOTS; i++) waves[i].status = NDSP_WBUF_FREE;
}
static int sink_playing(void *ctx, uint32_t *played) {
  (void)ctx;
  for (int i = 0; i < LM_SLOTS; i++)
    if (waves[i].status == NDSP_WBUF_PLAYING) { *played = ndspChnGetSamplePos(CHANNEL); return i; }
  return -1;
}
static uint64_t sink_ticks(void *ctx) { (void)ctx; return svcGetSystemTick(); }
static const LmSink SINK = {NULL, sink_free, sink_data, sink_queue, sink_configure, sink_clear, sink_playing, sink_ticks};

/* ---- audio thread ------------------------------------------------------------ */
static LmPlayer player;
static bool player_open;

static bool current(unsigned generation) { return atomic_load(&running) && atomic_load(&requested) == generation; }

/* Publishes the audio thread's view of the generation it is working for. */
static void publish(unsigned generation, unsigned phase, unsigned error) {
  if (!current(generation)) return;
  atomic_store(&work_phase, phase);
  atomic_store(&work_error, error);
  atomic_store(&work_position, player_open ? lm_player_position(&player) : 0);
  if (player_open) atomic_store(&work_duration, lm_player_duration(&player));
  atomic_store(&underruns, player.underruns);
  atomic_store_explicit(&published, generation, memory_order_release);
}

static unsigned error_of(const char *message) {
  for (unsigned i = 1; i < sizeof ERRORS / sizeof ERRORS[0]; i++)
    if (strcmp(message, ERRORS[i]) == 0) return i;
  return ERR_READ;
}

static void close_player(void) {
  if (player_open) lm_player_close(&player);
  player_open = false;
}

static void audio_main(void *unused) {
  (void)unused;
  unsigned generation = 0, phase = IDLE, handled_open = 0, handled_seek = 0;
  bool applied_paused = false;
  unsigned applied_volume = 100;
  uint64_t window_start = svcGetSystemTick(), window_decode = 0;
  while (atomic_load(&running)) {
    /* Latest-wins: the newest open (or stop), then a seek newer than it. */
    Mail mail;
    mail_read(&open_mail, &mail);
    bool restart = false;
    if (mail.generation > handled_open) {
      handled_open = mail.generation;
      generation = mail.generation;
      close_player();
      phase = IDLE;
      if (mail.path[0] == '\0') {
        /* stop */
      } else if (!audio_ok) {
        unsigned code = audio_result == (Result)MAKERESULT(RL_PERMANENT, RS_NOTFOUND, RM_DSP, RD_NOT_FOUND) ? ERR_DSP_FIRMWARE : ERR_AUDIO;
        phase = FAILED;
        publish(generation, FAILED, code);
      } else if (!lm_player_open(&player, &SINK, mail.path)) {
        phase = FAILED;
        publish(generation, FAILED, error_of(player.message));
      } else {
        player_open = true;
        restart = true;
      }
    }
    mail_read(&seek_mail, &mail);
    if (mail.generation > handled_seek && mail.generation > handled_open) {
      handled_seek = mail.generation;
      generation = mail.generation;
      if (player_open) { lm_player_seek(&player, mail.ms); restart = true; }
    }
    if (restart) {
      applied_paused = atomic_load(&paused_flag);
      ndspChnSetPaused(CHANNEL, applied_paused);
      LmPump state = lm_player_pump(&player, PREFILL_SLOTS);
      phase = state == LM_PUMP_ERROR ? FAILED : state == LM_PUMP_ENDED ? ENDED : PLAYING;
      publish(generation, phase, phase == FAILED ? error_of(player.message) : ERR_NONE);
    }
    bool paused = atomic_load(&paused_flag);
    if (paused != applied_paused) { ndspChnSetPaused(CHANNEL, paused); applied_paused = paused; }
    unsigned volume = atomic_load(&volume_percent);
    if (volume != applied_volume && audio_ok) { apply_mix(); applied_volume = volume; }
    bool hurry = false;
    if (player_open && phase == PLAYING) {
      uint64_t before = player.decode_ticks;
      LmPump state = lm_player_pump(&player, 1);
      window_decode += player.decode_ticks - before;
      if (state == LM_PUMP_ENDED) phase = ENDED;
      else if (state == LM_PUMP_ERROR) phase = FAILED;
      hurry = phase == PLAYING && !paused && lm_player_queued(&player) < PREFILL_SLOTS;
      publish(generation, phase, phase == FAILED ? error_of(player.message) : ERR_NONE);
    }
    uint64_t now = svcGetSystemTick();
    if (now - window_start >= SYSCLOCK_ARM11) {
      atomic_store(&decode_load, (unsigned)(window_decode * 100 / (now - window_start)));
      window_start = now;
      window_decode = 0;
    }
    if (!hurry) LightEvent_WaitTimeout(&audio_wake, WAKE_NS);
  }
  close_player();
}

/* ---- library worker ------------------------------------------------------------ */
static void library_main(void *unused) {
  (void)unused;
  unsigned handled_art = 0;
  while (atomic_load(&running)) {
    LightEvent_WaitTimeout(&library_wake, 50000000LL);
    if (atomic_exchange(&scan_requested, false)) {
      LmLibrary *scanned = lm_library_scan(ROOT, ids, MAX_TRACKS, &scan_stop);
      if (!scanned && !atomic_load(&scan_stop)) scanned = lm_library_empty();
      LmLibrary *old = atomic_exchange(&pending_library, scanned);
      lm_library_free(old);
      if (!scanned) atomic_store(&scanning, false);
    }
    Mail request;
    mail_read(&art_mail, &request);
    if (request.generation == 0 || request.generation == handled_art) continue;
    handled_art = request.generation;
    bool ok = false;
    FILE *file = fopen(request.path, "rb");
    if (file) {
      uint8_t *data;
      size_t length = lm_art_read(file, request.offset, request.raw_bytes, request.unsync, &data);
      fclose(file);
      ok = length > 0 && lm_art_decode(data, length, art_pixels);
      free(data);
    }
    atomic_store(&art_done_ok, ok);
    atomic_store_explicit(&art_done_generation, request.generation, memory_order_release);
  }
}

/* ---- UI thread ------------------------------------------------------------------ */
static void adopt_scan(void) {
  LmLibrary *scanned = atomic_exchange(&pending_library, NULL);
  if (!scanned) return;
  lm_library_free(library);
  library = scanned;
  scan_generation++;
  atomic_store(&scanning, false);
}

/* Posts an open (path, "" to stop) or a seek as the newest playback command. */
static void post(Mail *slot, uint32_t ms, const char *path) {
  Mail mail = {0};
  mail.ms = ms;
  if (path) snprintf(mail.path, sizeof mail.path, "%s", path);
  mail.generation = atomic_fetch_add(&requested, 1) + 1;
  mail_write(slot, &mail);
  LightEvent_Signal(&audio_wake);
}

/* The phase the guest sees: the newest command's snapshot until the audio thread
 * has published for that command, then the audio thread's view. */
static unsigned base_phase(unsigned *position, unsigned *duration, unsigned *error) {
  if (atomic_load_explicit(&published, memory_order_acquire) == atomic_load(&requested)) {
    *position = atomic_load(&work_position);
    *duration = atomic_load(&work_duration);
    *error = atomic_load(&work_error);
    return atomic_load(&work_phase);
  }
  *position = command_position;
  *duration = command_duration;
  *error = ERR_NONE;
  return command_phase;
}

static unsigned visible_phase(unsigned base) {
  bool paused = atomic_load(&paused_flag);
  if ((base == PLAYING || base == LOADING) && paused) return PAUSED;
  if (base == LOADING && resumed_while_loading) return PLAYING;
  return base;
}

bool localmedia_start(void) {
  ids = lm_ids_create();
  library = lm_library_empty();
  art_pixels = malloc(LM_ART_PIXELS_BYTES);
  if (!ids || !library || !art_pixels) return false;
  audio_result = ndspInit();
  audio_ok = R_SUCCEEDED(audio_result);
  if (audio_ok) {
    ndspSetOutputMode(NDSP_OUTPUT_STEREO);
    for (int i = 0; i < LM_SLOTS; i++) {
      wave_data[i] = linearMemAlign(LM_SLOT_FRAMES * 2 * sizeof(int16_t), 0x80);
      if (!wave_data[i]) return false;
      memset(&waves[i], 0, sizeof waves[i]);
      waves[i].data_vaddr = wave_data[i];
      waves[i].status = NDSP_WBUF_FREE;
    }
  }
  LightEvent_Init(&audio_wake, RESET_ONESHOT);
  LightEvent_Init(&library_wake, RESET_ONESHOT);
  s32 priority = 0x30;
  svcGetThreadPriority(&priority, CUR_THREAD_HANDLE);
  s32 audio_priority = priority - 1 < 0x18 ? 0x18 : priority - 1;
  atomic_store(&running, true);
  audio_thread = threadCreate(audio_main, NULL, 64 * 1024, audio_priority, -2, false);
  library_thread = threadCreate(library_main, NULL, 64 * 1024, 0x3f, -2, false);
  return audio_thread && library_thread;
}

void localmedia_stop(void) {
  atomic_store(&running, false);
  atomic_store(&scan_stop, 1);
  atomic_fetch_add(&requested, 1);
  LightEvent_Signal(&audio_wake);
  LightEvent_Signal(&library_wake);
  if (audio_thread) { threadJoin(audio_thread, U64_MAX); threadFree(audio_thread); audio_thread = NULL; }
  if (library_thread) { threadJoin(library_thread, U64_MAX); threadFree(library_thread); library_thread = NULL; }
  localmedia_forget_guest();
  if (audio_ok) { ndspChnWaveBufClear(CHANNEL); ndspExit(); audio_ok = false; }
  for (int i = 0; i < LM_SLOTS; i++) { if (wave_data[i]) linearFree(wave_data[i]); wave_data[i] = NULL; }
  lm_library_free(atomic_exchange(&pending_library, NULL));
  lm_library_free(library);
  library = NULL;
  lm_ids_destroy(ids);
  ids = NULL;
  free(art_pixels);
  art_pixels = NULL;
}

void localmedia_forget_guest(void) {
  if (command_track >= 0 && atomic_load(&running)) post(&open_mail, 0, "");
  command_track = -1;
  command_phase = IDLE;
  atomic_store(&paused_flag, false);
  for (int i = 0; i < art_handle_count; i++) ui_free_texture(art_handles[i]);
  art_handle_count = 0;
  if (reserved_handle >= 0) ui_free_texture(reserved_handle);
  reserved_handle = -1;
  art_id = -1;
}

bool localmedia_scan(void) {
  adopt_scan();
  if (atomic_load(&scanning)) return false;
  atomic_store(&scanning, true);
  atomic_store(&scan_requested, true);
  LightEvent_Signal(&library_wake);
  return true;
}

const char *localmedia_tracks(size_t *length) {
  adopt_scan();
  *length = library->json_length;
  return library->json;
}

int32_t localmedia_open(int32_t id) {
  adopt_scan();
  const LmTrack *track = lm_library_find(library, id);
  if (!track) return 0;
  char path[300];
  snprintf(path, sizeof path, "%s%s", ROOT, track->file);
  open_serial++;
  command_track = id;
  command_phase = LOADING;
  command_position = 0;
  command_duration = track->duration_ms;
  resumed_while_loading = false;
  atomic_store(&paused_flag, false);
  post(&open_mail, 0, path);
  return (int32_t)open_serial;
}

void localmedia_paused(bool value) {
  unsigned position, duration, error;
  unsigned base = base_phase(&position, &duration, &error);
  unsigned shown = visible_phase(base);
  if (value && (shown == PLAYING || shown == LOADING)) atomic_store(&paused_flag, true);
  else if (!value && shown == PAUSED) {
    atomic_store(&paused_flag, false);
    if (base == LOADING) resumed_while_loading = true;
  }
  LightEvent_Signal(&audio_wake);
}

void localmedia_seek(double ms) {
  unsigned position, duration, error;
  unsigned base = base_phase(&position, &duration, &error);
  if (command_track < 0 || base == IDLE || base == FAILED) return;
  double clamped = !isfinite(ms) || ms < 0 ? 0 : ms > duration ? duration : ms;
  if (base == ENDED) atomic_store(&paused_flag, true);
  command_phase = base == ENDED ? PLAYING : base;
  command_position = (unsigned)clamped;
  command_duration = duration;
  post(&seek_mail, (uint32_t)clamped, NULL);
}

void localmedia_volume(double value) {
  atomic_store(&volume_percent, (unsigned)(!isfinite(value) || value < 0 ? 0 : value > 1 ? 100 : lround(value * 100)));
  LightEvent_Signal(&audio_wake);
}

void localmedia_status(char *out, size_t capacity) {
  adopt_scan();
  unsigned position, duration, error;
  unsigned phase = command_track < 0 ? IDLE : visible_phase(base_phase(&position, &duration, &error));
  if (command_track < 0) position = duration = error = 0;
  snprintf(out, capacity,
    "{\"phase\":\"%s\",\"trackId\":%ld,\"openSerial\":%u,\"positionMs\":%u,\"durationMs\":%u,\"scanning\":%s,"
    "\"scanGeneration\":%u,\"underruns\":%u,\"error\":\"%s\",\"decodeLoad\":%u,\"artHandles\":%d}",
    PHASES[phase], (long)command_track, open_serial, position, duration, atomic_load(&scanning) ? "true" : "false",
    scan_generation, atomic_load(&underruns), phase == FAILED ? ERRORS[error] : "", atomic_load(&decode_load),
    art_handle_count);
}

/* Uploads the finished pixels; never hands out core handle 0 (the contract's "none"). */
static int32_t upload_art(void) {
  int32_t handle = ui_upload_texture(art_pixels, LM_ART_PIXELS_BYTES, LM_ART_EDGE, LM_ART_EDGE, 3);
  if (handle == 0) {
    reserved_handle = handle;
    handle = ui_upload_texture(art_pixels, LM_ART_PIXELS_BYTES, LM_ART_EDGE, LM_ART_EDGE, 3);
  }
  if (handle <= 0 || art_handle_count >= MAX_ART_HANDLES) {
    if (handle > 0) ui_free_texture(handle);
    return 0;
  }
  art_handles[art_handle_count++] = handle;
  return handle;
}

int32_t localmedia_artwork(int32_t id) {
  adopt_scan();
  const LmTrack *track = lm_library_find(library, id);
  if (!track || !track->has_art) return 0;
  if (id != art_id || art_handed_out) {
    Mail request = {0};
    request.generation = ++art_generation;
    request.offset = track->art_offset;
    request.raw_bytes = track->art_raw_bytes;
    request.unsync = track->art_unsync;
    snprintf(request.path, sizeof request.path, "%s%s", ROOT, track->file);
    mail_write(&art_mail, &request);
    LightEvent_Signal(&library_wake);
    art_id = id;
    art_handed_out = false;
    return -1;
  }
  if (atomic_load_explicit(&art_done_generation, memory_order_acquire) != art_generation) return -1;
  art_handed_out = true;
  return atomic_load(&art_done_ok) ? upload_art() : 0;
}

void localmedia_release_artwork(int32_t handle) {
  for (int i = 0; i < art_handle_count; i++) {
    if (art_handles[i] != handle) continue;
    ui_free_texture(handle);
    art_handles[i] = art_handles[--art_handle_count];
    return;
  }
}
```

- [ ] **Step 4: Run the fork tests and typecheck.**
  - Run `cd runtime && bun test tests/3ds-profile.test.ts tests/localmedia.test.ts tests/localmedia-sim.test.ts tests/localmedia-native.test.ts && npx --no-install tsc --noEmit -p . 2>&1 | grep -c -E 'localmedia|3ds-profile'`.
  - Expected: `43 pass, 0 fail`, then `0`.

- [ ] **Step 5: Compile for the 3DS.**
  - From the ipo-ds root, with the fork's working tree in `runtime/`, run `bun run 3ds > $TMPDIR/t8-build.log 2>&1; echo $?; grep -cE 'src/localmedia[a-z_]*\.c:[0-9]+:[0-9]+: warning' $TMPDIR/t8-build.log; ls -la dist/ipo-ds-main.3dsx`.
  - Expected: `0`, then `0`, and a fresh `.3dsx`.
  - ipo-ds's manifest still lists `media.local` under `enhances`, which the 3DS profile now provides, so `POCKETJS_LOCALMEDIA` is on.

- [ ] **Step 6: Commit in the fork, then push after the user confirms.**

```bash
git -C runtime add hosts/3ds/src/localmedia.h hosts/3ds/src/localmedia.c hosts/3ds/src/qjs.c hosts/3ds/src/main.c hosts/3ds/Makefile tools/3ds.ts tools/3ds-profile.ts tests/3ds-profile.test.ts tests/localmedia.test.ts
git -C runtime commit -m "feat(localmedia): media.local in the 3DS host: audio thread, library worker, bindings, profile (hostAbi 12)"
git -C runtime push fork ipo-ds
```

---

### Task 9: Covers in Now Playing; ipo-ds requires `media.local`

**Files:**
- Modify: `runtime` (the pin);
- Modify: `pocket.json` (`media.local` moves from `enhances` to `requires`);
- Modify: `app/player/reducer.ts` (`IDLE_STATUS` gains `decodeLoad` and `artHandles`);
- Modify: `app/session.ts` (`cover`);
- Modify: `app/theme/parts/deck.tsx` (`CoverImage`);
- Modify: `app/now-playing/now-playing.tsx`;
- Modify: `tests/app.test.ts`.

**Interfaces:**
- Consumes: contract v2 (Task 1).
- Produces:
  - `Session.cover: Accessor<number>`: the open track's cover texture, or 0 for the placeholder.
    - It asks for art once per frame until the request resolves.
    - Tracks without art never ask.
    - The previous cover stays until the next track's art resolves, then is released once.
  - `CoverImage(props: { handle })`.

- [ ] **Step 1: Bump the pin.**
  - Run `git -C runtime log --oneline -1`. Expected: Task 8's commit.
  - Run `bun run check`. Expected: one error, `IDLE_STATUS` missing `decodeLoad` and `artHandles`. This is why the pin and this task land together.

- [ ] **Step 2: Watch the tests fail.**
  - Save the patch as `$TMPDIR/t9.patch`.
  - Run `git apply --include=tests/app.test.ts $TMPDIR/t9.patch && bun run test`.
  - Expected: `103 pass, 3 fail` (the three cover tests).

```diff
diff --git a/app/now-playing/now-playing.tsx b/app/now-playing/now-playing.tsx
index 1809c84..7b1fa38 100644
--- a/app/now-playing/now-playing.tsx
+++ b/app/now-playing/now-playing.tsx
@@ -7,7 +7,7 @@ import { createMediaScrubber } from "@pocketjs/framework/media";
 import { formatRemaining, formatTime, needsHours } from "../format.ts";
 import type { Session } from "../session.ts";
 import { AQUA } from "../theme/aqua.ts";
-import { ArtFrame, InfoLcd, SEEK_TRACK_PX, SEEK_TRACK_WIDE_PX, SeekCapsule, seekTrackLeft, TransportRow } from "../theme/parts/deck.tsx";
+import { ArtFrame, CoverImage, InfoLcd, SEEK_TRACK_PX, SEEK_TRACK_WIDE_PX, SeekCapsule, seekTrackLeft, TransportRow } from "../theme/parts/deck.tsx";
 import { IdlePanel } from "../theme/parts/panels.tsx";
 
 export function NowPlaying(props: { session: Session }) {
@@ -56,7 +56,7 @@ export function NowPlaying(props: { session: Session }) {
   return (
     <View class={AQUA.bottomScreen}>
       <Show when={!idle()} fallback={<IdlePanel />}>
-        <ArtFrame album={track()!.album} />
+        <ArtFrame album={track()!.album}>{props.session.cover() > 0 ? <CoverImage handle={props.session.cover()} /> : undefined}</ArtFrame>
         <InfoLcd
           title={track()!.title}
           artist={track()!.artist}
diff --git a/app/player/reducer.ts b/app/player/reducer.ts
index 31f40b9..d0e0b20 100644
--- a/app/player/reducer.ts
+++ b/app/player/reducer.ts
@@ -36,6 +36,7 @@ export interface Reduced { state: PlayerState; commands: PlayerCommand[] }
 export const RESTART_THRESHOLD_MS = 3000;
 export const IDLE_STATUS: LocalStatus = Object.freeze({
   phase: "idle", trackId: -1, openSerial: 0, positionMs: 0, durationMs: 0, scanning: false, scanGeneration: 0, underruns: 0, error: "",
+  decodeLoad: 0, artHandles: 0,
 });
 
 export function initialPlayer(): PlayerState {
diff --git a/app/session.ts b/app/session.ts
index e3cb0fa..b36c6db 100644
--- a/app/session.ts
+++ b/app/session.ts
@@ -1,7 +1,8 @@
 // The app's connection to the host's local media module: scans at launch,
 // rebuilds the library after every completed scan (composing decomposed
 // accents first), runs the player controller and polls status once per frame.
-// Everything the screens read is a Solid signal here.
+// Everything the screens read is a Solid signal here, including the open
+// track's cover texture.
 import { createMemo, createSignal, type Accessor } from "solid-js";
 import { onFrame } from "@pocketjs/framework/lifecycle";
 import { localMedia, type LocalMedia, type LocalStatus, type LocalTrack } from "@pocketjs/framework/localmedia";
@@ -23,6 +24,9 @@ export interface Session {
   /** The open track's details. A rescan can drop its file while the host keeps streaming it,
    * so the last details seen for the open id stay until another song opens. */
   track: Accessor<LocalTrack | null>;
+  /** The open track's cover texture; 0 shows the placeholder. The previous cover stays until
+   * the next track's art resolves, then is released once. */
+  cover: Accessor<number>;
   dispatch(action: PlayerAction): void;
   rescan(): void;
 }
@@ -50,7 +54,11 @@ export function createSession(media: LocalMedia | null = connect()): Session {
   const [statusFailed, setStatusFailed] = createSignal(false);
   const [listFailed, setListFailed] = createSignal(false);
   const readFailed = () => statusFailed() || listFailed();
+  const [cover, setCover] = createSignal(0);
   let controller: PlayerController | null = null;
+  // The id whose cover is shown or requested, and whether its request resolved.
+  let coverFor = -1;
+  let coverResolved = true;
 
   if (media) {
     controller = createPlayerController(media, { onChange: setPlayer });
@@ -70,6 +78,7 @@ export function createSession(media: LocalMedia | null = connect()): Session {
       setStatusFailed(false);
       setStatus(now);
       setScanning(now.scanning);
+      updateCover(now.trackId);
       if (now.scanGeneration === generation) return;
       generation = now.scanGeneration;
       try {
@@ -83,6 +92,25 @@ export function createSession(media: LocalMedia | null = connect()): Session {
     });
   }
 
+  /** Asks for the open track's art each frame until it resolves; tracks without art never ask. */
+  function updateCover(id: number): void {
+    if (!media) return;
+    if (id !== coverFor) {
+      coverFor = id;
+      coverResolved = false;
+    }
+    if (coverResolved) return;
+    let next = 0;
+    if (id >= 0 && track()?.hasArt) {
+      const art = media.artwork(id);
+      if (art === "pending") return;
+      next = art;
+    }
+    coverResolved = true;
+    const previous = cover();
+    setCover(next);
+    if (previous > 0 && previous !== next) media.releaseArtwork(previous);
+  }
   let last: LocalTrack | null = null;
   const track = createMemo(() => {
     const id = status().trackId;
@@ -100,6 +128,7 @@ export function createSession(media: LocalMedia | null = connect()): Session {
     scanning,
     readFailed,
     track,
+    cover,
     // A command re-reads status; a reply that fails validation must not throw out of the frame.
     dispatch: (action) => {
       try {
diff --git a/app/theme/parts/deck.tsx b/app/theme/parts/deck.tsx
index ac59b3f..5fdfa92 100644
--- a/app/theme/parts/deck.tsx
+++ b/app/theme/parts/deck.tsx
@@ -4,6 +4,7 @@
 import { children, Show } from "solid-js";
 import { Image, Text, View } from "@pocketjs/framework/components";
 import { createGesture } from "@pocketjs/framework/gesture";
+import { ready, ResourceImage } from "@pocketjs/framework/resource";
 import type { JSX as SolidJSX } from "solid-js";
 import { AQUA } from "../aqua.ts";
 import { trackOffset } from "../geometry.ts";
@@ -42,6 +43,11 @@ export function ArtFrame(props: { album: string; children?: SolidJSX.Element; th
   );
 }
 
+/** An uploaded cover texture (128×128) drawn at the art frame's 98×98 interior. */
+export function CoverImage(props: { handle: number }) {
+  return <ResourceImage class="w-[98] h-[98]" state={() => ready({ handle: props.handle, width: 98, height: 98 })} fallback={() => null} />;
+}
+
 export function InfoLcd(props: {
   title: string;
   artist: string;
diff --git a/pocket.json b/pocket.json
index 5683e31..45503b0 100644
--- a/pocket.json
+++ b/pocket.json
@@ -11,11 +11,11 @@
         "text.glyphs.baked",
         "input.buttons",
         "display.auxiliary",
-        "input.touch.auxiliary"
+        "input.touch.auxiliary",
+        "media.local"
       ],
       "enhances": [
-        "input.analog.left",
-        "media.local"
+        "input.analog.left"
       ]
     }
   },
diff --git a/tests/app.test.ts b/tests/app.test.ts
index 8b65d29..4a9f7c5 100644
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -370,3 +370,77 @@ test("a tap on the remaining-time label does not seek", async () => {
   touch(rig, 290, 135);
   expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual([]);
 }, 120_000);
+
+// ---------------------------------------------------------------------------
+// Covers, playback errors and diagnostics (Plan 4)
+// ---------------------------------------------------------------------------
+
+/** Four songs in title order; Bravo has no embedded art. */
+const COVERS: SimLocalTrack[] = [
+  { file: "a.mp3", title: "Alpha", artist: "Ann", album: "One", track: 1, durationMs: 60_000, art: true },
+  { file: "b.mp3", title: "Bravo", artist: "Ann", album: "One", track: 2, durationMs: 60_000 },
+  { file: "c.mp3", title: "Charlie", artist: "Ann", album: "One", track: 3, durationMs: 60_000, art: true },
+  { file: "d.mp3", title: "Delta", artist: "Ann", album: "One", track: 4, durationMs: 60_000, art: true },
+];
+
+/** The cover image node: drawn at the art frame's 98×98 interior. */
+const coverNode = (world: BundleWorld) =>
+  flat(world.tree("auxiliary")).find((node) => node.type === "image" && node.rect?.[2] === 98 && node.rect?.[3] === 98);
+
+const artworkCalls = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("artwork("));
+const releases = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("releaseArtwork("));
+
+async function bootWith(library: SimLocalTrack[], options: { artworkMs?: number } = {}): Promise<Rig> {
+  const host = createSimLocalMedia(library, options);
+  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
+  frames(rig, 4);
+  expect(rig.world.failure).toBeNull();
+  return rig;
+}
+
+test("a cover replaces the placeholder once its art is ready, and is asked for until then only", async () => {
+  const rig = await bootWith(COVERS, { artworkMs: 200 });
+  press(rig, A); // Alpha
+  expect(coverNode(rig.world)).toBeUndefined(); // pending: the placeholder shows
+  expect(screenText(rig.world, "auxiliary")).toContain("On");
+  frames(rig, 15);
+  expect(coverNode(rig.world)).toBeDefined();
+  expect(rig.host.liveArtwork()).toHaveLength(1);
+  const asked = artworkCalls(rig.host).length;
+  frames(rig, 10);
+  expect(artworkCalls(rig.host)).toHaveLength(asked);
+}, 120_000);
+
+test("a track without art never asks; the previous cover stays until the next resolves, then is released once", async () => {
+  const rig = await bootWith(COVERS, { artworkMs: 200 });
+  press(rig, A); // Alpha
+  frames(rig, 15);
+  const alpha = rig.host.liveArtwork()[0]!;
+  press(rig, BTN.ZR); // Bravo: no art
+  expect(artworkCalls(rig.host)).not.toContain("artwork(1)");
+  expect(coverNode(rig.world)).toBeUndefined();
+  expect(releases(rig.host)).toEqual([`releaseArtwork(${alpha})`]);
+  press(rig, BTN.ZR); // Charlie
+  frames(rig, 15);
+  const charlie = rig.host.liveArtwork()[0]!;
+  press(rig, BTN.ZR); // Delta: pending for 200 ms
+  expect(coverNode(rig.world)).toBeDefined(); // Charlie's cover is still up
+  expect(rig.host.liveArtwork()).toEqual([charlie]);
+  frames(rig, 15);
+  expect(rig.host.liveArtwork()).toHaveLength(1);
+  expect(rig.host.liveArtwork()[0]).not.toBe(charlie);
+  expect(releases(rig.host)).toEqual([`releaseArtwork(${alpha})`, `releaseArtwork(${charlie})`]);
+}, 120_000);
+
+test("fifty track changes leave at most one live cover and release each exactly once", async () => {
+  const rig = await bootWith(COVERS);
+  press(rig, A);
+  for (let i = 0; i < 50; i++) {
+    press(rig, BTN.ZR);
+    frames(rig, 2);
+    expect(rig.host.liveArtwork().length).toBeLessThanOrEqual(1);
+  }
+  const released = releases(rig.host);
+  expect(new Set(released).size).toBe(released.length);
+  expect(rig.host.ns.status()).toContain('"artHandles":1');
+}, 120_000);
```

- [ ] **Step 3: Implement.** `git apply --exclude=tests/app.test.ts $TMPDIR/t9.patch`.

- [ ] **Step 4: Run.** `bun run test && bun run check`. Expected: `106 pass, 0 fail`; no type errors.

- [ ] **Step 5: Commit.**

```bash
git add runtime pocket.json app/player/reducer.ts app/session.ts app/theme/parts/deck.tsx app/now-playing/now-playing.tsx tests/app.test.ts
git commit -m "feat(now-playing): embedded covers from media.local; require the capability"
```

---

### Task 10: Playback errors and L+R diagnostics in the LCD

**Files:**
- Modify: `app/theme/parts/deck.tsx` (`InfoLcd` gains `note` and `alert`);
- Modify: `app/theme/theme.ts` and `app/theme/aqua.ts` (`infoNote`, `infoAlert`);
- Modify: `app/now-playing/now-playing.tsx`;
- Modify: `app/input-timing.ts` (`stepShoulders`: a shoulder pressed while the other is held does not step tabs);
- Modify: `tests/input-timing.test.ts`, `tests/app.test.ts`.

**Interfaces:**
- Produces `InfoLcd` props `note?: string` and `alert?: boolean`. A note replaces the status row with a marquee, bold red when `alert`.
- Now Playing shows:
  - while L+R are held, `U:<underruns> D:<decodeLoad>% A:<artHandles>`;
  - otherwise, while the phase is `error`, the status's `error`.

- [ ] **Step 1: Watch the tests fail.**
  - Save the patch as `$TMPDIR/t10.patch`.
  - Run `git apply --include='tests/*' $TMPDIR/t10.patch && bun run test`.
  - Expected: `106 pass, 3 fail` (the playback-error, L+R and shoulder-chord tests).

```diff
diff --git a/app/input-timing.ts b/app/input-timing.ts
index fbde2fb..2ca26c5 100644
--- a/app/input-timing.ts
+++ b/app/input-timing.ts
@@ -74,8 +74,9 @@ export function stepShoulders(
     if (pressed & bits.r) { events.push("next"); chorded = true; }
   } else {
     if (yWas && !chorded) events.push("reveal");
-    if (pressed & bits.l) events.push("tabPrev");
-    if (pressed & bits.r) events.push("tabNext");
+    // Both shoulders down is the diagnostics chord (Now Playing): no tab step.
+    if (pressed & bits.l && !(buttons & bits.r)) events.push("tabPrev");
+    if (pressed & bits.r && !(buttons & bits.l)) events.push("tabNext");
     chorded = false;
   }
   return { state: { mask: buttons, chorded }, events };
diff --git a/app/now-playing/now-playing.tsx b/app/now-playing/now-playing.tsx
index 7b1fa38..9b18279 100644
--- a/app/now-playing/now-playing.tsx
+++ b/app/now-playing/now-playing.tsx
@@ -1,8 +1,11 @@
 // The bottom screen while not searching: the playing song's art, info LCD,
-// a drag-to-seek capsule (one seek on release) and the transport row.
+// a drag-to-seek capsule (one seek on release) and the transport row. The
+// LCD's status row shows a playback error, or diagnostics while L+R are held.
 import { createSignal, Show } from "solid-js";
 import { View } from "@pocketjs/framework/components";
 import { createGesture } from "@pocketjs/framework/gesture";
+import { BTN } from "@pocketjs/framework/input";
+import { onFrame } from "@pocketjs/framework/lifecycle";
 import { createMediaScrubber } from "@pocketjs/framework/media";
 import { formatRemaining, formatTime, needsHours } from "../format.ts";
 import type { Session } from "../session.ts";
@@ -51,6 +54,14 @@ export function NowPlaying(props: { session: Session }) {
     },
   });
   const position = () => preview() ?? status().positionMs;
+  const SHOULDERS = BTN.LTRIGGER | BTN.RTRIGGER;
+  const [diagnostics, setDiagnostics] = createSignal(false);
+  onFrame((buttons) => setDiagnostics((buttons & SHOULDERS) === SHOULDERS));
+  const note = () => {
+    const now = status();
+    if (diagnostics()) return `U:${now.underruns} D:${now.decodeLoad}% A:${now.artHandles}`;
+    return now.phase === "error" ? now.error : undefined;
+  };
   const playing = () => status().phase === "playing" || status().phase === "loading";
 
   return (
@@ -64,6 +75,8 @@ export function NowPlaying(props: { session: Session }) {
           position={`${player().index + 1} of ${player().order.length}`}
           shuffle={player().shuffle}
           repeat={player().repeat}
+          note={note()}
+          alert={!diagnostics() && status().phase === "error"}
         />
       </Show>
       <SeekCapsule
diff --git a/app/theme/aqua.ts b/app/theme/aqua.ts
index 355ccd9..f95b2c3 100644
--- a/app/theme/aqua.ts
+++ b/app/theme/aqua.ts
@@ -124,6 +124,8 @@ export const AQUA: Theme = {
   infoAlbum: "w-full text-center text-xs text-[#6a6c5a] mt-[1]",
   infoStatus: "flex-row items-center gap-[6] mt-[8]",
   infoStatusText: "text-xs text-[#3c3e31]",
+  infoNote: "w-full text-center text-xs text-[#3c3e31]",
+  infoAlert: "w-full text-center text-xs font-bold text-[#b0281c]",
   infoFlagText: "text-xs font-bold text-[#1c6fd1]",
 
   seekCapsule: "absolute left-[10] top-[120] w-[300] h-[30] flex-row items-center px-[8] gap-[8] rounded-[15] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
diff --git a/app/theme/parts/deck.tsx b/app/theme/parts/deck.tsx
index 5fdfa92..8ed2873 100644
--- a/app/theme/parts/deck.tsx
+++ b/app/theme/parts/deck.tsx
@@ -10,7 +10,7 @@ import { AQUA } from "../aqua.ts";
 import { trackOffset } from "../geometry.ts";
 import { placeholderArt } from "../placeholder.ts";
 import type { RepeatMode, Theme, TransportKind } from "../theme.ts";
-import { FONT_12, FONT_16_BOLD } from "../fonts.ts";
+import { FONT_12, FONT_12_BOLD, FONT_16_BOLD } from "../fonts.ts";
 import { Marquee } from "./marquee.tsx";
 
 export function PlaceholderArt(props: { album: string; theme?: Theme }) {
@@ -55,6 +55,9 @@ export function InfoLcd(props: {
   position: string;
   shuffle: boolean;
   repeat: RepeatMode;
+  /** Replaces the status row: diagnostics, or a playback error when `alert`. */
+  note?: string;
+  alert?: boolean;
   theme?: Theme;
 }) {
   const t = () => props.theme ?? AQUA;
@@ -63,18 +66,27 @@ export function InfoLcd(props: {
       <Marquee text={props.title} class={t().infoTitle} slot={FONT_16_BOLD} width={INFO_TEXT_PX} />
       <Marquee text={props.artist} class={t().infoArtist} slot={FONT_12} width={INFO_TEXT_PX} />
       <Marquee text={props.album} class={t().infoAlbum} slot={FONT_12} width={INFO_TEXT_PX} />
-      <View class={t().infoStatus}>
-        <Text class={t().infoStatusText}>{props.position}</Text>
-        <Show when={props.shuffle}>
-          <Image class="w-[16] h-[16]" src={t().icon("shuffle", "blue")} />
-        </Show>
-        <Show when={props.repeat !== "off"}>
-          <Image class="w-[16] h-[16]" src={t().icon("repeat", "blue")} />
-        </Show>
-        <Show when={props.repeat === "one"}>
-          <Text class={t().infoFlagText}>1</Text>
-        </Show>
-      </View>
+      <Show
+        when={!props.note}
+        fallback={
+          <View class={t().infoStatus}>
+            <Marquee text={props.note!} class={props.alert ? t().infoAlert : t().infoNote} slot={props.alert ? FONT_12_BOLD : FONT_12} width={INFO_TEXT_PX} />
+          </View>
+        }
+      >
+        <View class={t().infoStatus}>
+          <Text class={t().infoStatusText}>{props.position}</Text>
+          <Show when={props.shuffle}>
+            <Image class="w-[16] h-[16]" src={t().icon("shuffle", "blue")} />
+          </Show>
+          <Show when={props.repeat !== "off"}>
+            <Image class="w-[16] h-[16]" src={t().icon("repeat", "blue")} />
+          </Show>
+          <Show when={props.repeat === "one"}>
+            <Text class={t().infoFlagText}>1</Text>
+          </Show>
+        </View>
+      </Show>
     </View>
   );
 }
diff --git a/app/theme/theme.ts b/app/theme/theme.ts
index c3bbe54..e09a8ae 100644
--- a/app/theme/theme.ts
+++ b/app/theme/theme.ts
@@ -114,6 +114,9 @@ export interface Theme {
   infoAlbum: string;
   infoStatus: string;
   infoStatusText: string;
+  /** The status row's replacement text: diagnostics, or (alert) a playback error. */
+  infoNote: string;
+  infoAlert: string;
   infoFlagText: string;
 
   seekCapsule: string;
diff --git a/tests/app.test.ts b/tests/app.test.ts
index 4a9f7c5..e8875c8 100644
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -444,3 +444,28 @@ test("fifty track changes leave at most one live cover and release each exactly
   expect(new Set(released).size).toBe(released.length);
   expect(rig.host.ns.status()).toContain('"artHandles":1');
 }, 120_000);
+
+test("a playback error shows in the LCD status row", async () => {
+  const rig = await bootWith([{ file: "broken.mp3", title: "Broken", durationMs: 1000, corrupt: true }]);
+  press(rig, A);
+  frames(rig, 3);
+  expect(screenText(rig.world, "auxiliary")).toContain("MP3 frame sync not found");
+}, 120_000);
+
+test("holding L+R shows underruns, decode load and live covers without stepping tabs", async () => {
+  const rig = await bootWith(COVERS);
+  press(rig, A);
+  frames(rig, 3);
+  rig.host.setDecodeLoad(23);
+  frames(rig, 3, { buttons: BTN.LTRIGGER });
+  frames(rig, 3, { buttons: BTN.LTRIGGER | BTN.RTRIGGER });
+  expect(screenText(rig.world, "auxiliary")).toContain("U:0 D:23% A:1");
+  frames(rig, 3);
+  expect(screenText(rig.world, "auxiliary")).toContain("1 of 4");
+  expect(header(rig.world, "Song Name")).toBeDefined(); // still the Songs tab (L alone could not step left of it)
+  press(rig, BTN.RTRIGGER); // Artists
+  frames(rig, 3, { buttons: BTN.RTRIGGER });
+  frames(rig, 3, { buttons: BTN.RTRIGGER | BTN.LTRIGGER });
+  frames(rig, 3);
+  expect(header(rig.world, "Song Name")).toBeUndefined(); // still Artists: the second shoulder did not step back
+}, 120_000);
diff --git a/tests/input-timing.test.ts b/tests/input-timing.test.ts
index 4bb53a6..4b125a6 100644
--- a/tests/input-timing.test.ts
+++ b/tests/input-timing.test.ts
@@ -58,3 +58,20 @@ test("L / R alone step tabs; Y held with L / R skips songs; a Y tap alone reveal
   expect(run([1 | 4, 1, 0])).toEqual(["next"]);
   expect(run([1, 1 | 4, 4, 0])).toEqual(["next"]);
 });
+
+test("a shoulder pressed while the other is held (the L+R diagnostics chord) does not step tabs", () => {
+  const BITS = { y: 1, l: 2, r: 4 };
+  const run = (masks: number[]) => {
+    let state = SHOULDERS_UP;
+    const events: ShoulderEvent[] = [];
+    for (const mask of masks) {
+      const step = stepShoulders(state, mask, BITS);
+      state = step.state;
+      events.push(...step.events);
+    }
+    return events;
+  };
+  expect(run([2, 2 | 4, 2 | 4, 0])).toEqual(["tabPrev"]);
+  expect(run([4, 4 | 2, 0])).toEqual(["tabNext"]);
+  expect(run([2 | 4, 2 | 4, 0])).toEqual([]);
+});
```

- [ ] **Step 2: Implement.** `git apply --exclude='tests/*' $TMPDIR/t10.patch`.

- [ ] **Step 3: Run.** `bun run test && bun run check && bun run gallery`. Expected: `109 pass, 0 fail`; no type errors; the gallery captures are written.

- [ ] **Step 4: Commit.**

```bash
git add app/theme/parts/deck.tsx app/theme/theme.ts app/theme/aqua.ts app/now-playing/now-playing.tsx app/input-timing.ts tests/input-timing.test.ts tests/app.test.ts
git commit -m "feat(now-playing): playback errors in the LCD; L+R diagnostics without stepping tabs"
```

---

### Task 11: Device test library generator

**Files:**
- Create: `scripts/make-test-library.ts`.
- Modify: `package.json` (the `test-library` script).

**Interfaces:**
- Produces `bun run test-library [outdir]` (default `dist/test-music`). It writes 323 files:
  - 320 tagged tracks;
  - a mono 22.05 kHz file;
  - a 65-minute track;
  - a random-bytes `.mp3`.

- [ ] **Step 1: Create the script** `scripts/make-test-library.ts`:

```ts
// Writes a device test library of sine-tone MP3s for the Plan 4 checklist:
// ~300 tagged tracks across 30 artists and 40 albums, with accented and
// NFD-decomposed names, CBR 128/320, VBR with and without a Xing header, a
// mono 22.05 kHz file, ID3 v2.3 / v2.4 / v1-only tags, JPEG and PNG covers
// (one too large to decode), a 65-minute track and a file of random bytes.
//
//   bun scripts/make-test-library.ts [outdir]     (default dist/test-music)
//
// Needs ffmpeg and lame on PATH. Copy the folder's contents to sdmc:/music/.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist/test-music");
const work = join(out, ".work");
rmSync(out, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

for (const tool of ["ffmpeg", "lame"]) if (!Bun.which(tool)) throw new Error(`make-test-library: ${tool} is not on PATH`);

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed: ${await new Response(proc.stderr).text()}`);
}

/** Runs jobs with bounded concurrency. */
async function pool(jobs: (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(2, availableParallelism()) }, async () => {
    while (next < jobs.length) await jobs[next++]!();
  });
  await Promise.all(lanes);
}

// Covers: square JPEG, square PNG, a wide JPEG (centre-cropped on device), and one over the 1500 px limit.
const covers = {
  jpeg: join(work, "cover-500.jpg"),
  png: join(work, "cover-300.png"),
  wide: join(work, "cover-640x400.jpg"),
  huge: join(work, "cover-1600.jpg"),
};
await pool([
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=size=500x500:rate=1", "-frames:v", "1", covers.jpeg]),
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=300x300:rate=1", "-frames:v", "1", covers.png]),
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "smptehdbars=size=640x400:rate=1", "-frames:v", "1", covers.wide]),
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=size=1600x1600:rate=1", "-frames:v", "1", covers.huge]),
]);

const ARTISTS = [
  "Aurora Lín", "Björn & the Fjords", "Les Étoiles", "Mötorcycle Club", "Zoë Hart", "Café Society", "Niño Bravo",
  "The Ångström Units", "Señorita Luz", "Rêve Électrique", "Dvořák Tapes", "Øresund Drive", "Ça Va Ensemble",
  "Glass Lantern", "Paper Satellites", "Northern Static", "Velvet Arcade", "Low Tide Choir", "Kite Engine",
  "Marble Bloom", "Echo Parlor", "Silver Fern", "Dune Radio", "Copper Moth", "Saffron Wires", "Atlas Hum",
  "José Peña", "Amélie Roux", "Clément Duval", "Inès Morel",
];
const WORDS = ["Night", "Signal", "Harbor", "Glow", "Static", "Summer", "Atlas", "Velvet", "Echo", "Neon", "Paper", "River",
  "Crystal", "Orbit", "Lantern", "Fever", "Ghost", "Garden", "Mirror", "Satellite", "Café", "Rêverie", "Señal", "Été"];

interface Job { file: string; title: string; artist: string; album: string; track: number; seconds: number;
  kind: "cbr128" | "cbr320" | "vbr" | "vbr-plain" | "mono22"; tag: "v23" | "v24" | "v1"; cover?: keyof typeof covers }

const jobs: Job[] = [];
let n = 0;
for (let a = 0; a < ARTISTS.length; a++) {
  const albums = a < 10 ? 2 : 1; // 40 albums
  for (let b = 0; b < albums; b++) {
    const album = `${WORDS[(a * 3 + b * 7) % WORDS.length]} ${WORDS[(a * 5 + b * 11 + 3) % WORDS.length]}`;
    const tracks = a < 10 ? 6 : 10; // 10×2×6 + 20×10 = 320
    for (let t = 1; t <= tracks; t++) {
      n++;
      const kinds: Job["kind"][] = ["cbr128", "cbr128", "cbr320", "vbr", "vbr-plain"];
      const tags: Job["tag"][] = ["v23", "v23", "v24", "v1"];
      const coverKinds: (keyof typeof covers | undefined)[] = ["jpeg", "png", "wide", undefined, "jpeg", "huge"];
      jobs.push({
        file: `${String(n).padStart(3, "0")} ${ARTISTS[a]!.replace(/[&/]/g, "and")} - ${WORDS[(n * 7) % WORDS.length]}.mp3`,
        title: `${WORDS[(n * 7) % WORDS.length]} ${WORDS[(n * 13 + 5) % WORDS.length]}`,
        artist: ARTISTS[a]!,
        album,
        track: t,
        seconds: 20 + ((n * 37) % 70), // 20 s .. 90 s
        kind: kinds[n % kinds.length]!,
        tag: tags[n % tags.length]!,
        cover: coverKinds[b % 2 === 0 ? a % coverKinds.length : (a + 3) % coverKinds.length],
      });
    }
  }
}
jobs.push({ file: "Mono Field Recording.mp3", title: "Mono Field Recording", artist: "Atlas Hum", album: "Field Notes", track: 1, seconds: 45, kind: "mono22", tag: "v23" });
jobs.push({ file: "The Long One.mp3", title: "The Long One (65 minutes)", artist: "Low Tide Choir", album: "Endurance", track: 1, seconds: 65 * 60, kind: "cbr128", tag: "v24", cover: "jpeg" });

async function encode(job: Job): Promise<void> {
  const wav = join(work, `${job.file}.wav`);
  const mono = job.kind === "mono22";
  const freq = 220 + (job.track * 55) % 660;
  await run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${job.seconds}:sample_rate=${mono ? 22050 : 44100}`,
    "-af", "volume=0.4", "-ac", mono ? "1" : "2", wav]);
  const target = join(out, job.file);
  const quality = { cbr128: ["-b", "128"], cbr320: ["-b", "320"], vbr: ["-V", "2"], "vbr-plain": ["-V", "2", "-t"], mono22: ["-m", "m", "-b", "64"] }[job.kind];
  if (job.tag === "v24") {
    const raw = join(work, `${job.file}.raw.mp3`);
    await run(["lame", "--quiet", "--noreplaygain", ...quality, wav, raw]);
    const art = job.cover ? ["-i", covers[job.cover], "-map", "0:a", "-map", "1:v", "-metadata:s:v", "comment=Cover (front)"] : [];
    await run(["ffmpeg", "-v", "error", "-y", "-i", raw, ...art, "-c", "copy", "-id3v2_version", "4",
      "-metadata", `title=${job.title}`, "-metadata", `artist=${job.artist}`, "-metadata", `album=${job.album}`, "-metadata", `track=${job.track}`, target]);
  } else {
    const tagFlags = job.tag === "v1" ? ["--id3v1-only"] : ["--id3v2-only"];
    const art = job.cover && job.tag === "v23" ? ["--ti", covers[job.cover]] : [];
    await run(["lame", "--quiet", "--noreplaygain", ...quality, ...tagFlags, "--tt", job.title, "--ta", job.artist, "--tl", job.album,
      "--tn", String(job.track), ...art, wav, target]);
  }
  rmSync(wav, { force: true });
}

const started = Date.now();
await pool(jobs.map((job) => () => encode(job)));
// A file that is not MP3 at all.
writeFileSync(join(out, "Not Really Audio.mp3"), new Uint8Array(200_000).map((_, i) => (i * 2654435761) >>> 24));
rmSync(work, { recursive: true, force: true });
console.log(`make-test-library: ${jobs.length + 1} files in ${out} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
console.log("Copy the folder's contents to sdmc:/music/ on the console's SD card.");
console.log("Azahar (macOS): ~/Library/Application Support/Azahar/sdmc/music/");
```

- [ ] **Step 2: Add the package script:**

```diff
diff --git a/package.json b/package.json
index 96efeb2..2fab4fb 100644
--- a/package.json
+++ b/package.json
@@ -5,6 +5,7 @@
   "type": "module",
   "scripts": {
     "3ds": "bun scripts/build.ts",
+    "test-library": "bun scripts/make-test-library.ts",
     "check": "bun runtime/node_modules/typescript/bin/tsc --noEmit",
     "test": "bun test ./tests",
     "gallery": "bun scripts/gallery.ts"
```

- [ ] **Step 3: Run it.**
  - Run `bun run test-library && ls dist/test-music | wc -l && du -sh dist/test-music`.
  - Expected: `make-test-library: 323 files …`, then `323`, and about 370 MB. It takes about a minute.

- [ ] **Step 4: Commit.** `git add scripts/make-test-library.ts package.json && git commit -m "feat(scripts): device test library generator"`

---

### Task 12: Device checklist (exit gate)

This task is run with the user, who drives Azahar and both consoles. The executor prepares the builds and records the results in the ledger.

- [ ] **Step 1: Build.** Run `bun run 3ds`. Expected: `dist/ipo-ds-main.3dsx`. Also run `bun run 3ds --cia` for consoles that use installed titles.
- [ ] **Step 2: Prepare the SD cards.**
  - Copy `dist/test-music/*` to `sdmc:/music/`. For Azahar that is `~/Library/Application Support/Azahar/sdmc/music/`; ask the user before writing there, because their own music already lives in that folder.
  - Azahar needs `sdmc:/3ds/dspfirm.cdc`. A file of 64 KiB of zeros works under its HLE DSP.
  - Each console needs its own dump: Rosalina menu → Miscellaneous options → Dump DSP firmware.
- [ ] **Step 3: Checklist.** Run each item on Azahar (Vulkan, 100% speed), a New 3DS and an Old 3DS:
  1. **Scan:** the scan lists all 323 files, with correct tags and accents (`José Peña` composed) and plausible durations. "Not Really Audio" is listed and, when opened, shows "MP3 frame sync not found" in the LCD.
  2. **Formats:** CBR 128 and 320, VBR with and without a Xing header, and mono 22.05 kHz all play cleanly at the right pitch, one after another.
  3. **Seek accuracy:** a drag lands within about 1 s of the target on CBR and Xing-VBR files, and within about 5 s on the headerless VBR files.
  4. **Track changes:** auto-advance, shuffle and repeat work, and so does ZR held or Y + R tapped quickly 20 times (the newest track always plays, and the serial and time agree).
  5. **Covers:** JPEG, PNG and wide (centre-cropped) covers display. The 1600 px cover and the no-cover tracks show the placeholder.
  6. **No leaks:** after 50+ track changes, holding L+R shows `A:0` or `A:1`.
  7. **Old 3DS starvation:** play a 320 kbps track, hold the D-pad down in the Songs list for 60 s, then hold L+R: `U:0`. Record `D:` (Old and New) for Plan 5.
  8. **Missing files:** a card with no `music/` folder shows the empty library. With `dspfirm.cdc` removed (Azahar), opening a song shows "DSP firmware missing; dump it in Rosalina".
  9. **Scrub drag:** a long scrub drag back and forth ends with exactly one seek, and playback continues from the drop point.
- [ ] **Step 4: Ledger.** Record each item's result per device, plus the `D:` values. Every failure becomes a finding for the fix pass.
