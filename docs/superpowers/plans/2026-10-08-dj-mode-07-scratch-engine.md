# DJ Mode Plan 7 — Scratch Engine (PocketJS fork) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `media.local` turntable scratching: a PCM history ring in the native player, scratch slots read from it at a signed fractional rate, and `scratchBegin` / `scratchRate` / `scratchEnd` ops through the 3DS host, the contract, the SDK and the sim fake.

**Architecture:** The decoder writes into a PCM16 ring (`localmedia_ring.{c,h}`, pure C) instead of straight into NDSP slots. Normal playback copies forward from the ring into the existing 4608-frame slots. While the guest holds the platter, the player fills 1024-frame slots by resampling the ring at the guest's rate (negative reads backwards), three deep. The audio thread switches modes from an atomic flag the UI thread sets; status JSON gains `scratching`.

**Tech Stack:** C11 (libctru on the 3DS; host-compiled tests under ASan/UBSan with `cc`), TypeScript (Bun tests), the PocketJS fork in the `runtime/` submodule.

**Spec:** `docs/superpowers/specs/2026-10-08-dj-mode-design.md` (§3, §4, §5, §7 Fork, §9). Read it before any task.

**Execution:** Opus (high effort) orchestrates; every task runs as one Sonnet implementer subagent plus one Sonnet reviewer subagent (`model: "sonnet"`), per `superpowers:subagent-driven-development`. The orchestrator runs each task's verification commands itself before starting the next task.

## Global Constraints

- All fork work happens inside `runtime/` on branch `dj-mode` (created in Task 1 from `origin/ipo-ds`, which is `fb83e39c`, the commit ipo-ds pins). Commit inside `runtime/`; do not touch the ipo-ds repo in this plan except this plan file.
- Commit messages: Conventional Commits, scope `localmedia` (e.g. `feat(localmedia): …`), ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ring: `LM_RING_FRAMES = 1u << 19` (scratch-capable), `LM_RING_MIN_FRAMES = 1u << 13` (fallback, scratch disabled). Rates are 16.16 fixed point, `LM_RATE_ONE = 65536`. Ring positions are 32.32 fixed point frames (`LmRingPos`, `LM_POS_ONE = (LmRingPos)1 << 32`).
- Scratch slots: `LM_SCRATCH_FRAMES = 1024`, `LM_SCRATCH_QUEUE = 3`, rate clamp `LM_SCRATCH_MAX_RATE = 4 * LM_RATE_ONE` (±4×). Output gain reaches 1 at `LM_FULL_GAIN_RATE = LM_RATE_ONE / 4`; rate 0 is silence.
- Scratch is allowed only when the ring has `LM_RING_FRAMES` frames, and (glue) only while the phase is `playing` or `paused`. `open` and `seek` end scratching.
- Normal playback keeps its slot size (4608), queue (16), prefill (4), 10 ms wake, and forward-only position.
- In scratch mode the audio thread waits at most 5 ms (`SCRATCH_WAKE_NS 5000000LL`) and never hurries.
- `LOCALMEDIA.version = 3`, `LOCALMEDIA.maxScratchRate = 4`, `THREE_DS_DEV_HOST_ABI = 13`. The capability stays `media.local`.
- Native code must be clean under `-Wall -Wextra -fsanitize=address,undefined -fno-sanitize-recover=undefined` (the harness in `tests/localmedia-native.test.ts`). Never left-shift a negative value: multiply by `65536` / `LM_POS_ONE` instead.
- Documentation prose in the fork follows `runtime/CLAUDE.md`: state mechanisms, no adverbs like "simply/just/actually".
- Run fork tests from `runtime/`: `bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts tests/localmedia-native.test.ts tests/3ds-profile.test.ts`. Do not run the whole fork suite.

## Review Focus

1. **Scratch held past the history window** (a long counter-clockwise drag): the head must stop at the ring's oldest frame and output silence, never read overwritten audio or index out of bounds. Pinned in Task 1 (ring clamp below `oldest` after wrap) and Task 3 (reverse to the start).
2. **Lifting the finger after reversing** must resume at the heard frame with no repeated or skipped audio, even when the ring head is far behind the decoder. Pinned in Task 3 (end continuity).
3. **Scratching forward into the end of the file** must never report `ended` while held, and must end normally after the lift. Pinned in Task 3.
4. **A wavebuf handover race** in normal playback (NDSP reports the next slot's start with the previous slot's sample count) must not make the time readout jump backwards. Pinned in Task 2 (normal-mode position stays monotonic).
5. **A scratch op on a track that is not playing or paused** (idle, loading, ended, error), or on a host whose 2 MiB ring allocation failed, must be ignored and report `scratching: false`. Pinned in Task 3 (small ring) and Task 4 (glue: ended/idle) and Task 6 (sim fake).

---

## File Structure

| File | Responsibility |
|---|---|
| `runtime/hosts/3ds/src/localmedia_ring.h` / `.c` (new) | The PCM ring: write, silence, copy, resample. No player knowledge. |
| `runtime/hosts/3ds/src/localmedia_player.h` / `.c` | Decoder into the ring; normal and scratch slot fills; positions; mode switches. |
| `runtime/hosts/3ds/src/localmedia.c` / `.h` | Ring allocation; UI-thread scratch commands; audio-thread mode switches; status JSON. |
| `runtime/hosts/3ds/src/qjs.c` | `scratchBegin` / `scratchRate` / `scratchEnd` host operations. |
| `runtime/hosts/3ds/Makefile` | The ring object and header dependencies. |
| `runtime/tests/fixtures/localmedia/ring-test.c` (new) | Ring unit test. |
| `runtime/tests/fixtures/localmedia/player-scratch-test.c` (new) | Player scratch test over a fake sink. |
| `runtime/tests/fixtures/localmedia/player-test.c` | Existing player test, moved to the ring-taking `lm_player_open`. |
| `runtime/tests/fixtures/localmedia/glue/glue-test.c` | Glue test: scratch snapshot, short slots, resume, open ends it. |
| `runtime/tests/localmedia-native.test.ts` | Registers the new C tests and the ring source. |
| `runtime/contracts/spec/localmedia.ts` | Contract v3: ops, `scratching`, `maxScratchRate`. |
| `runtime/framework/src/localmedia.ts` | SDK wrappers. |
| `runtime/hosts/sim/localmedia.ts` | Sim fake scratching. |
| `runtime/tests/localmedia.test.ts`, `runtime/tests/localmedia-sim.test.ts` | Contract/SDK and fake tests. |
| `runtime/tools/3ds-profile.ts`, `runtime/tests/3ds-profile.test.ts` | Host ABI 13. |

---

### Task 1: The PCM ring

**Files:**
- Create: `runtime/hosts/3ds/src/localmedia_ring.h`, `runtime/hosts/3ds/src/localmedia_ring.c`
- Create: `runtime/tests/fixtures/localmedia/ring-test.c`
- Modify: `runtime/tests/localmedia-native.test.ts` (add one test)

**Interfaces:**
- Produces (used by Tasks 2–4): the header below, verbatim.

- [ ] **Step 1: Create the fork branch and confirm the baseline**

```bash
cd runtime
git fetch origin
git checkout -b dj-mode origin/ipo-ds
git log --oneline -1   # fb83e39c fix(localmedia): an empty cache shows no list; a rescan reads every file
bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts tests/localmedia-native.test.ts tests/3ds-profile.test.ts
```
Expected: all pass (28 localmedia tests plus the profile tests). If `node_modules` is missing, run `bun install --frozen-lockfile` in `runtime/` first.

- [ ] **Step 2: Write the header**

`runtime/hosts/3ds/src/localmedia_ring.h`:

```c
/*
 * media.local PCM history: a power-of-two ring of PCM16 frames indexed by the
 * frames written since the last reset. The decoder appends; normal playback
 * copies forward from it; a scratch reads it at a signed fractional rate.
 *
 * Pure C: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_RING_H
#define POCKETJS_LOCALMEDIA_RING_H

#include <stdint.h>

/* A ring that can scratch: 2^19 frames, about 11.9 s at 44.1 kHz (2 MiB stereo). */
#define LM_RING_FRAMES (1u << 19)
/* The smallest ring normal playback needs: one 4608-frame slot plus one decoded frame. */
#define LM_RING_MIN_FRAMES (1u << 13)
/* Rates are 16.16 fixed point: ring frames read per output frame. */
#define LM_RATE_ONE 65536
/* Output gain reaches 1 at this |rate|; a platter at rest is silent. */
#define LM_FULL_GAIN_RATE (LM_RATE_ONE / 4)

/* A ring position in frames, 32.32 fixed point. */
typedef int64_t LmRingPos;
#define LM_POS_ONE ((LmRingPos)1 << 32)

typedef struct {
  int16_t *pcm;      /* capacity * channels samples */
  uint32_t capacity; /* frames; a power of two */
  int channels;      /* 1 or 2 */
  uint64_t written;  /* frames appended since the last reset */
} LmRing;

void lm_ring_init(LmRing *r, int16_t *pcm, uint32_t capacity, int channels);
void lm_ring_reset(LmRing *r);
/* Appends `frames` frames of `from_channels`-channel PCM, converting to the ring's channel count
 * (mono is duplicated to stereo; stereo is averaged to mono). */
void lm_ring_write(LmRing *r, const int16_t *pcm, int frames, int from_channels);
/* Appends `frames` frames of silence. */
void lm_ring_silence(LmRing *r, int frames);
/* The oldest frame still held: written - capacity, or 0. */
uint64_t lm_ring_oldest(const LmRing *r);
/* Copies n frames starting at frame `at`; the caller keeps oldest <= at and at + n <= written. */
void lm_ring_copy(const LmRing *r, uint64_t at, int16_t *out, int n);
/* Writes n output frames read from `head`. The step per output frame ramps linearly from
 * rate_from to rate_to (16.16) across the n frames; samples between frames are linearly
 * interpolated; gain follows |rate| up to LM_FULL_GAIN_RATE. Before each frame the head is
 * clamped to [oldest, written - 1]; a clamped head (or an empty ring) outputs silence.
 * Returns the head after the last output frame (it may lie outside the held frames). */
LmRingPos lm_ring_resample(const LmRing *r, LmRingPos head, int32_t rate_from, int32_t rate_to, int16_t *out, int n);

#endif
```

- [ ] **Step 3: Write the failing test**

