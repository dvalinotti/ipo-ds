// tests/touch.test.ts
// The touch Explorer (spec §5): with the screens swapped, the list on the bottom screen is dragged,
// flicked, tapped and paged by hand. Geometry and fixture facts: tests/support/rig.ts.
import { afterAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import { LIBRARY } from "./fixtures/library.ts";
import { bodyTopPx } from "../app/explorer/scroll.ts";
import { disposeGuest, pathsTo, pathTo, screenText } from "./support/app-world.ts";
import { aligned, BODY_PX, BODY_TOP, bootSwapped, drag, flat, frames, holdSelect, listText, opens, press, rowTextAt, rowTextSpanning, rowYs, ROW, scans, SELECTED_ROW, selectedRow, tap, type Rig } from "./support/rig.ts";

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
  drag(rig, 100, 180, -8, 4); // 24 px of travel (the first contact is at 180, the last at 156): panning, mid-row
  expect(aligned(rowYs(rig.world))).toBe(false);
  // The list followed the finger by exactly its travel: row 0 (y 51) is now at 27, above the body's visible rows, so
  // the lowest row y in the body is row 1 at 51 + 21 - 24 = 48.
  expect(Math.min(...rowYs(rig.world))).toBe(BODY_TOP + ROW - 24);
  drag(rig, 100, 148, -8, 6); // 72 px in all, then lift at 480 px/s
  frames(rig, 150);
  const ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  // 72 px of drag and the fling's run carry it on, about four rows in all, to rest on a row; the end fling is tested below.
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(Math.max(...ys)).toBe(BODY_TOP + 7 * ROW); // eight whole rows fill the body, nothing past them
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
  drag(rig, 100, 200, -83, 3); // a fling at the cap into the end
  frames(rig, 150); // at the end: 20 rows, 8 per window, top 12
  expect(Math.max(...rowYs(rig.world))).toBe(BODY_TOP + 7 * ROW);
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

/** The distinct row ys: pooled rows may trade slots, and the highlight overlay adds a row where the focus sits. */
const sorted = (ys: number[]) => [...new Set(ys)].sort((a, b) => a - b);
const sortedText0 = (text: string) => text.split("|").sort();
const sortedText = (world: Rig["world"]) => sortedText0(listText(world));

test("a fling into either end stops hard on the edge row and never shows a gap", async () => {
  const rig = await bootSwapped();
  const lowest = BODY_TOP + 7 * ROW;
  // Down the list: a drag of -83 px per frame is about 5000 px/s, the cap. Past the end the offset would spring back.
  drag(rig, 100, 200, -83, 3);
  for (let i = 0; i < 70; i++) {
    frames(rig, 1);
    expect(Math.max(...rowYs(rig.world))).toBeGreaterThanOrEqual(lowest); // the last row never rises off the body's foot
  }
  let ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(Math.max(...ys)).toBe(lowest);
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(listText(rig.world)).toContain("You're My Best Friend");
  // Up the list from the end.
  drag(rig, 100, 52, 83, 3);
  for (let i = 0; i < 70; i++) {
    frames(rig, 1);
    expect(Math.min(...rowYs(rig.world))).toBeLessThanOrEqual(BODY_TOP); // the first row never drops below the body's head
  }
  ys = rowYs(rig.world);
  expect(aligned(ys)).toBe(true);
  expect(Math.min(...ys)).toBe(BODY_TOP);
  expect(listText(rig.world)).toContain("Aerodynamic");
  expect(opens(rig.host)).toEqual([]);
}, 120_000);

test("a touch-scrolled Songs list keeps its place across a tab round trip", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -20, 3);
  drag(rig, 100, 140, 0, 6); // 60 px up and held still: rests on row 3
  frames(rig, 60);
  const before = rowYs(rig.world);
  const text = listText(rig.world);
  expect(aligned(before)).toBe(true);
  expect(text).not.toContain("Aerodynamic");
  press(rig, BTN.RTRIGGER);
  expect(listText(rig.world)).toContain("Gorillaz"); // Artists
  press(rig, BTN.LTRIGGER);
  frames(rig, 5);
  expect(sorted(rowYs(rig.world))).toEqual(sorted(before)); // pooled rows may trade slots: compare as sets
  expect(sortedText(rig.world)).toEqual(sortedText0(text));
}, 120_000);

