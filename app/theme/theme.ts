// The semantic slots every Ds Man theme fills. Slots are complete class
// literals (the build compiles only literal class strings); variants are
// functions that choose between literals. Parts read only from a Theme, so a
// second theme (v2 theme switching) is a new object, not a refactor.
export type RowKind = "odd" | "even" | "selected";
export type Tab = "Songs" | "Artists" | "Albums";
export type RepeatMode = "off" | "all" | "one";
export type TransportKind = "shuffle" | "prev" | "play" | "pause" | "next" | "repeat";
export type IconName = "shuffle" | "repeat" | "prev" | "next" | "play" | "pause";
export type IconInk = "white" | "ink" | "blue";

export interface PlaceholderHue {
  name: string;
  /** 92×92 gradient box that centres its children. */
  cover: string;
  /** Initials ink on the hub. */
  hubText: string;
}

export interface Theme {
  name: string;
  /** The framework Osk theme the search keyboard uses. */
  osk: "dark" | "light" | "classic";
  /** Key height (logical px) that lets the keyboard fill the bottom screen below the search field. */
  oskKeyHeight: number;

  topScreen: string;
  bottomScreen: string;

  toolbar: string;
  toolbarRule: string;
  light(color: "red" | "amber" | "green"): string;
  lcdStatus: string;
  lcdTitle: string;
  lcdLine: string;
  tabs: string;
  /** The bordered box that joins the tabs into one segmented control. */
  tabGroup: string;
  tab(active: boolean): string;
  /** The group's rounded border, drawn over the segments so their square corners do not cover it. */
  tabFrame: string;
  /** 1 px rule between adjacent segments. */
  tabDivider: string;
  tabText(active: boolean): string;
  hint: string;

  header: string;
  headerRule: string;
  /** First column (242 wide, holds the sort marker when sorted). */
  headerLeft(sorted: boolean): string;
  /** The header's 22 px lead column, over the rows' lead (marker / track number). */
  headerLead: string;
  headerRight: string;
  /** Right column label aligned with right-aligned counts. */
  headerRightEnd: string;
  /** Image key of the sort marker shown in a sorted header column. */
  sortIcon: string;
  headerText: string;

  listBody: string;
  row(kind: RowKind): string;
  rowLead: string;
  rowTitleCell: string;
  rowDetailCell: string;
  /** Title cell that spans the row when the second column is a right-aligned count. */
  rowWideCell: string;
  rowCountCell: string;
  rowTitle(kind: RowKind): string;
  rowDetail(kind: RowKind): string;
  rowMuted(kind: RowKind): string;
  rowMarker(kind: RowKind): string;

  scrollTrack: string;
  scrollThumb: string;

  footer: string;
  footerRule: string;
  footerItem: string;
  footerText: string;
  badge(primary: boolean): string;
  badgeText(primary: boolean): string;

  strip: string;
  stripRule: string;
  searchField: string;
  searchLabel: string;
  searchQuery: string;
  searchCount: string;
  /** The search field shown above the on-screen keyboard (bottom screen). */
  keyboardField: string;
  keyboardFieldText: string;
  crumb: string;
  crumbRule: string;
  crumbLink: string;
  crumbText: string;
  /** Holds the leaf: takes the free width and clips a long name. */
  crumbLeaf: string;
  crumbDetail: string;

  panel: string;
  panelTitle: string;
  panelText: string;
  /** A panel line that holds a key badge between two runs of text. */
  panelKeyLine: string;
  progressTrack: string;
  progressFill: string;

  artFrame: string;
  ring(size: "outer" | "inner"): string;
  hub: string;
  infoLcd: string;
  infoTitle: string;
  infoArtist: string;
  infoAlbum: string;
  infoStatus: string;
  infoStatusText: string;
  infoFlagText: string;

  seekCapsule: string;
  seekTime: string;
  seekTimeRight: string;
  seekTrack: string;
  seekFill: string;
  seekKnob: string;

  transportRow: string;
  transport(kind: TransportKind, on: boolean, enabled: boolean): string;

  idlePanel: string;

  placeholderHues: readonly PlaceholderHue[];
  /** Image key (a literal .svg path the build bakes) for an icon in an ink. */
  icon(name: IconName, ink: IconInk): string;
  /** 32×32 play / pause for the 64 px transport button. */
  iconLarge(name: "play" | "pause", ink: "white" | "ink"): string;
}
