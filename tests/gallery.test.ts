import { afterAll, beforeAll, expect, test } from "bun:test";
import { BTN } from "@pocketjs/framework/input";
import type { BundleWorld, SimNode } from "../runtime/hosts/sim/sim.ts";
import { GALLERY_STATES, type GalleryStateName } from "../app/gallery/names.ts";
import { backgroundOf, bootGallery, disposeGuest, pathTo, pathsTo, screenText, textColorOf } from "./support/app-world.ts";

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
  if (target < 0) throw new Error(`no gallery state ${JSON.stringify(name)}`);
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

// A blue label's shadow copy: #1d3f80 at 0x99 alpha, as the core holds it (0xAABBGGRR).
const LABEL_SHADOW = 0x99803f1d;

/** A gel body's gloss (its first child) relative to the body: [x, y, w, h]. */
function glossOffset(body: SimNode): Rect {
  const [bx, by] = rect(body);
  const [x, y, w, h] = rect(body.children[0]);
  return [x - bx, y - by, w, h];
}

/** Every node under `node` that `match` accepts, in tree order. */
function findAll(node: SimNode | null, match: (node: SimNode) => boolean, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  if (match(node)) out.push(node);
  for (const child of node.children) findAll(child, match, out);
  return out;
}

/** Paths to a tab label's copies (the toolbar is the top 34 px). */
function tabLabel(text: string): SimNode[][] {
  return pathsTo(world, "primary", text).filter((path) => rect(path.at(-2))[1] < 30);
}

