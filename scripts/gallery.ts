// Renders every theme gallery state (gallery.pocket.json) in the PocketJS sim
// and writes both screens as 2× PNGs to dist/gallery/, for comparison with the
// approved mockups in docs/design/aqua/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BTN } from "../runtime/framework/src/input-api.ts";
import { GALLERY_STATES } from "../app/gallery/names.ts";
import { encodePng, scale } from "./png.ts";
import { bootBuilt, buildBundle, disposeBundles, ROOT } from "./sim.ts";

const out = join(ROOT, "dist", "gallery");
mkdirSync(out, { recursive: true });
try {
  const world = await bootBuilt(buildBundle("gallery.pocket.json"));
  for (let f = 0; f < 6; f++) world.step();
  for (const [index, name] of GALLERY_STATES.entries()) {
    for (const [surface, label] of [["primary", "top"], ["auxiliary", "bottom"]] as const) {
      const { width, height, rgba } = world.pixels(surface);
      const file = join(out, `${index + 1}-${name}-${label}@2x.png`);
      writeFileSync(file, encodePng(width * 2, height * 2, scale(width, height, rgba, 2)));
      console.log(file);
    }
    world.step({ buttons: BTN.RTRIGGER });
    // Settle slide-ins (the search keyboard) before the next capture.
    for (let f = 0; f < 30; f++) world.step();
  }
  if (world.failure) throw new Error(`gallery failed: ${world.failure.message}`);
} finally {
  disposeBundles();
}
