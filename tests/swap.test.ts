// tests/swap.test.ts
// Screen Swap (spec §4, §6): hold SELECT swaps the screens; the Explorer goes narrow on the bottom,
// the deck wide on top, and the buttons drive playback.
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost, type SimLocalTrack } from "../runtime/hosts/sim/localmedia.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, pathsTo, pathTo, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

const A = BTN.CIRCLE, B = BTN.CROSS, X = BTN.TRIANGLE, Y = BTN.SQUARE, L = BTN.LTRIGGER;
const SELECTED_ROW = 0xffd77538;
type Surface = "primary" | "auxiliary";

interface Rig {
  world: BundleWorld;
  host: SimLocalMediaHost;
}

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

/** Holds SELECT past the hold time (with `extra` held too): a swap, unless `extra` is a shoulder. */
function holdSelect(rig: Rig, extra = 0): void {
  frames(rig, 62, { buttons: BTN.SELECT | extra });
  frames(rig, 3);
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

/** The text of the focused (selected) list row on a surface. */
function selectedRow(world: BundleWorld, surface: Surface): string {
  const row = flat(world.tree(surface)).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row ? flat(row).map((node) => node.text).join("") : "";
}

const platterShown = (world: BundleWorld) => flat(world.tree("auxiliary")).some((node) => node.rect?.join(",") === "10,20,200,200");
/** The top deck's DJ gel is lit: its body pixels differ from the (off) shuffle gel's, which has the same size and class set. */
function djGelOn(world: BundleWorld): boolean {
  const row = flat(world.tree("primary")).find((node) => node.children.length === 6 && node.children.every((child) => child.rect));
  const { width, rgba } = world.pixels("primary");
  const body = (gel: SimNode) => {
    const [x, y, w, h] = gel.rect!;
    const at = (px: number, py: number) => Array.from(rgba.slice((py * width + px) * 4, (py * width + px) * 4 + 4)).join(",");
    return [at(x + 4, y + h - 6), at(x + w - 5, y + h - 6)].join("|");
  };
  return body(row!.children[5]!) !== body(row!.children[0]!);
}
const seeks = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("seek(")).map((entry) => Number(entry.slice(5, -1)));

test("holding SELECT swaps the screens: the wide deck on top, the narrow list below; holding again swaps back", async () => {
  const rig = await boot();
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
  holdSelect(rig);
  const top = screenText(rig.world, "primary");
  for (const part of ["Nothing playing", "Tap a song below"]) expect(top).toContain(part);
  const bottom = screenText(rig.world, "auxiliary");
  for (const part of ["iPoDS", "Song Name", "Artist", "Aerodynamic", "Search", "Back"]) expect(bottom).toContain(part);
  expect(bottom).not.toContain("Now Playing");
  // The narrow toolbar fits: the Albums tab's gel ends at or before x 314.
  const albums = pathTo(rig.world, "auxiliary", "Albums").at(-3)!.rect!;
  expect(albums[0] + albums[2]).toBeLessThanOrEqual(314);
  // Eight 21 px rows: the list body is still 168 px tall (the app's rows sit under the recycled list's
  // slots, so the body is found by its rect rather than by walking up from a title).
  expect(flat(rig.world.tree("auxiliary")).some((node) => node.rect?.join(",") === "0,51,320,168")).toBe(true);
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
  holdSelect(rig);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
}, 120_000);

test("a SELECT tap still toggles DJ Mode; L with SELECT neither toggles nor swaps, even when L comes later", async () => {
  const rig = await boot();
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(false);
  press(rig, BTN.SELECT | L);
  expect(platterShown(rig.world)).toBe(false);
  holdSelect(rig, L);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  frames(rig, 30, { buttons: BTN.SELECT });
  frames(rig, 35, { buttons: BTN.SELECT | L });
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(platterShown(rig.world)).toBe(false);
}, 120_000);

