// The top screen: Toolbar, search strip / breadcrumb, column header, the
// library list (app-owned focus over a VirtualList) and the footer legend.
// Model logic lives in model.ts; this file renders it and maps buttons.
import { createEffect, createMemo, createSignal, on, Show, untrack, type Accessor } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
import { VirtualList, type VirtualListHandle } from "@pocketjs/framework/virtual-list";
import { onAnalogRows, onRepeat, onTapOrHold } from "../input.ts";
import { SHOULDERS_UP, stepShoulders } from "../input-timing.ts";
import { currentId } from "../player/reducer.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
import { StatePanel } from "../theme/parts/panels.tsx";
import { Breadcrumb, FooterLegend, SearchStrip } from "../theme/parts/strips.tsx";
import { Toolbar } from "../theme/parts/toolbar.tsx";
import type { RowKind } from "../theme/theme.ts";
import {
  crumbOf, focusOf, headerOf, initialExplorer, lcdLine, legendOf, reduceExplorer, rowCells, rowsKey, visibleRows, visibleSongIds,
  type ExplorerAction, type ExplorerState,
} from "./model.ts";

export interface ExplorerStore {
  state: Accessor<ExplorerState>;
  dispatch(action: ExplorerAction): void;
}

export function createExplorerStore(): ExplorerStore {
  const [state, setState] = createSignal(initialExplorer());
  return { state, dispatch: (action) => setState((current) => reduceExplorer(current, action)) };
}

const ROW_PX = 21;
/** List body height with no strips: 240 − toolbar 35 − header 16 − footer 21. */
const BODY_PX = 168;

export const UNAVAILABLE = "Music playback is unavailable on this build";
export const READ_ERROR = "Could not read the music library";

