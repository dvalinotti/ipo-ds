# iPoDS — DJ Mode

Date: 2026-10-08
Status: approved in conversation, pending written-spec review
Parent specs: `docs/superpowers/specs/2026-10-06-walkman-player-design.md` (§4.1, §5.2), `docs/superpowers/specs/2026-10-06-walkman-native-localmedia-design.md`
Plans: Plan 7 (fork: scratch engine) and Plan 8 (app: DJ screen), written after this spec is approved

## 1. Outcome

The bottom screen gains a **DJ Mode**: a vinyl record that spins while the song plays and stops when it pauses. Touching the record scratches the audio like a turntable:

- **Clockwise** drags play the song forward at finger speed. Pitch follows speed.
- **Counter-clockwise** drags play it backwards, audibly reversed.
- **A still finger** is silence: the finger owns the platter and the motor is off.
- **Lifting** the finger hands the platter back to the motor, which plays on from where the record stopped.

Success: on Azahar and a 3DS, scratching sounds like a record being moved by hand, with reverse and variable speed, and finger-to-sound latency under about 80 ms. Normal playback sounds and performs as it does today on both models.

## 2. Requirements

### Stated by the user
- **Real scratching:** audio follows the finger, reverse is audibly reversed, pitch follows speed.
- **Finger owns the platter:** touching stops the motor; the record moves only with the finger; lifting resumes playback from where the record stopped.
- **Entry and exit:** a DJ gel on the Now Playing transport row, and the SELECT button.
- **Layout:** the record on the left (about 200 px), a narrow Aqua side panel on the right with title, artist, time, prev/next and the exit toggle.
- **Engine:** a PCM history ring in the native player, between the decoder and NDSP.

### Decided in design (open to correction)
- The scratch history is about 10 s. Dragging back past it makes the record stick; it never seeks.
- Lifting returns audio and the visual spin to 1× at once. There is no spin-up ramp.
- Scratching while paused makes sound. After the lift the track stays paused.
- Scratch rate is clamped to ±4×. Forward scratching must decode ahead at that rate, and the Old 3DS decoder has no headroom for more. Reverse costs nothing extra because the ring already holds the audio.
- A 16 px circle around the spindle is a dead zone: a finger there holds the record still.
- DJ Mode does not change the top screen. L/R tabs, search, START, ZL and ZR work as before.
- SELECT toggles DJ Mode only while neither L nor R is held, so the host's L+R+SELECT devmenu chord never toggles it.

### Out of scope
Spin-up and brake ramps, cue points, crossfading two tracks, a pitch fader, tonearm art, effects, beat detection, scratch recording.

## 3. Platform facts that shape the design

Verified against the pinned runtime `fb83e39c` (`runtime/`):

- **Audio never enters JS.** `hosts/3ds/src/localmedia_player.c` decodes with minimp3 straight into 16 NDSP slots of 4608 frames: about 104 ms each, about 1.67 s queued at 44.1 kHz. There is no PCM kept behind the playhead.
- **Position** is `base_ms + (slot_start[slot] + ndspChnGetSamplePos) × 1000 / rate`, clamped so it never decreases (`lm_player_position`). The contract promises the same.
- **NDSP cannot play backwards.** A wavebuf has no direction. `ndspChnSetRate` changes speed and pitch at runtime, but direction changes need reversed PCM.
- **Seeks are slow and coarse:** an SD read, a resync, a decoder reset and a 4-slot refill, accurate to about 1 s. They cannot be repeated at scratch rate.
- **The player is pure C over an `LmSink` vtable** and is tested host-side by `tests/localmedia-native.test.ts` with a fake sink (`tests/fixtures/localmedia/glue/`).
- **Commands reach the audio thread** through atomics (`paused_flag`, `volume_percent`) or latest-wins `Mail` slots, and every command publishes a snapshot before it returns (the snapshot rule).
- **Rendering:** nodes take a `rotate` style (degrees, an affine that composes down the tree), and a rotated texture costs 2 textured triangles. The cover texture rotates too. Text does not rotate, there is no circular clip, arcs are not drawn under rotation, and `rounded-full` discs over radius 32 emit one rect per row. `app/images.json` with `linear: true` gives a baked image bilinear sampling.
- **Animation** is `onFrame` plus a signal (the marquee pattern) on a fixed 1/60 s tick.
- **Touch:** `createGesture({ surface: "auxiliary", axis: "any", region })` delivers `onMove` only on frames where the contact moved. A still finger produces no callback, so the app derives "no movement this frame" itself.
- **Buttons:** SELECT is unused by the app. The host strips L+R+SELECT from the held mask while the full chord is down (`hosts/3ds/src/input.c:84-85`).

