# Ds Man Walkman — Plan 5: Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ds-man runs within its frame budgets on both 3DS models in Azahar (CPU work per frame ≤ 14 ms on New, ≤ 30 ms on Old), scans 324 files in under 10 s and shows a cached list within 1 s on later launches, and the deferred minors from Plans 3 and 4 are fixed. Every claim is measured by `bun run perf`.

**Architecture:**
- **Fork (`runtime/`, branch `ds-man`), Tasks 1–7:**
  - capture builds keep the host's frame timing and write `stats.json` (a per-frame `work` series, a 240-frame trace, the scan's timings);
  - the scan lists names and sizes from directory entries, reuses a checksummed cache keyed by name and size, and reads the rest on two threads;
  - the glue publishes the cached list first and confirms it in the background;
  - the contract gains `scanMs`, the SDK returns a stable status object, and the sim mirrors the cached-then-confirmed scan;
  - the minors (player position, failed-open duration, long paths, superseded opens, prefill load, handle 0, art during scans, out of memory).
- **ds-man, Tasks 8–13:**
  - a `bun run perf` harness that runs capture builds headless in Azahar as an Old and a New 3DS;
  - status read at 15 Hz while playing, and repeated statuses skipped;
  - library key maps and a text-width cache;
  - the Explorer rebuilt around recycled rows, a selection overlay and `settled()` state;
  - `F:` in the L+R diagnostics, and an inert X tap on the read-error panel;
  - `docs/perf.md`.

**Tech Stack:** C11 / gnu11 (devkitARM in Docker, libctru), Bun tests (host `cc` with ASan/UBSan for the C units), TypeScript, SolidJS via `@pocketjs/framework`, the PocketJS sim, Azahar.

**Spec:** `docs/superpowers/specs/2026-10-07-walkman-hardening-design.md`, **including §11 (amendments from the prototype)**, which overrides the sections it names.

**Provenance:**
- The whole plan was first built as a prototype and measured in Azahar: every frame and scan target passed on both models (`docs/perf.md` in Task 13 records the runs).
- Every task was then staged as its own commit and rehearsed in order on clean trees: each task's tests were run against the previous commit (**RED**, for the reason its step gives), then at its commit (**GREEN**). Every patch below reproduces its staged commit exactly.

| After task | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fork tests named in the task | 9 | — | 9 | 18 | 9 | 1 | 9 | — | — | — | — | — | — |
| ds-man `bun run test` | — | — | — | — | — | — | — | 118 | 120 | 122 | 128 | 131 | 131 |

## Global Constraints

- **Where code lives:** framework and host code go in the fork (`runtime/`, branch `ds-man`, starting at `520950e8`). Each fork task commits there. **Pushing the fork is outward-facing: confirm with the user before the push in Task 7.** The ds-man pin moves in Task 8.
- **Commits:** Conventional Commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:**
  - In ds-man, run `bun run test` (it passes `--conditions=browser` from Task 11 on) or `bun test --conditions=browser ./tests/…`; never discover tests through `runtime/`.
  - Fork tests run from `runtime/` with explicit paths (`bun test tests/…`).
  - `dist/` stays out of Git (perf output, gallery PNGs, the test library).
