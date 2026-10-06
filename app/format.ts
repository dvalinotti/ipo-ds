// Time display: "m:ss", or "h:mm:ss" once a duration reaches an hour.

const HOUR_MS = 3_600_000;

/** "m:ss" below an hour, "h:mm:ss" from an hour; NaN and negative values read as 0. */
export function formatTime(ms: number): string {
  const total = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Time left, with a leading "-": "-3:58". */
export function formatRemaining(positionMs: number, durationMs: number): string {
  return `-${formatTime(durationMs - positionMs)}`;
}

/** Whether times for this duration use the h:mm:ss form (and the wider seek time cells). */
export function needsHours(durationMs: number): boolean {
  return durationMs >= HOUR_MS;
}