export function Explorer(props: { session: Session; store: ExplorerStore; searching: () => boolean; openSearch: () => void }) {
  const state = props.store.state;
  const dispatch = props.store.dispatch;
  const library = props.session.library;
  const active = () => !props.searching();

  // The rows depend on the library, view and query, not on focus: moving focus must not rebuild them.
  const key = createMemo(() => rowsKey(state()));
  const rows = createMemo(() => {
    key();
    const lib = library();
    return lib ? untrack(() => visibleRows(lib, state())) : [];
  });
  // A rescan can remove the artist or album a tab is drilled into.
  createEffect(on(library, (lib) => lib && dispatch({ type: "reconcile", library: lib }), { defer: true }));
  const crumb = createMemo(() => {
    const lib = library();
    return lib ? crumbOf(lib, state()) : null;
  });
  const hasSongs = () => (library()?.tracks.size ?? 0) > 0;
  const strips = () => (state().query ? 1 : 0) + (crumb() ? 1 : 0);
  const bodyPx = () => BODY_PX - strips() * ROW_PX;
  const page = () => Math.floor(bodyPx() / ROW_PX);
  // Focus can sit past the end after the rows shrink (a rescan); clamp where it is used.
  const focus = () => Math.min(focusOf(state()), Math.max(0, rows().length - 1));
  const playingId = createMemo(() => currentId(props.session.player()));

  // --- input ---------------------------------------------------------------
  const move = (delta: number) => dispatch({ type: "move", delta, count: rows().length });
  onRepeat(BTN.UP, () => move(-1), active);
  onRepeat(BTN.DOWN, () => move(1), active);
  onRepeat(BTN.LEFT, () => move(-page()), active);
  onRepeat(BTN.RIGHT, () => move(page()), active);
  onAnalogRows(move, active);
  onButtonPress(BTN.CROSS, () => dispatch({ type: "back" }), { active });
  // L / R step tabs; held with Y they skip songs (the path without ZL / ZR on an
  // Old 3DS); a Y tap alone reveals the playing song when it is released.
  let shoulders = SHOULDERS_UP;
  onFrame((buttons) => {
    if (!active()) {
      shoulders = { mask: buttons, chorded: false };
      return;
    }
    const step = stepShoulders(shoulders, buttons, { y: BTN.SQUARE, l: BTN.LTRIGGER, r: BTN.RTRIGGER });
    shoulders = step.state;
    for (const event of step.events) {
      if (event === "tabPrev") dispatch({ type: "tab", delta: -1 });
      else if (event === "tabNext") dispatch({ type: "tab", delta: 1 });
      else if (event === "prev" || event === "next") props.session.dispatch({ type: event });
      else {
        const lib = library();
        const id = playingId();
        if (lib && id >= 0) dispatch({ type: "reveal", id, library: lib });
      }
    }
  });
  onButtonPress(BTN.CIRCLE, () => {
    const lib = library();
    const row = rows()[focus()];
    if (!lib || !row) return;
    if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: visibleSongIds(lib, state()), startId: row.id });
    else dispatch({ type: "open", row });
  }, { active });
  // X: tap searches (or scans again on an empty library); a 1 s hold rescans.
  onTapOrHold(BTN.TRIANGLE, () => (hasSongs() ? props.openSearch() : props.session.rescan()), () => props.session.rescan(), active);

  // --- list ----------------------------------------------------------------
  const [handle, setHandle] = createSignal<VirtualListHandle | null>(null);
  createEffect(() => {
    const list = handle();
    if (list && rows().length > 0) list.scrollToIndex(focus(), "nearest", false);
  });
  const thumb = createMemo(() => {
    const content = rows().length * ROW_PX;
    const view = bodyPx();
    if (content <= view) return null;
    const height = Math.max(16, Math.round((view * view) / content));
    const offset = handle()?.scroller.offset() ?? 0;
    return { top: Math.round((offset / (content - view)) * (view - height)), height };
  });
  const kindAt = (index: number): RowKind => (index === focus() ? "selected" : index % 2 === 0 ? "odd" : "even");

  const panel = () => {
    if (!props.session.available) return { title: UNAVAILABLE, lines: ["This build has no media.local module."] };
    if (props.session.readFailed()) return { title: READ_ERROR, lines: [["Press and hold", "X", "to scan again."] as const] };
    if (!library()) return { title: "Scanning your music…", lines: ["sdmc:/music/"] };
    if (!hasSongs()) return { title: "No music found", lines: ["Copy .mp3 files to the /music folder on your SD card,", ["then press", "X", "to scan again."] as const] };
    return null;
  };

  return (
    <View class={AQUA.topScreen}>
      <Toolbar title="Ds Man" line={lcdLine(props.session.available, props.session.scanning(), library())} active={state().tab} />
      <Show when={panel()} fallback={
        <>
          <Show when={state().query}>
            <SearchStrip query={state().query} count={rows().length} />
          </Show>
          <Show when={crumb()}>{(c) => <Breadcrumb root={c().root} leaf={c().leaf} detail={c().detail} />}</Show>
          <ColumnHeader left={headerOf(state()).left} right={headerOf(state()).right} lead={headerOf(state()).lead} count={headerOf(state()).count} />
          <View class={AQUA.listBody}>
            <Show when={rows().length > 0} fallback={<StatePanel title="No matches" lines={[`Nothing here matches "${state().query}"`]} />}>
            <VirtualList
              count={rows().length}
              rowHeight={ROW_PX}
              height={bodyPx()}
              focusRows={false}
              // The Explorer moves focus and scrolls itself; the list's own d-pad scrolling would
              // run on top of it while a direction is held (the top screen has no touch).
              inputActive={() => false}
              ref={setHandle}
              renderRow={(index) => {
                // Rows can shrink under a mounted row (search, rescan) before it unmounts; every read is null-safe.
                const row = () => rows()[index];
                const cells = () => {
                  const r = row();
                  const lib = library();
                  return r && lib ? rowCells(lib, state(), r) : { title: "", detail: "", count: false };
                };
                return (
                  <Show when={row()}>
                    <ListRow
                      kind={kindAt(index)}
                      title={cells().title}
                      detail={cells().detail}
                      lead={cells().lead}
                      count={cells().count}
                      playing={row()?.kind === "song" && (row() as { id: number }).id === playingId()}
                      marquee={index === focus()}
                    />
                  </Show>
                );
              }}
            />
            <Show when={thumb()}>{(t) => <Scrollbar thumbTop={t().top} thumbHeight={t().height} />}</Show>
            </Show>
          </View>
        </>
      }>
        {(p) => <StatePanel title={p().title} lines={p().lines} />}
      </Show>
      <FooterLegend items={legendOf(state(), hasSongs())} />
    </View>
  );
}
