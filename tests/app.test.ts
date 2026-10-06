import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, pathTo, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

// 3DS face buttons map by position: A = CIRCLE, B = CROSS, X = TRIANGLE, Y = SQUARE.
const A = BTN.CIRCLE, B = BTN.CROSS, X = BTN.TRIANGLE, Y = BTN.SQUARE;
const SELECTED_ROW = 0xffd77538;

interface Rig {
  world: BundleWorld;
  host: SimLocalMediaHost;
}

/** Steps frames with the host clock moving in step (60 Hz). */
function frames(rig: Rig, count: number, input?: StepInput): void {
  for (let i = 0; i < count; i++) {
    rig.world.step(input);
    rig.host.advance(1000 / 60);
  }
}

function press(rig: Rig, button: number, held = 1): void {
  frames(rig, held, { buttons: button });
  frames(rig, 2);
}

function touch(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

async function boot(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const host = createSimLocalMedia(library);
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

/** The text of the focused (selected) list row. */
function selectedRow(world: BundleWorld): string {
  const row = flat(world.tree("primary")).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row ? flat(row).map((node) => node.text).join("") : "";
}

const opens = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("open("));

test("launch: the Explorer lists the library, sorted, first row focused; Now Playing is idle", async () => {
  const rig = await boot();
  const top = screenText(rig.world, "primary");
  for (const part of ["Ds Man", "20 songs · 1.6 hrs", "Song Name", "Artist", "Aerodynamic", "Around the World", "A", "Play", "Search"]) expect(top).toContain(part);
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
}, 120_000);

test("A plays the focused song; Now Playing shows it; the visible list is the queue", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).toContain("Around the World");
  press(rig, A);
  expect(opens(rig.host)).toEqual(["open(7)"]);
  frames(rig, 3);
  const bottom = screenText(rig.world, "auxiliary");
  for (const part of ["Around the World", "Daft Punk", "Homework", "2 of 20", "0:0"]) expect(bottom).toContain(part);
  press(rig, BTN.ZR);
  expect(opens(rig.host)).toEqual(["open(7)", "open(16)"]);
}, 120_000);

test("tabs do not wrap; drilling into an artist and backing out restores the focused row", async () => {
  const rig = await boot();
  press(rig, BTN.LTRIGGER);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER);
  expect(screenText(rig.world, "primary")).toContain("Album");
  press(rig, BTN.LTRIGGER);
  press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).toContain("Gorillaz");
  press(rig, A);
  const drilled = screenText(rig.world, "primary");
  for (const part of ["Artists", "›", "Gorillaz", "4 songs", "Song Name", "Album", "Demon Days", "Kids with Guns"]) expect(drilled).toContain(part);
  press(rig, B);
  expect(selectedRow(rig.world)).toContain("Gorillaz");
}, 120_000);

test("X opens the keyboard; typing filters live; START keeps the query; B clears it", async () => {
  const rig = await boot();
  press(rig, X);
  expect(screenText(rig.world, "auxiliary")).toContain("START confirm");
  for (const key of ["d", "a", "f", "t"]) {
    const [x, y, w, h] = pathTo(rig.world, "auxiliary", key).at(-2)!.rect!;
    touch(rig, x + w / 2, y + h / 2);
  }
  let top = screenText(rig.world, "primary");
  for (const part of ["Search:", "daft", "8 found", "Edit search", "Clear"]) expect(top).toContain(part);
  expect(screenText(rig.world, "auxiliary")).toContain("daft|");
  // Once the keyboard's slide-in settles, the field sits above it, not under it, and the keys reach the foot of the screen.
  frames(rig, 60);
  const { width, rgba } = rig.world.pixels("auxiliary");
  const bluish = (y: number) => rgba[(y * width + 4) * 4 + 2]! - rgba[(y * width + 4) * 4]! >= 6;
  expect([bluish(20), bluish(30), bluish(236)]).toEqual([false, true, true]);
  const [, fy, , fh] = pathTo(rig.world, "auxiliary", "daft|").at(-3)!.rect!;
  const [, hy] = pathTo(rig.world, "auxiliary", "B close · START confirm").at(-2)!.rect!;
  expect(fy + fh).toBeLessThanOrEqual(hy);
  press(rig, BTN.START);
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
  top = screenText(rig.world, "primary");
  expect(top).toContain("daft");
  expect(top).not.toContain("Gorillaz");
  press(rig, B);
  expect(screenText(rig.world, "primary")).not.toContain("Search:");
}, 120_000);

test("seek: dragging previews the time with no seek until release, then exactly one seek", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic, 3:27
  frames(rig, 60);
  const y = 135;
  frames(rig, 1, { touches: [{ x: 80, y }], surface: "auxiliary" });
  for (let x = 90; x <= 160; x += 10) frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  // 160 is the track's midpoint (inner left 61 + 198 / 2): half of 207 s.
  expect(screenText(rig.world, "auxiliary")).toContain("1:43");
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual([]);
  frames(rig, 3);
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual(["seek(103500)"]);
}, 120_000);

