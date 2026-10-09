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

Measured at Task 8 (CPU = per-frame work, one real frame's max):

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| idle | new | 2.1/2.2 | 0.0/0.0 | 1.3/1.3 | 3.4/3.5 | cached -1, walk 5740 (324/324 read) | yes |
| scroll | new | 13.2/102.8 | 0.4/2.2 | 1.4/3.5 | 15.1/106.5 | cached -1, walk 5733 (324/324 read) | no: CPU max 106.5 ms > 14 ms |
| now-playing | new | 4.1/6.0 | 0.0/0.1 | 1.3/3.2 | 5.5/7.3 | cached -1, walk 5750 (324/324 read) | yes |
| scan-first | new | 2.1/2.2 | 0.0/0.0 | 1.3/1.3 | 3.4/3.5 | cached -1, walk 5730 (324/324 read) | yes |
| scan-cached | new | 2.0/2.0 | 0.0/0.0 | 1.3/1.3 | 3.3/3.3 | cached 135, walk 479 (0/324 read) | yes |
| idle | old | 6.4/6.6 | 0.0/0.0 | 3.8/3.8 | 10.2/10.4 | cached -1, walk 7859 (324/324 read) | yes |
| scroll | old | 41.8/323.2 | 1.4/6.6 | 4.5/10.8 | 47.7/334.7 | cached -1, walk 7959 (324/324 read) | no: CPU max 334.7 ms > 30 ms |
| now-playing | old | 12.9/18.4 | 0.0/0.3 | 4.3/9.8 | 17.2/23.4 | cached -1, walk 7876 (324/324 read) | yes |
| scan-first | old | 6.4/6.6 | 0.0/0.0 | 3.8/3.8 | 10.2/10.4 | cached -1, walk 7742 (324/324 read) | yes |
| scan-cached | old | 6.1/6.6 | 0.0/0.0 | 3.8/3.8 | 9.9/10.4 | cached 354, walk 1051 (0/324 read) | yes |

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
| idle | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.3 | 1.7/1.7 | cached -1, walk 5756 (324/324 read) | yes |
| scroll | new | 1.4/5.2 | 0.2/1.0 | 1.4/3.3 | 3.0/7.8 | cached -1, walk 5723 (324/324 read) | yes |
| now-playing | new | 0.9/2.4 | 0.0/0.1 | 1.3/1.6 | 2.3/4.1 | cached -1, walk 5761 (324/324 read) | yes |
| scan-first | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.3 | 1.7/1.7 | cached -1, walk 5743 (324/324 read) | yes |
| scan-cached | new | 0.3/0.3 | 0.0/0.0 | 1.3/1.3 | 1.6/1.6 | cached 34, walk 500 (0/324 read) | yes |
| idle | old | 1.2/1.4 | 0.0/0.0 | 3.9/3.9 | 5.0/5.3 | cached -1, walk 6010 (324/324 read) | yes |
| scroll | old | 4.5/15.8 | 0.6/3.2 | 4.4/9.9 | 9.5/28.4 | cached -1, walk 5993 (324/324 read) | yes |
| now-playing | old | 3.1/12.8 | 0.0/0.3 | 4.2/9.9 | 7.3/16.7 | cached -1, walk 5976 (324/324 read) | yes |
| scan-first | old | 1.2/1.4 | 0.0/0.0 | 3.9/3.9 | 5.0/5.3 | cached -1, walk 5980 (324/324 read) | yes |
| scan-cached | old | 1.0/1.0 | 0.0/0.0 | 3.9/3.9 | 4.8/4.9 | cached 363, walk 929 (0/324 read) | yes |

## Aqua gels

`bun run perf --check` after the gels (`docs/superpowers/specs/2026-10-07-aqua-gels-design.md`): a gloss box on every gel, and a shadow on the transport buttons and the seek knob.

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| idle | new | 0.4/0.5 | 0.0/0.0 | 1.4/1.4 | 1.8/1.9 | cached -1, walk 5760 (324/324 read) | yes |
| scroll | new | 1.5/6.3 | 0.2/3.0 | 1.8/2.1 | 3.5/9.1 | cached -1, walk 5710 (324/324 read) | yes |
| now-playing | new | 1.0/2.6 | 0.0/0.1 | 1.8/3.7 | 2.8/5.3 | cached -1, walk 5760 (324/324 read) | yes |
| scan-first | new | 0.4/0.5 | 0.0/0.0 | 1.4/1.4 | 1.8/1.9 | cached -1, walk 5740 (324/324 read) | yes |
| scan-cached | new | 0.3/0.3 | 0.0/0.0 | 1.4/1.4 | 1.7/1.7 | cached 39, walk 517 (0/324 read) | yes |
| idle | old | 1.2/1.4 | 0.0/0.0 | 4.2/4.2 | 5.4/5.6 | cached -1, walk 5973 (324/324 read) | yes |
| scroll | old | 4.8/22.1 | 0.8/9.1 | 5.9/12.1 | 11.4/30.7 | cached -1, walk 5992 (324/324 read) | no: CPU max 30.7 ms > 30 ms |
| now-playing | old | 2.9/7.4 | 0.0/0.3 | 5.7/11.2 | 8.7/14.1 | cached -1, walk 5975 (324/324 read) | yes |
| scan-first | old | 1.2/1.4 | 0.0/0.0 | 4.2/4.2 | 5.4/5.6 | cached -1, walk 5992 (324/324 read) | yes |
| scan-cached | old | 1.0/1.0 | 0.0/0.0 | 4.2/4.2 | 5.2/5.2 | cached 362, walk 998 (0/324 read) | yes |

`scroll` on Old went over by 0.7 ms, so both fallbacks were applied, re-measuring `scroll` on Old after each (`bun run perf scroll --model old --check`):

| Fallback | Run |
|---|---|
| 1: the knob casts no shadow | `| scroll | old | 4.7/16.3 | 0.7/3.4 | 5.5/11.2 | 10.8/24.9 | cached -1, walk 5975 (324/324 read) | yes |` |
| 1, repeated | `| scroll | old | 4.8/16.3 | 0.7/3.4 | 5.6/11.3 | 11.0/30.5 | cached -1, walk 5992 (324/324 read) | no: CPU max 30.5 ms > 30 ms |` |
| 2: prev/next and shuffle/repeat cast no shadow either | `| scroll | old | 4.7/16.3 | 0.7/3.4 | 5.4/11.1 | 10.7/24.8 | cached -1, walk 5983 (324/324 read) | yes |` |
| 2, repeated | `| scroll | old | 4.9/16.3 | 0.6/3.4 | 5.5/11.1 | 11.1/25.8 | cached -1, walk 6006 (324/324 read) | yes |` |

Fallbacks applied: **the knob's, prev/next's and shuffle/repeat's shadows**. Play/pause keeps its own.

What the 240-frame traces (`stats.json`) show for `scroll` on Old:

- **The gels' cost:** they add about 1.4 ms to a typical frame's draw (median 3.9 → 5.3 ms).
- **The worst frame:** a D-pad step costs about 16 ms of JS and 3 ms of tick. Every 10–40 frames a draw spikes to about 11 ms (10.6 ms before the gels), independent of the gels. When the two coincide, the frame reaches 30.5–30.7 ms.
- **Before the gels:** Plan 5's final trace peaked at 29.8 ms.
- **What the budget sees:** it reads the host's 60-frame window, and that window passes in both runs after fallback 2 (24.8 and 25.8 ms). One of those runs still has a 30.6 ms frame elsewhere in its 240-frame trace.
- **Remaining work:** the 11 ms draw spike, not the gels, is what to chase for headroom.

## Review fixes (Plan 6)

The review-fix branch (`fix/fable-review`, `docs/superpowers/plans/2026-10-07-walkman-06-review-fixes.md`): the session polls at 15 Hz in every phase but `loading` (it read the host every frame while idle or paused before), a command publishes its status on its own frame, the search keys are folded at build time, and `prune` returns the same state when a scan dropped nothing. `bun run perf idle scroll now-playing --model both --check`, one scenario per invocation (see the note below):

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| idle | new | 0.4/0.5 | 0.0/0.0 | 1.3/1.4 | 1.8/1.9 | cached -1, walk 5740 (324/324 read) | yes |
| scroll | new | 1.6/5.7 | 0.2/1.1 | 1.7/2.0 | 3.5/8.7 | cached -1, walk 5691 (324/324 read) | yes |
| now-playing | new | 1.1/4.6 | 0.0/0.1 | 1.7/2.0 | 2.9/6.3 | cached -1, walk 5740 (324/324 read) | yes |
| idle | old | 1.3/1.6 | 0.0/0.0 | 4.1/4.1 | 5.4/5.6 | cached -1, walk 5958 (324/324 read) | yes |
| scroll | old | 5.2/17.2 | 0.7/3.3 | 5.6/11.2 | 11.5/25.6 | cached -1, walk 5957 (324/324 read) | yes |
| now-playing | old | 3.4/14.0 | 0.0/0.3 | 5.5/11.1 | 8.8/19.1 | cached -1, walk 5957 (324/324 read) | yes |

Every row is within budget and within a few tenths of the gels run; `scroll` on Old stays at 25.6 ms against 30 ms. The idle rows do not move: the status read the branch removed from idle frames was already far below the draw cost.

Harness note: in three of seven Azahar launches the capture never wrote `done` or `error.txt` (the ROM booted and the scan finished at about 9 s, then nothing), and `perf` timed out after 240 s. Every stalled scenario passed on re-run from the same `.3dsx`. Multi-scenario invocations stalled on their first launch each time; single-scenario invocations completed, so the rows above come from one scenario per invocation. The host writes `error.txt` for a guest throw, so the stalls are not JS errors.

## DJ Mode (Plan 8)

The DJ Mode branch (`feature/dj-mode`, `docs/superpowers/plans/2026-10-08-dj-mode-08-dj-screen.md`): the platter turns one View holding the label and a 256 px vinyl texture (two textured quads under rotation), and the native player decodes through a 2 MiB PCM ring. `dj` opens DJ Mode on the playing song; it measures the motor spin, not a scratch (the tape has no touches). `bun run perf dj --model both --check` and `bun run perf now-playing --model both --check`:

| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |
|---|---|---|---|---|---|---|---|
| dj | new | 0.9/1.8 | 0.0/0.1 | 1.2/3.2 | 2.1/3.8 | cached -1, walk 5718 (324/324 read) | yes |
| dj | old | 2.9/11.3 | 0.0/0.3 | 3.8/9.5 | 6.7/16.0 | cached -1, walk 6007 (324/324 read) | yes |
| now-playing | new | 1.1/4.7 | 0.0/0.1 | 1.8/2.2 | 3.0/6.5 | cached -1, walk 5700 (324/324 read) | yes |
| now-playing | old | 3.3/8.3 | 0.0/0.3 | 6.2/11.6 | 9.4/15.2 | cached -1, walk 6007 (324/324 read) | yes |

`now-playing` stays within a few tenths of the Plan 6 rows on New (CPU mean/max 3.0/6.5 ms against 2.9/6.3 ms) and moves on Old from 8.8/19.1 ms to 9.4/15.2 ms, where the mean rises 0.6 ms and the max falls 3.9 ms. `dj` fits both budgets, with a CPU max of 3.8 ms on New against 14 ms and 16.0 ms on Old against 30 ms.
