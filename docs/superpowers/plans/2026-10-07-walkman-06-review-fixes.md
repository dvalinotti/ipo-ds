# iPoDS — Plan 6: Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution method (user's choice):** subagent-driven, with **Sonnet** subagents (`model: "sonnet"`) as the per-task implementers and the per-task spec/quality reviewers, for efficiency. The controlling session dispatches one task at a time in the order below, verifies each task's test run before the next starts, and runs a whole-branch review at the end (Task 10 Step 4).

**Goal:** Resolve all 15 findings of the 2026-10-07 code review of `app/*` (7 correctness bugs, 4 efficiency items, 4 cleanups), each pinned by a regression test, on branch `fix/fable-review`.

**Architecture:**
- The session publishes a snapshot through one `publish()` path, from the poll and from `dispatch`, so a command's status shows on the frame it was issued; the 15 Hz poll cadence applies in every phase but `loading`.
- Frame-driven input gets a pure latch stepper (`stepLatch` in `app/input-timing.ts`) so a button held across the keyboard's close is not a press; the Explorer's list buttons sleep under any state panel, and the legend derives from the same panel kind as the panel itself (`panelOf` in `app/explorer/model.ts`).
- The A handler and the seek drag read fresh state at the moment they act (the frame's own move, tab step or track change) instead of settled values that lag until the frame's batch ends.
- Per-track search keys, a no-op `prune`, one `TAB_ORDER`, a status-free `PlayerView` type and the removal of test-only wrappers close the efficiency and cleanup findings.

**Tech Stack:** TypeScript, SolidJS 1.9 via `@pocketjs/framework` (`runtime` submodule, pin unchanged), the PocketJS sim host (`runtime/hosts/sim`), Bun tests, Azahar via `bun run perf` (final check only).

**Spec:** the review findings, listed under *Findings → Tasks* below (there is no separate spec document; this section is the spec).

## Findings → Tasks

| # | File (reported line) | Finding | Task |
|---|---|---|---|
| 1 | `app/session.ts:166` | `dispatch` never copies the controller's re-read status into the `status` signal: one frame shows the new queue place with the old song | 1 |
| 10 | `app/session.ts:89` | the 15 Hz poll gate applies only while `playing`; idle/paused/ended read the host every frame | 1 |
| 2 | `app/now-playing/now-playing.tsx:50` | a seek drag that outlives the song commits its preview to the next song | 2 |
| 3 | `app/now-playing/now-playing.tsx:41` | with `durationMs` 0 every touch on the seek track maps to 0 and restarts the song | 2 |
| 7 | `app/input.ts:24` | `onTapOrHold` / `onRepeat` are not latched: a button held across the keyboard's close counts as a press | 3 |
| 4 | `app/explorer/explorer.tsx:112` | the A handler reads the settled `focus()` (and a `rows()` memo keyed on a settled value), stale on the frame of a move or tab step | 4 |
| 9 | `app/explorer/explorer.tsx:114` | `visibleSongIds` is a second full `rows()` pass on every A press | 4 |
| 5 | `app/explorer/explorer.tsx:110` | only the X tap is gated on the read-error panel; A/B/d-pad/analog act on the hidden list | 5 |
| 6 | `app/explorer/model.ts:201` | `legendOf` only knows `hasSongs`: the scanning panel's legend says "X Scan again" | 5 |
| 8 | `app/library/library.ts:76` | `rows()` with a query normalizes title, artist and album of every track on every keystroke | 6 |
| 11 | `app/player/reducer.ts:113` | `prune` always allocates, so the player signal fires after every scan | 7 |
| 12 | `app/theme/parts/toolbar.tsx:14` | `TABS` duplicates `TAB_ORDER` | 8 |
| 13 | `app/session.ts:61` | `player().status` is exposed but never notifies | 8 |
| 14 | `app/explorer/model.ts:128` | `headerOf` / `rowCells` / `crumbOf` have no app callers | 9 |
| 15 | `app/theme/parts/deck.tsx:2` | stale "Presentational only / Plan 3" header comments (also `app/gallery/states.tsx:2`) | 9 |

## Global Constraints

- **Branch:** `fix/fable-review` (already created from `main` at `59395f0`). Every task commits there; the merge to `main` is the user's call after review.
- **No fork changes.** Everything is in ipo-ds (`app/`, `tests/`, `docs/`). The `runtime` pin does not move. Framework imports come from `@pocketjs/framework/*`; Solid primitives from `solid-js` (CLAUDE.md).
- **Worktree setup (once, Task 0):** this worktree has no `runtime/` checkout and no `node_modules/`. Run `git submodule update --init runtime`, then `bun install --cwd runtime`, then `bun scripts/setup.ts` (symlinks `@pocketjs/framework`, `solid-js`, `@types`, `bun-types`).
- **Frame model (what every fix leans on):** `runFrameHooks` runs the whole frame inside one Solid `batch`: gesture callbacks (`onDown`/`onMove`/`onUp`) first, then every `onFrame` / `onButtonPress` hook in registration order. Inside the batch a plain signal write is visible at once, a `createMemo` read re-evaluates, but a signal written by `createComputed` (the app's `settled()`) does not update until the batch ends. The session's poll (`createSession`) registers before the Explorer mounts, so it runs before every Explorer handler in a frame.
- **Keyboard model:** the on-screen keyboard mutes every app `onButtonPress` while open (a button-handler block) but not `onFrame` reads, which the app gates with `active`. Its START chord commits and closes; it is registered by `<Osk>` (mounted after the Explorer), so it runs after the Explorer's hooks in the frame it closes.
- **Perf budgets (`docs/perf.md`):** CPU work per frame in `idle`, `scroll` and `now-playing` ≤ 14 ms on New, ≤ 30 ms on Old; Old `scroll` has ~4 ms of headroom. The op-count test "a focus move touches only the selection" (`tests/app.test.ts`) must stay green unchanged. No fix adds per-frame work to a focus move; Task 1 removes work from idle frames.
- **Gallery:** no visual change is intended. `bun run gallery` must produce 18 images byte-identical to `dist/gallery-baseline` (the gallery states carry their legends as fixtures, so the legend copy changes do not reach them).
- **Copy decisions (refinements the findings leave open):** the read-error panel's legend is `X  Hold to scan again` (an X tap over that panel is ignored on purpose; the hold rescans); the scanning panel's legend is `Y  Now Playing` (matches the approved gallery `scanning` state); the unavailable panel has an empty legend.
- **Tests:** `bun run test` (it passes `--conditions=browser`); a single file with `bun test --conditions=browser tests/<file>`; a single test with `-t "<name>"`. Never discover tests through `runtime/`. `dist/` stays out of Git. Sim tests take a `120_000` timeout and need `afterAll(disposeGuest)` (already in `tests/app.test.ts`).
- **Commits:** Conventional Commits, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

The inputs and conditions the findings imply but do not spell out, each pinned by a test in the owning task:

1. **A transport command from a touch (gesture path) on the same frame the poll runs:** the gesture dispatch publishes at once and the poll later in the frame re-reads (`pollNext`); the screens never see a mixed frame. *Pinned by Task 1's ZR test together with the existing "transport taps pause, skip, shuffle and cycle repeat".*
2. **A command while the host's status reads are failing:** `dispatch` keeps reporting the failure instead of publishing a half-read snapshot. *Pinned by the existing "a host whose status reads start failing is reported, survives taps, and recovers" (START over the panel), which must stay green after Task 1.*
3. **X held through the keyboard's close for longer than the hold time:** neither a tap (search reopens) nor a hold (rescan) fires. *Pinned by Task 3's sim test (X held 70 frames across START).*
4. **The empty-library panel keeps its tap:** an X tap over "No music found" still rescans and the legend still says "Scan again". *Pinned by Task 5's model test (`"empty"`) and its empty-library sim test.*
5. **A drag released on a song that has ended but not advanced (last song, repeat off):** no new open happened, so the release still seeks that song. *Pinned by Task 2's "a seek drag released after the last song ended still seeks that song".*

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `app/session.ts` | 1, 8 | `publish(now)` shared by poll and dispatch; poll gate in every phase but `loading`; `PlayerView` type |
| `app/now-playing/now-playing.tsx` | 2 | cancel the scrubber on a new open; no seek without a duration |
| `app/input-timing.ts` | 3 | pure `stepLatch(ignoring, down, active)` |
| `app/input.ts` | 3 | `onRepeat` / `onTapOrHold` latched through `stepLatch` |
| `app/explorer/model.ts` | 4, 5, 8, 9 | `songIds(rows)`; `ListPanel`, `panelOf`, `legendOf(state, panel)`; import `TAB_ORDER`; drop wrappers |
| `app/explorer/explorer.tsx` | 4, 5 | fresh-state A handler; `kind()` / `listActive` gating; panel from `kind()` |
| `app/library/library.ts` | 6 | `Library.searchKeys`; `rows()` matches on the key |
| `app/player/reducer.ts` | 7, 8 | `prune` returns the same state when nothing is dropped; `currentId` takes a `Pick` |
| `app/theme/theme.ts` | 8 | `TAB_ORDER` next to `Tab` |
| `app/theme/parts/toolbar.tsx` | 8 | import `TAB_ORDER`, delete `TABS` |
| `app/theme/parts/deck.tsx`, `app/gallery/states.tsx` | 9 | header comments |
| `tests/app.test.ts` | 1–5 | sim regression tests |
| `tests/input-timing.test.ts` | 3 | `stepLatch` |
| `tests/explorer-model.test.ts` | 4, 5, 9 | `songIds`, `panelOf`, `legendOf(state, panel)`, View-variant helpers |
| `tests/library.test.ts` | 6 | search keys |
| `tests/player.test.ts` | 7 | no-op prune |
| `tests/session.test.ts` (new) | 8 | inert session without media; `@ts-expect-error` on `player().status` |
| `docs/superpowers/plans/2026-10-07-walkman-06-review-fixes.md` | 0 | this plan, in the repo |

---

## Task 0: Workspace and plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-07-walkman-06-review-fixes.md` (a copy of this plan)

- [ ] **Step 1: Initialise the worktree.**

```bash
cd /Users/danvalinotti/orca/workspaces/ds-man/rockfish
git submodule update --init runtime
bun install --cwd runtime
bun scripts/setup.ts
```

- [ ] **Step 2: Confirm the baseline is green.**

Run: `bun run check` → no output (clean). Run: `bun run test` → **138 pass, 0 fail**.

- [ ] **Step 3: Save the plan into the repo and commit.**

Copy this file to `docs/superpowers/plans/2026-10-07-walkman-06-review-fixes.md`.

```bash
git add docs/superpowers/plans/2026-10-07-walkman-06-review-fixes.md
git commit -m "docs: review fixes implementation plan (Plan 6)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 1: The session shows a command's status on its own frame; 15 Hz polling in every phase but loading

Findings 1 and 10.

**Files:**
- Modify: `app/session.ts` (the `onFrame` poll at lines 84–113, `dispatch` at lines 164–171)
- Test: `tests/app.test.ts`

**Interfaces:**
- Consumes: `createPlayerController(...).state().status` (`app/player/controller.ts`), `POLL_EVERY = 4`.
- Produces: no new exports. `Session.dispatch` now leaves `session.status()` equal to the controller's status when it returns.

- [ ] **Step 1: Write the failing tests** (append to `tests/app.test.ts`, after the test "while a song plays the status is read every fourth frame, and at once after a command"):

```ts
test("a skip shows the next song's title on the same frame as its new place in the queue", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic, 1 of 20
  frames(rig, 3);
  frames(rig, 1, { buttons: BTN.ZR }); // the frame of the skip, nothing after it
  const bottom = screenText(rig.world, "auxiliary");
  expect(bottom).toContain("2 of 20");
  expect(bottom).toContain("Around the World");
  expect(bottom).not.toContain("Aerodynamic");
}, 120_000);

test("while nothing plays, or a song is paused, the status is read every fourth frame too", async () => {
  const host = createSimLocalMedia(LIBRARY);
  let reads = 0;
  const rig = { host, world: await bootApp({ localmedia: { ...host.ns, status: () => (reads++, host.ns.status()) } }) };
  frames(rig, 4);
  reads = 0;
  frames(rig, 60); // idle on the list
  expect(reads).toBeGreaterThanOrEqual(15);
  expect(reads).toBeLessThanOrEqual(16);
  press(rig, A);
  press(rig, BTN.START); // pause
  frames(rig, 4);
  reads = 0;
  frames(rig, 60);
  expect(reads).toBeGreaterThanOrEqual(15);
  expect(reads).toBeLessThanOrEqual(16);
}, 120_000);
```

- [ ] **Step 2: Watch them fail.**

Run: `bun test --conditions=browser tests/app.test.ts -t "same frame|every fourth frame too"`
Expected: 2 fail. The first on `expect(bottom).toContain("Around the World")` (the frame still shows Aerodynamic); the second on `expect(reads).toBeLessThanOrEqual(16)` with `reads` = 60.

- [ ] **Step 3: Implement.** In `app/session.ts`:

Replace the poll body (from `frame++;` through `updateCover(now.trackId);`) so it reads:

```ts
    onFrame(() => {
      // Nothing in a snapshot moves faster than the seek bar needs, so every POLL_EVERY frames is
      // enough in every phase (15 Hz at 60 fps). "loading" is read each frame so a refused or
      // corrupt open is skipped at once; a command re-reads at once (pollNext); a failed read retries.
      frame++;
      if (!pollNext && !statusFailed() && status().phase !== "loading" && frame % POLL_EVERY !== 0) return;
      pollNext = false;
      let now: LocalStatus;
      try {
        controller!.poll();
        now = controller!.state().status;
      } catch {
        setStatusFailed(true);
        return;
      }
      publish(now);
      if (now.scanGeneration === generation) return;
      generation = now.scanGeneration;
      try {
        const next = buildLibrary(media.tracks().map(composed));
        setLibrary(next);
        setListFailed(false);
        controller!.dispatch({ type: "prune", ids: [...next.tracks.keys()] });
      } catch {
        setListFailed(true);
      }
    });
```

Add, directly above `function updateCover`:

```ts
  /** What the screens read from a snapshot: the status, the scan flag and the open track's cover. */
  function publish(now: LocalStatus): void {
    setStatusFailed(false);
    setStatus(now);
    setScanning(now.scanning);
    updateCover(now.trackId);
  }
```

Replace `dispatch` in the returned object:

```ts
    // A command re-reads the status; a reply that fails validation must not throw out of the frame.
    dispatch: (action) => {
      pollNext = true;
      if (!controller) return;
      try {
        controller.dispatch(action);
      } catch {
        setStatusFailed(true);
        return;
      }
      // The controller re-read the status for any command it ran: show it on this frame, not the next.
      publish(controller.state().status);
    },
```

Make `rescan` ask for the next frame's read too, so "Scanning…" and the rebuilt library do not wait for the cadence:

```ts
    rescan: () => {
      pollNext = true;
      media?.scan();
    },
```

Update the comment on `POLL_EVERY`: `/** Frames between status reads (15 Hz at 60 fps); "loading" and a failed read poll every frame. */`.

Note for the reviewer: `publish` runs only after `controller.dispatch` returned (a throw from its status re-read leaves `statusFailed` set and publishes nothing), and `updateCover` now runs on the press frame rather than the next one, so a track change releases the old cover and requests the new one one frame earlier (the cover tests read after idle frames and are unaffected).

- [ ] **Step 4: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/app.test.ts` → all pass (the existing "while a song plays…" test and the read-error tests included). Run: `bun run test` → **140 pass, 0 fail**.

- [ ] **Step 5: Commit.**

```bash
git add app/session.ts tests/app.test.ts
git commit -m "fix(session): show a command's status on its own frame; poll at 15 Hz in every phase but loading

dispatch now publishes the controller's re-read snapshot at once, so a skip
never renders the previous song with the new queue place. The poll cadence
gate applied only while playing; idle, paused and ended read the host every
frame for a snapshot that cannot change without a command or a scan.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: A seek drag belongs to the song it started on; no seek without a duration

Findings 2 and 3.

**Files:**
- Modify: `app/now-playing/now-playing.tsx` (imports at line 4; the scrubber block at lines 27–55)
- Test: `tests/app.test.ts`

**Interfaces:**
- Consumes: `createMediaScrubber` (`active()`, `cancel()`), `status().trackId`, `status().openSerial` (the host bumps `openSerial` on every `open`).

- [ ] **Step 1: Write the failing tests** (append to `tests/app.test.ts`):

```ts
test("a seek drag that outlives its song does not seek the next one", async () => {
  const rig = await boot([
    { file: "a.mp3", title: "Alpha", artist: "Ab", album: "Ab", durationMs: 2000 },
    { file: "b.mp3", title: "Beta", artist: "Ab", album: "Ab", durationMs: 60_000 },
  ]);
  press(rig, A); // Alpha, 2 s
  frames(rig, 6);
  const y = 135;
  // A finger resting on the track through the end of Alpha: the queue moves on to Beta underneath it.
  for (let i = 0; i < 130; i++) frames(rig, 1, { touches: [{ x: 80, y }], surface: "auxiliary" });
  expect(opens(rig.host)).toEqual(["open(0)", "open(1)"]);
  frames(rig, 3); // release
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual([]);
}, 120_000);

test("a seek drag released after the last song ended still seeks that song", async () => {
  const rig = await boot([{ file: "a.mp3", title: "Alpha", artist: "Ab", album: "Ab", durationMs: 2000 }]);
  press(rig, A);
  frames(rig, 6);
  const y = 135;
  for (let i = 0; i < 130; i++) frames(rig, 1, { touches: [{ x: 80, y }], surface: "auxiliary" }); // Alpha ends; nothing else opens
  expect(opens(rig.host)).toEqual(["open(0)"]);
  frames(rig, 3); // release
  // The host's own end-of-queue seek to 0 comes first; the drag's seek lands on the same song.
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual(["seek(0)", "seek(192)"]);
}, 120_000);

test("a song without a known duration ignores touches on the seek track", async () => {
  const host = createSimLocalMedia(LIBRARY);
  // A VBR file without a header: the host reports no duration while the song plays.
  const ns = { ...host.ns, status: () => JSON.stringify({ ...JSON.parse(host.ns.status()), durationMs: 0 }) };
  const rig = { host, world: await bootApp({ localmedia: ns }) };
  frames(rig, 4);
  press(rig, A);
  frames(rig, 10);
  touch(rig, 160, 135);
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual([]);
}, 120_000);
```

- [ ] **Step 2: Watch them fail.**

Run: `bun test --conditions=browser tests/app.test.ts -t "outlives|last song ended|without a known duration"`
Expected: "outlives" fails on the `seek(` assertion with `["seek(192)"]` (the preview from the 2 s song, sent to Beta); "without a known duration" fails with `["seek(0)"]`; "last song ended" already passes (it pins Review Focus 5: the cancel keys on a new open, not on the end of the song).

- [ ] **Step 3: Implement.** In `app/now-playing/now-playing.tsx`:

Change the Solid import to `import { createEffect, createMemo, createSignal, on, Show } from "solid-js";`.

After `const scrubber = createMediaScrubber(...)` add:

```ts
  // A drag belongs to the song it started on. When another open lands under it (the song ended
  // and the next one started, or a skip), the release must not seek the new song to the old
  // preview. Every open carries a new serial (a skip, the next song, repeat-one's reopen), so the
  // memo fires once per open and not on the 15 Hz status reads.
  const opened = createMemo(() => status().openSerial);
  createEffect(on(opened, () => {
    if (!scrubber.active()) return;
    scrubber.cancel();
    setPreview(null);
  }, { defer: true }));
```

Known residual (documented, not fixed here): a release that lands in the up-to-4-frame window between the host reporting `ended` and the app's poll still commits a seek against a status that says `playing`; the host turns the ended song into `paused` at that position and the queue waits for a press. Closing it would add a `paused(false)` command to every seek while playing, a host-side behaviour change outside this fix pass.

Change `onDown`:

```ts
    onDown: (c) => {
      // No duration (a VBR file without a header reports 0): nothing to map the contact to, so no seek.
      if (idle() || duration() <= 0 || !onTrack(c.x)) return;
      scrubber.begin(fractionAt(c.x), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    },
```

- [ ] **Step 4: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/app.test.ts` → all pass, including "seek: dragging previews the time with no seek until release, then exactly one seek". Run: `bun run test` → **143 pass, 0 fail**.

- [ ] **Step 5: Commit.**

```bash
git add app/now-playing/now-playing.tsx tests/app.test.ts
git commit -m "fix(now-playing): cancel a seek drag when another song opens; no seek without a duration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: Latched tap/hold and repeat helpers

Finding 7.

**Files:**
- Modify: `app/input-timing.ts` (append after `stepHold`), `app/input.ts` (`onRepeat`, `onTapOrHold`)
- Test: `tests/input-timing.test.ts`, `tests/app.test.ts`

**Interfaces:**
- Produces: `stepLatch(ignoring: boolean, down: boolean, active: boolean): { ignoring: boolean; down: boolean }` in `app/input-timing.ts`.

- [ ] **Step 1: Write the failing unit test** (append to `tests/input-timing.test.ts`; add `stepLatch` to its import):

```ts
test("a button held across the keyboard's close stays ignored until it is released", () => {
  const run = (frames: [down: boolean, active: boolean][]) => {
    let ignoring = false;
    return frames.map(([down, active]) => {
      const step = stepLatch(ignoring, down, active);
      ignoring = step.ignoring;
      return step.down;
    });
  };
  // Held inside the modal, through its close, released, pressed again: only the second press counts.
  expect(run([[true, false], [true, false], [true, true], [true, true], [false, true], [true, true]])).toEqual([false, false, false, false, false, true]);
  // Pressed on the frame the modal closes: a press.
  expect(run([[false, false], [true, true]])).toEqual([false, true]);
  // Released while inactive: nothing is pending when the modal closes.
  expect(run([[true, false], [false, false], [false, true], [true, true]])).toEqual([false, false, false, true]);
});
```

- [ ] **Step 2: Write the failing sim test** (append to `tests/app.test.ts`):

```ts
test("closing the keyboard with the D-pad or X still held does not move, search or rescan", async () => {
  const rig = await boot();
  press(rig, X);
  expect(screenText(rig.world, "auxiliary")).toContain("START confirm");
  frames(rig, 3, { buttons: BTN.DOWN });
  frames(rig, 1, { buttons: BTN.DOWN | BTN.START }); // commit with DOWN still held
  frames(rig, 5, { buttons: BTN.DOWN });
  frames(rig, 2);
  expect(screenText(rig.world, "auxiliary")).not.toContain("START confirm");
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
  press(rig, X);
  expect(screenText(rig.world, "auxiliary")).toContain("START confirm");
  const scans = rig.host.log.filter((entry) => entry === "scan()").length;
  frames(rig, 3, { buttons: X }); // X types a space on the keyboard
  frames(rig, 1, { buttons: X | BTN.START }); // commit with X still held
  frames(rig, 70, { buttons: X }); // past the hold time
  frames(rig, 2);
  expect(screenText(rig.world, "auxiliary")).not.toContain("START confirm");
  expect(rig.host.log.filter((entry) => entry === "scan()")).toHaveLength(scans);
}, 120_000);
```

- [ ] **Step 3: Watch them fail.**

Run: `bun test --conditions=browser tests/input-timing.test.ts tests/app.test.ts -t "stays ignored|still held"`
Expected: the unit test fails with `stepLatch is not a function` (or an import error); the sim test fails on `expect(selectedRow(rig.world)).toContain("Aerodynamic")` (the row moved to "Around the World").

- [ ] **Step 4: Implement the stepper.** Append to `app/input-timing.ts` after `stepHold`:

```ts
/**
 * One frame of the gate between a modal (the keyboard) and a held button: a button already
 * down when `active` turns on stays ignored until it is released, so closing the keyboard with
 * a finger still on a button is not a press of that button. `down` is what the stepper may act on.
 */
export function stepLatch(ignoring: boolean, down: boolean, active: boolean): { ignoring: boolean; down: boolean } {
  if (!down) return { ignoring: false, down: false };
  if (!active) return { ignoring: true, down: false };
  return { ignoring, down: !ignoring };
}
```

- [ ] **Step 5: Implement the helpers.** Replace `onRepeat` and `onTapOrHold` in `app/input.ts` (and add `stepLatch` to its import):

```ts
/** Fire on press, then repeat while held (300 ms delay, 80 ms rate). Latched: see stepLatch. */
export function onRepeat(button: number, fire: () => void, active: () => boolean): void {
  let held = -1;
  let ignoring = false;
  onFrame((buttons) => {
    const latch = stepLatch(ignoring, (buttons & button) !== 0, active());
    ignoring = latch.ignoring;
    if (!latch.down) {
      held = -1;
      return;
    }
    held++;
    if (repeatFires(held)) fire();
  });
}

/** A release before the hold time is a tap; holding fires `hold` once instead. Latched: see stepLatch. */
export function onTapOrHold(button: number, tap: () => void, hold: () => void, active: () => boolean): void {
  let state = HOLD_UP;
  let ignoring = false;
  onFrame((buttons) => {
    const latch = stepLatch(ignoring, (buttons & button) !== 0, active());
    ignoring = latch.ignoring;
    if (!active()) {
      // A hold the keyboard interrupted ends without a tap.
      state = HOLD_UP;
      return;
    }
    const step = stepHold(state, latch.down);
    state = step.state;
    if (step.event === "tap") tap();
    else if (step.event === "hold") hold();
  });
}
```

Notes for the reviewer: the inactive branch of `onTapOrHold` resets without stepping, so it emits no event (today's `stepHold(state, false)` would emit a tap). `onAnalogRows` stays as it is: the circle pad has no press edge, and a deflection held across the keyboard's close scrolling is acceptable. The START / ZL / ZR handlers in `app/app.tsx` need nothing: the framework's `onButtonPress` keeps tracking edges while inactive, so a button held across the close never fires.

- [ ] **Step 6: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/input-timing.test.ts tests/app.test.ts` → all pass ("a held D-pad repeats and the focused row stays inside the list" and "holding X rescans…" included). Run: `bun run test` → **145 pass, 0 fail**.

- [ ] **Step 7: Commit.**

```bash
git add app/input-timing.ts app/input.ts tests/input-timing.test.ts tests/app.test.ts
git commit -m "fix(input): a button held across the keyboard's close is not a press

onRepeat and onTapOrHold now latch like the framework's onButtonPress: a
button already down when the Explorer becomes active again is ignored until
it is released.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: A plays the row this frame's move landed on

Findings 4 and 9.

**Files:**
- Modify: `app/explorer/model.ts` (replace `visibleSongIds`, lines 114–117), `app/explorer/explorer.tsx` (imports at lines 21–24; the CIRCLE handler at lines 110–116)
- Test: `tests/explorer-model.test.ts` (line 4 import, line 45), `tests/app.test.ts`

**Interfaces:**
- Produces: `songIds(rows: readonly Row[]): number[]` in `app/explorer/model.ts`. `visibleSongIds` is removed.
- Consumes: `visibleRows(library, state)`, `focusOf(state)` (both already exported).

- [ ] **Step 1: Write the failing sim test** (append to `tests/app.test.ts`):

```ts
test("A on the frame a held D-pad steps plays the row the step lands on", async () => {
  const rig = await boot();
  frames(rig, 1, { buttons: BTN.DOWN | A }); // the step and the press land on one frame
  frames(rig, 2);
  expect(selectedRow(rig.world)).toContain("Around the World");
  expect(opens(rig.host)).toEqual(["open(7)"]);
}, 120_000);
```

- [ ] **Step 2: Watch it fail.**

Run: `bun test --conditions=browser tests/app.test.ts -t "the row the step lands on"`
Expected: fails on `expect(opens(rig.host)).toEqual(["open(7)"])` with `["open(1)"]` (Aerodynamic, the row focused before the step).

- [ ] **Step 3: Implement.** In `app/explorer/model.ts` replace `visibleSongIds` with:

```ts
/** The song ids among `rows`, in order: the queue a song played from a view gets. */
export function songIds(rows: readonly Row[]): number[] {
  return rows.flatMap((row) => (row.kind === "song" ? [row.id] : []));
}
```

In `app/explorer/explorer.tsx` change the import list (`visibleSongIds` → `songIds`) and replace the CIRCLE handler:

```ts
  onButtonPress(BTN.CIRCLE, () => {
    const lib = library();
    if (!lib) return;
    // This frame's own move or tab step is in state() already but not yet in the settled focus or
    // the rows memo (they catch up when the frame's batch ends): read the row from fresh state.
    const now = state();
    const list = visibleRows(lib, now);
    const row = list[Math.min(focusOf(now), list.length - 1)];
    if (!row) return;
    if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: songIds(list), startId: row.id });
    else dispatch({ type: "open", row });
  }, { active });
```

In `tests/explorer-model.test.ts` replace `visibleSongIds` in the import with `songIds`, and line 45 with:

```ts
  expect(songIds(visibleRows(library, state))).toEqual([1, 2, 0]);
```

- [ ] **Step 4: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/explorer-model.test.ts tests/app.test.ts` → all pass ("A plays the focused song…" and "a focus move touches only the selection…" included). Run: `bun run test` → **146 pass, 0 fail**.

- [ ] **Step 5: Commit.**

```bash
git add app/explorer/model.ts app/explorer/explorer.tsx tests/explorer-model.test.ts tests/app.test.ts
git commit -m "fix(explorer): A plays the row this frame's move landed on

The handler read the settled focus, which lags a same-frame D-pad or
circle-pad step until the batch ends. It now reads the row from fresh state
and takes the queue from the same row list: one rows() pass per press, where
there were two (the memo and visibleSongIds).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: State panels put the list's buttons to sleep and own the legend

Findings 5 and 6.

**Files:**
- Modify: `app/explorer/model.ts` (`legendOf` at lines 200–211; add `ListPanel`, `panelOf` above it), `app/explorer/explorer.tsx` (`hasSongs`/`legend` at lines 64–66; input registrations at lines 83–125; `panel()` at lines 152–158)
- Test: `tests/explorer-model.test.ts` (the legend test at lines 108–115), `tests/app.test.ts`

**Interfaces:**
- Produces: `type ListPanel = "unavailable" | "readError" | "scanning" | "empty"`, `panelOf(available: boolean, readFailed: boolean, library: Library | null): ListPanel | null`, `legendOf(state: ExplorerState, panel: ListPanel | null): LegendItem[]`.
- Consumes: Task 4's CIRCLE handler (its `{ active }` becomes `{ active: listActive }`).

- [ ] **Step 1: Write the failing model tests.** In `tests/explorer-model.test.ts` add `panelOf` and `type ListPanel` to the import, replace the legend test, and add the panel test:

```ts
test("legends name what each button does in this view, or what a panel asks for", () => {
  const labels = (state: ExplorerState, panel: ListPanel | null = null) => legendOf(state, panel).map((item) => `${item.key} ${item.label}`);
  expect(labels(initialExplorer())).toEqual(["A Play", "X Search", "B Back", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "setQuery", query: "x" }))).toEqual(["A Play", "X Edit search", "B Clear", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "tab", delta: 1 }))).toEqual(["A Open", "X Search", "B Back", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "tab", delta: 1 }, { type: "open", row: { kind: "artist", key: "queen" } }))[2]).toBe("B Artists");
  expect(labels(initialExplorer(), "empty")).toEqual(["X Scan again"]);
  expect(labels(initialExplorer(), "scanning")).toEqual(["Y Now Playing"]);
  expect(labels(initialExplorer(), "readError")).toEqual(["X Hold to scan again"]);
  expect(labels(initialExplorer(), "unavailable")).toEqual([]);
});