`runtime/tests/fixtures/localmedia/ring-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_ring.h"
#include "check.h"

#include <stdint.h>

/* Frame i of the test signal: left i*10, right -i*10. */
static void fill_signal(int16_t *out, int first, int frames) {
  for (int i = 0; i < frames; i++) { out[i * 2] = (int16_t)((first + i) * 10); out[i * 2 + 1] = (int16_t)(-(first + i) * 10); }
}

int main(void) {
  int16_t store[16 * 2];
  int16_t in[32 * 2], out[32 * 2];
  LmRing r;

  /* Writes and copies; the oldest frame moves once the ring wraps. */
  lm_ring_init(&r, store, 16, 2);
  fill_signal(in, 0, 10);
  lm_ring_write(&r, in, 10, 2);
  CHECK_INT(r.written, 10);
  CHECK_INT(lm_ring_oldest(&r), 0);
  lm_ring_copy(&r, 3, out, 4);
  for (int i = 0; i < 4; i++) { CHECK_INT(out[i * 2], (3 + i) * 10); CHECK_INT(out[i * 2 + 1], -(3 + i) * 10); }
  fill_signal(in, 10, 10);
  lm_ring_write(&r, in, 10, 2);
  CHECK_INT(r.written, 20);
  CHECK_INT(lm_ring_oldest(&r), 4);
  lm_ring_copy(&r, 4, out, 16); /* crosses the wrap */
  for (int i = 0; i < 16; i++) CHECK_INT(out[i * 2], (4 + i) * 10);

  /* Silence appends zero frames. */
  lm_ring_silence(&r, 3);
  CHECK_INT(r.written, 23);
  lm_ring_copy(&r, 20, out, 3);
  for (int i = 0; i < 6; i++) CHECK_INT(out[i], 0);

  /* Mono into a stereo ring is duplicated; stereo into a mono ring is averaged. */
  int16_t mono[3] = {100, 200, 300};
  lm_ring_init(&r, store, 16, 2);
  lm_ring_write(&r, mono, 3, 1);
  lm_ring_copy(&r, 0, out, 3);
  for (int i = 0; i < 3; i++) { CHECK_INT(out[i * 2], mono[i]); CHECK_INT(out[i * 2 + 1], mono[i]); }
  int16_t stereo[4] = {100, 300, -50, 50};
  lm_ring_init(&r, store, 16, 1);
  lm_ring_write(&r, stereo, 2, 2);
  lm_ring_copy(&r, 0, out, 2);
  CHECK_INT(out[0], 200);
  CHECK_INT(out[1], 0);

  /* Resampling: a 16-frame stereo ring holding frames 0..15. */
  lm_ring_init(&r, store, 16, 2);
  fill_signal(in, 0, 16);
  lm_ring_write(&r, in, 16, 2);

  /* Rate 1 reads frames in order and lands one frame per output frame on. */
  LmRingPos head = lm_ring_resample(&r, 4 * LM_POS_ONE, LM_RATE_ONE, LM_RATE_ONE, out, 8);
  for (int i = 0; i < 8; i++) { CHECK_INT(out[i * 2], (4 + i) * 10); CHECK_INT(out[i * 2 + 1], -(4 + i) * 10); }
  CHECK(head == 12 * LM_POS_ONE);

  /* Rate -1 reads backwards. */
  head = lm_ring_resample(&r, 15 * LM_POS_ONE, -LM_RATE_ONE, -LM_RATE_ONE, out, 8);
  for (int i = 0; i < 8; i++) CHECK_INT(out[i * 2], (15 - i) * 10);
  CHECK(head == 7 * LM_POS_ONE);

  /* Rate 0.5 interpolates halfway between frames. */
  lm_ring_resample(&r, 4 * LM_POS_ONE, LM_RATE_ONE / 2, LM_RATE_ONE / 2, out, 4);
  CHECK_INT(out[0], 40); CHECK_INT(out[2], 45); CHECK_INT(out[4], 50); CHECK_INT(out[6], 55);

  /* Rate 0 is silence; rate 1/8 is half gain (full gain from 1/4). */
  lm_ring_resample(&r, 10 * LM_POS_ONE, 0, 0, out, 4);
  for (int i = 0; i < 8; i++) CHECK_INT(out[i], 0);
  lm_ring_resample(&r, 10 * LM_POS_ONE, LM_RATE_ONE / 8, LM_RATE_ONE / 8, out, 1);
  CHECK_INT(out[0], 50);
  CHECK_INT(out[1], -50);

  /* A ramp from 0 to 1 over 4 frames steps 0, 1/4, 1/2, 3/4: the head moves 1.5 frames. */
  head = lm_ring_resample(&r, 4 * LM_POS_ONE, 0, LM_RATE_ONE, out, 4);
  CHECK(head == 4 * LM_POS_ONE + LM_POS_ONE / 2 * 3);

  /* Clamping: below the oldest frame and past the newest, the output is silent. */
  fill_signal(in, 16, 8);
  lm_ring_write(&r, in, 8, 2); /* written 24: oldest 8 */
  CHECK_INT(lm_ring_oldest(&r), 8);
  lm_ring_resample(&r, 9 * LM_POS_ONE, -LM_RATE_ONE, -LM_RATE_ONE, out, 4);
  CHECK_INT(out[0], 90);   /* frame 9 */
  CHECK_INT(out[2], 80);   /* frame 8, the oldest */
  CHECK_INT(out[4], 0);    /* below the oldest: clamped */
  CHECK_INT(out[6], 0);
  lm_ring_resample(&r, 23 * LM_POS_ONE, LM_RATE_ONE, LM_RATE_ONE, out, 3);
  CHECK_INT(out[0], 230);  /* the newest frame */
  CHECK_INT(out[2], 0);    /* past it: clamped */

  /* An empty ring is silent. */
  lm_ring_reset(&r);
  lm_ring_resample(&r, 0, LM_RATE_ONE, LM_RATE_ONE, out, 2);
  for (int i = 0; i < 4; i++) CHECK_INT(out[i], 0);

  CHECK_DONE("localmedia ring");
}
```

Add to `runtime/tests/localmedia-native.test.ts`, inside the `describe` block, after the `"ids stay with their files…"` test:

```ts
  test("ring: writes, wraps, converts channels, copies, resamples forward/backward/fractional, ramps, clamps", () => {
    expect(run("ring-test.c", ["localmedia_ring.c"])).toContain("localmedia ring verified");
  }, 60_000);
```

- [ ] **Step 4: Run it to see it fail**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts -t ring`
Expected: FAIL — `compile ring-test.c failed` (no `localmedia_ring.c`).

- [ ] **Step 5: Implement the ring**

`runtime/hosts/3ds/src/localmedia_ring.c`:

```c
/* PCM history ring; see localmedia_ring.h. */
#include "localmedia_ring.h"

#include <stddef.h>
#include <string.h>

void lm_ring_init(LmRing *r, int16_t *pcm, uint32_t capacity, int channels) {
  r->pcm = pcm;
  r->capacity = capacity;
  r->channels = channels;
  r->written = 0;
}

void lm_ring_reset(LmRing *r) { r->written = 0; }

static uint32_t index_of(const LmRing *r, uint64_t frame) { return (uint32_t)(frame & (uint64_t)(r->capacity - 1)); }

static int16_t *frame_at(const LmRing *r, uint64_t frame) {
  return r->pcm + (size_t)index_of(r, frame) * (size_t)r->channels;
}

void lm_ring_write(LmRing *r, const int16_t *pcm, int frames, int from_channels) {
  const size_t ch = (size_t)r->channels;
  if (from_channels == r->channels) {
    /* Same layout: copy in runs up to the wrap. */
    while (frames > 0) {
      uint32_t at = index_of(r, r->written);
      uint32_t room = r->capacity - at;
      uint32_t n = (uint32_t)frames < room ? (uint32_t)frames : room;
      memcpy(r->pcm + (size_t)at * ch, pcm, (size_t)n * ch * sizeof *pcm);
      pcm += (size_t)n * ch;
      frames -= (int)n;
      r->written += n;
    }
    return;
  }
  for (int i = 0; i < frames; i++, r->written++) {
    int16_t *dst = frame_at(r, r->written);
    const int16_t *src = pcm + (size_t)i * (size_t)from_channels;
    if (r->channels == 2) dst[0] = dst[1] = src[0];
    else dst[0] = (int16_t)((src[0] + src[1]) / 2);
  }
}

void lm_ring_silence(LmRing *r, int frames) {
  const size_t ch = (size_t)r->channels;
  while (frames > 0) {
    uint32_t at = index_of(r, r->written);
    uint32_t room = r->capacity - at;
    uint32_t n = (uint32_t)frames < room ? (uint32_t)frames : room;
    memset(r->pcm + (size_t)at * ch, 0, (size_t)n * ch * sizeof *r->pcm);
    frames -= (int)n;
    r->written += n;
  }
}

uint64_t lm_ring_oldest(const LmRing *r) {
  return r->written > r->capacity ? r->written - r->capacity : 0;
}

void lm_ring_copy(const LmRing *r, uint64_t at, int16_t *out, int n) {
  const size_t ch = (size_t)r->channels;
  while (n > 0) {
    uint32_t from = index_of(r, at);
    uint32_t room = r->capacity - from;
    uint32_t take = (uint32_t)n < room ? (uint32_t)n : room;
    memcpy(out, r->pcm + (size_t)from * ch, (size_t)take * ch * sizeof *out);
    out += (size_t)take * ch;
    at += take;
    n -= (int)take;
  }
}

LmRingPos lm_ring_resample(const LmRing *r, LmRingPos head, int32_t rate_from, int32_t rate_to, int16_t *out, int n) {
  const int ch = r->channels;
  const LmRingPos lo = (LmRingPos)lm_ring_oldest(r) * LM_POS_ONE;
  const LmRingPos hi = r->written > 0 ? (LmRingPos)(r->written - 1) * LM_POS_ONE : 0;
  for (int i = 0; i < n; i++) {
    int32_t rate = rate_from + (int32_t)((int64_t)(rate_to - rate_from) * i / n);
    int clamped = r->written == 0;
    if (head < lo) { head = lo; clamped = 1; }
    else if (head > hi) { head = hi; clamped = 1; }
    int16_t *dst = out + (size_t)i * (size_t)ch;
    if (clamped) {
      for (int c = 0; c < ch; c++) dst[c] = 0;
    } else {
      int32_t magnitude = rate < 0 ? -rate : rate;
      int32_t gain = magnitude >= LM_FULL_GAIN_RATE ? LM_RATE_ONE : (int32_t)((int64_t)magnitude * LM_RATE_ONE / LM_FULL_GAIN_RATE);
      uint64_t frame = (uint64_t)(head / LM_POS_ONE);
      int32_t frac = (int32_t)((head % LM_POS_ONE) / 65536); /* 0..65535 */
      uint64_t next = frame + 1 < r->written ? frame + 1 : frame;
      const int16_t *a = frame_at(r, frame), *b = frame_at(r, next);
      for (int c = 0; c < ch; c++) {
        int32_t v = a[c] + (int32_t)((int64_t)(b[c] - a[c]) * frac / 65536);
        dst[c] = (int16_t)((int64_t)v * gain / LM_RATE_ONE);
      }
    }
    head += (LmRingPos)rate * 65536; /* 16.16 frames per output frame, as 32.32 */
  }
  return head;
}
```

- [ ] **Step 6: Run the test to see it pass**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts -t ring`
Expected: PASS, output contains `localmedia ring verified`.

