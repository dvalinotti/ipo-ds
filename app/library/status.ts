import { LOCALMEDIA } from "@pocketjs/framework/localmedia";

/** The top screen's library line until the Explorer replaces it. */
export function libraryLine(available: boolean, scanning: boolean, count: number): string {
  if (!available) return "Music playback is unavailable on this build";
  if (scanning) return `Scanning ${LOCALMEDIA.root}…`;
  if (count === 0) return `No music found in ${LOCALMEDIA.root}`;
  return `${count} ${count === 1 ? "track" : "tracks"}`;
}
