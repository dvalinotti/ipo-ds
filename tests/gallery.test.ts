import { afterAll, beforeAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld } from "../runtime/hosts/sim/sim.ts";
import { GALLERY_STATES, type GalleryStateName } from "../app/gallery/names.ts";
import { backgroundOf, bootGallery, disposeGuest, pathTo, screenText, textColorOf } from "./support/app-world.ts";

// Colours as the core holds them: 0xAABBGGRR.
const SELECTED_ROW = 0xffd77538; // #3875d7
const ODD_ROW = 0xfffef3ed; // #edf3fe
const WHITE = 0xffffffff;

let world: BundleWorld;
let current = 0;

beforeAll(async () => {
  world = await bootGallery();
  for (let frame = 0; frame < 6; frame++) world.step();
}, 180_000);

test("ArtFrame builds its embedded cover once (a second, never-inserted tree would leak native nodes)", () => {
  expect(world.logs.filter((log) => log.text === "cover-built")).toHaveLength(1);
});
afterAll(disposeGuest);

/** R advances one state; the tests visit states in GALLERY_STATES order (search, with its modal keyboard, last). */
function show(name: GalleryStateName): void {
  const target = GALLERY_STATES.indexOf(name);
  while (current !== target) {
    world.step({ buttons: BTN.RTRIGGER });
    for (let frame = 0; frame < 3; frame++) world.step();
    current = (current + 1) % GALLERY_STATES.length;
  }
  expect(world.failure).toBeNull();
}

function expectAll(text: string, parts: readonly string[]): void {
  for (const part of parts) expect(text).toContain(part);
}

test("main: songs with a selected and a playing row; Now Playing with embedded art", () => {
  show("main");
  expectAll(screenText(world, "primary"), ["Ds Man", "142 songs · 9.6 hrs", "Song Name", "Artist", "Digital Love", "Starálfur", "♪", "Now Playing"]);
  const selected = pathTo(world, "primary", "Digital Love");
  expect(backgroundOf(selected)).toBe(SELECTED_ROW);
  expect(textColorOf(selected)).toBe(WHITE);
  expect(backgroundOf(pathTo(world, "primary", "Aerodynamic"))).toBe(ODD_ROW);
  // Eight 21 px rows: the list body (row → cell → Text → run) is exactly 168 px tall.
  expect(pathTo(world, "primary", "Aerodynamic").at(-5)!.rect![3]).toBe(168);
  expectAll(screenText(world, "auxiliary"), ["One More Time", "Daft Punk", "3 of 12", "1:42", "-3:58", "DISCOVERY"]);
});

type Rect = [number, number, number, number];
const rect = (node: { rect: Rect | null } | undefined): Rect => node!.rect!;

test("design: art is centred in its frame; LCD lines clear the pill; tabs form one segmented control; header text aligns with its column", () => {
  // Main state (still showing).
  const art = pathTo(world, "auxiliary", "DISCOVERY");
  const [fx, fy, fw, fh] = rect(art.at(-4));
  const [cx, cy, cw, ch] = rect(art.at(-3));
  expect(cx - fx).toBe(fx + fw - (cx + cw));
  expect(cy - fy).toBe(fy + fh - (cy + ch));

  const line = pathTo(world, "primary", "142 songs · 9.6 hrs");
  const [, ly, , lh] = rect(line.at(-2));
  const [, by, , bh] = rect(line.at(-3));
  const [, ty] = rect(pathTo(world, "primary", "Ds Man").at(-2));
  expect(ty).toBeGreaterThanOrEqual(by + 2);
  expect(ly + lh).toBeLessThanOrEqual(by + bh - 2);

  // The group's rounded border is drawn over the segments: a pixel inside its
  // top-right corner arc is border grey, not the segment's light gradient.
  const [gx, gy, gw] = rect(pathTo(world, "primary", "Songs").at(-4));
  const { width, rgba } = world.pixels("primary");
  const at = ((gy + 1) * width + (gx + gw - 2)) * 4;
  expect((rgba[at]! + rgba[at + 1]! + rgba[at + 2]!) / 3).toBeLessThan(200);

  // Segments touch, separated by a 1 px divider, inside one group.
  const [sx, , sw] = rect(pathTo(world, "primary", "Songs").at(-3));
  const [ax, , aw] = rect(pathTo(world, "primary", "Artists").at(-3));
  const [bx] = rect(pathTo(world, "primary", "Albums").at(-3));
  expect(ax).toBe(sx + sw + 1);
  expect(bx).toBe(ax + aw + 1);

  // The second column's header and values share one inset past the column edge.
  const [hx] = rect(pathTo(world, "primary", "Artist").at(-2));
  const [dx] = rect(pathTo(world, "primary", "Daft Punk").at(-2));
  expect(hx).toBe(dx);
  expect(hx).toBeGreaterThan(242);

  // Seek fill starts inside the track's 1 px border.
  const capsule = pathTo(world, "auxiliary", "1:42").at(-3)!;
  const track = capsule.children[1]!;
  const [tx, tyy] = rect(track);
  const [qx, qy] = rect(track.children[0]);
  expect([qx, qy]).toEqual([tx + 1, tyy + 1]);
});

test("artists: names with right-hand counts, Queen selected; idle Now Playing", () => {
  show("artists");
  expectAll(screenText(world, "primary"), ["Beyoncé", "Queen", "Unknown Artist", "Open"]);
  expect(backgroundOf(pathTo(world, "primary", "Queen"))).toBe(SELECTED_ROW);
  expect(textColorOf(pathTo(world, "primary", "14"))).toBe(WHITE);
  expectAll(screenText(world, "auxiliary"), ["Nothing playing", "Pick a song above and press", "--:--"]);
  // The A in "press A" is a drawn key badge, not the circled glyph that clipped.
  expect(screenText(world, "auxiliary")).not.toContain("Ⓐ");
  expect(pathTo(world, "auxiliary", "A").length).toBeGreaterThan(0);
});

