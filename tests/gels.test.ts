// tests/gels.test.ts — Aqua gels (docs/superpowers/specs/2026-10-07-aqua-gels-design.md):
// every gloss lies inside its body, clear of the outline (§3.1); blue and grey
// gels use the reference colours (§3); only the transport buttons and the knob
// cast a shadow; a disabled button draws neither gloss nor shadow.
import { expect, test } from "bun:test";
import { AQUA } from "../app/theme/aqua.ts";
import type { GelClasses, TransportKind } from "../app/theme/theme.ts";
import { REFERENCE_PILL } from "../app/gallery/reference-pill.ts";

interface Case {
  name: string;
  gel: GelClasses;
  tone: "blue" | "grey";
  /** The body draws a 1 px outline (`border`). */
  outline: boolean;
  shadow: boolean;
  disabled?: boolean;
  /** Body sizes to check when the classes leave one open (width or height set by style or content). */
  sizes?: [number, number][];
}

const KINDS: TransportKind[] = ["shuffle", "prev", "play", "pause", "next", "repeat"];
/** PROGRESS_TRACK_PX (app/theme/parts/panels.tsx): the fill's widest. */
const PROGRESS_TRACK_PX = 218;

function gelCases(): Case[] {
  const out: Case[] = [];
  for (const kind of KINDS) {
    const big = kind === "play" || kind === "pause";
    const small = kind === "shuffle" || kind === "repeat";
    for (const on of [true, false]) {
      out.push({ name: `transport ${kind} on=${on}`, gel: AQUA.transport(kind, on, true), tone: big || (small && on) ? "blue" : "grey", outline: true, shadow: big });
      out.push({ name: `transport ${kind} on=${on} disabled`, gel: AQUA.transport(kind, on, false), tone: "grey", outline: true, shadow: false, disabled: true });
    }
  }
  out.push({ name: "badge primary", gel: AQUA.badge(true), tone: "blue", outline: true, shadow: false });
  out.push({ name: "badge", gel: AQUA.badge(false), tone: "grey", outline: true, shadow: false });
  out.push({ name: "seek knob", gel: AQUA.seekKnob, tone: "blue", outline: true, shadow: false });
  out.push({ name: "scroll thumb", gel: AQUA.scrollThumb, tone: "blue", outline: true, shadow: false, sizes: [[11, 16], [11, 40], [11, 166]] });
  out.push({ name: "progress fill", gel: AQUA.progressFill, tone: "blue", outline: false, shadow: false, sizes: [[0, 10], [10, 10], [22, 10], [PROGRESS_TRACK_PX, 10]] });
  out.push({ name: "tab active", gel: AQUA.tab(true), tone: "blue", outline: false, shadow: false, sizes: [[40, 18], [60, 18]] });
  out.push({ name: "tab", gel: AQUA.tab(false), tone: "grey", outline: false, shadow: false, sizes: [[40, 18], [60, 18]] });
  out.push({ name: "reference pill", gel: REFERENCE_PILL, tone: "blue", outline: true, shadow: true });
  return out;
}

/** A class literal's `name-[N]` value, or undefined. */
function num(cls: string, name: string): number | undefined {
  const match = new RegExp(`(?:^|\\s)${name}-\\[(-?[\\d.]+)\\]`).exec(cls);
  return match ? Number(match[1]) : undefined;
}

/** Signed distance from (px, py) to a rounded rectangle (negative inside). The radius clamps to half the shorter side, as the renderer's does. */
function sdf(px: number, py: number, x: number, y: number, w: number, h: number, r: number): number {
  const radius = Math.min(r, w / 2, h / 2);
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - radius);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** The gloss box for a body of width `W` and height `H`. */
function glossBox(cls: string, W: number, H: number): { x: number; y: number; w: number; h: number; r: number } {
  const left = num(cls, "left");
  const right = num(cls, "right");
  const top = num(cls, "top");
  const bottom = num(cls, "bottom");
  const x = left ?? 0;
  const y = top ?? 0;
  const w = num(cls, "w") ?? W - x - (right ?? 0);
  const h = num(cls, "h") ?? H - y - (bottom ?? 0);
  return { x, y, w, h, r: num(cls, "rounded") ?? 0 };
}