test("the panel follows availability, a failed read, the first scan and an empty library, in that order", () => {
  expect(panelOf(false, true, null)).toBe("unavailable");
  expect(panelOf(true, true, library)).toBe("readError");
  expect(panelOf(true, false, null)).toBe("scanning");
  expect(panelOf(true, false, buildLibrary([]))).toBe("empty");
  expect(panelOf(true, false, library)).toBeNull();
});
```

- [ ] **Step 2: Write the failing sim tests** (append to `tests/app.test.ts`):

```ts
test("over the read-error panel the list's buttons sleep: nothing plays, the drill-down and focus survive", async () => {
  const host = createSimLocalMedia(LIBRARY);
  let garbled = false;
  const ns = { ...host.ns, status: () => (garbled ? "{" : host.ns.status()) };
  const rig = { host, world: await bootApp({ localmedia: ns }) };
  frames(rig, 4);
  press(rig, BTN.RTRIGGER); // Artists
  press(rig, A); // Daft Punk: 8 songs, One More Time first
  expect(screenText(rig.world, "primary")).toContain("8 songs");
  garbled = true;
  frames(rig, 3);
  let top = screenText(rig.world, "primary");
  expect(top).toContain("Could not read the music library");
  expect(top).toContain("Hold to scan again");
  press(rig, A);
  press(rig, B);
  press(rig, BTN.DOWN);
  expect(opens(rig.host)).toEqual([]);
  garbled = false;
  frames(rig, 3);
  top = screenText(rig.world, "primary");
  expect(top).toContain("8 songs");
  expect(selectedRow(rig.world)).toContain("One More Time");
}, 120_000);