test("album drill-down: breadcrumb and numbered rows; Now Playing with placeholder art", () => {
  show("album");
  const ph = pathTo(world, "auxiliary", "Di");
  const [pfx, pfy, pfw] = rect(ph.at(-5));
  const [pcx, pcy, pcw] = rect(ph.at(-4));
  expect(pcx - pfx).toBe(pfx + pfw - (pcx + pcw));
  expect(pcy - pfy).toBe(pcx - pfx);
  expectAll(screenText(world, "primary"), ["Albums", "›", "Discovery", "Daft Punk · 14 songs", "5:20"]);
  expect(backgroundOf(pathTo(world, "primary", "Aerodynamic"))).toBe(SELECTED_ROW);
  // A title longer than its column is clipped by its 214 px cell (6 px gutter); the time column stays put.
  const long = pathTo(world, "primary", "Harder, Better, Faster, Stronger (Extended Club Mix)");
  expect(long[long.length - 3]!.rect![2]).toBe(214);
  const time = pathTo(world, "primary", "3:44");
  expect(time[time.length - 3]!.rect![0]).toBe(242);
  expectAll(screenText(world, "auxiliary"), ["Aerodynamic", "2 of 14", "0:12"]);
  expect(pathTo(world, "auxiliary", "Di").length).toBeGreaterThan(0);
});

test("scanning: LCD and panel report progress; idle Now Playing", () => {
  show("scanning");
  // The progress fill sits inside the track's 1 px border, the full inner height.
  const body = pathTo(world, "primary", "sdmc:/music/ · 87 of 142 files").at(-3)!;
  const progress = body.children.at(-1)!;
  const [px, py, , ph2] = rect(progress);
  const [fx2, fy2, , fh2] = rect(progress.children[0]);
  expect([fx2, fy2, fh2]).toEqual([px + 1, py + 1, ph2 - 2]);
  expectAll(screenText(world, "primary"), ["Scanning…", "Scanning your music…", "sdmc:/music/ · 87 of 142 files", "Now Playing"]);
  expect(screenText(world, "auxiliary")).toContain("Nothing playing");
});

test("empty library: guidance and a single Scan again hint", () => {
  show("empty");
  expectAll(screenText(world, "primary"), ["0 songs", "No music found", "then press", "to scan again.", "Scan again"]);
  expect(screenText(world, "primary")).not.toContain("Ⓧ");
  expect(screenText(world, "auxiliary")).toContain("Nothing playing");
});

/** A text run's <Text> element (path[-2]) lies inside the box that holds it (path[-3]). */
function expectInside(path: ReturnType<typeof pathTo>): void {
  const [x, , w] = path[path.length - 2]!.rect!;
  const [bx, , bw] = path[path.length - 3]!.rect!;
  expect(x).toBeGreaterThanOrEqual(bx);
  expect(x + w).toBeLessThanOrEqual(bx + bw);
}

test("stress: over-long LCD lines, query and breadcrumb clip in place; curly quotes and punctuation-led albums", () => {
  show("stress");
  expectInside(pathTo(world, "primary", "Rescanning sdmc:/music/ after a card swap · 2,048 files"));
  for (const right of ["1 found", "Oasis · 12 songs"]) {
    const [x, , w] = pathTo(world, "primary", right).at(-2)!.rect!;
    expect(x + w).toBeLessThanOrEqual(400);
  }
  expect(screenText(world, "primary")).toContain("Don’t Look Back in Anger");
  expectInside(pathTo(world, "auxiliary", "Champagne Supernova – Extended Remastered Version"));
  expectInside(pathTo(world, "auxiliary", "Oasis featuring Paul Weller on lead guitar and backing vocals"));
  expect(pathTo(world, "auxiliary", "Wh").length).toBeGreaterThan(0);
});

test("search: query strip with results; the classic keyboard on the bottom screen", () => {
  show("search");
  expectAll(screenText(world, "primary"), ["Search:", "daft", "4 found", "Edit search", "Clear"]);
  expect(backgroundOf(pathTo(world, "primary", "Digital Love"))).toBe(SELECTED_ROW);
  expect(screenText(world, "auxiliary")).toContain("START confirm");
  // The query, with its caret, shows in a field above the keyboard.
  const field = pathTo(world, "auxiliary", "daft|");
  const [, fy, , fh] = rect(field.at(-3));
  const [, hy] = rect(pathTo(world, "auxiliary", "B close · START confirm").at(-2));
  expect(fy).toBeGreaterThanOrEqual(0);
  expect(fy + fh).toBeLessThanOrEqual(hy);
  // …and the keyboard keeps its docked place, filling the screen below the field:
  // at (4, 60) the pixel is the keyboard panel's bluish grey, not the neutral metal behind it.
  const aux = world.pixels("auxiliary");
  const px = (60 * aux.width + 4) * 4;
  expect(aux.rgba[px + 2]! - aux.rgba[px]!).toBeGreaterThanOrEqual(6);
  // The keys are tall enough that the panel reaches the foot of the screen (no bare metal strip).
  const foot = (236 * aux.width + 4) * 4;
  expect(aux.rgba[foot + 2]! - aux.rgba[foot]!).toBeGreaterThanOrEqual(6);
  expect(pathTo(world, "auxiliary", "q").length).toBeGreaterThan(0);
});

