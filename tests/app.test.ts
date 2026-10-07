import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, pathTo, pathsTo, screenText } from "./support/app-world.ts";

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

/** Taps a key of the open keyboard by its label. */
function typeKeys(rig: Rig, keys: string): void {
  for (const key of keys) {
    const [x, y, w, h] = pathTo(rig.world, "auxiliary", key).at(-2)!.rect!;
    touch(rig, x + w / 2, y + h / 2);
  }
}

/** Holds X past the hold time: a rescan. */
function rescan(rig: Rig): void {
  press(rig, X, 70);
  frames(rig, 3);
}

/** The column header labelled `text` (not a tab or row with the same text). */
const header = (world: BundleWorld, text: string) => pathsTo(world, "primary", text).find((path) => path.at(-2)!.rect![1] === 35);

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

/** Records every host op the guest issues from now on (the sim's `ui` object, wrapped in place). */
function recordOps(): { calls: string[]; stop(): void } {
  const ui = (globalThis as unknown as { ui: Record<string, unknown> }).ui;
  const calls: string[] = [];
  const originals = new Map<string, (...args: unknown[]) => unknown>();
  for (const [key, fn] of Object.entries(ui)) {
    if (typeof fn !== "function" || key === "frame" || key.startsWith("debug") || key.startsWith("hitTest")) continue;
    originals.set(key, fn as (...args: unknown[]) => unknown);
    ui[key] = (...args: unknown[]) => {
      calls.push(key);
      return (fn as (...args: unknown[]) => unknown).apply(ui, args);
    };
  }
  return { calls, stop: () => { for (const [key, fn] of originals) ui[key] = fn; } };
}

test("a focus move touches only the selection: no row is rebuilt, scrolling included", async () => {
  const rig = await boot();
  const ops = recordOps();
  press(rig, BTN.DOWN); // focus moves within the page
  const focusOps = [...ops.calls];
  ops.calls.length = 0;
  for (let i = 0; i < 8; i++) press(rig, BTN.DOWN); // past the page: the list scrolls a row at a time
  const scrollOps = [...ops.calls];
  ops.stop();
  expect(focusOps.filter((op) => op === "createNode")).toHaveLength(0);
  expect(focusOps.length).toBeLessThanOrEqual(4);
  expect(scrollOps.filter((op) => op === "createNode")).toHaveLength(0);
  expect(selectedRow(rig.world)).not.toBe("");
}, 120_000);

test("while a song plays the status is read every fourth frame, and at once after a command", async () => {
  const host = createSimLocalMedia(LIBRARY);
  let reads = 0;
  const rig = { host, world: await bootApp({ localmedia: { ...host.ns, status: () => (reads++, host.ns.status()) } }) };
  frames(rig, 4);
  press(rig, A);
  frames(rig, 4);
  reads = 0;
  frames(rig, 60);
  expect(reads).toBeGreaterThanOrEqual(15);
  expect(reads).toBeLessThanOrEqual(16);
  reads = 0;
  frames(rig, 1, { buttons: BTN.START }); // pause: the command reads the status itself
  const afterCommand = reads;
  frames(rig, 1);
  expect(afterCommand).toBeGreaterThanOrEqual(1);
  expect(reads).toBeGreaterThan(afterCommand); // and the next frame polls regardless of the cadence
}, 120_000);

test("tabs do not wrap; drilling into an artist and backing out restores the focused row", async () => {
  const rig = await boot();
  press(rig, BTN.LTRIGGER);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER);
  expect(header(rig.world, "Album")).toBeDefined();
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

test("holding Y with L / R skips songs without ZL / ZR, and leaves the tab alone", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic; next in the list is Around the World
  frames(rig, 3);
  frames(rig, 2, { buttons: Y });
  frames(rig, 1, { buttons: Y | BTN.RTRIGGER });
  frames(rig, 2, { buttons: Y });
  frames(rig, 3);
  expect(opens(rig.host)).toEqual(["open(1)", "open(7)"]);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
  frames(rig, 2, { buttons: Y });
  frames(rig, 1, { buttons: Y | BTN.LTRIGGER });
  frames(rig, 3);
  expect(opens(rig.host).at(-1)).toBe("open(1)");
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

test("a search that matches nothing shows No matches instead of crashing", async () => {
  const rig = await boot();
  press(rig, X);
  typeKeys(rig, "qq");
  press(rig, BTN.START);
  expect(rig.world.failure).toBeNull();
  const top = screenText(rig.world, "primary");
  for (const part of ["No matches", "0 found"]) expect(top).toContain(part);
}, 120_000);

test("a query counts what each tab shows, and a tab with no matches is safe", async () => {
  const rig = await boot();
  press(rig, X);
  typeKeys(rig, "daft");
  press(rig, BTN.START);
  press(rig, BTN.RTRIGGER);
  expect(screenText(rig.world, "primary")).toContain("1 found");
  press(rig, BTN.RTRIGGER);
  expect(rig.world.failure).toBeNull();
  expect(screenText(rig.world, "primary")).toContain("No matches");
}, 120_000);

test("a rescan that removes the drilled artist, or shrinks the list below the focus, stays usable", async () => {
  const rig = await boot();
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.DOWN);
  press(rig, A); // Gorillaz
  rig.host.setLibrary(LIBRARY.filter((song) => song.artist !== "Gorillaz"));
  rescan(rig);
  expect(rig.world.failure).toBeNull();
  expect(screenText(rig.world, "primary")).not.toContain("›");
  expect(header(rig.world, "Artist")).toBeDefined();
  press(rig, BTN.LTRIGGER);
  for (let i = 0; i < 16; i++) press(rig, BTN.DOWN);
  rig.host.setLibrary(LIBRARY.filter((song) => song.artist !== "Gorillaz" && song.file !== "qu-02.mp3"));
  rescan(rig);
  expect(rig.world.failure).toBeNull();
  expect(selectedRow(rig.world)).not.toBe("");
}, 120_000);

test("Now Playing keeps a song a rescan removed, even after the keyboard has replaced it", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic
  frames(rig, 3);
  rig.host.setLibrary(LIBRARY.filter((song) => song.file !== "dp-02.mp3"));
  rescan(rig);
  press(rig, X);
  press(rig, BTN.START);
  frames(rig, 3);
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
  touch(rig, 160, 196);
  expect(rig.host.log).toContain("paused(true)");
}, 120_000);

