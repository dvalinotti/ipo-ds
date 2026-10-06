import { expect, test } from "bun:test";
import { placeholderArt } from "../app/theme/placeholder.ts";

test("an album always gets the same hue, however it is cased or padded", () => {
  expect(placeholderArt("Discovery", 6)).toEqual({ hue: 5, initials: "Di" });
  expect(placeholderArt("DISCOVERY", 6).hue).toBe(5);
  expect(placeholderArt("  Discovery", 6)).toEqual({ hue: 5, initials: "Di" });
});

test("six albums spread over at least four of the six hues", () => {
  const albums = ["Discovery", "Takk...", "Demon Days", "Is This It", "OK Computer", "Unknown Album"];
  expect(new Set(albums.map((album) => placeholderArt(album, 6).hue)).size).toBeGreaterThanOrEqual(4);
});

test("initials: first letter upper, second lower; one letter stays one; no letters shows ♪", () => {
  expect(placeholderArt("OK Computer", 6).initials).toBe("Ok");
  expect(placeholderArt("é", 6).initials).toBe("É");
  expect(placeholderArt("x", 6).initials).toBe("X");
  expect(placeholderArt("", 6).initials).toBe("♪");
  expect(placeholderArt("   ", 6).initials).toBe("♪");
});

test("the hue is an index into however many hues the theme has", () => {
  for (const count of [1, 2, 6, 7]) {
    const { hue } = placeholderArt("Takk...", count);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(count);
  }
});

test("initials come from letters and digits only; punctuation-only names show ♪", () => {
  expect(placeholderArt("(What’s the Story) Morning Glory?", 6).initials).toBe("Wh");
  expect(placeholderArt("...And Justice for All", 6).initials).toBe("An");
  expect(placeholderArt("...", 6).initials).toBe("♪");
  expect(placeholderArt("!!!", 6).initials).toBe("♪");
  expect(placeholderArt("1999", 6).initials).toBe("19");
});

test("initials skip combining marks and never grow past two characters", () => {
  expect(placeholderArt("Éclat", 6).initials).toBe("Ec");
  expect(placeholderArt("ßeta", 6).initials).toBe("ße");
});
