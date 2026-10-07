// iPoDS's Aqua / iTunes 4 theme: every slot is a complete class literal so the
// build can compile it; state variants pick between literals.
import type { GelClasses, IconInk, IconName, PlaceholderHue, Theme, TransportKind } from "./theme.ts";


const HUES: readonly PlaceholderHue[] = [
  { name: "blue", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#12204a] to-[#5aa7f0]", hubText: "text-xs font-bold text-[#12204a]" },
  { name: "teal", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#0f3b3a] to-[#5fc4b4]", hubText: "text-xs font-bold text-[#0f3b3a]" },
  { name: "plum", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#3a1640] to-[#c98ad8]", hubText: "text-xs font-bold text-[#3a1640]" },
  { name: "amber", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#4a2a08] to-[#f0b860]", hubText: "text-xs font-bold text-[#4a2a08]" },
  { name: "green", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#173a14] to-[#86cf72]", hubText: "text-xs font-bold text-[#173a14]" },
  { name: "graphite", cover: "relative w-[92] h-[92] items-center justify-center overflow-hidden bg-gradient-to-b from-[#2b2b2b] to-[#a8a8a8]", hubText: "text-xs font-bold text-[#2b2b2b]" },
];

const ICONS: Record<IconName, Record<IconInk, string>> = {
  shuffle: { white: "theme/icons/shuffle-white.svg", ink: "theme/icons/shuffle-ink.svg", blue: "theme/icons/shuffle-blue.svg" },
  repeat: { white: "theme/icons/repeat-white.svg", ink: "theme/icons/repeat-ink.svg", blue: "theme/icons/repeat-blue.svg" },
  prev: { white: "theme/icons/prev-white.svg", ink: "theme/icons/prev-ink.svg", blue: "theme/icons/prev-ink.svg" },
  next: { white: "theme/icons/next-white.svg", ink: "theme/icons/next-ink.svg", blue: "theme/icons/next-ink.svg" },
  play: { white: "theme/icons/play-white.svg", ink: "theme/icons/play-ink.svg", blue: "theme/icons/play-ink.svg" },
  pause: { white: "theme/icons/pause-white.svg", ink: "theme/icons/pause-ink.svg", blue: "theme/icons/pause-ink.svg" },
};

const LARGE_ICONS: Record<"play" | "pause", Record<"white" | "ink", string>> = {
  play: { white: "theme/icons/play-lg-white.svg", ink: "theme/icons/play-lg-ink.svg" },
  pause: { white: "theme/icons/pause-lg-white.svg", ink: "theme/icons/pause-lg-ink.svg" },
};

// Gels (docs/superpowers/specs/2026-10-07-aqua-gels-design.md §3): a body darkest
// under its gloss and glowing toward the bottom, with a gloss box over the top.
// Blue is sampled from the reference button; grey is the same build in graphite.
// A disabled button keeps its grey body at 45 % opacity but draws no gloss and no
// shadow: opacity applies per primitive, so they would show through.
// White labels sit on the tabs and badges, so their gloss is short: the top
// third of a tab and a 2 px band on a badge (spec §8), which keeps the label legible.
const TAB_BLUE: GelClasses = {
  body: "relative h-[18] px-[8] items-center justify-center bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6]",
  gloss: "absolute left-[0] right-[0] top-[0] h-[6] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const TAB_GREY: GelClasses = {
  body: "relative h-[18] px-[8] items-center justify-center bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4]",
  gloss: "absolute left-[0] right-[0] top-[0] h-[6] bg-gradient-to-b from-[#fdfdfd] via-[#ececec] to-[#d6d6d6]",
};
const BADGE_BLUE: GelClasses = {
  body: "relative w-[14] h-[14] rounded-[7] items-center justify-center bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6] border border-[#2b4f8c]",
  gloss: "absolute left-[3] top-[3] w-[8] h-[2] rounded-[1] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const BADGE_GREY: GelClasses = {
  body: "relative w-[14] h-[14] rounded-[7] items-center justify-center bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "absolute left-[3] top-[3] w-[8] h-[2] rounded-[1] bg-gradient-to-b from-[#fdfdfd] via-[#ececec] to-[#d6d6d6]",
};
const SCROLL_THUMB: GelClasses = {
  body: "absolute left-[1] w-[11] rounded-[6] bg-gradient-to-r from-[#4a80da] via-[#4a80da] to-[#c8daf6] border border-[#2b4f8c]",
  gloss: "absolute left-[2] top-[3] bottom-[3] w-[4] rounded-[2] bg-gradient-to-r from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const PROGRESS_FILL: GelClasses = {
  body: "relative h-[10] rounded-[5] bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6]",
  gloss: "absolute left-[3] right-[3] top-[1] h-[4] rounded-[2] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const SEEK_KNOB: GelClasses = {
  body: "absolute top-[-6] w-[18] h-[18] rounded-[9] bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6] border border-[#2b4f8c]",
  gloss: "absolute left-[2] top-[3] w-[14] h-[8] rounded-[4] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const PLAY_BLUE: GelClasses = {
  body: "relative w-[64] h-[64] rounded-[32] items-center justify-center shadow bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6] border border-[#2b4f8c]",
  gloss: "absolute left-[10] top-[3] w-[44] h-[30] rounded-[15] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const PLAY_OFF: GelClasses = {
  body: "relative w-[64] h-[64] rounded-[32] items-center justify-center opacity-45 bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "hidden",
};
const SKIP_GREY: GelClasses = {
  body: "relative w-[42] h-[42] rounded-[21] items-center justify-center bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "absolute left-[6] top-[3] w-[30] h-[20] rounded-[10] bg-gradient-to-b from-[#fdfdfd] via-[#ececec] to-[#d6d6d6]",
};
const SKIP_OFF: GelClasses = {
  body: "relative w-[42] h-[42] rounded-[21] items-center justify-center opacity-45 bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "hidden",
};
const MODE_BLUE: GelClasses = {
  body: "relative w-[34] h-[34] rounded-[17] items-center justify-center bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6] border border-[#2b4f8c]",
  gloss: "absolute left-[5] top-[3] w-[24] h-[16] rounded-[8] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
const MODE_GREY: GelClasses = {
  body: "relative w-[34] h-[34] rounded-[17] items-center justify-center bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "absolute left-[5] top-[3] w-[24] h-[16] rounded-[8] bg-gradient-to-b from-[#fdfdfd] via-[#ececec] to-[#d6d6d6]",
};
const MODE_OFF: GelClasses = {
  body: "relative w-[34] h-[34] rounded-[17] items-center justify-center opacity-45 bg-gradient-to-b from-[#c4c4c4] via-[#c4c4c4] to-[#f4f4f4] border border-[#6e6e6e]",
  gloss: "hidden",
};

export const AQUA: Theme = {
  name: "aqua",
  osk: "classic",
  oskKeyHeight: 45,

  topScreen: "w-full h-full flex-col bg-[#c2c2c2] overflow-hidden",
  bottomScreen: "relative w-full h-full bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8] overflow-hidden",

  toolbar: "w-full h-[34] shrink-0 flex-row items-center px-[6] gap-[6] bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8]",
  toolbarRule: "w-full h-[1] shrink-0 bg-[#6e6e6e]",
  light: (color) =>
    color === "red" ? "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#ffb3a8] to-[#e0443a]"
    : color === "amber" ? "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#ffe2a1] to-[#e3a21a]"
    : "w-[10] h-[10] rounded-[5] border border-[#00000059] bg-gradient-to-b from-[#c9f0a8] to-[#4fa83a]",
  lcdStatus: "w-[144] h-[30] shrink-0 ml-[4] px-[6] flex-col items-center justify-center overflow-hidden rounded-[6] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  lcdTitle: "w-full leading-[13] text-center text-xs font-bold text-[#2b2b2b]",
  lcdLine: "w-full leading-[13] text-center text-xs text-[#4a4c3f]",
  tabs: "flex-row items-center ml-[6] gap-[3]",
  tabGroup: "relative h-[20] p-[1] flex-row items-center rounded-[4] bg-[#7d7d7d] overflow-hidden",
  tabFrame: "absolute left-[0] top-[0] w-full h-full rounded-[4] border border-[#7d7d7d]",
  tab: (active) => (active ? TAB_BLUE : TAB_GREY),
  tabDivider: "w-[1] h-[18] bg-[#7d7d7d]",
  tabText: (active) => (active ? "text-xs text-white" : "text-xs text-[#2b2b2b]"),
  tabTextShadow: "absolute left-[0] top-[1] text-xs text-[#1d3f8099]",
  hint: "text-xs text-[#4a4a4a]",

  header: "w-full h-[15] shrink-0 flex-row items-center bg-gradient-to-b from-[#ffffff] via-[#e7e7e7] to-[#d4d4d4]",
  headerRule: "w-full h-[1] shrink-0 bg-[#a5a5a5]",
  headerLeft: (sorted) => sorted
    ? "w-[242] h-[15] flex-row items-center bg-gradient-to-b from-[#d9ebff] via-[#a9cdf6] to-[#8fbbef]"
    : "w-[242] h-[15] flex-row items-center",
  headerLead: "w-[22] h-[15] items-center justify-center",
  headerRight: "flex-1 h-[15] pl-[6] flex-row items-center",
  headerRightEnd: "flex-1 h-[15] pr-[22] flex-row items-center justify-end",
  sortIcon: "theme/icons/sort-up-ink.svg",
  headerText: "text-xs text-[#2b2b2b]",

  listBody: "w-full flex-1 flex-col relative bg-white overflow-hidden",
  row: (kind) =>
    kind === "selected" ? "w-full h-[21] flex-row items-center bg-[#3875d7]"
    : kind === "odd" ? "w-full h-[21] flex-row items-center bg-[#edf3fe]"
    : "w-full h-[21] flex-row items-center bg-white",
  rowLead: "w-[22] h-[21] items-center justify-center",
  rowTitleCell: "w-[214] h-[21] mr-[6] flex-col justify-center overflow-hidden",
  rowDetailCell: "flex-1 h-[21] pl-[6] flex-col justify-center overflow-hidden",
  rowWideCell: "flex-1 h-[21] flex-col justify-center overflow-hidden",
  rowCountCell: "w-[60] h-[21] pr-[22] flex-col items-end justify-center",
  rowTitle: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-black"),
  rowDetail: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-[#2b2b2b]"),
  rowMuted: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-[#6a6a6a]"),
  rowMarker: (kind) => (kind === "selected" ? "text-xs text-white" : "text-xs text-[#1c6fd1]"),

  scrollTrack: "absolute right-[0] top-[0] w-[14] h-full bg-gradient-to-r from-[#d4d4d4] via-[#f1f1f1] to-[#d4d4d4]",
  scrollThumb: SCROLL_THUMB,

  footer: "w-full h-[20] shrink-0 flex-row items-center px-[8] gap-[12] bg-gradient-to-b from-[#d6d6d6] via-[#c2c2c2] to-[#a8a8a8]",
  footerRule: "w-full h-[1] shrink-0 bg-[#6e6e6e]",
  footerItem: "flex-row items-center gap-[4]",
  footerText: "text-xs text-[#2b2b2b]",
  badge: (primary) => (primary ? BADGE_BLUE : BADGE_GREY),
  badgeText: (primary) => (primary ? "text-xs font-bold text-white" : "text-xs font-bold text-[#2b2b2b]"),
  badgeTextShadow: "absolute left-[0] top-[1] text-xs font-bold text-[#1d3f8099]",

  strip: "w-full h-[20] shrink-0 flex-row items-center px-[6] gap-[6] bg-gradient-to-b from-[#d6d6d6] to-[#c2c2c2]",
  stripRule: "w-full h-[1] shrink-0 bg-[#8a8a8a]",
  searchField: "flex-1 h-[16] flex-row items-center px-[8] gap-[4] overflow-hidden rounded-[8] border border-[#7d7d7d] bg-white",
  searchLabel: "text-xs text-[#6a6a6a]",
  searchQuery: "text-xs text-black",
  searchCount: "shrink-0 text-xs text-[#2b2b2b]",
  keyboardField: "w-full h-[20] flex-row items-center px-[10] overflow-hidden rounded-[10] border border-[#7d7d7d] bg-white",
  keyboardFieldText: "text-sm text-black",
  crumb: "w-full h-[20] shrink-0 flex-row items-center px-[8] gap-[6] bg-gradient-to-b from-[#e9ecd5] to-[#d9ddc0]",
  crumbRule: "w-full h-[1] shrink-0 bg-[#8a8c78]",
  crumbLink: "text-xs text-[#1c6fd1]",
  crumbText: "text-xs text-[#2b2b2b]",
  crumbLeaf: "flex-1 overflow-hidden",
  crumbDetail: "shrink-0 text-xs text-[#2b2b2b]",

  panel: "w-full flex-1 flex-col items-center justify-center gap-[4] bg-white",
  panelTitle: "text-sm font-bold text-[#2b2b2b]",
  panelText: "text-xs text-[#4a4a4a]",
  panelKeyLine: "flex-row items-center gap-[4]",
  progressTrack: "w-[220] h-[12] mt-[6] p-[1] rounded-[6] border border-[#2b4f8c] bg-white overflow-hidden",
  progressFill: PROGRESS_FILL,

  artFrame: "absolute left-[10] top-[10] w-[100] h-[100] items-center justify-center border border-[#7d7d7d] bg-white",
  artLoading: "w-[98] h-[98] items-center justify-center bg-gradient-to-b from-[#f7f7f7] to-[#d8d8d8]",
  ring: (size) => (size === "outer"
    ? "absolute left-[8] top-[8] w-[76] h-[76] rounded-[38] border-[2] border-[#f4f6e6] opacity-85"
    : "absolute left-[22] top-[22] w-[48] h-[48] rounded-[24] border-[2] border-[#f4f6e6] opacity-85"),
  hub: "w-[32] h-[32] rounded-[16] items-center justify-center bg-[#f4f6e6]",
  infoLcd: "absolute left-[118] top-[10] w-[192] h-[100] flex-col items-center px-[8] pt-[6] overflow-hidden rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  infoTitle: "w-full text-center text-base font-bold text-[#1f2018]",
  infoArtist: "w-full text-center text-xs text-[#3c3e31] mt-[3]",
  infoAlbum: "w-full text-center text-xs text-[#6a6c5a] mt-[1]",
  infoStatus: "flex-row items-center gap-[6] mt-[8]",
  infoStatusText: "text-xs text-[#3c3e31]",
  infoNote: "w-full text-center text-xs text-[#3c3e31]",
  infoAlert: "w-full text-center text-xs font-bold text-[#b0281c]",
  infoFlagText: "text-xs font-bold text-[#1c6fd1]",

  seekCapsule: "absolute left-[10] top-[120] w-[300] h-[30] flex-row items-center px-[8] gap-[8] rounded-[15] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",
  seekTime: "w-[34] text-xs font-bold text-[#1f2018]",
  seekTimeRight: "w-[34] text-xs font-bold text-[#1f2018] text-right",
  seekTimeWide: "w-[46] text-xs font-bold text-[#1f2018]",
  seekTimeRightWide: "w-[46] text-xs font-bold text-[#1f2018] text-right",
  seekTrack: "w-[200] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
  seekTrackWide: "w-[176] h-[8] relative rounded-[4] border border-[#8a8c78] bg-[#c9cbb3]",
  seekFill: "absolute left-[1] top-[1] h-[6] rounded-[3] bg-[#4a4c3f]",
  seekKnob: SEEK_KNOB,

  transportRow: "absolute left-[10] top-[160] w-[300] h-[72] flex-row items-center justify-center gap-[10]",
  transport: (kind, on, enabled) => transportClass(kind, on, enabled),

  idlePanel: "absolute left-[10] top-[10] w-[300] h-[100] flex-col items-center justify-center gap-[4] rounded-[10] border border-[#7d7f6e] bg-gradient-to-b from-[#f4f6e6] via-[#e9ecd5] to-[#d9ddc0]",

  placeholderHues: HUES,
  icon: (name, ink) => ICONS[name][ink],
  iconLarge: (name, ink) => LARGE_ICONS[name][ink],
};

function transportClass(kind: TransportKind, on: boolean, enabled: boolean): GelClasses {
  const big = kind === "play" || kind === "pause";
  const mode = kind === "shuffle" || kind === "repeat";
  if (!enabled) return big ? PLAY_OFF : mode ? MODE_OFF : SKIP_OFF;
  if (big) return PLAY_BLUE;
  if (mode) return on ? MODE_BLUE : MODE_GREY;
  return SKIP_GREY;
}
