import type { SimLocalTrack } from "../../runtime/hosts/sim/localmedia.ts";

const song = (file: string, title: string, artist: string, album: string, track: number, seconds: number): SimLocalTrack =>
  ({ file, title, artist, album, track, durationMs: seconds * 1000 });

/** 20 songs, 4 artists, 5 albums; one over-long title and one decomposed accent (Hoppi + U+0301). */
export const LIBRARY: SimLocalTrack[] = [
  song("dp-01.mp3", "One More Time", "Daft Punk", "Discovery", 1, 320),
  song("dp-02.mp3", "Aerodynamic", "Daft Punk", "Discovery", 2, 207),
  song("dp-03.mp3", "Digital Love", "Daft Punk", "Discovery", 3, 298),
  song("dp-04.mp3", "Harder, Better, Faster, Stronger", "Daft Punk", "Discovery", 4, 224),
  song("dp-05.mp3", "Crescendolls", "Daft Punk", "Discovery", 5, 211),
  song("dp-11.mp3", "Revolution 909", "Daft Punk", "Homework", 2, 326),
  song("dp-12.mp3", "Da Funk", "Daft Punk", "Homework", 3, 328),
  song("dp-13.mp3", "Around the World", "Daft Punk", "Homework", 7, 429),
  song("gz-01.mp3", "Feel Good Inc.", "Gorillaz", "Demon Days", 6, 221),
  song("gz-02.mp3", "DARE", "Gorillaz", "Demon Days", 11, 244),
  song("gz-03.mp3", "Kids with Guns", "Gorillaz", "Demon Days", 4, 225),
  song("gz-04.mp3", "Dirty Harry", "Gorillaz", "Demon Days", 9, 223),
  song("sr-01.mp3", "Glósóli", "Sigur Rós", "Takk...", 2, 375),
  song("sr-02.mp3", "Hoppi\u0301polla", "Sigur Rós", "Takk...", 3, 268),
  song("sr-03.mp3", "Sæglópur", "Sigur Rós", "Takk...", 5, 492),
  song("sr-04.mp3", "Gong", "Sigur Rós", "Takk...", 6, 330),
  song("qu-01.mp3", "Bohemian Rhapsody (Remastered 2011, Live at Wembley Stadium, Extended)", "Queen", "A Night at the Opera", 11, 355),
  song("qu-02.mp3", "You're My Best Friend", "Queen", "A Night at the Opera", 4, 172),
  song("qu-03.mp3", "Love of My Life", "Queen", "A Night at the Opera", 9, 219),
  song("qu-04.mp3", "Death on Two Legs", "Queen", "A Night at the Opera", 1, 223),
];
