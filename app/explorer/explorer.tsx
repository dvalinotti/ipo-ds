// The Explorer: Toolbar, search strip / breadcrumb, column header, the library list (app-owned
// focus over a pool of recycled rows) and the footer. Wide (the 400 px top screen) it is driven by
// the buttons; narrow (the 320 px touch screen, swapped) by a finger: a kinetic scroller, row taps,
// the scrollbar, the tabs, the footer gels, the breadcrumb and the LCD. Model logic lives in
// model.ts and the scroll arithmetic in scroll.ts; this file renders them and binds the input.
import { createComputed, createEffect, createMemo, createSignal, on, Show, untrack, type Accessor } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { createGesture } from "@pocketjs/framework/gesture";
import { createScroller, type Scroller } from "@pocketjs/framework/kinetics";
import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
import { FLING_MAX_PX_PER_S } from "../controls.ts";
import { onAnalogRows, onRepeat, onTapOrHold } from "../input.ts";
import { SHOULDERS_HELD, stepShoulders } from "../input-timing.ts";
import { currentId } from "../player/reducer.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
import { StatePanel } from "../theme/parts/panels.tsx";
import {
  Breadcrumb,
  FooterGels,
  FooterLegend,
  SearchStrip,
  type TouchAction,
  type TouchLegendItem,
} from "../theme/parts/strips.tsx";
import { RecycledList } from "./recycled-list.tsx";
import {
  bodyTopPx,
  centredOffset,
  clampVelocity,
  NARROW_W,
  offsetForThumb,
  pageOffset,
  rowAt,
  snapToRow,
  thumbFor,
  TRACK_HIT_PX,
} from "./scroll.ts";
import { nearestTop } from "./window.ts";
import { settled } from "../reactive.ts";
import { Toolbar } from "../theme/parts/toolbar.tsx";
import type { Layout, RowKind } from "../theme/theme.ts";
import {
  crumbOfView,
  currentView,
  focusOf,
  headerOfView,
  initialExplorer,
  lcdLine,
  legendOf,
  panelOf,
  reduceExplorer,
  rowCellsIn,
  rowsKey,
  touchLegendOf,
  viewKey,
  visibleRows,
  songIds,
  type ExplorerAction,
  type ExplorerState,
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

export function Explorer(props: {
  layout: Layout;
  session: Session;
  store: ExplorerStore;
  searching: () => boolean;
  openSearch: () => void;
}) {
  // The layout is constant for a mount (the shell remounts the Explorer when it changes sides), so the
  // handlers below are registered once for the layout that owns them: the d-pad, the circle pad and A
  // belong to the wide (top-screen) list; narrow (the touch screen) leaves them to the deck.
  const wide = untrack(() => props.layout) === "wide";
  const { state, dispatch } = untrack(() => props.store);
  const library = untrack(() => props.session.library);
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
  const view = settled(
    () => currentView(state()),
    (a, b) => viewKey(a) === viewKey(b),
  );
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
  const sameItems =
    <T extends { label: string }>(key: (item: T) => string) =>
    (a: T[], b: T[]) =>
      a.length === b.length && a.every((item, i) => key(item) === key(b[i]!) && item.label === b[i]!.label);
  const legend = wide
    ? settled<LegendItem[]>(
        () => legendOf(state(), kind()),
        sameItems((item) => item.key),
      )
    : null;
  const gels = wide
    ? null
    : settled<TouchLegendItem[]>(
        () => touchLegendOf(state(), kind()),
        sameItems((item) => item.action),
      );
  const strips = () => (query() ? 1 : 0) + (crumb() ? 1 : 0);
  const bodyPx = () => BODY_PX - strips() * ROW_PX;
  const page = () => Math.floor(bodyPx() / ROW_PX);
  const bodyTop = () => bodyTopPx(strips());
  /** The row count as a settled value: what the scroller's range and the thumb read, so no per-frame path touches the row memo. */
  const count = settled(() => rows().length);
  /** The largest offset: the rows past the window, in px. */
  const maxOffset = () => Math.max(0, count() - page()) * ROW_PX;
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
      else if (wide) reveal();
      else props.session.dispatch({ type: "cycleRepeat" }); // narrow: Y is repeat (spec §6.2)
    }
  });
  if (wide)
    onButtonPress(
      BTN.CIRCLE,
      () => {
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
      },
      { active: listActive, latched: true },
    );
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
  // Wide: the first row in the window is the least scrolling that keeps the focused row visible.
  // Narrow: a kinetic scroller owns a px offset under the finger; `top` is its whole-row part (settled,
  // so a frame that crosses no row boundary re-runs nothing downstream) and `shift` the remainder, read
  // by exactly two paint-only translates. The store is written by the computation on `top` (Plan 9).
  const key0 = viewKey(currentView(untrack(state)));
  let previousTop = untrack(() => props.store.scrollRow.get(key0)) ?? 0;
  let scroller: Scroller | null = null;
  /** A reveal that changed the view: the view-change effect centres the row after the batch (see reveal). */
  let pendingReveal = false;
  /** The view the narrow scroller is showing: the key its position is stored under (the key effect moves it). */
  let shownKey = key0;

  /**
   * Jump to the playing song: the Songs tab, focus on it; narrow also tweens the window to centre it.
   * Handlers run inside the frame's batch, where the settled values and effects are stale until it ends:
   * in the same view the tween starts now; when the reveal changes the view or clears the query, the
   * view-change effect centres the row after the batch, instead of restoring that view's remembered row.
   */
  const reveal = () => {
    const lib = library();
    const id = playingId();
    if (!lib || id < 0) return;
    const before = rowsKey(state());
    dispatch({ type: "reveal", id, library: lib });
    if (!scroller) return;
    if (rowsKey(state()) === before) scroller.scrollTo(centredOffset(focusOf(state()), page(), ROW_PX, maxOffset()));
    else pendingReveal = true;
  };

  const onFooter = (action: TouchAction) => {
    if (action === "search") props.openSearch();
    else if (action === "back") dispatch({ type: "back" });
    else props.session.rescan();
  };
  /** Rest on a row: a fling, or a tween a finger stopped, can leave the window mid-row. */
  const alignToRow = () => {
    const s = scroller!;
    if (s.state() !== "idle") return;
    const to = snapToRow(s.offset(), ROW_PX, maxOffset());
    if (to !== s.offset()) s.scrollTo(to, { durMs: 120 });
  };
  if (!wide) {
    // No `snap` option: with it the framework's endDrag replaces the fling with a 150–450 ms tween whose
    // first frames move up to 13 rows, so the fling state would never run and the velocity cap would mean
    // nothing. The real fling decays from the clamped release velocity; onSettle aligns the rest.
    const s = createScroller({
      max: maxOffset,
      extent: bodyPx,
      initial: previousTop * ROW_PX,
      overscroll: 0,
      onSettle: () => alignToRow(),
    });
    scroller = s;
    onFrame(() => s.step());
    // A view change (tab, drill, back) shows that view where it was left; a query change starts at the top;
    // a reveal into another view centres the revealed row instead (effects run after the batch, when the
    // settled values are fresh).
    createEffect(
      on(
        key,
        () => {
          const now = viewKey(currentView(untrack(state)));
          if (pendingReveal) {
            pendingReveal = false;
            shownKey = now; // before the scroll: the computation on `top` stores the new position under this key
            s.scrollTo(centredOffset(focus(), page(), ROW_PX, maxOffset()));
            return;
          }
          if (now === shownKey) {
            s.scrollTo(0, { immediate: true });
            return;
          }
          shownKey = now;
          s.scrollTo((props.store.scrollRow.get(now) ?? 0) * ROW_PX, { immediate: true });
        },
        { defer: true },
      ),
    );
    // A rescan that drops rows under the window: clamp at once, or the list would show nothing.
    createEffect(
      on(
        count,
        () => {
          if (s.offset() > maxOffset()) s.scrollTo(maxOffset(), { immediate: true });
        },
        { defer: true },
      ),
    );
  }
  /** What is drawn: the offset clamped to the range, so no path can draw a row above the first or past the last. */
  const pos = () => Math.min(maxOffset(), Math.max(0, scroller!.offset()));
  const top = wide
    ? settled(() => (previousTop = nearestTop(previousTop, focus(), page(), count())))
    : settled(() => Math.floor(pos() / ROW_PX));
  // Only the narrow Explorer has a sub-row remainder (and a scroller), so only it creates the memo.
  const narrowShift = () => createMemo(() => pos() - top() * ROW_PX);
  const shift = wide ? () => 0 : narrowShift();
  const thumb = createMemo(() => thumbFor(wide ? top() * ROW_PX : pos(), count() * ROW_PX, bodyPx()));
  // Written as it changes, not on cleanup: on a swap the new Explorer can mount before the old one is disposed.
  if (wide) {
    createComputed(() => {
      if (rows().length > 0) props.store.scrollRow.set(viewKey(view()), top());
    });
  } else {
    // Keyed by the view the scroller shows, not view(): on a view change `top` still holds the old view's row
    // until the key effect restores the new one, and view() would store that row under the new key.
    createComputed(
      on(top, () => {
        // A raw offset past the range is the transition itself (the new view's rows are fewer, the key effect has not
        // clamped yet): `top` is the clamped, wrong value for the view still named by shownKey.
        if (count() > 0 && scroller!.offset() <= maxOffset()) props.store.scrollRow.set(shownKey, top());
      }),
    );
  }

  // --- touch (narrow) --------------------------------------------------------
  if (!wide) {
    const s = scroller!;
    // The list body, short of the scrollbar's hit region while a thumb exists. A geometry region, not a
    // node: the rows tile the body exactly, so the row under a finger is arithmetic (rowAt), read at the
    // down edge once the fling is stopped. The framework fires onUp before onPanEnd and onTap.
    let rowDown = -1;
    createGesture({
      surface: "auxiliary",
      axis: "y",
      region: { rect: () => ({ x: 0, y: bodyTop(), w: thumb() ? NARROW_W - TRACK_HIT_PX : NARROW_W, h: bodyPx() }) },
      onDown: (c) => {
        rowDown = -1;
        if (!listActive()) return;
        s.stop();
        rowDown = rowAt(c.y, bodyTop(), s.offset(), ROW_PX, count());
      },
      onPanStart: (c) => {
        if (!listActive()) return;
        s.beginDrag();
        s.drag(-(c.dy - c.fdy)); // the travel inside the pan slop, which no onPanMove carries
      },
      onPanMove: (c) => {
        if (listActive()) s.drag(-c.fdy);
      },
      onPanEnd: (c) => {
        if (!listActive()) return;
        const v = -clampVelocity(c.vy, FLING_MAX_PX_PER_S);
        const rest = s.projectFling(v);
        if (rest >= 0 && rest <= maxOffset()) s.endDrag(v);
        else {
          // A fling that would cross an end: the framework hands its velocity to the spring even with
          // overscroll 0, so the list would pass the end and bounce (spec §5.2: it stops hard). Tween to the
          // edge row instead. The hard stop belongs upstream in PocketJS.
          s.endDrag(0);
          s.scrollTo(snapToRow(rest, ROW_PX, maxOffset()), { durMs: 150 });
        }
      },
      onUp: () => {
        if (listActive()) alignToRow();
      },
      onCancel: () => {
        if (s.state() === "tracking") s.endDrag(0);
        else alignToRow(); // a down that stopped a fling and was cancelled leaves the list off a row
      },
      onTap: () => {
        if (!listActive() || rowDown < 0) return;
        const lib = library();
        if (!lib) return;
        const list = visibleRows(lib, state());
        if (rowDown >= list.length) return;
        dispatch({ type: "focus", index: rowDown, count: list.length });
        const row = list[rowDown]!;
        if (row.kind === "song") props.session.dispatch({ type: "playFrom", ids: songIds(list), startId: row.id });
        else dispatch({ type: "open", row });
      },
    });

    // The scrollbar: a down on the thumb drags it (finger travel maps to the offset by the track ratio);
    // a tap on the track above or below it pages. Its region exists only while a thumb does, and the
    // list's region stops where it starts, so a contact is one recognizer's alone.
    let grab: number | null = null; // the finger's y inside the thumb while dragging it
    const thumbAt = (y: number) => {
      const t = thumb();
      if (!t) return null;
      const local = y - bodyTop() - t.top;
      return local >= 0 && local < t.height ? local : null;
    };
    createGesture({
      surface: "auxiliary",
      axis: "y",
      region: {
        rect: () => (thumb() ? { x: NARROW_W - TRACK_HIT_PX, y: bodyTop(), w: TRACK_HIT_PX, h: bodyPx() } : null),
      },
      onDown: (c) => {
        grab = null;
        if (!listActive()) return;
        s.stop();
        grab = thumbAt(c.y);
      },
      onPanMove: (c) => {
        const t = thumb();
        if (grab === null || !t || !listActive()) return;
        s.scrollTo(offsetForThumb(c.y - bodyTop() - grab, count() * ROW_PX, bodyPx(), t.height), { immediate: true });
      },
      onPanEnd: () => {
        grab = null;
      },
      onUp: () => {
        if (listActive()) alignToRow();
      },
      onCancel: () => {
        grab = null;
        alignToRow();
      },
      onTap: (c) => {
        const t = thumb();
        if (!t || !listActive() || thumbAt(c.y) !== null) return;
        s.scrollTo(pageOffset(s.offset(), c.y - bodyTop() < t.top ? -1 : 1, page() * ROW_PX, maxOffset()));
      },
    });
  }

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
      case "unavailable":
        return { title: UNAVAILABLE, lines: ["This build has no media.local module."] };
      case "readError":
        return { title: READ_ERROR, lines: [["Press and hold", "X", "to scan again."] as const] };
      case "scanning":
        return { title: "Scanning your music…", lines: ["sdmc:/music/"] };
      case "empty":
        return {
          title: "No music found",
          lines: [
            "Copy .mp3 files to the /music folder on your SD card,",
            ["then press", "X", "to scan again."] as const,
          ],
        };
      default:
        return null;
    }
  };

  return (
    <View class={AQUA.topScreen}>
      <Toolbar
        title="iPoDS"
        line={lcdLine(props.session.available, props.session.scanning(), library())}
        active={tab()}
        layout={props.layout}
        onSelect={wide ? undefined : (tab) => dispatch({ type: "setTab", tab })}
        onPress={wide ? undefined : reveal}
      />
      <Show
        when={panel()}
        fallback={
          <>
            <Show when={query()}>
              <SearchStrip query={query()} count={rows().length} />
            </Show>
            <Show when={crumb()}>
              {(c) => (
                <Breadcrumb
                  root={c().root}
                  leaf={c().leaf}
                  detail={c().detail}
                  onBack={wide ? undefined : () => dispatch({ type: "back" })}
                />
              )}
            </Show>
            <ColumnHeader
              layout={props.layout}
              left={header().left}
              right={header().right}
              lead={header().lead}
              count={header().count}
            />
            <View class={AQUA.listBody}>
              <Show
                when={rows().length > 0}
                fallback={<StatePanel title="No matches" lines={[`Nothing here matches "${query()}"`]} />}
              >
                <RecycledList
                  count={rows().length}
                  rowHeight={ROW_PX}
                  rows={page()}
                  top={top()}
                  shift={shift()}
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
                <View
                  class="absolute left-[0] top-[0] w-full h-[21]"
                  style={{ translateY: (focus() - top()) * ROW_PX - shift() }}
                >
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
        }
      >
        {(p) => <StatePanel title={p().title} lines={p().lines} />}
      </Show>
      {wide ? <FooterLegend items={legend!()} /> : <FooterGels items={gels!()} onPress={onFooter} />}
    </View>
  );
}
