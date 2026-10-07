// Measures ipo-ds in Azahar (headless): builds a capture .3dsx per scenario with
// a baked input tape, boots it against a throwaway $HOME whose SD card holds the
// device test library, and reads the frame timings and scan timings the host
// writes to stats.json when the capture window ends.
//
//   bun run perf [idle|scroll|now-playing|scan-first|scan-cached …] [--model old|new|both] [--check] [--out dir]
//
// Needs Azahar (/Applications/Azahar.app, launched once so its config exists),
// Docker for the 3DS build, and dist/test-music (bun run test-library).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { encodePNG } from "../runtime/tests/png.ts";

export interface Scenario {
  name: string;
  /** POCKETJS_CAPTURE_INPUT: frame:mask steps (the mask holds until the next step). */
  tape: string;
  capture: number;
  /** Frame scenarios are judged by CPU work; scan scenarios by stats.localmedia. */
  kind: "frame" | "scan";
  /** Reuse the previous scenario's SD card (the scan cache it wrote). */
  keepCard?: boolean;
}

const A = 0x2000, DOWN = 0x40;
// Presses wait until 40 s, well after the first scan (about 6 s in Azahar), so frame scenarios
// measure the settled app.
export const SCENARIOS: readonly Scenario[] = [
  { name: "idle", tape: "0:0x0", capture: 3000, kind: "frame" },
  { name: "scroll", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0,2700:0x${DOWN.toString(16)}`, capture: 3000, kind: "frame" },
  { name: "now-playing", tape: `0:0x0,2400:0x${A.toString(16)},2406:0x0`, capture: 3000, kind: "frame" },
  { name: "scan-first", tape: "0:0x0", capture: 3600, kind: "scan" },
  { name: "scan-cached", tape: "0:0x0", capture: 3600, kind: "scan", keepCard: true },
];

/** CPU budgets per frame (max over the window), in µs: New 3DS 60 fps, Old 3DS a steady 30 fps. */
export const BUDGET_US = { new: 14_000, old: 30_000 } as const;
export const SCAN_BUDGET_MS = { first: 10_000, cached: 1_000, confirm: 3_000 } as const;

export interface HostStats {
  timingUs: {
    js: [number, number]; tick: [number, number]; draw: [number, number]; gpu: [number, number]; frame: [number, number];
    /** Each frame's js + tick + draw: its max is one real frame's. */
    work: [number, number];
    slowFrames: number;
  };
}
export interface Stats {
  host: HostStats;
  localmedia?: { cachedMs: number; scanMs: number; files: number; parsed: number };
}

/** CPU work per frame (JS + tick + draw): [mean, max] in µs over the host's last 60-frame window. */
export function cpuWork(stats: Stats): [number, number] {
  return stats.host.timingUs.work;
}

export function overBudget(scenario: Scenario, model: "old" | "new", stats: Stats): string | null {
  if (scenario.kind === "frame") {
    const [, max] = cpuWork(stats);
    return max > BUDGET_US[model] ? `CPU max ${(max / 1000).toFixed(1)} ms > ${BUDGET_US[model] / 1000} ms` : null;
  }
  const lm = stats.localmedia;
  if (!lm) return "no localmedia stats";
  if (scenario.name === "scan-first" && lm.scanMs > SCAN_BUDGET_MS.first) return `scan ${lm.scanMs} ms > ${SCAN_BUDGET_MS.first} ms`;
  if (scenario.name === "scan-cached") {
    if (lm.cachedMs < 0 || lm.cachedMs > SCAN_BUDGET_MS.cached) return `cached list ${lm.cachedMs} ms > ${SCAN_BUDGET_MS.cached} ms`;
    if (lm.scanMs > SCAN_BUDGET_MS.confirm) return `confirmation ${lm.scanMs} ms > ${SCAN_BUDGET_MS.confirm} ms`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Running Azahar
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, "..");
const AZAHAR = "/Applications/Azahar.app";
const AZAHAR_BIN = `${AZAHAR}/Contents/MacOS/azahar`;
const SOURCE = `${homedir()}/Library/Application Support/Azahar`;

function writeConfig(userDir: string, model: "old" | "new"): void {
  let config = readFileSync(`${SOURCE}/config/qt-config.ini`, "utf8");
  const set = (key: string, value: string) => {
    if (!new RegExp(`^${key}=`, "m").test(config)) throw new Error(`perf: qt-config.ini has no ${key} key`);
    config = config.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
    config = new RegExp(`^${key}\\\\default=.*$`, "m").test(config)
      ? config.replace(new RegExp(`^${key}\\\\default=.*$`, "m"), `${key}\\default=false`)
      : config.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}\n${key}\\default=false`);
  };
  set("graphics_api", "2");
  set("resolution_factor", "1");
  set("use_vsync", "false");
  set("frame_limit", "100");
  set("use_disk_shader_cache", "false");
  set("check_for_update_on_start", "false");
  set("is_new_3ds", model === "new" ? "true" : "false");
  // Azahar runs the ARM11 at the Old 3DS clock in both models (the New 3DS 804 MHz
  // speed-up the host requests is not emulated), so the New model runs at 300%.
  set("cpu_clock_percentage", model === "new" ? "300" : "100");
  mkdirSync(`${userDir}/config`, { recursive: true });
  writeFileSync(`${userDir}/config/qt-config.ini`, config);
}

