// The six approved Aqua mockup states (docs/design/aqua), rebuilt from the
// theme parts with fixture data. Gallery-only: Plan 3 composes the real screens.
import { createSignal, For, onMount } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { createOsk, Osk } from "@pocketjs/framework/osk";
import type { JSX as SolidJSX } from "solid-js";
import { AQUA } from "../theme/aqua.ts";
import { ArtFrame, InfoLcd, SeekCapsule, TransportRow } from "../theme/parts/deck.tsx";
import { ColumnHeader, ListRow, Scrollbar } from "../theme/parts/list.tsx";
import { IdlePanel, StatePanel } from "../theme/parts/panels.tsx";
import { Breadcrumb, FooterLegend, KeyboardField, SearchStrip, type LegendItem } from "../theme/parts/strips.tsx";
import { Toolbar } from "../theme/parts/toolbar.tsx";
import type { RowKind, Tab } from "../theme/theme.ts";
import type { GalleryStateName } from "./names.ts";

export interface GalleryState {
  name: GalleryStateName;
  top: () => SolidJSX.Element;
  bottom: () => SolidJSX.Element;
}

type Row = [title: string, detail: string, lead?: string];
const LIBRARY_LINE = "142 songs · 9.6 hrs";
const SONGS_LEGEND: LegendItem[] = [
  { key: "A", label: "Play", primary: true },
  { key: "X", label: "Search" },
  { key: "B", label: "Back" },
  { key: "Y", label: "Now Playing" },
];

function kindAt(i: number, selected: number): RowKind {
  return i === selected ? "selected" : i % 2 === 0 ? "odd" : "even";
}

function Top(props: {
  tab: Tab;
  line?: string;
  strip?: SolidJSX.Element;
  header?: [string, string];
  /** Label over the rows' lead column ("#" for track numbers). */
  headerLead?: string;
  rows?: readonly Row[];
  selected?: number;
  playing?: number;
  count?: boolean;
  scroll?: [number, number];
  body?: SolidJSX.Element;
  legend: readonly LegendItem[];
}) {
  return (
    <View class={AQUA.topScreen}>
      <Toolbar title="Ds Man" line={props.line ?? LIBRARY_LINE} active={props.tab} />
      {props.strip}
      {props.header ? <ColumnHeader left={props.header[0]} right={props.header[1]} lead={props.headerLead} count={props.count} /> : null}
      {props.body ?? (
        <View class={AQUA.listBody}>
          <For each={props.rows ?? []}>
            {(row, i) => (
              <ListRow
                kind={kindAt(i(), props.selected ?? -1)}
                title={row[0]}
                detail={row[1]}
                lead={row[2]}
                playing={i() === props.playing}
                count={props.count}
              />
            )}
          </For>
          {props.scroll ? <Scrollbar thumbTop={props.scroll[0]} thumbHeight={props.scroll[1]} /> : null}
        </View>
      )}
      <FooterLegend items={props.legend} />
    </View>
  );
}

function SunsetCover() {
  // Logged so tests can count how many cover trees ArtFrame builds.
  console.log("cover-built");
  return (
    <View class="relative w-[92] h-[92] overflow-hidden bg-gradient-to-b from-[#f6d27a] via-[#e8743b] to-[#5b2a6e]">
      <View class="absolute left-[26] top-[16] w-[40] h-[40] rounded-[20] bg-[#fff1c4]" />
      <View class="absolute left-[0] top-[60] w-[92] h-[32] bg-[#2b1640]" />
      <View class="absolute left-[0] top-[64] w-[92] h-[3] bg-[#e8743b]" />
      <View class="absolute left-[0] top-[71] w-[92] h-[3] bg-[#e8743b]" />
      <Text class="absolute left-[6] top-[76] text-xs font-bold text-[#fff1c4]">DISCOVERY</Text>
    </View>
  );
}

function NowPlaying(props: { album: string; title: string; artist: string; position: string; elapsed: string; remaining: string; fraction: number; playing: boolean; cover?: boolean }) {
  return (
    <View class={AQUA.bottomScreen}>
      <ArtFrame album={props.album}>{props.cover ? <SunsetCover /> : undefined}</ArtFrame>
      <InfoLcd title={props.title} artist={props.artist} album={props.album} position={props.position} shuffle repeat="all" />
      <SeekCapsule elapsed={props.elapsed} remaining={props.remaining} fraction={props.fraction} enabled />
      <TransportRow playing={props.playing} shuffle repeat="all" enabled />
    </View>
  );
}

function Idle() {
  return (
    <View class={AQUA.bottomScreen}>
      <IdlePanel />
      <SeekCapsule elapsed="--:--" remaining="--:--" fraction={0} enabled={false} />
      <TransportRow playing={false} shuffle={false} repeat="off" enabled={false} />
    </View>
  );
}

function SearchKeyboard() {
  const [query, setQuery] = createSignal("daft");
  const osk = createOsk({ value: query, setValue: setQuery });
  onMount(() => osk.open());
  return (
    <View class={AQUA.bottomScreen}>
      {/* The keyboard docks itself at the foot of the screen; the field sits in the band above it. */}
      <View class="absolute left-[8] top-[3] w-[304]">
        <KeyboardField text={osk.display("|")} />
      </View>
      <Osk osk={osk} surface="auxiliary" theme={AQUA.osk} keyHeight={AQUA.oskKeyHeight} />
    </View>
  );
}

