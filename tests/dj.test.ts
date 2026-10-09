import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode, StepInput } from "../runtime/hosts/sim/sim.ts";
import { createSimLocalMedia, type SimLocalMediaHost } from "../runtime/hosts/sim/localmedia.ts";
import { PLATTER } from "../app/dj/platter.ts";
import { LIBRARY } from "./fixtures/library.ts";
import { bootApp, disposeGuest, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

const A = BTN.CIRCLE, X = BTN.TRIANGLE;

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

function press(rig: Rig, button: number): void {
  frames(rig, 1, { buttons: button });
  frames(rig, 2);
}

function touch(rig: Rig, x: number, y: number): void {
  frames(rig, 1, { touches: [{ x, y }], surface: "auxiliary" });
  frames(rig, 2);
}

async function boot(status?: () => void): Promise<Rig> {
  const host = createSimLocalMedia(LIBRARY);
  const ns = status ? { ...host.ns, status: () => (status(), host.ns.status()) } : host.ns;
  const rig = { host, world: await bootApp({ localmedia: ns }) };
  frames(rig, 4);
  expect(rig.world.failure).toBeNull();
  return rig;
}

/** Plays the focused song (the first, Aerodynamic) and lets it start. */
function play(rig: Rig): void {
  press(rig, A);
  frames(rig, 3);
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

const platterShown = (world: BundleWorld) => flat(world.tree("auxiliary")).some((node) => node.rect?.join(",") === "10,20,200,200");

/** The platter's pixels on the bottom screen. */
function platterPixels(world: BundleWorld): Buffer {
  const { width, rgba } = world.pixels("auxiliary");
  const d = width / 320;
  const rows: Buffer[] = [];
  for (let y = PLATTER.y * d; y < (PLATTER.y + PLATTER.size) * d; y++) {
    rows.push(Buffer.from(rgba.subarray((y * width + PLATTER.x * d) * 4, (y * width + (PLATTER.x + PLATTER.size) * d) * 4)));
  }
  return Buffer.concat(rows);
}

/** A contact on the platter, `deg` clockwise from 12 o'clock, 60 px out. */
function onRecord(deg: number, extra: Partial<StepInput> = {}): StepInput {
  const rad = (deg * Math.PI) / 180;
  return { touches: [{ x: Math.round(PLATTER.cx + 60 * Math.sin(rad)), y: Math.round(PLATTER.cy - 60 * Math.cos(rad)) }], surface: "auxiliary", ...extra } as StepInput;
}

/** One frame per step, turning `degPerFrame` (positive clockwise) from `from`; returns the final angle. */
function turn(rig: Rig, from: number, degPerFrame: number, steps: number): number {
  for (let i = 0; i <= steps; i++) frames(rig, 1, onRecord(from + degPerFrame * i));
  return from + degPerFrame * steps;
}

const scratchLog = (host: SimLocalMediaHost) => host.log.filter((entry) => entry.startsWith("scratch"));
const rates = (host: SimLocalMediaHost) => scratchLog(host).filter((entry) => entry.startsWith("scratchRate(")).map((entry) => Number(entry.slice("scratchRate(".length, -1)));

test("SELECT and the deck's DJ gel open DJ Mode; SELECT and the panel's gel go back; L+SELECT does nothing", async () => {
  const rig = await boot();
  play(rig);
  expect(platterShown(rig.world)).toBe(false);
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).toContain("Aerodynamic");
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(false);
  touch(rig, 293, 196); // the deck's DJ gel
  expect(platterShown(rig.world)).toBe(true);
  touch(rig, 265, 203); // the panel's gel back to the deck
  expect(platterShown(rig.world)).toBe(false);
  press(rig, BTN.SELECT | BTN.LTRIGGER);
  expect(platterShown(rig.world)).toBe(false);
  expect(scratchLog(rig.host)).toEqual([]);
}, 120_000);

test("the record turns while the song plays and holds while it is paused", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  const before = platterPixels(rig.world);
  frames(rig, 10);
  expect(platterPixels(rig.world).equals(before)).toBe(false);
  press(rig, BTN.START);
  expect(rig.host.log).toContain("paused(true)");
  frames(rig, 2);
  const paused = platterPixels(rig.world);
  frames(rig, 10);
  expect(platterPixels(rig.world).equals(paused)).toBe(true);
}, 120_000);

