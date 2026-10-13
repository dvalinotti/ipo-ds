// The L+R diagnostics' frame time: the host's whole-frame interval over its last
// 60 frames (OP.debugStats, timingUs.frame = [mean, max] in µs), in whole ms.
// Hosts without the op, a window not yet complete, or a garbled reply show F:-.

const usable = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const usablePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(usable);

export function frameNote(raw: string | undefined): string {
  if (!raw) return "F:-";
  let frame: unknown;
  try {
    frame = (JSON.parse(raw) as { timingUs?: { frame?: unknown } } | null)?.timingUs?.frame;
  } catch {
    return "F:-";
  }
  if (!usablePair(frame)) return "F:-";
  return `F:${Math.round(frame[0] / 1000)}/${Math.round(frame[1] / 1000)}`;
}
