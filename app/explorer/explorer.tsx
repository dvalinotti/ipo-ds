// The top screen: Toolbar, search strip / breadcrumb, column header, the
// library list (app-owned focus over a pool of recycled rows) and the footer legend.
// Model logic lives in model.ts; this file renders it and maps buttons.
import { createComputed, createEffect, createMemo, createSignal, on, Show, untrack, type Accessor } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
import { onAnalogRows, onRepeat, onTapOrHold } from "../input.ts";
import { SHOULDERS_HELD, stepShoulders } from "../input-timing.ts";
import { currentId } from "../player/reducer.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
import { StatePanel } from "../theme/parts/panels.tsx";
import { Breadcrumb, FooterGels, FooterLegend, SearchStrip, type TouchLegendItem } from "../theme/parts/strips.tsx";
import { RecycledList } from "./recycled-list.tsx";
import { nearestTop } from "./window.ts";
import { settled } from "../reactive.ts";
import { Toolbar } from "../theme/parts/toolbar.tsx";
import type { Layout, RowKind } from "../theme/theme.ts";
import {
  crumbOfView, currentView, focusOf, headerOfView, initialExplorer, lcdLine, legendOf, panelOf, reduceExplorer, rowCellsIn, rowsKey, touchLegendOf, viewKey,
  visibleRows, songIds, type ExplorerAction, type ExplorerState,
} from "./model.ts";
import type { LegendItem } from "../theme/parts/strips.tsx";

export interface ExplorerStore {
  state: Accessor<ExplorerState>;
  dispatch(action: ExplorerAction): void;
  /** The list's first visible row per view (viewKey), written as an Explorer scrolls and read when one mounts, so
   * a swap or a keyboard round trip lands where the list was. Not reactive: nothing renders from it. */
  scrollRow: Map<string, number>;
}

export function createExplorerStore(): ExplorerStore {
  const [state, setState] = createSignal(initialExplorer());
  return { state, dispatch: (action) => setState((current) => reduceExplorer(current, action)), scrollRow: new Map() };
}

const ROW_PX = 21;
/** List body height with no strips: 240 − toolbar 35 − header 16 − footer 21. */
const BODY_PX = 168;

export const UNAVAILABLE = "Music playback is unavailable on this build";
export const READ_ERROR = "Could not read the music library";

