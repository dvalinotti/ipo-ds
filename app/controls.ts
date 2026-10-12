// The button mapping in both modes (spec §6.1): the one table the README's
// controls table must equal (tests/controls.test.ts), and the seek steps the
// wide deck's left / right use. Handlers are registered by the screen that
// owns each button; this file is the statement, not the wiring.

export interface Binding {
  button: string;
  normal: string;
  swapped: string;
}

export const BINDINGS: readonly Binding[] = [
  { button: "D-pad up / down", normal: "Move", swapped: "—" },
  { button: "Circle pad", normal: "Move", swapped: "—" },
  { button: "D-pad left / right", normal: "Page", swapped: "Seek back / forward: 5 s, then 2 s while held" },
  { button: "A", normal: "Play the song, or open the artist or album", swapped: "Play / pause" },
  { button: "B", normal: "Back; clear the search", swapped: "Back; clear the search" },
  { button: "X", normal: "Search; hold to scan the card again", swapped: "Shuffle on / off; hold to scan the card again" },
  { button: "Y", normal: "Jump to the song that is playing", swapped: "Repeat off / all / one" },
  { button: "L / R", normal: "Switch tabs", swapped: "Switch tabs" },
  { button: "Y + L / R", normal: "Previous / next song", swapped: "Previous / next song" },
  { button: "ZL / ZR", normal: "Previous / next song", swapped: "Previous / next song" },
  { button: "START", normal: "Play / pause", swapped: "Play / pause" },
  { button: "SELECT", normal: "DJ Mode on / off; hold to swap the screens", swapped: "DJ Mode on / off; hold to swap the screens" },
  { button: "L + R (hold)", normal: "Diagnostics in the Now Playing LCD", swapped: "Diagnostics in the Now Playing LCD" },
];

/** A left / right tap seeks this far; each repeat while held (every 80 ms after 300 ms) this far. */
export const SEEK_TAP_MS = 5000;
export const SEEK_REPEAT_MS = 2000;

/** Where a left / right press seeks to, or null when there is nothing to seek (no duration). */
export function seekTarget(positionMs: number, durationMs: number, direction: -1 | 1, repeat: boolean): number | null {
  if (!(durationMs > 0)) return null;
  const step = repeat ? SEEK_REPEAT_MS : SEEK_TAP_MS;
  return Math.min(durationMs, Math.max(0, positionMs + direction * step));
}

/** The README's table rows, one per binding. */
export function controlsTable(): string[] {
  return BINDINGS.map((b) => `| ${b.button} | ${b.normal} | ${b.swapped} |`);
}