test("a clockwise circle scratches forward, a still finger settles on 0 and stops sending, counter-clockwise scratches backward, the lift lets go", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  let at = turn(rig, 0, 10, 18); // 10° a frame: 3x forward
  expect(scratchLog(rig.host)[0]).toBe("scratchBegin()");
  const forward = rates(rig.host);
  expect(forward.length).toBeGreaterThan(5);
  expect(forward.every((rate) => rate > 0)).toBe(true);
  // Touches are whole pixels, so the angle jitters ~0.5 deg a frame and the smoothed rate wobbles ~0.1 around 3.
  expect(Math.max(...forward)).toBeCloseTo(3, 0);
  frames(rig, 20, onRecord(at)); // held still
  expect(rates(rig.host).at(-1)).toBe(0);
  const settled = rates(rig.host).length;
  frames(rig, 10, onRecord(at));
  expect(rates(rig.host)).toHaveLength(settled);
  at = turn(rig, at, -10, 18);
  const backward = rates(rig.host).slice(settled);
  expect(backward.some((rate) => rate < 0)).toBe(true);
  expect(Math.min(...backward)).toBeCloseTo(-3, 0);
  frames(rig, 2); // lift
  expect(scratchLog(rig.host).at(-1)).toBe("scratchEnd()");
  expect(scratchLog(rig.host).filter((entry) => entry === "scratchBegin()")).toHaveLength(1);
}, 120_000);

test("while the record is held the status is read every frame, and at 15 Hz again after the lift", async () => {
  let reads = 0;
  const rig = await boot(() => reads++);
  play(rig);
  press(rig, BTN.SELECT);
  frames(rig, 2, onRecord(0));
  reads = 0;
  frames(rig, 30, onRecord(0));
  expect(reads).toBeGreaterThanOrEqual(30);
  frames(rig, 3);
  reads = 0;
  frames(rig, 60);
  expect(reads).toBeLessThanOrEqual(16);
}, 120_000);

test("crossing the spindle sends no spike", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  for (const x of [-40, -30, -20, -8, 0, 8, 20, 30, 40]) frames(rig, 1, { touches: [{ x: PLATTER.cx + x, y: PLATTER.cy }], surface: "auxiliary" });
  frames(rig, 2);
  expect(scratchLog(rig.host)[0]).toBe("scratchBegin()");
  expect(rates(rig.host).every((rate) => Math.abs(rate) < 0.01)).toBe(true);
}, 120_000);

test("a track change mid-scratch lets go, and the finger sends nothing more", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  const at = turn(rig, 0, 10, 6);
  frames(rig, 1, onRecord(at + 10, { buttons: BTN.ZR }));
  frames(rig, 2, onRecord(at + 20));
  const log = rig.host.log;
  const opened = log.findLastIndex((entry) => entry.startsWith("open("));
  expect(opened).toBeGreaterThan(0);
  expect(log.slice(opened)).toContain("scratchEnd()");
  const sent = rates(rig.host).length;
  turn(rig, at + 20, 10, 6);
  expect(rates(rig.host)).toHaveLength(sent);
  frames(rig, 2);
}, 120_000);

test("leaving DJ Mode mid-scratch lets go: SELECT, and the keyboard, which returns to DJ Mode when it closes", async () => {
  const rig = await boot();
  play(rig);
  press(rig, BTN.SELECT);
  let at = turn(rig, 0, 10, 4);
  frames(rig, 1, onRecord(at, { buttons: BTN.SELECT }));
  frames(rig, 2);
  expect(platterShown(rig.world)).toBe(false);
  expect(scratchLog(rig.host).at(-1)).toBe("scratchEnd()");
  press(rig, BTN.SELECT);
  at = turn(rig, 0, 10, 4);
  // X opens the keyboard (on press or on release): keep the finger down through both, so the
  // let-go comes from DJ Mode unmounting, not from the lift.
  frames(rig, 1, onRecord(at, { buttons: X }));
  frames(rig, 2, onRecord(at));
  expect(screenText(rig.world, "auxiliary")).not.toContain("Aerodynamic");
  expect(scratchLog(rig.host).at(-1)).toBe("scratchEnd()");
  expect(scratchLog(rig.host).filter((entry) => entry === "scratchEnd()")).toHaveLength(2);
  frames(rig, 2); // lift
  press(rig, BTN.START); // closes the keyboard, keeping the (empty) query
  frames(rig, 2);
  expect(platterShown(rig.world)).toBe(true);
}, 120_000);

test("with nothing playing the record holds still, the panel says so, and touching it sends nothing", async () => {
  const rig = await boot();
  press(rig, BTN.SELECT);
  expect(platterShown(rig.world)).toBe(true);
  expect(screenText(rig.world, "auxiliary")).toContain("Nothing playing");
  const before = platterPixels(rig.world);
  turn(rig, 0, 10, 10);
  frames(rig, 2);
  expect(platterPixels(rig.world).equals(before)).toBe(true);
  expect(scratchLog(rig.host)).toEqual([]);
  expect(rig.host.log).toEqual(["scan()"]);
}, 120_000);