test("an album drilled into and left returns the Albums list where it was", async () => {
  // Twelve one-song albums: the Albums list is longer than its window.
  const many = Array.from({ length: 12 }, (_, i) => {
    const n = String(i).padStart(2, "0");
    return { file: `a-${n}.mp3`, title: `Song ${n}`, artist: "Artist", album: `Album ${n}`, track: 1, durationMs: 200_000 };
  });
  const rig = await bootSwapped(many);
  press(rig, BTN.RTRIGGER);
  press(rig, BTN.RTRIGGER); // Albums
  drag(rig, 100, 200, -20, 3);
  drag(rig, 100, 140, 0, 6); // 60 px up: rests on row 3
  frames(rig, 60);
  const before = rowYs(rig.world);
  const text = listText(rig.world);
  expect(aligned(before)).toBe(true);
  expect(text).not.toContain("Album 00");
  tap(rig, 100, BODY_TOP + 10); // the album at the top of the scrolled window: Album 03
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  press(rig, BTN.CROSS); // Back
  frames(rig, 5);
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
  expect(sorted(rowYs(rig.world))).toEqual(sorted(before));
  expect(sortedText(rig.world)).toEqual(sortedText0(text));
}, 120_000);

test("dragging the thumb scrolls by the track ratio, not the finger's pixels, and rests on a row", async () => {
  const rig = await bootSwapped();
  // 20 rows in a 168 px window: the thumb is 67 px tall, its travel 101 px for 252 px of travel (content 420 minus the 168 px window).
  drag(rig, 313, BODY_TOP + 10, 0, 1); // down on the thumb
  drag(rig, 313, BODY_TOP + 10, 10, 6); // 50 px down the track: about 125 px of content, 6 rows
  frames(rig, 40);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Death on Two Legs"); // row 6 at the top
  expect(opens(rig.host)).toEqual([]);
}, 120_000);

test("a tap on the track below the thumb pages down; above it pages up; a short list has no track to tap", async () => {
  const rig = await bootSwapped();
  tap(rig, 313, BODY_TOP + 150); // below the thumb (0–67)
  frames(rig, 30);
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Dirty Harry"); // row 8 at the top
  tap(rig, 313, BODY_TOP + 2); // above the thumb now
  frames(rig, 30);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Aerodynamic");
  const short = await bootSwapped([LIBRARY[0]!, LIBRARY[1]!, LIBRARY[2]!]);
  tap(short, 313, BODY_TOP + ROW + 10); // no thumb: the right edge belongs to the rows // row 1 of three by title: Digital Love, handle 2
  expect(opens(short.host)).toEqual(["open(2)"]);
}, 120_000);

/** Taps the centre of the text node reading `text` on the bottom screen (inside its gel); `last` takes the last match in tree order. */
function tapText(rig: Rig, text: string, last = false): void {
  const paths = pathsTo(rig.world, "auxiliary", text);
  const [x, y, w, h] = (last ? paths.at(-1)! : paths[0]!).at(-2)!.rect!;
  tap(rig, x + w / 2, y + h / 2);
}

/** Taps a key of the open keyboard by its label. */
function typeKeys(rig: Rig, keys: string): void {
  for (const key of keys) tapText(rig, key);
}

test("tapping a tab switches to it; L / R still step", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Albums");
  expect(screenText(rig.world, "auxiliary")).toContain("Album");
  expect(listText(rig.world)).toContain("Discovery");
  tapText(rig, "Artists");
  expect(listText(rig.world)).toContain("Daft Punk");
  expect(listText(rig.world)).not.toContain("Discovery");
  press(rig, BTN.LTRIGGER);
  expect(screenText(rig.world, "auxiliary")).toContain("Song Name");
}, 120_000);

test("the Search gel opens the keyboard with the Explorer pulled up; START closes it and the swap returns", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Search");
  expect(screenText(rig.world, "primary")).toContain("Song Name");
  expect(screenText(rig.world, "primary")).not.toContain("Nothing playing");
  typeKeys(rig, "gor"); // Gorillaz: the search covers artists too, so "da" would keep Daft Punk's songs
  expect(screenText(rig.world, "primary")).toContain("Search:gor");
  press(rig, BTN.START);
  expect(screenText(rig.world, "primary")).toContain("Nothing playing");
  const bottom = screenText(rig.world, "auxiliary");
  for (const part of ["Search:gor", "Edit search", "Clear"]) expect(bottom).toContain(part);
  const matches = listText(rig.world, bodyTopPx(1), BODY_PX - ROW); // one strip: the body starts at 72
  expect(matches).toContain("DARE");
  expect(matches).not.toContain("Aerodynamic");
  tapText(rig, "Clear");
  expect(listText(rig.world)).toContain("Aerodynamic");
}, 120_000);

