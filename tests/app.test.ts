import { afterAll, expect, test } from "bun:test";
import { createSimLocalMedia } from "../runtime/hosts/sim/localmedia.ts";
import { bootApp, disposeGuest, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

test("both screens mount: the explorer on top, the now-playing deck below", async () => {
  const world = await bootApp();
  for (let frame = 0; frame < 5; frame++) world.step();
  expect(world.failure).toBeNull();
  expect(screenText(world, "primary")).toContain("Ds Man");
  expect(screenText(world, "auxiliary")).toContain("Nothing playing — pick a song above");
}, 120_000);

test("a build without media.local says so", async () => {
  const world = await bootApp();
  for (let frame = 0; frame < 3; frame++) world.step();
  expect(screenText(world, "primary")).toContain("Music playback is unavailable on this build");
}, 120_000);

test("the library is scanned once at launch and counted when the scan completes", async () => {
  const host = createSimLocalMedia([{ file: "a.mp3", durationMs: 1000 }, { file: "b.mp3", durationMs: 1000 }], { scanMs: 100 });
  const world = await bootApp({ localmedia: host.ns });
  world.step();
  expect(screenText(world, "primary")).toContain("Scanning sdmc:/music/…");
  host.advance(100);
  world.step();
  world.step();
  expect(world.failure).toBeNull();
  expect(screenText(world, "primary")).toContain("2 tracks");
  expect(host.log.filter((entry) => entry === "scan()")).toHaveLength(1);
}, 120_000);

test("an empty music folder is reported", async () => {
  const host = createSimLocalMedia([]);
  const world = await bootApp({ localmedia: host.ns });
  for (let frame = 0; frame < 3; frame++) world.step();
  expect(screenText(world, "primary")).toContain("No music found in sdmc:/music/");
}, 120_000);
