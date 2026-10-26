// tests/support/rig.ts
// A booted app with a sim media host, stepped at 60 Hz, and readers for the bottom screen's list.
// The narrow list: rows are 21 px from y 51 (plus 21 per strip); the fixture's sorted songs are
// Aerodynamic, Around the World, Bohemian Rhapsody, Crescendolls, Da Funk, DARE, Death on Two Legs,
// Digital Love, Dirty Harry, Feel Good Inc., Glósóli, Gong, … (20 songs: content 420, window 168).
import { expect } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../../runtime/programs/sim/sim.ts";
import {
  createSimLocalMedia,
  type SimLocalMediaHost,
  type SimLocalTrack,
} from "../../runtime/platforms/sim/localmedia.ts";
import { LIBRARY } from "../fixtures/library.ts";
import { bootApp, screenText } from "./app-world.ts";

export const SELECTED_ROW = 0xffd77538;
export const BODY_TOP = 51,
  ROW = 21,
  BODY_PX = 168;
export type Surface = "primary" | "auxiliary";

export interface Rig {
  world: BundleWorld;
  host: SimLocalMediaHost;
}

export function frames(rig: Rig, count: number, input?: StepInput): void {
  for (let i = 0; i < count; i++) {
    rig.world.step(input);
    rig.host.advance(1000 / 60);
  }
}

export function press(rig: Rig, button: number, held = 1): void {
  frames(rig, held, { buttons: button });
  frames(rig, 2);
}

/** Holds SELECT past the hold time: a swap. */
export function holdSelect(rig: Rig): void {
  frames(rig, 62, { buttons: BTN.SELECT });
  frames(rig, 3);
}

/** A tap: one frame down on the bottom screen, then lifted. */
export function tap(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

/** A finger moving `step` px in y per frame for `count` frames, left down (lift it with `frames(rig, n)`). */
export function drag(rig: Rig, x: number, y0: number, step: number, count: number): void {
  for (let i = 0; i < count; i++) frames(rig, 1, { touches: [{ x, y: y0 + step * i }], surface: "auxiliary" });
}

export async function boot(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const host = createSimLocalMedia(library);
  const rig = { host, world: await bootApp({ localmedia: host.ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

/** Boots and swaps the screens: the narrow Explorer is on the bottom. */
export async function bootSwapped(library: SimLocalTrack[] = LIBRARY): Promise<Rig> {
  const rig = await boot(library);
  holdSelect(rig);
  expect(screenText(rig.world, "auxiliary")).toContain("iPoDS");
  return rig;
}

export function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

const isRow = (n: SimNode) =>
  n.rect !== null && n.rect[0] === 0 && n.rect[2] === 320 && (n.rect[3] === ROW || n.rect[3] === ROW + 1); // a mid-row shift rounds the rect outward: 22 tall
const inBody = (n: SimNode, bodyTop: number, bodyPx: number) =>
  n.rect![1] > bodyTop - ROW && n.rect![1] < bodyTop + bodyPx;

/** The y of every row View on the bottom screen inside the body (slot rows and the overlay; pooled rows off-screen are left out). */
export function rowYs(world: BundleWorld, bodyTop = BODY_TOP, bodyPx = BODY_PX): number[] {
  return flat(world.tree("auxiliary"))
    .filter((n) => isRow(n) && inBody(n, bodyTop, bodyPx))
    .map((n) => n.rect![1]);
}

export const aligned = (ys: number[], bodyTop = BODY_TOP) => ys.every((y) => (y - bodyTop) % ROW === 0);

/** The text of the striped list rows inside the body, joined with "|": not the overlay, not pooled rows outside the body. */
export function listText(world: BundleWorld, bodyTop = BODY_TOP, bodyPx = BODY_PX): string {
  return flat(world.tree("auxiliary"))
    .filter((n) => isRow(n) && inBody(n, bodyTop, bodyPx) && n.bgColor >>> 0 !== 0 && n.bgColor >>> 0 !== SELECTED_ROW)
    .map((n) =>
      flat(n)
        .map((c) => c.text)
        .join(""),
    )
    .join("|");
}

/** The text of the striped row whose top is at screen y. */
export function rowTextAt(world: BundleWorld, y: number): string {
  const row = flat(world.tree("auxiliary")).find(
    (n) => isRow(n) && n.rect![1] === y && n.bgColor >>> 0 !== 0 && n.bgColor >>> 0 !== SELECTED_ROW,
  );
  return row
    ? flat(row)
        .map((c) => c.text)
        .join("")
    : "";
}

/** The text of the striped row whose rect spans screen y (a mid-row scroll puts tops off the grid). */
export function rowTextSpanning(world: BundleWorld, y: number): string {
  const row = flat(world.tree("auxiliary")).find(
    (n) =>
      isRow(n) &&
      n.rect![1] <= y &&
      y < n.rect![1] + n.rect![3] &&
      n.bgColor >>> 0 !== 0 &&
      n.bgColor >>> 0 !== SELECTED_ROW,
  );
  return row
    ? flat(row)
        .map((c) => c.text)
        .join("")
    : "";
}

/** The text of the focused (selected) list row on a surface. */
export function selectedRow(world: BundleWorld, surface: Surface): string {
  const row = flat(world.tree(surface)).find((node) => node.type === "view" && node.bgColor >>> 0 === SELECTED_ROW);
  return row
    ? flat(row)
        .map((node) => node.text)
        .join("")
    : "";
}

export const opens = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("open("));
export const scans = (host: SimLocalMediaHost) => host.log.filter((entry) => entry === "scan()");