const SONG_ROWS: Row[] = [
  ["Aerodynamic", "Daft Punk"], ["Around the World", "Daft Punk"], ["Clint Eastwood", "Gorillaz"], ["Digital Love", "Daft Punk"],
  ["Feel Good Inc.", "Gorillaz"], ["Hoppípolla", "Sigur Rós"], ["One More Time", "Daft Punk"], ["Starálfur", "Sigur Rós"],
];

export const STATES: readonly GalleryState[] = [
  {
    name: "main",
    top: () => <Top tab="Songs" header={["Song Name", "Artist"]} rows={SONG_ROWS} selected={3} playing={6} scroll={[18, 44]} legend={SONGS_LEGEND} />,
    bottom: () => <NowPlaying album="Discovery" title="One More Time" artist="Daft Punk" position="3 of 12" elapsed="1:42" remaining="-3:58" fraction={0.3} playing cover />,
  },
  {
    name: "artists",
    top: () => (
      <Top
        tab="Artists"
        header={["Artist", "Songs"]}
        rows={[["Beyoncé", "3"], ["Daft Punk", "12"], ["Gorillaz", "9"], ["Queen", "14"], ["Radiohead", "22"], ["Sigur Rós", "7"], ["The Strokes", "11"], ["Unknown Artist", "2"]]}
        selected={3}
        count
        scroll={[4, 60]}
        legend={[{ key: "A", label: "Open", primary: true }, { key: "X", label: "Search" }, { key: "B", label: "Back" }, { key: "Y", label: "Now Playing" }]}
      />
    ),
    bottom: () => <Idle />,
  },
  {
    name: "album",
    top: () => (
      <Top
        tab="Albums"
        strip={<Breadcrumb root="Albums" leaf="Discovery" detail="Daft Punk · 14 songs" />}
        header={["Song Name", "Time"]}
        headerLead="#"
        rows={[["One More Time", "5:20", "1"], ["Aerodynamic", "3:27", "2"], ["Digital Love", "4:58", "3"], ["Harder, Better, Faster, Stronger (Extended Club Mix)", "3:44", "4"], ["Crescendolls", "3:31", "5"], ["Nightvision", "1:44", "6"], ["Superheroes", "3:57", "7"]]}
        selected={1}
        scroll={[4, 52]}
        legend={[{ key: "A", label: "Play", primary: true }, { key: "X", label: "Search" }, { key: "B", label: "Albums" }, { key: "Y", label: "Now Playing" }]}
      />
    ),
    bottom: () => <NowPlaying album="Discovery" title="Aerodynamic" artist="Daft Punk" position="2 of 14" elapsed="0:12" remaining="-3:15" fraction={0.05} playing />,
  },
  {
    name: "scanning",
    top: () => <Top tab="Songs" line="Scanning…" body={<StatePanel title="Scanning your music…" lines={["sdmc:/music/ · 87 of 142 files"]} progress={0.46} />} legend={[{ key: "Y", label: "Now Playing" }]} />,
    bottom: () => <Idle />,
  },
  {
    name: "empty",
    top: () => <Top tab="Songs" line="0 songs" body={<StatePanel title="No music found" lines={["Copy .mp3 files to the /music folder on your SD card,", ["then press", "X", "to scan again."]]} />} legend={[{ key: "X", label: "Scan again", primary: true }]} />,
    bottom: () => <Idle />,
  },
  {
    // Not a mockup state: over-long strings, curly quotes and a punctuation-led
    // album, so clipping and initials stay pinned for Plan 3's real data.
    name: "stress",
    top: () => (
      <Top
        tab="Albums"
        line="Rescanning sdmc:/music/ after a card swap · 2,048 files"
        strip={
          <>
            <SearchStrip query="the masterplan live at knebworth 1996 remastered" count={1} />
            <Breadcrumb root="Albums" leaf="(What’s the Story) Morning Glory? (Remastered Deluxe Edition)" detail="Oasis · 12 songs" />
          </>
        }
        header={["Song Name", "Time"]}
        headerLead="#"
        rows={[["Don’t Look Back in Anger", "4:48", "4"], ["Wonderwall", "4:18", "3"], ["Champagne Supernova – Extended Remastered Version", "7:31", "12"]]}
        selected={1}
        playing={2}
        legend={SONGS_LEGEND}
      />
    ),
    bottom: () => (
      <NowPlaying
        album="(What’s the Story) Morning Glory? (Remastered Deluxe Edition)"
        title="Champagne Supernova – Extended Remastered Version"
        artist="Oasis featuring Paul Weller on lead guitar and backing vocals"
        position="12 of 12"
        elapsed="6:58"
        remaining="-0:33"
        fraction={1.4}
        playing
      />
    ),
  },
  {
    // Last: the open keyboard is modal and takes L/R while it is up.
    name: "search",
    top: () => (
      <Top
        tab="Songs"
        strip={<SearchStrip query="daft" count={4} />}
        header={["Song Name", "Artist"]}
        rows={[["Aerodynamic", "Daft Punk"], ["Around the World", "Daft Punk"], ["Digital Love", "Daft Punk"], ["One More Time", "Daft Punk"]]}
        selected={2}
        playing={3}
        legend={[{ key: "A", label: "Play", primary: true }, { key: "X", label: "Edit search" }, { key: "B", label: "Clear" }, { key: "Y", label: "Now Playing" }]}
      />
    ),
    bottom: () => <SearchKeyboard />,
  },
];
