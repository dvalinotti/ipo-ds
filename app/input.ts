// Frame-driven input helpers over the pure steppers in input-timing.ts. They
// read the raw held-button mask once per frame; `active` gates them (the
// search keyboard owns input while it is open).
import { analogY, onFrame } from "@pocketjs/framework/lifecycle";
import { HOLD_UP, repeatFires, stepAnalog, stepHold, stepLatch } from "./input-timing.ts";

/**
 * Fire on press, then repeat while held (300 ms delay, 80 ms rate); `repeat` is false on the press, and
 * `release` runs once when a press that fired ends. Latched: see stepLatch. Starts latched, so a button
 * already down when the screen mounts (a swap, the keyboard closing) is ignored until it is released.
 */
export function onRepeat(button: number, fire: (repeat: boolean) => void, active: () => boolean, release?: () => void): void {
  let held = -1;
  let ignoring = true;
  onFrame((buttons) => {
    const latch = stepLatch(ignoring, (buttons & button) !== 0, active());
    ignoring = latch.ignoring;
    if (!latch.down) {
      if (held >= 0) release?.();
      held = -1;
      return;
    }
    held++;
    if (repeatFires(held)) fire(held > 0);
  });
}

/**
 * A release before the hold time is a tap; holding fires `hold` once instead. Latched: see stepLatch. Starts
 * latched, so a button already down when the screen mounts (a swap, the keyboard closing) is ignored until it is released.
 */
export function onTapOrHold(button: number, tap: () => void, hold: () => void, active: () => boolean): void {
  let state = HOLD_UP;
  let ignoring = true;
  onFrame((buttons) => {
    const latch = stepLatch(ignoring, (buttons & button) !== 0, active());
    ignoring = latch.ignoring;
    if (!active()) {
      // A hold the keyboard interrupted ends without a tap.
      state = HOLD_UP;
      return;
    }
    const step = stepHold(state, latch.down);
    state = step.state;
    if (step.event === "tap") tap();
    else if (step.event === "hold") hold();
  });
}

/** Circle-pad Y as whole-row moves, faster with deflection. */
export function onAnalogRows(move: (rows: number) => void, active: () => boolean): void {
  let accumulated = 0;
  onFrame(() => {
    const step = stepAnalog(accumulated, active() ? analogY() : 0);
    accumulated = step.accumulated;
    if (step.rows !== 0) move(step.rows);
  });
}