test("while the first scan runs the legend offers Now Playing only, and an X tap starts no second scan", async () => {
  const host = createSimLocalMedia(LIBRARY, { scanMs: 5000 });
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 2);
  const top = screenText(rig.world, "primary");
  expect(top).toContain("Scanning your music");
  expect(top).toContain("Now Playing");
  expect(top).not.toContain("Scan again");
  press(rig, X);
  expect(rig.host.log.filter((entry) => entry === "scan()")).toEqual(["scan()"]);
  frames(rig, 310); // the scan completes
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
}, 120_000);

test("over the empty-library panel an X tap scans again", async () => {
  const rig = await boot([]);
  const top = screenText(rig.world, "primary");
  expect(top).toContain("No music found");
  expect(top).toContain("Scan again");
  press(rig, X);
  expect(rig.host.log.filter((entry) => entry === "scan()")).toEqual(["scan()", "scan()"]);
}, 120_000);
```

- [ ] **Step 3: Watch them fail.**

Run: `bun test --conditions=browser tests/explorer-model.test.ts tests/app.test.ts -t "panel|first scan runs|empty-library"`
Expected: the model tests fail to compile or on the first panel label; "over the read-error panel…" fails on `expect(top).toContain("Hold to scan again")`; "while the first scan runs…" fails on `not.toContain("Scan again")`; the empty-library test passes already (it pins Review Focus 4).

- [ ] **Step 4: Implement the model.** In `app/explorer/model.ts` replace `legendOf` with:

```ts
/** What replaces the list: no media module, a host read that failed, the first scan, or no songs. */
export type ListPanel = "unavailable" | "readError" | "scanning" | "empty";

