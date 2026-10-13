// `bun scripts/release-check.ts <tag>` — refuse a release whose tag disagrees
// with the version in package.json or pocket.json. The release workflow runs it
// before building, so a tag can publish only the version the commit declares.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Files whose `.version` must equal the tag's version. */
export const RELEASE_VERSION_FILES = ["package.json", "pocket.json"] as const;

// MAJOR.MINOR.PATCH with an optional SemVer 2.0.0 prerelease. A numeric
// identifier has no leading zero (`-0` but not `-01`); one holding a letter or
// hyphen may start with digits (`-0a`). Build metadata (`+…`) is refused: it
// does not change a version's precedence, so v1.2.3+a and v1.2.3+b would be
// two releases of one version, and release.yml reads any `-` as a prerelease.
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;

/** The version a tag names (`v0.2.0`, `0.2.0`, `v0.2.0-beta.1`); throws for anything else. */
export function tagVersion(tag: string): string {
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  if (version.includes("+")) throw new Error(`release-check: ${JSON.stringify(tag)} carries build metadata; release tags are v<major>.<minor>.<patch>[-<prerelease>]`);
  if (!RELEASE_VERSION.test(version)) throw new Error(`release-check: ${JSON.stringify(tag)} is not a version tag such as v0.2.0`);
  return version;
}

/** One line per file whose version is not `version`; empty when they all agree. */
export function versionMismatches(version: string, files: Readonly<Record<string, unknown>>): string[] {
  const mismatches: string[] = [];
  for (const [path, document] of Object.entries(files)) {
    const found = typeof document === "object" && document !== null && "version" in document ? document.version : undefined;
    if (found !== version) mismatches.push(`  ${path}: ${typeof found === "string" ? found : "no .version string"}`);
  }
  return mismatches;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const [tag] = process.argv.slice(2);
  try {
    if (tag === undefined) throw new Error("usage: bun scripts/release-check.ts <tag>");
    const version = tagVersion(tag);
    const files: Record<string, unknown> = {};
    for (const path of RELEASE_VERSION_FILES) files[path] = JSON.parse(readFileSync(resolve(root, path), "utf8"));
    const mismatches = versionMismatches(version, files);
    if (mismatches.length > 0) throw new Error([`release-check: ${tag} does not match:`, ...mismatches].join("\n"));
    console.log(`release-check: ${version} matches ${RELEASE_VERSION_FILES.join(", ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