test("transport taps do nothing while nothing has played", async () => {
  const rig = await boot();
  for (const x of [49, 97, 160, 223, 271]) touch(rig, x, 196);
  expect(rig.host.log).toEqual(["scan()"]);
}, 120_000);

test("an hour-long track shows h:mm:ss on both sides of the seek bar", async () => {
  const rig = await boot([{ file: "mix.mp3", title: "Two Hour Mix", artist: "DJ", album: "Mixes", track: 1, durationMs: 7_200_000 }]);
  press(rig, A);
  frames(rig, 70);
  const bottom = screenText(rig.world, "auxiliary");
  expect(bottom).toContain("0:00:01");
  expect(bottom).toContain("-1:59:5");
}, 120_000);

test("a host whose status reads start failing is reported, survives taps, and recovers", async () => {
  const host = createSimLocalMedia(LIBRARY);
  let garbled = false;
  const ns = { ...host.ns, status: () => (garbled ? "{" : host.ns.status()) };
  const rig = { host, world: await bootApp({ localmedia: ns }) };
  frames(rig, 4);
  press(rig, A);
  garbled = true;
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Could not read the music library");
  touch(rig, 160, 196);
  press(rig, BTN.START);
  expect(rig.world.failure).toBeNull();
  garbled = false;
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).not.toContain("Could not read the music library");
  expect(selectedRow(rig.world)).toContain("Aerodynamic");
}, 120_000);

test("over the read-error panel an X tap does nothing; holding X still scans again", async () => {
  const host = createSimLocalMedia(LIBRARY);
  let garbled = false;
  const ns = { ...host.ns, status: () => (garbled ? "{" : host.ns.status()) };
  const rig = { host, world: await bootApp({ localmedia: ns }) };
  frames(rig, 4);
  garbled = true;
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Could not read the music library");
  const scans = () => host.log.filter((entry) => entry === "scan()").length;
  const before = scans();
  press(rig, X);
  expect(scans()).toBe(before);
  expect(screenText(rig.world, "primary")).not.toContain("Search:"); // no keyboard
  rescan(rig);
  expect(scans()).toBe(before + 1);
}, 120_000);

test("a tap on the remaining-time label does not seek", async () => {
  const rig = await boot();
  press(rig, A);
  frames(rig, 10);
  touch(rig, 290, 135);
  expect(rig.host.log.filter((entry) => entry.startsWith("seek("))).toEqual([]);
}, 120_000);

// ---------------------------------------------------------------------------
// Covers, playback errors and diagnostics (Plan 4)
// ---------------------------------------------------------------------------

/** Four songs in title order; Bravo has no embedded art. */
const COVERS: SimLocalTrack[] = [
  { file: "a.mp3", title: "Alpha", artist: "Ann", album: "One", track: 1, durationMs: 60_000, art: true },
  { file: "b.mp3", title: "Bravo", artist: "Ann", album: "One", track: 2, durationMs: 60_000 },
  { file: "c.mp3", title: "Charlie", artist: "Ann", album: "One", track: 3, durationMs: 60_000, art: true },
  { file: "d.mp3", title: "Delta", artist: "Ann", album: "One", track: 4, durationMs: 60_000, art: true },
];

/** The cover image node: drawn at the art frame's 98×98 interior. */
const coverNode = (world: BundleWorld) =>
  flat(world.tree("auxiliary")).find((node) => node.type === "image" && node.rect?.[2] === 98 && node.rect?.[3] === 98);

