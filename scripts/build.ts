// Resolve a manifest (pocket.json, or --manifest=<path> such as the theme
// gallery's) against the runtime's 3DS profile, build through the runtime's
// 3DS pipeline, and copy the products from runtime/dist/3ds to dist/. Other
// arguments (--cia, --pocket-only, --capture, --outdir, --package-outdir,
// --font-*) pass through to build3ds.
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolve3dsBuildPlan } from "../runtime/tools/3ds-profile.ts";
import { build3ds } from "../runtime/tools/3ds.ts";
const root = resolve(import.meta.dir, "..");
const manifestArg = process.argv.find((a) => a.startsWith("--manifest="));
const manifest = resolve(manifestArg ? manifestArg.slice("--manifest=".length) : resolve(root, "pocket.json"));
const passthrough = process.argv.slice(2).filter((a) => !a.startsWith("--manifest="));
const plan = resolve3dsBuildPlan(await Bun.file(manifest).json());
mkdirSync(resolve(root, "dist"), { recursive: true });
const planPath = resolve(root, `dist/${plan.app.output}.plan.json`);
writeFileSync(planPath, JSON.stringify(plan, null, 2));
await build3ds([`--plan=${planPath}`, `--manifest=${manifest}`, `--project-root=${root}`, ...passthrough]);
// A caller that names its own package directory (the test harness) keeps the
// products there; copying runtime/dist/3ds would publish a stale build.
if (!passthrough.some((a) => a.startsWith("--package-outdir="))) {
  for (const ext of ["3dsx", "pocket", "cia"]) {
    const from = resolve(root, `runtime/dist/3ds/${plan.app.output}.${ext}`);
    if (existsSync(from)) copyFileSync(from, resolve(root, `dist/${plan.app.output}.${ext}`));
  }
}
