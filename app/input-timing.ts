// Pure timing for held buttons and the circle pad, in virtual frames (60 Hz).
// app/input.ts runs these once per frame against the live button mask.

/** First repeat after 300 ms, then every 80 ms. */
export const REPEAT_DELAY_FRAMES = 18;
export const REPEAT_RATE_FRAMES = 5;
/** Hold this long for the hold action (X: rescan). */
export const HOLD_FRAMES = 60;

/** Whether a button held for `heldFrames` (0 on the down frame) fires this frame. */
export function repeatFires(heldFrames: number, delay = REPEAT_DELAY_FRAMES, rate = REPEAT_RATE_FRAMES): boolean {
  if (heldFrames === 0) return true;
  return heldFrames >= delay && (heldFrames - delay) % rate === 0;
}

export interface HoldState {
  /** Frames held so far; -1 while up. */
  held: number;
  /** The hold action already fired for this press. */
  fired: boolean;
}

export const HOLD_UP: HoldState = { held: -1, fired: false };

/** One frame of a tap-or-hold button: "hold" once at `holdFrames`, "tap" on a release before it. */
export function stepHold(state: HoldState, down: boolean, holdFrames = HOLD_FRAMES): { state: HoldState; event: "tap" | "hold" | null } {
  if (!down) return { state: HOLD_UP, event: state.held >= 0 && !state.fired ? "tap" : null };
  const held = state.held + 1;
  // held counts from 0 on the down frame, so the hold fires on the holdFrames-th frame down.
  if (!state.fired && held + 1 >= holdFrames) return { state: { held, fired: true }, event: "hold" };
  return { state: { held, fired: state.fired }, event: null };
}

/** Rows per frame at full circle-pad deflection: one row every 80 ms. */
export const ANALOG_ROWS_PER_FRAME = 1 / REPEAT_RATE_FRAMES;

/** One frame of circle-pad scrolling: accumulate deflection (-1..1), emit whole-row moves. */
export function stepAnalog(accumulated: number, deflection: number): { accumulated: number; rows: number } {
  if (deflection === 0) return { accumulated: 0, rows: 0 };
  const total = accumulated + deflection * ANALOG_ROWS_PER_FRAME;
  // Sums of fractional steps drift (ten -0.1 steps make -0.9999…); nudge before truncating.
  const rows = Math.trunc(total + Math.sign(total) * 1e-9);
  return { accumulated: total - rows, rows };
}