test("a search typed while scrolled shows the matches from the top, under the search strip", async () => {
  const rig = await bootSwapped();
  drag(rig, 100, 200, -6, 10);
  frames(rig, 150);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  tapText(rig, "Search");
  typeKeys(rig, "dig");
  press(rig, BTN.START);
  expect(rig.world.failure).toBeNull();
  const ys = rowYs(rig.world, bodyTopPx(1), BODY_PX - ROW);
  expect(Math.min(...ys)).toBe(bodyTopPx(1));
  expect(aligned(ys, bodyTopPx(1))).toBe(true);
  expect(listText(rig.world, bodyTopPx(1), BODY_PX - ROW)).toContain("Digital Love");
}, 120_000);

test("inside an album a tap under the breadcrumb plays; the breadcrumb and the Back gel return with the album highlighted", async () => {
  const rig = await bootSwapped();
  tapText(rig, "Albums");
  tap(rig, 100, BODY_TOP + 2 * ROW + 10); // the third album
  expect(screenText(rig.world, "auxiliary")).toContain("Albums›");
  tap(rig, 100, bodyTopPx(1) + 10); // the album's first song, under the crumb strip
  expect(opens(rig.host)).toHaveLength(1);
  const crumb = pathTo(rig.world, "auxiliary", "›").at(-2)!.rect!;
  tap(rig, 200, crumb[1] + crumb[3] / 2); // anywhere on the strip
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
  const highlight = flat(rig.world.tree("auxiliary")).find((n) => n.type === "view" && n.bgColor >>> 0 === SELECTED_ROW)!.rect!;
  expect(highlight[1]).toBe(BODY_TOP + 2 * ROW); // the tapped album is highlighted where it was
  tap(rig, 100, BODY_TOP + 2 * ROW + 10);
  tapText(rig, "Albums", true); // the footer's Back gel reads "Albums" in a drill-down; the tab is the first match
  expect(screenText(rig.world, "auxiliary")).not.toContain("Albums›");
}, 120_000);

test("the LCD tap reveals the playing song and scrolls it into view", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 10); // Aerodynamic plays
  drag(rig, 100, 200, -8, 10);
  frames(rig, 150);
  expect(listText(rig.world)).not.toContain("Aerodynamic");
  tapText(rig, "iPoDS");
  frames(rig, 40);
  expect(rowTextAt(rig.world, BODY_TOP)).toContain("Aerodynamic");
  expect(listText(rig.world)).toContain("♪");
  expect(selectedRow(rig.world, "auxiliary")).toContain("Aerodynamic");
  expect(aligned(rowYs(rig.world))).toBe(true);
}, 120_000);

test("the LCD tap reveals the playing song from another tab, centred in the Songs list", async () => {
  const rig = await bootSwapped();
  tap(rig, 100, BODY_TOP + 7 * ROW + 10); // Digital Love, row 7
  tapText(rig, "Albums");
  expect(listText(rig.world)).not.toContain("Digital Love");
  tapText(rig, "iPoDS");
  frames(rig, 40);
  expect(screenText(rig.world, "auxiliary")).toContain("Song Name");
  expect(selectedRow(rig.world, "auxiliary")).toContain("Digital Love");
  expect(aligned(rowYs(rig.world))).toBe(true);
  expect(rowTextAt(rig.world, BODY_TOP + 4 * ROW)).toContain("Digital Love"); // centred: row 7 in a window from row 3
}, 120_000);

test("over the empty panel the list body does nothing, the tabs still switch, and the Scan again gel rescans", async () => {
  const rig = await bootSwapped([]);
  expect(screenText(rig.world, "auxiliary")).toContain("No music found");
  drag(rig, 100, 150, -8, 6);
  frames(rig, 10);
  tap(rig, 100, 120); // the list body
  tapText(rig, "iPoDS"); // the LCD
  expect(scans(rig.host)).toHaveLength(1);
  expect(screenText(rig.world, "auxiliary")).toContain("No music found");
  tapText(rig, "Albums"); // the tabs stay live
  expect(scans(rig.host)).toHaveLength(1);
  rig.host.setLibrary(LIBRARY);
  tapText(rig, "Scan again");
  expect(scans(rig.host)).toHaveLength(2);
  frames(rig, 10);
  expect(listText(rig.world)).toContain("Discovery"); // the Albums tab was the one switched to
  expect(listText(rig.world)).not.toContain("Aerodynamic");
}, 120_000);