## 4. Native engine (PocketJS fork)

### 4.1 The ring

A PCM16 ring in regular heap decouples decoding from output:

- `LM_RING_FRAMES = 1 << 19` frames: about 11.9 s at 44.1 kHz, 2 MiB stereo, 1 MiB mono.
- Indexed by **frames decoded since `base_ms`**, masked to the ring. The decoder writes at `write_frames`; output reads at `head`.
- New pure-C unit `localmedia_ring.{c,h}`:
  - `lm_ring_write(ring, pcm, frames, channels)` appends one decoded frame's samples, doing the mono/stereo conversion that `fill_slot` does today.
  - `lm_ring_silence(ring, frames)` appends silence. A frame whose bit reservoir was lost (the first frames after a seek) appends silence instead of only advancing a counter, so a ring index always equals a decoded-frame count.
  - `lm_ring_oldest(ring)` is `max(0, write_frames − LM_RING_FRAMES)`.
  - `lm_ring_copy(ring, head, out, n)` copies n frames forward.
  - `lm_ring_resample(ring, head_fp, rate_from_fp, rate_to_fp, out, n)` writes n output frames, reading at a signed 32.32 fixed-point head whose step ramps linearly from `rate_from` to `rate_to` across the n frames, with linear interpolation between neighbours. Output gain follows `|rate|` and reaches 1 at 0.25×, so a platter at rest is silent rather than a held sample (no DC offset). The head clamps to `[oldest, written − 1]`; a clamped head outputs silence. Returns the new head.

### 4.2 Normal playback

`fill_slot` decodes into the ring until `write_frames − head ≥ LM_SLOT_FRAMES` or the stream ends, then copies `LM_SLOT_FRAMES` (or what is left at the end) from `head` into the slot, records `slot_start[slot] = head` and `slot_rate[slot] = 1`, and advances `head`. Slot sizes, queue depth, prefill and wake cadence are unchanged; the only added cost is one 18 KB copy per slot.

Behind the playhead the ring holds about 11.9 s minus the 1.67 s queue: the **10 s scratch history**.

### 4.3 Scratch playback

- **Slots:** `LM_SCRATCH_FRAMES = 1024` frames (about 23 ms), kept `LM_SCRATCH_QUEUE = 3` deep, for about 50–70 ms of latency. They reuse the existing 16 linear-memory slot buffers.
- **Each slot** reads the latest target rate, ramps from the previous slot's rate to it across the slot (no zipper noise), resamples from the ring, and records `slot_start[slot]` and `slot_rate[slot]` (the slot's mean rate).
- **Lookahead:** while the rate is positive, the fill first decodes until `write_frames − head ≥ 2 × LM_SCRATCH_FRAMES × rate`, or the stream ends.
- **Begin:** clear the sink (dropping the queued normal audio), set `head` to the playhead at that moment, unpause the channel whatever `paused_flag` says, and queue three slots at rate 0. The playhead is `slot_start + played` of the playing slot; when none is playing, the first queued slot's start; when nothing is queued, `head`.
- **End:** compute the playhead the same way from the scratch slots (`slot_start + played × slot_rate`), clear the sink, set `head` to it, re-apply `paused_flag`, and prefill normal slots from `head`. No file seek is needed: the ring holds the audio after `head`, and the decoder continues from `write_frames`.
- **Open and seek** reset the ring (`write_frames = 0`, `head = 0`, `base_ms` = the target) and end scratch mode.
- **Begin is ignored** unless the phase is `playing` or `paused` and the ring was allocated.

