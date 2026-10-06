import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("every character the app's source can show is baked by app/fonts.json", () => {
  const fonts = JSON.parse(readFileSync(join(ROOT, "app/fonts.json"), "utf8")) as { ranges: string[]; characters: string };
  const ranges = fonts.ranges.map((range) => range.replace(/U\+/g, "").split("-").map((hex) => parseInt(hex, 16)) as [number, number]);
  const declared = new Set([...fonts.characters].map((ch) => ch.codePointAt(0)!));
  const baked = (cp: number) => declared.has(cp) || ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
  const missing = new Set<string>();
  for (const file of sources(join(ROOT, "app"))) {
    // Comments are not shown; strip them (keeping "://" in URLs) before scanning.
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const ch of code) if (ch.codePointAt(0)! > 0x7e && !baked(ch.codePointAt(0)!)) missing.add(ch);
  }
  expect([...missing]).toEqual([]);
});
