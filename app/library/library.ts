import type { LocalTrack } from "@pocketjs/framework/localmedia";
import { normalize } from "./normalize.ts";

export interface Artist { key: string; name: string; trackIds: number[] }
export interface Album { key: string; name: string; artist: string; trackIds: number[] }
export interface Library {
  tracks: Map<number, LocalTrack>;
  songs: number[];
  artists: Artist[];
  albums: Album[];
  /** Lookups by key, so a row renders without a search. */
  artistByKey: Map<string, Artist>;
  albumByKey: Map<string, Album>;
}

export type View =
  | { kind: "songs" } | { kind: "artists" } | { kind: "albums" }
  | { kind: "artist"; key: string } | { kind: "album"; key: string };
export type Row = { kind: "song"; id: number } | { kind: "artist"; key: string } | { kind: "album"; key: string };

const stem = (file: string) => file.replace(/\.[^.]*$/, "");
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const albumKey = (album: string, artist: string) => `${normalize(album)}\u0000${normalize(artist)}`;
/** Track number order with unknown (0) after every numbered track. */
const trackOrder = (n: number) => (n > 0 ? n : Number.MAX_SAFE_INTEGER);

/** The host applies these fallbacks too; repeating them keeps a blank tag from any host out of the UI. */
function withFallbacks(track: LocalTrack): LocalTrack {
  return {
    ...track,
    title: track.title.trim() || stem(track.file),
    artist: track.artist.trim() || "Unknown Artist",
    album: track.album.trim() || "Unknown Album",
  };
}

export function buildLibrary(input: readonly LocalTrack[]): Library {
  const tracks = new Map<number, LocalTrack>();
  const titleKey = new Map<number, string>();
  for (const raw of input) {
    const track = withFallbacks(raw);
    tracks.set(track.id, track);
    titleKey.set(track.id, normalize(track.title));
  }
  const byTitle = (a: number, b: number) => compare(titleKey.get(a)!, titleKey.get(b)!) || a - b;
  const byAlbumTrack = (a: number, b: number) => {
    const x = tracks.get(a)!, y = tracks.get(b)!;
    return trackOrder(x.track) - trackOrder(y.track) || byTitle(a, b);
  };

  const artistMap = new Map<string, Artist>();
  const albumMap = new Map<string, Album>();
  for (const track of tracks.values()) {
    const aKey = normalize(track.artist);
    const artist = artistMap.get(aKey) ?? { key: aKey, name: track.artist, trackIds: [] };
    artist.trackIds.push(track.id);
    artistMap.set(aKey, artist);
    const bKey = albumKey(track.album, track.artist);
    const album = albumMap.get(bKey) ?? { key: bKey, name: track.album, artist: track.artist, trackIds: [] };
    album.trackIds.push(track.id);
    albumMap.set(bKey, album);
  }

  const albums = [...albumMap.values()].sort((a, b) => compare(a.key, b.key));
  for (const album of albums) album.trackIds.sort(byAlbumTrack);
  const albumRank = new Map<number, number>();
  albums.forEach((album, rank) => album.trackIds.forEach((id) => albumRank.set(id, rank)));

  const artists = [...artistMap.values()].sort((a, b) => compare(a.key, b.key));
  for (const artist of artists) artist.trackIds.sort((a, b) => albumRank.get(a)! - albumRank.get(b)! || byAlbumTrack(a, b));

  return { tracks, songs: [...tracks.keys()].sort(byTitle), artists, albums, artistByKey: artistMap, albumByKey: albumMap };
}

function songMatches(track: LocalTrack, query: string): boolean {
  return normalize(track.title).includes(query) || normalize(track.artist).includes(query) || normalize(track.album).includes(query);
}

export function rows(library: Library, view: View, query: string): Row[] {
  const q = normalize(query);
  const songs = (list: readonly number[]): Row[] =>
    list.filter((id) => q === "" || songMatches(library.tracks.get(id)!, q)).map((id) => ({ kind: "song", id }));
  switch (view.kind) {
    case "songs":
      return songs(library.songs);
    case "artists":
      return library.artists.filter((a) => q === "" || a.key.includes(q)).map((a) => ({ kind: "artist", key: a.key }));
    case "albums":
      return library.albums.filter((a) => q === "" || normalize(a.name).includes(q)).map((a) => ({ kind: "album", key: a.key }));
    case "artist":
      return songs(library.artistByKey.get(view.key)?.trackIds ?? []);
    case "album":
      return songs(library.albumByKey.get(view.key)?.trackIds ?? []);
  }
}
