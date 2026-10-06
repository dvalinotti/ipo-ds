// Baked font-atlas slots for the text classes the marquee measures. They are
// literals because compiler source must stay out of the app's import graph;
// tests/marquee.test.ts asserts they equal the build's fontSlotFor().
export const FONT_12 = 0; //      fontSlotFor(12, false): text-xs
export const FONT_12_BOLD = 7; // fontSlotFor(12, true):  text-xs font-bold
export const FONT_16_BOLD = 9; // fontSlotFor(16, true):  text-base font-bold
