// tests/touch.test.ts
// The touch Explorer (spec §5): with the screens swapped, the list on the bottom screen is dragged,
// flicked, tapped and paged by hand. Geometry and fixture facts: tests/support/rig.ts.
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import { LIBRARY } from "./fixtures/library.ts";
import { disposeGuest, screenText } from "./support/app-world.ts";
import { aligned, BODY_TOP, bootSwapped, drag, frames, holdSelect, listText, opens, press, rowTextSpanning, rowYs, ROW, scans, selectedRow, tap } from "./support/rig.ts";

afterAll(disposeGuest);

const X = BTN.TRIANGLE;

test("a tap plays the song under the finger with the visible list as the queue, and moves the highlight to it", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + ROW + 10); // row 1: Around the World
  expect(opens(rig.host)).toEqual(["open(7)"]);
  expect(selectedRow(rig.world, "auxiliary")).toContain("Around the World");
  frames(rig, 3);
  expect(screenText(rig.world, "primary")).toContain("Around the World");
  press(rig, BTN.ZR);
  expect(opens(rig.host)).toEqual(["open(7)", "open(16)"]); // the next visible song, as A's queue does
}, 120_000);

test("a tap on an album opens it", async () => {
  const rig = await bootSwapped();
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER); // Albums
  tap(rig, 100, BODY_TOP + 10); // the first album
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  expect(opens(rig.host)).toEqual([]);
}, 120_000);

test("a tap on the gap below the last row does nothing", async () => {
  const rig = await bootSwapped([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  tap(rig, 100, BODY_TOP + 5 * ROW); // below three rows
  expect(opens(rig.host)).toEqual([]);
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
}, 120_000);

test("a drag follows the finger mid-row; a flick flings and comes to rest on a row; the list never passes its end", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 180, -8, 4); // 24 px of travel: panning, mid-row
  expect(aligned(rowYs(rig.world))).toBe(false);
  drag(rig, 100, 148, -8, 6); // 72 px in all, then lift at 480 px/s
  frames(rig, 150);
  const ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  // 20 rows, 8 per window: the end is top 12, rows 12–19 at y 51–198, nothing drawn below.
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(Math.max(...ys)).toBe(BODY_TOP + 7 * ROW);
  expect(opens(rig.host)).toEqual([]); // dragging never plays
}, 120_000);

test("a tap during a fling stops it on a row and plays the row under the finger", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -10, 8);
  frames(rig, 2); // lifted: flinging
  const moving = rowYs(rig.world);
  frames(rig, 1);
  expect(rowYs(rig.world)).not.toEqual(moving);
  const y = BODY_TOP + 3 * ROW + 10;
  frames(rig, 1, { touches: [{ x: 100, y }], surface: "auxiliary" }); // the down frame stops the fling
  const under = rowTextSpanning(rig.world, y); // the row under the finger, before the align tween moves it
  expect(under).not.toBe("");
  frames(rig, 2); // lifted
  frames(rig, 30);
  expect(selectedRow(rig.world, "auxiliary")).toContain(under);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(opens(rig.host)).toHaveLength(1);
  expect(selectedRow(rig.world, "auxiliary")).not.toContain("Aerodynamic"); // the highlight left row 0
  expect(listText(rig.world)).toContain(selectedRow(rig.world, "auxiliary").slice(0, 6)); // and sits on a visible row
}, 120_000);

test("the list keeps its touch-scrolled place across a swap and back when the tapped row is still in view", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 7 * ROW + 10); // Digital Love plays; the highlight is on row 7
  drag(rig, 100, 200, -20, 3); // 60 px up, then held still so the lift has no velocity
  drag(rig, 100, 140, 0, 6);
  frames(rig, 60); // rests on row 3: rows 3–10 shown, the highlighted row 7 among them
  const before = rowYs(rig.world);
  expect(aligned(before)).toBe(true);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  holdSelect(rig); // normal: the wide list keeps the window, since the focused row is inside it
  expect(screenText(rig.world, "primary")).not.toContain("Aerodynamic");
  expect(selectedRow(rig.world, "primary")).toContain("Digital Love");
  holdSelect(rig);
  expect(rowYs(rig.world)).toEqual(before);
}, 120_000);

test("a rescan that drops rows under a scrolled window clamps it and shows the rest from a row", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -8, 10);
  frames(rig, 150); // at the end: top 12
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  rig.host.setLibrary([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  press(rig, X, 70); // hold X: a rescan, in narrow layout too
  frames(rig, 6);
  expect(rig.world.failure).toBeNull();
  expect(scans(rig.host)).toHaveLength(2);
  const ys = rowYs(rig.world);
  expect(ys.length).toBeGreaterThan(0);
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(aligned(ys)).toBe(true);
  expect(listText(rig.world)).toContain("Aerodynamic");
}, 120_000);
