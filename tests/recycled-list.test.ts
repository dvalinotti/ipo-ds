import { expect, test } from "bun:test";
import { nearestTop, slotIndex } from "../app/explorer/window.ts";

test("a pool's slots cover the window from top, each row once, and keep their parity", () => {
  for (const n of [2, 4, 10]) {
    for (let top = 0; top < 30; top++) {
      const shown = Array.from({ length: n }, (_, slot) => slotIndex(slot, top, n));
      expect([...shown].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => top + i));
      shown.forEach((index, slot) => expect(index % 2).toBe(slot % 2)); // n is even
    }
  }
});

test("scrolling one row rebinds exactly one slot", () => {
  const n = 10;
  for (let top = 0; top < 20; top++) {
    const changed = Array.from({ length: n }, (_, slot) => slotIndex(slot, top, n) !== slotIndex(slot, top + 1, n));
    expect(changed.filter(Boolean)).toHaveLength(1);
  }
});

test("the window moves only as far as the focus needs, and stays inside the rows", () => {
  expect(nearestTop(0, 3, 8, 100)).toBe(0); // inside: no move
  expect(nearestTop(0, 8, 8, 100)).toBe(1); // one below: one row
  expect(nearestTop(10, 4, 8, 100)).toBe(4); // above: focus becomes the top row
  expect(nearestTop(95, 99, 8, 100)).toBe(92); // never past the last full window
  expect(nearestTop(50, 2, 8, 5)).toBe(0); // fewer rows than the window
  expect(nearestTop(-3, 0, 8, 100)).toBe(0);
});
