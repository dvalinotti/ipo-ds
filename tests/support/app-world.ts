// Builds the ds-man guest once per test process (--pocket-only: no Docker)
// and boots it on the sim's WASM core with the 3DS geometry.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bootBundle, type BundleWorld, type SimNode } from "../../runtime/hosts/sim/sim.ts";

const ROOT = resolve(import.meta.dir, "../..");
let built: { dir: string; js: string; pak: string } | null = null;

function buildGuest() {
  if (built) return built;
  const dir = mkdtempSync(join(tmpdir(), "ds-man-guest-"));
  const run = Bun.spawnSync(
    [process.execPath, "scripts/build.ts", "--pocket-only", `--outdir=${join(dir, "guest")}`, `--package-outdir=${dir}`],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (run.exitCode !== 0) throw new Error(`ds-man guest build failed\n${run.stdout}${run.stderr}`);
  built = { dir, js: join(dir, "guest", "ds-man-main.js"), pak: join(dir, "guest", "ds-man-main.pak") };
  return built;
}

export function disposeGuest(): void {
  if (built) rmSync(built.dir, { recursive: true, force: true });
  built = null;
}

export async function bootApp(extraGlobals?: Record<string, unknown>): Promise<BundleWorld> {
  const { js, pak } = buildGuest();
  return bootBundle({ js, pak, extraGlobals, viewport: { width: 400, height: 240, auxiliary: [320, 240] } });
}

function flat(node: SimNode | null, out: SimNode[] = []): SimNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children) flat(child, out);
  return out;
}

/** Every text on a surface, concatenated in tree order. */
export function screenText(world: BundleWorld, surface: "primary" | "auxiliary" = "primary"): string {
  return flat(world.tree(surface)).map((node) => node.text).join("");
}