- **Pure units stay pure:** no `#include <3ds.h>` in `localmedia_{ids,tags,mp3,art,library,player,cache}.c`. `localmedia_dir.c` is the one pure unit with a `#ifdef __3DS__` branch (the SD card's directory API); on the host it uses `opendir` and `stat`. Only `localmedia.c` uses libctru otherwise. Host tests compile with `cc -std=c11 -D_DEFAULT_SOURCE -pthread -Wall -Wextra -fsanitize=address,undefined`.
- **No warnings from `localmedia*.c` in the 3DS build.** The `qjs.c` `-Wswitch` warnings for `HostMedia*` predate this plan.
- **Budgets (spec §2, §8):** CPU work per frame (js + tick + draw, the `work` series), max over the host's 60-frame window: **≤ 14 000 µs on New, ≤ 30 000 µs on Old**, in `idle`, `scroll` and `now-playing`. **`scan-first` ≤ 10 000 ms; `scan-cached`: cached list ≤ 1 000 ms after `scan()`, confirmation ≤ 3 000 ms.**
- **Azahar (spec §11.1):** Vulkan (`graphics_api=2`), `resolution_factor=1`, `use_vsync=false`, `frame_limit=100`; **Old = `is_new_3ds=false` at 100 % CPU clock, New = `is_new_3ds=true` at 300 %**; a 64 KiB placeholder `sdmc:/3ds/dspfirm.cdc`.
- **Look unchanged:** the 16 gallery PNGs stay byte-identical to the baseline Task 8 captures before any app optimization. The only intended visual change is the `F:` value in the L+R diagnostics line.
- **Exact values:**
  - Cache: `sdmc:/pocketjs/localmedia/library.cache`, magic `LMC1`, version 1, FNV-1a trailer; caps: name ≤ 1024 bytes, text fields ≤ 255, entries ≤ 65 536, file ≤ 64 MB; key: name and size.
  - Scan: `LM_SCAN_BUFFER` 4096; directory entries read 32 at a time; two readers (the library thread and one helper at its priority, 32 KB stack, core −2).
  - Glue: `PATH_BYTES` 1024.
  - Capture: `TRACE_FRAMES` 240; `stats.json` = `{"host": <devStats>, "trace": [[js, tick, draw], …], "localmedia": {"cachedMs", "scanMs", "files", "parsed"}}`.
  - App: `POLL_EVERY` 4 (15 Hz while playing); marquee width cache 512 entries; row pool `min(count, rows + 1 + ((rows + 1) % 2))`; diagnostics `U:<underruns> D:<load>% A:<art> F:<mean>/<max>` (ms, rounded; `F:-` without timing).
- **Refinements of the spec** are in spec §11 (written from the prototype's measurements). The ones a reviewer should weigh:
  1. **Recycled rows live in ds-man, not the fork** (§11.2): §4.6's contingency, built without fork drift. The user approves this with the plan.
  2. **The cache key is name and size** (§11.3): libctru's `stat()` reports `st_mtime` 0, and `archive_getmtime` costs 13 ms per file in Azahar (and returns a constant there). A re-tag that keeps the file size is missed until the cache file is deleted.
  3. **4.9 frees handle 0 and retries** instead of reserving an 8×8 texture (§11.4): handles carry their slot's generation, so nothing needs holding back.
  4. **§4 items 3 and 5 are not built** (§11.2): the budgets were met without them.
  5. **Task 2 has no host test.** `main.c` and `devserver.c` do not compile on the host; Task 8's builds and perf run exercise them, and the harness fails loudly without `work`, `trace` or `localmedia`.
  6. **The fork's full suite has one environmental failure:** `ESP-IDF incremental package build` needs Ninja, which this machine lacks. It fails at `520950e8` too.
  7. **The per-optimization rows in `docs/perf.md` come from the prototype** (same code, measured step by step). Execution re-measures the baseline (Task 8) and the final state (Task 13).

## Review Focus

The inputs and conditions this software will meet that the spec implies but does not spell out, most likely to bite first:

1. **Stopping during a full scan** (closing the app while 324 files are read on two threads): both readers join, nothing leaks, no hang. *Pinned by Task 5's glue test, under ASan; check the join order in `lm_library_scan_with` and `localmedia_stop`.*
2. **SD names at the FAT limit and outside ASCII** (255 UTF-16 units = up to 765 UTF-8 bytes; accents, CJK, surrogate pairs): the 3DS listing converts each name into a 766-byte buffer and skips names that do not fit; paths hold 1024 bytes. *Pinned on the host by Task 7's 250-byte name; on the 3DS by the test library's accented names in Task 8's and Task 13's perf runs (all 324 listed). Check the buffer arithmetic in `localmedia_dir.c`.*
3. **A list smaller than the row pool, or one that shrinks under it** (a search with few matches, a rescan that drops files, an empty card): no slot reads past the rows, the overlay never shows a stale row. *Pinned by the existing app tests (empty card, query counts, rescan shrink) and Task 11's op-count test.*
4. **A cache that no longer matches the card** (files removed, renamed or resized; a damaged or older-version cache file): stale entries drop, damaged files read as empty. *Pinned by Task 3's cache and scan tests.*
5. **Hosts without frame timing** (offload builds, the sim, a window not yet complete): the diagnostics show `F:-`, never a wrong number or a throw. *Pinned by Task 12's tests.*

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `runtime/tools/test.ts` | 1 | register the 3DS arguments and media.local tests in the unit stage |
| `runtime/hosts/3ds/src/main.c`, `devserver.c`, `README.md` | 2, 5 | capture-build timing, the `work` series, `stats.json` |
| `runtime/hosts/3ds/src/localmedia_cache.{h,c}` (new) | 3 | scan cache file format, lookups |
| `runtime/hosts/3ds/src/localmedia_dir.{h,c}` (new) | 3 | folder listing (SD directory entries / `opendir`) |
| `runtime/hosts/3ds/src/localmedia_alloc.h` (new) | 3 | test hook for failing allocations |
| `runtime/hosts/3ds/src/localmedia_library.{h,c}` | 3 | list → look up → two readers → build |
| `runtime/hosts/3ds/Makefile` | 3 | new objects |
| `runtime/contracts/spec/localmedia.ts`, `framework/src/localmedia.ts`, `hosts/sim/localmedia.ts` | 4 | `scanMs`, stable status, the sim's cached scan |
| `runtime/hosts/3ds/src/localmedia.{h,c}` | 5, 7 | cached-then-confirmed scan, stats, minors |
| `runtime/hosts/3ds/src/localmedia_player.c` | 6 | position while queued but not playing |
| `runtime/tests/fixtures/localmedia/*` | 3, 5, 6, 7 | C test harnesses and the host fake |
| `scripts/perf.ts` (new), `package.json`, `scripts/make-test-library.ts` | 8, 11 | the perf harness; the long-title track; test conditions |
| `app/player/controller.ts`, `app/session.ts`, `app/player/reducer.ts` | 8, 9 | status polling |
| `app/library/library.ts`, `app/theme/measure.ts` (new), `app/theme/parts/marquee.tsx` | 10 | key maps, width cache |
| `app/reactive.ts`, `app/explorer/{window.ts,recycled-list.tsx}` (new), `app/explorer/{explorer.tsx,model.ts}`, `app/app.tsx` | 11, 12 | the Explorer rework |
| `app/now-playing/frame-time.ts` (new), `app/now-playing/now-playing.tsx` | 12 | `F:` |
| `docs/perf.md` (new) | 13 | the measurements |

**Applying a patch step:** save the block to a file outside the repo (for example `$TMPDIR/tN.patch`) and run `git apply $TMPDIR/tN.patch` from the repo root, or `git -C runtime apply …` for fork patches. Where a step says to watch a test fail first, apply with `--include='tests/*'` (the tests), run, then apply with `--exclude='tests/*'` (the rest).

---

## Task 1: Run every 3DS and media.local test in the fork's unit stage

The fork's suite declares which test files run in which stage, and checks that every `tests/*.test.ts` is declared. `tests/3ds-arguments.test.ts` (Plan 1) and the three media.local test files (Plans 3–4) were never declared, so the check fails and CI never ran them.

**Files:**
- Modify: `runtime/tools/test.ts`
- Test: `runtime/tests/test-suite.test.ts` (existing)

**Interfaces:** none.

- [ ] **Step 1: Watch the declaration check fail.** Run `cd runtime && bun test tests/test-suite.test.ts`.
  Expected: **7 pass, 2 fail**: "runs every tests/*.test.ts file in some stage or registers its exclusion" (listing `tests/3ds-arguments.test.ts`, `tests/localmedia-native.test.ts`, `tests/localmedia-sim.test.ts`, `tests/localmedia.test.ts`) and "runs every Nintendo 3DS test in the CI unit stage".

- [ ] **Step 2: Register them.** Save and apply (`git -C runtime apply $TMPDIR/t1.patch`):

```diff
diff --git a/tools/test.ts b/tools/test.ts
index e3b2e11badb9bd3c3ddda93501d6855eaa8bcb8b..fd18df53d6b437812a17dfe6503de0db2538622a 100644
--- a/tools/test.ts
+++ b/tools/test.ts
@@ -84,6 +84,10 @@ const SUITE: readonly Stage[] = [
       "tests/3ds-runtime-state.test.ts",
       "tests/3ds-runtime-wire.test.ts",
       "tests/3ds-soc.test.ts",
+      "tests/3ds-arguments.test.ts",
+      "tests/localmedia.test.ts",
+      "tests/localmedia-sim.test.ts",
+      "tests/localmedia-native.test.ts",
       "tests/iphone2g-profile.test.ts",
       "tests/iphone4s-profile.test.ts",
       "tests/ipodtouch-profile.test.ts",
```

- [ ] **Step 3: Run it again.** `bun test tests/test-suite.test.ts` → **9 pass, 0 fail**.

- [ ] **Step 4: Commit.**

```bash
git -C runtime add tools/test.ts
git -C runtime commit -m "test(suite): run the 3DS arguments and media.local tests in the unit stage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Time capture frames; a per-frame `work` series; `stats.json`

Capture builds keep the host's frame timing (it only reads the tick counter, so frames and goldens are unchanged). `timingUs` gains `work`, each frame's js + tick + draw, whose maximum is one real frame's CPU time; the per-phase maxima can come from different frames. `capture_done()` writes `stats.json` (the `devStats` JSON plus the last 240 frames' phases) before `done`.

**Files:**
- Modify: `runtime/hosts/3ds/src/main.c`, `runtime/hosts/3ds/src/devserver.c`, `runtime/hosts/3ds/README.md`

**Interfaces:**
- Produces: `devStats.timingUs.work: [meanUs, maxUs]`; `sdmc:/pocketjs-captures/stats.json` = `{"host": <devStats>, "trace": [[jsUs, tickUs, drawUs], …]}` (Task 5 adds `"localmedia"`), written before `done`. `scripts/perf.ts` (Task 8) reads both.

- [ ] **Step 1: Apply.** `git -C runtime apply $TMPDIR/t2.patch`:

```diff
diff --git a/hosts/3ds/README.md b/hosts/3ds/README.md
index 71614756ad1b835003e603682ed2a43646b28cb1..092f04f3f48b1b35ff48580acdca97c70c3ce573 100644
--- a/hosts/3ds/README.md
+++ b/hosts/3ds/README.md
@@ -225,9 +225,12 @@ captures both screens, and `o` opens the panel.
 **`devStats` carries `timingUs`: the mean and maximum microseconds of each
 frame phase over the last complete 60-frame window** — guest JS, core tick
 (animation and physics), the two DrawList builds, PICA200 preparation and
-submission, and the frame interval — plus `slowFrames`, the count of intervals
-above 25 ms since boot. A frame after a recovery or a package reload starts a
-new interval and is not sampled.
+submission, and the frame interval — plus `work`, each frame's JS + tick + draw
+(its maximum is one real frame's CPU time, where the per-phase maxima may come
+from different frames), and `slowFrames`, the count of intervals above 25 ms
+since boot. A frame after a recovery or a package reload starts a new interval
+and is not sampled. Capture builds keep the timing too; their `C3D_FRAME_SYNCDRAW`
+pacing stretches the frame interval, so judge them by `work`.
 
 **One authenticated, ordered TCP connection carries every development
 message.** JSON frames contain only Pocket DevTools control and logs. Package
@@ -478,9 +481,11 @@ back off the render target, and the process **parks instead of exiting** —
 Azahar does not stop when the app returns from `main()`.
 
 Emitted under `sdmc:/pocketjs-captures/`: `fNNNN.raw` named by the
-process-global frame counter (exactly `400*240*4` bytes), then `done` written
-only after the last frame is closed, and `error.txt` on the failure path so the
-driver reports the message instead of a timeout.
+process-global frame counter (exactly `400*240*4` bytes), then `stats.json`, then
+`done` written only after the last frame is closed, and `error.txt` on the
+failure path so the driver reports the message instead of a timeout.
+`stats.json` is `{"host": <devStats>, "trace": [[js, tick, draw], …]}`: the
+`devStats` JSON and the last 240 frames' phase times in µs.
 
 The readback is **not** `gfxGetFramebuffer` after `C3D_FrameEnd` — that buffer
 has already been swapped and reads back black. It is an explicit
diff --git a/hosts/3ds/src/devserver.c b/hosts/3ds/src/devserver.c
index 74f478953114e3ee5abcb9c5a14d8edac7fdfaad..eb5a9ecea34612b416ccf1de959a2861455ee66f 100644
--- a/hosts/3ds/src/devserver.c
+++ b/hosts/3ds/src/devserver.c
@@ -109,8 +109,10 @@ static uint32_t frame_dropped_vertices;
 static char stats_json[1024];
 
 /* Frame phase timing: the last complete 60-frame window's means and maxima,
- * plus a running count of frame intervals above 25 ms (1.5 vblanks at 60 Hz). */
-enum { TIMING_PHASES = 5, TIMING_WINDOW = 60 };
+ * plus a running count of frame intervals above 25 ms (1.5 vblanks at 60 Hz).
+ * The sixth series is each frame's CPU work (js + tick + draw), so its maximum
+ * is a real frame's, not a sum of maxima from different frames. */
+enum { TIMING_PHASES = 6, TIMING_WINDOW = 60 };
 static uint32_t timing_sum[TIMING_PHASES];
 static uint32_t timing_max[TIMING_PHASES];
 static uint32_t timing_count;
@@ -490,7 +492,7 @@ void devserver_set_frame_timing(
   uint32_t gpu_us,
   uint32_t frame_us
 ) {
-  const uint32_t values[TIMING_PHASES] = { js_us, tick_us, draw_us, gpu_us, frame_us };
+  const uint32_t values[TIMING_PHASES] = { js_us, tick_us, draw_us, gpu_us, frame_us, js_us + tick_us + draw_us };
   for (int i = 0; i < TIMING_PHASES; i += 1) {
     timing_sum[i] += values[i];
     if (values[i] > timing_max[i]) timing_max[i] = values[i];
@@ -532,7 +534,7 @@ const char *devserver_debug_stats(void) {
     "\"connects\":%lu,\"authFailures\":%lu,\"timeouts\":%lu,"
     "\"discoveries\":%lu,\"uploads\":%lu,\"screenshots\":%lu},"
     "\"timingUs\":{\"js\":[%lu,%lu],\"tick\":[%lu,%lu],\"draw\":[%lu,%lu],"
-    "\"gpu\":[%lu,%lu],\"frame\":[%lu,%lu],\"slowFrames\":%lu}}",
+    "\"gpu\":[%lu,%lu],\"frame\":[%lu,%lu],\"work\":[%lu,%lu],\"slowFrames\":%lu}}",
     POCKETJS_TARGET_ID,
     (unsigned)POCKETJS_HOST_ABI,
     (unsigned long long)running_hash,
@@ -556,6 +558,7 @@ const char *devserver_debug_stats(void) {
     (unsigned long)timing_mean_out[2], (unsigned long)timing_max_out[2],
     (unsigned long)timing_mean_out[3], (unsigned long)timing_max_out[3],
     (unsigned long)timing_mean_out[4], (unsigned long)timing_max_out[4],
+    (unsigned long)timing_mean_out[5], (unsigned long)timing_max_out[5],
     (unsigned long)timing_slow_frames
   );
   return stats_json;
diff --git a/hosts/3ds/src/main.c b/hosts/3ds/src/main.c
index a4dce68de4c834b80e062f4ed3b18b13572d2a89..2ba05d704d3f906a24e1a9c82b2b00fd88461559 100644
--- a/hosts/3ds/src/main.c
+++ b/hosts/3ds/src/main.c
@@ -323,9 +323,36 @@ static bool capture_write_surface(
   return fclose(file) == 0 && written == bytes;
 }
 
+/* The last TRACE_FRAMES frames' js / tick / draw microseconds, oldest first in stats.json. */
+enum { TRACE_FRAMES = 240 };
+static uint32_t trace[TRACE_FRAMES][3];
+static uint32_t trace_count;
+
+static void trace_frame(uint32_t js_us, uint32_t tick_us, uint32_t draw_us) {
+  uint32_t *slot = trace[trace_count % TRACE_FRAMES];
+  slot[0] = js_us;
+  slot[1] = tick_us;
+  slot[2] = draw_us;
+  trace_count += 1;
+}
+
 /* The sentinel the driver waits for. Written only after every requested frame
- * has been written AND closed, so a partial file can never be compared. */
+ * has been written AND closed, so a partial file can never be compared. First,
+ * stats.json: frame timing (the host's last 60-frame window and the trace),
+ * which scripts measure a run by. */
 static void capture_done(void) {
+  FILE *stats = fopen(CAPTURE_DIR "/stats.json", "wb");
+  if (stats != NULL) {
+    fprintf(stats, "{\"host\":%s,\"trace\":[", devserver_debug_stats());
+    uint32_t frames = trace_count < TRACE_FRAMES ? trace_count : TRACE_FRAMES;
+    for (uint32_t i = 0; i < frames; i += 1) {
+      const uint32_t *slot = trace[(trace_count - frames + i) % TRACE_FRAMES];
+      fprintf(stats, "%s[%lu,%lu,%lu]", i ? "," : "", (unsigned long)slot[0], (unsigned long)slot[1], (unsigned long)slot[2]);
+    }
+    fputs("]", stats);
+    fputs("}\n", stats);
+    fclose(stats);
+  }
   FILE *file = fopen(CAPTURE_DIR "/done", "wb");
   if (file == NULL) return;
   fputs("ok\n", file);
@@ -334,6 +361,14 @@ static void capture_done(void) {
 
 #endif /* POCKETJS_CAPTURE */
 
+#if !defined(POCKETJS_OFFLOAD)
+/* System ticks to microseconds, saturated to 32 bits. */
+static uint32_t ticks_to_us(u64 ticks) {
+  u64 us = ticks * 1000000 / SYSCLOCK_ARM11;
+  return us > UINT32_MAX ? UINT32_MAX : (uint32_t)us;
+}
+#endif
+
 #if !defined(POCKETJS_CAPTURE) && !defined(POCKETJS_OFFLOAD)
 /* A transfer that replaced this .3dsx waits in native-deferred.3dsx until the
  * process no longer reads ROMFS from the file. */
@@ -593,13 +628,6 @@ static void accept_guest(
   devserver_report_install("accepted", accepted_hash, "first PICA command list retired");
 }
 
-#if !defined(POCKETJS_CAPTURE) && !defined(POCKETJS_OFFLOAD)
-/* System ticks to microseconds, saturated to 32 bits. */
-static uint32_t ticks_to_us(u64 ticks) {
-  u64 us = ticks * 1000000 / SYSCLOCK_ARM11;
-  return us > UINT32_MAX ? UINT32_MAX : (uint32_t)us;
-}
-#endif
 
 static void begin_frame_wait(uint32_t run_frame) {
 #ifdef POCKETJS_CAPTURE
@@ -1024,15 +1052,25 @@ int main(void) {
     gfx_draw_surface(1);
     C3D_FrameEnd(0);
     offload_measure((unsigned)((offload_ui_ticks + svcGetSystemTick() - offload_cpu_start) * 1000000 / SYSCLOCK_ARM11));
-#if !defined(POCKETJS_CAPTURE) && !defined(POCKETJS_OFFLOAD)
+#if !defined(POCKETJS_OFFLOAD)
     {
-      /* A frame interval is measured only between consecutive presented
+      /* Capture builds time frames too (stats.json, written at the end of the
+       * window); timing only reads the tick counter, so frames are unchanged.
+       * A frame interval is measured only between consecutive presented
        * frames: a recovery or a reload advances run_frame by more than one,
        * and the frame after it starts a fresh interval. */
+#ifdef POCKETJS_CAPTURE
+      uint32_t timed_frame = frame;
+#else
+      uint32_t timed_frame = run_frame;
+#endif
       static u64 previous_js;
       static uint32_t previous_frame = UINT32_MAX;
       u64 phase_end = svcGetSystemTick();
-      if (previous_frame != UINT32_MAX && run_frame == previous_frame + 1) {
+      if (previous_frame != UINT32_MAX && timed_frame == previous_frame + 1) {
+#ifdef POCKETJS_CAPTURE
+        trace_frame(ticks_to_us(phase_tick - phase_js), ticks_to_us(phase_draw - phase_tick), ticks_to_us(phase_draw_end - phase_draw));
+#endif
         devserver_set_frame_timing(
           ticks_to_us(phase_tick - phase_js),
           ticks_to_us(phase_draw - phase_tick),
@@ -1042,8 +1080,10 @@ int main(void) {
         );
       }
       previous_js = phase_js;
-      previous_frame = run_frame;
+      previous_frame = timed_frame;
     }
+#endif
+#if !defined(POCKETJS_CAPTURE) && !defined(POCKETJS_OFFLOAD)
     guest.submitted_frames += 1;
     devserver_set_frame_stats(
       run_frame,
```

- [ ] **Step 2: Check nothing else moved.** `cd runtime && bun test tests/3ds-profile.test.ts tests/3ds-runtime-state.test.ts` → all pass. (No host test covers `main.c` or `devserver.c`; they do not compile on the host. Task 8 builds both 3DS variants and its perf run reads `work` and `trace`.)

- [ ] **Step 3: Commit.**

```bash
git -C runtime add hosts/3ds/src/main.c hosts/3ds/src/devserver.c hosts/3ds/README.md
git -C runtime commit -m "feat(3ds): time capture frames, add a per-frame CPU work series, write stats.json

Capture builds now keep the host's frame timing (it only reads the tick
counter) and write stats.json before the done sentinel: the devStats JSON and
the last 240 frames' js/tick/draw. timingUs gains work, each frame's
js + tick + draw, whose maximum is a real frame's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Scan cache, directory listing and a two-reader scan (pure units)

Measured in Azahar (spec §11.3): opening a file costs ~17 ms and closing it ~12 ms, a read ~0.9 ms + 0.2 ms/KB; libctru's `stat()` opens the file and reports `st_mtime` 0; reading the folder's 324 directory entries 32 at a time costs 0.4 s; two threads overlap their opens almost perfectly. So the scan:
1. lists names and sizes from directory entries (`localmedia_dir`), opening nothing;
2. reuses a cached entry (`localmedia_cache`) whose name and size match;
3. reads the rest with 4 KB stdio buffers on up to two readers (the caller and, through `options->start`, one helper), the caller calling `options->between` before each file it reads;
4. builds the library in directory order.

`lm_library_scan` keeps its signature. A test-only hook (`LM_TEST_ALLOC_FAIL`) makes allocations in the library, listing and cache units fail on demand: after N allocations, or at or above a size.

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_cache.{h,c}`, `localmedia_dir.{h,c}`, `localmedia_alloc.h`
- Modify: `runtime/hosts/3ds/src/localmedia_library.{h,c}`, `runtime/hosts/3ds/Makefile`
- Test: create `runtime/tests/fixtures/localmedia/cache-test.c`, `scan-cache-test.c`, `alloc-fail.c`; modify `runtime/tests/localmedia-native.test.ts`

**Interfaces:**
- Produces:
  - `int lm_cache_read(const char *path, LmCache *out)`, `int lm_cache_write(const char *path, const LmCache *cache)`, `int lm_cache_add(LmCache *, const LmCacheEntry *)`, `const LmCacheEntry *lm_cache_find(const LmCache *, const char *file, uint64_t size)`, `int lm_cache_entry_copy(LmCacheEntry *to, const LmCacheEntry *from)`, `void lm_cache_entry_free(LmCacheEntry *)`, `void lm_cache_free(LmCache *)`.
  - `int lm_dir_list(const char *root, int max, LmDirList *out)` (1 listed, 0 missing folder, −1 out of memory), `void lm_dir_free(LmDirList *)`.
  - `LmScanOptions { const LmCache *previous; LmCache *next; LmScanStats *stats; void (*between)(void *); void *ctx; void *(*start)(void (*)(void *), void *); void (*join)(void *); }`, `LmLibrary *lm_library_scan_with(root, ids, max_tracks, stop, const LmScanOptions *)`, `LmLibrary *lm_library_from_cache(const LmCache *, LmIds *, int max_tracks)` (sets `provisional`), `LmScanStats { int files, parsed; }`, `LM_SCAN_BUFFER 4096`.
  - Test hook: `_Atomic int lm_test_allocs_left` (−1: no limit), `_Atomic size_t lm_test_alloc_fail_bytes` (0: none).
- Consumed by Task 5 (`localmedia.c`).

- [ ] **Step 1: Write the failing tests.** Apply the tests: `git -C runtime apply --include='tests/*' $TMPDIR/t3.patch`.
- [ ] **Step 2: Watch them fail.** `cd runtime && bun test tests/localmedia-native.test.ts` → **5 pass, 4 fail**: cache, scan, library and glue fail to compile (`no such file or directory: …/localmedia_cache.c`, `…/localmedia_dir.c`).
- [ ] **Step 3: Implement.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t3.patch`. The whole patch:

```diff
diff --git a/hosts/3ds/Makefile b/hosts/3ds/Makefile
index 1f88426d4ccc916e7d29c3197164eaaca00d3e4e..fd522fd76a9e97cd72977b8eec69622dd027f6f7 100644
--- a/hosts/3ds/Makefile
+++ b/hosts/3ds/Makefile
@@ -111,7 +111,7 @@ LDFLAGS := -specs=3dsx.specs $(ARCH) -Wl,--gc-sections -Wl,-Map,$(BUILD)/pocketj
 LIBPATHS := -L$(DEVKITPRO)/libctru/lib
 LIBS := -lcitro3d -lctru -lm
 
-OBJECTS := $(BUILD)/main.o $(BUILD)/media.o $(BUILD)/localmedia.o $(BUILD)/localmedia_ids.o $(BUILD)/localmedia_tags.o $(BUILD)/localmedia_mp3.o $(BUILD)/localmedia_art.o $(BUILD)/localmedia_library.o $(BUILD)/localmedia_player.o $(BUILD)/offload.o $(BUILD)/soc.o $(BUILD)/svcwire.o $(BUILD)/runtime.o $(BUILD)/dev_protocol.o $(BUILD)/devserver.o $(BUILD)/devmenu.o $(BUILD)/native.o $(BUILD)/hbldr.o $(BUILD)/gfx.o $(BUILD)/qjs.o $(BUILD)/input.o $(BUILD)/vshader_shbin.o
+OBJECTS := $(BUILD)/main.o $(BUILD)/media.o $(BUILD)/localmedia.o $(BUILD)/localmedia_ids.o $(BUILD)/localmedia_tags.o $(BUILD)/localmedia_mp3.o $(BUILD)/localmedia_art.o $(BUILD)/localmedia_library.o $(BUILD)/localmedia_cache.o $(BUILD)/localmedia_dir.o $(BUILD)/localmedia_player.o $(BUILD)/offload.o $(BUILD)/soc.o $(BUILD)/svcwire.o $(BUILD)/runtime.o $(BUILD)/dev_protocol.o $(BUILD)/devserver.o $(BUILD)/devmenu.o $(BUILD)/native.o $(BUILD)/hbldr.o $(BUILD)/gfx.o $(BUILD)/qjs.o $(BUILD)/input.o $(BUILD)/vshader_shbin.o
 ELF := $(BUILD)/pocketjs-3ds.elf
 SMDH := $(BUILD)/pocketjs-3ds.smdh
 
@@ -161,10 +161,12 @@ $(BUILD)/media.o: $(SOURCE)/media.h $(SOURCE)/media_wire.h $(SOURCE)/media_adpcm
 $(BUILD)/main.o $(BUILD)/qjs.o $(BUILD)/gfx.o: $(SOURCE)/media.h
 $(BUILD)/main.o $(BUILD)/qjs.o: $(SOURCE)/localmedia.h
 $(BUILD)/localmedia.o: $(wildcard $(SOURCE)/localmedia*.h)
-$(BUILD)/localmedia_library.o: $(SOURCE)/localmedia_library.h $(SOURCE)/localmedia_ids.h $(SOURCE)/localmedia_tags.h $(SOURCE)/localmedia_mp3.h
+$(BUILD)/localmedia_library.o: $(SOURCE)/localmedia_library.h $(SOURCE)/localmedia_dir.h $(SOURCE)/localmedia_cache.h $(SOURCE)/localmedia_ids.h $(SOURCE)/localmedia_tags.h $(SOURCE)/localmedia_mp3.h
 $(BUILD)/localmedia_player.o: $(SOURCE)/localmedia_player.h $(SOURCE)/localmedia_mp3.h $(SOURCE)/localmedia_tags.h $(CURDIR)/vendor/minimp3.h
 $(BUILD)/localmedia_art.o: $(SOURCE)/localmedia_art.h $(CURDIR)/vendor/stb_image.h
 $(BUILD)/localmedia_ids.o: $(SOURCE)/localmedia_ids.h
+$(BUILD)/localmedia_cache.o: $(SOURCE)/localmedia_cache.h
+$(BUILD)/localmedia_dir.o: $(SOURCE)/localmedia_dir.h
 $(BUILD)/localmedia_tags.o: $(SOURCE)/localmedia_tags.h
 $(BUILD)/localmedia_mp3.o: $(SOURCE)/localmedia_mp3.h
 
diff --git a/hosts/3ds/src/localmedia_alloc.h b/hosts/3ds/src/localmedia_alloc.h
new file mode 100644
index 0000000000000000000000000000000000000000..12aa5bfb24ae28c946077f25a3e5a92ce7a1f854
--- /dev/null
+++ b/hosts/3ds/src/localmedia_alloc.h
@@ -0,0 +1,24 @@
+/*
+ * The scan's allocations (library, folder listing, cache). Host tests build with
+ * LM_TEST_ALLOC_FAIL to make them fail on demand (tests/fixtures/localmedia/alloc-fail.c);
+ * otherwise they are the C library's. Include after <stdlib.h>.
+ */
+#ifndef POCKETJS_LOCALMEDIA_ALLOC_H
+#define POCKETJS_LOCALMEDIA_ALLOC_H
+
+#ifdef LM_TEST_ALLOC_FAIL
+#include <stdatomic.h>
+#include <stddef.h>
+/* Allocations still allowed; negative: no limit. */
+extern _Atomic int lm_test_allocs_left;
+/* Allocations of at least this many bytes fail; 0: none. */
+extern _Atomic size_t lm_test_alloc_fail_bytes;
+void *lm_test_malloc(size_t size);
+void *lm_test_calloc(size_t count, size_t size);
+void *lm_test_realloc(void *pointer, size_t size);
+#define malloc lm_test_malloc
+#define calloc lm_test_calloc
+#define realloc lm_test_realloc
+#endif
+
+#endif
diff --git a/hosts/3ds/src/localmedia_cache.c b/hosts/3ds/src/localmedia_cache.c
new file mode 100644
index 0000000000000000000000000000000000000000..2f66c183e2c3e9323a7ad4d73e49ec28b4f30705
--- /dev/null
+++ b/hosts/3ds/src/localmedia_cache.c
@@ -0,0 +1,213 @@
+/* Scan cache file format and lookups; see localmedia_cache.h.
+ *
+ * Little-endian. Header: "LMC1", u32 version, u32 entry count. Each entry:
+ * u16 name length + bytes, u64 size, three u16-length strings
+ * (title, artist, album), u32 track, u32 duration ms, u8 has art,
+ * i64 art offset, i64 art raw bytes, u8 art unsync. Trailer: u32 FNV-1a of
+ * every byte before it. */
+#include "localmedia_cache.h"
+
+#include <stdio.h>
+#include <stdlib.h>
+#include <string.h>
+
+#include "localmedia_alloc.h"
+
+/* Field and name caps: longer values never came from a scan, so they mark a bad file. */
+#define NAME_MAX_BYTES 1024
+#define TEXT_MAX_BYTES 255
+#define ENTRIES_MAX 65536
+
+/* ---- writing: one growable buffer, written once ---- */
+typedef struct { uint8_t *bytes; size_t length, capacity; int failed; } Out;
+
+static void out_bytes(Out *o, const void *data, size_t length) {
+  if (o->failed) return;
+  if (o->length + length > o->capacity) {
+    size_t capacity = o->capacity ? o->capacity : 4096;
+    while (o->length + length > capacity) capacity *= 2;
+    uint8_t *bytes = realloc(o->bytes, capacity);
+    if (!bytes) { o->failed = 1; return; }
+    o->bytes = bytes;
+    o->capacity = capacity;
+  }
+  memcpy(o->bytes + o->length, data, length);
+  o->length += length;
+}
+static void out_u8(Out *o, uint8_t v) { out_bytes(o, &v, 1); }
+static void out_u16(Out *o, uint16_t v) { uint8_t b[2] = {v & 0xff, v >> 8}; out_bytes(o, b, 2); }
+static void out_u32(Out *o, uint32_t v) { uint8_t b[4] = {v & 0xff, v >> 8 & 0xff, v >> 16 & 0xff, v >> 24}; out_bytes(o, b, 4); }
+static void out_u64(Out *o, uint64_t v) { out_u32(o, (uint32_t)v); out_u32(o, (uint32_t)(v >> 32)); }
+static void out_text(Out *o, const char *text, size_t cap) {
+  size_t length = text ? strlen(text) : 0;
+  if (length > cap) length = cap;
+  out_u16(o, (uint16_t)length);
+  out_bytes(o, text, length);
+}
+
+static uint32_t fnv1a(const uint8_t *bytes, size_t length) {
+  uint32_t hash = 2166136261u;
+  for (size_t i = 0; i < length; i++) hash = (hash ^ bytes[i]) * 16777619u;
+  return hash;
+}
+
+int lm_cache_write(const char *path, const LmCache *cache) {
+  Out o = {0};
+  out_bytes(&o, "LMC1", 4);
+  out_u32(&o, LM_CACHE_VERSION);
+  out_u32(&o, (uint32_t)cache->count);
+  for (int i = 0; i < cache->count; i++) {
+    const LmCacheEntry *e = &cache->entries[i];
+    out_text(&o, e->file, NAME_MAX_BYTES);
+    out_u64(&o, e->size);
+    out_text(&o, e->title, TEXT_MAX_BYTES);
+    out_text(&o, e->artist, TEXT_MAX_BYTES);
+    out_text(&o, e->album, TEXT_MAX_BYTES);
+    out_u32(&o, e->track);
+    out_u32(&o, e->duration_ms);
+    out_u8(&o, e->has_art);
+    out_u64(&o, (uint64_t)e->art_offset);
+    out_u64(&o, (uint64_t)e->art_raw_bytes);
+    out_u8(&o, e->art_unsync);
+  }
+  out_u32(&o, fnv1a(o.bytes, o.length));
+  if (o.failed) { free(o.bytes); return 0; }
+  size_t path_length = strlen(path);
+  char *tmp = malloc(path_length + 5);
+  if (!tmp) { free(o.bytes); return 0; }
+  memcpy(tmp, path, path_length);
+  memcpy(tmp + path_length, ".tmp", 5);
+  FILE *f = fopen(tmp, "wb");
+  int ok = f && fwrite(o.bytes, 1, o.length, f) == o.length;
+  if (f && fclose(f) != 0) ok = 0;
+  free(o.bytes);
+  if (ok) {
+    remove(path); /* rename over an existing file fails on some filesystems (FAT) */
+    ok = rename(tmp, path) == 0;
+  }
+  if (!ok) remove(tmp);
+  free(tmp);
+  return ok;
+}
+
+/* ---- reading: bounds-checked cursor over the whole file ---- */
+typedef struct { const uint8_t *at, *end; int failed; } In;
+
+static const uint8_t *in_take(In *in, size_t length) {
+  if (in->failed || (size_t)(in->end - in->at) < length) { in->failed = 1; return NULL; }
+  const uint8_t *p = in->at;
+  in->at += length;
+  return p;
+}
+static uint8_t in_u8(In *in) { const uint8_t *p = in_take(in, 1); return p ? p[0] : 0; }
+static uint16_t in_u16(In *in) { const uint8_t *p = in_take(in, 2); return p ? (uint16_t)(p[0] | p[1] << 8) : 0; }
+static uint32_t in_u32(In *in) {
+  const uint8_t *p = in_take(in, 4);
+  return p ? (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24 : 0;
+}
+static uint64_t in_u64(In *in) { uint64_t lo = in_u32(in); return lo | (uint64_t)in_u32(in) << 32; }
+/* A malloc'd NUL-terminated copy; NULL (and failed) when too long or out of memory. */
+static char *in_text(In *in, size_t cap) {
+  uint16_t length = in_u16(in);
+  if (length > cap) { in->failed = 1; return NULL; }
+  const uint8_t *p = in_take(in, length);
+  if (!p) return NULL;
+  char *text = malloc((size_t)length + 1);
+  if (!text) { in->failed = 1; return NULL; }
+  memcpy(text, p, length);
+  text[length] = '\0';
+  return text;
+}
+
+void lm_cache_entry_free(LmCacheEntry *e) {
+  free(e->file); free(e->title); free(e->artist); free(e->album);
+  memset(e, 0, sizeof *e);
+}
+
+void lm_cache_free(LmCache *cache) {
+  for (int i = 0; i < cache->count; i++) lm_cache_entry_free(&cache->entries[i]);
+  free(cache->entries);
+  memset(cache, 0, sizeof *cache);
+}
+
+static char *dup_text(const char *text) {
+  size_t length = text ? strlen(text) : 0;
+  char *copy = malloc(length + 1);
+  if (copy) { if (length) memcpy(copy, text, length); copy[length] = '\0'; }
+  return copy;
+}
+
+int lm_cache_entry_copy(LmCacheEntry *to, const LmCacheEntry *from) {
+  *to = *from;
+  to->file = dup_text(from->file);
+  to->title = dup_text(from->title);
+  to->artist = dup_text(from->artist);
+  to->album = dup_text(from->album);
+  if (to->file && to->title && to->artist && to->album) return 1;
+  lm_cache_entry_free(to);
+  return 0;
+}
+
+int lm_cache_add(LmCache *cache, const LmCacheEntry *entry) {
+  if (cache->count == cache->capacity) {
+    int capacity = cache->capacity ? cache->capacity * 2 : 64;
+    LmCacheEntry *entries = realloc(cache->entries, (size_t)capacity * sizeof *entries);
+    if (!entries) return 0;
+    cache->entries = entries;
+    cache->capacity = capacity;
+  }
+  if (!lm_cache_entry_copy(&cache->entries[cache->count], entry)) return 0;
+  cache->count++;
+  return 1;
+}
+
+int lm_cache_read(const char *path, LmCache *out) {
+  memset(out, 0, sizeof *out);
+  FILE *f = fopen(path, "rb");
+  if (!f) return 0;
+  uint8_t *bytes = NULL;
+  long size = 0;
+  if (fseek(f, 0, SEEK_END) == 0) size = ftell(f);
+  if (size >= 16 && size <= 64L * 1024 * 1024 && fseek(f, 0, SEEK_SET) == 0) {
+    bytes = malloc((size_t)size);
+    if (bytes && fread(bytes, 1, (size_t)size, f) != (size_t)size) { free(bytes); bytes = NULL; }
+  }
+  fclose(f);
+  if (!bytes) return 0;
+  uint32_t stored = (uint32_t)bytes[size - 4] | (uint32_t)bytes[size - 3] << 8 | (uint32_t)bytes[size - 2] << 16 | (uint32_t)bytes[size - 1] << 24;
+  In in = {bytes, bytes + size - 4, 0};
+  int ok = fnv1a(bytes, (size_t)size - 4) == stored;
+  const uint8_t *magic = ok ? in_take(&in, 4) : NULL;
+  ok = magic && memcmp(magic, "LMC1", 4) == 0 && in_u32(&in) == LM_CACHE_VERSION;
+  uint32_t count = ok ? in_u32(&in) : 0;
+  if (count > ENTRIES_MAX) ok = 0;
+  for (uint32_t i = 0; ok && i < count; i++) {
+    LmCacheEntry e = {0};
+    e.file = in_text(&in, NAME_MAX_BYTES);
+    e.size = in_u64(&in);
+    e.title = in_text(&in, TEXT_MAX_BYTES);
+    e.artist = in_text(&in, TEXT_MAX_BYTES);
+    e.album = in_text(&in, TEXT_MAX_BYTES);
+    e.track = in_u32(&in);
+    e.duration_ms = in_u32(&in);
+    e.has_art = in_u8(&in);
+    e.art_offset = (int64_t)in_u64(&in);
+    e.art_raw_bytes = (int64_t)in_u64(&in);
+    e.art_unsync = in_u8(&in);
+    if (in.failed || !e.file || e.file[0] == '\0') { lm_cache_entry_free(&e); ok = 0; break; }
+    ok = lm_cache_add(out, &e);
+    lm_cache_entry_free(&e);
+  }
+  if (ok && in.at != in.end) ok = 0; /* trailing bytes: not a file this code wrote */
+  free(bytes);
+  if (!ok) lm_cache_free(out);
+  return ok;
+}
+
+const LmCacheEntry *lm_cache_find(const LmCache *cache, const char *file, uint64_t size) {
+  for (int i = 0; i < cache->count; i++) {
+    const LmCacheEntry *e = &cache->entries[i];
+    if (e->size == size && strcmp(e->file, file) == 0) return e;
+  }
+  return NULL;
+}
diff --git a/hosts/3ds/src/localmedia_cache.h b/hosts/3ds/src/localmedia_cache.h
new file mode 100644
index 0000000000000000000000000000000000000000..d45715e08edc895d47bd71c192018b38aad520a2
--- /dev/null
+++ b/hosts/3ds/src/localmedia_cache.h
@@ -0,0 +1,53 @@
+/*
+ * media.local scan cache: what a scan learned about each file (tags, duration,
+ * cover location), keyed by name and size, kept on the SD card so a later scan
+ * reads only new or changed files. (The 3DS SD card gives no modified time: stat()
+ * reports 0, and a timestamp query costs as much as reading the file's tags.) The file is versioned and
+ * checksummed; anything that does not parse is an empty cache, never a partial
+ * one. Writes go to `<path>.tmp` and are renamed over `<path>`.
+ *
+ * Pure C over stdio: compiled into the 3DS host and into the host-side tests.
+ */
+#ifndef POCKETJS_LOCALMEDIA_CACHE_H
+#define POCKETJS_LOCALMEDIA_CACHE_H
+
+#include <stddef.h>
+#include <stdint.h>
+
+#define LM_CACHE_VERSION 1u
+
+typedef struct {
+  char *file;
+  uint64_t size;
+  /* Tag text as read (empty when the file has none; the scan applies fallbacks). */
+  char *title, *artist, *album;
+  uint32_t track;
+  uint32_t duration_ms;
+  uint8_t has_art;
+  int64_t art_offset;
+  int64_t art_raw_bytes;
+  uint8_t art_unsync;
+} LmCacheEntry;
+
+typedef struct {
+  LmCacheEntry *entries;
+  int count;
+  int capacity;
+} LmCache;
+
+/* Loads a cache file. Returns 1 with `out` filled, or 0 with `out` empty when the file
+ * is missing, unreadable, truncated, of another version or fails its checksum. */
+int lm_cache_read(const char *path, LmCache *out);
+/* Writes `cache` to path + ".tmp", then renames it over `path`. Returns 1 on success. */
+int lm_cache_write(const char *path, const LmCache *cache);
+/* Sets `to` to a copy of `from` with its own strings. Returns 0 (and `to` empty) when out of memory. */
+int lm_cache_entry_copy(LmCacheEntry *to, const LmCacheEntry *from);
+/* Frees a copy's strings and empties it. */
+void lm_cache_entry_free(LmCacheEntry *entry);
+/* Appends a copy of `entry` (strings are duplicated). Returns 0 when out of memory. */
+int lm_cache_add(LmCache *cache, const LmCacheEntry *entry);
+/* The entry for `file` when its size still matches, else NULL. */
+const LmCacheEntry *lm_cache_find(const LmCache *cache, const char *file, uint64_t size);
+void lm_cache_free(LmCache *cache);
+
+#endif
diff --git a/hosts/3ds/src/localmedia_dir.c b/hosts/3ds/src/localmedia_dir.c
new file mode 100644
index 0000000000000000000000000000000000000000..bc14ed60ab3c6c470b14af5309b2d75a1bc0de51
--- /dev/null
+++ b/hosts/3ds/src/localmedia_dir.c
@@ -0,0 +1,108 @@
+/* Folder listing; see localmedia_dir.h. */
+#include "localmedia_dir.h"
+
+#include <stdlib.h>
+#include <string.h>
+
+#include "localmedia_alloc.h"
+
+static int is_mp3(const char *name) {
+  size_t length = strlen(name);
+  if (length < 5) return 0;
+  const char *ext = name + length - 4;
+  return ext[0] == '.' && (ext[1] | 0x20) == 'm' && (ext[2] | 0x20) == 'p' && ext[3] == '3';
+}
+
+void lm_dir_free(LmDirList *list) {
+  for (int i = 0; i < list->count; i++) free(list->entries[i].name);
+  free(list->entries);
+  memset(list, 0, sizeof *list);
+}
+
+/* Appends a copy of `name`; 0 when out of memory. */
+static int add(LmDirList *list, const char *name, uint64_t size) {
+  if (list->count == list->capacity) {
+    int capacity = list->capacity ? list->capacity * 2 : 64;
+    LmDirEntry *entries = realloc(list->entries, (size_t)capacity * sizeof *entries);
+    if (!entries) return 0;
+    list->entries = entries;
+    list->capacity = capacity;
+  }
+  size_t length = strlen(name) + 1;
+  char *copy = malloc(length);
+  if (!copy) return 0;
+  memcpy(copy, name, length);
+  list->entries[list->count++] = (LmDirEntry){copy, size};
+  return 1;
+}
+
+#ifdef __3DS__
+#include <3ds.h>
+
+#define BATCH 32
+
+int lm_dir_list(const char *root, int max, LmDirList *out) {
+  memset(out, 0, sizeof *out);
+  /* "sdmc:/music/" → "/music" on the SD card archive. */
+  if (strncmp(root, "sdmc:", 5) == 0) root += 5;
+  size_t length = strlen(root);
+  char *path = malloc(length + 1);
+  if (!path) return -1;
+  memcpy(path, root, length + 1);
+  if (length > 1 && path[length - 1] == '/') path[length - 1] = '\0';
+  FS_Archive archive;
+  Handle dir;
+  int result = 0;
+  if (R_SUCCEEDED(FSUSER_OpenArchive(&archive, ARCHIVE_SDMC, fsMakePath(PATH_EMPTY, "")))) {
+    if (R_SUCCEEDED(FSUSER_OpenDirectory(&dir, archive, fsMakePath(PATH_ASCII, path)))) {
+      FS_DirectoryEntry *batch = malloc(BATCH * sizeof *batch);
+      char name[sizeof batch->name / 2 * 3 + 1];
+      result = batch ? 1 : -1;
+      u32 got = 0;
+      while (result == 1 && out->count < max && R_SUCCEEDED(FSDIR_Read(dir, &got, BATCH, batch)) && got > 0) {
+        for (u32 i = 0; i < got && out->count < max; i++) {
+          if (batch[i].attributes & FS_ATTRIBUTE_DIRECTORY) continue;
+          ssize_t n = utf16_to_utf8((uint8_t *)name, batch[i].name, sizeof name - 1);
+          if (n <= 0 || n >= (ssize_t)sizeof name - 1) continue;
+          name[n] = '\0';
+          if (is_mp3(name) && !add(out, name, batch[i].fileSize)) result = -1;
+        }
+      }
+      free(batch);
+      FSDIR_Close(dir);
+    }
+    FSUSER_CloseArchive(archive);
+  }
+  free(path);
+  if (result != 1) lm_dir_free(out);
+  return result;
+}
+
+#else
+#include <dirent.h>
+#include <sys/stat.h>
+
+int lm_dir_list(const char *root, int max, LmDirList *out) {
+  memset(out, 0, sizeof *out);
+  DIR *dir = opendir(root);
+  if (!dir) return 0;
+  size_t root_length = strlen(root);
+  int result = 1;
+  struct dirent *entry;
+  while (result == 1 && out->count < max && (entry = readdir(dir))) {
+    if (!is_mp3(entry->d_name)) continue;
+    size_t name_length = strlen(entry->d_name);
+    char *path = malloc(root_length + name_length + 1);
+    if (!path) { result = -1; break; }
+    memcpy(path, root, root_length);
+    memcpy(path + root_length, entry->d_name, name_length + 1);
+    struct stat info;
+    int regular = stat(path, &info) == 0 && S_ISREG(info.st_mode);
+    free(path);
+    if (regular && !add(out, entry->d_name, (uint64_t)info.st_size)) result = -1;
+  }
+  closedir(dir);
+  if (result != 1) lm_dir_free(out);
+  return result;
+}
+#endif
diff --git a/hosts/3ds/src/localmedia_dir.h b/hosts/3ds/src/localmedia_dir.h
new file mode 100644
index 0000000000000000000000000000000000000000..7ffbe9d1b6af80ee06598aaa2c60e104d59801bc
--- /dev/null
+++ b/hosts/3ds/src/localmedia_dir.h
@@ -0,0 +1,30 @@
+/*
+ * media.local folder listing: the *.mp3 regular files directly in a folder (extension
+ * case-insensitive), with their sizes, in directory order.
+ *
+ * On the 3DS the listing comes from the SD card's directory entries, read 32 at a time:
+ * no file is opened, so listing a folder costs well under a second where a stat() per
+ * file (which opens it) costs about 26 ms each. Elsewhere it is opendir() and stat().
+ */
+#ifndef POCKETJS_LOCALMEDIA_DIR_H
+#define POCKETJS_LOCALMEDIA_DIR_H
+
+#include <stdint.h>
+
+typedef struct {
+  char *name;     /* UTF-8, relative to the listed folder */
+  uint64_t size;
+} LmDirEntry;
+
+typedef struct {
+  LmDirEntry *entries;
+  int count;
+  int capacity;
+} LmDirList;
+
+/* Lists up to `max` files of `root` (ending in '/'). Returns 1 with `out` filled, 0 with `out`
+ * empty when the folder is missing or unreadable, -1 with `out` empty when out of memory. */
+int lm_dir_list(const char *root, int max, LmDirList *out);
+void lm_dir_free(LmDirList *list);
+
+#endif
diff --git a/hosts/3ds/src/localmedia_library.c b/hosts/3ds/src/localmedia_library.c
index ac279ea37ccb075fde9d5ac22c3def20a49c513b..1b63583fb0a1bc149887e47346fde960479500e2 100644
--- a/hosts/3ds/src/localmedia_library.c
+++ b/hosts/3ds/src/localmedia_library.c
@@ -1,13 +1,14 @@
 /* Folder scan and tracks() JSON; see localmedia_library.h. */
 #include "localmedia_library.h"
+#include "localmedia_dir.h"
 #include "localmedia_mp3.h"
 #include "localmedia_tags.h"
 
-#include <dirent.h>
 #include <stdio.h>
 #include <stdlib.h>
 #include <string.h>
-#include <sys/stat.h>
+
+#include "localmedia_alloc.h"
 
 typedef struct {
   char *bytes;
@@ -50,38 +51,76 @@ static void json_string(Json *j, const char *text) {
   json_raw(j, "\"", 1);
 }
 
-static int is_mp3(const char *name) {
-  size_t length = strlen(name);
-  if (length < 5) return 0;
-  const char *ext = name + length - 4;
-  return ext[0] == '.' && (ext[1] | 0x20) == 'm' && (ext[2] | 0x20) == 'p' && ext[3] == '3';
-}
-
 /* The file name without its extension, as UTF-8 text (shared rules with tag text). */
 static void stem_of(const char *name, char out[LM_FIELD_BYTES]) {
   size_t length = strlen(name) - 4;
   lm_tags_text(3, (const uint8_t *)name, length, out);
 }
 
-static void add_track_json(Json *j, int first, int id, const char *file, const LmTags *tags, uint32_t duration_ms, int track) {
+static void add_track_json(Json *j, int first, int id, const LmCacheEntry *e) {
   char number[64];
   char stem[LM_FIELD_BYTES];
   json_text(j, first ? "{\"id\":" : ",{\"id\":");
   snprintf(number, sizeof number, "%d", id);
   json_text(j, number);
   json_text(j, ",\"file\":");
-  json_string(j, file);
+  json_string(j, e->file);
   json_text(j, ",\"title\":");
-  if (tags->title[0]) json_string(j, tags->title);
-  else { stem_of(file, stem); json_string(j, stem); }
+  if (e->title[0]) json_string(j, e->title);
+  else { stem_of(e->file, stem); json_string(j, stem); }
   json_text(j, ",\"artist\":");
-  json_string(j, tags->artist[0] ? tags->artist : "Unknown Artist");
+  json_string(j, e->artist[0] ? e->artist : "Unknown Artist");
   json_text(j, ",\"album\":");
-  json_string(j, tags->album[0] ? tags->album : "Unknown Album");
-  snprintf(number, sizeof number, ",\"track\":%d,\"durationMs\":%u,\"hasArt\":%s}", track, (unsigned)duration_ms, tags->has_art ? "true" : "false");
+  json_string(j, e->album[0] ? e->album : "Unknown Album");
+  snprintf(number, sizeof number, ",\"track\":%u,\"durationMs\":%u,\"hasArt\":%s}", (unsigned)e->track, (unsigned)e->duration_ms, e->has_art ? "true" : "false");
   json_text(j, number);
 }
 
+/* Collects tracks and their JSON for one library. */
+typedef struct {
+  LmLibrary *library;
+  LmTrack *tracks;
+  int max;
+  Json j;
+  int ok;
+} Builder;
+
+static void builder_init(Builder *b, int max) {
+  memset(b, 0, sizeof *b);
+  b->library = calloc(1, sizeof *b->library);
+  b->tracks = calloc((size_t)(max > 0 ? max : 1), sizeof *b->tracks);
+  b->max = max;
+  b->ok = b->library && b->tracks;
+  json_text(&b->j, "[");
+}
+
+static int builder_add(Builder *b, LmIds *ids, const LmCacheEntry *e) {
+  if (!b->ok || b->library->count >= b->max) return 0;
+  size_t length = strlen(e->file) + 1;
+  char *file = malloc(length);
+  int id = file ? lm_ids_get(ids, e->file) : -1;
+  if (id < 0) { free(file); b->ok = 0; return 0; }
+  memcpy(file, e->file, length);
+  b->tracks[b->library->count] = (LmTrack){id, file, e->duration_ms, e->has_art, (long)e->art_offset, (long)e->art_raw_bytes, e->art_unsync};
+  add_track_json(&b->j, b->library->count == 0, id, e);
+  b->library->count++;
+  return 1;
+}
+
+static LmLibrary *builder_finish(Builder *b) {
+  json_text(&b->j, "]");
+  if (!b->ok || b->j.failed) {
+    if (b->library) { b->library->tracks = b->tracks; lm_library_free(b->library); }
+    else free(b->tracks);
+    free(b->j.bytes);
+    return NULL;
+  }
+  b->library->tracks = b->tracks;
+  b->library->json = b->j.bytes;
+  b->library->json_length = b->j.length;
+  return b->library;
+}
+
 LmLibrary *lm_library_empty(void) {
   LmLibrary *library = calloc(1, sizeof *library);
   if (!library) return NULL;
@@ -106,53 +145,133 @@ const LmTrack *lm_library_find(const LmLibrary *library, int id) {
   return NULL;
 }
 
+/* Reads one file's tags and duration into `out` (strings point into `tags`). */
+static int parse_file(const char *path, const char *file, uint64_t size, uint8_t *buffer, LmTags *tags, LmCacheEntry *out) {
+  FILE *f = fopen(path, "rb");
+  if (!f) return 0;
+  /* Every SD card read costs about 0.9 ms plus 0.2 ms per KB (Azahar), so the buffer is just
+   * big enough for a tag's text frames or the first audio frame: a file takes three or four. */
+  setvbuf(f, (char *)buffer, _IOFBF, LM_SCAN_BUFFER);
+  LmStream stream;
+  lm_tags_read(f, (long)size, tags);
+  uint32_t duration = lm_stream_probe(f, tags->audio_start, tags->audio_end, &stream) ? stream.duration_ms : 0;
+  fclose(f);
+  *out = (LmCacheEntry){(char *)file, size, tags->title, tags->artist, tags->album, (uint32_t)tags->track, duration,
+    (uint8_t)tags->has_art, tags->art_offset, tags->art_raw_bytes, (uint8_t)tags->art_unsync};
+  return 1;
+}
+
 LmLibrary *lm_library_scan(const char *root, LmIds *ids, int max_tracks, const atomic_int *stop) {
-  DIR *dir = opendir(root);
-  if (!dir) return lm_library_empty();
-  LmLibrary *library = calloc(1, sizeof *library);
-  LmTrack *tracks = calloc((size_t)max_tracks, sizeof *tracks);
-  Json j = {0};
-  json_text(&j, "[");
-  int ok = library && tracks;
-  size_t root_length = strlen(root);
-  struct dirent *entry;
-  while (ok && library->count < max_tracks && (entry = readdir(dir))) {
-    if (stop && atomic_load(stop)) { ok = 0; break; }
-    if (!is_mp3(entry->d_name)) continue;
-    size_t name_length = strlen(entry->d_name);
+  return lm_library_scan_with(root, ids, max_tracks, stop, NULL);
+}
+
+/* The files a scan must read, shared by its readers: each takes the next job until none are left. */
+typedef struct {
+  const char *root;
+  const LmDirList *list;
+  const int *jobs;          /* indices into list */
+  int job_count;
+  atomic_int next_job;
+  LmCacheEntry *parsed;     /* per listed file: its own copy, when read */
+  char *read;               /* per listed file: 1 when parsed[i] is filled */
+  const atomic_int *stop;
+  atomic_int failed;        /* out of memory */
+  const LmScanOptions *options;
+} Jobs;
+
+typedef struct {
+  Jobs *jobs;
+  int calls_between;        /* only the scanning thread calls options->between */
+} Reader;
+
+static void read_files(void *context) {
+  Reader *reader = context;
+  Jobs *jobs = reader->jobs;
+  size_t root_length = strlen(jobs->root);
+  uint8_t *buffer = malloc(LM_SCAN_BUFFER);
+  LmTags *tags = malloc(sizeof *tags);
+  if (!buffer || !tags) atomic_store(&jobs->failed, 1);
+  while (!atomic_load(&jobs->failed) && !(jobs->stop && atomic_load(jobs->stop))) {
+    int job = atomic_fetch_add(&jobs->next_job, 1);
+    if (job >= jobs->job_count) break;
+    if (reader->calls_between && jobs->options->between) jobs->options->between(jobs->options->ctx);
+    int index = jobs->jobs[job];
+    const LmDirEntry *file = &jobs->list->entries[index];
+    size_t name_length = strlen(file->name);
     char *path = malloc(root_length + name_length + 1);
-    char *file = malloc(name_length + 1);
-    if (!path || !file) { free(path); free(file); ok = 0; break; }
-    memcpy(path, root, root_length);
-    memcpy(path + root_length, entry->d_name, name_length + 1);
-    memcpy(file, entry->d_name, name_length + 1);
-    struct stat info;
-    FILE *f = NULL;
-    if (stat(path, &info) != 0 || !S_ISREG(info.st_mode) || !(f = fopen(path, "rb"))) { free(path); free(file); continue; }
+    if (!path) { atomic_store(&jobs->failed, 1); break; }
+    memcpy(path, jobs->root, root_length);
+    memcpy(path + root_length, file->name, name_length + 1);
+    LmCacheEntry view;
+    if (parse_file(path, file->name, file->size, buffer, tags, &view)) {
+      if (lm_cache_entry_copy(&jobs->parsed[index], &view)) jobs->read[index] = 1;
+      else atomic_store(&jobs->failed, 1);
+    }
     free(path);
-    LmTags tags;
-    LmStream stream;
-    long size = (long)info.st_size;
-    lm_tags_read(f, size, &tags);
-    uint32_t duration = lm_stream_probe(f, tags.audio_start, tags.audio_end, &stream) ? stream.duration_ms : 0;
-    fclose(f);
-    int id = lm_ids_get(ids, file);
-    if (id < 0) { free(file); ok = 0; break; }
-    LmTrack *track = &tracks[library->count];
-    *track = (LmTrack){id, file, duration, tags.has_art, tags.art_offset, tags.art_raw_bytes, tags.art_unsync};
-    add_track_json(&j, library->count == 0, id, file, &tags, duration, tags.track);
-    library->count++;
   }
-  closedir(dir);
-  json_text(&j, "]");
-  if (!ok || j.failed) {
-    if (library) { library->tracks = tracks; lm_library_free(library); }
-    else free(tracks);
-    free(j.bytes);
-    return NULL;
+  free(buffer);
+  free(tags);
+}
+
+LmLibrary *lm_library_scan_with(const char *root, LmIds *ids, int max_tracks, const atomic_int *stop,
+    const LmScanOptions *options) {
+  static const LmScanOptions none = {0};
+  if (!options) options = &none;
+  if (options->stats) memset(options->stats, 0, sizeof *options->stats);
+  LmDirList list;
+  int listed = lm_dir_list(root, max_tracks, &list);
+  if (listed < 0) return NULL;
+  if (listed == 0) return lm_library_empty();
+  int count = list.count;
+  const LmCacheEntry **hits = calloc((size_t)(count ? count : 1), sizeof *hits);
+  int *indices = malloc((size_t)(count ? count : 1) * sizeof *indices);
+  Jobs jobs = {root, &list, indices, 0, 0, calloc((size_t)(count ? count : 1), sizeof(LmCacheEntry)),
+    calloc((size_t)(count ? count : 1), 1), stop, 0, options};
+  int ok = hits && indices && jobs.parsed && jobs.read;
+  for (int i = 0; ok && i < count; i++) {
+    hits[i] = options->previous ? lm_cache_find(options->previous, list.entries[i].name, list.entries[i].size) : NULL;
+    if (!hits[i]) indices[jobs.job_count++] = i;
+  }
+  if (ok) {
+    /* Opening a file dominates (about 28 ms with its close, Azahar) and two readers overlap
+     * their opens almost perfectly; a third adds nothing. */
+    Reader helper = {&jobs, 0}, self = {&jobs, 1};
+    void *thread = options->start && jobs.job_count > 1 ? options->start(read_files, &helper) : NULL;
+    read_files(&self);
+    if (thread) options->join(thread);
+    ok = !atomic_load(&jobs.failed) && !(stop && atomic_load(stop));
+  }
+  Builder b;
+  builder_init(&b, max_tracks);
+  if (!ok) b.ok = 0;
+  int parsed = 0;
+  for (int i = 0; b.ok && i < count; i++) {
+    const LmCacheEntry *use = hits[i] ? hits[i] : jobs.read[i] ? &jobs.parsed[i] : NULL;
+    if (jobs.read && jobs.read[i]) parsed++;
+    if (!use) continue;
+    if (!builder_add(&b, ids, use)) break;
+    if (options->next && !lm_cache_add(options->next, use)) b.ok = 0;
+  }
+  for (int i = 0; jobs.parsed && i < count; i++) lm_cache_entry_free(&jobs.parsed[i]);
+  free(jobs.parsed);
+  free(jobs.read);
+  free(indices);
+  free(hits);
+  lm_dir_free(&list);
+  LmLibrary *library = builder_finish(&b);
+  if (library && options->stats) {
+    options->stats->files = library->count;
+    options->stats->parsed = parsed;
   }
-  library->tracks = tracks;
-  library->json = j.bytes;
-  library->json_length = j.length;
+  return library;
+}
+
+LmLibrary *lm_library_from_cache(const LmCache *cache, LmIds *ids, int max_tracks) {
+  Builder b;
+  builder_init(&b, max_tracks);
+  for (int i = 0; i < cache->count && b.ok; i++)
+    if (!builder_add(&b, ids, &cache->entries[i])) break;
+  LmLibrary *library = builder_finish(&b);
+  if (library) library->provisional = 1;
   return library;
 }
diff --git a/hosts/3ds/src/localmedia_library.h b/hosts/3ds/src/localmedia_library.h
index 76fd46e9a0646e292d9b8c222358d24716b67ef3..91c9ce61f14fbdf07aac3ea4ee183d8b58f5cd5a 100644
--- a/hosts/3ds/src/localmedia_library.h
+++ b/hosts/3ds/src/localmedia_library.h
@@ -4,7 +4,7 @@
  * duration, assigns ids through the registry, and builds the tracks() JSON
  * once. A track keeps only what open() and artwork() need afterwards.
  *
- * Pure C over stdio and dirent: compiled into the 3DS host and the host tests.
+ * Pure C over stdio: compiled into the 3DS host and the host tests.
  */
 #ifndef POCKETJS_LOCALMEDIA_LIBRARY_H
 #define POCKETJS_LOCALMEDIA_LIBRARY_H
@@ -13,6 +13,7 @@
 #include <stddef.h>
 #include <stdint.h>
 
+#include "localmedia_cache.h"
 #include "localmedia_ids.h"
 
 typedef struct {
@@ -30,11 +31,40 @@ typedef struct {
   int count;
   char *json;           /* JSON LocalTrack[] */
   size_t json_length;
+  /* Built from the scan cache: the confirmed list is still to come. */
+  int provisional;
 } LmLibrary;
 
+/* Bytes of stdio buffer each scanned file gets. */
+#define LM_SCAN_BUFFER 4096
+
+typedef struct {
+  int files;   /* tracks listed */
+  int parsed;  /* files read (the rest came from the cache) */
+} LmScanStats;
+
 /* Scans root (ending in '/'). Returns NULL when out of memory or when stop became
  * non-zero; a missing folder yields an empty library. */
 LmLibrary *lm_library_scan(const char *root, LmIds *ids, int max_tracks, const atomic_int *stop);
+typedef struct {
+  /* Files whose name and size still match are taken from here instead of being read (may be NULL). */
+  const LmCache *previous;
+  /* Receives every listed file (may be NULL). */
+  LmCache *next;
+  LmScanStats *stats;                       /* may be NULL */
+  /* Called by the scanning thread before each file it reads (may be NULL). */
+  void (*between)(void *ctx);
+  void *ctx;
+  /* Runs work(arg) on another thread, returning a handle for join() (may be NULL: one reader). */
+  void *(*start)(void (*work)(void *), void *arg);
+  void (*join)(void *thread);
+} LmScanOptions;
+
+/* As lm_library_scan, with a cache, stats, a hook between files and a second reader. */
+LmLibrary *lm_library_scan_with(const char *root, LmIds *ids, int max_tracks, const atomic_int *stop,
+    const LmScanOptions *options);
+/* The library a cache describes, in its order; marked provisional. NULL when out of memory. */
+LmLibrary *lm_library_from_cache(const LmCache *cache, LmIds *ids, int max_tracks);
 /* An empty library ("[]"); NULL when out of memory. */
 LmLibrary *lm_library_empty(void);
 void lm_library_free(LmLibrary *library);
diff --git a/tests/fixtures/localmedia/alloc-fail.c b/tests/fixtures/localmedia/alloc-fail.c
new file mode 100644
index 0000000000000000000000000000000000000000..5b3a22fecd72a8680b4abeac53c364e8fe157dd8
--- /dev/null
+++ b/tests/fixtures/localmedia/alloc-fail.c
@@ -0,0 +1,23 @@
+/* The allocation hook behind LM_TEST_ALLOC_FAIL (hosts/3ds/src/localmedia_alloc.h). */
+#include <stdatomic.h>
+#include <stdlib.h>
+
+/* Allocations still allowed; negative: no limit. */
+_Atomic int lm_test_allocs_left = -1;
+/* Allocations of at least this many bytes fail; 0: none. */
+_Atomic size_t lm_test_alloc_fail_bytes = 0;
+
+static int allowed(size_t size) {
+  size_t limit = atomic_load(&lm_test_alloc_fail_bytes);
+  if (limit > 0 && size >= limit) return 0;
+  int left = atomic_load(&lm_test_allocs_left);
+  while (left >= 0) {
+    if (left == 0) return 0;
+    if (atomic_compare_exchange_weak(&lm_test_allocs_left, &left, left - 1)) return 1;
+  }
+  return 1;
+}
+
+void *lm_test_malloc(size_t size) { return allowed(size) ? malloc(size) : NULL; }
+void *lm_test_calloc(size_t count, size_t size) { return allowed(count * size) ? calloc(count, size) : NULL; }
+void *lm_test_realloc(void *pointer, size_t size) { return allowed(size) ? realloc(pointer, size) : NULL; }
diff --git a/tests/fixtures/localmedia/cache-test.c b/tests/fixtures/localmedia/cache-test.c
new file mode 100644
index 0000000000000000000000000000000000000000..9c67bf2924e7f7c54faf0bc22cbcd39e7b64d33f
--- /dev/null
+++ b/tests/fixtures/localmedia/cache-test.c
@@ -0,0 +1,139 @@
+#include "../../../hosts/3ds/src/localmedia_cache.h"
+#include "check.h"
+
+#include <stdlib.h>
+
+static LmCacheEntry entry(const char *file, uint64_t size, const char *title, uint32_t duration) {
+  LmCacheEntry e = {0};
+  e.file = (char *)file;
+  e.size = size;
+  e.title = (char *)title;
+  e.artist = (char *)"Artist";
+  e.album = (char *)"";
+  e.track = 3;
+  e.duration_ms = duration;
+  e.has_art = 1;
+  e.art_offset = 1234;
+  e.art_raw_bytes = 5678;
+  e.art_unsync = 1;
+  return e;
+}
+
+static long file_size(const char *path) {
+  FILE *f = fopen(path, "rb");
+  if (!f) return -1;
+  fseek(f, 0, SEEK_END);
+  long n = ftell(f);
+  fclose(f);
+  return n;
+}
+
+int main(void) {
+  const char *path = "cache-test.cache";
+  remove(path);
+
+  /* A missing file is an empty cache. */
+  LmCache cache;
+  CHECK(!lm_cache_read(path, &cache));
+  CHECK_INT(cache.count, 0);
+
+  /* Round trip: every field, UTF-8 text, an empty album. */
+  LmCache out = {0};
+  LmCacheEntry a = entry("a.mp3", 1000, "Caf\xc3\xa9", 61000);
+  LmCacheEntry b = entry("b \"q\".mp3", 2000, "", 0);
+  CHECK(lm_cache_add(&out, &a));
+  CHECK(lm_cache_add(&out, &b));
+  CHECK(lm_cache_write(path, &out));
+  CHECK(file_size("cache-test.cache.tmp") < 0); /* the temp file was renamed */
+  CHECK(lm_cache_read(path, &cache));
+  CHECK_INT(cache.count, 2);
+  CHECK_STR(cache.entries[0].file, "a.mp3");
+  CHECK_STR(cache.entries[0].title, "Caf\xc3\xa9");
+  CHECK_STR(cache.entries[0].artist, "Artist");
+  CHECK_STR(cache.entries[0].album, "");
+  CHECK_INT(cache.entries[0].size, 1000);
+  CHECK_INT(cache.entries[0].track, 3);
+  CHECK_INT(cache.entries[0].duration_ms, 61000);
+  CHECK_INT(cache.entries[0].has_art, 1);
+  CHECK_INT(cache.entries[0].art_offset, 1234);
+  CHECK_INT(cache.entries[0].art_raw_bytes, 5678);
+  CHECK_INT(cache.entries[0].art_unsync, 1);
+  CHECK_INT(cache.entries[1].size, 2000);
+
+  /* Lookups need name and size to match. */
+  CHECK(lm_cache_find(&cache, "a.mp3", 1000) == &cache.entries[0]);
+  CHECK(lm_cache_find(&cache, "a.mp3", 1001) == NULL);
+  CHECK(lm_cache_find(&cache, "A.mp3", 1000) == NULL);
+  lm_cache_free(&cache);
+
+  /* Every damaged form reads as an empty cache, never a partial one. */
+  FILE *f = fopen(path, "rb");
+  long n = file_size(path);
+  uint8_t *bytes = malloc((size_t)n);
+  CHECK(fread(bytes, 1, (size_t)n, f) == (size_t)n);
+  fclose(f);
+  const char *bad = "cache-test.bad";
+  for (long cut = 0; cut < n; cut += 7) { /* truncations */
+    f = fopen(bad, "wb");
+    fwrite(bytes, 1, (size_t)cut, f);
+    fclose(f);
+    CHECK(!lm_cache_read(bad, &cache));
+    CHECK_INT(cache.count, 0);
+  }
+  for (long i = 0; i < n; i += 3) { /* a flipped byte anywhere fails the checksum */
+    bytes[i] ^= 0x41;
+    f = fopen(bad, "wb");
+    fwrite(bytes, 1, (size_t)n, f);
+    fclose(f);
+    CHECK(!lm_cache_read(bad, &cache));
+    bytes[i] ^= 0x41;
+  }
+  /* Trailing bytes after a valid body, with a matching checksum, are still rejected. */
+  {
+    uint8_t *longer = malloc((size_t)n + 4);
+    memcpy(longer, bytes, (size_t)n - 4);
+    memset(longer + n - 4, 0, 4);
+    uint32_t hash = 2166136261u;
+    for (long i = 0; i < n; i++) hash = (hash ^ longer[i]) * 16777619u;
+    longer[n] = hash & 0xff; longer[n + 1] = hash >> 8 & 0xff; longer[n + 2] = hash >> 16 & 0xff; longer[n + 3] = hash >> 24;
+    f = fopen(bad, "wb");
+    fwrite(longer, 1, (size_t)n + 4, f);
+    fclose(f);
+    CHECK(!lm_cache_read(bad, &cache));
+    free(longer);
+  }
+  /* Another version, with a correct checksum, is ignored. */
+  {
+    bytes[4] = 2;
+    uint32_t hash = 2166136261u;
+    for (long i = 0; i < n - 4; i++) hash = (hash ^ bytes[i]) * 16777619u;
+    bytes[n - 4] = hash & 0xff; bytes[n - 3] = hash >> 8 & 0xff; bytes[n - 2] = hash >> 16 & 0xff; bytes[n - 1] = hash >> 24;
+    f = fopen(bad, "wb");
+    fwrite(bytes, 1, (size_t)n, f);
+    fclose(f);
+    CHECK(!lm_cache_read(bad, &cache));
+  }
+  /* Random bytes. */
+  srand(11);
+  for (int round = 0; round < 2000; round++) {
+    f = fopen(bad, "wb");
+    int length = rand() % 300;
+    for (int i = 0; i < length; i++) fputc(i < 4 ? "LMC1"[i] : rand() & 0xff, f);
+    fclose(f);
+    CHECK(!lm_cache_read(bad, &cache));
+  }
+  free(bytes);
+  remove(bad);
+
+  /* Rewriting replaces the old cache. */
+  LmCache one = {0};
+  CHECK(lm_cache_add(&one, &a));
+  CHECK(lm_cache_write(path, &one));
+  CHECK(lm_cache_read(path, &cache));
+  CHECK_INT(cache.count, 1);
+  lm_cache_free(&cache);
+  lm_cache_free(&one);
+  lm_cache_free(&out);
+  remove(path);
+  CHECK_DONE("localmedia cache");
+}
diff --git a/tests/fixtures/localmedia/scan-cache-test.c b/tests/fixtures/localmedia/scan-cache-test.c
new file mode 100644
index 0000000000000000000000000000000000000000..c05dea0d793ebcbd04b215a47e33cdd36b930ed6
--- /dev/null
+++ b/tests/fixtures/localmedia/scan-cache-test.c
@@ -0,0 +1,135 @@
+/* A scan with a cache: unchanged files are reused, changed and new files are read, removed
+ * files drop out, and the list built from the cache matches the scan that wrote it. A second
+ * reader gives the same list. */
+#include "../../../hosts/3ds/src/localmedia_library.h"
+#include "check.h"
+
+#include <pthread.h>
+#include <stdatomic.h>
+#include <stdlib.h>
+#include <sys/stat.h>
+#include <unistd.h>
+
+static void copy(const char *from, const char *to) {
+  FILE *in = fopen(from, "rb"), *out = fopen(to, "wb");
+  char buffer[4096];
+  size_t n;
+  while ((n = fread(buffer, 1, sizeof buffer, in)) > 0) fwrite(buffer, 1, n, out);
+  fclose(in);
+  fclose(out);
+}
+
+/* alloc-fail.c: allocations the scan may still make (negative: no limit). */
+extern _Atomic int lm_test_allocs_left;
+
+static int betweens;
+static void between(void *ctx) { (void)ctx; betweens++; }
+
+typedef struct { pthread_t thread; void (*work)(void *); void *arg; } Helper;
+static int helpers;
+static void *trampoline(void *p) { Helper *h = p; h->work(h->arg); return NULL; }
+static void *start(void (*work)(void *), void *arg) {
+  Helper *h = malloc(sizeof *h);
+  h->work = work;
+  h->arg = arg;
+  pthread_create(&h->thread, NULL, trampoline, h);
+  helpers++;
+  return h;
+}
+static void join(void *thread) { Helper *h = thread; pthread_join(h->thread, NULL); free(h); }
+
+int main(void) {
+  const char *dir = "scan-cache-dir/";
+  mkdir("scan-cache-dir", 0777);
+  copy("cbr-info.mp3", "scan-cache-dir/a.mp3");
+  copy("tagged-v23.mp3", "scan-cache-dir/b.mp3");
+  copy("tagged-v1.mp3", "scan-cache-dir/c.mp3");
+
+  LmIds *ids = lm_ids_create();
+  LmCache first = {0};
+  LmScanStats stats;
+  LmScanOptions options = {NULL, &first, &stats, between, NULL, NULL, NULL};
+  LmLibrary *scanned = lm_library_scan_with(dir, ids, 2048, NULL, &options);
+  CHECK(scanned && scanned->count == 3 && !scanned->provisional);
+  CHECK_INT(stats.files, 3);
+  CHECK_INT(stats.parsed, 3);
+  CHECK_INT(first.count, 3);
+  CHECK_INT(betweens, 3); /* one reader: before each file it reads */
+
+  /* The provisional list from the cache is the same JSON (same ids, same fallbacks). */
+  LmLibrary *cached = lm_library_from_cache(&first, ids, 2048);
+  CHECK(cached && cached->provisional);
+  CHECK_STR(cached->json, scanned->json);
+  lm_library_free(cached);
+  lm_library_free(scanned);
+
+  /* Change b (size), add d, remove c: only b and d are read. */
+  FILE *f = fopen("scan-cache-dir/b.mp3", "ab");
+  fputs("xx", f);
+  fclose(f);
+  copy("mono22.mp3", "scan-cache-dir/d.mp3");
+  remove("scan-cache-dir/c.mp3");
+  LmCache second = {0};
+  options = (LmScanOptions){&first, &second, &stats, NULL, NULL, NULL, NULL};
+  scanned = lm_library_scan_with(dir, ids, 2048, NULL, &options);
+  CHECK(scanned != NULL);
+  CHECK_INT(stats.files, 3);
+  CHECK_INT(stats.parsed, 2);
+  CHECK_INT(second.count, 3);
+  CHECK(strstr(scanned->json, "\"file\":\"c.mp3\"") == NULL);
+  CHECK(strstr(scanned->json, "\"file\":\"d.mp3\"") != NULL);
+  CHECK(strstr(scanned->json, "\"title\":\"Caf\xc3\xa9\"") != NULL); /* b re-read, tags intact */
+
+  /* Without a cache the same folder gives the same JSON. */
+  LmLibrary *plain = lm_library_scan(dir, ids, 2048, NULL);
+  CHECK_STR(plain->json, scanned->json);
+  lm_library_free(plain);
+
+  /* Two readers read every file once and list them in the same order. */
+  LmCache third = {0};
+  options = (LmScanOptions){NULL, &third, &stats, NULL, NULL, start, join};
+  LmLibrary *both = lm_library_scan_with(dir, ids, 2048, NULL, &options);
+  CHECK_INT(helpers, 1);
+  CHECK_INT(stats.parsed, 3);
+  CHECK_STR(both->json, scanned->json);
+  lm_library_free(both);
+  lm_cache_free(&third);
+
+  /* Nothing to read: no helper is started. */
+  options = (LmScanOptions){&second, NULL, &stats, NULL, NULL, start, join};
+  both = lm_library_scan_with(dir, ids, 2048, NULL, &options);
+  CHECK_INT(helpers, 1);
+  CHECK_INT(stats.parsed, 0);
+  CHECK_STR(both->json, scanned->json);
+  lm_library_free(both);
+  /* Whichever allocation fails, a scan (with or without a cache, one reader or two) returns
+   * NULL or the whole list: never part of one. */
+  for (int mode = 0; mode < 2; mode++) {
+    int whole = 0;
+    for (int k = 0; k < 400 && !whole; k++) {
+      LmCache written = {0};
+      LmScanStats counted;
+      options = (LmScanOptions){mode ? &second : NULL, &written, &counted, NULL, NULL, mode ? NULL : start, mode ? NULL : join};
+      atomic_store(&lm_test_allocs_left, k);
+      LmLibrary *partial = lm_library_scan_with(dir, ids, 2048, NULL, &options);
+      atomic_store(&lm_test_allocs_left, -1);
+      if (partial) {
+        CHECK_INT(partial->count, 3);
+        CHECK_STR(partial->json, scanned->json);
+        whole = 1;
+      }
+      lm_library_free(partial);
+      lm_cache_free(&written);
+    }
+    CHECK(whole);
+  }
+  lm_library_free(scanned);
+  lm_cache_free(&first);
+  lm_cache_free(&second);
+  lm_ids_destroy(ids);
+  remove("scan-cache-dir/a.mp3");
+  remove("scan-cache-dir/b.mp3");
+  remove("scan-cache-dir/d.mp3");
+  rmdir("scan-cache-dir");
+  CHECK_DONE("localmedia scan cache");
+}
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index ef1467c17bca5f233c9fddc2ffebce430492a389..509b1992f58c2b53f4c0588f0d0f9e078df99785 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -11,10 +11,10 @@ const scratch = mkdtempSync(join(tmpdir(), "pocket-localmedia-"));
 afterAll(() => rmSync(scratch, { recursive: true, force: true }));
 
 /** Compiles a harness with the given media.local sources under ASan/UBSan and runs it from the fixtures folder. */
-function run(harness: string, sources: string[], args: string[] = []): string {
+function run(harness: string, sources: string[], args: string[] = [], extra: string[] = []): string {
   const binary = join(scratch, harness.replace(/\.c$/, ""));
-  const compile = Bun.spawnSync(["cc", "-std=c11", "-D_DEFAULT_SOURCE", "-O1", "-g", "-Wall", "-Wextra", "-fsanitize=address,undefined", "-fno-sanitize-recover=undefined",
-    `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`, join(FIXTURES, harness), ...sources.map((s) => join(SRC, s)), "-o", binary]);
+  const compile = Bun.spawnSync(["cc", "-std=c11", "-D_DEFAULT_SOURCE", "-O1", "-g", "-pthread", "-Wall", "-Wextra", "-fsanitize=address,undefined", "-fno-sanitize-recover=undefined",
+    `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`, join(FIXTURES, harness), ...sources.map((s) => join(SRC, s)), ...extra, "-o", binary]);
   if (compile.exitCode !== 0) throw new Error(`compile ${harness} failed:\n${compile.stderr.toString()}`);
   const result = Bun.spawnSync([binary, ...args], { cwd: FIXTURES, timeout: 60_000 });
   if (result.exitCode !== 0) throw new Error(`${harness} failed (exit ${result.exitCode}):\n${result.stderr.toString()}${result.stdout.toString()}`);
@@ -38,6 +38,15 @@ describe("media.local native units (host-compiled)", () => {
     expect(run("art-test.c", ["localmedia_art.c", "localmedia_tags.c"])).toContain("localmedia art verified");
   }, 60_000);
 
+  test("cache: round trip, lookups by name and size, damaged files read as empty, atomic rewrite", () => {
+    expect(run("cache-test.c", ["localmedia_cache.c"])).toContain("localmedia cache verified");
+  }, 60_000);
+
+  test("scan: cache reuse, changed/new/removed files, same JSON, two readers, every failed allocation", () => {
+    expect(run("scan-cache-test.c", ["localmedia_library.c", "localmedia_dir.c", "localmedia_cache.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"], [],
+      ["-DLM_TEST_ALLOC_FAIL", join(FIXTURES, "alloc-fail.c")])).toContain("localmedia scan cache verified");
+  }, 60_000);
+
   test("library: lists *.mp3 only, applies fallbacks, keeps ids across rescans, caps the count", () => {
     const folder = (name: string, files: Record<string, string>) => {
       const dir = join(scratch, name);
@@ -57,7 +66,7 @@ describe("media.local native units (host-compiled)", () => {
     const third = folder("scan-3", { "LOUD.MP3": "cbr-info.mp3", "new.mp3": "vbr-xing.mp3" });
     const capped = folder("scan-4", { "a.mp3": "cbr-info.mp3", "b.mp3": "cbr-info.mp3", "c.mp3": "cbr-info.mp3" });
     const missing = join(scratch, "no-such-folder/");
-    const lines = run("library-test.c", ["localmedia_library.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"],
+    const lines = run("library-test.c", ["localmedia_library.c", "localmedia_dir.c", "localmedia_cache.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"],
       ["2048", first, second, third, missing, capped]).trim().split("\n");
     const scans = lines.map((line) => JSON.parse(line) as LocalTrack[]);
     for (const scan of scans) expect(scan.every(validLocalTrack)).toBe(true);
@@ -78,7 +87,7 @@ describe("media.local native units (host-compiled)", () => {
     expect(three["new.mp3"]!.id).toBe(5);
     expect(scans[3]).toEqual([]);
     expect(scans[4]!.map((t) => t.id).sort()).toEqual([6, 7, 8]);
-    const cappedLines = run("library-test.c", ["localmedia_library.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"], ["2", capped]);
+    const cappedLines = run("library-test.c", ["localmedia_library.c", "localmedia_dir.c", "localmedia_cache.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_ids.c"], ["2", capped]);
     expect((JSON.parse(cappedLines.trim()) as LocalTrack[]).length).toBe(2);
   }, 60_000);
 
@@ -93,7 +102,7 @@ describe("media.local native units (host-compiled)", () => {
     writeFileSync(join(music, "junk.mp3"), Buffer.alloc(70_000, 0x11));
     const glue = join(FIXTURES, "glue");
     const binary = join(scratch, "glue-test");
-    const units = ["localmedia.c", "localmedia_ids.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_art.c", "localmedia_library.c", "localmedia_player.c"];
+    const units = ["localmedia.c", "localmedia_cache.c", "localmedia_dir.c", "localmedia_ids.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_art.c", "localmedia_library.c", "localmedia_player.c"];
     const compile = Bun.spawnSync(["cc", "-std=c11", "-D_DEFAULT_SOURCE", "-O1", "-g", "-pthread", "-fsanitize=address,undefined", "-fno-sanitize-recover=undefined",
       `-DLOCALMEDIA_ROOT="${music}/"`, `-I${glue}`, `-I${join(ROOT, "hosts/3ds/include")}`, `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`,
       join(glue, "glue-test.c"), join(glue, "glue-fake.c"), ...units.map((unit) => join(SRC, unit)), "-o", binary]);
```

- [ ] **Step 4: Run them.** `bun test tests/localmedia-native.test.ts` → **9 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git -C runtime add hosts/3ds/src/localmedia_alloc.h hosts/3ds/src/localmedia_cache.c hosts/3ds/src/localmedia_cache.h hosts/3ds/src/localmedia_dir.c hosts/3ds/src/localmedia_dir.h hosts/3ds/src/localmedia_library.c hosts/3ds/src/localmedia_library.h hosts/3ds/Makefile tests/fixtures/localmedia/alloc-fail.c tests/fixtures/localmedia/cache-test.c tests/fixtures/localmedia/scan-cache-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): scan cache, directory listing and a two-reader scan

The scan lists names and sizes from the SD card's directory entries (no
per-file stat, which opens the file), reuses cached tags for files whose name
and size match, and reads the rest on two threads with small reads. The cache
is versioned and checksummed; anything damaged reads as empty. A test hook
fails allocations on demand: every failure yields no library or a whole one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: `scanMs`, cached-then-confirmed lists, a stable status object (contract, SDK, sim)

**Files:**
- Modify: `runtime/contracts/spec/localmedia.ts`, `runtime/framework/src/localmedia.ts`, `runtime/hosts/sim/localmedia.ts`
- Test: `runtime/tests/localmedia.test.ts`, `runtime/tests/localmedia-sim.test.ts`

**Interfaces:**
- Produces: `LocalStatus.scanMs: number` (validated as a non-negative integer); `scanGeneration` may advance twice per scan; `localMedia(ops).status()` returns the same object while `ops.status()` returns the same string; `SimLocalMediaOptions.cached?: readonly SimLocalTrack[]`, and every scan after the first publishes the previous list first.
- Consumed by Task 5 (the native status JSON), Task 8 (`IDLE_STATUS.scanMs`), Task 9 (`status !== state.status`).

- [ ] **Step 1: Write the failing tests.** `git -C runtime apply --include='tests/*' $TMPDIR/t4.patch`.
- [ ] **Step 2: Watch them fail.** `cd runtime && bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts` → **14 pass, 4 fail**: the validator accepts a status without `scanMs`; `status()` returns a new object for an unchanged reply; the sim's second scan completes one generation, not two; there is no cached list.
- [ ] **Step 3: Implement.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t4.patch`:

```diff
diff --git a/contracts/spec/localmedia.ts b/contracts/spec/localmedia.ts
index cbac812b294f4315818e64363490600521919a30..8b6d28f7809913393e67b6154d3590e2027e17bf 100644
--- a/contracts/spec/localmedia.ts
+++ b/contracts/spec/localmedia.ts
@@ -62,8 +62,11 @@ export interface LocalStatus {
   durationMs: number;
   /** A scan is running; independent of the playback phase. */
   scanning: boolean;
-  /** Completed scans; 0 before the first finishes. A change means tracks() has a new list. */
+  /** Completed lists; 0 before the first. A change means tracks() has a new list. A scan may complete
+   * more than one: the list from the scan cache first (while `scanning` stays true), then the confirmed one. */
   scanGeneration: number;
+  /** Milliseconds the last completed scan took to walk the folder; 0 before the first. */
+  scanMs: number;
   underruns: number;
   error: string;
   /** Percent of real time the audio thread spent decoding over the last second (0..100). */
@@ -105,7 +108,7 @@ export function validLocalTrack(value: unknown): value is LocalTrack {
 export function validLocalStatus(value: unknown): value is LocalStatus {
   return isObject(value) && typeof value.phase === "string" && PHASES.has(value.phase)
     && isInt(value.trackId, -1) && isInt(value.openSerial) && isInt(value.positionMs) && isInt(value.durationMs)
-    && typeof value.scanning === "boolean" && isInt(value.scanGeneration)
+    && typeof value.scanning === "boolean" && isInt(value.scanGeneration) && isInt(value.scanMs)
     && isInt(value.underruns) && typeof value.error === "string"
     && isInt(value.decodeLoad) && isInt(value.artHandles);
 }
diff --git a/framework/src/localmedia.ts b/framework/src/localmedia.ts
index e104ea94b25712604d89d37326cb7d9957cdacca..8f6172c5ae80b65ee5037279fc91e669f7a9bd33 100644
--- a/framework/src/localmedia.ts
+++ b/framework/src/localmedia.ts
@@ -33,6 +33,9 @@ function trackId(value: number): number {
 /** The host's local media module (capability media.local). */
 export function localMedia(ops = (globalThis as unknown as { localmedia?: LocalMediaOps }).localmedia): LocalMedia {
   if (!ops) throw new Error("Host does not implement media.local");
+  // status() is read every frame: an unchanged reply returns the previous object, unparsed.
+  let lastRaw = "";
+  let lastStatus: LocalStatus | null = null;
   return {
     scan: () => ops.scan(),
     tracks() {
@@ -45,8 +48,12 @@ export function localMedia(ops = (globalThis as unknown as { localmedia?: LocalM
     seek: (ms) => ops.seek(Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0),
     volume: (value) => ops.volume(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0),
     status() {
-      const status = JSON.parse(ops.status()) as unknown;
+      const raw = ops.status();
+      if (raw === lastRaw && lastStatus) return lastStatus;
+      const status = JSON.parse(raw) as unknown;
       if (!validLocalStatus(status)) throw new Error("Host returned a malformed status");
+      lastRaw = raw;
+      lastStatus = status;
       return status;
     },
     artwork(id) {
diff --git a/hosts/sim/localmedia.ts b/hosts/sim/localmedia.ts
index a8d16de15e766d6e07e4629f472c44adef95ae97..0a8cd0f2714bffb4fecba75480ddc9b8009d534f 100644
--- a/hosts/sim/localmedia.ts
+++ b/hosts/sim/localmedia.ts
@@ -29,6 +29,9 @@ export interface SimLocalMediaOptions {
   /** Virtual time an artwork decode takes; the handle is ready on the first advance() at least
    * this long after the request. 0 (default): ready at the next advance(). */
   artworkMs?: number;
+  /** A scan cache left by an earlier session: the first scan publishes it before the folder's list.
+   * Later scans publish the previous scan's list first, as the native host does. */
+  cached?: readonly SimLocalTrack[];
 }
 
 export interface SimLocalMediaHost {
@@ -69,12 +72,14 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
   let serial = 0;
   const status: LocalStatus = {
     phase: "idle", trackId: -1, openSerial: 0, positionMs: 0, durationMs: 0,
-    scanning: false, scanGeneration: 0, underruns: 0, error: "", decodeLoad: 0, artHandles: 0,
+    scanning: false, scanGeneration: 0, scanMs: 0, underruns: 0, error: "", decodeLoad: 0, artHandles: 0,
   };
+  /** What the scan cache holds: published first by the next scan. */
+  let cache: readonly SimLocalTrack[] | null = options.cached ?? null;
 
-  const finishScan = () => {
+  const publish = (list: readonly SimLocalTrack[]) => {
     entryOf.clear();
-    tracks = library.slice(0, LOCALMEDIA.maxTracks).map((entry) => {
+    tracks = list.slice(0, LOCALMEDIA.maxTracks).map((entry) => {
       let id = idByFile.get(entry.file);
       if (id === undefined) {
         id = nextId++;
@@ -92,9 +97,14 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
       hasArt: entry.art === true,
       };
     });
+    status.scanGeneration++;
+  };
+  const finishScan = () => {
+    publish(library);
+    cache = library;
     scanLeft = -1;
     status.scanning = false;
-    status.scanGeneration++;
+    status.scanMs = Math.max(0, options.scanMs ?? 0);
   };
   const setPosition = (ms: number) => {
     position = ms;
@@ -106,6 +116,7 @@ export function createSimLocalMedia(initial: readonly SimLocalTrack[], options:
       log.push("scan()");
       if (status.scanning) return false;
       status.scanning = true;
+      if (cache) publish(cache);
       const scanMs = options.scanMs ?? 0;
       if (scanMs <= 0) finishScan();
       else scanLeft = scanMs;
diff --git a/tests/localmedia-sim.test.ts b/tests/localmedia-sim.test.ts
index d94d0df745fd948ac531e2ec455f0298927f7ed5..b29f342e31081534f36322f4d80ad1318ddbb950 100644
--- a/tests/localmedia-sim.test.ts
+++ b/tests/localmedia-sim.test.ts
@@ -138,7 +138,7 @@ test("ids stay with their files across a rescan; new files get fresh ids; a vani
   expect(media.tracks().map((t) => [t.id, t.file])).toEqual([[0, "01 Intro.mp3"], [1, "untagged.mp3"], [2, "broken.mp3"]]);
   host.setLibrary([{ file: "00 New.mp3", durationMs: 500 }, LIB[1]!, LIB[0]!]);
   media.scan();
-  expect(media.status().scanGeneration).toBe(2);
+  expect(media.status().scanGeneration).toBe(3); // the previous list (cache), then the folder's
   expect(media.tracks().map((t) => [t.id, t.file])).toEqual([[3, "00 New.mp3"], [1, "untagged.mp3"], [0, "01 Intro.mp3"]]);
   expect(media.open(2)).toBe(0);
   expect(media.open(3)).toBeGreaterThan(0);
@@ -147,3 +147,15 @@ test("ids stay with their files across a rescan; new files get fresh ids; a vani
   host.advance(1);
   expect(media.artwork(0)).toBeGreaterThan(0);
 });
+
+test("a scan publishes the cached list first, keeps scanning, then publishes the folder's list", () => {
+  const host = createSimLocalMedia([LIB[0]!, LIB[1]!], { scanMs: 500, cached: [LIB[1]!] });
+  const media = localMedia(host.ns);
+  media.scan();
+  expect(media.status()).toMatchObject({ scanning: true, scanGeneration: 1, scanMs: 0 });
+  expect(media.tracks().map((t) => t.file)).toEqual(["untagged.mp3"]);
+  host.advance(500);
+  expect(media.status()).toMatchObject({ scanning: false, scanGeneration: 2, scanMs: 500 });
+  expect(media.tracks().map((t) => t.file)).toEqual(["01 Intro.mp3", "untagged.mp3"]);
+  expect(media.tracks().find((t) => t.file === "untagged.mp3")!.id).toBe(0); // ids follow files across both lists
+});
diff --git a/tests/localmedia.test.ts b/tests/localmedia.test.ts
index 862110405ebbe19a8851e6b8722dbe2291d7bf31..18dbed1da65edc8c17b20159a7603ae532f21396 100644
--- a/tests/localmedia.test.ts
+++ b/tests/localmedia.test.ts
@@ -4,7 +4,7 @@ import { POCKET_CAPABILITIES } from "../contracts/spec/platforms.ts";
 import { localMedia } from "../framework/src/localmedia.ts";
 import { resolve3dsBuildPlan } from "../tools/3ds-profile.ts";
 
-const STATUS: LocalStatus = { phase: "playing", trackId: 1, openSerial: 4, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, underruns: 0, error: "", decodeLoad: 12, artHandles: 1 };
+const STATUS: LocalStatus = { phase: "playing", trackId: 1, openSerial: 4, positionMs: 10, durationMs: 100, scanning: false, scanGeneration: 1, scanMs: 900, underruns: 0, error: "", decodeLoad: 12, artHandles: 1 };
 
 function recorder(over: Partial<LocalMediaOps> = {}) {
   const calls: string[] = [];
@@ -70,6 +70,8 @@ test("status and tracks are parsed and validated", () => {
   expect(validLocalStatus({ ...STATUS, openSerial: -1 })).toBe(false);
   expect(validLocalStatus({ ...STATUS, decodeLoad: undefined })).toBe(false);
   expect(validLocalStatus({ ...STATUS, artHandles: -1 })).toBe(false);
+  expect(validLocalStatus({ ...STATUS, scanMs: undefined })).toBe(false);
+  expect(validLocalStatus({ ...STATUS, scanMs: -1 })).toBe(false);
   expect(LOCALMEDIA).toEqual({ version: 2, root: "sdmc:/music/", maxTracks: 2048, artMax: 128 });
 });
 
@@ -84,6 +86,20 @@ const probeManifest = (requires: string[]) => ({
   },
 });
 
+test("status() returns the same object while the host's reply is unchanged", () => {
+  let reply = JSON.stringify(STATUS);
+  const media = localMedia(recorder({ status: () => reply }).ops);
+  const first = media.status();
+  expect(media.status()).toBe(first);
+  reply = JSON.stringify({ ...STATUS, positionMs: 20 });
+  const second = media.status();
+  expect(second).not.toBe(first);
+  expect(second.positionMs).toBe(20);
+  expect(media.status()).toBe(second);
+  reply = "{"; // a bad reply is never served from the last good one
+  expect(() => media.status()).toThrow();
+});
+
 test("the 3DS profile ships media.local", () => {
   expect(POCKET_CAPABILITIES).toContain("media.local");
   expect(resolve3dsBuildPlan(probeManifest(["media.local"])).features["media.local"]).toBe(true);
```

- [ ] **Step 4: Run them.** → **18 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git -C runtime add contracts/spec/localmedia.ts framework/src/localmedia.ts hosts/sim/localmedia.ts tests/localmedia.test.ts tests/localmedia-sim.test.ts
git -C runtime commit -m "feat(localmedia): scanMs, cached-then-confirmed lists, a stable status object

LocalStatus gains scanMs, and a scan may complete two generations: the list
from the scan cache, then the confirmed one. The SDK returns the previous
status object while the host's reply is unchanged. The sim publishes its
cache (options.cached, then each scan's list) before the folder's list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: The glue shows the cached list at once and confirms it in the background (minors 4.3, 4.6)

`scan()` on the library thread:
1. reads the cache and publishes the list built from it (provisional: `scanning` stays true);
2. walks the folder with `lm_library_scan_with`, two readers, `serve_art` between files (4.3);
3. publishes the confirmed list, writes the cache (making its folder and parent) and records `scanMs`, `files`, `parsed`;
4. on out of memory or a stop, keeps the current list and clears `scanning` (4.6; the base code published an empty list).

Status gains `scanMs`; `localmedia_stats_json` feeds `stats.json`.

**Files:**
- Modify: `runtime/hosts/3ds/src/localmedia.c`, `localmedia.h`, `main.c`, `runtime/hosts/3ds/README.md`
- Test: `runtime/tests/fixtures/localmedia/glue/glue-test.c`, `runtime/tests/localmedia-native.test.ts`

**Interfaces:**
- Consumes: Task 3's `lm_cache_*`, `lm_library_from_cache`, `lm_library_scan_with`, `LmScanOptions`; Task 4's `scanMs`.
- Produces: `void localmedia_stats_json(char *out, size_t capacity)` → `{"cachedMs":<int, -1 without a cache>,"scanMs":<u>,"files":<u>,"parsed":<u>}`; `stats.json` gains `"localmedia"` under `POCKETJS_LOCALMEDIA`. `LOCALMEDIA_CACHE_DIR` defaults to `"sdmc:/pocketjs/localmedia"`.

- [ ] **Step 1: Write the failing tests.** `git -C runtime apply --include='tests/*' $TMPDIR/t5.patch`. The glue test gains 300 pad files, a cover asked for during a full rescan, a rescan whose big allocations fail, and a stop in the middle of a full rescan.
- [ ] **Step 2: Watch them fail.** `cd runtime && bun test tests/localmedia-native.test.ts` → **8 pass, 1 fail** (glue): `CHECK(scanning_then) failed` (the cover waited for the whole scan), `scanGeneration == 3, expected 2` and `localmedia_tracks(&length) == "[]"` (the base code published an empty list).
- [ ] **Step 3: Implement.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t5.patch`:

```diff
diff --git a/hosts/3ds/README.md b/hosts/3ds/README.md
index 092f04f3f48b1b35ff48580acdca97c70c3ce573..2929ca62886f266f3992f201c100348533aa3271 100644
--- a/hosts/3ds/README.md
+++ b/hosts/3ds/README.md
@@ -484,8 +484,10 @@ Emitted under `sdmc:/pocketjs-captures/`: `fNNNN.raw` named by the
 process-global frame counter (exactly `400*240*4` bytes), then `stats.json`, then
 `done` written only after the last frame is closed, and `error.txt` on the
 failure path so the driver reports the message instead of a timeout.
-`stats.json` is `{"host": <devStats>, "trace": [[js, tick, draw], …]}`: the
-`devStats` JSON and the last 240 frames' phase times in µs.
+`stats.json` is `{"host": <devStats>, "trace": [[js, tick, draw], …],
+"localmedia": {"cachedMs", "scanMs", "files", "parsed"}}`: the `devStats` JSON,
+the last 240 frames' phase times in µs, and (with media.local) the last scan's
+cached-list and walk times and its track and read-file counts.
 
 The readback is **not** `gfxGetFramebuffer` after `C3D_FrameEnd` — that buffer
 has already been swapped and reads back black. It is an explicit
diff --git a/hosts/3ds/src/localmedia.c b/hosts/3ds/src/localmedia.c
index 1f9b396acba601d5da9461fad8e4c04158378c36..4e29b2bae9cd0ea0538f223bddf6789f7796cfc8 100644
--- a/hosts/3ds/src/localmedia.c
+++ b/hosts/3ds/src/localmedia.c
@@ -6,6 +6,7 @@
  * Commands and results cross threads through atomics only (as media.c). */
 #include "localmedia.h"
 #include "localmedia_art.h"
+#include "localmedia_cache.h"
 #include "localmedia_ids.h"
 #include "localmedia_library.h"
 #include "localmedia_player.h"
@@ -16,11 +17,17 @@
 #include <stdio.h>
 #include <stdlib.h>
 #include <string.h>
+#include <sys/stat.h>
 
 #ifndef LOCALMEDIA_ROOT
 #define LOCALMEDIA_ROOT "sdmc:/music/"
 #endif
 #define ROOT LOCALMEDIA_ROOT
+/* The scan cache (localmedia_cache.h) and its folder. */
+#ifndef LOCALMEDIA_CACHE_DIR
+#define LOCALMEDIA_CACHE_DIR "sdmc:/pocketjs/localmedia"
+#endif
+#define CACHE_PATH LOCALMEDIA_CACHE_DIR "/library.cache"
 #define MAX_TRACKS 2048
 #define CHANNEL 0
 #define PREFILL_SLOTS 4
@@ -94,6 +101,9 @@ static _Atomic int scan_stop;
 static LmLibrary *_Atomic pending_library;
 static _Atomic unsigned art_done_generation; /* request generation the result belongs to */
 static _Atomic bool art_done_ok;
+/* The last completed scan: walk time, tracks, files read; cached-list time (-1 without a cache). */
+static _Atomic unsigned scan_ms, scan_files, scan_parsed;
+static _Atomic int cached_ms = -1;
 static uint8_t *art_pixels;               /* written by the worker before art_done_generation */
 
 /* ---- UI-thread state ----------------------------------------------------------- */
@@ -265,33 +275,99 @@ static void audio_main(void *unused) {
 }
 
 /* ---- library worker ------------------------------------------------------------ */
+/* Decodes the newest art request, if it is new. Runs between scanned files too, so a cover
+ * never waits for a whole scan. */
+static void serve_art(void *context) {
+  unsigned *handled = context;
+  Mail request;
+  mail_read(&art_mail, &request);
+  if (request.generation == 0 || request.generation == *handled) return;
+  *handled = request.generation;
+  bool ok = false;
+  FILE *file = fopen(request.path, "rb");
+  if (file) {
+    uint8_t *data;
+    size_t length = lm_art_read(file, request.offset, request.raw_bytes, request.unsync, &data);
+    fclose(file);
+    ok = length > 0 && lm_art_decode(data, length, art_pixels);
+    free(data);
+  }
+  atomic_store(&art_done_ok, ok);
+  atomic_store_explicit(&art_done_generation, request.generation, memory_order_release);
+}
+
+static unsigned ms_since(uint64_t started) {
+  return (unsigned)((svcGetSystemTick() - started) * 1000 / SYSCLOCK_ARM11);
+}
+
+/* Publishes a library for the UI thread to adopt; a newer one replaces one not yet adopted. */
+static void publish_library(LmLibrary *scanned) {
+  lm_library_free(atomic_exchange(&pending_library, scanned));
+}
+
+/* A second file reader for a scan, at the library thread's priority. */
+static void *start_reader(void (*work)(void *), void *arg) {
+  s32 priority = 0x3f;
+  svcGetThreadPriority(&priority, CUR_THREAD_HANDLE);
+  return threadCreate(work, arg, 32 * 1024, priority, -2, false);
+}
+
+static void join_reader(void *thread) {
+  threadJoin(thread, U64_MAX);
+  threadFree(thread);
+}
+
+/* Makes the cache's folder and its parent; mkdir() of one that exists fails harmlessly. */
+static void make_cache_dir(void) {
+  char parent[] = LOCALMEDIA_CACHE_DIR;
+  char *slash = strrchr(parent, '/');
+  if (slash) {
+    *slash = '\0';
+    mkdir(parent, 0777);
+  }
+  mkdir(LOCALMEDIA_CACHE_DIR, 0777);
+}
+
+/* A scan: the cached list first (when there is a cache), then the confirmed one. */
+static void scan(unsigned *handled_art) {
+  uint64_t started = svcGetSystemTick();
+  LmCache previous;
+  bool have_cache = lm_cache_read(CACHE_PATH, &previous);
+  atomic_store(&cached_ms, -1);
+  if (have_cache) {
+    LmLibrary *cached = lm_library_from_cache(&previous, ids, MAX_TRACKS);
+    if (cached) {
+      publish_library(cached);
+      atomic_store(&cached_ms, (int)ms_since(started));
+    }
+  }
+  uint64_t walk = svcGetSystemTick();
+  LmCache next = {0};
+  LmScanStats stats;
+  LmScanOptions options = {have_cache ? &previous : NULL, &next, &stats, serve_art, handled_art, start_reader, join_reader};
+  LmLibrary *scanned = lm_library_scan_with(ROOT, ids, MAX_TRACKS, &scan_stop, &options);
+  if (scanned) {
+    atomic_store(&scan_ms, ms_since(walk));
+    atomic_store(&scan_files, (unsigned)stats.files);
+    atomic_store(&scan_parsed, (unsigned)stats.parsed);
+    publish_library(scanned);
+    make_cache_dir();
+    lm_cache_write(CACHE_PATH, &next);
+  } else {
+    /* Out of memory or stopped: the current list stays. */
+    atomic_store(&scanning, false);
+  }
+  lm_cache_free(&next);
+  if (have_cache) lm_cache_free(&previous);
+}
+
 static void library_main(void *unused) {
   (void)unused;
   unsigned handled_art = 0;
   while (atomic_load(&running)) {
     LightEvent_WaitTimeout(&library_wake, 50000000LL);
-    if (atomic_exchange(&scan_requested, false)) {
-      LmLibrary *scanned = lm_library_scan(ROOT, ids, MAX_TRACKS, &scan_stop);
-      if (!scanned && !atomic_load(&scan_stop)) scanned = lm_library_empty();
-      LmLibrary *old = atomic_exchange(&pending_library, scanned);
-      lm_library_free(old);
-      if (!scanned) atomic_store(&scanning, false);
-    }
-    Mail request;
-    mail_read(&art_mail, &request);
-    if (request.generation == 0 || request.generation == handled_art) continue;
-    handled_art = request.generation;
-    bool ok = false;
-    FILE *file = fopen(request.path, "rb");
-    if (file) {
-      uint8_t *data;
-      size_t length = lm_art_read(file, request.offset, request.raw_bytes, request.unsync, &data);
-      fclose(file);
-      ok = length > 0 && lm_art_decode(data, length, art_pixels);
-      free(data);
-    }
-    atomic_store(&art_done_ok, ok);
-    atomic_store_explicit(&art_done_generation, request.generation, memory_order_release);
+    if (atomic_exchange(&scan_requested, false)) scan(&handled_art);
+    serve_art(&handled_art);
   }
 }
 
@@ -302,7 +378,8 @@ static void adopt_scan(void) {
   lm_library_free(library);
   library = scanned;
   scan_generation++;
-  atomic_store(&scanning, false);
+  /* A list from the cache is shown while the folder is checked; scanning ends with the next. */
+  if (!scanned->provisional) atomic_store(&scanning, false);
 }
 
 /* Posts an open (path, "" to stop) or a seek as the newest playback command. */
@@ -465,9 +542,9 @@ void localmedia_status(char *out, size_t capacity) {
   if (command_track < 0) position = duration = error = 0;
   snprintf(out, capacity,
     "{\"phase\":\"%s\",\"trackId\":%ld,\"openSerial\":%u,\"positionMs\":%u,\"durationMs\":%u,\"scanning\":%s,"
-    "\"scanGeneration\":%u,\"underruns\":%u,\"error\":\"%s\",\"decodeLoad\":%u,\"artHandles\":%d}",
+    "\"scanGeneration\":%u,\"scanMs\":%u,\"underruns\":%u,\"error\":\"%s\",\"decodeLoad\":%u,\"artHandles\":%d}",
     PHASES[phase], (long)command_track, open_serial, position, duration, atomic_load(&scanning) ? "true" : "false",
-    scan_generation, atomic_load(&underruns), phase == FAILED ? ERRORS[error] : "", atomic_load(&decode_load),
+    scan_generation, atomic_load(&scan_ms), atomic_load(&underruns), phase == FAILED ? ERRORS[error] : "", atomic_load(&decode_load),
     art_handle_count);
 }
 
@@ -516,3 +593,8 @@ void localmedia_release_artwork(int32_t handle) {
     return;
   }
 }
+
+void localmedia_stats_json(char *out, size_t capacity) {
+  snprintf(out, capacity, "{\"cachedMs\":%d,\"scanMs\":%u,\"files\":%u,\"parsed\":%u}",
+    atomic_load(&cached_ms), atomic_load(&scan_ms), atomic_load(&scan_files), atomic_load(&scan_parsed));
+}
diff --git a/hosts/3ds/src/localmedia.h b/hosts/3ds/src/localmedia.h
index ef746c939c9a3fd876050cc23cf260f0ff58af37..2180a93448ad3a2d40f323d59d1ed876b323dfa9 100644
--- a/hosts/3ds/src/localmedia.h
+++ b/hosts/3ds/src/localmedia.h
@@ -20,4 +20,6 @@ void localmedia_volume(double volume);
 void localmedia_status(char *out, size_t capacity);
 int32_t localmedia_artwork(int32_t id);
 void localmedia_release_artwork(int32_t handle);
+/* {"cachedMs":…,"scanMs":…,"files":…,"parsed":…} for the last completed scan. */
+void localmedia_stats_json(char *out, size_t capacity);
 #endif
diff --git a/hosts/3ds/src/main.c b/hosts/3ds/src/main.c
index 2ba05d704d3f906a24e1a9c82b2b00fd88461559..7d454c949b9942f97205de264ad38d6b2cff6934 100644
--- a/hosts/3ds/src/main.c
+++ b/hosts/3ds/src/main.c
@@ -338,8 +338,8 @@ static void trace_frame(uint32_t js_us, uint32_t tick_us, uint32_t draw_us) {
 
 /* The sentinel the driver waits for. Written only after every requested frame
  * has been written AND closed, so a partial file can never be compared. First,
- * stats.json: frame timing (the host's last 60-frame window and the trace),
- * which scripts measure a run by. */
+ * stats.json: frame timing (the host's last 60-frame window and the trace) and,
+ * with media.local, the last scan's timings, which scripts measure a run by. */
 static void capture_done(void) {
   FILE *stats = fopen(CAPTURE_DIR "/stats.json", "wb");
   if (stats != NULL) {
@@ -350,6 +350,11 @@ static void capture_done(void) {
       fprintf(stats, "%s[%lu,%lu,%lu]", i ? "," : "", (unsigned long)slot[0], (unsigned long)slot[1], (unsigned long)slot[2]);
     }
     fputs("]", stats);
+#ifdef POCKETJS_LOCALMEDIA
+    char localmedia[256];
+    localmedia_stats_json(localmedia, sizeof localmedia);
+    fprintf(stats, ",\"localmedia\":%s", localmedia);
+#endif
     fputs("}\n", stats);
     fclose(stats);
   }
diff --git a/tests/fixtures/localmedia/glue/glue-test.c b/tests/fixtures/localmedia/glue/glue-test.c
index 9bc77b455fa89e591dfa9091009a553150a5c3b2..f8138e429447d65b535933ad419f5f0bcb5d89e4 100644
--- a/tests/fixtures/localmedia/glue/glue-test.c
+++ b/tests/fixtures/localmedia/glue/glue-test.c
@@ -1,14 +1,18 @@
 /* The media.local glue (hosts/3ds/src/localmedia.c) on the host: real threads,
  * mail slots and status, the fake NDSP and core textures of glue-fake.c, and a
  * music folder (LOCALMEDIA_ROOT) holding a.mp3 (cbr-info), b.mp3 (cbr-plain),
- * art.mp3 (tagged-v23) and junk.mp3 (no frames). */
+ * art.mp3 (tagged-v23), junk.mp3 (no frames) and 300 pad-NNN.mp3 copies of cbr-plain. */
 #include "localmedia.h"
 #include "glue-fake.h"
 #include "../check.h"
 
+#include <stdatomic.h>
 #include <stdlib.h>
 #include <time.h>
 
+/* alloc-fail.c: the scan's allocations of at least this many bytes fail (0: none). */
+extern _Atomic size_t lm_test_alloc_fail_bytes;
+
 static char status[512];
 static const char *read_status(void) { localmedia_status(status, sizeof status); return status; }
 static long field(const char *json, const char *name) {
@@ -98,6 +102,42 @@ int main(void) {
   localmedia_release_artwork(handle);
   CHECK_INT(field(read_status(), "artHandles"), 0);
 
+  /* Art is served between scanned files: a cover asked for during a full rescan arrives before
+   * the rescan ends. */
+  remove(LOCALMEDIA_CACHE_DIR "/library.cache");
+  long generation = field(read_status(), "scanGeneration");
+  CHECK(localmedia_scan());
+  int32_t during = localmedia_artwork(art);
+  bool scanning_then = false;
+  for (int i = 0; i < 3000 && during < 0; i++) {
+    sleep_ms(1);
+    during = localmedia_artwork(art);
+    if (during > 0) scanning_then = strstr(read_status(), "\"scanning\":true") != NULL;
+  }
+  CHECK(during > 0);
+  CHECK(scanning_then);
+  localmedia_release_artwork(during);
+  WAIT_UNTIL(field(read_status(), "scanGeneration") > generation, 5000);
+  CHECK(field(status, "scanGeneration") > generation);
+
+  /* Out of memory during a rescan (its big allocations fail, small ones still succeed): the
+   * list stays, not an empty one, and scanning ends. */
+  size_t length;
+  char *before = strdup(localmedia_tracks(&length));
+  generation = field(read_status(), "scanGeneration");
+  atomic_store(&lm_test_alloc_fail_bytes, 64);
+  CHECK(localmedia_scan());
+  WAIT_UNTIL(strstr(read_status(), "\"scanning\":false") != NULL, 3000);
+  atomic_store(&lm_test_alloc_fail_bytes, 0);
+  CHECK(strstr(status, "\"scanning\":false") != NULL);
+  CHECK_INT(field(status, "scanGeneration"), generation);
+  CHECK_STR(localmedia_tracks(&length), before);
+  free(before);
+
+  /* Stopping in the middle of a full rescan joins both readers and frees everything. */
+  remove(LOCALMEDIA_CACHE_DIR "/library.cache");
+  CHECK(localmedia_scan());
+  sleep_ms(5);
   localmedia_stop();
   CHECK_INT(fake_live_textures(), 0);
   CHECK_DONE("localmedia glue");
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index 509b1992f58c2b53f4c0588f0d0f9e078df99785..66b116efaf80304d54dfffa6941a8462cf7623d4 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -95,17 +95,18 @@ describe("media.local native units (host-compiled)", () => {
     expect(run("player-test.c", ["localmedia_player.c", "localmedia_mp3.c", "localmedia_tags.c"])).toContain("localmedia player verified");
   }, 60_000);
 
-  test("glue: snapshots, a failed open behind a seek, end-of-track waiting, session underruns, art hand-off", () => {
+  test("glue: snapshots, a failed open behind a seek, end-of-track waiting, session underruns, art hand-off, art during scans, out of memory", () => {
     const music = join(scratch, "glue-music");
     mkdirSync(music, { recursive: true });
     for (const [file, from] of [["a.mp3", "cbr-info.mp3"], ["b.mp3", "cbr-plain.mp3"], ["art.mp3", "tagged-v23.mp3"]]) copyFileSync(join(FIXTURES, from!), join(music, file!));
+    for (let i = 0; i < 300; i++) copyFileSync(join(FIXTURES, "cbr-plain.mp3"), join(music, `pad-${String(i).padStart(3, "0")}.mp3`));
     writeFileSync(join(music, "junk.mp3"), Buffer.alloc(70_000, 0x11));
     const glue = join(FIXTURES, "glue");
     const binary = join(scratch, "glue-test");
     const units = ["localmedia.c", "localmedia_cache.c", "localmedia_dir.c", "localmedia_ids.c", "localmedia_tags.c", "localmedia_mp3.c", "localmedia_art.c", "localmedia_library.c", "localmedia_player.c"];
     const compile = Bun.spawnSync(["cc", "-std=c11", "-D_DEFAULT_SOURCE", "-O1", "-g", "-pthread", "-fsanitize=address,undefined", "-fno-sanitize-recover=undefined",
-      `-DLOCALMEDIA_ROOT="${music}/"`, `-I${glue}`, `-I${join(ROOT, "hosts/3ds/include")}`, `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`,
-      join(glue, "glue-test.c"), join(glue, "glue-fake.c"), ...units.map((unit) => join(SRC, unit)), "-o", binary]);
+      "-DLM_TEST_ALLOC_FAIL", `-DLOCALMEDIA_ROOT="${music}/"`, `-DLOCALMEDIA_CACHE_DIR="${join(scratch, "glue-cache")}"`, `-I${glue}`, `-I${join(ROOT, "hosts/3ds/include")}`, `-I${SRC}`, `-I${join(ROOT, "hosts/3ds/vendor")}`,
+      join(glue, "glue-test.c"), join(glue, "glue-fake.c"), join(FIXTURES, "alloc-fail.c"), ...units.map((unit) => join(SRC, unit)), "-o", binary]);
     if (compile.exitCode !== 0) throw new Error(`compile glue-test.c failed:\n${compile.stderr.toString()}`);
     const result = Bun.spawnSync([binary], { cwd: FIXTURES, timeout: 60_000 });
     if (result.exitCode !== 0) throw new Error(`glue-test failed (exit ${result.exitCode}):\n${result.stderr.toString()}${result.stdout.toString()}`);
```

- [ ] **Step 4: Run them.** → **9 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git -C runtime add hosts/3ds/README.md hosts/3ds/src/localmedia.c hosts/3ds/src/localmedia.h hosts/3ds/src/main.c tests/fixtures/localmedia/glue/glue-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "feat(localmedia): show the cached list at once, confirm it in the background

A scan publishes the list from the scan cache first (scanning stays true),
then walks the folder with two readers, serving art requests between files,
publishes the confirmed list and rewrites the cache. Running out of memory
keeps the current list. Status gains scanMs; capture runs add the scan's
timings to stats.json.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Slots queued before the DSP starts do not count as heard (minor 4.1)

**Files:**
- Modify: `runtime/hosts/3ds/src/localmedia_player.c`
- Test: `runtime/tests/fixtures/localmedia/player-test.c` (a `stalled` fake-sink mode: queued slots wait without playing)

**Interfaces:** `lm_player_position` keeps its signature.

- [ ] **Step 1: Write the failing test.** `git -C runtime apply --include='tests/*' $TMPDIR/t6.patch`.
- [ ] **Step 2: Watch it fail.** `cd runtime && bun test tests/localmedia-native.test.ts -t player` → **0 pass, 1 fail**: `lm_player_position(&player) == 417, expected 0` (three checks: four queued slots counted as heard).
- [ ] **Step 3: Implement.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t6.patch`:

```diff
diff --git a/hosts/3ds/src/localmedia_player.c b/hosts/3ds/src/localmedia_player.c
index eceeba11dcb222ef47ff3f4ca8d583d41dfc784a..1baf54c44de2c85e5c6588b4383b29278f63a0ad 100644
--- a/hosts/3ds/src/localmedia_player.c
+++ b/hosts/3ds/src/localmedia_player.c
@@ -196,8 +196,9 @@ uint32_t lm_player_position(LmPlayer *p) {
   if (slot >= 0) {
     uint32_t ms = frames_ms(p, p->slot_start[slot] + played);
     if (ms > p->position_ms) p->position_ms = ms;
-  } else if (p->queued_once) {
-    /* Nothing is playing: everything decoded so far has been heard. */
+  } else if (p->queued_once && lm_player_queued(p) == 0) {
+    /* Nothing is playing or waiting: everything decoded so far has been heard. (Slots
+     * queued before the DSP starts the first have not been.) */
     uint32_t ms = decoded_ms(p);
     if (ms > p->position_ms) p->position_ms = ms;
   }
diff --git a/tests/fixtures/localmedia/player-test.c b/tests/fixtures/localmedia/player-test.c
index 4f2387982c17a3bac36ed5d9320ff1a58534e7b0..fefed06929525a91737d967c18aa73307321f766 100644
--- a/tests/fixtures/localmedia/player-test.c
+++ b/tests/fixtures/localmedia/player-test.c
@@ -3,7 +3,8 @@
 
 #include <stdlib.h>
 
-/* A fake sink: queued slots play in FIFO order as the test advances time. */
+/* A fake sink: queued slots play in FIFO order as the test advances time. While `stalled`,
+ * queued slots wait without playing (the DSP has not picked up the first yet). */
 typedef struct {
   int16_t data[LM_SLOTS][LM_SLOT_FRAMES * 2];
   int frames[LM_SLOTS];
@@ -12,6 +13,7 @@ typedef struct {
   int rate, channels, clears;
   uint64_t played_total; /* frames played since the last clear */
   uint64_t tick;
+  int stalled;
 } Fake;
 
 static int fake_free(void *ctx, int slot) {
@@ -30,7 +32,7 @@ static void fake_configure(void *ctx, int rate, int channels) { Fake *f = ctx; f
 static void fake_clear(void *ctx) { Fake *f = ctx; f->count = 0; f->played = 0; f->played_total = 0; f->clears++; }
 static int fake_playing(void *ctx, uint32_t *played) {
   Fake *f = ctx;
-  if (f->count == 0) return -1;
+  if (f->count == 0 || f->stalled) return -1;
   *played = f->played;
   return f->fifo[f->head];
 }
@@ -149,6 +151,18 @@ int main(void) {
   CHECK_INT(player.underruns, 2);
   lm_player_close(&player);
 
+  /* Queued but not yet playing: nothing has been heard, so the position stays put. */
+  memset(&fake, 0, sizeof fake);
+  fake.stalled = 1;
+  CHECK(lm_player_open(&player, &sink, "cbr-info.mp3"));
+  CHECK_INT(lm_player_pump(&player, 4), LM_PUMP_PLAYING);
+  CHECK_INT(lm_player_position(&player), 0);
+  fake.stalled = 0;
+  CHECK_INT(lm_player_position(&player), 0);
+  advance(&fake, 4410);
+  CHECK_INT(lm_player_position(&player), 100);
+  lm_player_close(&player);
+
   /* Failures: a missing file, no frames, and frames followed by unreadable bytes. */
   memset(&fake, 0, sizeof fake);
   CHECK(!lm_player_open(&player, &sink, "no-such-file.mp3"));
```

- [ ] **Step 4: Run it.** → **1 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git -C runtime add hosts/3ds/src/localmedia_player.c tests/fixtures/localmedia/player-test.c
git -C runtime commit -m "fix(localmedia): slots queued before the DSP starts do not count as heard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Glue minors 4.2, 4.4, 4.5, 4.7, 4.9; the fork suite; the push

- **4.2:** the open mail carries the track's scanned duration, and a failed open reports it.
- **4.4:** paths hold `PATH_BYTES` (1024).
- **4.5:** an open or seek superseded while it ran skips its prefill.
- **4.7:** the prefill's decode ticks count toward `decodeLoad`.
- **4.9:** a handle-0 upload is freed and retried.

The host fake gains seams: a hold inside `configure` (`ndspChnReset`), wavebufs queued between resets, a clock that steps at every reading.

**Files:**
- Modify: `runtime/hosts/3ds/src/localmedia.c`
- Test: `runtime/tests/fixtures/localmedia/glue/glue-fake.{c,h}`, `glue-test.c`, `runtime/tests/localmedia-native.test.ts`

**Interfaces:** unchanged externally. Fake controls: `fake_hold_configure(bool)`, `fake_configures()`, `fake_adds_before_reset()`, `fake_tick_step(uint64_t ns)`.

- [ ] **Step 1: Write the failing tests.** `git -C runtime apply --include='tests/*' $TMPDIR/t7.patch`.
- [ ] **Step 2: Watch them fail.** `cd runtime && bun test tests/localmedia-native.test.ts -t glue` → **0 pass, 1 fail**, five checks:
  - `durationMs == 1044, expected 0` (4.2);
  - `fake_live_textures() == 2, expected 1` (4.9);
  - `CHECK(phase_is("playing")) failed` for the 250-byte name (4.4);
  - `fake_adds_before_reset() == 5, expected 0` (4.5);
  - `CHECK(field(status, "decodeLoad") > 0) failed` (4.7).
- [ ] **Step 3: Implement.** `git -C runtime apply --exclude='tests/*' $TMPDIR/t7.patch`:

```diff
diff --git a/hosts/3ds/src/localmedia.c b/hosts/3ds/src/localmedia.c
index 4e29b2bae9cd0ea0538f223bddf6789f7796cfc8..52151c918778a0c0b3635532d8547562bf398e76 100644
--- a/hosts/3ds/src/localmedia.c
+++ b/hosts/3ds/src/localmedia.c
@@ -33,6 +33,8 @@
 #define PREFILL_SLOTS 4
 #define WAKE_NS 10000000LL
 #define MAX_ART_HANDLES 32
+/* Folder plus name: SD card names reach 255 UTF-16 units, up to 765 UTF-8 bytes. */
+#define PATH_BYTES 1024
 
 enum { IDLE, LOADING, PLAYING, PAUSED, ENDED, FAILED };
 enum { ERR_NONE, ERR_NOT_FOUND, ERR_NO_SYNC, ERR_UNREADABLE, ERR_READ, ERR_DSP_FIRMWARE, ERR_AUDIO };
@@ -45,10 +47,10 @@ static const char *const ERRORS[] = {"", "File not found", "MP3 frame sync not f
 typedef struct {
   _Atomic unsigned sequence;
   unsigned generation;          /* 0: never written */
-  uint32_t ms;
+  uint32_t ms;                  /* open: the track's scanned duration; seek: the target */
   long offset, raw_bytes;
   int unsync;
-  char path[300];               /* open: the file ("" stops playback) */
+  char path[PATH_BYTES];        /* open: the file ("" stops playback) */
 } Mail;
 
 _Static_assert(ATOMIC_INT_LOCK_FREE == 2, "media.local handoff must be lock-free");
@@ -119,7 +121,6 @@ static unsigned art_generation;
 static bool art_handed_out;
 static int32_t art_handles[MAX_ART_HANDLES];
 static int art_handle_count;
-static int32_t reserved_handle = -1;
 
 /* ---- NDSP sink (audio thread) ----------------------------------------------- */
 static ndspWaveBuf waves[LM_SLOTS];
@@ -168,6 +169,8 @@ static const LmSink SINK = {NULL, sink_free, sink_data, sink_queue, sink_configu
 /* ---- audio thread ------------------------------------------------------------ */
 static LmPlayer player;
 static bool player_open;
+/* The open's scanned duration: what a failed open reports. */
+static unsigned open_duration;
 /* Underruns of the players closed so far: the status counts them for the session. */
 static unsigned closed_underruns;
 
@@ -179,7 +182,7 @@ static void publish(unsigned generation, unsigned phase, unsigned error) {
   atomic_store(&work_phase, phase);
   atomic_store(&work_error, error);
   atomic_store(&work_position, player_open ? lm_player_position(&player) : 0);
-  if (player_open) atomic_store(&work_duration, lm_player_duration(&player));
+  atomic_store(&work_duration, player_open ? lm_player_duration(&player) : open_duration);
   atomic_store(&underruns, closed_underruns + (player_open ? player.underruns : 0));
   atomic_store_explicit(&published, generation, memory_order_release);
 }
@@ -214,6 +217,7 @@ static void audio_main(void *unused) {
       generation = mail.generation;
       handled = true;
       close_player();
+      open_duration = mail.ms;
       phase = IDLE;
       error = ERR_NONE;
       if (mail.path[0] == '\0') {
@@ -236,10 +240,13 @@ static void audio_main(void *unused) {
       handled = true;
       if (player_open) { lm_player_seek(&player, mail.ms); restart = true; }
     }
-    if (restart) {
+    /* A newer command arrived while this one opened or seeked: leave the prefill to it. */
+    if (restart && current(generation)) {
       applied_paused = atomic_load(&paused_flag);
       ndspChnSetPaused(CHANNEL, applied_paused);
+      uint64_t before = player.decode_ticks;
       LmPump state = lm_player_pump(&player, PREFILL_SLOTS);
+      window_decode += player.decode_ticks - before;
       phase = state == LM_PUMP_ERROR ? FAILED : state == LM_PUMP_ENDED ? ENDED : PLAYING;
       error = phase == FAILED ? error_of(player.message) : ERR_NONE;
     }
@@ -469,8 +476,6 @@ void localmedia_forget_guest(void) {
   atomic_store(&paused_flag, false);
   for (int i = 0; i < art_handle_count; i++) ui_free_texture(art_handles[i]);
   art_handle_count = 0;
-  if (reserved_handle >= 0) ui_free_texture(reserved_handle);
-  reserved_handle = -1;
   art_id = -1;
 }
 
@@ -493,7 +498,7 @@ int32_t localmedia_open(int32_t id) {
   adopt_scan();
   const LmTrack *track = lm_library_find(library, id);
   if (!track) return 0;
-  char path[300];
+  char path[PATH_BYTES];
   snprintf(path, sizeof path, "%s%s", ROOT, track->file);
   open_serial++;
   command_track = id;
@@ -502,7 +507,7 @@ int32_t localmedia_open(int32_t id) {
   command_duration = track->duration_ms;
   resumed_while_loading = false;
   atomic_store(&paused_flag, false);
-  post(&open_mail, 0, path);
+  post(&open_mail, track->duration_ms, path);
   return (int32_t)open_serial;
 }
 
@@ -548,11 +553,12 @@ void localmedia_status(char *out, size_t capacity) {
     art_handle_count);
 }
 
-/* Uploads the finished pixels; never hands out core handle 0 (the contract's "none"). */
+/* Uploads the finished pixels; never hands out core handle 0 (the contract's "none"). A
+ * handle carries its slot's generation, so once 0 is freed the next upload is another. */
 static int32_t upload_art(void) {
   int32_t handle = ui_upload_texture(art_pixels, LM_ART_PIXELS_BYTES, LM_ART_EDGE, LM_ART_EDGE, 3);
   if (handle == 0) {
-    reserved_handle = handle;
+    ui_free_texture(handle);
     handle = ui_upload_texture(art_pixels, LM_ART_PIXELS_BYTES, LM_ART_EDGE, LM_ART_EDGE, 3);
   }
   if (handle <= 0 || art_handle_count >= MAX_ART_HANDLES) {
diff --git a/tests/fixtures/localmedia/glue/glue-fake.c b/tests/fixtures/localmedia/glue/glue-fake.c
index 296b4158c3cede1eb93be514ebe5f1c364a12adc..170d7661fda9e603f9d5e51988c133f2e3386df8 100644
--- a/tests/fixtures/localmedia/glue/glue-fake.c
+++ b/tests/fixtures/localmedia/glue/glue-fake.c
@@ -23,7 +23,14 @@ Result threadJoin(Thread t, u64 timeout) { (void)timeout; pthread_join(t->thread
 void threadFree(Thread t) { free(t); }
 Result svcGetThreadPriority(s32 *out, Handle h) { (void)h; *out = 0x30; return 0; }
 void svcSleepThread(s64 ns) { struct timespec ts = {ns / 1000000000, ns % 1000000000}; nanosleep(&ts, NULL); }
-u64 svcGetSystemTick(void) { struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return (u64)ts.tv_sec * 1000000000ULL + (u64)ts.tv_nsec; }
+/* The clock is real time plus a skew that grows by `tick_step` at every reading. */
+static _Atomic u64 tick_step, tick_skew;
+void fake_tick_step(uint64_t ns) { atomic_store(&tick_step, ns); }
+u64 svcGetSystemTick(void) {
+  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
+  u64 skew = atomic_fetch_add(&tick_skew, atomic_load(&tick_step)) + atomic_load(&tick_step);
+  return (u64)ts.tv_sec * 1000000000ULL + (u64)ts.tv_nsec + skew;
+}
 
 typedef struct { pthread_mutex_t lock; pthread_cond_t cond; int signaled; } EventImpl;
 static pthread_mutex_t hold_lock = PTHREAD_MUTEX_INITIALIZER;
@@ -75,7 +82,27 @@ static unsigned adds;
 Result ndspInit(void) { return 0; }
 void ndspExit(void) {}
 void ndspSetOutputMode(int mode) { (void)mode; }
-void ndspChnReset(int id) { (void)id; }
+/* A reset starts each open's configure: it counts, records the wavebufs queued since the
+ * previous one, and waits while the test holds configures. */
+static pthread_mutex_t configure_lock = PTHREAD_MUTEX_INITIALIZER;
+static pthread_cond_t configure_cond = PTHREAD_COND_INITIALIZER;
+static bool configure_held;
+static atomic_uint configures, adds_at_reset, adds_before_reset;
+void fake_hold_configure(bool held) {
+  pthread_mutex_lock(&configure_lock); configure_held = held; pthread_cond_broadcast(&configure_cond); pthread_mutex_unlock(&configure_lock);
+}
+unsigned fake_configures(void) { return atomic_load(&configures); }
+unsigned fake_adds_before_reset(void) { return atomic_load(&adds_before_reset); }
+unsigned fake_adds(void);
+void ndspChnReset(int id) {
+  (void)id;
+  unsigned now = fake_adds();
+  atomic_store(&adds_before_reset, now - atomic_exchange(&adds_at_reset, now));
+  atomic_fetch_add(&configures, 1);
+  pthread_mutex_lock(&configure_lock);
+  while (configure_held) pthread_cond_wait(&configure_cond, &configure_lock);
+  pthread_mutex_unlock(&configure_lock);
+}
 void ndspChnSetInterp(int id, int type) { (void)id; (void)type; }
 void ndspChnSetRate(int id, float rate) { (void)id; (void)rate; }
 void ndspChnSetFormat(int id, u16 format) { (void)id; (void)format; }
diff --git a/tests/fixtures/localmedia/glue/glue-fake.h b/tests/fixtures/localmedia/glue/glue-fake.h
index a8212e70c0dc82ef4c1ea6b4e6f07ae06fc9afff..6a580c7fb2d57cf694e261740f225fbe1489a60c 100644
--- a/tests/fixtures/localmedia/glue/glue-fake.h
+++ b/tests/fixtures/localmedia/glue/glue-fake.h
@@ -12,6 +12,13 @@ uint32_t fake_drain(uint32_t frames);
 /* Wavebufs queued and not yet played; wavebufs ever queued. */
 int fake_queued(void);
 unsigned fake_adds(void);
+/* While held, an open waits inside its configure (at ndspChnReset). */
+void fake_hold_configure(bool held);
+/* Configures started so far; wavebufs queued between the last two. */
+unsigned fake_configures(void);
+unsigned fake_adds_before_reset(void);
+/* From now on every svcGetSystemTick reading moves the clock `ns` further on (0: real time). */
+void fake_tick_step(uint64_t ns);
 /* Core textures uploaded and not freed. */
 int fake_live_textures(void);
 #endif
diff --git a/tests/fixtures/localmedia/glue/glue-test.c b/tests/fixtures/localmedia/glue/glue-test.c
index f8138e429447d65b535933ad419f5f0bcb5d89e4..d326464a612abf7f8e4392be18d4ce48b7540676 100644
--- a/tests/fixtures/localmedia/glue/glue-test.c
+++ b/tests/fixtures/localmedia/glue/glue-test.c
@@ -1,7 +1,8 @@
 /* The media.local glue (hosts/3ds/src/localmedia.c) on the host: real threads,
  * mail slots and status, the fake NDSP and core textures of glue-fake.c, and a
- * music folder (LOCALMEDIA_ROOT) holding a.mp3 (cbr-info), b.mp3 (cbr-plain),
- * art.mp3 (tagged-v23), junk.mp3 (no frames) and 300 pad-NNN.mp3 copies of cbr-plain. */
+ * music folder (LOCALMEDIA_ROOT, a long path) holding a.mp3 (cbr-info), b.mp3 (cbr-plain),
+ * art.mp3 (tagged-v23), junk.mp3 (no frames), short.mp3 (the first 11 frames of cbr-plain),
+ * a copy of a.mp3 under a 250-byte UTF-8 name and 300 pad-NNN.mp3 copies of cbr-plain. */
 #include "localmedia.h"
 #include "glue-fake.h"
 #include "../check.h"
@@ -62,6 +63,7 @@ int main(void) {
   WAIT_UNTIL(phase_is("error"), 2000);
   CHECK(phase_is("error"));
   CHECK(strstr(status, "MP3 frame sync not found") != NULL);
+  CHECK_INT(field(status, "durationMs"), 0); /* the failed track's scanned duration, not a.mp3's */
 
   /* End of track: with the last slots queued and nothing left to decode, the audio
    * thread keeps waiting on its event instead of spinning above the UI. */
@@ -99,9 +101,41 @@ int main(void) {
   for (int i = 0; i < 2000 && handle < 0; i++) { handle = localmedia_artwork(art); if (handle < 0) sleep_ms(1); }
   CHECK(handle > 0);
   CHECK_INT(field(read_status(), "artHandles"), 1);
+  CHECK_INT(fake_live_textures(), 1); /* the cover alone: nothing is held back for handle 0 */
   localmedia_release_artwork(handle);
   CHECK_INT(field(read_status(), "artHandles"), 0);
 
+  /* A 250-byte UTF-8 name opens: no path is cut short. */
+  char long_name[300] = "";
+  for (int i = 0; i < 123; i++) strcat(long_name, "\xc3\xa9");
+  strcat(long_name, ".mp3");
+  int longest = id_of(long_name);
+  CHECK(longest >= 0);
+  CHECK(localmedia_open(longest) > 0);
+  WAIT_UNTIL(phase_is("playing"), 2000);
+  CHECK(phase_is("playing"));
+
+  /* A superseded open queues no audio: b is opened while a's open is still configuring. */
+  fake_hold_configure(true);
+  unsigned configures = fake_configures();
+  int32_t serial = localmedia_open(a);
+  WAIT_UNTIL(fake_configures() > configures, 2000);
+  CHECK(fake_configures() > configures);
+  CHECK_INT(localmedia_open(b), serial + 1);
+  fake_hold_configure(false);
+  WAIT_UNTIL(fake_configures() > configures + 1 && phase_is("playing"), 2000);
+  CHECK(phase_is("playing"));
+  CHECK_INT(fake_adds_before_reset(), 0);
+
+  /* The prefill's decoding counts toward decodeLoad: short.mp3 is decoded by its prefill alone. */
+  sleep_ms(2100); /* b is fully queued: two whole one-second windows pass with nothing decoded */
+  CHECK_INT(field(read_status(), "decodeLoad"), 0);
+  fake_tick_step(50000000); /* every clock reading costs 50 ms */
+  CHECK(localmedia_open(id_of("short.mp3")) > 0);
+  WAIT_UNTIL(field(read_status(), "decodeLoad") > 0, 3000);
+  fake_tick_step(0);
+  CHECK(field(status, "decodeLoad") > 0);
+
   /* Art is served between scanned files: a cover asked for during a full rescan arrives before
    * the rescan ends. */
   remove(LOCALMEDIA_CACHE_DIR "/library.cache");
diff --git a/tests/localmedia-native.test.ts b/tests/localmedia-native.test.ts
index 66b116efaf80304d54dfffa6941a8462cf7623d4..f48b567be0f6819cc4727cc0ceb5f544e6f38943 100644
--- a/tests/localmedia-native.test.ts
+++ b/tests/localmedia-native.test.ts
@@ -1,5 +1,5 @@
 import { afterAll, describe, expect, test } from "bun:test";
-import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
+import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
 import { validLocalTrack, type LocalTrack } from "../contracts/spec/localmedia.ts";
 import { tmpdir } from "node:os";
 import { join, resolve } from "node:path";
@@ -95,11 +95,13 @@ describe("media.local native units (host-compiled)", () => {
     expect(run("player-test.c", ["localmedia_player.c", "localmedia_mp3.c", "localmedia_tags.c"])).toContain("localmedia player verified");
   }, 60_000);
 
-  test("glue: snapshots, a failed open behind a seek, end-of-track waiting, session underruns, art hand-off, art during scans, out of memory", () => {
-    const music = join(scratch, "glue-music");
+  test("glue: snapshots, failed opens, end-of-track waiting, underruns, art, long names, superseded opens, decode load, art during scans, out of memory", () => {
+    // A long folder path, so a long name overflows any 300-byte path buffer.
+    const music = join(scratch, `glue-music-${"x".repeat(60)}`);
     mkdirSync(music, { recursive: true });
-    for (const [file, from] of [["a.mp3", "cbr-info.mp3"], ["b.mp3", "cbr-plain.mp3"], ["art.mp3", "tagged-v23.mp3"]]) copyFileSync(join(FIXTURES, from!), join(music, file!));
+    for (const [file, from] of [["a.mp3", "cbr-info.mp3"], ["b.mp3", "cbr-plain.mp3"], ["art.mp3", "tagged-v23.mp3"], [`${"é".repeat(123)}.mp3`, "cbr-info.mp3"]]) copyFileSync(join(FIXTURES, from!), join(music, file!));
     for (let i = 0; i < 300; i++) copyFileSync(join(FIXTURES, "cbr-plain.mp3"), join(music, `pad-${String(i).padStart(3, "0")}.mp3`));
+    writeFileSync(join(music, "short.mp3"), readFileSync(join(FIXTURES, "cbr-plain.mp3")).subarray(0, 5000));
     writeFileSync(join(music, "junk.mp3"), Buffer.alloc(70_000, 0x11));
     const glue = join(FIXTURES, "glue");
     const binary = join(scratch, "glue-test");
```

- [ ] **Step 4: Run them.** `bun test tests/localmedia-native.test.ts` → **9 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git -C runtime add hosts/3ds/src/localmedia.c tests/fixtures/localmedia/glue/glue-fake.c tests/fixtures/localmedia/glue/glue-fake.h tests/fixtures/localmedia/glue/glue-test.c tests/localmedia-native.test.ts
git -C runtime commit -m "fix(localmedia): failed-open duration, long paths, superseded opens, prefill load, no reserved texture

- A failed open reports the scanned duration of the track it tried.
- Paths hold 1024 bytes (SD card names reach 765 UTF-8 bytes).
- An open or seek superseded while it ran queues no audio.
- The prefill's decoding counts toward decodeLoad.
- Handle 0 is freed and the upload retried (the slot's next generation is
  another handle) instead of holding a 128x128 texture back.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Run the fork's suite.** `cd runtime && bun run test > $TMPDIR/fork-suite.log 2>&1; tail -20 $TMPDIR/fork-suite.log`.
  Expected: the unit stage fails only on `ESP-IDF incremental package build > Ninja learns new imports…` (`CMake was unable to find a build program corresponding to "Ninja"`), which fails at `520950e8` too (Global Constraints, refinement 6). Any other failure stops the task.
- [ ] **Step 7: Push the fork — ask first.** Tell the user the fork's `ds-man` branch is 7 commits ahead of `fork/ds-man` and ask before `git -C runtime push fork ds-man`. Push only on a yes; on a no, continue (the pin works locally) and say so in the final report.

## Task 8: The perf harness; pin the hardened fork; the baselines

`bun run perf [scenario…] [--model old|new|both] [--check] [--out dir]` builds one capture `.3dsx` per scenario with a baked tape, lays out a fixture `$HOME` (cloned `nand`/`sysdata`, the test library cloned with `cp -c`, a placeholder `dspfirm.cdc`, a pinned config), runs Azahar headless (`open -n -a Azahar --env HOME=…`), waits for `done`, and reads `stats.json`.

`scan-cached` reuses `scan-first`'s card (`keepCard`), so it reads the cache `scan-first` wrote. The test library gains a long-titled track that sorts first.

**Files:**
- Create: `scripts/perf.ts`, `tests/perf.test.ts`
- Modify: `app/player/reducer.ts` (`IDLE_STATUS.scanMs`), `package.json` (`perf`), `scripts/make-test-library.ts`, `runtime` (pin)

**Interfaces:**
- Consumes: Task 2's `timingUs.work` and `trace`; Task 5's `stats.json.localmedia`; Task 4's `LocalStatus.scanMs`.
- Produces: `SCENARIOS`, `BUDGET_US`, `SCAN_BUDGET_MS`, `cpuWork(stats)`, `overBudget(scenario, model, stats): string | null` (used by `--check`).

- [ ] **Step 1: Pin the fork.** `git add runtime` (the fork at Task 7's commit).
- [ ] **Step 2: Write the failing tests.** `git apply --include='tests/*' $TMPDIR/t8.patch`.
- [ ] **Step 3: Watch them fail.**
  - `bun test --conditions=browser tests/perf.test.ts` → **0 pass, 1 fail** (`Cannot find module '../scripts/perf.ts'`).
  - `bun run check` → 4 errors, among them `app/player/reducer.ts(37,14): error TS2741: Property 'scanMs' is missing …` (the new contract).
- [ ] **Step 4: Implement.** `git apply --exclude='tests/*' $TMPDIR/t8.patch`:

```diff
diff --git a/app/player/reducer.ts b/app/player/reducer.ts
index d0e0b205e39b49eb37ae6bd803a45c87ddaab357..fa3a319123c39ec0ed862b31695aa81c08b59851 100644
--- a/app/player/reducer.ts
+++ b/app/player/reducer.ts
@@ -36,7 +36,7 @@ export interface Reduced { state: PlayerState; commands: PlayerCommand[] }
 export const RESTART_THRESHOLD_MS = 3000;
 export const IDLE_STATUS: LocalStatus = Object.freeze({
   phase: "idle", trackId: -1, openSerial: 0, positionMs: 0, durationMs: 0, scanning: false, scanGeneration: 0, underruns: 0, error: "",
-  decodeLoad: 0, artHandles: 0,
+  decodeLoad: 0, artHandles: 0, scanMs: 0,
 });
 
 export function initialPlayer(): PlayerState {
diff --git a/package.json b/package.json
index 2fab4fbee0bc124501f35c9cb8753468a5beba32..af34b74861280f92829584d6888abfaf6db62082 100644
--- a/package.json
+++ b/package.json
@@ -6,6 +6,7 @@
   "scripts": {
     "3ds": "bun scripts/build.ts",
     "test-library": "bun scripts/make-test-library.ts",
+    "perf": "bun scripts/perf.ts",
     "check": "bun runtime/node_modules/typescript/bin/tsc --noEmit",
     "test": "bun test ./tests",
     "gallery": "bun scripts/gallery.ts"
diff --git a/scripts/make-test-library.ts b/scripts/make-test-library.ts
index 719127f7c181056eb9a81e7504254cbb480459d3..56baad74e5b17941e10b75c740af124cb3e518d7 100644
--- a/scripts/make-test-library.ts
+++ b/scripts/make-test-library.ts
@@ -97,6 +97,8 @@ for (let a = 0; a < ARTISTS.length; a++) {
   }
 }
 jobs.push({ file: "Mono Field Recording.mp3", title: "Mono Field Recording", artist: "Atlas Hum", album: "Field Notes", track: 1, seconds: 45, kind: "mono22", tag: "v23" });
+// Sorts first in the Songs list and overflows the LCD: the perf scenarios start from it.
+jobs.push({ file: "000 A Very Long Title.mp3", title: "A Very Long Title That Keeps Scrolling Across The Display (Extended Mix)", artist: "Glass Lantern", album: "Endurance", track: 2, seconds: 240, kind: "cbr320", tag: "v23", cover: "jpeg" });
 jobs.push({ file: "The Long One.mp3", title: "The Long One (65 minutes)", artist: "Low Tide Choir", album: "Endurance", track: 1, seconds: 65 * 60, kind: "cbr128", tag: "v24", cover: "jpeg" });
 
 async function encode(job: Job): Promise<void> {
diff --git a/scripts/perf.ts b/scripts/perf.ts
new file mode 100644
index 0000000000000000000000000000000000000000..55c6aef4527916264cbb1cafa1e06cb995e5e5d9
--- /dev/null
+++ b/scripts/perf.ts
@@ -0,0 +1,212 @@
+// Measures ds-man in Azahar (headless): builds a capture .3dsx per scenario with
+// a baked input tape, boots it against a throwaway $HOME whose SD card holds the
+// device test library, and reads the frame timings and scan timings the host
+// writes to stats.json when the capture window ends.
+//
+//   bun run perf [idle|scroll|now-playing|scan-first|scan-cached …] [--model old|new|both] [--check] [--out dir]
+//
+// Needs Azahar (/Applications/Azahar.app, launched once so its config exists),
+// Docker for the 3DS build, and dist/test-music (bun run test-library).
+import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
+import { homedir } from "node:os";
+import { join, resolve } from "node:path";
+import { encodePNG } from "../runtime/tests/png.ts";
+
+export interface Scenario {
+  name: string;
+  /** POCKETJS_CAPTURE_INPUT: frame:mask steps (the mask holds until the next step). */
+  tape: string;
+  capture: number;
+  /** Frame scenarios are judged by CPU work; scan scenarios by stats.localmedia. */
+  kind: "frame" | "scan";
+  /** Reuse the previous scenario's SD card (the scan cache it wrote). */
+  keepCard?: boolean;
+}
+
+const A = 0x2000, DOWN = 0x40;
+// Presses wait until 40 s, well after the first scan (about 6 s in Azahar), so frame scenarios
+// measure the settled app.
+export const SCENARIOS: readonly Scenario[] = [
+  { name: "idle", tape: "0:0x0", capture: 3000, kind: "frame" },
+  { name: "scroll", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2700:0x${DOWN.toString(16)}`, capture: 3000, kind: "frame" },
+  { name: "now-playing", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0`, capture: 3000, kind: "frame" },
+  { name: "scan-first", tape: "0:0x0", capture: 3600, kind: "scan" },
+  { name: "scan-cached", tape: "0:0x0", capture: 3600, kind: "scan", keepCard: true },
+];
+
+/** CPU budgets per frame (max over the window), in µs: New 3DS 60 fps, Old 3DS a steady 30 fps. */
+export const BUDGET_US = { new: 14_000, old: 30_000 } as const;
+export const SCAN_BUDGET_MS = { first: 10_000, cached: 1_000, confirm: 3_000 } as const;
+
+export interface HostStats {
+  timingUs: {
+    js: [number, number]; tick: [number, number]; draw: [number, number]; gpu: [number, number]; frame: [number, number];
+    /** Each frame's js + tick + draw: its max is one real frame's. */
+    work: [number, number];
+    slowFrames: number;
+  };
+}
+export interface Stats {
+  host: HostStats;
+  localmedia?: { cachedMs: number; scanMs: number; files: number; parsed: number };
+}
+
+/** CPU work per frame (JS + tick + draw): [mean, max] in µs over the host's last 60-frame window. */
+export function cpuWork(stats: Stats): [number, number] {
+  return stats.host.timingUs.work;
+}
+
+export function overBudget(scenario: Scenario, model: "old" | "new", stats: Stats): string | null {
+  if (scenario.kind === "frame") {
+    const [, max] = cpuWork(stats);
+    return max > BUDGET_US[model] ? `CPU max ${(max / 1000).toFixed(1)} ms > ${BUDGET_US[model] / 1000} ms` : null;
+  }
+  const lm = stats.localmedia;
+  if (!lm) return "no localmedia stats";
+  if (scenario.name === "scan-first" && lm.scanMs > SCAN_BUDGET_MS.first) return `scan ${lm.scanMs} ms > ${SCAN_BUDGET_MS.first} ms`;
+  if (scenario.name === "scan-cached") {
+    if (lm.cachedMs < 0 || lm.cachedMs > SCAN_BUDGET_MS.cached) return `cached list ${lm.cachedMs} ms > ${SCAN_BUDGET_MS.cached} ms`;
+    if (lm.scanMs > SCAN_BUDGET_MS.confirm) return `confirmation ${lm.scanMs} ms > ${SCAN_BUDGET_MS.confirm} ms`;
+  }
+  return null;
+}
+
+// ---------------------------------------------------------------------------
+// Running Azahar
+// ---------------------------------------------------------------------------
+
+const ROOT = resolve(import.meta.dir, "..");
+const AZAHAR = "/Applications/Azahar.app";
+const AZAHAR_BIN = `${AZAHAR}/Contents/MacOS/azahar`;
+const SOURCE = `${homedir()}/Library/Application Support/Azahar`;
+
+function writeConfig(userDir: string, model: "old" | "new"): void {
+  let config = readFileSync(`${SOURCE}/config/qt-config.ini`, "utf8");
+  const set = (key: string, value: string) => {
+    if (!new RegExp(`^${key}=`, "m").test(config)) throw new Error(`perf: qt-config.ini has no ${key} key`);
+    config = config.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
+    config = new RegExp(`^${key}\\\\default=.*$`, "m").test(config)
+      ? config.replace(new RegExp(`^${key}\\\\default=.*$`, "m"), `${key}\\default=false`)
+      : config.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}\n${key}\\default=false`);
+  };
+  set("graphics_api", "2");
+  set("resolution_factor", "1");
+  set("use_vsync", "false");
+  set("frame_limit", "100");
+  set("use_disk_shader_cache", "false");
+  set("check_for_update_on_start", "false");
+  set("is_new_3ds", model === "new" ? "true" : "false");
+  // Azahar runs the ARM11 at the Old 3DS clock in both models (the New 3DS 804 MHz
+  // speed-up the host requests is not emulated), so the New model runs at 300%.
+  set("cpu_clock_percentage", model === "new" ? "300" : "100");
+  mkdirSync(`${userDir}/config`, { recursive: true });
+  writeFileSync(`${userDir}/config/qt-config.ini`, config);
+}
+
+/** Lays out a fixture $HOME; keeps the SD card when asked (the scan cache lives there). */
+function prepareHome(home: string, model: "old" | "new", keepCard: boolean): string {
+  const userDir = `${home}/Library/Application Support/Azahar`;
+  const sdmc = `${userDir}/sdmc`;
+  if (!keepCard) {
+    rmSync(home, { recursive: true, force: true });
+    mkdirSync(`${sdmc}/3ds`, { recursive: true });
+    for (const dir of ["nand", "sysdata"]) if (existsSync(`${SOURCE}/${dir}`)) cpSync(`${SOURCE}/${dir}`, `${userDir}/${dir}`, { recursive: true });
+    // Clone, not copy: APFS clones make the 366 MB library free to lay out per run.
+    const copy = Bun.spawnSync(["cp", "-cR", join(ROOT, "dist/test-music"), `${sdmc}/music`]);
+    if (copy.exitCode !== 0) throw new Error(`perf: could not copy the test library: ${copy.stderr.toString()}`);
+    // Azahar's HLE DSP needs the file to exist, not to be real firmware.
+    writeFileSync(`${sdmc}/3ds/dspfirm.cdc`, new Uint8Array(65536));
+  }
+  writeConfig(userDir, model);
+  rmSync(`${sdmc}/pocketjs-captures`, { recursive: true, force: true });
+  mkdirSync(`${sdmc}/pocketjs-captures`, { recursive: true });
+  return `${sdmc}/pocketjs-captures`;
+}
+
+function kill(): void {
+  Bun.spawnSync(["pkill", "-9", "-f", AZAHAR_BIN], { stdout: "ignore", stderr: "ignore" });
+}
+
+async function runAzahar(home: string, captures: string, rom: string, log: string): Promise<void> {
+  kill();
+  const launch = Bun.spawnSync(["open", "-n", "-a", AZAHAR, "--env", `HOME=${home}`, "--stdout", log, "--stderr", log, "--args", rom]);
+  if (launch.exitCode !== 0) throw new Error(`perf: could not launch Azahar: ${launch.stderr.toString()}`);
+  const started = Date.now();
+  try {
+    while (Date.now() - started < 240_000) {
+      if (existsSync(`${captures}/error.txt`)) throw new Error(readFileSync(`${captures}/error.txt`, "utf8"));
+      if (existsSync(`${captures}/done`)) return;
+      await Bun.sleep(250);
+    }
+    throw new Error("perf: timed out waiting for the capture to finish");
+  } finally {
+    kill();
+  }
+}
+
+function decodeScreen(raw: Uint8Array, width: number, height: number): Uint8Array {
+  const rgba = new Uint8Array(width * height * 4);
+  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
+    const s = (x * height + (height - 1 - y)) * 4, d = (y * width + x) * 4;
+    rgba[d] = raw[s + 3]!; rgba[d + 1] = raw[s + 2]!; rgba[d + 2] = raw[s + 1]!; rgba[d + 3] = 255;
+  }
+  return rgba;
+}
+
+async function build(scenario: Scenario, out: string): Promise<string> {
+  const log = join(out, `${scenario.name}.build.log`);
+  const proc = Bun.spawn(["bun", "scripts/build.ts", "--capture"], {
+    cwd: ROOT,
+    env: { ...process.env, POCKETJS_CAPTURE_INPUT: scenario.tape, POCKETJS_CAP_START: String(scenario.capture), POCKETJS_CAP_N: "1" },
+    stdout: Bun.file(log), stderr: Bun.file(log),
+  });
+  if ((await proc.exited) !== 0) throw new Error(`perf: capture build for ${scenario.name} failed (see ${log})`);
+  const rom = join(out, `${scenario.name}.3dsx`);
+  cpSync(join(ROOT, "dist/ds-man-main.3dsx"), rom);
+  return rom;
+}
+
+const fmt = (us: number) => (us / 1000).toFixed(1);
+
+if (import.meta.main) {
+  const args = process.argv.slice(2);
+  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
+  const check = args.includes("--check") ? (args.splice(args.indexOf("--check"), 1), true) : false;
+  const modelArg = flag("--model") ?? "both";
+  const out = resolve(flag("--out") ?? join(ROOT, "dist/perf"));
+  const models: ("old" | "new")[] = modelArg === "both" ? ["new", "old"] : [modelArg as "old" | "new"];
+  const chosen = args.length ? SCENARIOS.filter((s) => args.includes(s.name)) : SCENARIOS;
+  if (!existsSync(AZAHAR_BIN)) throw new Error(`perf: Azahar not found at ${AZAHAR}`);
+  if (!existsSync(join(ROOT, "dist/test-music"))) throw new Error("perf: run `bun run test-library` first");
+  mkdirSync(out, { recursive: true });
+  const roms = new Map<string, string>();
+  for (const scenario of chosen) roms.set(scenario.name, await build(scenario, out));
+  const results: { scenario: string; model: string; stats: Stats; failure: string | null }[] = [];
+  for (const model of models) {
+    const home = join(out, `home-${model}`);
+    for (const scenario of chosen) {
+      const captures = prepareHome(home, model, scenario.keepCard === true);
+      await runAzahar(home, captures, roms.get(scenario.name)!, join(out, `${scenario.name}-${model}.azahar.log`));
+      const statsText = readFileSync(`${captures}/stats.json`, "utf8");
+      writeFileSync(join(out, `${scenario.name}-${model}.stats.json`), statsText);
+      const stats = JSON.parse(statsText) as Stats;
+      const frame = String(scenario.capture).padStart(4, "0");
+      for (const [prefix, width, label] of [["", 400, "top"], ["aux-", 320, "bottom"]] as const) {
+        const raw = `${captures}/${prefix}f${frame}.raw`;
+        if (existsSync(raw)) writeFileSync(join(out, `${scenario.name}-${model}-${label}.png`), encodePNG(decodeScreen(readFileSync(raw), width, 240), width, 240));
+      }
+      const failure = overBudget(scenario, model, stats);
+      results.push({ scenario: scenario.name, model, stats, failure });
+      console.error(`perf: ${scenario.name} (${model}) ${failure ?? "ok"}`);
+    }
+  }
+  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
+  console.log("| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |");
+  console.log("|---|---|---|---|---|---|---|---|");
+  for (const r of results) {
+    const t = r.stats.host.timingUs, [mean, max] = cpuWork(r.stats), lm = r.stats.localmedia;
+    const scan = lm ? `cached ${lm.cachedMs}, walk ${lm.scanMs} (${lm.parsed}/${lm.files} read)` : "";
+    console.log(`| ${r.scenario} | ${r.model} | ${fmt(t.js[0])}/${fmt(t.js[1])} | ${fmt(t.tick[0])}/${fmt(t.tick[1])} | ${fmt(t.draw[0])}/${fmt(t.draw[1])} | ${fmt(mean)}/${fmt(max)} | ${scan} | ${r.failure ? `no: ${r.failure}` : "yes"} |`);
+  }
+  if (check && results.some((r) => r.failure)) process.exit(1);
+}
diff --git a/tests/perf.test.ts b/tests/perf.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2b485486f45e15d571c7c47dc351385a27be6a1a
--- /dev/null
+++ b/tests/perf.test.ts
@@ -0,0 +1,34 @@
+import { expect, test } from "bun:test";
+import { BUDGET_US, cpuWork, overBudget, SCAN_BUDGET_MS, SCENARIOS, type Scenario, type Stats } from "../scripts/perf.ts";
+
+const scenario = (name: string): Scenario => SCENARIOS.find((s) => s.name === name)!;
+const stats = (work: [number, number], localmedia?: Stats["localmedia"]): Stats => ({
+  host: { timingUs: { js: [0, 0], tick: [0, 0], draw: [0, 0], gpu: [0, 0], frame: [0, 0], work, slowFrames: 0 } },
+  localmedia,
+});
+
+test("the scenarios are the spec's, and the budgets its targets", () => {
+  expect(SCENARIOS.map((s) => s.name)).toEqual(["idle", "scroll", "now-playing", "scan-first", "scan-cached"]);
+  expect(BUDGET_US).toEqual({ new: 14_000, old: 30_000 });
+  expect(SCAN_BUDGET_MS).toEqual({ first: 10_000, cached: 1_000, confirm: 3_000 });
+  expect(scenario("scan-cached").keepCard).toBe(true); // it reads the cache scan-first wrote
+});
+
+test("frame scenarios are judged by the worst frame's CPU work", () => {
+  expect(cpuWork(stats([3_000, 7_800]))).toEqual([3_000, 7_800]);
+  expect(overBudget(scenario("scroll"), "new", stats([3_000, 14_000]))).toBeNull();
+  expect(overBudget(scenario("scroll"), "new", stats([3_000, 14_001]))).toBe("CPU max 14.0 ms > 14 ms");
+  expect(overBudget(scenario("idle"), "old", stats([4_800, 30_000]))).toBeNull();
+  expect(overBudget(scenario("idle"), "old", stats([4_800, 30_500]))).toBe("CPU max 30.5 ms > 30 ms");
+});
+
+test("scan scenarios are judged by the scan's timings", () => {
+  const first = scenario("scan-first"), cached = scenario("scan-cached");
+  expect(overBudget(first, "old", stats([0, 0]))).toBe("no localmedia stats");
+  expect(overBudget(first, "old", stats([0, 0], { cachedMs: -1, scanMs: 10_000, files: 324, parsed: 324 }))).toBeNull();
+  expect(overBudget(first, "old", stats([0, 0], { cachedMs: -1, scanMs: 10_001, files: 324, parsed: 324 }))).toBe("scan 10001 ms > 10000 ms");
+  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: 345, scanMs: 936, files: 324, parsed: 0 }))).toBeNull();
+  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: -1, scanMs: 936, files: 324, parsed: 0 }))).toBe("cached list -1 ms > 1000 ms");
+  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: 1_001, scanMs: 936, files: 324, parsed: 0 }))).toBe("cached list 1001 ms > 1000 ms");
+  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: 345, scanMs: 3_001, files: 324, parsed: 0 }))).toBe("confirmation 3001 ms > 3000 ms");
+});
```

- [ ] **Step 5: Run them.**
  - `bun test --conditions=browser tests/perf.test.ts` → **3 pass**;
  - `bun run check` → clean;
  - `bun run test` → **118 pass, 0 fail**.
- [ ] **Step 6: Gallery baseline (before any app optimization).** `bun run gallery && rm -rf dist/gallery-baseline && cp -R dist/gallery dist/gallery-baseline && ls dist/gallery-baseline | wc -l` → **16**.
- [ ] **Step 7: Build both 3DS variants.**
  - `bun run 3ds 2>&1 | grep -E "warning|error" | grep localmedia` → nothing.
  - `POCKETJS_CAPTURE_INPUT=0:0x0 POCKETJS_CAP_START=60 POCKETJS_CAP_N=1 bun scripts/build.ts --capture 2>&1 | grep -E "warning|error" | grep -E "localmedia|main.c"` → nothing.
- [ ] **Step 8: Regenerate the test library.** `bun run test-library` → 324 files in `dist/test-music/` (it replaces only a folder it made itself).
- [ ] **Step 9: Measure the baseline.** `bun run perf --out dist/perf-baseline | tee dist/perf-baseline.md` (about 15 minutes; Azahar opens and closes windows).
  - Expected: every row prints.
  - `scroll` is over budget on both models here (the prototype's baseline: 108.6 ms on New, 354.1 ms on Old, as sums of per-phase maxima); `idle` and `now-playing` may pass.
  - `scan-first` is about 6 s and `scan-cached` lists `0/324 read`, because the fork's scan work is already in.
  - Keep `dist/perf-baseline.md` for Task 13.
- [ ] **Step 10: Commit.**

```bash
git add runtime app/player/reducer.ts package.json scripts/make-test-library.ts scripts/perf.ts tests/perf.test.ts
git commit -m "feat(perf): measure frame and scan budgets in Azahar; pin the hardened fork

bun run perf builds a capture per scenario (idle, scroll, now-playing,
scan-first, scan-cached), runs it headless in Azahar as an Old and a New 3DS,
and checks CPU work per frame and the scan timings against the budgets. The
test library gains a long title that sorts first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Status at 15 Hz while playing; unchanged statuses skipped (P3a)

- **Controller:** `poll()` steps only when `media.status()` returns a different object than the state holds (Task 4 makes unchanged replies the same object), so `onChange` no longer fires every frame.
- **Session:** the player signal compares queue, order, index, shuffle, repeat, serial and failures (`samePlayer`). While a song plays it reads status every `POLL_EVERY` (4) frames. A command (`pollNext`) or a failed read reads on the next frame regardless.

**Files:**
- Modify: `app/player/controller.ts`, `app/session.ts`
- Test: `tests/controller.test.ts`, `tests/app.test.ts`

**Interfaces:** produces `export const POLL_EVERY = 4` (`app/session.ts`).

- [ ] **Step 1: Write the failing tests.** `git apply --include='tests/*' $TMPDIR/t9.patch`.
- [ ] **Step 2: Watch them fail.** `bun test --conditions=browser tests/controller.test.ts tests/app.test.ts` → **34 pass, 2 fail**:
  - `Expected: 1, Received: 6` (every poll fired `onChange`);
  - `Expected: <= 16, Received: 60` (status read every frame).
- [ ] **Step 3: Implement.** `git apply --exclude='tests/*' $TMPDIR/t9.patch`:

```diff
diff --git a/app/player/controller.ts b/app/player/controller.ts
index 0540110ebb2ccf0ae0cd3c3a30788afd1b62cb9b..618721e9035c62093580c4c3d9f3bd7217de00c9 100644
--- a/app/player/controller.ts
+++ b/app/player/controller.ts
@@ -58,6 +58,10 @@ export function createPlayerController(
   return {
     state: () => state,
     dispatch: step,
-    poll: () => step({ type: "hostStatus", status: media.status() }),
+    // An unchanged status (the SDK returns the same object) changes nothing: skip the step.
+    poll: () => {
+      const status = media.status();
+      if (status !== state.status) step({ type: "hostStatus", status });
+    },
   };
 }
diff --git a/app/session.ts b/app/session.ts
index e090251527f7c68953b207218971b9c97c90ccd1..a69dd9382cd3e2394c79da86536f78a6d8edb02d 100644
--- a/app/session.ts
+++ b/app/session.ts
@@ -46,9 +46,19 @@ function composed(track: LocalTrack): LocalTrack {
   return { ...track, title: composeMarks(track.title), artist: composeMarks(track.artist), album: composeMarks(track.album) };
 }
 
+/** Frames between status reads while a song plays (15 Hz at 60 fps). */
+export const POLL_EVERY = 4;
+
+function samePlayer(a: PlayerState, b: PlayerState): boolean {
+  return a.queue === b.queue && a.order === b.order && a.index === b.index && a.shuffle === b.shuffle
+    && a.repeat === b.repeat && a.serial === b.serial && a.failures === b.failures;
+}
+
 export function createSession(media: LocalMedia | null = connect()): Session {
   const [library, setLibrary] = createSignal<Library | null>(null);
-  const [player, setPlayer] = createSignal<PlayerState>(initialPlayer(), { equals: false });
+  // The status inside the player state changes every frame of playback; screens read it from
+  // `status`, so the player signal only fires when the queue or its position in it changes.
+  const [player, setPlayer] = createSignal<PlayerState>(initialPlayer(), { equals: samePlayer });
   const [status, setStatus] = createSignal<LocalStatus>(IDLE_STATUS);
   const [scanning, setScanning] = createSignal(media !== null);
   // Two kinds of bad host reply: a status read (cleared by the next good poll) and a
@@ -62,6 +72,8 @@ export function createSession(media: LocalMedia | null = connect()): Session {
   // The id whose cover is shown or requested, and whether its request resolved.
   let coverFor = -1;
   let coverResolved = true;
+  // Read the status on the next frame regardless of the playing cadence (after a command).
+  let pollNext = true;
 
   if (media) {
     controller = createPlayerController(media, { onChange: setPlayer });
@@ -69,7 +81,13 @@ export function createSession(media: LocalMedia | null = connect()): Session {
     media.scan();
     // A frame that throws tears the guest down on the 3DS host, so a host
     // reply that does not validate becomes an on-screen error instead.
+    let frame = 0;
     onFrame(() => {
+      // While a song plays only its position moves from frame to frame: every POLL_EVERY frames
+      // is enough for the time labels and the seek bar (commands re-read the status at once).
+      frame++;
+      if (status().phase === "playing" && !pollNext && !statusFailed() && frame % POLL_EVERY !== 0) return;
+      pollNext = false;
       let now: LocalStatus;
       try {
         controller!.poll();
@@ -143,6 +161,7 @@ export function createSession(media: LocalMedia | null = connect()): Session {
     coverLoading,
     // A command re-reads status; a reply that fails validation must not throw out of the frame.
     dispatch: (action) => {
+      pollNext = true;
       try {
         controller?.dispatch(action);
       } catch {
diff --git a/tests/app.test.ts b/tests/app.test.ts
index a9d217c8c0ecd5f8020f0dfde6377d42930bfc05..16ebb92f34df3bbb9a602675b46ff818c75e928f 100644
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -95,6 +95,25 @@ test("A plays the focused song; Now Playing shows it; the visible list is the qu
   expect(opens(rig.host)).toEqual(["open(7)", "open(16)"]);
 }, 120_000);
 
+test("while a song plays the status is read every fourth frame, and at once after a command", async () => {
+  const host = createSimLocalMedia(LIBRARY);
+  let reads = 0;
+  const rig = { host, world: await bootApp({ localmedia: { ...host.ns, status: () => (reads++, host.ns.status()) } }) };
+  frames(rig, 4);
+  press(rig, A);
+  frames(rig, 4);
+  reads = 0;
+  frames(rig, 60);
+  expect(reads).toBeGreaterThanOrEqual(15);
+  expect(reads).toBeLessThanOrEqual(16);
+  reads = 0;
+  frames(rig, 1, { buttons: BTN.START }); // pause: the command reads the status itself
+  const afterCommand = reads;
+  frames(rig, 1);
+  expect(afterCommand).toBeGreaterThanOrEqual(1);
+  expect(reads).toBeGreaterThan(afterCommand); // and the next frame polls regardless of the cadence
+}, 120_000);
+
 test("tabs do not wrap; drilling into an artist and backing out restores the focused row", async () => {
   const rig = await boot();
   press(rig, BTN.LTRIGGER);
diff --git a/tests/controller.test.ts b/tests/controller.test.ts
index c8d67a5b8bbbad1198d35b81b8f7421139d1e691..2e66e569b08dd87826400fe9ce1914d7d835fa1b 100644
--- a/tests/controller.test.ts
+++ b/tests/controller.test.ts
@@ -118,3 +118,15 @@ test("repeat one replays once even when the host reports the previous end after
   expect(opens()).toBe(2);
   expect(player.state().status).toMatchObject({ trackId: 0, phase: "playing", openSerial: 2 });
 });
+
+test("a poll that reads the same status object changes nothing; a new status reaches onChange", () => {
+  const { host, player, changes } = setup([song("a.mp3")]);
+  player.poll();
+  const settled = changes.length;
+  for (let i = 0; i < 5; i++) player.poll(); // the host clock stands still: the SDK returns the same object
+  expect(changes.length).toBe(settled);
+  player.dispatch({ type: "playFrom", ids: [0], startId: 0 });
+  host.advance(100);
+  player.poll();
+  expect(changes.length).toBe(settled + 2); // the dispatch, then the poll that saw playback move
+});
```

- [ ] **Step 4: Run them.** `bun run test` → **120 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git add app/session.ts app/player/controller.ts tests/controller.test.ts tests/app.test.ts
git commit -m "perf(player): read status at 15 Hz while playing; skip unchanged statuses

A poll whose status object is the previous one changes nothing, so onChange
no longer fires every frame. While a song plays the session reads status
every fourth frame (commands and failed reads still read at once), and the
player signal ignores status-only changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Artists and albums by key; a text-width cache

**Files:**
- Create: `app/theme/measure.ts`
- Modify: `app/library/library.ts`, `app/theme/parts/marquee.tsx`
- Test: `tests/library.test.ts`, `tests/marquee.test.ts`

**Interfaces:** produces `Library.artistByKey: Map<string, Artist>`, `Library.albumByKey: Map<string, Album>` (used by Task 11's `model.ts`); `measureCache(measure, max = 512)`.

- [ ] **Step 1: Write the failing tests.** `git apply --include='tests/*' $TMPDIR/t10.patch`.
- [ ] **Step 2: Watch them fail.** `bun test --conditions=browser tests/library.test.ts tests/marquee.test.ts` → **9 pass, 2 fail** (`artists and albums are found by key`; `Cannot find module '../app/theme/measure.ts'`).
- [ ] **Step 3: Implement.** `git apply --exclude='tests/*' $TMPDIR/t10.patch`:

```diff
diff --git a/app/library/library.ts b/app/library/library.ts
index d2722f009273e4b5fbca9548991003fe63bf71aa..d37884b41077adf5b1fc3725a629fcaa637c7b2d 100644
--- a/app/library/library.ts
+++ b/app/library/library.ts
@@ -3,7 +3,15 @@ import { normalize } from "./normalize.ts";
 
 export interface Artist { key: string; name: string; trackIds: number[] }
 export interface Album { key: string; name: string; artist: string; trackIds: number[] }
-export interface Library { tracks: Map<number, LocalTrack>; songs: number[]; artists: Artist[]; albums: Album[] }
+export interface Library {
+  tracks: Map<number, LocalTrack>;
+  songs: number[];
+  artists: Artist[];
+  albums: Album[];
+  /** Lookups by key, so a row renders without a search. */
+  artistByKey: Map<string, Artist>;
+  albumByKey: Map<string, Album>;
+}
 
 export type View =
   | { kind: "songs" } | { kind: "artists" } | { kind: "albums" }
@@ -61,7 +69,7 @@ export function buildLibrary(input: readonly LocalTrack[]): Library {
   const artists = [...artistMap.values()].sort((a, b) => compare(a.key, b.key));
   for (const artist of artists) artist.trackIds.sort((a, b) => albumRank.get(a)! - albumRank.get(b)! || byAlbumTrack(a, b));
 
-  return { tracks, songs: [...tracks.keys()].sort(byTitle), artists, albums };
+  return { tracks, songs: [...tracks.keys()].sort(byTitle), artists, albums, artistByKey: artistMap, albumByKey: albumMap };
 }
 
 function songMatches(track: LocalTrack, query: string): boolean {
@@ -80,8 +88,8 @@ export function rows(library: Library, view: View, query: string): Row[] {
     case "albums":
       return library.albums.filter((a) => q === "" || normalize(a.name).includes(q)).map((a) => ({ kind: "album", key: a.key }));
     case "artist":
-      return songs(library.artists.find((a) => a.key === view.key)?.trackIds ?? []);
+      return songs(library.artistByKey.get(view.key)?.trackIds ?? []);
     case "album":
-      return songs(library.albums.find((a) => a.key === view.key)?.trackIds ?? []);
+      return songs(library.albumByKey.get(view.key)?.trackIds ?? []);
   }
 }
diff --git a/app/theme/measure.ts b/app/theme/measure.ts
new file mode 100644
index 0000000000000000000000000000000000000000..999256eae7b830031fb7ae561d3d4517ebca9fac
--- /dev/null
+++ b/app/theme/measure.ts
@@ -0,0 +1,16 @@
+// Text-width caching for the marquee.
+
+/** Caches `measure` by font slot and text, dropping the oldest entry past `max`. */
+export function measureCache(measure: (text: string, slot: number) => number, max = 512): (text: string, slot: number) => number {
+  const widths = new Map<string, number>();
+  return (text, slot) => {
+    const key = `${slot}\u0000${text}`;
+    let width = widths.get(key);
+    if (width === undefined) {
+      width = measure(text, slot);
+      if (widths.size >= max) widths.delete(widths.keys().next().value!);
+      widths.set(key, width);
+    }
+    return width;
+  };
+}
diff --git a/app/theme/parts/marquee.tsx b/app/theme/parts/marquee.tsx
index 6d8719246490ea0ff50cc10100d310e6b7c5bcee..9973a4e01940030f4baa367f87810c8b694e3556 100644
--- a/app/theme/parts/marquee.tsx
+++ b/app/theme/parts/marquee.tsx
@@ -7,6 +7,10 @@ import { Text, View } from "@pocketjs/framework/components";
 import { onFrame } from "@pocketjs/framework/lifecycle";
 import { virtualFrame } from "@pocketjs/framework/clock";
 import { marqueeOffset } from "../geometry.ts";
+import { measureCache } from "../measure.ts";
+
+/** measureText results: rows rebinding their titles reuse them. */
+const measured = measureCache((text, slot) => getOps().measureText(text, slot));
 
 export function Marquee(props: {
   text: string;
@@ -16,15 +20,17 @@ export function Marquee(props: {
   slot: number;
   /** Box width in px. */
   width: number;
+  /** Scrolls only while active; an inactive marquee is plain clipped text and never measures. */
   active?: boolean;
 }) {
-  const textWidth = createMemo(() => getOps().measureText(props.text, props.slot));
+  const live = () => props.active ?? true;
+  const textWidth = createMemo(() => (live() ? measured(props.text, props.slot) : 0));
   const overflow = () => Math.max(0, Math.ceil(textWidth() - props.width));
   const [start, setStart] = createSignal(virtualFrame());
   createEffect(on(() => [props.text, props.active] as const, () => setStart(virtualFrame()), { defer: true }));
   const [offset, setOffset] = createSignal(0);
   onFrame(() => {
-    const next = overflow() > 0 && (props.active ?? true) ? marqueeOffset(virtualFrame() - start(), overflow()) : 0;
+    const next = live() && overflow() > 0 ? marqueeOffset(virtualFrame() - start(), overflow()) : 0;
     if (next !== offset()) setOffset(next);
   });
   return (
diff --git a/tests/library.test.ts b/tests/library.test.ts
index f71162e96ba3bb5e4db728fab3b45e1b44fae86e..03c302dcc4a004b8c040541fb1a5b722c31a6434 100644
--- a/tests/library.test.ts
+++ b/tests/library.test.ts
@@ -76,3 +76,11 @@ test("normalize strips decomposed accents and folds the rest of Latin Extended-A
   expect(ids(rows(library, { kind: "songs" }, "hoppipolla"))).toEqual([0]);
   expect(ids(rows(library, { kind: "artists" }, "sigur ros"))).toEqual(["sigur ros"]);
 });
+
+test("artists and albums are found by key", () => {
+  const library = buildLibrary(TRACKS);
+  for (const artist of library.artists) expect(library.artistByKey.get(artist.key)).toBe(artist);
+  for (const album of library.albums) expect(library.albumByKey.get(album.key)).toBe(album);
+  expect(library.artistByKey.size).toBe(library.artists.length);
+  expect(library.albumByKey.size).toBe(library.albums.length);
+});
diff --git a/tests/marquee.test.ts b/tests/marquee.test.ts
index 033227a9bfdd89c9e4fe3a1637307abf0a0d9520..f2d4d79781f250f5d8cb49d7f6ec6f84875e302b 100644
--- a/tests/marquee.test.ts
+++ b/tests/marquee.test.ts
@@ -1,9 +1,28 @@
 import { expect, test } from "bun:test";
 import { fontSlotFor } from "../runtime/framework/compiler/tailwind.ts";
 import { FONT_12, FONT_12_BOLD, FONT_16_BOLD } from "../app/theme/fonts.ts";
+import { measureCache } from "../app/theme/measure.ts";
 
 test("the marquee's font slots are the ones the build assigns to its text classes", () => {
   expect(FONT_12).toBe(fontSlotFor(12, false));
   expect(FONT_12_BOLD).toBe(fontSlotFor(12, true));
   expect(FONT_16_BOLD).toBe(fontSlotFor(16, true));
 });
+
+test("text widths are measured once per slot and text, and the cache stays bounded", () => {
+  const asked: string[] = [];
+  const measure = measureCache((text, slot) => {
+    asked.push(`${slot}:${text}`);
+    return text.length * 10 + slot;
+  }, 3);
+  expect(measure("ab", 1)).toBe(21);
+  expect(measure("ab", 1)).toBe(21);
+  expect(measure("ab", 2)).toBe(22); // another slot is another width
+  expect(asked).toEqual(["1:ab", "2:ab"]);
+  measure("c", 1);
+  measure("d", 1); // a fourth entry drops the oldest ("1:ab")
+  measure("ab", 2);
+  expect(asked).toHaveLength(4);
+  measure("ab", 1);
+  expect(asked.at(-1)).toBe("1:ab");
+});
```

- [ ] **Step 4: Run them.** `bun run test` → **122 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git add app/library/library.ts app/theme/measure.ts app/theme/parts/marquee.tsx tests/library.test.ts tests/marquee.test.ts
git commit -m "perf(explorer): find artists and albums by key; cache text widths

buildLibrary keeps artistByKey and albumByKey maps, so a row renders without
a search. Marquee widths come from a bounded cache by font slot and text, and
an inactive marquee never measures.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 11: The Explorer: recycled rows, a selection overlay, settled state

What the prototype's measurements led to (spec §11.2):
- **`RecycledList`:** a fixed, even pool of row slots. Slot k shows the row congruent to k modulo the pool, so scrolling one row rebinds one slot, and the list moves by a transform.
- **The selection overlay:** the selected row is drawn once above the list and moved by a transform; rows ignore focus.
- **`settled()`:** values derived from the Explorer state are signals set by one computation with an equality, so a write reaches only readers whose value changed.
- **An empty root `FocusScope`:** keeps the framework's D-pad traversal from walking the list's nodes.
- **Unit tests run with the browser condition,** so Solid is reactive in them.

**Files:**
- Create: `app/reactive.ts`, `app/explorer/window.ts`, `app/explorer/recycled-list.tsx`
- Modify: `app/explorer/explorer.tsx`, `app/explorer/model.ts`, `app/app.tsx`, `package.json`
- Test: create `tests/reactive.test.ts`, `tests/recycled-list.test.ts`; modify `tests/app.test.ts` (an op-counting wrapper on the sim's `ui` object)

**Interfaces:**
- Consumes: Task 10's key maps.
- Produces: `settled<T>(fn, equals = Object.is): Accessor<T>`; `slotIndex(slot, top, n)`, `nearestTop(previous, focus, rows, count)`; `RecycledList` props `{ count, rowHeight, rows, top, slot(index: Accessor<number>, slot: number) }`; `headerOfView(view)`, `rowCellsIn(library, view, row)`, `crumbOfView(library, view)` in `model.ts`.

- [ ] **Step 1: Write the failing tests.** `git apply --include='tests/*' --include=package.json $TMPDIR/t11.patch`.
- [ ] **Step 2: Watch them fail.** `bun run test` → **122 pass, 3 fail**:
  - `Cannot find module '../app/reactive.ts'` and `'../app/explorer/window.ts'`;
  - the op-count test: `Expected length: 0, Received length: 29` (a focus move rebuilt rows).
- [ ] **Step 3: Implement.** `git apply --exclude='tests/*' --exclude=package.json $TMPDIR/t11.patch`:

```diff
diff --git a/app/app.tsx b/app/app.tsx
index ab4d8469fbcd0950d550a7a40adbb809b7db31ff..89eb9e9d727b535c42eff8f73bd3bc597f45b06a 100644
--- a/app/app.tsx
+++ b/app/app.tsx
@@ -1,7 +1,7 @@
 // Ds Man — a walkman-style MP3 player. The top screen is the Explorer; the
 // bottom screen is Now Playing, or the search keyboard while it is open.
 import { Show } from "solid-js";
-import { AuxiliarySurface, View } from "@pocketjs/framework/components";
+import { AuxiliarySurface, FocusScope, View } from "@pocketjs/framework/components";
 import { BTN } from "@pocketjs/framework/input";
 import { onButtonPress } from "@pocketjs/framework/lifecycle";
 import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
@@ -20,6 +20,9 @@ export default function App() {
   onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
   return (
     <>
+      {/* The app moves its own focus; this empty scope keeps the framework's d-pad traversal
+          from walking the whole tree on every press (the keyboard pushes its own scope). */}
+      <FocusScope class="absolute left-[0] top-[0] w-[0] h-[0]" />
       <Explorer session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
       <AuxiliarySurface>
         {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Show> renders once). */}
diff --git a/app/explorer/explorer.tsx b/app/explorer/explorer.tsx
index 2e7805f28a34dbba21110bbf6625f7ea31b20653..90b3788f245d0517709914fc87ed7e6113260758 100644
--- a/app/explorer/explorer.tsx
+++ b/app/explorer/explorer.tsx
@@ -1,11 +1,10 @@
 // The top screen: Toolbar, search strip / breadcrumb, column header, the
-// library list (app-owned focus over a VirtualList) and the footer legend.
+// library list (app-owned focus over a pool of recycled rows) and the footer legend.
 // Model logic lives in model.ts; this file renders it and maps buttons.
 import { createEffect, createMemo, createSignal, on, Show, untrack, type Accessor } from "solid-js";
 import { View } from "@pocketjs/framework/components";
 import { BTN } from "@pocketjs/framework/input";
 import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
-import { VirtualList, type VirtualListHandle } from "@pocketjs/framework/virtual-list";
 import { onAnalogRows, onRepeat, onTapOrHold } from "../input.ts";
 import { SHOULDERS_UP, stepShoulders } from "../input-timing.ts";
 import { currentId } from "../player/reducer.ts";
@@ -14,12 +13,16 @@ import { AQUA } from "../theme/aqua.ts";
 import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
 import { StatePanel } from "../theme/parts/panels.tsx";
 import { Breadcrumb, FooterLegend, SearchStrip } from "../theme/parts/strips.tsx";
+import { RecycledList } from "./recycled-list.tsx";
+import { nearestTop } from "./window.ts";
+import { settled } from "../reactive.ts";
 import { Toolbar } from "../theme/parts/toolbar.tsx";
 import type { RowKind } from "../theme/theme.ts";
 import {
-  crumbOf, focusOf, headerOf, initialExplorer, lcdLine, legendOf, reduceExplorer, rowCells, rowsKey, visibleRows, visibleSongIds,
-  type ExplorerAction, type ExplorerState,
+  crumbOfView, currentView, focusOf, headerOfView, initialExplorer, lcdLine, legendOf, reduceExplorer, rowCellsIn, rowsKey, viewKey,
+  visibleRows, visibleSongIds, type ExplorerAction, type ExplorerState,
 } from "./model.ts";
+import type { LegendItem } from "../theme/parts/strips.tsx";
 
 export interface ExplorerStore {
   state: Accessor<ExplorerState>;
@@ -45,7 +48,9 @@ export function Explorer(props: { session: Session; store: ExplorerStore; search
   const active = () => !props.searching();
 
   // The rows depend on the library, view and query, not on focus: moving focus must not rebuild them.
-  const key = createMemo(() => rowsKey(state()));
+  // Every press writes the state; the values below are settled (see settled()), so a write only
+  // reaches the screen through the ones that actually changed.
+  const key = settled(() => rowsKey(state()));
   const rows = createMemo(() => {
     key();
     const lib = library();
@@ -53,16 +58,24 @@ export function Explorer(props: { session: Session; store: ExplorerStore; search
   });
   // A rescan can remove the artist or album a tab is drilled into.
   createEffect(on(library, (lib) => lib && dispatch({ type: "reconcile", library: lib }), { defer: true }));
+  // Focus moves replace the state object on every press; what the screen shows mostly depends on
+  // the view, so these memos only change with it (and the rows only rebuild their cells then).
+  const view = settled(() => currentView(state()), (a, b) => viewKey(a) === viewKey(b));
+  const tab = settled(() => state().tab);
+  const query = settled(() => state().query);
+  const header = createMemo(() => headerOfView(view()));
   const crumb = createMemo(() => {
     const lib = library();
-    return lib ? crumbOf(lib, state()) : null;
+    return lib ? crumbOfView(lib, view()) : null;
   });
   const hasSongs = () => (library()?.tracks.size ?? 0) > 0;
-  const strips = () => (state().query ? 1 : 0) + (crumb() ? 1 : 0);
+  const legend = settled<LegendItem[]>(() => legendOf(state(), hasSongs()),
+    (a, b) => a.length === b.length && a.every((item, i) => item.key === b[i]!.key && item.label === b[i]!.label));
+  const strips = () => (query() ? 1 : 0) + (crumb() ? 1 : 0);
   const bodyPx = () => BODY_PX - strips() * ROW_PX;
   const page = () => Math.floor(bodyPx() / ROW_PX);
   // Focus can sit past the end after the rows shrink (a rescan); clamp where it is used.
-  const focus = () => Math.min(focusOf(state()), Math.max(0, rows().length - 1));
+  const focus = settled(() => Math.min(focusOf(state()), Math.max(0, rows().length - 1)));
   const playingId = createMemo(() => currentId(props.session.player()));
 
   // --- input ---------------------------------------------------------------
@@ -105,20 +118,30 @@ export function Explorer(props: { session: Session; store: ExplorerStore; search
   onTapOrHold(BTN.TRIANGLE, () => (hasSongs() ? props.openSearch() : props.session.rescan()), () => props.session.rescan(), active);
 
   // --- list ----------------------------------------------------------------
-  const [handle, setHandle] = createSignal<VirtualListHandle | null>(null);
-  createEffect(() => {
-    const list = handle();
-    if (list && rows().length > 0) list.scrollToIndex(focus(), "nearest", false);
-  });
+  // The first row in the window: the least scrolling that keeps the focused row visible.
+  let previousTop = 0;
+  const top = settled(() => (previousTop = nearestTop(previousTop, focus(), page(), rows().length)));
   const thumb = createMemo(() => {
     const content = rows().length * ROW_PX;
     const view = bodyPx();
     if (content <= view) return null;
     const height = Math.max(16, Math.round((view * view) / content));
-    const offset = handle()?.scroller.offset() ?? 0;
+    const offset = top() * ROW_PX;
     return { top: Math.round((offset / (content - view)) * (view - height)), height };
   });
-  const kindAt = (index: number): RowKind => (index === focus() ? "selected" : index % 2 === 0 ? "odd" : "even");
+  // List rows keep their stripe; the focused row is drawn by one overlay row on top of them, so a
+  // focus move restyles nothing in the list (it moves the overlay and rebinds its three texts).
+  const kindAt = (index: number): RowKind => (index % 2 === 0 ? "odd" : "even");
+  const cellsAt = (index: number) => {
+    const r = rows()[index];
+    const lib = library();
+    return r && lib ? rowCellsIn(lib, view(), r) : { title: "", detail: "", count: false };
+  };
+  const isPlaying = (index: number) => {
+    const r = rows()[index];
+    return r?.kind === "song" && r.id === playingId();
+  };
+  const focusCells = createMemo(() => cellsAt(focus()));
 
   const panel = () => {
     if (!props.session.available) return { title: UNAVAILABLE, lines: ["This build has no media.local module."] };
@@ -130,48 +153,50 @@ export function Explorer(props: { session: Session; store: ExplorerStore; search
 
   return (
     <View class={AQUA.topScreen}>
-      <Toolbar title="Ds Man" line={lcdLine(props.session.available, props.session.scanning(), library())} active={state().tab} />
+      <Toolbar title="Ds Man" line={lcdLine(props.session.available, props.session.scanning(), library())} active={tab()} />
       <Show when={panel()} fallback={
         <>
-          <Show when={state().query}>
-            <SearchStrip query={state().query} count={rows().length} />
+          <Show when={query()}>
+            <SearchStrip query={query()} count={rows().length} />
           </Show>
           <Show when={crumb()}>{(c) => <Breadcrumb root={c().root} leaf={c().leaf} detail={c().detail} />}</Show>
-          <ColumnHeader left={headerOf(state()).left} right={headerOf(state()).right} lead={headerOf(state()).lead} count={headerOf(state()).count} />
+          <ColumnHeader left={header().left} right={header().right} lead={header().lead} count={header().count} />
           <View class={AQUA.listBody}>
-            <Show when={rows().length > 0} fallback={<StatePanel title="No matches" lines={[`Nothing here matches "${state().query}"`]} />}>
-            <VirtualList
+            <Show when={rows().length > 0} fallback={<StatePanel title="No matches" lines={[`Nothing here matches "${query()}"`]} />}>
+            <RecycledList
               count={rows().length}
               rowHeight={ROW_PX}
-              height={bodyPx()}
-              focusRows={false}
-              // The Explorer moves focus and scrolls itself; the list's own d-pad scrolling would
-              // run on top of it while a direction is held (the top screen has no touch).
-              inputActive={() => false}
-              ref={setHandle}
-              renderRow={(index) => {
-                // Rows can shrink under a mounted row (search, rescan) before it unmounts; every read is null-safe.
-                const row = () => rows()[index];
-                const cells = () => {
-                  const r = row();
-                  const lib = library();
-                  return r && lib ? rowCells(lib, state(), r) : { title: "", detail: "", count: false };
-                };
+              rows={page()}
+              top={top()}
+              slot={(index, slot) => {
+                // Rows can shrink under a slot (search, rescan) before the pool does; every read is null-safe.
+                const row = () => rows()[index()];
+                const cells = createMemo(() => cellsAt(index()));
                 return (
                   <Show when={row()}>
                     <ListRow
-                      kind={kindAt(index)}
+                      kind={kindAt(slot)}
                       title={cells().title}
                       detail={cells().detail}
                       lead={cells().lead}
                       count={cells().count}
-                      playing={row()?.kind === "song" && (row() as { id: number }).id === playingId()}
-                      marquee={index === focus()}
+                      playing={isPlaying(index())}
                     />
                   </Show>
                 );
               }}
             />
+            <View class="absolute left-[0] top-[0] w-full h-[21]" style={{ translateY: (focus() - top()) * ROW_PX }}>
+              <ListRow
+                kind="selected"
+                title={focusCells().title}
+                detail={focusCells().detail}
+                lead={focusCells().lead}
+                count={focusCells().count}
+                playing={isPlaying(focus())}
+                marquee
+              />
+            </View>
             <Show when={thumb()}>{(t) => <Scrollbar thumbTop={t().top} thumbHeight={t().height} />}</Show>
             </Show>
           </View>
@@ -179,7 +204,7 @@ export function Explorer(props: { session: Session; store: ExplorerStore; search
       }>
         {(p) => <StatePanel title={p().title} lines={p().lines} />}
       </Show>
-      <FooterLegend items={legendOf(state(), hasSongs())} />
+      <FooterLegend items={legend()} />
     </View>
   );
 }
diff --git a/app/explorer/model.ts b/app/explorer/model.ts
index 16ef65fd36257b05403641072d5b916188ce443e..89108eae0f56510b7d88c0118df924f491dc9b04 100644
--- a/app/explorer/model.ts
+++ b/app/explorer/model.ts
@@ -126,7 +126,10 @@ export interface HeaderSpec {
 }
 
 export function headerOf(state: ExplorerState): HeaderSpec {
-  const view = currentView(state);
+  return headerOfView(currentView(state));
+}
+
+export function headerOfView(view: View): HeaderSpec {
   switch (view.kind) {
     case "songs":
       return { left: "Song Name", right: "Artist", count: false };
@@ -151,16 +154,20 @@ export interface RowCells {
 }
 
 export function rowCells(library: Library, state: ExplorerState, row: Row): RowCells {
+  return rowCellsIn(library, currentView(state), row);
+}
+
+/** A row's cells in a view: the view (not the focus) is all a row's text depends on. */
+export function rowCellsIn(library: Library, view: View, row: Row): RowCells {
   if (row.kind === "artist") {
-    const artist = library.artists.find((a) => a.key === row.key)!;
+    const artist = library.artistByKey.get(row.key)!;
     return { title: artist.name, detail: String(artist.trackIds.length), count: true };
   }
   if (row.kind === "album") {
-    const album = library.albums.find((a) => a.key === row.key)!;
+    const album = library.albumByKey.get(row.key)!;
     return { title: album.name, detail: album.artist, count: false };
   }
   const track = library.tracks.get(row.id)!;
-  const view = currentView(state);
   if (view.kind === "artist") return { title: track.title, detail: track.album, count: false };
   if (view.kind === "album") return { title: track.title, detail: formatTime(track.durationMs), lead: track.track > 0 ? String(track.track) : "", count: false };
   return { title: track.title, detail: track.artist, count: false };
@@ -175,13 +182,16 @@ export interface CrumbSpec {
 const songsLabel = (n: number) => `${n} ${n === 1 ? "song" : "songs"}`;
 
 export function crumbOf(library: Library, state: ExplorerState): CrumbSpec | null {
-  const view = currentView(state);
+  return crumbOfView(library, currentView(state));
+}
+
+export function crumbOfView(library: Library, view: View): CrumbSpec | null {
   if (view.kind === "artist") {
-    const artist = library.artists.find((a) => a.key === view.key);
+    const artist = library.artistByKey.get(view.key);
     return artist ? { root: "Artists", leaf: artist.name, detail: songsLabel(artist.trackIds.length) } : null;
   }
   if (view.kind === "album") {
-    const album = library.albums.find((a) => a.key === view.key);
+    const album = library.albumByKey.get(view.key);
     return album ? { root: "Albums", leaf: album.name, detail: `${album.artist} · ${songsLabel(album.trackIds.length)}` } : null;
   }
   return null;
diff --git a/app/explorer/recycled-list.tsx b/app/explorer/recycled-list.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..a3972345b61dbbf743055008191f22270c53b93c
--- /dev/null
+++ b/app/explorer/recycled-list.tsx
@@ -0,0 +1,50 @@
+// The Explorer's list: a fixed pool of row slots over a window of the rows.
+// Slot k always shows the row whose index is congruent to k modulo the pool
+// size, so scrolling one row rebinds one slot (its texts and its top) and
+// moves the list by a transform; no row is created or destroyed while the
+// list scrolls. The Explorer owns focus and the scroll position (`top`).
+import { createComputed, createMemo, createSignal, Index, Show, type Accessor, type JSX, type Setter } from "solid-js";
+import { View } from "@pocketjs/framework/components";
+import { slotIndex } from "./window.ts";
+
+export function RecycledList(props: {
+  count: number;
+  rowHeight: number;
+  /** Rows the window shows (the body height in rows). */
+  rows: number;
+  /** Index of the first row in the window. */
+  top: number;
+  /** Renders slot `slot` (constant), which shows row `index()`; with the even pool, `index()`
+   * always has the parity of `slot`. */
+  slot: (index: Accessor<number>, slot: number) => JSX.Element;
+}) {
+  // At least one extra slot, so a row entering the window never shares a slot with one still
+  // showing, rounded up to even: a slot's rows then all have the same parity, so its stripe never
+  // changes when it rebinds.
+  const pool = createMemo(() => Math.min(props.count, props.rows + 1 + ((props.rows + 1) % 2)));
+  const slots = createMemo(() => Array.from({ length: pool() }, (_, k) => k));
+  // One signal per slot, set by a single computation: scrolling one row changes one slot's
+  // index, and only that slot hears about it.
+  const indices: [Accessor<number>, Setter<number>][] = [];
+  const slotSignal = (k: number) => (indices[k] ??= createSignal(slotIndex(k, props.top, Math.max(1, pool()))));
+  createComputed(() => {
+    const n = pool(), top = props.top;
+    for (let k = 0; k < n; k++) slotSignal(k)[1](slotIndex(k, top, n));
+  });
+  return (
+    <View class="absolute left-[0] top-[0] w-full" style={{ translateY: -props.top * props.rowHeight }}>
+      <Index each={slots()}>
+        {(slot) => {
+          const index = slotSignal(slot())[0];
+          return (
+            <Show when={index() < props.count}>
+              <View class="absolute left-[0] w-full" style={{ insetT: index() * props.rowHeight, height: props.rowHeight }}>
+                {props.slot(index, slot())}
+              </View>
+            </Show>
+          );
+        }}
+      </Index>
+    </View>
+  );
+}
diff --git a/app/explorer/window.ts b/app/explorer/window.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f19afb12b9d1ae31080d045f4242dc72cb97081f
--- /dev/null
+++ b/app/explorer/window.ts
@@ -0,0 +1,15 @@
+// The Explorer list's window arithmetic (RecycledList, the Explorer's scroll position).
+
+/** The row index slot `slot` shows for a window starting at `top` in a pool of `n` slots. */
+export function slotIndex(slot: number, top: number, n: number): number {
+  return top + ((((slot - top) % n) + n) % n);
+}
+
+/** The `top` that keeps `focus` in a window of `rows` with the least movement from `previous`. */
+export function nearestTop(previous: number, focus: number, rows: number, count: number): number {
+  const max = Math.max(0, count - rows);
+  let top = Math.min(Math.max(0, previous), max);
+  if (focus < top) top = focus;
+  else if (focus >= top + rows) top = focus - rows + 1;
+  return Math.min(Math.max(0, top), max);
+}
diff --git a/app/reactive.ts b/app/reactive.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1ae61a1e196d8284c62431baf78208aacb1b53a0
--- /dev/null
+++ b/app/reactive.ts
@@ -0,0 +1,18 @@
+// Reactive helpers for hot paths.
+import { createComputed, createSignal, untrack, type Accessor } from "solid-js";
+
+/**
+ * A value derived from a frequently-written source, behind a firewall. A memo's readers are
+ * marked stale whenever any of its sources is written, before Solid knows the memo's value is
+ * unchanged, so a big reader graph pays for every write. A settled value is a signal set by one
+ * computation: writing the source re-runs only that computation, and readers hear about it only
+ * when `equals` says the value changed.
+ */
+export function settled<T>(fn: () => T, equals: (a: T, b: T) => boolean = Object.is): Accessor<T> {
+  const [value, setValue] = createSignal<T>(untrack(fn), { equals });
+  createComputed(() => {
+    const next = fn();
+    setValue(() => next);
+  });
+  return value;
+}
diff --git a/package.json b/package.json
index af34b74861280f92829584d6888abfaf6db62082..0c7773b648aaa2e9e7173b7c9b67c40dbd37b373 100644
--- a/package.json
+++ b/package.json
@@ -8,7 +8,7 @@
     "test-library": "bun scripts/make-test-library.ts",
     "perf": "bun scripts/perf.ts",
     "check": "bun runtime/node_modules/typescript/bin/tsc --noEmit",
-    "test": "bun test ./tests",
+    "test": "bun test --conditions=browser ./tests",
     "gallery": "bun scripts/gallery.ts"
   }
 }
diff --git a/tests/app.test.ts b/tests/app.test.ts
index 16ebb92f34df3bbb9a602675b46ff818c75e928f..d0860f3b33a0cb392b106134ab42795ab3fcd0e1 100644
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -95,6 +95,37 @@ test("A plays the focused song; Now Playing shows it; the visible list is the qu
   expect(opens(rig.host)).toEqual(["open(7)", "open(16)"]);
 }, 120_000);
 
+/** Records every host op the guest issues from now on (the sim's `ui` object, wrapped in place). */
+function recordOps(): { calls: string[]; stop(): void } {
+  const ui = (globalThis as unknown as { ui: Record<string, unknown> }).ui;
+  const calls: string[] = [];
+  const originals = new Map<string, (...args: unknown[]) => unknown>();
+  for (const [key, fn] of Object.entries(ui)) {
+    if (typeof fn !== "function" || key === "frame" || key.startsWith("debug") || key.startsWith("hitTest")) continue;
+    originals.set(key, fn as (...args: unknown[]) => unknown);
+    ui[key] = (...args: unknown[]) => {
+      calls.push(key);
+      return (fn as (...args: unknown[]) => unknown).apply(ui, args);
+    };
+  }
+  return { calls, stop: () => { for (const [key, fn] of originals) ui[key] = fn; } };
+}
+
+test("a focus move touches only the selection: no row is rebuilt, scrolling included", async () => {
+  const rig = await boot();
+  const ops = recordOps();
+  press(rig, BTN.DOWN); // focus moves within the page
+  const focusOps = [...ops.calls];
+  ops.calls.length = 0;
+  for (let i = 0; i < 8; i++) press(rig, BTN.DOWN); // past the page: the list scrolls a row at a time
+  const scrollOps = [...ops.calls];
+  ops.stop();
+  expect(focusOps.filter((op) => op === "createNode")).toHaveLength(0);
+  expect(focusOps.length).toBeLessThanOrEqual(4);
+  expect(scrollOps.filter((op) => op === "createNode")).toHaveLength(0);
+  expect(selectedRow(rig.world)).not.toBe("");
+}, 120_000);
+
 test("while a song plays the status is read every fourth frame, and at once after a command", async () => {
   const host = createSimLocalMedia(LIBRARY);
   let reads = 0;
diff --git a/tests/reactive.test.ts b/tests/reactive.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..771366671761dfa404d8e6f923899649077ffe11
--- /dev/null
+++ b/tests/reactive.test.ts
@@ -0,0 +1,40 @@
+import { expect, test } from "bun:test";
+import { createComputed, createRoot, createSignal } from "solid-js";
+import { settled } from "../app/reactive.ts";
+
+test("a settled value tells its readers only when it changes", () => {
+  createRoot((dispose) => {
+    const [source, setSource] = createSignal(1);
+    const parity = settled(() => source() % 2);
+    let runs = 0;
+    createComputed(() => {
+      parity();
+      runs++;
+    });
+    expect(runs).toBe(1);
+    setSource(3); // same parity
+    expect(runs).toBe(1);
+    expect(parity()).toBe(1);
+    setSource(4);
+    expect(runs).toBe(2);
+    expect(parity()).toBe(0);
+    dispose();
+  });
+});
+
+test("a settled value can compare by its own rule", () => {
+  createRoot((dispose) => {
+    const [source, setSource] = createSignal({ key: "a", n: 1 });
+    const view = settled(source, (a, b) => a.key === b.key);
+    let runs = 0;
+    createComputed(() => {
+      view();
+      runs++;
+    });
+    setSource({ key: "a", n: 2 });
+    expect(runs).toBe(1);
+    setSource({ key: "b", n: 2 });
+    expect(runs).toBe(2);
+    dispose();
+  });
+});
diff --git a/tests/recycled-list.test.ts b/tests/recycled-list.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..caf39b3d938f349d025941d0ff350f18b5716155
--- /dev/null
+++ b/tests/recycled-list.test.ts
@@ -0,0 +1,29 @@
+import { expect, test } from "bun:test";
+import { nearestTop, slotIndex } from "../app/explorer/window.ts";
+
+test("a pool's slots cover the window from top, each row once, and keep their parity", () => {
+  for (const n of [2, 4, 10]) {
+    for (let top = 0; top < 30; top++) {
+      const shown = Array.from({ length: n }, (_, slot) => slotIndex(slot, top, n));
+      expect([...shown].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => top + i));
+      shown.forEach((index, slot) => expect(index % 2).toBe(slot % 2)); // n is even
+    }
+  }
+});
+
+test("scrolling one row rebinds exactly one slot", () => {
+  const n = 10;
+  for (let top = 0; top < 20; top++) {
+    const changed = Array.from({ length: n }, (_, slot) => slotIndex(slot, top, n) !== slotIndex(slot, top + 1, n));
+    expect(changed.filter(Boolean)).toHaveLength(1);
+  }
+});
+
+test("the window moves only as far as the focus needs, and stays inside the rows", () => {
+  expect(nearestTop(0, 3, 8, 100)).toBe(0); // inside: no move
+  expect(nearestTop(0, 8, 8, 100)).toBe(1); // one below: one row
+  expect(nearestTop(10, 4, 8, 100)).toBe(4); // above: focus becomes the top row
+  expect(nearestTop(95, 99, 8, 100)).toBe(92); // never past the last full window
+  expect(nearestTop(50, 2, 8, 5)).toBe(0); // fewer rows than the window
+  expect(nearestTop(-3, 0, 8, 100)).toBe(0);
+});
```

- [ ] **Step 4: Run them.** `bun run check` → clean; `bun run test` → **128 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git add app/reactive.ts app/explorer/window.ts app/explorer/recycled-list.tsx app/explorer/explorer.tsx app/explorer/model.ts app/app.tsx package.json tests/app.test.ts tests/reactive.test.ts tests/recycled-list.test.ts
git commit -m "perf(explorer): recycled rows, a selection overlay and settled state

The list keeps a fixed pool of row slots and rebinds one slot per row
scrolled; the selected row is an overlay moved by a transform, so a focus
move touches no row. Values derived from the Explorer state are settled()
signals, so a write reaches only readers whose value changed. An empty root
FocusScope keeps the framework's D-pad traversal from walking the list.
Unit tests run with the browser condition so Solid is reactive in them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 12: `F:` in the diagnostics; X is inert on the read-error panel (P3b)

**Files:**
- Create: `app/now-playing/frame-time.ts`
- Modify: `app/now-playing/now-playing.tsx`, `app/explorer/explorer.tsx`
- Test: create `tests/frame-time.test.ts`; modify `tests/app.test.ts`

**Interfaces:** produces `frameNote(raw: string | undefined): string`.

- [ ] **Step 1: Write the failing tests.** `git apply --include='tests/*' $TMPDIR/t12.patch`.
- [ ] **Step 2: Watch them fail.** `bun test --conditions=browser tests/app.test.ts tests/frame-time.test.ts` → **27 pass, 3 fail**:
  - an X tap over the read-error panel opened search, so the hold that followed did not rescan;
  - the diagnostics lack `F:-`;
  - `Cannot find module '../app/now-playing/frame-time.ts'`.
- [ ] **Step 3: Implement.** `git apply --exclude='tests/*' $TMPDIR/t12.patch`:

```diff
diff --git a/app/explorer/explorer.tsx b/app/explorer/explorer.tsx
index 90b3788f245d0517709914fc87ed7e6113260758..669b01f457270e71c128001d5f63ad62d8c08980 100644
--- a/app/explorer/explorer.tsx
+++ b/app/explorer/explorer.tsx
@@ -114,8 +114,14 @@ export function Explorer(props: { session: Session; store: ExplorerStore; search
     if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: visibleSongIds(lib, state()), startId: row.id });
     else dispatch({ type: "open", row });
   }, { active });
-  // X: tap searches (or scans again on an empty library); a 1 s hold rescans.
-  onTapOrHold(BTN.TRIANGLE, () => (hasSongs() ? props.openSearch() : props.session.rescan()), () => props.session.rescan(), active);
+  // X: tap searches (or scans again on an empty library; nothing over the read-error panel,
+  // which asks for a hold); a 1 s hold rescans.
+  const tapX = () => {
+    if (props.session.readFailed()) return;
+    if (hasSongs()) props.openSearch();
+    else props.session.rescan();
+  };
+  onTapOrHold(BTN.TRIANGLE, tapX, () => props.session.rescan(), active);
 
   // --- list ----------------------------------------------------------------
   // The first row in the window: the least scrolling that keeps the focused row visible.
diff --git a/app/now-playing/frame-time.ts b/app/now-playing/frame-time.ts
new file mode 100644
index 0000000000000000000000000000000000000000..84f419fa2857ee079ad531d2780b0441996d8673
--- /dev/null
+++ b/app/now-playing/frame-time.ts
@@ -0,0 +1,17 @@
+// The L+R diagnostics' frame time: the host's whole-frame interval over its last
+// 60 frames (OP.debugStats, timingUs.frame = [mean, max] in µs), in whole ms.
+// Hosts without the op, a window not yet complete, or a garbled reply show F:-.
+
+const usable = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
+
+export function frameNote(raw: string | undefined): string {
+  if (!raw) return "F:-";
+  let frame: unknown;
+  try {
+    frame = (JSON.parse(raw) as { timingUs?: { frame?: unknown } } | null)?.timingUs?.frame;
+  } catch {
+    return "F:-";
+  }
+  if (!Array.isArray(frame) || frame.length !== 2 || !frame.every(usable)) return "F:-";
+  return `F:${Math.round(frame[0] / 1000)}/${Math.round(frame[1] / 1000)}`;
+}
diff --git a/app/now-playing/now-playing.tsx b/app/now-playing/now-playing.tsx
index 749a3936ebd939e2560edd57d22846263df00be3..66120d7122293d307be1578c6196296c50d2acd5 100644
--- a/app/now-playing/now-playing.tsx
+++ b/app/now-playing/now-playing.tsx
@@ -2,6 +2,7 @@
 // a drag-to-seek capsule (one seek on release) and the transport row. The
 // LCD's status row shows a playback error, or diagnostics while L+R are held.
 import { createSignal, Show } from "solid-js";
+import { getOps } from "@pocketjs/framework";
 import { View } from "@pocketjs/framework/components";
 import { createGesture } from "@pocketjs/framework/gesture";
 import { BTN } from "@pocketjs/framework/input";
@@ -9,6 +10,7 @@ import { onFrame } from "@pocketjs/framework/lifecycle";
 import { createMediaScrubber } from "@pocketjs/framework/media";
 import { formatRemaining, formatTime, needsHours } from "../format.ts";
 import type { Session } from "../session.ts";
+import { frameNote } from "./frame-time.ts";
 import { AQUA } from "../theme/aqua.ts";
 import { ArtFrame, CoverImage, CoverLoading, InfoLcd, SEEK_TRACK_PX, SEEK_TRACK_WIDE_PX, SeekCapsule, seekTrackLeft, TransportRow } from "../theme/parts/deck.tsx";
 import { IdlePanel } from "../theme/parts/panels.tsx";
@@ -56,10 +58,18 @@ export function NowPlaying(props: { session: Session }) {
   const position = () => preview() ?? status().positionMs;
   const SHOULDERS = BTN.LTRIGGER | BTN.RTRIGGER;
   const [diagnostics, setDiagnostics] = createSignal(false);
-  onFrame((buttons) => setDiagnostics((buttons & SHOULDERS) === SHOULDERS));
+  const [frameTime, setFrameTime] = createSignal("F:-");
+  let heldFrames = 0;
+  onFrame((buttons) => {
+    const held = (buttons & SHOULDERS) === SHOULDERS;
+    // The host's frame time is read only while L+R are held: at once, then twice a second.
+    if (held && heldFrames++ % 30 === 0) setFrameTime(frameNote(getOps().debugStats?.()));
+    if (!held) heldFrames = 0;
+    setDiagnostics(held);
+  });
   const note = () => {
     const now = status();
-    if (diagnostics()) return `U:${now.underruns} D:${now.decodeLoad}% A:${now.artHandles}`;
+    if (diagnostics()) return `U:${now.underruns} D:${now.decodeLoad}% A:${now.artHandles} ${frameTime()}`;
     return now.phase === "error" ? now.error : undefined;
   };
   const playing = () => status().phase === "playing" || status().phase === "loading";
diff --git a/tests/app.test.ts b/tests/app.test.ts
index d0860f3b33a0cb392b106134ab42795ab3fcd0e1..3918f8c2350e59dc4beeb47f78a5ee7ee4451abd 100644
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -413,6 +413,24 @@ test("a host whose status reads start failing is reported, survives taps, and re
   expect(selectedRow(rig.world)).toContain("Aerodynamic");
 }, 120_000);
 
+test("over the read-error panel an X tap does nothing; holding X still scans again", async () => {
+  const host = createSimLocalMedia(LIBRARY);
+  let garbled = false;
+  const ns = { ...host.ns, status: () => (garbled ? "{" : host.ns.status()) };
+  const rig = { host, world: await bootApp({ localmedia: ns }) };
+  frames(rig, 4);
+  garbled = true;
+  frames(rig, 3);
+  expect(screenText(rig.world, "primary")).toContain("Could not read the music library");
+  const scans = () => host.log.filter((entry) => entry === "scan()").length;
+  const before = scans();
+  press(rig, X);
+  expect(scans()).toBe(before);
+  expect(screenText(rig.world, "primary")).not.toContain("Search:"); // no keyboard
+  rescan(rig);
+  expect(scans()).toBe(before + 1);
+}, 120_000);
+
 test("a tap on the remaining-time label does not seek", async () => {
   const rig = await boot();
   press(rig, A);
@@ -519,7 +537,7 @@ test("holding L+R shows underruns, decode load and live covers without stepping
   rig.host.setDecodeLoad(23);
   frames(rig, 3, { buttons: BTN.LTRIGGER });
   frames(rig, 3, { buttons: BTN.LTRIGGER | BTN.RTRIGGER });
-  expect(screenText(rig.world, "auxiliary")).toContain("U:0 D:23% A:1");
+  expect(screenText(rig.world, "auxiliary")).toContain("U:0 D:23% A:1 F:-"); // the sim has no frame timing
   frames(rig, 3);
   expect(screenText(rig.world, "auxiliary")).toContain("1 of 4");
   expect(header(rig.world, "Song Name")).toBeDefined(); // still the Songs tab (L alone could not step left of it)
diff --git a/tests/frame-time.test.ts b/tests/frame-time.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..95e206807ff1a34c58cd825d30f55fd2a9b6dceb
--- /dev/null
+++ b/tests/frame-time.test.ts
@@ -0,0 +1,18 @@
+import { expect, test } from "bun:test";
+import { frameNote } from "../app/now-playing/frame-time.ts";
+
+test("the frame time reads the host's whole-frame mean and max, in whole ms", () => {
+  expect(frameNote(JSON.stringify({ timingUs: { frame: [16_667, 33_490], work: [4_000, 9_000] } }))).toBe("F:17/33");
+  expect(frameNote(JSON.stringify({ timingUs: { frame: [33_333, 33_333] } }))).toBe("F:33/33");
+});
+
+test("without timing, before the first window, or on a garbled reply, it shows F:-", () => {
+  expect(frameNote(undefined)).toBe("F:-");
+  expect(frameNote("")).toBe("F:-");
+  expect(frameNote("{")).toBe("F:-");
+  expect(frameNote("null")).toBe("F:-");
+  expect(frameNote(JSON.stringify({ target: "3ds" }))).toBe("F:-");
+  expect(frameNote(JSON.stringify({ timingUs: { frame: [0, 0] } }))).toBe("F:-");
+  expect(frameNote(JSON.stringify({ timingUs: { frame: ["16", 33] } }))).toBe("F:-");
+  expect(frameNote(JSON.stringify({ timingUs: { frame: [16_000] } }))).toBe("F:-");
+});
```

- [ ] **Step 4: Run them.** `bun run check` → clean; `bun run test` → **131 pass, 0 fail**.
- [ ] **Step 5: Commit.**

```bash
git add app/now-playing/frame-time.ts app/now-playing/now-playing.tsx app/explorer/explorer.tsx tests/app.test.ts tests/frame-time.test.ts
git commit -m "feat(now-playing): frame time in the L+R diagnostics; X tap is inert on the read-error panel

The diagnostics line gains F:<mean>/<max>, the host's whole-frame interval in
ms (F:- without timing). Over the read-error panel an X tap no longer opens
search or rescans; holding X still scans again, as the panel says.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 13: The exit gate and `docs/perf.md`

**Files:**
- Create: `docs/perf.md`

- [ ] **Step 1: The gallery is unchanged.** `bun run gallery && for f in dist/gallery-baseline/*.png; do cmp -s "$f" "dist/gallery/$(basename "$f")" || echo "DIFF $f"; done` → no output.
- [ ] **Step 2: The budgets hold.** `bun run perf --check --out dist/perf-final | tee dist/perf-final.md; echo "exit ${PIPESTATUS[0]}"`.
  Expected: every row ends `yes`, `exit 0`. In the prototype:

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| idle | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.3 | 1.7/1.7 | cached -1, walk 5740 (324/324 read) | yes |
| scroll | new | 1.4/5.2 | 0.2/2.9 | 1.3/1.6 | 3.0/7.8 | cached -1, walk 5719 (324/324 read) | yes |
| now-playing | new | 0.9/2.4 | 0.0/0.1 | 1.3/1.6 | 2.3/4.1 | cached -1, walk 5740 (324/324 read) | yes |
| scan-first | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.3 | 1.7/1.7 | cached -1, walk 5690 (324/324 read) | yes |
| scan-cached | new | 0.3/0.3 | 0.0/0.0 | 1.3/1.3 | 1.6/1.6 | cached 137, walk 454 (0/324 read) | yes |
| idle | old | 1.2/1.4 | 0.0/0.0 | 3.9/3.9 | 5.0/5.3 | cached -1, walk 5974 (324/324 read) | yes |
| scroll | old | 4.5/15.9 | 0.9/9.1 | 4.1/9.9 | 9.5/29.5 | cached -1, walk 5979 (324/324 read) | yes |
| now-playing | old | 2.9/7.5 | 0.0/0.3 | 4.1/9.8 | 7.1/12.1 | cached -1, walk 5974 (324/324 read) | yes |
| scan-first | old | 1.2/1.4 | 0.0/0.0 | 3.9/3.9 | 5.0/5.3 | cached -1, walk 5975 (324/324 read) | yes |
| scan-cached | old | 1.0/1.0 | 0.0/0.0 | 3.9/3.9 | 4.8/4.9 | cached 363, walk 946 (0/324 read) | yes |

  The tight row is `scroll` on Old: 28.6 and 29.5 ms in two prototype runs of the same code, against 30 ms. If any row is over budget, stop: report the row and what was tried to the user (spec §8), who decides.
- [ ] **Step 3: Suites and types.** `bun run check` → clean; `bun run test` → **131 pass, 0 fail**.
- [ ] **Step 4: Write `docs/perf.md`.** The file below, with its two run tables replaced by `dist/perf-baseline.md` (Task 8) and `dist/perf-final.md` (this task); the per-optimization rows stay as measured in the prototype:

```markdown
# Performance

Measured with `bun run perf` (`scripts/perf.ts`): a capture build per scenario, run headless in Azahar, read from the `stats.json` the host writes when the capture window ends. Plan 5 (`docs/superpowers/specs/2026-10-07-walkman-hardening-design.md`) set the budgets.

## How

- **Models:** Azahar runs the ARM11 at the Old 3DS clock in both models; the New 3DS speed-up is not emulated. **Old** = `is_new_3ds=false` at 100 % CPU clock; **New** = `is_new_3ds=true` at 300 %.
- **Renderer:** Vulkan, 1× resolution, no vsync, frame limit 100 %.
- **SD card:** the device test library (`bun run test-library`, 324 files) and a placeholder DSP firmware.
- **CPU work per frame** = js + tick + draw, from the host's 60-frame window (`timingUs.work`, mean / max in ms).
- **Budgets:**
  - Frame scenarios: CPU max ≤ 14 ms on New (60 fps), ≤ 30 ms on Old (a steady 30 fps).
  - `scan-first`: ≤ 10 s.
  - `scan-cached`: the cached list ≤ 1 s, the confirmation ≤ 3 s.
- **Scenarios:**
  - `idle`: the Songs list after the scan.
  - `scroll`: A plays the first row (a long title), then D-pad down is held.
  - `now-playing`: the same song, nothing pressed (the LCD title marquee runs).
  - `scan-first`: no cache on the card.
  - `scan-cached`: `scan-first`'s card again, holding the cache.
- Azahar timing is emulated ticks, so a run repeats to within a few tenths of a millisecond.

## Baseline (before the app optimizations)

The fork's scan work is in; the app is as Plan 4 left it.

Prototype run (the CPU column here is the sum of per-phase maxima; Task 8's run reports per-frame work):

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| idle | new | 2.4/2.6 | 0.0/0.0 | 1.3/1.3 | 3.7/3.9 | cached -1, walk 21499 (324/324 read) | yes |
| scroll | new | 13.2/102.7 | 0.5/4.1 | 1.4/1.8 | 15.1/108.6 | cached -1, walk 21533 (324/324 read) | no: CPU max 108.6 ms > 14 ms |
| now-playing | new | 4.1/6.0 | 0.0/0.1 | 1.4/3.2 | 5.4/9.3 | cached -1, walk 21533 (324/324 read) | yes |
| scan-first | new | 2.4/2.4 | 0.0/0.0 | 1.3/1.3 | 3.7/3.7 | cached -1, walk 21541 (324/324 read) | no: scan 21541 ms > 10000 ms |
| scan-cached | new | 2.4/2.4 | 0.0/0.0 | 1.3/1.3 | 3.7/3.7 | cached -1, walk 21495 (324/324 read) | no: cached list -1 ms > 1000 ms |
| idle | old | 7.6/7.8 | 0.0/0.0 | 3.8/3.8 | 11.4/11.7 | cached -1, walk 24184 (324/324 read) | yes |
| scroll | old | 41.8/331.8 | 1.5/12.5 | 4.4/9.8 | 47.6/354.1 | cached -1, walk 24184 (324/324 read) | no: CPU max 354.1 ms > 30 ms |
| now-playing | old | 12.8/18.7 | 0.0/0.4 | 4.2/9.8 | 17.0/28.9 | cached -1, walk 24184 (324/324 read) | yes |
| scan-first | old | 7.6/7.8 | 0.0/0.0 | 3.8/3.8 | 11.4/11.7 | cached -1, walk 24184 (324/324 read) | no: scan 24184 ms > 10000 ms |
| scan-cached | old | 7.6/7.8 | 0.0/0.0 | 3.8/3.8 | 11.4/11.7 | cached -1, walk 24184 (324/324 read) | no: cached list -1 ms > 1000 ms |

## The optimizations, in the order they were measured (prototype)

CPU mean / max in ms. Rows before "per-frame work" report the sum of the per-phase maxima, which can come from different frames and overstates the worst frame; from that row on, the max is one real frame's.

| Step | Change | Scroll New | Scroll Old | Now Playing New | Now Playing Old | Kept |
|---|---|---|---|---|---|---|
| 0 | baseline (Plan 4) | 15.1 / 108.6 | 47.6 / 354.1 | 5.4 / 9.3 | 17.0 / 28.9 | — |
| 1 | library key maps; per-row cell memos; header, legend and crumb memos | 10.4 / 31.5 | 33.4 / 107.8 | — | — | yes |
| 2 | stable status object; controller skips repeated statuses; player signal ignores status | 8.7 / 28.8 | 27.9 / 104.2 | 3.7 / 7.5 | 11.8 / 23.2 | yes |
| 3 | recycled row slots; marquee width cache; inactive marquees never measure | 7.0 / 22.9 | 22.1 / 75.2 | — | — | yes |
| 4 | focus, tab and query split into their own memos; a focus selector | 5.8 / 19.0 | 18.0 / 51.8 | — | — | yes |
| 5 | *metric:* per-frame work (one real frame's max) | 5.8 / 15.2 | 18.0 / 46.1 | 3.7 / 5.7 | 12.0 / 17.2 | — |
| 6 | status read at 15 Hz while playing | 4.3 / 15.3 | 13.0 / 45.8 | 2.3 / 4.0 | 7.1 / 16.8 | yes |
| 7 | empty root FocusScope (host QuickJS: focus tap 96 → 74 µs, scroll tap 156 → 137 µs) | — | — | — | — | yes |
| 8 | selection overlay; per-slot index signals | 3.5 / 11.7 | 11.3 / 35.5 | 2.2 / 3.9 | 7.1 / 16.6 | yes |
| 9 | even pool with a constant stripe per slot; settled Explorer state (key, view, tab, query, legend, focus, top) | 3.0 / 7.8 | 9.5 / 28.6 | 2.2 / 4.0 | 6.9 / 16.7 | yes |

Idle, at step 9: 1.6 / 1.6 (New), 4.8 / 4.8 (Old).

Not built, because the budgets were met: one input router (spec §4 item 3), fixed-size Now Playing text boxes (§4 item 5), and a core-side `measureText` cache.

Where step 8's time went: counting Solid computations per tap under host QuickJS showed a focus move re-running about 58 computations before the overlay, 39 after it and about 18 with settled state. Most of a focus move's cost was Solid marking every transitive reader of the Explorer state stale before it could tell a memo's value had not changed.

## Scanning

Measured in Azahar (Old) with probes around each SD call:

| Call | Cost |
|---|---|
| open a file | ~17 ms |
| close a file | ~12 ms |
| read 16 B / 16 KB / 64 KB | 0.9 / 4.2 / 12.6 ms |
| `stat()` (libctru opens the file; `st_mtime` is 0) | ~26 ms |
| `archive_getmtime` (returns a constant in Azahar) | ~13 ms |
| list 324 directory entries, 32 per read | 0.4 s in all |
| open + close on two threads at once | 1.9× one thread; four threads, no better |

| | Plan 4 | cache + 16 KB buffer (a `stat` per file) | directory listing + 4 KB buffer + two readers |
|---|---|---|---|
| first scan, New | 21.5 s | 23.4 s | 5.8 s |
| first scan, Old | 24.2 s | 20.8 s | 6.0 s |
| cached list, New / Old | — | 35 / 345 ms | 35 / 345 ms |
| confirmation, New / Old | — | 9.5 / 9.3 s (0 files read: all `stat`) | 0.5 / 0.9 s |

## Final

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| idle | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.3 | 1.7/1.7 | cached -1, walk 5740 (324/324 read) | yes |
| scroll | new | 1.4/5.2 | 0.2/2.9 | 1.3/1.6 | 3.0/7.8 | cached -1, walk 5719 (324/324 read) | yes |
| now-playing | new | 0.9/2.4 | 0.0/0.1 | 1.3/1.6 | 2.3/4.1 | cached -1, walk 5740 (324/324 read) | yes |
| scan-first | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.3 | 1.7/1.7 | cached -1, walk 5690 (324/324 read) | yes |
| scan-cached | new | 0.3/0.3 | 0.0/0.0 | 1.3/1.3 | 1.6/1.6 | cached 137, walk 454 (0/324 read) | yes |
| idle | old | 1.2/1.4 | 0.0/0.0 | 3.9/3.9 | 5.0/5.3 | cached -1, walk 5974 (324/324 read) | yes |
| scroll | old | 4.5/15.9 | 0.9/9.1 | 4.1/9.9 | 9.5/29.5 | cached -1, walk 5979 (324/324 read) | yes |
| now-playing | old | 2.9/7.5 | 0.0/0.3 | 4.1/9.8 | 7.1/12.1 | cached -1, walk 5974 (324/324 read) | yes |
| scan-first | old | 1.2/1.4 | 0.0/0.0 | 3.9/3.9 | 5.0/5.3 | cached -1, walk 5975 (324/324 read) | yes |
| scan-cached | old | 1.0/1.0 | 0.0/0.0 | 3.9/3.9 | 4.8/4.9 | cached 363, walk 946 (0/324 read) | yes |
```

- [ ] **Step 5: Commit.**

```bash
git add docs/perf.md
git commit -m "docs(perf): record the Plan 5 measurements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ask the user for the one check the harness cannot make.** In a normal (non-capture) build, `bun run 3ds`, run in Azahar as an Old 3DS: hold L+R on Now Playing while a song plays and while scrolling. `F:` should read about `33/33` (Old, 30 fps) or `17/17` on New. Capture builds pace frames with `C3D_FRAME_SYNCDRAW`, so only this run shows GPU-bound time (spec §10).
