// The Explorer as pure state: which tab, which drill-down, the search query
// and the focused row of every view. Selectors turn it (plus the library)
// into what the top screen shows. No Solid, no host: unit-tested directly.
import { formatTime } from "../format.ts";
import { rows, type Library, type Row, type View } from "../library/library.ts";
import type { LegendItem } from "../theme/parts/strips.tsx";
import type { Tab } from "../theme/theme.ts";

export const TAB_ORDER: readonly Tab[] = ["Songs", "Artists", "Albums"];

export interface ExplorerState {
  tab: Tab;
  /** The drill-down open in each tab (Songs never drills). */
  drill: Readonly<Record<Tab, View | null>>;
  /** Focused row per view (see viewKey); absent means row 0. */
  focus: Readonly<Record<string, number>>;
  query: string;
}

export type ExplorerAction =
  | { type: "tab"; delta: 1 | -1 }
  /** Drill into an artist or album row. Song rows play instead (the screen handles them). */
  | { type: "open"; row: Row }
  | { type: "back" }
  | { type: "setQuery"; query: string }
  /** `count` is the number of visible rows, so focus stays on a row. */
  | { type: "focus"; index: number; count: number }
  | { type: "move"; delta: number; count: number }
  | { type: "reveal"; id: number; library: Library }
  /** A rescan finished: drop drill-downs whose artist or album is gone. */
  | { type: "reconcile"; library: Library };

export function initialExplorer(): ExplorerState {
  return { tab: "Songs", drill: { Songs: null, Artists: null, Albums: null }, focus: {}, query: "" };
}

const BASE_VIEW: Readonly<Record<Tab, View>> = { Songs: { kind: "songs" }, Artists: { kind: "artists" }, Albums: { kind: "albums" } };

export function currentView(state: ExplorerState): View {
  return state.drill[state.tab] ?? BASE_VIEW[state.tab];
}

export function viewKey(view: View): string {
  return view.kind === "artist" || view.kind === "album" ? `${view.kind}:${view.key}` : view.kind;
}

export function focusOf(state: ExplorerState): number {
  return state.focus[viewKey(currentView(state))] ?? 0;
}

const clamp = (index: number, count: number) => (count <= 0 ? 0 : Math.min(count - 1, Math.max(0, index)));

function withFocus(state: ExplorerState, index: number): ExplorerState {
  return { ...state, focus: { ...state.focus, [viewKey(currentView(state))]: index } };
}