test("transport taps pause, skip, shuffle and cycle repeat", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN);
  press(rig, A); // Around the World, 2 of 20
  frames(rig, 3);
  touch(rig, 160, 196); // play / pause
  expect(rig.host.log).toContain("paused(true)");
  touch(rig, 223, 196); // next
  expect(opens(rig.host).at(-1)).toBe("open(16)");
  frames(rig, 3);
  expect(screenText(rig.world, "auxiliary")).toContain("3 of 20");
  touch(rig, 49, 196); // shuffle: the current song moves to the head of the order
  expect(screenText(rig.world, "auxiliary")).toContain("1 of 20");
  touch(rig, 271, 196); // repeat all
  touch(rig, 271, 196); // repeat one: the LCD shows its "1"
  expect(pathTo(rig.world, "auxiliary", "1").length).toBeGreaterThan(0);
}, 120_000);

test("holding X rescans: playback continues and a removed file drops from the queue", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic; the queue continues with Around the World
  frames(rig, 3);
  rig.host.setLibrary(LIBRARY.filter((song) => song.file !== "dp-13.mp3" && song.file !== "dp-02.mp3"));
  press(rig, X, 70);
  frames(rig, 3);
  expect(rig.host.log.filter((entry) => entry === "scan()")).toHaveLength(2);
  expect(screenText(rig.world, "primary")).toContain("18 songs");
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
  expect(screenText(rig.world, "auxiliary")).not.toContain("START confirm");
  press(rig, BTN.ZR);
  expect(opens(rig.host).at(-1)).toBe("open(16)");
}, 120_000);

test("Y jumps back to the playing song", async () => {
  const rig = await boot();
  press(rig, A);
  for (let i = 0; i < 5; i++) press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).not.toContain("Aerodynamic");
  press(rig, Y);
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
}, 120_000);

test("a held D-pad repeats and the focused row stays inside the list", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN, 60); // fires on frames 0, 18, 23 … 58: ten moves
  expect(selectedRow(rig.world)).toContain("Glósóli");
  const row = flat(rig.world.tree("primary")).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW)!;
  const [, y, , h] = row.rect!;
  expect(y).toBeGreaterThanOrEqual(52);
  expect(y + h).toBeLessThanOrEqual(220);
}, 120_000);

test("a long title marquees in Now Playing; a short one stays still", async () => {
  const region = (world: BundleWorld) => {
    const { width, rgba } = world.pixels("auxiliary");
    const out: number[] = [];
    for (let y = 16; y < 34; y++) for (let x = 126; x < 302; x++) out.push(rgba[(y * width + x) * 4]!);
    return out.join(",");
  };
  const rig = await boot();
  press(rig, BTN.DOWN);
  press(rig, BTN.DOWN);
  press(rig, A); // Bohemian Rhapsody (Remastered 2011, Live at Wembley Stadium, Extended)
  frames(rig, 30);
  const before = region(rig.world);
  frames(rig, 150);
  expect(region(rig.world)).not.toBe(before);

  const still = await boot();
  press(still, A); // Aerodynamic
  frames(still, 30);
  const shortBefore = region(still.world);
  frames(still, 150);
  expect(region(still.world)).toBe(shortBefore);
}, 120_000);

test("decomposed accents in tags are composed before they are shown", async () => {
  const rig = await boot();
  for (let i = 0; i < 13; i++) press(rig, BTN.DOWN);
  expect(selectedRow(rig.world)).toContain("Hoppípolla");
}, 120_000);

test("a build without media.local, a garbled host reply, and an empty card each explain themselves", async () => {
  const bare = { host: createSimLocalMedia([]), world: await bootApp() };
  frames(bare, 3);
  expect(screenText(bare.world, "primary")).toContain("Music playback is unavailable on this build");
  expect(screenText(bare.world, "primary")).toContain("Unavailable");
  expect(screenText(bare.world, "auxiliary")).toContain("Nothing playing");

  const garbledHost = createSimLocalMedia(LIBRARY);
  const garbled = { host: garbledHost, world: await bootApp({ localmedia: { ...garbledHost.ns, tracks: () => "[{" } }) };
  frames(garbled, 3);
  expect(garbled.world.failure).toBeNull();
  expect(screenText(garbled.world, "primary")).toContain("Could not read the music library");

  const empty = await boot([]);
  expect(screenText(empty.world, "primary")).toContain("No music found");
  expect(screenText(empty.world, "primary")).toContain("0 songs");
  expect(screenText(empty.world, "primary")).not.toContain("0 min");
  press(empty, X);
  expect(empty.host.log.filter((entry) => entry === "scan()")).toHaveLength(2);
}, 120_000);
