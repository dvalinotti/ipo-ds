import { expect, test } from "bun:test";
import { localMedia, type LocalMediaOps } from "@pocketjs/framework/localmedia";
import { createSimLocalMedia, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { createPlayerController } from "../app/player/controller.ts";
import { currentId } from "../app/player/reducer.ts";

const song = (file: string, extra: Partial<SimLocalTrack> = {}): SimLocalTrack => ({ file, durationMs: 1000, ...extra });

function setup(library: SimLocalTrack[]) {
  const host = createSimLocalMedia(library);
  const media = localMedia(host.ns);
  media.scan();
  const changes: number[] = [];
  const player = createPlayerController(media, { random: () => 0, onChange: (s) => changes.push(s.status.trackId) });
  const frames = (n: number) => {
    for (let i = 0; i < n; i++) {
      host.advance(100);
      player.poll();
    }
  };
  return { host, player, frames, changes };
}

test("dispatch shows the new song's snapshot before the next frame", () => {
  const { player, changes } = setup([song("a.mp3"), song("b.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1], startId: 1 });
  expect(player.state().status).toMatchObject({ trackId: 1, phase: "loading" });
  expect(changes).toEqual([1]);
});

test("a queue plays through and stops on its last song at 0:00", () => {
  const { host, player, frames } = setup([song("a.mp3"), song("b.mp3"), song("c.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1, 2], startId: 0 });
  frames(40);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(1)", "open(2)"]);
  expect(player.state().status).toMatchObject({ trackId: 2, phase: "paused", positionMs: 0 });
});

test("a corrupt file in the queue is skipped", () => {
  const { host, player, frames } = setup([song("a.mp3"), song("bad.mp3", { corrupt: true }), song("c.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1, 2], startId: 0 });
  frames(15);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(1)", "open(2)"]);
  expect(player.state().status).toMatchObject({ trackId: 2, phase: "playing" });
});

test("an all-corrupt queue under repeat all stops instead of cycling", () => {
  const { host, player, frames } = setup([song("x.mp3", { corrupt: true }), song("y.mp3", { corrupt: true })]);
  player.dispatch({ type: "cycleRepeat" });
  player.dispatch({ type: "playFrom", ids: [0, 1], startId: 0 });
  frames(20);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(1)"]);
});

test("seek and toggle reach the host", () => {
  const { player, frames } = setup([song("a.mp3", { durationMs: 10_000 })]);
  player.dispatch({ type: "playFrom", ids: [0], startId: 0 });
  frames(1);
  player.dispatch({ type: "seek", ms: 5000 });
  expect(player.state().status.positionMs).toBe(5000);
  player.dispatch({ type: "toggle" });
  expect(player.state().status.phase).toBe("paused");
});

test("the frame that auto-advances already shows the next song's snapshot", () => {
  const { host, player } = setup([song("a.mp3"), song("b.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 1], startId: 0 });
  for (let i = 0; i < 50 && !host.log.includes("open(1)"); i++) {
    host.advance(100);
    player.poll();
  }
  expect(currentId(player.state())).toBe(1);
  expect(player.state().status).toMatchObject({ trackId: 1, phase: "loading" });
});

test("an id the host refuses to open is skipped like a failed song", () => {
  const { host, player, frames } = setup([song("a.mp3"), song("b.mp3")]);
  player.dispatch({ type: "playFrom", ids: [0, 5, 1], startId: 0 });
  frames(15);
  expect(host.log.filter((entry) => entry.startsWith("open"))).toEqual(["open(0)", "open(5)", "open(1)"]);
  expect(player.state().status).toMatchObject({ trackId: 1, phase: "playing" });
});

/** A host that breaks the snapshot rule: the first status read after an open still shows the snapshot from before it. */
function lagging(ns: LocalMediaOps): LocalMediaOps {
  let stale: string | null = null;
  return {
    ...ns,
    open(id) {
      stale = ns.status();
      return ns.open(id);
    },
    status() {
      if (stale === null) return ns.status();
      const before = stale;
      stale = null;
      return before;
    },
  };
}

test("repeat one replays once even when the host reports the previous end after the reopen", () => {
  const host = createSimLocalMedia([song("a.mp3")]);
  const media = localMedia(lagging(host.ns));
  media.scan();
  const player = createPlayerController(media, { random: () => 0 });
  player.dispatch({ type: "cycleRepeat" });
  player.dispatch({ type: "cycleRepeat" });
  player.dispatch({ type: "playFrom", ids: [0], startId: 0 });
  const opens = () => host.log.filter((entry) => entry.startsWith("open")).length;
  for (let i = 0; i < 50 && opens() < 2; i++) {
    host.advance(100);
    player.poll();
  }
  expect(opens()).toBe(2);
  host.advance(100);
  player.poll();
  expect(opens()).toBe(2);
  expect(player.state().status).toMatchObject({ trackId: 0, phase: "playing", openSerial: 2 });
});

test("a poll that reads the same status object changes nothing; a new status reaches onChange", () => {
  const { host, player, changes } = setup([song("a.mp3")]);
  player.poll();
  const settled = changes.length;
  for (let i = 0; i < 5; i++) player.poll(); // the host clock stands still: the SDK returns the same object
  expect(changes.length).toBe(settled);
  player.dispatch({ type: "playFrom", ids: [0], startId: 0 });
  host.advance(100);
  player.poll();
  expect(changes.length).toBe(settled + 2); // the dispatch, then the poll that saw playback move
});
