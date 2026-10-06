import { LOCALMEDIA } from "@pocketjs/framework/localmedia";

/** Shown when the host's track list or status does not parse or validate. */
export const LIBRARY_READ_ERROR = "Could not read the music library";

/** The top screen's library line until the Explorer replaces it. */
export function libraryLine(available: boolean, scanning: boolean, count: number): string {
  if (!available) return "Music playback is unavailable on this build";
  if (scanning) return `Scanning ${LOCALMEDIA.root}…`;
  if (count === 0) return `No music found in ${LOCALMEDIA.root}`;
  return `${count} ${count === 1 ? "track" : "tracks"}`;
}
