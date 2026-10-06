import { expect, test } from "bun:test";
import { composeMarks } from "../app/library/compose.ts";
import { COMPOSE } from "../app/library/compose-table.ts";

test("every decomposed Latin-1 / Latin Extended-A letter composes", () => {
  for (const [decomposed, letter] of Object.entries(COMPOSE)) expect(composeMarks(decomposed)).toBe(letter);
  expect(Object.keys(COMPOSE).length).toBeGreaterThan(150);
});

test("decomposed tags compose in place; other text passes through unchanged", () => {
  expect(composeMarks("Sigur Ro\u0301s — Hoppi\u0301polla")).toBe("Sigur Rós — Hoppípolla");
  expect(composeMarks("Beyoncé")).toBe("Beyoncé");
  expect(composeMarks("Plain ASCII")).toBe("Plain ASCII");
});

test("a mark with no composed form, or with nothing before it, stays as it is", () => {
  expect(composeMarks("x\u0301")).toBe("x\u0301");
  expect(composeMarks("\u0301a")).toBe("\u0301a");
});