test("the list keeps its place and its focus across a swap", async () => {
  const rig = await boot();
  // Down 12 scrolls the window to row 5; up 4 leaves the focus on row 8, still inside it. A fresh Explorer
  // that forgot the window would show row 1 at the top (the least scrolling for focus 8), so the rows on
  // screen tell whether scrollRow carried the window across.
  for (let i = 0; i < 12; i++) press(rig, BTN.DOWN);
  for (let i = 0; i < 4; i++) press(rig, BTN.UP);
  const focused = selectedRow(rig.world, "primary");
  const shown = screenText(rig.world, "primary");
  expect(shown).not.toContain("Around the World"); // row 1 is above the window
  expect(shown).toContain("DARE"); // row 5 is its first row
  holdSelect(rig);
  expect(selectedRow(rig.world, "auxiliary")).toBe(focused);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Around the World");
  expect(screenText(rig.world, "auxiliary")).toContain("DARE");
  holdSelect(rig);
  expect(selectedRow(rig.world, "primary")).toBe(focused);
  expect(screenText(rig.world, "primary")).not.toContain("Around the World");
}, 120_000);

test("swapped: A pauses and resumes, left and right seek by 5 s then 2 s, X shuffles, Y cycles repeat, up does not move focus", async () => {
  const rig = await boot();
  press(rig, BTN.DOWN);
  press(rig, A); // Around the World, 2 of 20
  frames(rig, 3);
  holdSelect(rig);
  expect(screenText(rig.world, "primary")).toContain("2 of 20");
  press(rig, A);
  expect(rig.host.log.at(-1)).toBe("paused(true)");
  press(rig, A);
  expect(rig.host.log.at(-1)).toBe("paused(false)");
  frames(rig, 400); // about 6.7 s into the song
  const position = () => (JSON.parse(rig.host.ns.status()) as { positionMs: number }).positionMs; // the host replies in JSON
  const before = position();
  expect(before).toBeGreaterThan(5000);
  press(rig, BTN.LEFT); // a tap: one seek of 5 s, sent on the release
  expect(seeks(rig.host)).toHaveLength(1);
  expect(Math.abs(seeks(rig.host)[0]! - (before - 5000))).toBeLessThan(300);
  const beforeHold = position();
  frames(rig, 24, { buttons: BTN.RIGHT }); // press (+5 s), repeats at frames 18 and 23 (+2 s each): one seek of +9 s on release
  frames(rig, 2);
  expect(seeks(rig.host)).toHaveLength(2);
  expect(Math.abs(seeks(rig.host)[1]! - (beforeHold + 9000))).toBeLessThan(300);
  frames(rig, 60, { buttons: BTN.RIGHT }); // a long hold is still one seek
  frames(rig, 2);
  expect(seeks(rig.host)).toHaveLength(3);
  press(rig, X); // shuffle: the current song moves to the head of the order
  expect(screenText(rig.world, "primary")).toContain("1 of 20");
  press(rig, Y); // repeat all: no "1" flag yet
  expect(pathsTo(rig.world, "primary", "1")).toHaveLength(0);
  press(rig, Y); // repeat one: the LCD shows its "1"
  expect(pathsTo(rig.world, "primary", "1")).toHaveLength(1);
  const focused = selectedRow(rig.world, "auxiliary");
  press(rig, BTN.DOWN); // the d-pad is unbound while swapped
  expect(selectedRow(rig.world, "auxiliary")).toBe(focused);
  press(rig, BTN.UP);
  expect(selectedRow(rig.world, "auxiliary")).toBe(focused);
}, 120_000);

test("swapped: A and left do nothing with nothing playing; B still backs out of a drill-down", async () => {
  const rig = await boot();
  holdSelect(rig);
  press(rig, A);
  press(rig, BTN.LEFT);
  expect(rig.host.log).toEqual(["scan()"]);
  holdSelect(rig); // back to normal: drill into an artist with the buttons
  press(rig, BTN.RTRIGGER);
  press(rig, A);
  expect(screenText(rig.world, "primary")).toContain("Artists›"); // the breadcrumb: root and › are separate texts, joined without a space
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("Artists›");
  press(rig, B);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Artists›");
}, 120_000);

