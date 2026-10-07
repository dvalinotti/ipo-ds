import { expect, test } from "bun:test";
import { fontSlotFor } from "../runtime/framework/compiler/tailwind.ts";
import { FONT_12, FONT_12_BOLD, FONT_16_BOLD } from "../app/theme/fonts.ts";
import { measureCache } from "../app/theme/measure.ts";

test("the marquee's font slots are the ones the build assigns to its text classes", () => {
  expect(FONT_12).toBe(fontSlotFor(12, false));
  expect(FONT_12_BOLD).toBe(fontSlotFor(12, true));
  expect(FONT_16_BOLD).toBe(fontSlotFor(16, true));
});

test("text widths are measured once per slot and text, and the cache stays bounded", () => {
  const asked: string[] = [];
  const measure = measureCache((text, slot) => {
    asked.push(`${slot}:${text}`);
    return text.length * 10 + slot;
  }, 3);
  expect(measure("ab", 1)).toBe(21);
  expect(measure("ab", 1)).toBe(21);
  expect(measure("ab", 2)).toBe(22); // another slot is another width
  expect(asked).toEqual(["1:ab", "2:ab"]);
  measure("c", 1);
  measure("d", 1); // a fourth entry drops the oldest ("1:ab")
  measure("ab", 2);
  expect(asked).toHaveLength(4);
  measure("ab", 1);
  expect(asked.at(-1)).toBe("1:ab");
});
