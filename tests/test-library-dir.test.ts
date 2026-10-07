import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIBRARY_MARKER, prepareLibraryDir } from "../scripts/test-library-dir.ts";

const scratch = mkdtempSync(join(tmpdir(), "ipo-ds-library-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("a folder holding other files (real music) is refused and left untouched", () => {
  const music = join(scratch, "music");
  mkdirSync(music);
  writeFileSync(join(music, "Everlong.mp3"), "real");
  expect(() => prepareLibraryDir(music)).toThrow("holds files this script did not write");
  expect(readdirSync(music)).toEqual(["Everlong.mp3"]);
});

test("a new or empty folder is marked; a marked folder is cleared and marked again", () => {
  const fresh = join(scratch, "fresh");
  prepareLibraryDir(fresh);
  expect(readdirSync(fresh)).toEqual([LIBRARY_MARKER]);
  const empty = join(scratch, "empty");
  mkdirSync(empty);
  prepareLibraryDir(empty);
  expect(existsSync(join(empty, LIBRARY_MARKER))).toBe(true);
  writeFileSync(join(fresh, "001 old.mp3"), "generated");
  prepareLibraryDir(fresh);
  expect(readdirSync(fresh)).toEqual([LIBRARY_MARKER]);
});
