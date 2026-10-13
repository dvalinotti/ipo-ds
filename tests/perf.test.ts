import { expect, test } from "bun:test";
import {
  BUDGET_US,
  cpuWork,
  overBudget,
  SCAN_BUDGET_MS,
  SCENARIOS,
  type Scenario,
  type Stats,
} from "../scripts/perf.ts";

const scenario = (name: string): Scenario => SCENARIOS.find((s) => s.name === name)!;
const stats = (work: [number, number], localmedia?: Stats["localmedia"]): Stats => ({
  host: { timingUs: { js: [0, 0], tick: [0, 0], draw: [0, 0], gpu: [0, 0], frame: [0, 0], work, slowFrames: 0 } },
  localmedia,
});

test("the scenarios are the spec's, and the budgets its targets", () => {
  expect(SCENARIOS.map((s) => s.name)).toEqual([
    "idle",
    "scroll",
    "now-playing",
    "dj",
    "swapped-idle",
    "touch-drag",
    "touch-fling",
    "swap",
    "swap-dj",
    "swap-search",
    "scan-first",
    "scan-cached",
  ]);
  expect(BUDGET_US).toEqual({ new: 14_000, old: 30_000 });
  expect(SCAN_BUDGET_MS).toEqual({ first: 10_000, cached: 1_000, confirm: 3_000 });
  expect(scenario("scan-cached").keepCard).toBe(true); // it reads the cache scan-first wrote
});

test("frame scenarios are judged by the worst frame's CPU work", () => {
  expect(cpuWork(stats([3_000, 7_800]))).toEqual([3_000, 7_800]);
  expect(overBudget(scenario("scroll"), "new", stats([3_000, 14_000]))).toBeNull();
  expect(overBudget(scenario("scroll"), "new", stats([3_000, 14_001]))).toBe("CPU max 14.0 ms > 14 ms");
  expect(overBudget(scenario("idle"), "old", stats([4_800, 30_000]))).toBeNull();
  expect(overBudget(scenario("idle"), "old", stats([4_800, 30_500]))).toBe("CPU max 30.5 ms > 30 ms");
});

test("scan scenarios are judged by the scan's timings", () => {
  const first = scenario("scan-first"),
    cached = scenario("scan-cached");
  expect(overBudget(first, "old", stats([0, 0]))).toBe("no localmedia stats");
  expect(overBudget(first, "old", stats([0, 0], { cachedMs: -1, scanMs: 10_000, files: 324, parsed: 324 }))).toBeNull();
  expect(overBudget(first, "old", stats([0, 0], { cachedMs: -1, scanMs: 10_001, files: 324, parsed: 324 }))).toBe(
    "scan 10001 ms > 10000 ms",
  );
  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: 345, scanMs: 936, files: 324, parsed: 0 }))).toBeNull();
  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: -1, scanMs: 936, files: 324, parsed: 0 }))).toBe(
    "cached list -1 ms > 1000 ms",
  );
  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: 1_001, scanMs: 936, files: 324, parsed: 0 }))).toBe(
    "cached list 1001 ms > 1000 ms",
  );
  expect(overBudget(cached, "old", stats([0, 0], { cachedMs: 345, scanMs: 3_001, files: 324, parsed: 0 }))).toBe(
    "confirmation 3001 ms > 3000 ms",
  );
});

test("the touch tapes land where they mean to: list drags inside the body, the search tap in the footer, the swap inside the window", () => {
  const WINDOW = { first: 2941, last: 3000 }; // the host's timing window ends at the capture frame
  const points = (name: string) =>
    scenario(name)
      .touch!.split("@")
      .map((entry) => {
        const [frame, payload] = entry.split(":");
        if (payload === "-") return { frame: Number(frame), lift: true, x: 0, y: 0 };
        const [, x, y] = payload!.split(",").map(Number);
        return { frame: Number(frame), lift: false, x: x!, y: y! };
      });
  for (const name of ["touch-drag", "touch-fling"]) {
    const tape = points(name);
    expect(tape[0]!.frame).toBeGreaterThanOrEqual(2526); // after the swap hold's release (2526)
    expect(tape.at(-1)!.frame).toBeLessThanOrEqual(WINDOW.last);
    if (name === "touch-drag")
      expect(tape[0]!.frame).toBeLessThanOrEqual(WINDOW.first); // the drag spans the whole window
    else expect(tape.at(-1)!.frame).toBeLessThan(WINDOW.first); // the fling fills the window
    expect(tape[0]!.y).toBeGreaterThanOrEqual(51); // the down lands in the list body…
    expect(tape[0]!.y).toBeLessThan(219);
    expect(tape[0]!.x).toBeLessThan(300); // …left of the scrollbar's hit region
    for (const p of tape)
      if (!p.lift) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(319);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(239);
      }
    expect(tape.at(-1)!.lift).toBe(true);
  }
  const search = points("swap-search");
  expect(search[0]!.y).toBeGreaterThanOrEqual(220); // the footer
  expect(search[0]!.frame).toBeGreaterThanOrEqual(WINDOW.first); // inside the window
  expect(search[0]!.frame).toBeLessThanOrEqual(WINDOW.last);
  expect(scenario("swap").tape).toBe("0:0x0,2900:0x1,2966:0x0"); // the hold fires at 2959, inside 2941–3000
  expect(scenario("swap-dj").tape.endsWith("2975:0x1,2977:0x0")).toBe(true);
  expect(scenario("swapped-idle").touch).toBeUndefined();
});
