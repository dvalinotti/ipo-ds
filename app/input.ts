// Frame-driven input helpers over the pure steppers in input-timing.ts. They
// read the raw held-button mask once per frame; `active` gates them (the
// search keyboard owns input while it is open).
import { analogY, onFrame } from "@pocketjs/framework/lifecycle";
import { HOLD_UP, repeatFires, stepAnalog, stepHold } from "./input-timing.ts";

/** Fire on press, then repeat while held (300 ms delay, 80 ms rate). */
export function onRepeat(button: number, fire: () => void, active: () => boolean): void {
  let held = -1;
  onFrame((buttons) => {
    if (!active() || (buttons & button) === 0) {
      held = -1;
      return;
    }
    held++;
    if (repeatFires(held)) fire();
  });
}

/** A release before the hold time is a tap; holding fires `hold` once instead. */
export function onTapOrHold(button: number, tap: () => void, hold: () => void, active: () => boolean): void {
  let state = HOLD_UP;
  onFrame((buttons) => {
    const step = stepHold(state, active() && (buttons & button) !== 0);
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
