// Pixel geometry shared by the deck and panels. Clamping keeps a host's odd
// values (position past duration, duration 0, NaN) inside the track.
export function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Fill width / knob offset in px for `fraction` of a track whose inner width is `inner` px. */
export function trackOffset(fraction: number, inner: number): number {
  return Math.round(inner * clampFraction(fraction));
}
