// Map the app's imports onto the pinned runtime submodule: @pocketjs/framework
// is the PocketJS checkout itself, and solid-js and the type packages come from
// its installed node_modules. Run after `bun install --cwd runtime`.
import { existsSync, lstatSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
const root = resolve(import.meta.dir, "..");
// An older setup linked the whole @types directory; linking @types/bun through it would delete runtime's copy.
const types = resolve(root, "node_modules/@types");
if (lstatSync(types, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(types);
for (const [name, target] of Object.entries({ "@pocketjs/framework": "runtime", "solid-js": "runtime/node_modules/solid-js", "@types/bun": "runtime/node_modules/@types/bun", "bun-types": "runtime/node_modules/bun-types" })) {
  const source = resolve(root, target), destination = resolve(root, "node_modules", name);
  if (!existsSync(source)) throw new Error(`Missing ${target}; initialize the submodule and install runtime dependencies`);
  mkdirSync(dirname(destination), { recursive: true }); rmSync(destination, { recursive: true, force: true });
  symlinkSync(relative(dirname(destination), source), destination, "dir");
}
