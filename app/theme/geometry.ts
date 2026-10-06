// Pixel geometry shared by the deck and panels. Clamping keeps a host's odd
// values (position past duration, duration 0, NaN) inside the track.
export function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Fill width / knob offset in px for `fraction` of a track whose inner width is `inner` px. */
export function trackOffset(fraction: number, inner: number): number {
  return Math.round(inner * clampFraction(fraction));
}

/** Marquee timing, in virtual frames (60 Hz): hold, scroll at 30 px/s, hold, snap back. */
export const MARQUEE_HOLD_FRAMES = 90;
export const MARQUEE_PX_PER_FRAME = 0.5;

/** translateX (≤ 0) of a marquee `frame` frames into its cycle, for text `overflow` px wider than its box. */
export function marqueeOffset(frame: number, overflow: number): number {
  if (overflow <= 0) return 0;
  const scroll = Math.ceil(overflow / MARQUEE_PX_PER_FRAME);
  const cycle = MARQUEE_HOLD_FRAMES + scroll + MARQUEE_HOLD_FRAMES;
  const f = ((frame % cycle) + cycle) % cycle;
  if (f < MARQUEE_HOLD_FRAMES) return 0;
  if (f < MARQUEE_HOLD_FRAMES + scroll) return 0 - Math.min(overflow, Math.round((f - MARQUEE_HOLD_FRAMES) * MARQUEE_PX_PER_FRAME));
  return -overflow;
}