- [ ] **Step 7: Commit**

```bash
cd runtime
git add hosts/3ds/src/localmedia_ring.h hosts/3ds/src/localmedia_ring.c tests/fixtures/localmedia/ring-test.c tests/localmedia-native.test.ts
git commit -m "feat(localmedia): a PCM history ring with a signed-rate resampler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: The player decodes into the ring

Normal playback moves onto the ring with no audible or timing change. Slots gain a start frame, a rate and a queue sequence, which Task 3's scratch slots need. The glue allocates the ring (2 MiB, else the 32 KiB fallback).

**Files:**
- Modify: `runtime/hosts/3ds/src/localmedia_player.h` (replace the whole file)
- Modify: `runtime/hosts/3ds/src/localmedia_player.c` (replace everything after the minimp3 include block, i.e. from `static void set_message` to the end)
- Modify: `runtime/hosts/3ds/src/localmedia.c` (ring allocation, `lm_player_open` call, free on stop)
- Modify: `runtime/hosts/3ds/Makefile` (object list and dependencies)
- Modify: `runtime/tests/fixtures/localmedia/player-test.c`
- Modify: `runtime/tests/localmedia-native.test.ts` (source lists)

**Interfaces:**
- Consumes: Task 1's `localmedia_ring.h`.
- Produces (used by Tasks 3–4):
  - `int lm_player_open(LmPlayer *p, const LmSink *sink, int16_t *ring_pcm, uint32_t ring_frames, const char *path);` — `ring_pcm` holds `ring_frames * 2` samples; `ring_frames` is a power of two `>= LM_RING_MIN_FRAMES`.
  - `LmPlayer` fields `ring`, `head`, `slot_start[]` (int64 ring frames), `slot_rate[]` (16.16), `slot_seq[]`, `next_seq`.
  - Static helpers in `localmedia_player.c` that Task 3 calls: `decode_frame(p)`, `decode_ahead(p, from, ahead)`, `queue_slot(p, slot, frames, start, rate)`, `ms_at(p, frames)`.
  - In `localmedia.c`: `static int16_t *ring_pcm; static uint32_t ring_frames;`.

- [ ] **Step 1: Write the failing test changes**

In `runtime/tests/fixtures/localmedia/player-test.c`:

1. After `static LmPlayer player;` add:

```c
/* The PCM ring: scratch-capable, and the smallest that normal playback accepts. */
static int16_t ring_big[LM_RING_FRAMES * 2];
static int16_t ring_small[LM_RING_MIN_FRAMES * 2];
#define OPEN(path) lm_player_open(&player, &sink, ring_big, LM_RING_FRAMES, path)
```

2. Replace every `lm_player_open(&player, &sink, ` with `OPEN(` keeping the path argument, e.g. `CHECK(lm_player_open(&player, &sink, "cbr-info.mp3"));` becomes `CHECK(OPEN("cbr-info.mp3"));`. There are 9 calls; `CHECK(!lm_player_open(&player, &sink, "no-such-file.mp3"));` becomes `CHECK(!OPEN("no-such-file.mp3"));`.

3. Before `/* Failures: a missing file, …` add:

```c
  /* The smallest ring plays a whole file the same way. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, ring_small, LM_RING_MIN_FRAMES, "cbr-info.mp3"));
  CHECK_INT(play_through(&player, &fake), 40 * 1152);
  CHECK_INT(lm_player_position(&player), 1044);
  lm_player_close(&player);

  /* Slots record where their audio starts in the ring, at rate 1, in queue order. */
  memset(&fake, 0, sizeof fake);
  CHECK(OPEN("cbr-info.mp3"));
  lm_player_pump(&player, 3);
  CHECK_INT(player.slot_start[0], 0);
  CHECK_INT(player.slot_start[1], LM_SLOT_FRAMES);
  CHECK_INT(player.slot_start[2], 2 * LM_SLOT_FRAMES);
  CHECK_INT(player.slot_rate[1], LM_RATE_ONE);
  CHECK(player.slot_seq[0] < player.slot_seq[1] && player.slot_seq[1] < player.slot_seq[2]);
  /* The ring holds what was queued, sample for sample. */
  int16_t first[LM_SLOT_FRAMES * 2];
  lm_ring_copy(&player.ring, LM_SLOT_FRAMES, first, LM_SLOT_FRAMES);
  CHECK(memcmp(first, fake.data[1], sizeof first) == 0);
  /* A wavebuf handover that reads the previous slot's count against the next slot's start
   * (a stale sample position) cannot move the normal-playback position backwards. */
  advance(&fake, LM_SLOT_FRAMES + 2000);   /* slot 1 playing, 2000 frames in */
  uint32_t at = lm_player_position(&player);
  fake.played = 0;                          /* the DSP reports the slot's start for a moment */
  CHECK_INT(lm_player_position(&player), at);
  lm_player_close(&player);

```

In `runtime/tests/localmedia-native.test.ts`:
- The player test's sources: `["localmedia_player.c", "localmedia_mp3.c", "localmedia_tags.c"]` → `["localmedia_player.c", "localmedia_ring.c", "localmedia_mp3.c", "localmedia_tags.c"]`.
- The glue test's `units` array: add `"localmedia_ring.c"` after `"localmedia_player.c"`.

- [ ] **Step 2: Run to see it fail**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts -t "player|glue"`
Expected: FAIL — compile errors (`lm_player_open` takes 3 arguments; no `slot_rate` / `ring` members).

- [ ] **Step 3: Replace the player header**

`runtime/hosts/3ds/src/localmedia_player.h`:

```c
/*
 * media.local playback engine: one open MP3 decoded by minimp3 into a PCM
 * ring (localmedia_ring.h), copied from there into a ring of PCM16 slots
 * that an audio sink plays in submission order. Owns the file, the decoder,
 * positions, seeking, end of stream and underrun and decode-time accounting.
 * The sink (NDSP on the 3DS, a fake in the tests) owns the audio buffers and
 * reports which slot is playing.
 *
 * Pure C over stdio: compiled into the 3DS host and into the host-side tests.
 */
#ifndef POCKETJS_LOCALMEDIA_PLAYER_H
#define POCKETJS_LOCALMEDIA_PLAYER_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#include "localmedia_mp3.h"
#include "localmedia_ring.h"
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
  uint32_t base_ms;          /* time of ring frame 0 (the open or the last seek) */
  LmRing ring;               /* frames decoded since base_ms; ring.written counts them */
  uint64_t head;             /* the ring frame the next normal slot starts at */
  int64_t slot_start[LM_SLOTS]; /* ring frame the slot's first output frame reads */
  int32_t slot_rate[LM_SLOTS];  /* the slot's mean rate, 16.16 ring frames per output frame */
  uint32_t slot_seq[LM_SLOTS];  /* queue order: larger was queued later */
  uint32_t next_seq;
  uint32_t position_ms;      /* last reported position (moves forward only in normal playback) */
  int queued_once;           /* a slot was queued since open/seek */
  int starved;               /* the current underrun was counted */
  uint32_t underruns;
  uint64_t decode_ticks;     /* ticks spent inside mp3dec_decode_frame */
  long junk;                 /* bytes skipped since the last decoded frame */
  mp3d_sample_t pcm[MINIMP3_MAX_SAMPLES_PER_FRAME];
} LmPlayer;

/* Opens path, configures the sink and decodes into ring_pcm, which holds ring_frames * 2 samples
 * (ring_frames: a power of two, at least LM_RING_MIN_FRAMES). Returns 1, or 0 with p->message set
 * ("File not found", "MP3 frame sync not found"). */
int lm_player_open(LmPlayer *p, const LmSink *sink, int16_t *ring_pcm, uint32_t ring_frames, const char *path);
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

- [ ] **Step 4: Replace the player body**

In `runtime/hosts/3ds/src/localmedia_player.c`, keep lines 1–18 (the comment, includes and the minimp3 block) and replace everything from `static void set_message` to the end with:

```c
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

/* Decodes the next frame into the ring. A valid frame whose bit reservoir was lost (the first
 * frames after a seek) appends its length in silence, so a ring frame is a decoded frame.
 * Returns the frames appended, or 0 at the end of the stream or on error. */
static int decode_frame(LmPlayer *p) {
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
      lm_ring_write(&p->ring, p->pcm, samples, info.channels);
      return samples;
    }
    if (info.hz > 0) {
      lm_ring_silence(&p->ring, (int)p->stream.first.samples);
      return (int)p->stream.first.samples;
    }
    p->junk += info.frame_bytes;
    if (p->junk >= LM_JUNK_LIMIT) { p->error = 1; set_message(p, "MP3 data unreadable"); return 0; }
  }
}

/* Decodes until the ring holds `ahead` frames past `from`, or the stream ends. */
static void decode_ahead(LmPlayer *p, uint64_t from, uint64_t ahead) {
  while (!p->eof && !p->error && p->ring.written < from + ahead && decode_frame(p) > 0) {}
}

int lm_player_open(LmPlayer *p, const LmSink *sink, int16_t *ring_pcm, uint32_t ring_frames, const char *path) {
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
  lm_ring_init(&p->ring, ring_pcm, ring_frames, p->channels);
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
  lm_ring_reset(&p->ring);
  p->head = 0;
  p->position_ms = ms;
  p->queued_once = 0;
  p->starved = 0;
}

int lm_player_queued(const LmPlayer *p) {
  int queued = 0;
  for (int slot = 0; slot < LM_SLOTS; slot++) queued += !p->sink->slot_free(p->sink->ctx, slot);
  return queued;
}

