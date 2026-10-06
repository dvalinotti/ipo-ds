import { expect, test } from "bun:test";
import { clampFraction, trackOffset } from "../app/theme/geometry.ts";

test("fractions outside 0..1, and NaN, stay on the track", () => {
  expect([clampFraction(-0.5), clampFraction(0.25), clampFraction(1.7), clampFraction(NaN), clampFraction(Infinity)]).toEqual([0, 0.25, 1, 0, 0]);
});

test("track offsets round to whole pixels within the inner width", () => {
  expect([trackOffset(0.3, 198), trackOffset(2, 198), trackOffset(-1, 198), trackOffset(NaN, 218)]).toEqual([59, 198, 0, 0]);
});