test("a swap while A is held does not touch playback", async () => {
  const rig = await boot();
  frames(rig, 62, { buttons: BTN.SELECT | A }); // A plays Aerodynamic on frame 0; the swap lands at frame 60
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Aerodynamic");
  expect(rig.host.log.filter((entry) => entry.startsWith("paused("))).toEqual([]);
}, 120_000);

test("X over the empty panel rescans in swapped mode", async () => {
  const rig = await boot([]);
  frames(rig, 4);
  expect(screenText(rig.world, "primary")).toContain("No music found");
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("Scan again");
  press(rig, X);
  expect(rig.host.log.filter((entry) => entry === "scan()")).toHaveLength(2);
}, 120_000);

test("swapped: SELECT shows DJ Mode over the Explorer, the deck stays on top, and the panel's gel returns to the list", async () => {
  const rig = await boot();
  press(rig, A);
  frames(rig, 3);
  holdSelect(rig);
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  expect(djGelOn(rig.world)).toBe(true);
  expect(screenText(rig.world, "primary")).toContain("Aerodynamic");
  touch(rig, 265, 203); // the panel's gel back to the deck: here, back to the Explorer
  expect(platterShown(rig.world)).toBe(false);
  expect(djGelOn(rig.world)).toBe(false);
  expect(screenText(rig.world, "auxiliary")).toContain("Song Name");
  // Swapping back while DJ Mode is on keeps the record below and moves the Explorer back up.
  press(rig, BTN.SELECT);
  holdSelect(rig);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "primary")).toContain("Song Name");
}, 120_000);

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

test("swapped presses touch no nodes: A, A and a held RIGHT create nothing; X and Y mount only their LCD icon", async () => {
  const rig = await boot();
  press(rig, A);
  frames(rig, 3);
  holdSelect(rig);
  frames(rig, 10);
  const ops = recordOps();
  press(rig, A);
  press(rig, A);
  frames(rig, 24, { buttons: BTN.RIGHT });
  frames(rig, 2);
  expect(ops.calls.filter((name) => name === "createNode")).toEqual([]);
  ops.calls.length = 0;
  press(rig, X); // shuffle on: the LCD mounts its shuffle icon and nothing else
  expect(ops.calls.filter((name) => name === "createNode")).toHaveLength(1);
  ops.calls.length = 0;
  press(rig, Y); // repeat all: the repeat icon
  expect(ops.calls.filter((name) => name === "createNode")).toHaveLength(1);
  ops.stop();
}, 120_000);

test("a Y held through a swap neither cycles repeat on the narrow list nor reveals on the wide one", async () => {
  const rig = await boot();
  press(rig, A); // Aerodynamic plays
  frames(rig, 3);
  for (let i = 0; i < 3; i++) press(rig, BTN.DOWN); // focus away from the playing row
  const focused = selectedRow(rig.world, "primary");
  expect(focused).not.toContain("Aerodynamic");
  frames(rig, 62, { buttons: BTN.SELECT | Y }); // swap with Y down; the narrow Explorer mounts under it
  frames(rig, 3); // Y released after the mount: no repeat cycle
  expect(screenText(rig.world, "primary")).toContain("Aerodynamic");
  press(rig, Y); // a real tap: off → all (no "1" yet)
  expect(pathsTo(rig.world, "primary", "1")).toHaveLength(0);
  press(rig, Y); // all → one: the LCD shows its "1"
  expect(pathsTo(rig.world, "primary", "1")).toHaveLength(1);
  frames(rig, 62, { buttons: BTN.SELECT | Y }); // swap back with Y down; the wide Explorer mounts under it
  frames(rig, 3); // released: no reveal, the focus stays where it was
  expect(selectedRow(rig.world, "primary")).toBe(focused);
}, 120_000);