### 4.4 Position and end of track

- `lm_player_position` reports `frames_ms(slot_start[slot] + played × slot_rate[slot])`. The never-decreases clamp is removed; position may decrease while scratching. In normal mode it still only moves forward, because `slot_rate` is 1.
- **Ended** is reported only when not scratching, the stream is at its end, `head == write_frames` and nothing is queued.
- `lm_player_duration` is unchanged (`decoded_ms` uses `write_frames`).

### 4.5 Thread plumbing (`localmedia.c`)

- `_Atomic bool scratch_flag` and `_Atomic int32_t scratch_rate_fp` (16.16, clamped to ±4.0 on the UI thread), following the `paused_flag` pattern. Every change signals `audio_wake`.
- The audio thread applies begin/end when `scratch_flag` differs from what it last applied, and reads the rate once per scratch slot.
- In scratch mode the wait timeout drops from 10 ms to 5 ms, and the thread never spins ("hurry"), so the UI thread is not starved. Three 23 ms slots give ample margin over a 5 ms wake.
- **Status JSON** gains `"scratching":true|false`, taken from the UI-thread command state so the snapshot rule holds: `scratchBegin` reads back `scratching: true`, `scratchEnd` reads back `false` with the phase it resumed into.
- `open` and `seek` clear `scratch_flag`.
- **Memory:** the ring is allocated in `localmedia_start`. If the 2 MiB allocation fails, it falls back to a `1 << 13`-frame ring (32 KiB stereo), which is enough for normal fills (one slot plus one decoded frame). Normal playback keeps the one code path; scratch ops are then ignored and `scratching` stays false.

## 5. Contract, SDK and sim fake (fork)

`contracts/spec/localmedia.ts`: `LOCALMEDIA.version = 3` and `LOCALMEDIA.maxScratchRate = 4`. `LocalStatus.scratching: boolean`, and `positionMs` "may decrease while scratching". `validLocalStatus` checks the new field. New ops:

```ts
/** Stops the motor and hands the platter to the guest: queued audio is dropped, the head
 * latches at the current position, and output follows scratchRate (initially 0: silence).
 * Sounds even while paused. Ignored unless the phase is playing or paused, or when the host
 * has no scratch ring. open() and seek() end scratching. */
scratchBegin(): void;
/** Signed playback multiplier while scratching: 1 = forward at normal speed, -1 = reverse,
 * 0 = still. The host clamps to [-4, 4]. Hot path: callers need not re-read the status. */
scratchRate(rate: number): void;
/** Resumes normal playback, or the paused state, from the scratch head. */
scratchEnd(): void;
```

- **SDK** (`framework/src/localmedia.ts`): typed wrappers. `scratchRate` turns a non-finite rate into 0.
- **Host ops** in `hosts/3ds/src/qjs.c`: three new `HostOperation` entries and `add_operation` calls. Bump `THREE_DS_DEV_HOST_ABI`. The capability stays `media.local`.
- **Sim fake** (`hosts/sim/localmedia.ts`):
  - `scratching` flag and a rate; ops logged as `scratchBegin()`, `scratchRate(0.5)`, `scratchEnd()`.
  - `advance(ms)` moves the position by `rate × ms` while scratching, clamped to `[max(0, positionAtBegin − 10000), durationMs]`, whatever the phase.
  - A scratch never reaches `ended`; `scratchEnd` at the duration leaves the next `advance` to end the track.
  - `scratchBegin` is ignored outside `playing`/`paused`. `open` and `seek` end scratching.

## 6. App (ipo-ds)

### 6.1 Session and controller

- `app/player/reducer.ts`: unchanged. Scratching is not queue state.
- `app/player/controller.ts`: a `scratch(active: boolean)` entry that calls `scratchBegin`/`scratchEnd` and re-reads the status, like a command; and `scratchRate(rate)`, which sends only.
- `app/session.ts`:
  - `Session.scratching: Accessor<boolean>`, from the status.
  - `Session.scratch: { begin(): void; rate(r: number): void; end(): void }`. `begin`/`end` publish the re-read snapshot, as `dispatch` does. `rate` reads nothing.
  - All three are no-ops on a build without `media.local`.
  - While scratching, the status is polled every frame (as for `loading`), so the time readout follows the finger.

