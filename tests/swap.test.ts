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