export function panelOf(available: boolean, readFailed: boolean, library: Library | null): ListPanel | null {
  if (!available) return "unavailable";
  if (readFailed) return "readError";
  if (!library) return "scanning";
  if (library.tracks.size === 0) return "empty";
  return null;
}

/** The footer legend: the list's buttons in this view, or what the panel over the list asks for. */
export function legendOf(state: ExplorerState, panel: ListPanel | null): LegendItem[] {
  if (panel === "unavailable") return [];
  if (panel === "scanning") return [{ key: "Y", label: "Now Playing" }];
  if (panel === "readError") return [{ key: "X", label: "Hold to scan again", primary: true }];
  if (panel === "empty") return [{ key: "X", label: "Scan again", primary: true }];
  const view = currentView(state);
  const opens = view.kind === "artists" || view.kind === "albums";
  const back = state.drill[state.tab] ? (state.tab === "Artists" ? "Artists" : "Albums") : state.query ? "Clear" : "Back";
  return [
    { key: "A", label: opens ? "Open" : "Play", primary: true },
    { key: "X", label: state.query ? "Edit search" : "Search" },
    { key: "B", label: back },
    { key: "Y", label: "Now Playing" },
  ];
}
```

- [ ] **Step 5: Implement the screen.** In `app/explorer/explorer.tsx`:

Add `panelOf` to the import from `./model.ts`. Replace the `hasSongs` and `legend` lines with:

```ts
  // A plain function, not settled(): the session's poll flips readFailed in the same batch the
  // handlers below run in, and a settled value would still say "no panel" on that frame.
  const kind = () => panelOf(props.session.available, props.session.readFailed(), library());
  // The list's buttons sleep under a panel (and under the keyboard); tabs, the Y chords and X do not.
  const listActive = () => active() && kind() === null;
  const legend = settled<LegendItem[]>(() => legendOf(state(), kind()),
    (a, b) => a.length === b.length && a.every((item, i) => item.key === b[i]!.key && item.label === b[i]!.label));