### 6.2 Bottom-screen mode

- `app/app.tsx` keeps `createSignal<"deck" | "dj">("deck")`.
- SELECT toggles it while not searching and while neither L nor R is held.
- The deck's DJ gel enters DJ Mode; the side panel's deck gel leaves it.
- While searching, the keyboard covers the bottom screen as now; closing it returns to whichever mode was active.
- DJ Mode with nothing open shows the platter still, with "Nothing playing" in the panel. Touches do nothing.

### 6.3 Platter math (`app/dj/platter.ts`, pure)

- `angleAt(cx, cy, x, y)`: the finger's angle in degrees, clockwise from 12 o'clock (screen y grows downward).
- `wrapDelta(deg)`: to (−180, 180].
- `fingerRate(deltaDeg)`: `deltaDeg × 60 / 200`. At 33⅓ RPM the platter turns 200°/s, so a finger moving with the motor gives rate 1, and one revolution covers 1.8 s of audio.
- `smoothRate(prev, next)`: an exponential moving average with α = 0.5, clamped to ±4, and snapped to 0 below 1/64 so a still finger settles on exactly 0. The app sends a rate only when it changes.
- `inDeadZone(cx, cy, x, y)`: within 16 px of the centre.
- `SPIN_PER_FRAME = 200 / 60` degrees, and `wrap360`.

### 6.4 DJ screen (`app/dj/dj-mode.tsx`)

- **Platter:** a 200×200 View at (10, 20) whose children rotate together through one `rotate` signal.
  - Not scratching and `phase === "playing"`: the angle advances `SPIN_PER_FRAME` each frame.
  - Paused, loading, ended, idle or error: it holds.
  - Scratching: it follows the finger's angle.
- **Gesture** over the platter: `createGesture({ surface: "auxiliary", axis: "any", region: { node } })`.
  - `onDown`: ignored when idle. Otherwise `scratch.begin()` and latch the finger angle.
  - `onMove`: accumulate `wrapDelta` of the angle change (0 inside the dead zone).
  - Each `onFrame` while scratching: turn the accumulated delta into a rate (`fingerRate`, `smoothRate`), send `scratch.rate`, rotate the platter by the delta, reset the accumulator. A frame without movement therefore smooths toward 0.
  - `onUp` / `onCancel`: `scratch.end()`.
  - An `openSerial` change mid-drag ends the scratch, as the seek capsule does.
- **Side panel:** a 90×220 Aqua panel at (220, 10): title and artist (clipped, one line each), elapsed and remaining time (`formatTime`/`formatRemaining`), prev and next `TransportButton`s, and the deck gel.

### 6.5 Visuals and theme

- `app/theme/vinyl.png`: 256×256 RGBA, drawn at 200×200, `linear: true` in a new `app/images.json`. A black disc of radius 100 with about 20 groove rings, an asymmetric soft highlight so rotation reads, and a transparent centre hole of 84 px diameter. It is drawn **over** the label.
- **Label:** the cover texture (`ResourceImage`, 88×88) rotating with the disc. Its corners (62 px from the centre) hide under the vinyl. Without art, `app/theme/label.png`: an Aqua-blue label with an off-centre cream mark so its rotation shows. While the art decodes, the existing `CoverLoading` spinner sits on the label.
- **Spindle:** a static 6 px dot over the centre.
- `scripts/vinyl-png.ts` generates both PNGs, which are checked in. The baker's SVG support is flat shapes only.
- **Draw cost:** about two textured quads for the platter, plus the panel's gels and text.
- **Deck:** `TransportKind` and `IconName` gain `"dj"`. `TransportRow` takes `onDj` and a sixth gel: a 34 px mode gel like shuffle and repeat, grey off and blue on, with `dj-ink.svg`/`dj-white.svg` (a small record glyph). Two 34 px mode gels, two 42 px skip gels and the 64 px play gel are 216 px; with the DJ gel the six are 250 px plus five 10 px gaps, exactly the row's 300 px. The gap stays 10 px.
- **Theme slots** for the platter and panel go in `app/theme/theme.ts` and `app/theme/aqua.ts`; the parts in `app/theme/parts/platter.tsx`.
- **Gallery:** a `dj` state in `app/gallery/states.tsx` and `names.ts`, before `search`; `tests/gallery.test.ts` updated. Its rendered PNGs (`bun run gallery`) are the DJ Mode mockup; no separate HTML page.