/** Lays out a fixture $HOME; keeps the SD card when asked (the scan cache lives there). */
function prepareHome(home: string, model: "old" | "new", keepCard: boolean): string {
  const userDir = `${home}/Library/Application Support/Azahar`;
  const sdmc = `${userDir}/sdmc`;
  if (!keepCard) {
    rmSync(home, { recursive: true, force: true });
    mkdirSync(`${sdmc}/3ds`, { recursive: true });
    for (const dir of ["nand", "sysdata"]) if (existsSync(`${SOURCE}/${dir}`)) cpSync(`${SOURCE}/${dir}`, `${userDir}/${dir}`, { recursive: true });
    // Clone, not copy: APFS clones make the 366 MB library free to lay out per run.
    const copy = Bun.spawnSync(["cp", "-cR", join(ROOT, "dist/test-music"), `${sdmc}/music`]);
    if (copy.exitCode !== 0) throw new Error(`perf: could not copy the test library: ${copy.stderr.toString()}`);
    // Azahar's HLE DSP needs the file to exist, not to be real firmware.
    writeFileSync(`${sdmc}/3ds/dspfirm.cdc`, new Uint8Array(65536));
  }
  writeConfig(userDir, model);
  rmSync(`${sdmc}/pocketjs-captures`, { recursive: true, force: true });
  mkdirSync(`${sdmc}/pocketjs-captures`, { recursive: true });
  return `${sdmc}/pocketjs-captures`;
}

function kill(): void {
  Bun.spawnSync(["pkill", "-9", "-f", AZAHAR_BIN], { stdout: "ignore", stderr: "ignore" });
}

async function runAzahar(home: string, captures: string, rom: string, log: string): Promise<void> {
  kill();
  const launch = Bun.spawnSync(["open", "-n", "-a", AZAHAR, "--env", `HOME=${home}`, "--stdout", log, "--stderr", log, "--args", rom]);
  if (launch.exitCode !== 0) throw new Error(`perf: could not launch Azahar: ${launch.stderr.toString()}`);
  const started = Date.now();
  try {
    while (Date.now() - started < 240_000) {
      if (existsSync(`${captures}/error.txt`)) throw new Error(readFileSync(`${captures}/error.txt`, "utf8"));
      if (existsSync(`${captures}/done`)) return;
      await Bun.sleep(250);
    }
    throw new Error("perf: timed out waiting for the capture to finish");
  } finally {
    kill();
  }
}

function decodeScreen(raw: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    const s = (x * height + (height - 1 - y)) * 4, d = (y * width + x) * 4;
    rgba[d] = raw[s + 3]!; rgba[d + 1] = raw[s + 2]!; rgba[d + 2] = raw[s + 1]!; rgba[d + 3] = 255;
  }
  return rgba;
}