export function reduceExplorer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "tab": {
      const next = TAB_ORDER.indexOf(state.tab) + action.delta;
      return next < 0 || next >= TAB_ORDER.length ? state : { ...state, tab: TAB_ORDER[next]! };
    }
    case "open": {
      if (action.row.kind === "song") return state;
      const view: View = action.row.kind === "artist" ? { kind: "artist", key: action.row.key } : { kind: "album", key: action.row.key };
      return { ...state, drill: { ...state.drill, [state.tab]: view } };
    }
    case "back":
      if (state.drill[state.tab]) return { ...state, drill: { ...state.drill, [state.tab]: null } };
      return state.query === "" ? state : { ...state, query: "", focus: {} };
    case "setQuery":
      return action.query === state.query ? state : { ...state, query: action.query, focus: {} };
    case "focus":
      return withFocus(state, clamp(action.index, action.count));
    case "move":
      return withFocus(state, clamp(focusOf(state) + action.delta, action.count));
    case "reconcile": {
      const alive = (view: View | null): View | null => {
        if (!view) return null;
        if (view.kind === "artist") return action.library.artists.some((a) => a.key === view.key) ? view : null;
        if (view.kind === "album") return action.library.albums.some((a) => a.key === view.key) ? view : null;
        return view;
      };
      const drill = { Songs: alive(state.drill.Songs), Artists: alive(state.drill.Artists), Albums: alive(state.drill.Albums) };
      return TAB_ORDER.every((tab) => drill[tab] === state.drill[tab]) ? state : { ...state, drill };
    }
    case "reveal": {
      const songs: ExplorerState = { ...state, tab: "Songs" };
      const visible = (s: ExplorerState) => rows(action.library, BASE_VIEW.Songs, s.query).findIndex((row) => row.kind === "song" && row.id === action.id);
      let at = visible(songs);
      let next = songs;
      if (at < 0) {
        next = { ...songs, query: "", focus: {} };
        at = visible(next);
      }
      return at < 0 ? state : withFocus(next, at);
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** What the visible rows depend on (view and query, not focus): a memo key for screens. */
export function rowsKey(state: ExplorerState): string {
  return `${viewKey(currentView(state))}\u0000${state.query}`;
}

export function visibleRows(library: Library, state: ExplorerState): Row[] {
  return rows(library, currentView(state), state.query);
}

/** The song ids among `rows`, in order: the queue a song played from a view gets. */
export function songIds(rows: readonly Row[]): number[] {
  return rows.flatMap((row) => (row.kind === "song" ? [row.id] : []));
}

export interface HeaderSpec {
  left: string;
  right: string;
  /** Label over the lead column ("#" over track numbers). */
  lead?: string;
  /** Right label aligns over right-aligned counts. */
  count: boolean;
}

export function headerOf(state: ExplorerState): HeaderSpec {
  return headerOfView(currentView(state));
}

export function headerOfView(view: View): HeaderSpec {
  switch (view.kind) {
    case "songs":
      return { left: "Song Name", right: "Artist", count: false };
    case "artists":
      return { left: "Artist", right: "Songs", count: true };
    case "albums":
      return { left: "Album", right: "Artist", count: false };
    case "artist":
      return { left: "Song Name", right: "Album", count: false };
    case "album":
      return { left: "Song Name", right: "Time", lead: "#", count: false };
  }
}

export interface RowCells {
  title: string;
  detail: string;
  /** Lead column text (album track numbers). */
  lead?: string;
  /** `detail` is a right-aligned count. */
  count: boolean;
}

export function rowCells(library: Library, state: ExplorerState, row: Row): RowCells {
  return rowCellsIn(library, currentView(state), row);
}

/** A row's cells in a view: the view (not the focus) is all a row's text depends on. */
export function rowCellsIn(library: Library, view: View, row: Row): RowCells {
  if (row.kind === "artist") {
    const artist = library.artistByKey.get(row.key)!;
    return { title: artist.name, detail: String(artist.trackIds.length), count: true };
  }
  if (row.kind === "album") {
    const album = library.albumByKey.get(row.key)!;
    return { title: album.name, detail: album.artist, count: false };
  }
  const track = library.tracks.get(row.id)!;
  if (view.kind === "artist") return { title: track.title, detail: track.album, count: false };
  if (view.kind === "album") return { title: track.title, detail: formatTime(track.durationMs), lead: track.track > 0 ? String(track.track) : "", count: false };
  return { title: track.title, detail: track.artist, count: false };
}

export interface CrumbSpec {
  root: string;
  leaf: string;
  detail: string;
}

const songsLabel = (n: number) => `${n} ${n === 1 ? "song" : "songs"}`;

export function crumbOf(library: Library, state: ExplorerState): CrumbSpec | null {
  return crumbOfView(library, currentView(state));
}

export function crumbOfView(library: Library, view: View): CrumbSpec | null {
  if (view.kind === "artist") {
    const artist = library.artistByKey.get(view.key);
    return artist ? { root: "Artists", leaf: artist.name, detail: songsLabel(artist.trackIds.length) } : null;
  }
  if (view.kind === "album") {
    const album = library.albumByKey.get(view.key);
    return album ? { root: "Albums", leaf: album.name, detail: `${album.artist} · ${songsLabel(album.trackIds.length)}` } : null;
  }
  return null;
}

export function legendOf(state: ExplorerState, hasSongs: boolean): LegendItem[] {
  if (!hasSongs) return [{ key: "X", label: "Scan again", primary: true }];
  const view = currentView(state);
  const opens = view.kind === "artists" || view.kind === "albums";
  const back = state.drill[state.tab] ? (state.tab === "Artists" ? "Artists" : "Albums") : state.query ? "Clear" : "Back";
  return [
    { key: "A", label: opens ? "Open" : "Play", primary: true },
    { key: "X", label: state.query ? "Edit search" : "Search" },
    { key: "B", label: back },
    { key: "Y", label: "Now Playing" },
  ];
}

/** The toolbar LCD's second line. */
export function lcdLine(available: boolean, scanning: boolean, library: Library | null): string {
  if (!available) return "Unavailable";
  if (scanning) return "Scanning…";
  if (!library || library.tracks.size === 0) return "0 songs";
  let ms = 0;
  for (const track of library.tracks.values()) ms += track.durationMs;
  const length = ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} hrs` : `${Math.round(ms / 60_000)} min`;
  return `${songsLabel(library.tracks.size)} · ${length}`;
}
