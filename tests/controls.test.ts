import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BINDINGS, controlsTable, SEEK_REPEAT_MS, SEEK_TAP_MS, seekTarget } from "../app/controls.ts";

const ROOT = new URL("..", import.meta.url).pathname;

test("the README's controls table is the bindings table, row for row", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const header = "| Button | Normal | Swapped |";
  const start = readme.indexOf(header);
  expect(start).toBeGreaterThan(0);
  const lines = readme.slice(start).split("\n");
  expect(lines[1]).toBe("|---|---|---|");
  const rows = lines.slice(2, lines.indexOf("", 2));
  expect(rows).toEqual(controlsTable());
  expect(BINDINGS.map((b) => b.button)).toEqual([
    "D-pad up / down", "Circle pad", "D-pad left / right", "A", "B", "X", "Y", "L / R", "Y + L / R", "ZL / ZR", "START", "SELECT", "L + R (hold)",
  ]);
});

test("a seek steps 5 s on the tap and 2 s on each repeat, clamped to the song", () => {
  expect([SEEK_TAP_MS, SEEK_REPEAT_MS]).toEqual([5000, 2000]);
  expect(seekTarget(60_000, 200_000, 1, false)).toBe(65_000);
  expect(seekTarget(60_000, 200_000, 1, true)).toBe(62_000);
  expect(seekTarget(60_000, 200_000, -1, false)).toBe(55_000);
  expect(seekTarget(2_000, 200_000, -1, false)).toBe(0);
  expect(seekTarget(198_500, 200_000, 1, false)).toBe(200_000);
  expect(seekTarget(10_000, 0, 1, false)).toBeNull();
  expect(seekTarget(10_000, Number.NaN, 1, false)).toBeNull();
});