async function build(scenario: Scenario, out: string): Promise<string> {
  const log = join(out, `${scenario.name}.build.log`);
  const proc = Bun.spawn(["bun", "scripts/build.ts", "--capture"], {
    cwd: ROOT,
    env: { ...process.env, POCKETJS_CAPTURE_INPUT: scenario.tape, POCKETJS_CAP_START: String(scenario.capture), POCKETJS_CAP_N: "1" },
    stdout: Bun.file(log), stderr: Bun.file(log),
  });
  if ((await proc.exited) !== 0) throw new Error(`perf: capture build for ${scenario.name} failed (see ${log})`);
  const rom = join(out, `${scenario.name}.3dsx`);
  cpSync(join(ROOT, "dist/ipo-ds-main.3dsx"), rom);
  return rom;
}

const fmt = (us: number) => (us / 1000).toFixed(1);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const check = args.includes("--check") ? (args.splice(args.indexOf("--check"), 1), true) : false;
  const modelArg = flag("--model") ?? "both";
  const out = resolve(flag("--out") ?? join(ROOT, "dist/perf"));
  const models: ("old" | "new")[] = modelArg === "both" ? ["new", "old"] : [modelArg as "old" | "new"];
  const chosen = args.length ? SCENARIOS.filter((s) => args.includes(s.name)) : SCENARIOS;
  if (!existsSync(AZAHAR_BIN)) throw new Error(`perf: Azahar not found at ${AZAHAR}`);
  if (!existsSync(join(ROOT, "dist/test-music"))) throw new Error("perf: run `bun run test-library` first");
  mkdirSync(out, { recursive: true });
  const roms = new Map<string, string>();
  for (const scenario of chosen) roms.set(scenario.name, await build(scenario, out));
  const results: { scenario: string; model: string; stats: Stats; failure: string | null }[] = [];
  for (const model of models) {
    const home = join(out, `home-${model}`);
    for (const scenario of chosen) {
      const captures = prepareHome(home, model, scenario.keepCard === true);
      await runAzahar(home, captures, roms.get(scenario.name)!, join(out, `${scenario.name}-${model}.azahar.log`));
      const statsText = readFileSync(`${captures}/stats.json`, "utf8");
      writeFileSync(join(out, `${scenario.name}-${model}.stats.json`), statsText);
      const stats = JSON.parse(statsText) as Stats;
      const frame = String(scenario.capture).padStart(4, "0");
      for (const [prefix, width, label] of [["", 400, "top"], ["aux-", 320, "bottom"]] as const) {
        const raw = `${captures}/${prefix}f${frame}.raw`;
        if (existsSync(raw)) writeFileSync(join(out, `${scenario.name}-${model}-${label}.png`), encodePNG(decodeScreen(readFileSync(raw), width, 240), width, 240));
      }
      const failure = overBudget(scenario, model, stats);
      results.push({ scenario: scenario.name, model, stats, failure });
      console.error(`perf: ${scenario.name} (${model}) ${failure ?? "ok"}`);
    }
  }
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log("| Scenario | Model | JS mean/max | Tick mean/max | Draw mean/max | CPU mean/max (ms) | Scan (ms) | Within budget |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const t = r.stats.host.timingUs, [mean, max] = cpuWork(r.stats), lm = r.stats.localmedia;
    const scan = lm ? `cached ${lm.cachedMs}, walk ${lm.scanMs} (${lm.parsed}/${lm.files} read)` : "";
    console.log(`| ${r.scenario} | ${r.model} | ${fmt(t.js[0])}/${fmt(t.js[1])} | ${fmt(t.tick[0])}/${fmt(t.tick[1])} | ${fmt(t.draw[0])}/${fmt(t.draw[1])} | ${fmt(mean)}/${fmt(max)} | ${scan} | ${r.failure ? `no: ${r.failure}` : "yes"} |`);
  }
  if (check && results.some((r) => r.failure)) process.exit(1);
}