```

Pass `listActive` instead of `active` to the four `onRepeat` calls, to `onAnalogRows`, to the CROSS handler (`{ active: listActive }`) and to the CIRCLE handler (`{ active: listActive }`). Leave the shoulders `onFrame` and `onTapOrHold(BTN.TRIANGLE, …, active)` on `active`.

Replace `tapX`:

```ts
  // X: a tap searches, or scans again over the empty-library panel. The read-error panel asks
  // for a hold (a tap does nothing); scanning and unavailable ignore it. A 1 s hold always rescans.
  const tapX = () => {
    const panel = kind();
    if (panel === null) props.openSearch();
    else if (panel === "empty") props.session.rescan();
  };
```

Replace `panel`:

```ts
  const panel = () => {
    switch (kind()) {
      case "unavailable": return { title: UNAVAILABLE, lines: ["This build has no media.local module."] };
      case "readError": return { title: READ_ERROR, lines: [["Press and hold", "X", "to scan again."] as const] };
      case "scanning": return { title: "Scanning your music…", lines: ["sdmc:/music/"] };
      case "empty": return { title: "No music found", lines: ["Copy .mp3 files to the /music folder on your SD card,", ["then press", "X", "to scan again."] as const] };
      default: return null;
    }
  };
```

`hasSongs` has no remaining caller: delete it.

- [ ] **Step 6: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/explorer-model.test.ts tests/app.test.ts` → all pass ("over the read-error panel an X tap does nothing; holding X still scans again" included). Run: `bun run test` → **150 pass, 0 fail**.

