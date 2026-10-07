import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPINNER, spinnerAtlasSvg } from "../scripts/spinner-atlas.ts";

const ROOT = join(import.meta.dir, "..");

test("the committed spinner atlas is the generator's output (run bun scripts/spinner-atlas.ts to refresh)", () => {
  expect(readFileSync(join(ROOT, "app/theme/icons/spinner-atlas.svg"), "utf8")).toBe(spinnerAtlasSvg());
});

test("sprites.json declares the atlas as a 4x4 grid of 16 frames, about one turn a second", () => {
  const sprites = JSON.parse(readFileSync(join(ROOT, "app/sprites.json"), "utf8"));
  // The core needs power-of-two atlas sides that divide into the frame grid, so 16 frames, not 12.
  expect(sprites["theme/icons/spinner-atlas.svg"]).toEqual({ cols: 4, rows: 4, frames: 16, step: 4 });
  expect(SPINNER.frames * SPINNER.step).toBe(64);
});

test("each frame draws 12 spokes; the lead spoke is at full strength on every fourth frame", () => {
  const svg = spinnerAtlasSvg();
  expect(svg).toMatch(/^<svg [^>]*width="128" height="128"/m);
  expect(svg.match(/<path /g)).toHaveLength(16 * 12);
  expect(svg.match(/opacity="1"/g)).toHaveLength(4);
});
