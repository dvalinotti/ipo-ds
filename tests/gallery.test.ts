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

test("artists: names with right-hand counts, Queen selected; idle Now Playing", () => {
  show("artists");
  expectAll(screenText(world, "primary"), ["Beyoncé", "Queen", "Unknown Artist", "Open"]);
  expect(backgroundOf(pathTo(world, "primary", "Queen"))).toBe(SELECTED_ROW);
  expect(textColorOf(pathTo(world, "primary", "14"))).toBe(WHITE);
  expectAll(screenText(world, "auxiliary"), ["Nothing playing", "Pick a song above and press Ⓐ", "--:--"]);
});

test("album drill-down: breadcrumb and numbered rows; Now Playing with placeholder art", () => {
  show("album");
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
  expectAll(screenText(world, "primary"), ["Scanning…", "Scanning your music…", "sdmc:/music/ · 87 of 142 files", "Now Playing"]);
  expect(screenText(world, "auxiliary")).toContain("Nothing playing");
});

test("empty library: guidance and a single Scan again hint", () => {
  show("empty");
  expectAll(screenText(world, "primary"), ["0 songs", "No music found", "then press Ⓧ to scan again.", "Scan again"]);
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
  expect(pathTo(world, "auxiliary", "q").length).toBeGreaterThan(0);
});