## 7. Testing

**Fork:**
- Native `tests/fixtures/localmedia/ring-test.c`: write/copy/oldest, mono→stereo, silence frames, resample at rates 1, −1, 0, 0.5, 2, the ramp, edge clamping both ends.
- Native `tests/fixtures/localmedia/player-scratch-test.c` with the fake sink: normal playback through the ring decodes the same samples as before; rate −1 yields the reversed samples; rate 0 is silence; the back edge holds; begin/end continuity (no gap and no repeated audio at `end`); position decreases while reversing; `ended` never fires while scratching; open and seek end scratching.
- Contract and SDK tests for the three ops and `scratching`. Sim fake tests: rate × time, the clamp, scratching while paused, no `ended`, open/seek end it.
- The fork's existing localmedia tests stay green.

**ipo-ds:**
- `tests/platter.test.ts`: angles, wrap, rate, smoothing and clamp, dead zone.
- Headless `tests/dj.test.ts`:
  - SELECT and the deck gel enter DJ Mode; the panel's gel and SELECT leave it; L+SELECT does not toggle.
  - The platter turns while playing and holds while paused: its pixels change between frames while playing and do not while paused (the sim tree does not expose `rotate`).
  - A clockwise circular drag logs `scratchBegin()`, positive `scratchRate(…)`, then `scratchEnd()` on release. Counter-clockwise logs negative rates. A held finger decays to `scratchRate(0)`.
  - An open landing mid-drag ends the scratch.
  - The keyboard returns to DJ Mode when it closes.
  - The existing 154 tests stay green; the transport row test covers six gels.
- `bun run gallery` renders the `dj` state; other states change only where the transport row did.

**Performance:**
- A `dj` scenario in `scripts/perf.ts` (enter DJ Mode, spin while playing) within budget on both models: CPU max ≤ 14 ms on New, ≤ 30 ms on Old. Rows recorded in `docs/perf.md`.
- Normal-playback underruns and decode load unchanged after the ring.

**Device (Azahar, then hardware):** scratch latency and feel, audible reverse, no clicks at begin/end, Old 3DS memory with the 2 MiB ring, decode load while scratching forward at 4×.

## 8. Execution

- **Main session:** Opus at high effort. It writes the plans, dispatches tasks, judges reviews and resolves conflicts. It does not write product code.
- **Implementation:** `superpowers:subagent-driven-development`, one implementer and one reviewer subagent per task, both with `model: "sonnet"`. Implementers get the task text, the spec section and file paths; reviewers get the diff and the task's acceptance criteria. Each plan ends with a whole-branch Sonnet review judged by the main session.
- **TDD** for every task. Each ends with `bun run check` and `bun run test` green; native tasks also run the fork's `tests/localmedia-native.test.ts`.
- **Repos:** fork work on a `dj-mode` branch of `dvalinotti/pocketjs` (from `ipo-ds`); app work on `feature/dj-mode` here, with the `runtime` pin moved to the fork's branch. Plan 8's UI tasks can start once Plan 7's contract and sim fake land.

## 9. Risks

- **Old 3DS decode headroom** while scratching forward fast. Mitigated by the ±4× clamp; measured in Plan 7's device step.
- **Memory:** 2 MiB of heap on Old 3DS. The small-ring fallback keeps normal playback if the allocation fails.
- **Clicks at mode switches:** clearing the sink cuts mid-sample. A short fade on the first and last scratch slot can be added if they are audible.
- **Azahar audio timing** may differ from hardware; hardware is the final arbiter of latency and feel.
- **Position under ramps** is approximate within a slot (mean rate). It only drives the time readout, which polls at frame rate.
