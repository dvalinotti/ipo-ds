import { expect, test } from "bun:test";
import { fontSlotFor } from "../runtime/framework/compiler/tailwind.ts";
import { FONT_12, FONT_12_BOLD, FONT_16_BOLD } from "../app/theme/fonts.ts";

test("the marquee's font slots are the ones the build assigns to its text classes", () => {
  expect(FONT_12).toBe(fontSlotFor(12, false));
  expect(FONT_12_BOLD).toBe(fontSlotFor(12, true));
  expect(FONT_16_BOLD).toBe(fontSlotFor(16, true));
});