/** The least distance from any point of the gloss to the inside of the body's outline (px), or null when the gloss has no area. */
function clearance(gel: GelClasses, W: number, H: number): number | null {
  const g = glossBox(gel.gloss, W, H);
  if (g.w <= 0 || g.h <= 0) return null;
  const R = num(gel.body, "rounded") ?? 0;
  const outline = /(?:^|\s)border(?:\s|$)/.test(gel.body) ? 1 : 0;
  const step = 0.125;
  let least = Infinity;
  for (let i = 0; i * step <= g.w + 1e-9; i++) {
    for (let j = 0; j * step <= g.h + 1e-9; j++) {
      const px = g.x + i * step;
      const py = g.y + j * step;
      if (sdf(px, py, g.x, g.y, g.w, g.h, g.r) > 1e-9) continue;
      least = Math.min(least, -sdf(px, py, 0, 0, W, H, R) - outline);
    }
  }
  return least;
}

const COLOURS = {
  blue: { body: ["from-[#4a80da]", "via-[#4a80da]", "to-[#c8daf6]"], gloss: ["from-[#f5f8fe]", "via-[#d3e1f8]", "to-[#93b4eb]"], outline: "border-[#2b4f8c]" },
  grey: { body: ["from-[#c4c4c4]", "via-[#c4c4c4]", "to-[#f4f4f4]"], gloss: ["from-[#fdfdfd]", "via-[#ececec]", "to-[#d6d6d6]"], outline: "border-[#6e6e6e]" },
} as const;

test("every gloss lies inside its body, at least 0.25 px clear of an outline", () => {
  for (const c of gelCases()) {
    if (c.disabled) continue;
    const sizes = c.sizes ?? [[num(c.gel.body, "w")!, num(c.gel.body, "h")!]];
    for (const [W, H] of sizes) {
      const least = clearance(c.gel, W, H);
      if (least === null) continue; // a fill narrower than its gloss's insets draws no gloss
      expect(Number.isFinite(least), `${c.name} at ${W}×${H} has a gloss box`).toBe(true);
      expect(least, `${c.name} at ${W}×${H}`).toBeGreaterThanOrEqual(c.outline ? 0.25 : -1e-9);
    }
  }
});

test("blue and grey gels use the reference colours; a disabled button draws no gloss", () => {
  for (const c of gelCases()) {
    const colours = COLOURS[c.tone];
    for (const stop of colours.body) expect(c.gel.body, c.name).toContain(stop);
    if (c.outline) expect(c.gel.body, c.name).toContain(colours.outline);
    if (c.disabled) {
      expect(c.gel.gloss, c.name).toBe("hidden");
      expect(c.gel.body, c.name).toContain("opacity-45");
    } else {
      for (const stop of colours.gloss) expect(c.gel.gloss, c.name).toContain(stop);
      expect(c.gel.gloss, c.name).toMatch(/^absolute /);
    }
    expect(/(?:^|\s)(relative|absolute)(?:\s|$)/.test(c.gel.body), `${c.name} body is positioned`).toBe(true);
  }
  // The sideways scroll thumb runs its gradients left → right.
  expect(AQUA.scrollThumb.body).toContain("bg-gradient-to-r");
  expect(AQUA.scrollThumb.gloss).toContain("bg-gradient-to-r");
});

test("only the enabled transport buttons and the knob cast a shadow", () => {
  for (const c of gelCases()) expect(/(?:^|\s)shadow(?:\s|$)/.test(c.gel.body), c.name).toBe(c.shadow);
});

test("blue labels carry a translucent navy copy 1 px lower", () => {
  for (const shadow of [AQUA.tabTextShadow, AQUA.badgeTextShadow]) {
    expect(shadow).toContain("absolute left-[0] top-[1]");
    expect(shadow).toContain("text-[#1d3f8099]");
  }
  expect(AQUA.tabText(true)).toContain("text-white");
  expect(AQUA.badgeText(true)).toContain("text-white");
});
