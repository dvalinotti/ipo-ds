import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASE_VERSION_FILES, tagVersion, versionMismatches } from "../scripts/release-check.ts";

const ROOT = resolve(import.meta.dir, "..");

test("a tag names its version with or without the leading v", () => {
  expect(tagVersion("v0.2.0")).toBe("0.2.0");
  expect(tagVersion("0.2.0")).toBe("0.2.0");
  expect(tagVersion("v1.0.0-beta.1")).toBe("1.0.0-beta.1");
});

test("a tag that is not a SemVer is refused", () => {
  expect(() => tagVersion("v0.2")).toThrow("is not a version tag");
  expect(() => tagVersion("release-1")).toThrow("is not a version tag");
  expect(() => tagVersion("v01.2.0")).toThrow("is not a version tag");
});

test("every file that disagrees with the tag, or has no version, is reported", () => {
  expect(versionMismatches("0.2.0", { "package.json": { version: "0.2.0" }, "pocket.json": { version: "0.2.0" } })).toEqual([]);
  expect(versionMismatches("0.2.0", { "package.json": { version: "0.2.0" }, "pocket.json": { version: "0.1.0" } })).toEqual([
    "  pocket.json: 0.1.0",
  ]);
  expect(versionMismatches("0.2.0", { "package.json": {}, "pocket.json": null })).toEqual([
    "  package.json: no .version string",
    "  pocket.json: no .version string",
  ]);
});

test("package.json and pocket.json declare the same version", () => {
  const [first, ...rest] = RELEASE_VERSION_FILES.map((path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")).version);
  for (const version of rest) expect(version).toBe(first);
});
