// Resolve pocket.json against the runtime's 3DS profile, build through the
// runtime's 3DS pipeline, and copy the products from runtime/dist/3ds to dist/.
// Extra arguments (--cia, --pocket-only, --capture) pass through to build3ds.
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolve3dsBuildPlan } from "../runtime/tools/3ds-profile.ts";
import { build3ds } from "../runtime/tools/3ds.ts";
const root = resolve(import.meta.dir, "..");
const plan = resolve3dsBuildPlan(await Bun.file(resolve(root, "pocket.json")).json());
mkdirSync(resolve(root, "dist"), { recursive: true });
const planPath = resolve(root, "dist/plan.json");
writeFileSync(planPath, JSON.stringify(plan, null, 2));
await build3ds([`--plan=${planPath}`, `--project-root=${root}`, ...process.argv.slice(2)]);
for (const ext of ["3dsx", "pocket", "cia"]) {
  const from = resolve(root, `runtime/dist/3ds/${plan.app.output}.${ext}`);
  if (existsSync(from)) copyFileSync(from, resolve(root, `dist/${plan.app.output}.${ext}`));
}