test("design: art is centred in its frame; LCD lines clear the pill; tabs form one segmented control; header text aligns with its column", () => {
  // Main state (still showing).
  const art = pathTo(world, "auxiliary", "DISCOVERY");
  const [fx, fy, fw, fh] = rect(art.at(-4));
  const [cx, cy, cw, ch] = rect(art.at(-3));
  expect(cx - fx).toBe(fx + fw - (cx + cw));
  expect(cy - fy).toBe(fy + fh - (cy + ch));

  const line = pathTo(world, "primary", "142 songs · 9.6 hrs");
  const [, ly, , lh] = rect(line.at(-2));
  // The line is a marquee: run → Text → clip box → LCD pill.
  const [, by, , bh] = rect(line.at(-4));
  const [, ty] = rect(pathTo(world, "primary", "Ds Man").at(-2));
  expect(ty).toBeGreaterThanOrEqual(by + 2);
  expect(ly + lh).toBeLessThanOrEqual(by + bh - 2);

  // The group's rounded border is drawn over the segments: a pixel inside its
  // top-right corner arc is border grey, not the segment's light gradient.
  // The active tab's label is a GelLabel: run → Text → wrapper → segment → group.
  const songs = pathTo(world, "primary", "Songs");
  const [gx, gy, gw] = rect(songs.at(-5));
  const { width, rgba } = world.pixels("primary");
  const at = ((gy + 1) * width + (gx + gw - 2)) * 4;
  expect((rgba[at]! + rgba[at + 1]! + rgba[at + 2]!) / 3).toBeLessThan(200);

  // Segments touch, separated by a 1 px divider, inside one group.
  const [sx, , sw] = rect(songs.at(-4));
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

test("gels: each body's first child is its gloss; a blue label carries one shadow copy, a grey label none", () => {
  show("main");
  // Primary badge: two copies of "A" in one GelLabel wrapper, the shadow first, 1 px lower, translucent navy.
  const a = pathsTo(world, "primary", "A");
  expect(a).toHaveLength(2);
  expect(a[0]!.at(-3)).toBe(a[1]!.at(-3));
  expect(textColorOf(a[0]!)).toBe(LABEL_SHADOW);
  expect(rect(a[0]!.at(-2))[1]).toBe(rect(a[1]!.at(-2))[1] + 1);
  expect(glossOffset(a[0]!.at(-4)!)).toEqual([2, 3, 10, 6]);
  // Grey badge: one copy, straight in the body.
  const x = pathsTo(world, "primary", "X");
  expect(x).toHaveLength(1);
  expect(glossOffset(x[0]!.at(-3)!)).toEqual([2, 3, 10, 6]);
  // Tabs: the active one has a shadow copy and a square gloss over its top half; the others have one copy.
  const songs = tabLabel("Songs");
  expect(songs).toHaveLength(2);
  const segment = songs[0]!.at(-4)!;
  expect(glossOffset(segment)).toEqual([0, 0, rect(segment)[2], 9]);
  expect(tabLabel("Artists")).toHaveLength(1);
  // Transport (Now Playing): shuffle, prev, pause, next, repeat.
  const [row] = findAll(world.tree("auxiliary"), (node) => JSON.stringify(node.rect) === JSON.stringify([10, 160, 300, 72]));
  expect(row!.children.map(glossOffset)).toEqual([[5, 3, 24, 16], [6, 3, 30, 20], [10, 3, 44, 30], [6, 3, 30, 20], [5, 3, 24, 16]]);
  // Seek knob: the track's second child.
  const capsule = pathTo(world, "auxiliary", "1:42").at(-3)!;
  expect(glossOffset(capsule.children[1]!.children[1]!)).toEqual([2, 3, 14, 8]);
});

test("artists: names with right-hand counts, Queen selected; idle Now Playing", () => {
  show("artists");
  expectAll(screenText(world, "primary"), ["Beyoncé", "Queen", "Unknown Artist", "Open"]);
  expect(backgroundOf(pathTo(world, "primary", "Queen"))).toBe(SELECTED_ROW);
  expect(textColorOf(pathTo(world, "primary", "14"))).toBe(WHITE);
  // Header labels line up with their columns: names start where "Artist" starts; counts end where "Songs" ends.
  const [hx] = rect(pathTo(world, "primary", "Artist").at(-2));
  const [nx] = rect(pathTo(world, "primary", "Beyoncé").at(-2));
  expect(nx).toBe(hx);
  // "Songs" is also a tab; the column header is the copy below the toolbar.
  const header = pathsTo(world, "primary", "Songs").find((path) => rect(path.at(-2))[1] > 30)!;
  const [sx, , sw] = rect(header.at(-2));
  const [cx, , cw] = rect(pathTo(world, "primary", "3").at(-2));
  expect(cx + cw).toBe(sx + sw);
  expectAll(screenText(world, "auxiliary"), ["Nothing playing", "Pick a song above and press", "--:--"]);
  // The A in "press A" is a drawn key badge, not the circled glyph that clipped.
  expect(screenText(world, "auxiliary")).not.toContain("Ⓐ");
  expect(pathTo(world, "auxiliary", "A").length).toBeGreaterThan(0);
});

test("gels: the label shadow follows the active tab", () => {
  show("artists");
  expect(tabLabel("Artists")).toHaveLength(2);
  expect(tabLabel("Songs")).toHaveLength(1);
  expect(tabLabel("Albums")).toHaveLength(1);
});

test("album drill-down: breadcrumb and numbered rows; Now Playing with placeholder art", () => {
  show("album");
  const ph = pathTo(world, "auxiliary", "Di");
  const [pfx, pfy, pfw] = rect(ph.at(-5));
  const [pcx, pcy, pcw] = rect(ph.at(-4));
  expect(pcx - pfx).toBe(pfx + pfw - (pcx + pcw));
  expect(pcy - pfy).toBe(pcx - pfx);
  expectAll(screenText(world, "primary"), ["Albums", "›", "Discovery", "Daft Punk · 14 songs", "5:20"]);
  // "#" is its own column, centred over the track numbers; "Song Name" starts where the titles start.
  const centre = (r: Rect) => r[0] + r[2] / 2;
  // Both are centred in the same 22 px column; glyphs of different widths can land half a pixel apart.
  expect(Math.abs(centre(rect(pathTo(world, "primary", "#").at(-2))) - centre(rect(pathTo(world, "primary", "1").at(-2))))).toBeLessThanOrEqual(1);
  expect(rect(pathTo(world, "primary", "Song Name").at(-2))[0]).toBe(rect(pathTo(world, "primary", "One More Time").at(-2))[0]);
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

/** A marquee's clip box (run → Text → clip box → panel) lies inside its panel, so a long line never paints outside it. */
function expectInside(path: ReturnType<typeof pathTo>): void {
  const [x, , w] = path[path.length - 3]!.rect!;
  const [bx, , bw] = path[path.length - 4]!.rect!;
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

test("loading: while a cover decodes, the art frame shows the spinner centred on grey, not the placeholder", () => {
  show("loading");
  const all: SimNode[] = [];
  const walk = (node: SimNode | null) => { if (node) { all.push(node); node.children.forEach(walk); } };
  walk(world.tree("auxiliary"));
  const spinner = all.find((node) => node.type === "image" && node.rect?.[2] === 32 && node.rect?.[3] === 32 && node.rect[0] < 110);
  expect(spinner?.rect).toEqual([44, 44, 32, 32]);
  expect(pathsTo(world, "auxiliary", "Di")).toHaveLength(0); // no placeholder initials
  expect(screenText(world, "auxiliary")).toContain("Digital Love");
});

test("gels: the reference pill, every transport state, and a fill too narrow for its gloss draws nothing outside it", () => {
  show("gels");
  // The reference pill: 115×44 with its label and shadow copy; gloss per spec §3.1.
  const pill = pathsTo(world, "primary", "default");
  expect(pill).toHaveLength(2);
  const body = pill[0]!.at(-4)!;
  expect(rect(body).slice(2)).toEqual([115, 44]);
  expect(glossOffset(body)).toEqual([9, 2, 97, 18]);
  // Three progress tracks (2 %, 10 %, 60 %): the 4 px fill's gloss has no room and paints nothing outside the fill.
  const tracks = findAll(world.tree("primary"), (node) => node.rect !== null && node.rect[2] === 220 && node.rect[3] === 12);
  expect(tracks).toHaveLength(3);
  const fill = tracks[0]!.children[0]!;
  expect(rect(fill)[2]).toBe(4);
  const gloss = fill.children[0]!.rect;
  if (gloss && gloss[2] > 0 && gloss[3] > 0) {
    expect(gloss[0]).toBeGreaterThanOrEqual(rect(fill)[0]);
    expect(gloss[0] + gloss[2]).toBeLessThanOrEqual(rect(fill)[0] + rect(fill)[2]);
  }
  // Transport: an enabled blue/grey row, an enabled grey row, a disabled row (no gloss: it would show through at 45 %).
  const rows = findAll(world.tree("auxiliary"), (node) => node.children.length === 5 && node.children.every((child) => child.rect !== null && child.rect[2] === child.rect[3] && child.rect[2] >= 34));
  expect(rows).toHaveLength(3);
  expect(rows[0]!.children.map(glossOffset)).toEqual([[5, 3, 24, 16], [6, 3, 30, 20], [10, 3, 44, 30], [6, 3, 30, 20], [5, 3, 24, 16]]);
  expect(rows[2]!.children.every((button) => button.children[0]!.hidden)).toBe(true);
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
  // Let the keyboard's slide-in finish: its resting place is what the user sees.
  for (let frame = 0; frame < 60; frame++) world.step();
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