/* The time of a ring frame (frames before ring frame 0 read as its time). */
static uint32_t ms_at(const LmPlayer *p, int64_t frames) {
  if (frames < 0) frames = 0;
  return p->base_ms + (uint32_t)((uint64_t)frames * 1000 / (uint64_t)p->rate);
}

static uint32_t decoded_ms(const LmPlayer *p) {
  return ms_at(p, (int64_t)p->ring.written);
}

static void queue_slot(LmPlayer *p, int slot, int frames, int64_t start, int32_t rate) {
  p->slot_start[slot] = start;
  p->slot_rate[slot] = rate;
  p->slot_seq[slot] = ++p->next_seq;
  p->sink->queue(p->sink->ctx, slot, frames);
  p->queued_once = 1;
  p->starved = 0;
}

/* Fills one slot from the head; returns its frame count (0 when nothing was left). */
static int fill_slot(LmPlayer *p, int slot) {
  decode_ahead(p, p->head, LM_SLOT_FRAMES);
  uint64_t held = p->ring.written - p->head;
  int frames = held < LM_SLOT_FRAMES ? (int)held : LM_SLOT_FRAMES;
  if (frames == 0) return 0;
  lm_ring_copy(&p->ring, p->head, p->sink->slot_data(p->sink->ctx, slot), frames);
  queue_slot(p, slot, frames, (int64_t)p->head, LM_RATE_ONE);
  p->head += (uint64_t)frames;
  return frames;
}

LmPump lm_player_pump(LmPlayer *p, int max_slots) {
  if (!p->file) return LM_PUMP_ERROR;
  int queued = lm_player_queued(p);
  if (queued == 0 && p->queued_once && !p->eof && !p->error && !p->starved) {
    p->underruns++;
    p->starved = 1;
  }
  for (int slot = 0; slot < LM_SLOTS && max_slots > 0 && !p->error && (!p->eof || p->head < p->ring.written); slot++) {
    if (!p->sink->slot_free(p->sink->ctx, slot)) continue;
    if (fill_slot(p, slot) > 0) { queued++; max_slots--; }
  }
  if (queued > 0) return LM_PUMP_PLAYING;
  if (p->error) return LM_PUMP_ERROR;
  if (p->eof && p->head == p->ring.written) {
    p->position_ms = ms_at(p, (int64_t)p->head);
    return LM_PUMP_ENDED;
  }
  return LM_PUMP_PLAYING;
}

/* The ring frame the slot's `played`-th output frame read. */
static int64_t slot_frame(const LmPlayer *p, int slot, uint32_t played) {
  return p->slot_start[slot] + (int64_t)played * p->slot_rate[slot] / LM_RATE_ONE;
}

uint32_t lm_player_position(LmPlayer *p) {
  uint32_t played;
  int slot = p->sink->playing(p->sink->ctx, &played);
  uint32_t ms;
  if (slot >= 0) ms = ms_at(p, slot_frame(p, slot, played));
  /* Nothing is playing or waiting: everything queued so far has been heard. (Slots
   * queued before the DSP starts the first have not been.) */
  else if (p->queued_once && lm_player_queued(p) == 0) ms = ms_at(p, (int64_t)p->head);
  else return p->position_ms;
  /* Normal playback moves forward only: a wavebuf handover can pair the next slot's start
   * with a stale sample count for a moment. */
  if (ms > p->position_ms) p->position_ms = ms;
  return p->position_ms;
}

uint32_t lm_player_duration(const LmPlayer *p) {
  if (p->eof && lm_player_queued(p) == 0) return decoded_ms(p);
  return p->stream.duration_ms;
}
```


- [ ] **Step 5: Allocate the ring in the glue**

In `runtime/hosts/3ds/src/localmedia.c`:

1. After `static bool audio_ok;` add:

```c
/* The player's PCM ring: LM_RING_FRAMES frames when the heap allows (scratching), else the
 * LM_RING_MIN_FRAMES fallback (normal playback only). Freed by localmedia_stop. */
