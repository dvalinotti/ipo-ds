// DJ Mode's platter art, generated: a 256 px vinyl record (drawn at 200 px,
// over the label) with grooves and a one-sided sheen so its rotation reads,
// and a 128 px Aqua label (drawn at 88 px) for tracks without cover art, with
// an off-centre mark. The SVG baker draws flat shapes only, so these are PNGs.
//
//   bun scripts/vinyl-png.ts      (rewrites app/theme/vinyl.png and label.png)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.ts";

export const VINYL_PX = 256;
export const LABEL_PX = 128;

/** Radii in texture px (×200/256 on screen): the disc, its centre hole (84 px across on screen), the grooved band. */
const R_OUTER = 128;
const R_HOLE = 54;
const R_GROOVES_IN = 62;
const R_GROOVES_OUT = 122;

/** How much of a pixel at distance r lies inside a circle of radius edge (1 px soft edge). */
function inside(edge: number, r: number): number {
  return Math.max(0, Math.min(1, edge - r + 0.5));
}

export function vinylPixels(): Uint8Array {
  const out = new Uint8Array(VINYL_PX * VINYL_PX * 4);
  const c = VINYL_PX / 2;
  for (let y = 0; y < VINYL_PX; y++) {
    for (let x = 0; x < VINYL_PX; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const alpha = inside(R_OUTER, r) * (1 - inside(R_HOLE, r));
      let shade = 22;
      if (r < R_GROOVES_IN) shade = 14; // the run-out beside the label
      else if (r > R_GROOVES_OUT) shade = 30; // the rim
      else if (Math.floor(r) % 4 === 0) shade = 32; // a groove ring every 4 px
      // One soft wedge of light centred on 45°: a turn moves it.
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const off = Math.abs(((deg - 45 + 540) % 360) - 180);
      shade += Math.round(40 * Math.max(0, 1 - off / 30));
      const i = (y * VINYL_PX + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = shade;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

const TOP = [0x4a, 0x80, 0xda];
const BOTTOM = [0x2b, 0x4f, 0x8c];
const CREAM = [0xf4, 0xf6, 0xe6];

export function labelPixels(): Uint8Array {
  const out = new Uint8Array(LABEL_PX * LABEL_PX * 4);
  for (let y = 0; y < LABEL_PX; y++) {
    for (let x = 0; x < LABEL_PX; x++) {
      const t = y / (LABEL_PX - 1);
      let rgb = TOP.map((top, k) => top + (BOTTOM[k]! - top) * t);
      // A cream dot up and to the left, and a cream bar lower right of centre.
      const dot = inside(12, Math.hypot(x + 0.5 - 40, y + 0.5 - 40));
      const bar = x >= 70 && x < 100 && y >= 60 && y < 66 ? 1 : 0;
      const mark = Math.max(dot, bar);
      rgb = rgb.map((v, k) => v + (CREAM[k]! - v) * mark);
      const i = (y * LABEL_PX + x) * 4;
      out[i] = Math.round(rgb[0]!);
      out[i + 1] = Math.round(rgb[1]!);
      out[i + 2] = Math.round(rgb[2]!);
      out[i + 3] = 255;
    }
  }
  return out;
}

if (import.meta.main) {
  const theme = join(import.meta.dir, "../app/theme");
  writeFileSync(join(theme, "vinyl.png"), encodePng(VINYL_PX, VINYL_PX, vinylPixels()));
  writeFileSync(join(theme, "label.png"), encodePng(LABEL_PX, LABEL_PX, labelPixels()));
  console.log("wrote app/theme/vinyl.png and app/theme/label.png");
}
