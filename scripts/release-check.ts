// `bun scripts/release-check.ts <tag>` — refuse a release whose tag disagrees
// with the version in package.json or pocket.json. The release workflow runs it
// before building, so a tag can publish only the version the commit declares.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Files whose `.version` must equal the tag's version. */
export const RELEASE_VERSION_FILES = ["package.json", "pocket.json"] as const;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** The SemVer a tag names (`v0.2.0` or `0.2.0`); throws for anything else. */
export function tagVersion(tag: string): string {
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  if (!SEMVER.test(version)) throw new Error(`release-check: ${JSON.stringify(tag)} is not a version tag such as v0.2.0`);
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
