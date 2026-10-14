// tests/scroll.test.ts
import { expect, test } from "bun:test";
import { FLING_MAX_PX_PER_S } from "../app/controls.ts";
import {
  bodyTopPx,
  centredOffset,
  clampVelocity,
  NARROW_W,
  offsetForThumb,
  pageOffset,
  rowAt,
  snapToRow,
  splitOffset,
  thumbFor,
  TRACK_HIT_PX,
} from "../app/explorer/scroll.ts";

test("an offset splits into whole rows and a sub-row shift", () => {
  expect(splitOffset(0, 21)).toEqual({ top: 0, shift: 0 });
  expect(splitOffset(20, 21)).toEqual({ top: 0, shift: 20 });
  expect(splitOffset(21, 21)).toEqual({ top: 1, shift: 0 });
  expect(splitOffset(100.5, 21)).toEqual({ top: 4, shift: 16.5 });
});

test("the rest position snaps to the nearest row inside the range", () => {
  expect(snapToRow(10, 21, 252)).toBe(0);
  expect(snapToRow(11, 21, 252)).toBe(21);
  expect(snapToRow(250, 21, 252)).toBe(252);
  expect(snapToRow(-5, 21, 252)).toBe(0);
  expect(snapToRow(300, 21, 252)).toBe(252);
  expect(snapToRow(40, 21, 0)).toBe(0);
});

test("a release velocity is clamped to the fling cap, either way; the cap is about four rows a frame", () => {
  expect(FLING_MAX_PX_PER_S).toBe(5000);
  expect(FLING_MAX_PX_PER_S / 60 / 21).toBeLessThan(4.1);
  expect(clampVelocity(300, 5000)).toBe(300);
  expect(clampVelocity(9000, 5000)).toBe(5000);
  expect(clampVelocity(-9000, 5000)).toBe(-5000);
});

test("the row under a point comes from the body's top and the offset; outside the rows is -1", () => {
  expect(rowAt(51, 51, 0, 21, 20)).toBe(0);
  expect(rowAt(71, 51, 0, 21, 20)).toBe(0);
  expect(rowAt(72, 51, 0, 21, 20)).toBe(1);
  expect(rowAt(60, 51, 42, 21, 20)).toBe(2);
  expect(rowAt(60, 51, 10, 21, 20)).toBe(0);
  expect(rowAt(50, 51, 0, 21, 20)).toBe(-1);
  expect(rowAt(200, 51, 0, 21, 3)).toBe(-1);
});

test("the thumb's size and place follow the content; a short list has no thumb", () => {
  expect(thumbFor(0, 100, 168)).toBeNull();
  expect(thumbFor(0, 420, 168)).toEqual({ top: 0, height: 67 });
  expect(thumbFor(252, 420, 168)).toEqual({ top: 101, height: 67 });
  expect(thumbFor(126, 420, 168)).toEqual({ top: 51, height: 67 });
  expect(thumbFor(0, 10_000, 168)!.height).toBe(16);
});

test("a thumb position maps back to an offset, clamped to the range", () => {
  expect(offsetForThumb(0, 420, 168, 67)).toBe(0);
  expect(offsetForThumb(101, 420, 168, 67)).toBe(252);
  expect(offsetForThumb(50.5, 420, 168, 67)).toBeCloseTo(126, 0);
  expect(offsetForThumb(-20, 420, 168, 67)).toBe(0);
  expect(offsetForThumb(500, 420, 168, 67)).toBe(252);
});

test("paging moves a page and stops at the ends; a reveal centres the row", () => {
  expect(pageOffset(0, 1, 168, 252)).toBe(168);
  expect(pageOffset(168, 1, 168, 252)).toBe(252);
  expect(pageOffset(100, -1, 168, 252)).toBe(0);
  expect(centredOffset(10, 8, 21, 252)).toBe(126);
  expect(centredOffset(1, 8, 21, 252)).toBe(0);
  expect(centredOffset(19, 8, 21, 252)).toBe(252);
});

test("the list body starts under the toolbar and header, plus a strip each for the search and crumb; the track's hit region is the right 20 px", () => {
  expect(bodyTopPx(0)).toBe(51);
  expect(bodyTopPx(1)).toBe(72);
  expect(bodyTopPx(2)).toBe(93);
  expect([NARROW_W, TRACK_HIT_PX]).toEqual([320, 20]);
});
