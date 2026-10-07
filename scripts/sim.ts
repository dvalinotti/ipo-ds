// Builds a ipo-ds bundle (--pocket-only: no Docker) once per process and boots
// it on the PocketJS sim's WASM core with the 3DS geometry. Shared by the test
// harness and scripts/gallery.ts.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bootBundle, type BundleWorld } from "../runtime/hosts/sim/sim.ts";

export const ROOT = resolve(import.meta.dir, "..");

export interface BuiltBundle {
  dir: string;
  js: string;
  pak: string;
}

const built = new Map<string, BuiltBundle>();

/** Build the bundle a manifest (path relative to the repo root) describes. */
export function buildBundle(manifest: string): BuiltBundle {
  const cached = built.get(manifest);
  if (cached) return cached;
  const output = (JSON.parse(readFileSync(resolve(ROOT, manifest), "utf8")) as { app: { output: string } }).app.output;
  const dir = mkdtempSync(join(tmpdir(), `${output}-`));
  const run = Bun.spawnSync(
    [process.execPath, "scripts/build.ts", "--pocket-only", `--manifest=${manifest}`, `--outdir=${join(dir, "guest")}`, `--package-outdir=${dir}`],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (run.exitCode !== 0) throw new Error(`${output} build failed\n${run.stdout}${run.stderr}`);
  const bundle = { dir, js: join(dir, "guest", `${output}.js`), pak: join(dir, "guest", `${output}.pak`) };
  built.set(manifest, bundle);
  return bundle;
}

export function disposeBundles(): void {
  for (const bundle of built.values()) rmSync(bundle.dir, { recursive: true, force: true });
  built.clear();
}

export function bootBuilt(bundle: BuiltBundle, extraGlobals?: Record<string, unknown>): Promise<BundleWorld> {
  return bootBundle({ js: bundle.js, pak: bundle.pak, extraGlobals, viewport: { width: 400, height: 240, auxiliary: [320, 240] } });
}
