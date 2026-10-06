import { expect, test } from "bun:test";
import type { LocalTrack } from "@pocketjs/framework/localmedia";
import { buildLibrary, rows } from "../app/library/library.ts";
import { normalize } from "../app/library/normalize.ts";
import { libraryLine } from "../app/library/status.ts";
import { TRACKS } from "./fixtures/tracks.ts";

const ids = (list: ReturnType<typeof rows>) => list.map((row) => (row.kind === "song" ? row.id : row.key));

test("normalize folds case, Latin accents, ligatures and whitespace", () => {
  expect(normalize("Beyoncé")).toBe("beyonce");
  expect(normalize("  Sigur   Rós ")).toBe("sigur ros");
  expect(normalize("Ærøskøbing")).toBe("aeroskobing");
  expect(normalize("Straße")).toBe("strasse");
  expect(normalize("MOTÖRHEAD")).toBe("motorhead");
  expect(normalize("Łódź Œuvre")).toBe("lodz oeuvre");
});

test("songs sort by folded title", () => {
  const library = buildLibrary(TRACKS);
  expect(library.songs).toEqual([1, 5, 2, 4, 3, 0, 6]);
  expect(library.tracks.get(3)!.title).toBe("Hoppípolla");
});

test("artists sort by folded name and list their songs by album, track, title", () => {
  const library = buildLibrary(TRACKS);
  expect(library.artists.map((a) => a.name)).toEqual(["Beyoncé", "Daft Punk", "Queen", "Sigur Rós", "Unknown Artist"]);
  expect(library.artists[1]).toEqual({ key: "daft punk", name: "Daft Punk", trackIds: [0, 1, 2] });
});

test("albums with the same name by different artists stay separate", () => {
  const library = buildLibrary(TRACKS);
  const hits = library.albums.filter((a) => a.name === "Greatest Hits");
  expect(hits.map((a) => a.artist)).toEqual(["Beyoncé", "Queen"]);
  expect(hits.map((a) => a.trackIds)).toEqual([[4], [5]]);
  expect(library.albums.map((a) => a.name)).toEqual(["Discovery", "Greatest Hits", "Greatest Hits", "Takk...", "Unknown Album"]);
});

test("album songs follow track number, unknown numbers last, then title", () => {
  const t = (id: number, title: string, track: number): LocalTrack =>
    ({ id, file: `${id}.mp3`, title, artist: "X", album: "A", track, durationMs: 1, hasArt: false });
  const library = buildLibrary([t(10, "B", 0), t(11, "A", 2), t(12, "C", 1), t(13, "A", 0)]);
  expect(library.albums[0]!.trackIds).toEqual([12, 11, 13, 10]);
});

test("blank tag strings fall back like missing tags", () => {
  const library = buildLibrary([{ id: 0, file: "demo take.mp3", title: " ", artist: "", album: "  ", track: 0, durationMs: 1, hasArt: false }]);
  expect(library.tracks.get(0)).toMatchObject({ title: "demo take", artist: "Unknown Artist", album: "Unknown Album" });
  expect(library.artists[0]!.name).toBe("Unknown Artist");
});

test("search folds accents and case, and a blank query shows everything", () => {
  const library = buildLibrary(TRACKS);
  expect(ids(rows(library, { kind: "songs" }, ""))).toEqual([1, 5, 2, 4, 3, 0, 6]);
  expect(ids(rows(library, { kind: "songs" }, "   "))).toEqual([1, 5, 2, 4, 3, 0, 6]);
  expect(ids(rows(library, { kind: "songs" }, "beyonce"))).toEqual([4]);
  expect(ids(rows(library, { kind: "songs" }, "DAFT"))).toEqual([1, 2, 0]);
  expect(ids(rows(library, { kind: "songs" }, "hoppipolla"))).toEqual([3]);
  expect(ids(rows(library, { kind: "artists" }, "rós"))).toEqual(["sigur ros"]);
  expect(ids(rows(library, { kind: "albums" }, "greatest"))).toEqual(["greatest hits\u0000beyonce", "greatest hits\u0000queen"]);
  expect(ids(rows(library, { kind: "songs" }, "zzz"))).toEqual([]);
});

test("drill-down views list the artist's or album's songs and filter them", () => {
  const library = buildLibrary(TRACKS);
  expect(ids(rows(library, { kind: "artist", key: "daft punk" }, ""))).toEqual([0, 1, 2]);
  expect(ids(rows(library, { kind: "album", key: "discovery\u0000daft punk" }, "love"))).toEqual([2]);
  expect(rows(library, { kind: "artist", key: "nobody" }, "")).toEqual([]);
});

test("the library status line covers no host, scanning, empty and counted", () => {
  expect(libraryLine(false, false, 0)).toBe("Music playback is unavailable on this build");
  expect(libraryLine(true, true, 0)).toBe("Scanning sdmc:/music/…");
  expect(libraryLine(true, false, 0)).toBe("No music found in sdmc:/music/");
  expect(libraryLine(true, false, 1)).toBe("1 track");
  expect(libraryLine(true, false, 312)).toBe("312 tracks");
});

test("normalize strips decomposed accents and folds the rest of Latin Extended-A", () => {
  expect(normalize("Hoppípolla")).toBe("hoppipolla");
  expect(normalize("İstanbul")).toBe("istanbul");
  expect(normalize("Ĳsselmeer")).toBe("ijsselmeer");
  const library = buildLibrary([{ id: 0, file: "h.mp3", title: "Hoppípolla", artist: "Sigur Rós", album: "Takk", track: 1, durationMs: 1, hasArt: false }]);
  expect(ids(rows(library, { kind: "songs" }, "hoppipolla"))).toEqual([0]);
  expect(ids(rows(library, { kind: "artists" }, "sigur ros"))).toEqual(["sigur ros"]);
});
