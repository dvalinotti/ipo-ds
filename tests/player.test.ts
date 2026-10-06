import { expect, test } from "bun:test";
import type { LocalStatus } from "@pocketjs/framework/localmedia";
import {
  IDLE_STATUS, currentId, initialPlayer, reducePlayer, shuffled,
  type PlayerAction, type PlayerState,
} from "../app/player/reducer.ts";

const zero = () => 0;
const status = (over: Partial<LocalStatus>): LocalStatus => ({ ...IDLE_STATUS, ...over });
function run(state: PlayerState, ...actions: PlayerAction[]) {
  let commands: unknown[] = [];
  for (const action of actions) ({ state, commands } = reducePlayer(state, action, zero));
  return { state, commands };
}
const playing = (ids: number[], startId: number, over: Partial<PlayerState> = {}) =>
  run({ ...initialPlayer(), ...over }, { type: "playFrom", ids, startId }).state;

test("shuffled is Fisher–Yates driven by the given random source", () => {
  expect(shuffled([1, 2, 3], zero)).toEqual([2, 3, 1]);
  expect(shuffled([], zero)).toEqual([]);
});

test("playing a song snapshots the visible list as the queue and opens the song", () => {
  const { state, commands } = run(initialPlayer(), { type: "playFrom", ids: [5, 6, 7], startId: 6 });
  expect(state).toMatchObject({ queue: [5, 6, 7], order: [5, 6, 7], index: 1 });
  expect(commands).toEqual([{ type: "open", id: 6 }]);
  const ignored = run(initialPlayer(), { type: "playFrom", ids: [5], startId: 9 });
  expect(ignored.commands).toEqual([]);
  expect(currentId(ignored.state)).toBe(-1);
});

test("with shuffle on, the chosen song plays first and the rest is shuffled", () => {
  const state = playing([0, 1, 2, 3], 0, { shuffle: true });
  expect(state).toMatchObject({ queue: [0, 1, 2, 3], order: [0, 2, 3, 1], index: 0 });
});

test("shuffle keeps the current song first; turning it off restores list order at the current song", () => {
  let state = playing([0, 1, 2, 3], 2);
  state = run(state, { type: "toggleShuffle" }).state;
  expect(state).toMatchObject({ shuffle: true, order: [2, 1, 3, 0], index: 0 });
  state = run(state, { type: "toggleShuffle" }).state;
  expect(state).toMatchObject({ shuffle: false, order: [0, 1, 2, 3], index: 2 });
});

test("next walks the queue; at the end it stops with repeat off and wraps with repeat all", () => {
  let state = playing([0, 1], 0);
  let out = run(state, { type: "next" });
  expect(out.commands).toEqual([{ type: "open", id: 1 }]);
  state = out.state;
  expect(run(state, { type: "next" }).commands).toEqual([]);
  expect(run({ ...state, repeat: "all" }, { type: "next" }).commands).toEqual([{ type: "open", id: 0 }]);
  expect(run({ ...state, repeat: "one" }, { type: "next" }).commands).toEqual([]);
});

test("previous restarts after 3 s, otherwise opens the previous song", () => {
  const state = playing([0, 1, 2], 1);
  expect(run({ ...state, status: status({ trackId: 1, phase: "playing", positionMs: 3001 }) }, { type: "prev" }).commands)
    .toEqual([{ type: "seek", ms: 0 }]);
  expect(run({ ...state, status: status({ trackId: 1, phase: "playing", positionMs: 3000 }) }, { type: "prev" }).commands)
    .toEqual([{ type: "open", id: 0 }]);
});

test("previous on the first song restarts it, or wraps to the last with repeat all", () => {
  const state = playing([0, 1, 2], 0);
  expect(run(state, { type: "prev" }).commands).toEqual([{ type: "seek", ms: 0 }]);
  expect(run({ ...state, repeat: "all" }, { type: "prev" }).commands).toEqual([{ type: "open", id: 2 }]);
});

