import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bakeSvg } from "../runtime/framework/compiler/bake-svg.ts";
import { unknownUtilities } from "../runtime/framework/compiler/tailwind.ts";
import { AQUA } from "../app/theme/aqua.ts";
import type { GelClasses, IconInk, IconName, RowKind, TransportKind } from "../app/theme/theme.ts";

const ROOT = new URL("..", import.meta.url).pathname;

/** Every class literal the theme can return, each variant included. */
function aquaLiterals(): string[] {
  const out: string[] = [];
  const gel = (classes: GelClasses) => out.push(classes.body, classes.gloss);
  for (const [key, value] of Object.entries(AQUA)) {
    if (typeof value === "string" && key !== "name" && key !== "osk" && !value.endsWith(".svg")) out.push(value);
  }
  for (const flag of [true, false]) {
    gel(AQUA.tab(flag));
    gel(AQUA.badge(flag));
    out.push(AQUA.tabText(flag), AQUA.headerLeft(flag), AQUA.badgeText(flag));
  }
  gel(AQUA.scrollThumb);
  gel(AQUA.progressFill);
  gel(AQUA.seekKnob);
  for (const kind of ["odd", "even", "selected"] as RowKind[]) {
    out.push(AQUA.row(kind), AQUA.rowTitle(kind), AQUA.rowDetail(kind), AQUA.rowMuted(kind), AQUA.rowMarker(kind));
  }
  for (const color of ["red", "amber", "green"] as const) out.push(AQUA.light(color));
  out.push(AQUA.ring("outer"), AQUA.ring("inner"));
  for (const kind of ["shuffle", "prev", "play", "pause", "next", "repeat"] as TransportKind[]) {
    for (const on of [true, false]) for (const enabled of [true, false]) gel(AQUA.transport(kind, on, enabled));
  }
  for (const hue of AQUA.placeholderHues) out.push(hue.cover, hue.hubText);
  return out;
}

test("every class literal the Aqua theme can produce compiles", () => {
  const unknown = aquaLiterals()
    .map((literal) => [literal, unknownUtilities(literal)] as const)
    .filter(([, bad]) => bad.length > 0);
  expect(unknown).toEqual([]);
});

test("every icon the theme names exists and bakes to an opaque image of its size", () => {
  const keys = new Set<string>([AQUA.sortIcon]);
  for (const name of ["shuffle", "repeat", "prev", "next", "play", "pause"] as IconName[]) {
    for (const ink of ["white", "ink", "blue"] as IconInk[]) keys.add(AQUA.icon(name, ink));
  }
  for (const name of ["play", "pause"] as const) for (const ink of ["white", "ink"] as const) keys.add(AQUA.iconLarge(name, ink));
  for (const key of keys) {
    const path = join(ROOT, "app", key);
    expect(existsSync(path), key).toBe(true);
    const image = bakeSvg(readFileSync(path, "utf8"), 1);
    const size = key.includes("-lg-") ? 32 : key.includes("sort-") ? 8 : 16;
    expect([image.width, image.height], key).toEqual([size, size]);
    let opaque = 0;
    for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i]! > 128) opaque++;
    expect(opaque, key).toBeGreaterThan(8);
  }
});

test("the theme carries the six placeholder hues and the classic keyboard", () => {
  expect(AQUA.placeholderHues.map((hue) => hue.name)).toEqual(["blue", "teal", "plum", "amber", "green", "graphite"]);
  expect(AQUA.osk).toBe("classic");
});