- [ ] **Step 7: Commit.**

```bash
git add app/explorer/model.ts app/explorer/explorer.tsx tests/explorer-model.test.ts tests/app.test.ts
git commit -m "fix(explorer): a state panel puts the list's buttons to sleep and sets the legend

Only the X tap knew about the read-error panel; A, B, the D-pad and the
circle pad kept acting on the hidden list. The panel kind (panelOf) now gates
them and drives the legend, so the scanning panel no longer offers Scan again.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: One folded search key per track

Finding 8.

**Files:**
- Modify: `app/library/library.ts` (`Library` interface at lines 6–14; `buildLibrary` loop at lines 38–45 and its return; `songMatches`/`rows` at lines 74–80)
- Test: `tests/library.test.ts`

**Interfaces:**
- Produces: `Library.searchKeys: Map<number, string>` (folded `title\0artist\0album`).

- [ ] **Step 1: Write the failing test** (append to `tests/library.test.ts`):

```ts
test("each track and album carries one folded search key, so a search is one includes() each", () => {
  const library = buildLibrary(TRACKS);
  expect(library.searchKeys.get(3)).toBe("hoppipolla\u0000sigur ros\u0000takk...");
  expect(library.searchKeys.get(6)).toBe("untitled-demo\u0000unknown artist\u0000unknown album");
  expect(library.albumByKey.get("takk...\u0000sigur ros")!.nameKey).toBe("takk...");
  expect(ids(rows(library, { kind: "songs" }, "Sigur"))).toEqual([3]);
  expect(ids(rows(library, { kind: "songs" }, "takk"))).toEqual([3]);
  expect(ids(rows(library, { kind: "albums" }, "TAKK"))).toEqual(["takk...\u0000sigur ros"]);
});
```

- [ ] **Step 2: Watch it fail.**

Run: `bun test --conditions=browser tests/library.test.ts -t "search key"`
Expected: fails with `Property 'searchKeys' does not exist` (check) / `undefined` (test).

- [ ] **Step 3: Implement.** In `app/library/library.ts`:

Add `nameKey` to `Album` and `searchKeys` to `Library`:

```ts
export interface Album { key: string; name: string; /** Folded name, for search. */ nameKey: string; artist: string; trackIds: number[] }
```

```ts
  /** Folded title, artist and album per track (NUL-separated): one includes() per search match. */
  searchKeys: Map<number, string>;
