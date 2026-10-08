import { expect, test } from "bun:test";
import { HOLD_UP, repeatFires, SHOULDERS_UP, stepAnalog, stepHold, stepLatch, stepShoulders, type HoldState, type ShoulderEvent } from "../app/input-timing.ts";

test("a held button fires on the down frame, after 300 ms, then every 80 ms", () => {
  const fired = Array.from({ length: 30 }, (_, frame) => frame).filter((frame) => repeatFires(frame));
  expect(fired).toEqual([0, 18, 23, 28]);
});

function press(frames: boolean[]): string[] {
  let state: HoldState = HOLD_UP;
  const events: string[] = [];
  for (const down of frames) {
    const step = stepHold(state, down, 4);
    state = step.state;
    if (step.event) events.push(step.event);
  }
  return events;
}

test("a short press is a tap on release; a long press fires hold once and no tap", () => {
  expect(press([true, true, false])).toEqual(["tap"]);
  expect(press([true, true, true, true, true, true, false])).toEqual(["hold"]);
  expect(press([false, false])).toEqual([]);
  expect(press([true, false, true, true, true, true, false, true, false])).toEqual(["tap", "hold", "tap"]);
});

test("the circle pad moves whole rows in proportion to deflection and stops at rest", () => {
  const roll = (deflection: number, frames: number) => {
    let accumulated = 0;
    let rows = 0;
    for (let frame = 0; frame < frames; frame++) {
      const step = stepAnalog(accumulated, deflection);
      accumulated = step.accumulated;
      rows += step.rows;
    }
    return rows;
  };
  expect(roll(1, 20)).toBe(4);
  expect(roll(-0.5, 20)).toBe(-2);
  expect(stepAnalog(0.9, 0)).toEqual({ accumulated: 0, rows: 0 });
});

test("L / R alone step tabs; Y held with L / R skips songs; a Y tap alone reveals on release", () => {
  const BITS = { y: 1, l: 2, r: 4 };
  const run = (masks: number[]) => {
    let state = SHOULDERS_UP;
    const events: ShoulderEvent[] = [];
    for (const mask of masks) {
      const step = stepShoulders(state, mask, BITS);
      state = step.state;
      events.push(...step.events);
    }
    return events;
  };
  expect(run([2, 0, 4, 4, 0])).toEqual(["tabPrev", "tabNext"]);
  expect(run([1, 1, 0])).toEqual(["reveal"]);
  expect(run([1, 1 | 4, 1, 1 | 2, 1, 0])).toEqual(["next", "prev"]);
  expect(run([1 | 4, 1, 0])).toEqual(["next"]);
  expect(run([1, 1 | 4, 4, 0])).toEqual(["next"]);
});

test("a shoulder pressed while the other is held (the L+R diagnostics chord) does not step tabs", () => {
  const BITS = { y: 1, l: 2, r: 4 };
  const run = (masks: number[]) => {
    let state = SHOULDERS_UP;
    const events: ShoulderEvent[] = [];
    for (const mask of masks) {
      const step = stepShoulders(state, mask, BITS);
      state = step.state;
      events.push(...step.events);
    }
    return events;
  };
  expect(run([2, 2 | 4, 2 | 4, 0])).toEqual(["tabPrev"]);
  expect(run([4, 4 | 2, 0])).toEqual(["tabNext"]);
  expect(run([2 | 4, 2 | 4, 0])).toEqual([]);
});

test("a button held across the keyboard's close stays ignored until it is released", () => {
  const run = (frames: [down: boolean, active: boolean][]) => {
    let ignoring = false;
    return frames.map(([down, active]) => {
      const step = stepLatch(ignoring, down, active);
      ignoring = step.ignoring;
      return step.down;
    });
  };
  // Held inside the modal, through its close, released, pressed again: only the second press counts.
  expect(run([[true, false], [true, false], [true, true], [true, true], [false, true], [true, true]])).toEqual([false, false, false, false, false, true]);
  // Pressed on the frame the modal closes: a press.
  expect(run([[false, false], [true, true]])).toEqual([false, true]);
  // Released while inactive: nothing is pending when the modal closes.
  expect(run([[true, false], [false, false], [false, true], [true, true]])).toEqual([false, false, false, true]);
});
