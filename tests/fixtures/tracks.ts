import type { LocalTrack } from "@pocketjs/framework/localmedia";

const t = (id: number, title: string, artist: string, album: string, track: number, durationMs = 180_000): LocalTrack =>
  ({ id, file: `${id}.mp3`, title, artist, album, track, durationMs, hasArt: false });

export const TRACKS: LocalTrack[] = [
  t(0, "One More Time", "Daft Punk", "Discovery", 1),
  t(1, "Aerodynamic", "Daft Punk", "Discovery", 2),
  t(2, "Digital Love", "Daft Punk", "Discovery", 3),
  t(3, "Hoppípolla", "Sigur Rós", "Takk...", 2),
  t(4, "Greatest Hit", "Beyoncé", "Greatest Hits", 1),
  t(5, "Another Hit", "Queen", "Greatest Hits", 1),
  t(6, "untitled-demo", "Unknown Artist", "Unknown Album", 0),
];
