import { expect, test } from "bun:test";
import { HOLD_UP, repeatFires, stepAnalog, stepHold, type HoldState } from "../app/input-timing.ts";

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