test("an ended song advances; repeat one replays it; the last song stops at 0:00 or wraps", () => {
  const ended = (id: number) => ({ type: "hostStatus", status: status({ trackId: id, phase: "ended", positionMs: 1000, durationMs: 1000 }) }) as const;
  expect(run(playing([0, 1], 0), ended(0)).commands).toEqual([{ type: "open", id: 1 }]);
  expect(run(playing([0, 1], 0, { repeat: "one" }), ended(0)).commands).toEqual([{ type: "open", id: 0 }]);
  expect(run(playing([0, 1], 1), ended(1)).commands).toEqual([{ type: "seek", ms: 0 }, { type: "paused", value: true }]);
  expect(run(playing([0, 1], 1, { repeat: "all" }), ended(1)).commands).toEqual([{ type: "open", id: 0 }]);
});

test("a status for another track is stored but never acted on", () => {
  const stale = status({ trackId: 0, phase: "ended" });
  const { state, commands } = run(playing([0, 1], 1), { type: "hostStatus", status: stale });
  expect(commands).toEqual([]);
  expect(state.status).toEqual(stale);
  expect(state.index).toBe(1);
});

test("an error skips forward without retrying under repeat one, and an all-failing queue stops", () => {
  const error = (id: number) => ({ type: "hostStatus", status: status({ trackId: id, phase: "error", error: "bad" }) }) as const;
  let out = run(playing([0, 1, 2], 0, { repeat: "one" }), error(0));
  expect(out.commands).toEqual([{ type: "open", id: 1 }]);
  out = run(playing([0, 1, 2], 0, { repeat: "all" }), error(0), error(1));
  expect(out.commands).toEqual([{ type: "open", id: 2 }]);
  const stopped = run(out.state, error(2));
  expect(stopped.commands).toEqual([]);
  expect(stopped.state.failures).toBe(3);
  const recovered = run(out.state, { type: "hostStatus", status: status({ trackId: 2, phase: "playing" }) });
  expect(recovered.state.failures).toBe(0);
});

test("toggle pauses, resumes, and reopens a song the host is not holding", () => {
  const state = playing([0, 1], 0);
  expect(run({ ...state, status: status({ trackId: 0, phase: "playing" }) }, { type: "toggle" }).commands).toEqual([{ type: "paused", value: true }]);
  expect(run({ ...state, status: status({ trackId: 0, phase: "loading" }) }, { type: "toggle" }).commands).toEqual([{ type: "paused", value: true }]);
  expect(run({ ...state, status: status({ trackId: 0, phase: "paused" }) }, { type: "toggle" }).commands).toEqual([{ type: "paused", value: false }]);
  expect(run({ ...state, status: status({ trackId: -1, phase: "idle" }) }, { type: "toggle" }).commands).toEqual([{ type: "open", id: 0 }]);
});

test("seek is clamped to the song and ignored when the host holds another song", () => {
  const state = { ...playing([0], 0), status: status({ trackId: 0, phase: "playing", durationMs: 5000 }) };
  expect(run(state, { type: "seek", ms: 9999 }).commands).toEqual([{ type: "seek", ms: 5000 }]);
  expect(run(state, { type: "seek", ms: -10 }).commands).toEqual([{ type: "seek", ms: 0 }]);
  expect(run(state, { type: "seek", ms: NaN }).commands).toEqual([{ type: "seek", ms: 0 }]);
  expect(run({ ...state, status: status({ trackId: 3 }) }, { type: "seek", ms: 10 }).commands).toEqual([]);
});

test("repeat cycles off, all, one, off", () => {
  let state = initialPlayer();
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    state = run(state, { type: "cycleRepeat" }).state;
    seen.push(state.repeat);
  }
  expect(seen).toEqual(["all", "one", "off"]);
});

test("transport actions with nothing queued do nothing", () => {
  for (const action of [{ type: "next" }, { type: "prev" }, { type: "toggle" }, { type: "seek", ms: 5 },
    { type: "hostStatus", status: status({ phase: "ended", trackId: 0 }) }] as PlayerAction[]) {
    expect(run(initialPlayer(), action).commands).toEqual([]);
  }
});