static int16_t *ring_pcm;
static uint32_t ring_frames;
```

2. In `audio_main`, replace `} else if (!lm_player_open(&player, &SINK, mail.path)) {` with `} else if (!lm_player_open(&player, &SINK, ring_pcm, ring_frames, mail.path)) {`.

3. In `localmedia_start`, replace

```c
  art_pixels = malloc(LM_ART_PIXELS_BYTES);
  if (!ids || !library || !art_pixels) return false;
```

with

```c
  art_pixels = malloc(LM_ART_PIXELS_BYTES);
  ring_frames = LM_RING_FRAMES;
  ring_pcm = malloc((size_t)LM_RING_FRAMES * 2 * sizeof *ring_pcm);
  if (!ring_pcm) {
    ring_frames = LM_RING_MIN_FRAMES;
    ring_pcm = malloc((size_t)LM_RING_MIN_FRAMES * 2 * sizeof *ring_pcm);
  }
  if (!ids || !library || !art_pixels || !ring_pcm) return false;
```

4. In `localmedia_stop`, after `art_pixels = NULL;` add:

```c
  free(ring_pcm);
  ring_pcm = NULL;
  ring_frames = 0;
```

In `runtime/hosts/3ds/Makefile`:
- In the `OBJECTS :=` line, insert ` $(BUILD)/localmedia_ring.o` after `$(BUILD)/localmedia_player.o`.
- Change the player dependency line to `$(BUILD)/localmedia_player.o: $(SOURCE)/localmedia_player.h $(SOURCE)/localmedia_ring.h $(SOURCE)/localmedia_mp3.h $(SOURCE)/localmedia_tags.h $(CURDIR)/vendor/minimp3.h`.
- Add the line `$(BUILD)/localmedia_ring.o: $(SOURCE)/localmedia_ring.h` after it.

- [ ] **Step 6: Run the native tests**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts`
Expected: PASS, all native tests (ring, player, glue and the rest). The existing player assertions (positions, seeks, the 0.38–0.46 s rest after a seek, underruns, failures) hold unchanged.

- [ ] **Step 7: Commit**

```bash
cd runtime
git add hosts/3ds/src/localmedia_player.h hosts/3ds/src/localmedia_player.c hosts/3ds/src/localmedia.c hosts/3ds/Makefile tests/fixtures/localmedia/player-test.c tests/localmedia-native.test.ts
git commit -m "refactor(localmedia): decode into the PCM ring; slots record start, rate and order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Scratch slots in the player

**Files:**
- Modify: `runtime/hosts/3ds/src/localmedia_player.h`
- Modify: `runtime/hosts/3ds/src/localmedia_player.c`
- Create: `runtime/tests/fixtures/localmedia/player-scratch-test.c`
- Modify: `runtime/tests/localmedia-native.test.ts` (add one test)

**Interfaces:**
- Consumes: Task 2's player (`decode_ahead`, `queue_slot`, `slot_frame`, `ms_at`, the slot fields).
- Produces (used by Task 4):
  - `#define LM_SCRATCH_FRAMES 1024`, `#define LM_SCRATCH_QUEUE 3`, `#define LM_SCRATCH_MAX_RATE (4 * LM_RATE_ONE)`
  - `int lm_player_can_scratch(const LmPlayer *p);`
  - `int lm_player_scratch_begin(LmPlayer *p);` (1 when scratching started)
  - `void lm_player_scratch_rate(LmPlayer *p, int32_t rate);` (16.16, clamped)
  - `void lm_player_scratch_end(LmPlayer *p);`
  - `LmPlayer.scratching` (int), `scratch_head` (LmRingPos), `scratch_rate`, `scratch_applied` (int32 16.16).
  - `lm_player_pump` while scratching: fills free slots while fewer than `LM_SCRATCH_QUEUE` are queued (at most `max_slots`), never returns `LM_PUMP_ENDED`, counts no underruns.

- [ ] **Step 1: Write the failing test**

`runtime/tests/fixtures/localmedia/player-scratch-test.c`:

```c
#include "../../../hosts/3ds/src/localmedia_player.h"
#include "check.h"

#include <stdlib.h>

/* The fake sink of player-test.c, plus a capture of every queued slot in order. */
typedef struct {
  int16_t data[LM_SLOTS][LM_SLOT_FRAMES * 2];
  int frames[LM_SLOTS];
  int fifo[LM_SLOTS], head, count;
  uint32_t played;
  int rate, channels, clears;
  uint64_t played_total;
  uint64_t tick;
} Fake;

static int16_t *capture;
static size_t captured, capture_frames;

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
  if (capture && captured + (size_t)frames <= capture_frames) {
    memcpy(capture + captured * 2, f->data[slot], (size_t)frames * 2 * sizeof *capture);
    captured += (size_t)frames;
  }
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
static int16_t ring_big[LM_RING_FRAMES * 2];
static int16_t ring_small[LM_RING_MIN_FRAMES * 2];
#define OPEN(path) lm_player_open(&player, &sink, ring_big, LM_RING_FRAMES, path)

static uint64_t play_through(LmPlayer *p, Fake *f) {
  LmPump state;
  int guard = 0;
  while ((state = lm_player_pump(p, LM_SLOTS)) == LM_PUMP_PLAYING && guard++ < 100000) advance(f, 1024);
  CHECK_INT(state, LM_PUMP_ENDED);
  return f->played_total;
}

/* The most recently queued slot still queued. */
static int newest_slot(void) {
  int best = -1;
  for (int s = 0; s < LM_SLOTS; s++)
    if (!fake_free(&fake, s) && (best < 0 || player.slot_seq[s] > player.slot_seq[best])) best = s;
  return best;
}

/* cbr-info.mp3 decoded straight through: 40 frames of 1152 at 44.1 kHz stereo. */
static int16_t ref[48000 * 2];

int main(void) {
  memset(&fake, 0, sizeof fake);
  capture = ref; captured = 0; capture_frames = 48000;
  CHECK(OPEN("cbr-info.mp3"));
  CHECK_INT(play_through(&player, &fake), 40 * 1152);
  lm_player_close(&player);
  capture = NULL;
  CHECK_INT(captured, 40 * 1152);

  /* A small ring cannot scratch; the attempt leaves normal playback alone. */
  memset(&fake, 0, sizeof fake);
  CHECK(lm_player_open(&player, &sink, ring_small, LM_RING_MIN_FRAMES, "cbr-info.mp3"));
  CHECK(!lm_player_can_scratch(&player));
  lm_player_pump(&player, 4);
  CHECK(!lm_player_scratch_begin(&player));
  CHECK_INT(player.scratching, 0);
  CHECK_INT(lm_player_queued(&player), 4);
  lm_player_close(&player);

  /* Begin: the queue drops, the head latches at the frame being heard, a still platter is silent. */
  memset(&fake, 0, sizeof fake);
  CHECK(OPEN("cbr-info.mp3"));
  CHECK(lm_player_can_scratch(&player));
  lm_player_pump(&player, 4);
  advance(&fake, 8820); /* 200 ms heard */
  int clears = fake.clears;
  CHECK(lm_player_scratch_begin(&player));
  CHECK_INT(fake.clears, clears + 1);
  CHECK_INT(lm_player_position(&player), 200);
  CHECK(!lm_player_scratch_begin(&player)); /* already scratching */
  CHECK_INT(lm_player_pump(&player, LM_SLOTS), LM_PUMP_PLAYING);
  CHECK_INT(lm_player_queued(&player), LM_SCRATCH_QUEUE);
  int silent = 1;
  for (int s = 0; s < LM_SLOTS; s++) {
    if (fake_free(&fake, s)) continue;
    CHECK_INT(fake.frames[s], LM_SCRATCH_FRAMES);
    CHECK_INT(player.slot_start[s], 8820);
    for (int i = 0; i < LM_SCRATCH_FRAMES * 2; i++) silent &= fake.data[s][i] == 0;
  }
  CHECK(silent);
  CHECK_INT(lm_player_position(&player), 200);

  /* Reverse at 2x: the ramp from 0 moves the head back 1023 frames; the next slot reads the
   * reference backwards, every other frame. */
  advance(&fake, 3 * LM_SCRATCH_FRAMES); /* the still slots play out */
  lm_player_scratch_rate(&player, -2 * LM_RATE_ONE);
  lm_player_pump(&player, 1); /* ramp 0 -> -2 */
  lm_player_pump(&player, 1); /* steady -2 */
  int s = newest_slot();
  CHECK_INT(player.slot_start[s], 8820 - 1023);
  CHECK_INT(player.slot_rate[s], -2 * LM_RATE_ONE);
  int same = 1;
  for (int i = 0; i < LM_SCRATCH_FRAMES; i++) {
    same &= fake.data[s][i * 2] == ref[(7797 - 2 * i) * 2];
    same &= fake.data[s][i * 2 + 1] == ref[(7797 - 2 * i) * 2 + 1];
  }
  CHECK(same);
  CHECK_INT(player.underruns, 0); /* the queue ran dry above: scratching counts no underruns */

  /* The position follows the platter backwards. */
  advance(&fake, LM_SCRATCH_FRAMES + 512); /* the ramp slot, then half the steady one */
  CHECK_INT(lm_player_position(&player), (7797 - 2 * 512) * 1000 / 44100);

  /* End: normal slots resume at the frame being heard, with nothing skipped or repeated. */
  lm_player_scratch_end(&player);
  CHECK_INT(player.scratching, 0);
  CHECK_INT(lm_player_queued(&player), 0);
  CHECK_INT(lm_player_position(&player), 6773 * 1000 / 44100);
  lm_player_pump(&player, 1);
  s = newest_slot();
  CHECK_INT(player.slot_start[s], 6773);
  CHECK_INT(player.slot_rate[s], LM_RATE_ONE);
  CHECK_INT(fake.frames[s], LM_SLOT_FRAMES);
  CHECK(memcmp(fake.data[s], ref + 6773 * 2, (size_t)LM_SLOT_FRAMES * 2 * sizeof *ref) == 0);

  /* Forward at 2x from a fresh grab: the ramp moves the head 1023 frames on; the next slot reads
   * every other frame forward (decoding ahead as it needs). */
  advance(&fake, 1000); /* frame 7773 heard */
  CHECK(lm_player_scratch_begin(&player));
  lm_player_pump(&player, LM_SLOTS);
  advance(&fake, 3 * LM_SCRATCH_FRAMES);
  lm_player_scratch_rate(&player, 2 * LM_RATE_ONE);
  lm_player_pump(&player, 1);
  lm_player_pump(&player, 1);
  s = newest_slot();
  CHECK_INT(player.slot_start[s], 7773 + 1023);
  same = 1;
  for (int i = 0; i < LM_SCRATCH_FRAMES; i++) same &= fake.data[s][i * 2] == ref[(8796 + 2 * i) * 2];
  CHECK(same);

  /* The rate clamps to 4x either way. */
  lm_player_scratch_rate(&player, 9 * LM_RATE_ONE);
  CHECK_INT(player.scratch_rate, LM_SCRATCH_MAX_RATE);
  lm_player_scratch_rate(&player, -9 * LM_RATE_ONE);
  CHECK_INT(player.scratch_rate, -LM_SCRATCH_MAX_RATE);

  /* Scratching forward into the end of the file holds at the last frame and never ends. */
  lm_player_scratch_rate(&player, LM_SCRATCH_MAX_RATE);
  int ended = 0;
  for (int i = 0; i < 200; i++) {
    advance(&fake, LM_SCRATCH_FRAMES);
    ended |= lm_player_pump(&player, LM_SLOTS) != LM_PUMP_PLAYING;
  }
  CHECK(!ended);
  CHECK(player.eof);
  CHECK(lm_player_position(&player) >= 1040 && lm_player_position(&player) <= 1044);
  /* After the lift the track ends as usual. */
  lm_player_scratch_end(&player);
  play_through(&player, &fake);
  lm_player_close(&player);

  /* Reverse to the start of the ring: the head holds at frame 0 and the platter goes silent. */
  memset(&fake, 0, sizeof fake);
  CHECK(OPEN("cbr-info.mp3"));
  lm_player_pump(&player, 4);
  advance(&fake, 4410);
  CHECK(lm_player_scratch_begin(&player));
  lm_player_scratch_rate(&player, -LM_SCRATCH_MAX_RATE);
  for (int i = 0; i < 20; i++) { lm_player_pump(&player, LM_SLOTS); advance(&fake, LM_SCRATCH_FRAMES); }
  lm_player_pump(&player, LM_SLOTS);
  s = newest_slot();
  CHECK_INT(player.slot_start[s], 0);
  /* Its first output frame reads frame 0 itself; every later one is below the ring: silence. */
  silent = 1;
  for (int i = 2; i < LM_SCRATCH_FRAMES * 2; i++) silent &= fake.data[s][i] == 0;
  CHECK(silent);
  CHECK_INT(lm_player_position(&player), 0);

  /* A seek ends scratching and restarts normal slots at the target. */
  lm_player_seek(&player, 500);
  CHECK_INT(player.scratching, 0);
  CHECK_INT(lm_player_pump(&player, 1), LM_PUMP_PLAYING);
  CHECK_INT(fake.frames[newest_slot()], LM_SLOT_FRAMES);
  CHECK_INT(lm_player_position(&player), 500);
  lm_player_close(&player);

  CHECK_DONE("localmedia player scratch");
}
```

Add to `runtime/tests/localmedia-native.test.ts`, after the `"player: decodes, …"` test:

```ts
  test("player scratch: begin latches the heard frame, reverse and forward read the ring, end resumes seamlessly, edges hold, never ends", () => {
    expect(run("player-scratch-test.c", ["localmedia_player.c", "localmedia_ring.c", "localmedia_mp3.c", "localmedia_tags.c"])).toContain("localmedia player scratch verified");
  }, 60_000);
```

- [ ] **Step 2: Run to see it fail**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts -t "player scratch"`
Expected: FAIL — compile errors (`lm_player_can_scratch`, `LM_SCRATCH_QUEUE` undeclared).

- [ ] **Step 3: Extend the header**

In `runtime/hosts/3ds/src/localmedia_player.h`:

After `#define LM_JUNK_LIMIT 65536` add:

```c
/* Scratch slots: 1024 frames (about 23 ms at 44.1 kHz), kept three deep. */
#define LM_SCRATCH_FRAMES 1024
#define LM_SCRATCH_QUEUE 3
/* The fastest scratch either way: 4x. */
#define LM_SCRATCH_MAX_RATE (4 * LM_RATE_ONE)
```

In `LmPlayer`, after `uint32_t next_seq;` add:

```c
  int scratching;            /* the guest holds the platter: slots resample the ring */
  LmRingPos scratch_head;    /* where the next scratch slot reads */
  int32_t scratch_rate;      /* the guest's rate (16.16) */
  int32_t scratch_applied;   /* the rate the last scratch slot ended on (16.16) */
```

Replace the `lm_player_pump` comment with:

```c
/* Counts an underrun when everything queued has played before the end, then fills up
 * to max_slots free slots. Reports ENDED once the last slot has played. While scratching it
 * fills free slots while fewer than LM_SCRATCH_QUEUE are queued (at most max_slots), counts no
 * underruns and never reports ENDED. */
```

Before `#endif` add:

```c
/* 1 when the ring can scratch (LM_RING_FRAMES frames). */
int lm_player_can_scratch(const LmPlayer *p);
/* Drops the queued audio and latches the scratch head at the frame being heard; slots then follow
 * lm_player_scratch_rate, initially 0 (silence). Returns 1 when scratching started; 0 with no
 * file, while scratching, or with a ring too small. */
int lm_player_scratch_begin(LmPlayer *p);
/* The guest's rate, 16.16 ring frames per output frame, clamped to ±LM_SCRATCH_MAX_RATE. Each
 * scratch slot ramps from the previous slot's rate to it. */
void lm_player_scratch_rate(LmPlayer *p, int32_t rate);
/* Drops the scratch slots and resumes normal slots at the frame being heard. */
void lm_player_scratch_end(LmPlayer *p);
```

- [ ] **Step 4: Implement scratching**

In `runtime/hosts/3ds/src/localmedia_player.c`:

1. In `lm_player_seek`, after `p->head = 0;` add:

```c
  p->scratching = 0;
  p->scratch_rate = p->scratch_applied = 0;
```

2. Move `slot_frame` above `lm_player_pump` (it is needed by the new helpers), and add these functions directly after it:

```c
/* A ring frame clamped to the frames held, or the end just past the newest. */
static int64_t held_frame(const LmPlayer *p, int64_t frame) {
  int64_t oldest = (int64_t)lm_ring_oldest(&p->ring), newest = (int64_t)p->ring.written;
  return frame < oldest ? oldest : frame > newest ? newest : frame;
}

/* The ring frame being heard: in the playing slot; else the start of the oldest queued slot
 * (queued, not started); else where the next slot reads. */
static int64_t playhead(const LmPlayer *p) {
  uint32_t played;
  int slot = p->sink->playing(p->sink->ctx, &played);
  if (slot >= 0) return held_frame(p, slot_frame(p, slot, played));
  int oldest = -1;
  for (int s = 0; s < LM_SLOTS; s++)
    if (!p->sink->slot_free(p->sink->ctx, s) && (oldest < 0 || p->slot_seq[s] < p->slot_seq[oldest])) oldest = s;
  if (oldest >= 0) return held_frame(p, p->slot_start[oldest]);
  return held_frame(p, p->scratching ? p->scratch_head / LM_POS_ONE : (int64_t)p->head);
}

/* Fills one scratch slot: ramps from the last slot's rate to the guest's, decoding ahead first
 * while the platter moves forward. */
static void fill_scratch_slot(LmPlayer *p, int slot) {
  int32_t from = p->scratch_applied, to = p->scratch_rate;
  int32_t fastest = from > to ? from : to;
  if (fastest > 0) {
    uint64_t at = p->scratch_head > 0 ? (uint64_t)(p->scratch_head / LM_POS_ONE) : 0;
    decode_ahead(p, at, (uint64_t)(2 * LM_SCRATCH_FRAMES) * (uint64_t)fastest / LM_RATE_ONE + 2);
  }
  /* The slot starts where its first frame reads: the head clamped as the resampler clamps it. */
  LmRingPos lo = (LmRingPos)lm_ring_oldest(&p->ring) * LM_POS_ONE;
  LmRingPos hi = p->ring.written > 0 ? (LmRingPos)(p->ring.written - 1) * LM_POS_ONE : 0;
  if (p->scratch_head < lo) p->scratch_head = lo;
  if (p->scratch_head > hi) p->scratch_head = hi;
  int64_t start = p->scratch_head / LM_POS_ONE;
  p->scratch_head = lm_ring_resample(&p->ring, p->scratch_head, from, to, p->sink->slot_data(p->sink->ctx, slot), LM_SCRATCH_FRAMES);
  queue_slot(p, slot, LM_SCRATCH_FRAMES, start, (int32_t)(((int64_t)from + to) / 2));
  p->scratch_applied = to;
}
```

3. At the top of `lm_player_pump`, after `int queued = lm_player_queued(p);`, insert:

```c
  if (p->scratching) {
    for (int slot = 0; slot < LM_SLOTS && max_slots > 0 && queued < LM_SCRATCH_QUEUE && !p->error; slot++) {
      if (!p->sink->slot_free(p->sink->ctx, slot)) continue;
      fill_scratch_slot(p, slot);
      queued++;
      max_slots--;
    }
    return p->error ? LM_PUMP_ERROR : LM_PUMP_PLAYING;
  }
```

4. Replace `lm_player_position` with:

```c
uint32_t lm_player_position(LmPlayer *p) {
  uint32_t played;
  int slot = p->sink->playing(p->sink->ctx, &played);
  int64_t frame;
  if (slot >= 0) frame = slot_frame(p, slot, played);
  /* Nothing is playing or waiting: everything queued so far has been heard. (Slots
   * queued before the DSP starts the first have not been.) */
  else if (p->queued_once && lm_player_queued(p) == 0) frame = p->scratching ? p->scratch_head / LM_POS_ONE : (int64_t)p->head;
  else return p->position_ms;
  /* A scratch moves both ways, inside the frames held. Normal playback moves forward only: a
   * wavebuf handover can pair the next slot's start with a stale sample count for a moment. */
  if (p->scratching) p->position_ms = ms_at(p, held_frame(p, frame));
  else if (ms_at(p, frame) > p->position_ms) p->position_ms = ms_at(p, frame);
  return p->position_ms;
}
```

5. At the end of the file add:

```c
int lm_player_can_scratch(const LmPlayer *p) { return p->ring.capacity >= LM_RING_FRAMES; }

int lm_player_scratch_begin(LmPlayer *p) {
  if (!p->file || p->scratching || !lm_player_can_scratch(p)) return 0;
  int64_t at = playhead(p);
  p->sink->clear(p->sink->ctx);
  p->scratching = 1;
  p->scratch_head = (LmRingPos)at * LM_POS_ONE;
  p->scratch_rate = p->scratch_applied = 0;
  p->position_ms = ms_at(p, at);
  p->queued_once = 0;
  p->starved = 0;
  return 1;
}

void lm_player_scratch_rate(LmPlayer *p, int32_t rate) {
  p->scratch_rate = rate > LM_SCRATCH_MAX_RATE ? LM_SCRATCH_MAX_RATE : rate < -LM_SCRATCH_MAX_RATE ? -LM_SCRATCH_MAX_RATE : rate;
}

void lm_player_scratch_end(LmPlayer *p) {
  if (!p->scratching) return;
  int64_t at = playhead(p);
  p->sink->clear(p->sink->ctx);
  p->scratching = 0;
  p->scratch_rate = p->scratch_applied = 0;
  p->head = (uint64_t)at;
  p->position_ms = ms_at(p, at);
  p->queued_once = 0;
  p->starved = 0;
}
```

- [ ] **Step 5: Run the native tests**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts`
Expected: PASS, including `localmedia player scratch verified`; ring, player and glue tests stay green.

If a number in the test is off, re-derive it before changing code: a ramp from 0 to ±2× over 1024 frames moves the head exactly ±1023 frames (rates `±128·i`, summed), and 200 ms at 44.1 kHz is frame 8820.

- [ ] **Step 6: Commit**

```bash
cd runtime
git add hosts/3ds/src/localmedia_player.h hosts/3ds/src/localmedia_player.c tests/fixtures/localmedia/player-scratch-test.c tests/localmedia-native.test.ts
git commit -m "feat(localmedia): scratch slots resample the ring at the guest's signed rate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Scratch commands in the 3DS glue and host bindings

**Files:**
- Modify: `runtime/hosts/3ds/src/localmedia.h`
- Modify: `runtime/hosts/3ds/src/localmedia.c`
- Modify: `runtime/hosts/3ds/src/qjs.c` (enum near line 56, `host_operation` cases near line 298, `add_operation` calls near line 684)
- Modify: `runtime/tests/fixtures/localmedia/glue/glue-test.c`
- Modify: `runtime/tools/3ds-profile.ts`, `runtime/tests/3ds-profile.test.ts`

**Interfaces:**
- Consumes: Task 3's `lm_player_scratch_begin/rate/end`, `LM_SCRATCH_QUEUE`, `LM_SCRATCH_MAX_RATE`, `LM_RATE_ONE`, `LM_RING_FRAMES`; Task 2's `ring_pcm` / `ring_frames`.
- Produces (used by Task 5's contract and the 3DS host):
  - `void localmedia_scratch_begin(void); void localmedia_scratch_rate(double rate); void localmedia_scratch_end(void);`
  - Status JSON ends with `,"scratching":true|false}`.
  - Host operations on `globalThis.localmedia`: `scratchBegin()` (arity 0), `scratchRate(rate)` (arity 1), `scratchEnd()` (arity 0).
  - `THREE_DS_DEV_HOST_ABI = 13`.

- [ ] **Step 1: Write the failing glue test**

In `runtime/tests/fixtures/localmedia/glue/glue-test.c`, insert before the comment `/* Out of memory during a rescan …`:

```c
  /* Scratching: the snapshot reads back at once; the audio thread swaps the queue for three
   * 1024-frame slots, a lift returns to normal slots, and an open or a seek ends it. */
  CHECK(localmedia_open(b) > 0);
  WAIT_UNTIL(phase_is("playing") && fake_queued() >= 4, 2000);
  CHECK(strstr(read_status(), "\"scratching\":false") != NULL);
  localmedia_scratch_begin();
  CHECK(strstr(read_status(), "\"scratching\":true") != NULL);
  WAIT_UNTIL(fake_queued() == 3, 2000);
  fake_hold(true);
  sleep_ms(30);
  CHECK_INT(fake_drain(1u << 30), 3 * 1024);
  fake_hold(false);
  localmedia_scratch_rate(-1.0);
  WAIT_UNTIL(fake_queued() == 3, 2000);
  CHECK_INT(fake_queued(), 3);
  CHECK(phase_is("playing"));
  localmedia_scratch_end();
  CHECK(strstr(read_status(), "\"scratching\":false") != NULL);
  WAIT_UNTIL(fake_queued() >= 4, 2000);
  CHECK(fake_queued() >= 4);
  /* Paused, the platter still plays its slots, and the snapshot stays paused. */
  localmedia_paused(true);
  localmedia_scratch_begin();
  CHECK(strstr(read_status(), "\"scratching\":true") != NULL);
  CHECK(phase_is("paused"));
  WAIT_UNTIL(fake_queued() == 3, 2000);
  CHECK_INT(fake_queued(), 3);
  localmedia_scratch_end();
  localmedia_paused(false);
  /* An open ends scratching; so does a seek. */
  localmedia_scratch_begin();
  CHECK(localmedia_open(a) > 0);
  CHECK(strstr(read_status(), "\"scratching\":false") != NULL);
  WAIT_UNTIL(phase_is("playing"), 2000);
  localmedia_scratch_begin();
  CHECK(strstr(read_status(), "\"scratching\":true") != NULL);
  localmedia_seek(100);
  CHECK(strstr(read_status(), "\"scratching\":false") != NULL);
  /* An ended track ignores a grab. */
  WAIT_UNTIL((fake_drain(1u << 30), phase_is("ended")), 3000);
  CHECK(phase_is("ended"));
  localmedia_scratch_begin();
  CHECK(strstr(read_status(), "\"scratching\":false") != NULL);
```

In `runtime/tests/3ds-profile.test.ts`, change the comment and expectation in `"takes the next hostAbi in the registry-wide sequence"`:

```ts
    // 12 on-device MP3 playback (media.local), 13 media.local scratching.
    // A collision would let a bundle mount on the wrong host.
    expect(THREE_DS_DEV_HOST_ABI).toBe(13);
```

(The line `// 12 on-device MP3 playback (media.local).` becomes the first line above.)

- [ ] **Step 2: Run to see it fail**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts -t glue && bun test tests/3ds-profile.test.ts`
Expected: FAIL — `localmedia_scratch_begin` undeclared; hostAbi is 12.

- [ ] **Step 3: Declare the commands**

In `runtime/hosts/3ds/src/localmedia.h`, before `int32_t localmedia_artwork(int32_t id);` add:

```c
/* The guest holds the platter: ignored unless a track is playing or paused and the 2 MiB ring
 * was allocated. open and seek end it. */
void localmedia_scratch_begin(void);
/* Signed rate while held: 1 forward, -1 reverse, 0 still; clamped to ±4. */
void localmedia_scratch_rate(double rate);
void localmedia_scratch_end(void);
```

- [ ] **Step 4: Implement them in the glue**

In `runtime/hosts/3ds/src/localmedia.c`:

1. After `#define WAKE_NS 10000000LL` add:

```c
/* While scratching, slots are 23 ms long: the audio thread waits at most 5 ms. */
#define SCRATCH_WAKE_NS 5000000LL
```

2. After `static _Atomic unsigned volume_percent = 100;` add:

```c
static _Atomic bool scratch_flag;       /* the guest holds the platter (UI thread writes) */
static _Atomic int32_t scratch_rate_fp; /* its rate, 16.16, clamped (UI thread writes) */
```

3. In `audio_main`:
   - After `bool applied_paused = false;` add `bool applied_scratch = false;`
   - In the open branch, after `handled = true;` (the first one, inside `if (mail.generation > handled_open)`), add `applied_scratch = false;`
   - In the seek branch, after `handled = true;`, add `applied_scratch = false;`
   - Replace

```c
    if (handled) publish(generation, phase, error);
    bool paused = atomic_load(&paused_flag);
    if (paused != applied_paused) { ndspChnSetPaused(CHANNEL, paused); applied_paused = paused; }
```

   with

```c
    if (handled) publish(generation, phase, error);
    /* The platter follows the guest's flag. While held, the channel plays whatever the pause flag
     * says; the lift restores the pause and refills normal slots from the frame being heard. */
    bool scratch = atomic_load(&scratch_flag) && player_open && phase == PLAYING;
    if (scratch && !applied_scratch && lm_player_scratch_begin(&player)) {
      applied_scratch = true;
      applied_paused = false;
      ndspChnSetPaused(CHANNEL, false);
    } else if (!scratch && applied_scratch) {
      applied_scratch = false;
      lm_player_scratch_end(&player);
      applied_paused = atomic_load(&paused_flag);
      ndspChnSetPaused(CHANNEL, applied_paused);
      uint64_t before = player.decode_ticks;
      LmPump state = lm_player_pump(&player, PREFILL_SLOTS);
      window_decode += player.decode_ticks - before;
      if (state == LM_PUMP_ERROR) phase = FAILED;
      else if (state == LM_PUMP_ENDED) phase = ENDED;
    }
    if (applied_scratch) lm_player_scratch_rate(&player, atomic_load(&scratch_rate_fp));
    bool paused = atomic_load(&paused_flag);
    if (!applied_scratch && paused != applied_paused) { ndspChnSetPaused(CHANNEL, paused); applied_paused = paused; }
```

   - In the `if (player_open && phase == PLAYING)` block, replace `LmPump state = lm_player_pump(&player, 1);` with `LmPump state = lm_player_pump(&player, applied_scratch ? LM_SCRATCH_QUEUE : 1);`, and replace the `hurry = …` line with:

```c
      hurry = !applied_scratch && phase == PLAYING && !paused && !player.eof && !player.error && lm_player_queued(&player) < PREFILL_SLOTS;
```

   - Replace `if (!hurry) LightEvent_WaitTimeout(&audio_wake, WAKE_NS);` with `if (!hurry) LightEvent_WaitTimeout(&audio_wake, applied_scratch ? SCRATCH_WAKE_NS : WAKE_NS);`

4. In `localmedia_forget_guest`, after `atomic_store(&paused_flag, false);` add `atomic_store(&scratch_flag, false);`

5. In `localmedia_open`, after `atomic_store(&paused_flag, false);` add `atomic_store(&scratch_flag, false);`

6. In `localmedia_seek`, make the first statement `atomic_store(&scratch_flag, false);` (before `unsigned position, …`).

7. After `localmedia_volume` add:

```c
void localmedia_scratch_begin(void) {
  unsigned position, duration, error;
  unsigned shown = command_track < 0 ? IDLE : visible_phase(base_phase(&position, &duration, &error));
  if ((shown != PLAYING && shown != PAUSED) || ring_frames < LM_RING_FRAMES) return;
  atomic_store(&scratch_rate_fp, 0);
  atomic_store(&scratch_flag, true);
  LightEvent_Signal(&audio_wake);
}

void localmedia_scratch_rate(double rate) {
  const double limit = (double)LM_SCRATCH_MAX_RATE / LM_RATE_ONE;
  double clamped = !isfinite(rate) ? 0 : rate < -limit ? -limit : rate > limit ? limit : rate;
  atomic_store(&scratch_rate_fp, (int32_t)lround(clamped * LM_RATE_ONE));
  LightEvent_Signal(&audio_wake);
}

void localmedia_scratch_end(void) {
  if (!atomic_exchange(&scratch_flag, false)) return;
  atomic_store(&scratch_rate_fp, 0);
  LightEvent_Signal(&audio_wake);
}
```

8. In `localmedia_status`, change the format string's tail from `\"artHandles\":%d}"` to `\"artHandles\":%d,\"scratching\":%s}"` and append the argument `atomic_load(&scratch_flag) ? "true" : "false"` after `art_handle_count`.

- [ ] **Step 5: Bind the host operations**

In `runtime/hosts/3ds/src/qjs.c`:
- In the `HostOperation` enum, change `HostLocalArtwork, HostLocalReleaseArtwork,` to `HostLocalArtwork, HostLocalReleaseArtwork, HostLocalScratchBegin, HostLocalScratchRate, HostLocalScratchEnd,`.
- After `case HostLocalReleaseArtwork: …` add:

```c
    case HostLocalScratchBegin: localmedia_scratch_begin(); return JS_UNDEFINED;
    case HostLocalScratchRate: localmedia_scratch_rate(argument_float(ctx, argc, argv, 0)); return JS_UNDEFINED;
    case HostLocalScratchEnd: localmedia_scratch_end(); return JS_UNDEFINED;
```

- After `add_operation(localmedia, "releaseArtwork", 1, HostLocalReleaseArtwork);` add:

```c
  add_operation(localmedia, "scratchBegin", 0, HostLocalScratchBegin);
  add_operation(localmedia, "scratchRate", 1, HostLocalScratchRate);
  add_operation(localmedia, "scratchEnd", 0, HostLocalScratchEnd);
```

In `runtime/tools/3ds-profile.ts`: `export const THREE_DS_DEV_HOST_ABI = 13;`

- [ ] **Step 6: Run the tests**

Run (in `runtime/`): `bun test tests/localmedia-native.test.ts tests/3ds-profile.test.ts`
Expected: PASS (all native tests including glue; the profile test with 13).

- [ ] **Step 7: Commit**

```bash
cd runtime
git add hosts/3ds/src/localmedia.h hosts/3ds/src/localmedia.c hosts/3ds/src/qjs.c tests/fixtures/localmedia/glue/glue-test.c tools/3ds-profile.ts tests/3ds-profile.test.ts
git commit -m "feat(localmedia): scratchBegin, scratchRate and scratchEnd in the 3DS host (hostAbi 13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Contract v3 and the SDK

**Files:**
- Modify: `runtime/contracts/spec/localmedia.ts`
- Modify: `runtime/framework/src/localmedia.ts`
- Modify: `runtime/tests/localmedia.test.ts`

**Interfaces:**
- Consumes: Task 4's host ops and status field.
- Produces (used by Task 6 and by ipo-ds Plan 8):
  - `LOCALMEDIA = { version: 3, root: "sdmc:/music/", maxTracks: 2048, artMax: 128, maxScratchRate: 4 }`
  - `LocalStatus.scratching: boolean`
  - `LocalMediaOps.scratchBegin(): void; scratchRate(rate: number): void; scratchEnd(): void;`
  - SDK `LocalMedia.scratchBegin(): void; scratchRate(rate: number): void; scratchEnd(): void;` — `scratchRate` clamps to ±`maxScratchRate` and turns a non-finite rate into 0.

- [ ] **Step 1: Write the failing tests**

In `runtime/tests/localmedia.test.ts`:
- Add `scratching: false` to the end of the `STATUS` object literal.
- In `recorder`, add to `ops` before `...over`:

```ts
    scratchBegin: () => void calls.push("scratchBegin"),
    scratchRate: (rate) => void calls.push(`scratchRate ${rate}`),
    scratchEnd: () => void calls.push("scratchEnd"),
```

- In `"status and tracks are parsed and validated"`, add `expect(validLocalStatus({ ...STATUS, scratching: undefined })).toBe(false);` and change the last line to `expect(LOCALMEDIA).toEqual({ version: 3, root: "sdmc:/music/", maxTracks: 2048, artMax: 128, maxScratchRate: 4 });`
- Add a test after `"volume and seek are clamped before they cross; ids must be track ids"`:

```ts
test("scratch ops cross; the rate is clamped to ±maxScratchRate and a non-finite rate is 0", () => {
  const { calls, ops } = recorder();
  const media = localMedia(ops);
  media.scratchBegin();
  media.scratchRate(-1.5); media.scratchRate(9); media.scratchRate(-9); media.scratchRate(NaN); media.scratchRate(Infinity);
  media.scratchEnd();
  expect(calls).toEqual(["scratchBegin", "scratchRate -1.5", "scratchRate 4", "scratchRate -4", "scratchRate 0", "scratchRate 0", "scratchEnd"]);
  expect(localMedia(ops).status().scratching).toBe(false);
});
```

- [ ] **Step 2: Run to see it fail**

Run (in `runtime/`): `bun test tests/localmedia.test.ts`
Expected: FAIL — type errors are not checked by bun, so the failures are `media.scratchBegin is not a function` and the `LOCALMEDIA` equality.

- [ ] **Step 3: Update the contract**

In `runtime/contracts/spec/localmedia.ts`:

1. Append to the header comment, before ` * Artwork: …`:

```ts
 * Scratching: scratchBegin() hands the platter to the guest. Queued audio is
 * dropped, the head latches at the frame being heard, and output follows
 * scratchRate(rate) (1 forward at normal speed, -1 reverse, 0 still and
 * silent), even while paused. The host keeps about 10 s of decoded audio
 * behind the playhead; a scratch past it holds at the oldest frame.
 * scratchEnd() resumes normal playback, or the pause, from the frame being
 * heard. scratchBegin() is ignored unless the phase is playing or paused;
 * open() and seek() end scratching. Every scratch op updates `scratching` in
 * the snapshot before it returns.
 *
```

2. Change `LOCALMEDIA` to:

```ts
export const LOCALMEDIA = Object.freeze({
  version: 3,
  /** Scanned non-recursively for *.mp3 (extension case-insensitive). */
  root: "sdmc:/music/",
  maxTracks: 2048,
  /** Edge of the square artwork texture: the picture is centre-cropped to a square, then scaled. */
  artMax: 128,
  /** The fastest scratch either way, as a multiple of normal speed. */
  maxScratchRate: 4,
});
```

3. In `LocalStatus`, replace `positionMs: number;` with:

```ts
  /** Moves forward in normal playback; may decrease while `scratching`. */
  positionMs: number;
```

   and after `artHandles: number;` add:

```ts
  /** The guest holds the platter (scratchBegin() accepted, no scratchEnd(), open() or seek() since). */
  scratching: boolean;
```

4. In `LocalMediaOps`, after `releaseArtwork(handle: number): void;` add:

```ts
  /** Hands the platter to the guest (see Scratching above). */
  scratchBegin(): void;
  /** Signed multiple of normal speed while scratching; the host clamps to ±maxScratchRate. */
  scratchRate(rate: number): void;
  /** Resumes normal playback, or the pause, from the frame being heard. */
  scratchEnd(): void;
```

5. In `validLocalStatus`, change the last line to `&& isInt(value.decodeLoad) && isInt(value.artHandles) && typeof value.scratching === "boolean";`

- [ ] **Step 4: Update the SDK**

In `runtime/framework/src/localmedia.ts`:

1. In `interface LocalMedia`, after `releaseArtwork(handle: number): void;` add:

```ts
  /** Hands the platter to the guest: queued audio drops and output follows scratchRate. */
  scratchBegin(): void;
  /** Signed multiple of normal speed, clamped to ±LOCALMEDIA.maxScratchRate; non-finite reads as 0. */
  scratchRate(rate: number): void;
  scratchEnd(): void;
```

2. In the returned object, after `releaseArtwork(handle) { … },` add:

```ts
    scratchBegin: () => ops.scratchBegin(),
    scratchRate: (rate) => ops.scratchRate(Number.isFinite(rate) ? Math.min(LOCALMEDIA.maxScratchRate, Math.max(-LOCALMEDIA.maxScratchRate, rate)) : 0),
    scratchEnd: () => ops.scratchEnd(),
```

- [ ] **Step 5: Run the tests**

Run (in `runtime/`): `bun test tests/localmedia.test.ts`
Expected: PASS. (`tests/localmedia-sim.test.ts` may fail to type-check in an editor until Task 6; bun does not type-check, and its runtime behaviour is unchanged.)

- [ ] **Step 6: Commit**

```bash
cd runtime
git add contracts/spec/localmedia.ts framework/src/localmedia.ts tests/localmedia.test.ts
git commit -m "feat(localmedia): contract v3: scratchBegin, scratchRate, scratchEnd and status.scratching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Scratching in the sim fake

**Files:**
- Modify: `runtime/hosts/sim/localmedia.ts`
- Modify: `runtime/tests/localmedia-sim.test.ts`

**Interfaces:**
- Consumes: Task 5's contract.
- Produces (used by ipo-ds Plan 8's headless tests): the fake's `ns` implements the three ops; `log` records `scratchBegin()`, `scratchRate(<rate>)` (the value as received, after the SDK clamp), `scratchEnd()`; `advance(ms)` moves the position by `rate × ms` while scratching.

- [ ] **Step 1: Write the failing test**

Append to `runtime/tests/localmedia-sim.test.ts`:

```ts
test("scratching moves the position by rate × time either way, within 10 s behind the grab, paused too, and never ends", () => {
  const { host, media } = setup();
  media.scan();
  media.open(0); // 1000 ms
  host.advance(1);
  host.advance(400);
  expect(media.status()).toMatchObject({ phase: "playing", positionMs: 400, scratching: false });
  media.scratchBegin();
  expect(media.status().scratching).toBe(true);
  host.advance(100); // rate 0: still
  expect(media.status().positionMs).toBe(400);
  media.scratchRate(-1);
  host.advance(100);
  expect(media.status().positionMs).toBe(300);
  media.scratchRate(-4);
  host.advance(1000); // clamped at 0 (the start is within 10 s)
  expect(media.status().positionMs).toBe(0);
  media.scratchRate(4);
  host.advance(1000); // clamped at the duration, and not ended
  expect(media.status()).toMatchObject({ positionMs: 1000, phase: "playing", scratching: true });
  media.scratchEnd();
  expect(media.status().scratching).toBe(false);
  host.advance(1);
  expect(media.status().phase).toBe("ended");
  expect(host.log.filter((entry) => entry.startsWith("scratch"))).toEqual(["scratchBegin()", "scratchRate(-1)", "scratchRate(-4)", "scratchRate(4)", "scratchEnd()"]);
});

test("a grab is ignored unless playing or paused; paused scratching moves and stays paused; open and seek end it", () => {
  const { host, media } = setup();
  media.scan();
  media.scratchBegin(); // idle
  expect(media.status().scratching).toBe(false);
  media.open(1); // 2000 ms
  media.scratchBegin(); // loading
  expect(media.status().scratching).toBe(false);
  host.advance(1);
  media.pause(true);
  media.scratchBegin();
  media.scratchRate(1);
  host.advance(250);
  expect(media.status()).toMatchObject({ phase: "paused", scratching: true, positionMs: 250 });
  media.scratchEnd();
  host.advance(250);
  expect(media.status()).toMatchObject({ phase: "paused", positionMs: 250 });
  media.pause(false);
  media.scratchBegin();
  media.seek(1000);
  expect(media.status().scratching).toBe(false);
  media.scratchBegin();
  media.open(0);
  expect(media.status().scratching).toBe(false);
});

test("a long reverse scratch holds 10 s behind the grab", () => {
  const host = createSimLocalMedia([{ file: "long.mp3", durationMs: 60_000 }]);
  const media = localMedia(host.ns);
  media.scan();
  media.open(0);
  host.advance(1);
  host.advance(30_000);
  media.scratchBegin();
  media.scratchRate(-4);
  host.advance(5_000);
  expect(media.status().positionMs).toBe(20_000);
});
```

- [ ] **Step 2: Run to see it fail**

Run (in `runtime/`): `bun test tests/localmedia-sim.test.ts`
Expected: FAIL — `media.scratchBegin` calls `ops.scratchBegin`, which the fake lacks.

- [ ] **Step 3: Implement the fake**

In `runtime/hosts/sim/localmedia.ts`:

1. Add `scratching: false,` to the end of the initial `status` object (after `artHandles: 0,`).

2. After `let serial = 0;` add:

```ts
  /** While scratching: the rate, and the position at the grab (the history reaches 10 s behind it). */
  let scratchRate = 0;
  let grabbedAt = 0;
  const SCRATCH_HISTORY_MS = 10_000;
  const endScratch = () => {
    status.scratching = false;
    scratchRate = 0;
  };
```

3. In `open(id)`, after `if (!track) return 0;` add `endScratch();`.

4. In `seek(ms)`, make the first statement after `log.push(…)` `endScratch();`.

5. After the `releaseArtwork` op add:

```ts
    scratchBegin() {
      log.push("scratchBegin()");
      if (status.phase !== "playing" && status.phase !== "paused") return;
      status.scratching = true;
      scratchRate = 0;
      grabbedAt = position;
    },
    scratchRate(rate) {
      log.push(`scratchRate(${rate})`);
      if (status.scratching) scratchRate = rate;
    },
    scratchEnd() {
      log.push("scratchEnd()");
      endScratch();
    },
```

6. In `advance(ms)`, directly before `if (status.phase === "loading") {`, add:

```ts
      if (status.scratching) {
        const low = Math.max(0, grabbedAt - SCRATCH_HISTORY_MS);
        setPosition(Math.min(status.durationMs, Math.max(low, position + scratchRate * ms)));
        return;
      }
```

7. Update the file's header comment: after `Every command updates the snapshot before it returns (the contract's snapshot rule).` add ` While scratching, advance(ms) moves the position by rate × ms, between 10 s behind the grab and the duration, in any phase, and never ends the track.`

- [ ] **Step 4: Run the fork's localmedia tests**

Run (in `runtime/`): `bun test tests/localmedia.test.ts tests/localmedia-sim.test.ts tests/localmedia-native.test.ts tests/3ds-profile.test.ts`
Expected: PASS, all.

Then type-check the fork from the ipo-ds root (the fork has no tsc script): `cd .. && bun runtime/node_modules/typescript/bin/tsc --noEmit -p runtime/tsconfig.json 2>&1 | grep "error TS" | cut -d'(' -f1 | sort -u`
Expected: exactly one line, `runtime/tests/pocket3d-icon.test.ts` (an error that predates this plan). Any `localmedia` or `3ds-profile` file in the list is a regression to fix.

- [ ] **Step 5: Commit**

```bash
cd runtime
git add hosts/sim/localmedia.ts tests/localmedia-sim.test.ts
git commit -m "feat(localmedia): the sim fake scratches: rate × time within a 10 s history, never ends

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Compile the 3DS host and record the plan's outcome

No new code: this task proves the C compiles for the ARM11 target and leaves the fork branch ready for Plan 8.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-08-dj-mode-07-scratch-engine.md` (tick the boxes; ipo-ds repo)

- [ ] **Step 1: Build the 3DS host with the fork branch**

The ipo-ds app does not type-check against contract v3 yet (Plan 8 Task 1 fixes that), but the 3DS build bundles without `tsc`. From the ipo-ds root, with `runtime/` on `dj-mode`:

```bash
bun run 3ds 2>&1 | tail -20
```

Expected: the Docker devkitARM build compiles `localmedia_ring.o`, `localmedia_player.o`, `localmedia.o` and `qjs.o` with no warnings from those files, and writes `dist/ipo-ds-main.3dsx`. If Docker is not running, start Docker Desktop and retry; report the failure if it persists.

- [ ] **Step 2: Check the branch**

```bash
cd runtime
git log --oneline origin/ipo-ds..dj-mode
git status --short
```

Expected: the six commits of Tasks 1–6, and a clean tree. Do not push; Plan 8's finishing step pushes the fork branch together with the ipo-ds PR.
