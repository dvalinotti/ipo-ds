import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "../runtime/framework/compiler/pak.ts";
import { LABEL_PX, labelPixels, VINYL_PX, vinylPixels } from "../scripts/vinyl-png.ts";

const ROOT = join(import.meta.dir, "..");
const vinyl = vinylPixels();
const label = labelPixels();
const at = (rgba: Uint8Array, size: number, x: number, y: number) => {
  const i = (Math.floor(y) * size + Math.floor(x)) * 4;
  return { r: rgba[i]!, g: rgba[i + 1]!, b: rgba[i + 2]!, a: rgba[i + 3]! };
};
/** The vinyl pixel at `radius` (texture px) and `deg` clockwise from 12 o'clock. */
const polar = (radius: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return at(vinyl, VINYL_PX, 128 + radius * Math.sin(rad), 128 - radius * Math.cos(rad));
};

test("the vinyl is an opaque disc with a transparent centre hole and transparent corners", () => {
  expect(vinyl.length).toBe(VINYL_PX * VINYL_PX * 4);
  expect(at(vinyl, VINYL_PX, 128, 128).a).toBe(0);
  expect(polar(40, 0).a).toBe(0);    // inside the 84 px (at 200) hole
  expect(polar(90, 0).a).toBe(255);
  expect(polar(120, 200).a).toBe(255);
  expect(at(vinyl, VINYL_PX, 2, 2).a).toBe(0);
  expect(at(vinyl, VINYL_PX, 253, 253).a).toBe(0);
});

test("the vinyl shows its rotation: a sheen on one side, grooves along every radius", () => {
  expect(polar(100, 45).r - polar(100, 225).r).toBeGreaterThanOrEqual(20);
  const shades = new Set<number>();
  for (let r = 64; r < 120; r++) shades.add(polar(r, 135).r);
  expect(Math.max(...shades) - Math.min(...shades)).toBeGreaterThanOrEqual(8);
});

test("the label is opaque Aqua blue with an off-centre cream mark", () => {
  expect(label.length).toBe(LABEL_PX * LABEL_PX * 4);
  const mark = at(label, LABEL_PX, 40, 40);
  expect(mark.r).toBeGreaterThan(0xe0);
  const blue = at(label, LABEL_PX, 100, 30);
  expect(blue.b).toBeGreaterThan(blue.r);
  expect(blue.a).toBe(255);
  // The mark is not mirrored: the opposite corner is blue.
  expect(at(label, LABEL_PX, 88, 88).b).toBeGreaterThan(at(label, LABEL_PX, 88, 88).r);
});

test("the committed PNGs are the generator's output", () => {
  const committed = decodePng(new Uint8Array(readFileSync(join(ROOT, "app/theme/vinyl.png"))));
  expect([committed.width, committed.height]).toEqual([VINYL_PX, VINYL_PX]);
  expect(Buffer.from(committed.rgba).equals(Buffer.from(vinyl))).toBe(true);
  const committedLabel = decodePng(new Uint8Array(readFileSync(join(ROOT, "app/theme/label.png"))));
  expect([committedLabel.width, committedLabel.height]).toEqual([LABEL_PX, LABEL_PX]);
  expect(Buffer.from(committedLabel.rgba).equals(Buffer.from(label))).toBe(true);
});

test("both are sampled linear, for rotation", () => {
  const images = JSON.parse(readFileSync(join(ROOT, "app/images.json"), "utf8"));
  expect(images).toEqual({ "theme/vinyl.png": { linear: true }, "theme/label.png": { linear: true } });
});
