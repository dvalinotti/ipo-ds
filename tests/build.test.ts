import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

test("--manifest builds the bundle that manifest names and keeps it out of dist/", () => {
  const dir = mkdtempSync(join(tmpdir(), "ipo-ipo-dsifest-"));
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, "pocket.json"), "utf8")) as { app: { output: string } };
    manifest.app.output = "ipo-ds-probe";
    writeFileSync(join(dir, "probe.pocket.json"), JSON.stringify(manifest));
    const run = Bun.spawnSync(
      [
        process.execPath,
        "scripts/build.ts",
        "--pocket-only",
        `--manifest=${join(dir, "probe.pocket.json")}`,
        `--outdir=${join(dir, "guest")}`,
        `--package-outdir=${dir}`,
      ],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    expect(run.exitCode, `${run.stdout.toString()}${run.stderr.toString()}`).toBe(0);
    expect(existsSync(join(dir, "guest", "ipo-ds-probe.js"))).toBe(true);
    expect(existsSync(join(ROOT, "dist", "ipo-ds-probe.pocket"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);

test("every class literal compiles, in the app and in the gallery (the 3DS build only warns)", () => {
  for (const manifest of ["pocket.json", "gallery.pocket.json"]) {
    const dir = mkdtempSync(join(tmpdir(), "ipo-ds-classes-"));
    try {
      const run = Bun.spawnSync(
        [
          process.execPath,
          "scripts/build.ts",
          "--pocket-only",
          `--manifest=${manifest}`,
          `--outdir=${join(dir, "guest")}`,
          `--package-outdir=${dir}`,
        ],
        { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
      );
      const output = `${run.stdout.toString()}${run.stderr.toString()}`;
      expect(run.exitCode, output).toBe(0);
      // The class pass ran and reported: a build that prints nothing must not pass as clean.
      expect(output).toContain("pass 1:");
      expect(output.split("\n").filter((line) => line.includes("does not compile"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}, 240_000);
