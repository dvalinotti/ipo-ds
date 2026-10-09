// DJ Mode's platter as numbers: where it sits on the bottom screen, how a
// finger's angle becomes a playback rate, and how far the motor turns it each
// frame. Pure (tests/platter.test.ts); app/dj/dj-mode.tsx wires it up.

/** The platter's 200×200 box on the bottom screen (logical px) and its centre. */
export const PLATTER = { x: 10, y: 20, size: 200, cx: 110, cy: 120 } as const;
/** 33⅓ RPM. */
export const MOTOR_DEG_PER_S = 200;
/** The motor's turn per 60 Hz frame. */
export const SPIN_PER_FRAME = MOTOR_DEG_PER_S / 60;
/** A finger this close to the spindle holds the record still. */
export const DEAD_ZONE_PX = 16;
/** The fastest scratch either way (LOCALMEDIA.maxScratchRate). */
export const MAX_RATE = 4;
/** A smoothed rate below this settles on 0, so a still finger sends one final 0. */
const REST = 1 / 64;

export function wrap360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** The short way round: (−180, 180]. */
export function wrapDelta(deg: number): number {
  const d = wrap360(deg);
  return d > 180 ? d - 360 : d;
}

/** The angle of (x, y) around (cx, cy) in degrees, clockwise from 12 o'clock (screen y grows down). */
export function angleAt(cx: number, cy: number, x: number, y: number): number {
  return wrap360((Math.atan2(x - cx, cy - y) * 180) / Math.PI);
}

export function inDeadZone(cx: number, cy: number, x: number, y: number): boolean {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < DEAD_ZONE_PX * DEAD_ZONE_PX;
}

/** Whether (x, y) is on the record itself, not in the corners of its square. */
export function inDisc(cx: number, cy: number, x: number, y: number): boolean {
  const dx = x - cx, dy = y - cy, r = PLATTER.size / 2;
  return dx * dx + dy * dy <= r * r;
}

/** Degrees the finger turned the platter this frame, as a multiple of normal speed. */
export function fingerRate(deltaDeg: number): number {
  return (deltaDeg * 60) / MOTOR_DEG_PER_S;
}

/** Half the previous rate plus half this frame's, clamped to ±MAX_RATE, settling on 0. */
export function smoothRate(prev: number, next: number): number {
  const rate = Math.max(-MAX_RATE, Math.min(MAX_RATE, (prev + next) / 2));
  return Math.abs(rate) < REST ? 0 : rate;
}