/** The loading spinner: a 32×32 sprite inside the art frame (10..110 on both axes). */
const spinnerNode = (world: BundleWorld) =>
  flat(world.tree("auxiliary")).find((node) => node.type === "image" && node.rect?.[2] === 32 && node.rect?.[3] === 32
    && node.rect[0] > 10 && node.rect[0] < 110 && node.rect[1] > 10 && node.rect[1] < 110);

const artworkCalls = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("artwork("));
const releases = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("releaseArtwork("));

async function bootWith(library: SimLocalTrack[], options: { artworkMs?: number } = {}): Promise<Rig> {
  const host = createSimLocalMedia(library, options);
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

test("a spinner shows while the cover decodes, then the cover; the art is asked for until then only", async () => {
  const rig = await bootWith(COVERS, { artworkMs: 200 });
  press(rig, A); // Alpha
  expect(coverNode(rig.world)).toBeUndefined(); // pending: the spinner, not the placeholder
  expect(spinnerNode(rig.world)).toBeDefined();
  expect(pathsTo(rig.world, "auxiliary", "On")).toHaveLength(0); // the placeholder's initials
  frames(rig, 15);
  expect(coverNode(rig.world)).toBeDefined();
  expect(spinnerNode(rig.world)).toBeUndefined();
  expect(rig.host.liveArtwork()).toHaveLength(1);
  const asked = artworkCalls(rig.host).length;
  frames(rig, 10);
  expect(artworkCalls(rig.host)).toHaveLength(asked);
}, 120_000);

test("a track without art never asks and shows the placeholder; a skip releases the old cover at once and spins until the next", async () => {
  const rig = await bootWith(COVERS, { artworkMs: 200 });
  press(rig, A); // Alpha
  frames(rig, 15);
  const alpha = rig.host.liveArtwork()[0]!;
  press(rig, BTN.ZR); // Bravo: no art
  expect(artworkCalls(rig.host)).not.toContain("artwork(1)");
  expect(coverNode(rig.world)).toBeUndefined();
  expect(spinnerNode(rig.world)).toBeUndefined();
  expect(pathsTo(rig.world, "auxiliary", "On").length).toBeGreaterThan(0); // Bravo's placeholder
  expect(releases(rig.host)).toEqual([`releaseArtwork(${alpha})`]);
  press(rig, BTN.ZR); // Charlie
  frames(rig, 15);
  const charlie = rig.host.liveArtwork()[0]!;
  press(rig, BTN.ZR); // Delta: pending for 200 ms
  expect(coverNode(rig.world)).toBeUndefined(); // Charlie's cover is gone at once
  expect(spinnerNode(rig.world)).toBeDefined();
  expect(rig.host.liveArtwork()).toEqual([]);
  frames(rig, 15);
  expect(rig.host.liveArtwork()).toHaveLength(1);
  expect(rig.host.liveArtwork()[0]).not.toBe(charlie);
  expect(releases(rig.host)).toEqual([`releaseArtwork(${alpha})`, `releaseArtwork(${charlie})`]);
}, 120_000);

test("fifty track changes leave at most one live cover and release each exactly once", async () => {
  const rig = await bootWith(COVERS);
  press(rig, A);
  for (let i = 0; i < 50; i++) {
    press(rig, BTN.ZR);
    frames(rig, 2);
    expect(rig.host.liveArtwork().length).toBeLessThanOrEqual(1);
  }
  const released = releases(rig.host);
  expect(new Set(released).size).toBe(released.length);
  expect(rig.host.ns.status()).toContain('"artHandles":1');
}, 120_000);

test("a playback error shows in the LCD status row", async () => {
  const rig = await bootWith([{ file: "broken.mp3", title: "Broken", durationMs: 1000, corrupt: true }]);
  press(rig, A);
  frames(rig, 3);
  expect(screenText(rig.world, "auxiliary")).toContain("MP3 frame sync not found");
}, 120_000);

test("holding L+R shows underruns, decode load and live covers without stepping tabs", async () => {
  const rig = await bootWith(COVERS);
  press(rig, A);
  frames(rig, 3);
  rig.host.setDecodeLoad(23);
  frames(rig, 3, { buttons: BTN.LTRIGGER });
  frames(rig, 3, { buttons: BTN.LTRIGGER | BTN.RTRIGGER });
  expect(screenText(rig.world, "auxiliary")).toContain("U:0 D:23% A:1 F:-"); // the sim has no frame timing
  frames(rig, 3);
  expect(screenText(rig.world, "auxiliary")).toContain("1 of 4");
  expect(header(rig.world, "Song Name")).toBeDefined(); // still the Songs tab (L alone could not step left of it)
  press(rig, BTN.RTRIGGER); // Artists
  frames(rig, 3, { buttons: BTN.RTRIGGER });
  frames(rig, 3, { buttons: BTN.RTRIGGER | BTN.LTRIGGER });
  frames(rig, 3);
  expect(header(rig.world, "Song Name")).toBeUndefined(); // still Artists: the second shoulder did not step back
}, 120_000);
