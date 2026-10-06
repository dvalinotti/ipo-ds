import { expect, test } from "bun:test";
import { buildLibrary } from "../app/library/library.ts";
import {
  crumbOf, currentView, focusOf, headerOf, initialExplorer, lcdLine, legendOf, reduceExplorer, rowCells, visibleRows, visibleSongIds,
  type ExplorerAction, type ExplorerState,
} from "../app/explorer/model.ts";
import { TRACKS } from "./fixtures/tracks.ts";

const library = buildLibrary(TRACKS);
const run = (state: ExplorerState, ...actions: ExplorerAction[]) => actions.reduce(reduceExplorer, state);
const count = (state: ExplorerState) => visibleRows(library, state).length;

test("tabs step Songs → Artists → Albums without wrapping", () => {
  let state = initialExplorer();
  state = run(state, { type: "tab", delta: -1 });
  expect(state.tab).toBe("Songs");
  state = run(state, { type: "tab", delta: 1 }, { type: "tab", delta: 1 }, { type: "tab", delta: 1 });
  expect(state.tab).toBe("Albums");
});

test("each tab remembers its drill-down and focused row", () => {
  let state = run(initialExplorer(), { type: "move", delta: 3, count: 7 });
  state = run(state, { type: "tab", delta: 1 }, { type: "move", delta: 1, count: 5 }, { type: "open", row: { kind: "artist", key: "daft punk" } });
  expect(currentView(state)).toEqual({ kind: "artist", key: "daft punk" });
  state = run(state, { type: "tab", delta: -1 });
  expect([state.tab, focusOf(state)]).toEqual(["Songs", 3]);
  state = run(state, { type: "tab", delta: 1 });
  expect(currentView(state)).toEqual({ kind: "artist", key: "daft punk" });
  state = run(state, { type: "back" });
  expect([currentView(state).kind, focusOf(state)]).toEqual(["artists", 1]);
});

test("focus is clamped to the visible rows; paging moves by a screenful", () => {
  let state = run(initialExplorer(), { type: "move", delta: -5, count: 7 });
  expect(focusOf(state)).toBe(0);
  state = run(state, { type: "move", delta: 8, count: 7 });
  expect(focusOf(state)).toBe(6);
  state = run(state, { type: "focus", index: 2, count: 7 });
  expect(focusOf(state)).toBe(2);
  expect(focusOf(run(initialExplorer(), { type: "move", delta: 1, count: 0 }))).toBe(0);
});

test("one query filters whichever tab shows, resets focus, and B clears it once no drill-down is open", () => {
  let state = run(initialExplorer(), { type: "move", delta: 4, count: 7 }, { type: "setQuery", query: "daft" });
  expect(visibleSongIds(library, state)).toEqual([1, 2, 0]);
  expect(focusOf(state)).toBe(0);
  state = run(state, { type: "tab", delta: 1 });
  expect(visibleRows(library, state)).toEqual([{ kind: "artist", key: "daft punk" }]);
  state = run(state, { type: "open", row: { kind: "artist", key: "daft punk" } }, { type: "back" });
  expect(state.query).toBe("daft");
  state = run(state, { type: "back" });
  expect(state.query).toBe("");
  expect(run(initialExplorer(), { type: "back" })).toEqual(initialExplorer());
});

test("song rows do not drill", () => {
  const state = run(initialExplorer(), { type: "open", row: { kind: "song", id: 0 } });
  expect(currentView(state)).toEqual({ kind: "songs" });
});

test("reveal jumps to the playing song in Songs, clearing a query that hides it", () => {
  let state = run(initialExplorer(), { type: "tab", delta: 1 }, { type: "setQuery", query: "gorillaz" });
  state = run(state, { type: "reveal", id: 0, library });
  expect([state.tab, state.query]).toEqual(["Songs", ""]);
  expect(visibleRows(library, state)[focusOf(state)]).toEqual({ kind: "song", id: 0 });
  const kept = run(initialExplorer(), { type: "setQuery", query: "daft" }, { type: "reveal", id: 2, library });
  expect([kept.query, focusOf(kept)]).toEqual(["daft", 1]);
  expect(run(initialExplorer(), { type: "reveal", id: 99, library })).toEqual(initialExplorer());
});

test("headers, row cells and breadcrumbs follow the view", () => {
  let state = initialExplorer();
  expect(headerOf(state)).toEqual({ left: "Song Name", right: "Artist", count: false });
  expect(rowCells(library, state, { kind: "song", id: 0 })).toEqual({ title: "One More Time", detail: "Daft Punk", count: false });
  state = run(state, { type: "tab", delta: 1 });
  expect(headerOf(state)).toEqual({ left: "Artist", right: "Songs", count: true });
  expect(rowCells(library, state, { kind: "artist", key: "daft punk" })).toEqual({ title: "Daft Punk", detail: "3", count: true });
  state = run(state, { type: "open", row: { kind: "artist", key: "daft punk" } });
  expect(headerOf(state)).toEqual({ left: "Song Name", right: "Album", count: false });
  expect(rowCells(library, state, { kind: "song", id: 1 })).toEqual({ title: "Aerodynamic", detail: "Discovery", count: false });
  expect(crumbOf(library, state)).toEqual({ root: "Artists", leaf: "Daft Punk", detail: "3 songs" });
  state = run(state, { type: "tab", delta: 1 });
  expect(headerOf(state)).toEqual({ left: "Album", right: "Artist", count: false });
  state = run(state, { type: "open", row: { kind: "album", key: "discovery\u0000daft punk" } });
  expect(headerOf(state)).toEqual({ left: "Song Name", right: "Time", lead: "#", count: false });
  expect(rowCells(library, state, { kind: "song", id: 2 })).toEqual({ title: "Digital Love", detail: "3:00", lead: "3", count: false });
  expect(crumbOf(library, state)).toEqual({ root: "Albums", leaf: "Discovery", detail: "Daft Punk · 3 songs" });
  expect(crumbOf(library, initialExplorer())).toBeNull();
  expect(count(state)).toBe(3);
});

test("legends name what each button does in this view", () => {
  const labels = (state: ExplorerState, songs = true) => legendOf(state, songs).map((item) => `${item.key} ${item.label}`);
  expect(labels(initialExplorer())).toEqual(["A Play", "X Search", "B Back", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "setQuery", query: "x" }))).toEqual(["A Play", "X Edit search", "B Clear", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "tab", delta: 1 }))).toEqual(["A Open", "X Search", "B Back", "Y Now Playing"]);
  expect(labels(run(initialExplorer(), { type: "tab", delta: 1 }, { type: "open", row: { kind: "artist", key: "queen" } }))[2]).toBe("B Artists");
  expect(labels(initialExplorer(), false)).toEqual(["X Scan again"]);
});

test("the LCD line reports availability, scanning, and the library's size and length", () => {
  expect(lcdLine(false, false, null)).toBe("Unavailable");
  expect(lcdLine(true, true, library)).toBe("Scanning…");
  expect(lcdLine(true, false, null)).toBe("0 songs");
  expect(lcdLine(true, false, buildLibrary([]))).toBe("0 songs");
  expect(lcdLine(true, false, library)).toBe("7 songs · 21 min");
  expect(lcdLine(true, false, buildLibrary([{ ...TRACKS[0]!, durationMs: 7_920_000 }]))).toBe("1 song · 2.2 hrs");
});