```

In the artist/album loop, fold the album name once and reuse it for the key:

```ts
    const nameKey = normalize(track.album);
    const bKey = `${nameKey}\u0000${aKey}`;
    const album = albumMap.get(bKey) ?? { key: bKey, name: track.album, nameKey, artist: track.artist, trackIds: [] };
```

(`albumKey` then has no caller: delete it.) Change the albums filter in `rows` to `a.nameKey.includes(q)`.

In `buildLibrary`, replace the first loop:

```ts
  const tracks = new Map<number, LocalTrack>();
  const titleKey = new Map<number, string>();
  const searchKeys = new Map<number, string>();
  for (const raw of input) {
    const track = withFallbacks(raw);
    tracks.set(track.id, track);
    const title = normalize(track.title);
    titleKey.set(track.id, title);
    searchKeys.set(track.id, `${title}\u0000${normalize(track.artist)}\u0000${normalize(track.album)}`);
  }
```

and add `searchKeys` to the returned object. Delete `songMatches` and change the `songs` helper in `rows`:

```ts
  const songs = (list: readonly number[]): Row[] =>
    (q === "" ? list : list.filter((id) => library.searchKeys.get(id)!.includes(q))).map((id) => ({ kind: "song", id }));
```

- [ ] **Step 4: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/library.test.ts tests/explorer-model.test.ts` → all pass. Run: `bun run test` → **151 pass, 0 fail**.

- [ ] **Step 5: Commit.**

```bash
git add app/library/library.ts tests/library.test.ts
git commit -m "perf(library): fold each track's and album's search key once, at build time

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: A prune that drops nothing leaves the state alone

Finding 11.

**Files:**
- Modify: `app/player/reducer.ts` (the `prune` case at lines 113–119)
- Test: `tests/player.test.ts`

- [ ] **Step 1: Write the failing test** (append to `tests/player.test.ts`):

```ts
test("prune leaves the state untouched when every queued song survives the scan", () => {
  const state = playing([0, 1, 2, 3], 2);
  expect(run(state, { type: "prune", ids: [3, 2, 1, 0, 9] }).state).toBe(state);
  // The playing song is kept even when the scan dropped it, so that is no change either.
  expect(run(state, { type: "prune", ids: [0, 1, 3] }).state).toBe(state);
  const idle = initialPlayer();
  expect(run(idle, { type: "prune", ids: [] }).state).toBe(idle);
});
```

Why it matters: the session dispatches `prune` after every completed scan and the `player` signal's `samePlayer` compares the arrays by identity, so today every rescan (including the cached-scan path, twice) re-runs every `player()` reader in Now Playing for no visible change.

- [ ] **Step 2: Watch it fail.**

Run: `bun test --conditions=browser tests/player.test.ts -t "untouched"`
Expected: fails on the first `toBe` (a new object with equal contents).

- [ ] **Step 3: Implement.** Replace the `prune` case:

```ts
    case "prune": {
      const id = currentId(state);
      const keep = new Set(action.ids);
      const survives = (queued: number) => queued === id || keep.has(queued);
      // A scan that still lists every queued song changes nothing; the same state keeps the screens quiet.
      if (state.queue.every(survives) && state.order.every(survives)) return none(state);
      const order = state.order.filter(survives);
      return none({ ...state, queue: state.queue.filter(survives), order, index: id < 0 ? -1 : order.indexOf(id) });
    }
```

- [ ] **Step 4: Run them.**

Run: `bun run check` → clean. Run: `bun test --conditions=browser tests/player.test.ts tests/controller.test.ts` → all pass. Run: `bun run test` → **152 pass, 0 fail**.

- [ ] **Step 5: Commit.**

```bash
git add app/player/reducer.ts tests/player.test.ts
git commit -m "perf(player): prune returns the same state when the scan dropped nothing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8: One tab order; a player view without the status

Findings 12 and 13.

**Files:**
- Modify: `app/theme/theme.ts` (after `export type Tab`, line 6), `app/explorer/model.ts` (line 7 import, delete line 9), `app/theme/parts/toolbar.tsx` (line 6 import, delete line 14, line 43), `app/session.ts` (`Session.player` at line 19; a new type), `app/player/reducer.ts` (`currentId` at line 48)
- Create: `tests/session.test.ts`

**Interfaces:**
- Produces: `TAB_ORDER: readonly Tab[]` exported from `app/theme/theme.ts`; `type PlayerView = Omit<PlayerState, "status">` exported from `app/session.ts`; `Session.player: Accessor<PlayerView>`; `currentId(state: Pick<PlayerState, "index" | "order">)`.

- [ ] **Step 1: Write the failing test.** Create `tests/session.test.ts`:

```ts
import { expect, test } from "bun:test";
import { createRoot } from "solid-js";
import { createSession } from "../app/session.ts";

test("without media.local the session is unavailable and every call is inert", () => {
  createRoot((dispose) => {
    const session = createSession(null);
    expect(session.available).toBe(false);
    expect(session.library()).toBeNull();
    expect(session.status().phase).toBe("idle");
    expect(session.scanning()).toBe(false);
    expect(session.readFailed()).toBe(false);
    session.dispatch({ type: "toggle" });
    session.rescan();
    expect(session.player().index).toBe(-1);
    expect(session.track()).toBeNull();
    // The player view carries no status: screens read status(), which moves every frame of playback.
    // @ts-expect-error the status is not part of the player view
    session.player().status;
    dispose();
  });
});
```

- [ ] **Step 2: Watch it fail.**

Run: `bun run check`
Expected: `tests/session.test.ts: Unused '@ts-expect-error' directive.` (the test itself passes at runtime: `bun test --conditions=browser tests/session.test.ts` → 1 pass).

- [ ] **Step 3: Implement the tab order.**

In `app/theme/theme.ts`, after `export type Tab = …`:

```ts
/** The tabs in toolbar order; L / R step through it. */
export const TAB_ORDER: readonly Tab[] = ["Songs", "Artists", "Albums"];
```

In `app/explorer/model.ts`: change line 7 to `import { TAB_ORDER, type Tab } from "../theme/theme.ts";` and delete its own `export const TAB_ORDER` (line 9).

In `app/theme/parts/toolbar.tsx`: change line 6 to `import { TAB_ORDER, type Tab, type Theme } from "../theme.ts";`, delete `export const TABS …` (line 14), and change `<For each={TABS}>` to `<For each={TAB_ORDER}>`.

- [ ] **Step 4: Implement the player view.**

In `app/session.ts`, before `export interface Session`:

```ts
/** The player as the screens see it: the queue, its order and position, the modes. The status moves
 * every frame of playback and is read from `status`; it is not part of this view. */
export type PlayerView = Omit<PlayerState, "status">;
```

and change `player: Accessor<PlayerState>;` to `player: Accessor<PlayerView>;` (the signal itself keeps `PlayerState`; the accessor narrows at the boundary, so nothing is allocated).

In `app/player/reducer.ts`:

```ts
export function currentId(state: Pick<PlayerState, "index" | "order">): number {
```

- [ ] **Step 5: Run them.**

Run: `bun run check` → clean. Run: `bun run test` → **153 pass, 0 fail**. Run: `bun run gallery` → 18 images; `for f in dist/gallery-baseline/*.png; do cmp "$f" "dist/gallery/$(basename "$f")" || echo "DIFF $f"; done` → no output.

- [ ] **Step 6: Commit.**

```bash
git add app/theme/theme.ts app/explorer/model.ts app/theme/parts/toolbar.tsx app/session.ts app/player/reducer.ts tests/session.test.ts
git commit -m "refactor: one TAB_ORDER for the toolbar and the explorer; a player view without the status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 9: Drop the test-only wrappers; refresh the stale header comments

Findings 14 and 15.

**Files:**
- Modify: `app/explorer/model.ts` (`headerOf` at lines 128–130, `rowCells` at lines 156–159, `crumbOf` at lines 184–186), `app/theme/parts/deck.tsx` (lines 1–3), `app/gallery/states.tsx` (lines 1–2)
- Test: `tests/explorer-model.test.ts` (import at lines 3–6; the test "headers, row cells and breadcrumbs follow the view")

- [ ] **Step 1: Point the test at the View variants.** In `tests/explorer-model.test.ts` replace `crumbOf`, `headerOf` and `rowCells` in the import with `crumbOfView`, `headerOfView`, `rowCellsIn` (keep the rest), and add above the test "headers, row cells and breadcrumbs follow the view":

```ts
const headerOf = (state: ExplorerState) => headerOfView(currentView(state));
const rowCells = (lib: typeof library, state: ExplorerState, row: Parameters<typeof rowCellsIn>[2]) => rowCellsIn(lib, currentView(state), row);
const crumbOf = (lib: typeof library, state: ExplorerState) => crumbOfView(lib, currentView(state));
```

The test body stays as it is.

- [ ] **Step 2: Delete the wrappers.** In `app/explorer/model.ts` delete `headerOf`, `rowCells` and `crumbOf` (keep `headerOfView`, `rowCellsIn`, `crumbOfView`).

- [ ] **Step 3: Refresh the comments.**

`app/theme/parts/deck.tsx` lines 1–3:

```ts
// The bottom screen's Now Playing deck: art frame, info LCD, seek capsule and
// transport buttons. Each transport button owns its touch recognizer and calls
// `onPress`; the screen (app/now-playing) wires the seek drag and the actions.
```

`app/gallery/states.tsx` lines 1–2:

```ts
// The approved Aqua mockup states (docs/design/aqua), rebuilt from the theme
// parts with fixture data. Gallery-only: the real screens are app/explorer and app/now-playing.
```

- [ ] **Step 4: Run them.**

Run: `bun run check` → clean. Run: `bun run test` → **153 pass, 0 fail**.

- [ ] **Step 5: Commit.**

```bash
git add app/explorer/model.ts tests/explorer-model.test.ts app/theme/parts/deck.tsx app/gallery/states.tsx
git commit -m "refactor(explorer): drop the state-taking header, cell and crumb wrappers; refresh two stale headers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 10: Branch verification

**Files:** none new (a `docs/perf.md` row if the perf run is made).

- [ ] **Step 1: Whole suite and types.** `bun run check` → clean. `bun run test` → **153 pass, 0 fail** (138 + 15 new: Task 1 ×2, Task 2 ×3, Task 3 ×2, Task 4 ×1, Task 5 ×1 model + 3 sim, Task 6 ×1, Task 7 ×1, Task 8 ×1).

- [ ] **Step 2: Gallery unchanged.** `bun run gallery`, then the `cmp` loop from Task 8 Step 5 → no output (18 images byte-identical).

- [ ] **Step 3: Perf (needs Azahar, Docker and `dist/test-music`; skip and say so if unavailable).** `bun run perf idle scroll now-playing --model both --check` → every row in budget; `idle` should fall below the last `docs/perf.md` row (fewer host reads). Append the run's rows to `docs/perf.md` the way Plan 5 and the gels plan did, and commit as `docs(perf): review-fixes run`.

- [ ] **Step 4: Fresh review.** Request a whole-branch review (`superpowers:requesting-code-review`) of `fix/fable-review` against `main`; fix any Important finding on the branch with its own test.

- [ ] **Step 5: Hand back.** Report the test count, the gallery result, the perf result (or that it was skipped) and leave the `--no-ff` merge into `main` to the user, as with Plans 5 and the gels.
