import { expect, test } from "bun:test";
import { frameNote } from "../app/now-playing/frame-time.ts";

test("the frame time reads the host's whole-frame mean and max, in whole ms", () => {
  expect(frameNote(JSON.stringify({ timingUs: { frame: [16_667, 33_490], work: [4_000, 9_000] } }))).toBe("F:17/33");
  expect(frameNote(JSON.stringify({ timingUs: { frame: [33_333, 33_333] } }))).toBe("F:33/33");
});

test("without timing, before the first window, or on a garbled reply, it shows F:-", () => {
  expect(frameNote(undefined)).toBe("F:-");
  expect(frameNote("")).toBe("F:-");
  expect(frameNote("{")).toBe("F:-");
  expect(frameNote("null")).toBe("F:-");
  expect(frameNote(JSON.stringify({ target: "3ds" }))).toBe("F:-");
  expect(frameNote(JSON.stringify({ timingUs: { frame: [0, 0] } }))).toBe("F:-");
  expect(frameNote(JSON.stringify({ timingUs: { frame: ["16", 33] } }))).toBe("F:-");
  expect(frameNote(JSON.stringify({ timingUs: { frame: [16_000] } }))).toBe("F:-");
});
