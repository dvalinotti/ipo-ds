// Boots the ipo-ds app or the theme gallery in the PocketJS sim (bundles are
// built once per test process by scripts/sim.ts) and reads what a screen shows.
import type { BundleWorld, SimNode } from "../../runtime/hosts/sim/sim.ts";
import { bootBuilt, buildBundle, disposeBundles } from "../../scripts/sim.ts";

export function bootApp(extraGlobals?: Record<string, unknown>): Promise<BundleWorld> {
  return bootBuilt(buildBundle("pocket.json"), extraGlobals);
}

export function bootGallery(): Promise<BundleWorld> {
  return bootBuilt(buildBundle("gallery.pocket.json"));
}

export function disposeGuest(): void {
  disposeBundles();
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

/** Every path from the surface root to a node whose own text is exactly `text`, in tree order. */
export function pathsTo(world: BundleWorld, surface: "primary" | "auxiliary", text: string): SimNode[][] {
  const out: SimNode[][] = [];
  const walk = (node: SimNode, path: SimNode[]): void => {
    const here = [...path, node];
    if (node.text === text) out.push(here);
    for (const child of node.children) walk(child, here);
  };
  const root = world.tree(surface);
  if (root) walk(root, []);
  return out;
}

/** Path from the surface root to the first node whose own text is exactly `text`. */
export function pathTo(world: BundleWorld, surface: "primary" | "auxiliary", text: string): SimNode[] {
  const walk = (node: SimNode, path: SimNode[]): SimNode[] | null => {
    const here = [...path, node];
    if (node.text === text) return here;
    for (const child of node.children) {
      const found = walk(child, here);
      if (found) return found;
    }
    return null;
  };
  const root = world.tree(surface);
  const path = root ? walk(root, []) : null;
  if (!path) throw new Error(`no node with text ${JSON.stringify(text)} on ${surface}`);
  return path;
}

/** Background of the nearest ancestor that paints one, as the core holds it (0xAABBGGRR). */
export function backgroundOf(path: readonly SimNode[]): number {
  for (let i = path.length - 1; i >= 0; i--) if (path[i]!.bgColor >>> 24 !== 0) return path[i]!.bgColor >>> 0;
  return 0;
}

/** Colour of the <Text> element holding a text run (the run's parent), 0xAABBGGRR. */
export function textColorOf(path: readonly SimNode[]): number {
  const element = path.length >= 2 && path[path.length - 2]!.type === "text" ? path[path.length - 2]! : path[path.length - 1]!;
  return element.textColor >>> 0;
}
