import { expect, test } from "bun:test";
import { decodePng } from "../runtime/framework/compiler/pak.ts";
import { encodePng, scale } from "../scripts/png.ts";

test("encodePng writes RGBA that the PocketJS PNG decoder reads back unchanged", () => {
  const rgba = Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255);
  const png = encodePng(2, 2, rgba);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = decodePng(png);
  expect([image.width, image.height]).toEqual([2, 2]);
  expect([...image.rgba]).toEqual([...rgba]);
});

test("scale repeats each pixel factor × factor times", () => {
  const out = scale(2, 1, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8), 2);
  expect([...out]).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8]);
});
