import { expect, test } from "bun:test";
import { localMedia } from "@pocketjs/framework/localmedia";
import { createSimLocalMedia, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { createPlayerController } from "../app/player/controller.ts";

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