export function Explorer(props: { layout: Layout; session: Session; store: ExplorerStore; searching: () => boolean; openSearch: () => void }) {
  // The layout is constant for a mount (the shell remounts the Explorer when it changes sides), so the
  // handlers below are registered once for the layout that owns them: the d-pad, the circle pad and A
  // belong to the wide (top-screen) list; narrow (the touch screen) leaves them to the deck.
  const wide = props.layout === "wide";
  const state = props.store.state;
  const dispatch = props.store.dispatch;
  const library = props.session.library;
  const active = () => !props.searching();

  // The rows depend on the library, view and query, not on focus: moving focus must not rebuild them.
  // Every press writes the state; the values below are settled (see settled()), so a write only
  // reaches the screen through the ones that actually changed.
  const key = settled(() => rowsKey(state()));
  const rows = createMemo(() => {
    key();
    const lib = library();
    return lib ? untrack(() => visibleRows(lib, state())) : [];
  });
  // A rescan can remove the artist or album a tab is drilled into.
  createEffect(on(library, (lib) => lib && dispatch({ type: "reconcile", library: lib }), { defer: true }));
  // Focus moves replace the state object on every press; what the screen shows mostly depends on
  // the view, so these memos only change with it (and the rows only rebuild their cells then).
  const view = settled(() => currentView(state()), (a, b) => viewKey(a) === viewKey(b));
  const tab = settled(() => state().tab);
  const query = settled(() => state().query);
  const header = createMemo(() => headerOfView(view()));
  const crumb = createMemo(() => {
    const lib = library();
    return lib ? crumbOfView(lib, view()) : null;
  });
  // A plain function, not settled(): the session's poll flips readFailed in the same batch the
  // handlers below run in, and a settled value would still say "no panel" on that frame.
  const kind = () => panelOf(props.session.available, props.session.readFailed(), library());
  // The list's buttons sleep under a panel (and under the keyboard); tabs, the Y chords and X do not.
  const listActive = () => active() && kind() === null;
  const sameItems = <T extends { label: string }>(key: (item: T) => string) => (a: T[], b: T[]) => a.length === b.length && a.every((item, i) => key(item) === key(b[i]!) && item.label === b[i]!.label);
  const legend = wide ? settled<LegendItem[]>(() => legendOf(state(), kind()), sameItems((item) => item.key)) : null;
  const gels = wide ? null : settled<TouchLegendItem[]>(() => touchLegendOf(state(), kind()), sameItems((item) => item.action));
  const strips = () => (query() ? 1 : 0) + (crumb() ? 1 : 0);
  const bodyPx = () => BODY_PX - strips() * ROW_PX;
  const page = () => Math.floor(bodyPx() / ROW_PX);
  // Focus can sit past the end after the rows shrink (a rescan); clamp where it is used.
  const focus = settled(() => Math.min(focusOf(state()), Math.max(0, rows().length - 1)));
  const playingId = createMemo(() => currentId(props.session.player()));

  // --- input ---------------------------------------------------------------
  const move = (delta: number) => dispatch({ type: "move", delta, count: rows().length });
  if (wide) {
    onRepeat(BTN.UP, () => move(-1), listActive);
    onRepeat(BTN.DOWN, () => move(1), listActive);
    onRepeat(BTN.LEFT, () => move(-page()), listActive);
    onRepeat(BTN.RIGHT, () => move(page()), listActive);
    onAnalogRows(move, listActive);
  }
  // latched: a button already down when this Explorer mounts (a swap, the keyboard closing) is not a press.
  onButtonPress(BTN.CROSS, () => dispatch({ type: "back" }), { active: listActive, latched: true });
  // L / R step tabs; held with Y they skip songs (the path without ZL / ZR on an
  // Old 3DS); a Y tap alone reveals the playing song when it is released.
  // Seeded as held: a button already down at mount (Y through a swap) is ignored until released.
  let shoulders = SHOULDERS_HELD;
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
      else if (wide) {
        const lib = library();
        const id = playingId();
        if (lib && id >= 0) dispatch({ type: "reveal", id, library: lib });
      } else props.session.dispatch({ type: "cycleRepeat" }); // narrow: Y is repeat (spec §6.2)
    }
  });
  if (wide) onButtonPress(BTN.CIRCLE, () => {
    const lib = library();
    if (!lib) return;
    // This frame's own move or tab step is in state() already but not yet in the settled focus or
    // the rows memo (they catch up when the frame's batch ends): read the row from fresh state.
    const now = state();
    const list = visibleRows(lib, now);
    const row = list[Math.min(focusOf(now), list.length - 1)];
    if (!row) return;
    if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: songIds(list), startId: row.id });
    else dispatch({ type: "open", row });
  }, { active: listActive, latched: true });
  // X: wide, a tap searches; narrow, it toggles shuffle (the touch footer searches). Over the empty-library
  // panel a tap scans again in both layouts; the read-error panel asks for a hold. A 1 s hold always rescans.
  const tapX = () => {
    const panel = kind();
    if (panel === null) {
      if (wide) props.openSearch();
      else props.session.dispatch({ type: "toggleShuffle" });
    } else if (panel === "empty") props.session.rescan();
  };
  onTapOrHold(BTN.TRIANGLE, tapX, () => props.session.rescan(), active);

  // --- list ----------------------------------------------------------------
  // The first row in the window: the least scrolling that keeps the focused row visible.
  let previousTop = props.store.scrollRow.get(viewKey(currentView(untrack(state)))) ?? 0;
  const top = settled(() => (previousTop = nearestTop(previousTop, focus(), page(), rows().length)));
  // Written as it changes, not on cleanup: on a swap the new Explorer can mount before the old one is disposed.
  createComputed(() => {
    if (rows().length > 0) props.store.scrollRow.set(viewKey(view()), top());
  });
  const thumb = createMemo(() => {
    const content = rows().length * ROW_PX;
    const view = bodyPx();
    if (content <= view) return null;
    const height = Math.max(16, Math.round((view * view) / content));
    const offset = top() * ROW_PX;
    return { top: Math.round((offset / (content - view)) * (view - height)), height };
  });
  // List rows keep their stripe; the focused row is drawn by one overlay row on top of them, so a
  // focus move restyles nothing in the list (it moves the overlay and rebinds its three texts).
  const kindAt = (index: number): RowKind => (index % 2 === 0 ? "odd" : "even");
  const cellsAt = (index: number) => {
    const r = rows()[index];
    const lib = library();
    return r && lib ? rowCellsIn(lib, view(), r) : { title: "", detail: "", count: false };
  };
  const isPlaying = (index: number) => {
    const r = rows()[index];
    return r?.kind === "song" && r.id === playingId();
  };
  const focusCells = createMemo(() => cellsAt(focus()));

  const panel = () => {
    switch (kind()) {
      case "unavailable": return { title: UNAVAILABLE, lines: ["This build has no media.local module."] };
      case "readError": return { title: READ_ERROR, lines: [["Press and hold", "X", "to scan again."] as const] };
      case "scanning": return { title: "Scanning your music…", lines: ["sdmc:/music/"] };
      case "empty": return { title: "No music found", lines: ["Copy .mp3 files to the /music folder on your SD card,", ["then press", "X", "to scan again."] as const] };
      default: return null;
    }
  };

  return (
    <View class={AQUA.topScreen}>
      <Toolbar title="iPoDS" line={lcdLine(props.session.available, props.session.scanning(), library())} active={tab()} layout={props.layout} />
      <Show when={panel()} fallback={
        <>
          <Show when={query()}>
            <SearchStrip query={query()} count={rows().length} />
          </Show>
          <Show when={crumb()}>{(c) => <Breadcrumb root={c().root} leaf={c().leaf} detail={c().detail} />}</Show>
          <ColumnHeader layout={props.layout} left={header().left} right={header().right} lead={header().lead} count={header().count} />
          <View class={AQUA.listBody}>
            <Show when={rows().length > 0} fallback={<StatePanel title="No matches" lines={[`Nothing here matches "${query()}"`]} />}>
            <RecycledList
              count={rows().length}
              rowHeight={ROW_PX}
              rows={page()}
              top={top()}
              slot={(index, slot) => {
                // Rows can shrink under a slot (search, rescan) before the pool does; every read is null-safe.
                const row = () => rows()[index()];
                const cells = createMemo(() => cellsAt(index()));
                return (
                  <Show when={row()}>
                    <ListRow
                      layout={props.layout}
                      kind={kindAt(slot)}
                      title={cells().title}
                      detail={cells().detail}
                      lead={cells().lead}
                      count={cells().count}
                      playing={isPlaying(index())}
                    />
                  </Show>
                );
              }}
            />
            <View class="absolute left-[0] top-[0] w-full h-[21]" style={{ translateY: (focus() - top()) * ROW_PX }}>
              <ListRow
                layout={props.layout}
                kind="selected"
                title={focusCells().title}
                detail={focusCells().detail}
                lead={focusCells().lead}
                count={focusCells().count}
                playing={isPlaying(focus())}
                marquee
              />
            </View>
            <Show when={thumb()}>{(t) => <Scrollbar thumbTop={t().top} thumbHeight={t().height} />}</Show>
            </Show>
          </View>
        </>
      }>
        {(p) => <StatePanel title={p().title} lines={p().lines} />}
      </Show>
      {wide ? <FooterLegend items={legend!()} /> : <FooterGels items={gels!()} />}
    </View>
  );
}
