// Column header, list rows and the scrollbar for the top screen's lists.
import { Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { RowKind, Theme } from "../theme.ts";
import { FONT_12 } from "../fonts.ts";
import { Marquee } from "./marquee.tsx";

/** Title cell widths (px): beside a detail column, and spanning the row beside a count. */
const TITLE_PX = 214;
const WIDE_TITLE_PX = 318;

/** `lead` labels the rows' lead column ("#" over track numbers); `count` right-aligns the second label over counts. */
export function ColumnHeader(props: { left: string; right: string; lead?: string; sorted?: boolean; count?: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().header}>
        <View class={t().headerLeft(props.sorted ?? true)}>
          <View class={t().headerLead}>
            <Text class={t().headerText}>{props.lead ?? ""}</Text>
          </View>
          <Text class={t().headerText}>{props.left}</Text>
          <Show when={props.sorted ?? true}>
            <Image class="w-[8] h-[8] ml-[4]" src={t().sortIcon} />
          </Show>
        </View>
        <View class={props.count ? t().headerRightEnd : t().headerRight}>
          <Text class={t().headerText}>{props.right}</Text>
        </View>
      </View>
      <View class={t().headerRule} />
    </>
  );
}

export interface ListRowProps {
  kind: RowKind;
  title: string;
  /** Artist, time or (with `count`) a number shown right-aligned. */
  detail: string;
  /** Track number or other lead text; the ♪ marker replaces it while playing. */
  lead?: string;
  playing?: boolean;
  /** Title spans the row and `detail` is a right-aligned count (Artists / Albums views). */
  count?: boolean;
  /** Scroll a title too wide for its cell (the focused row). */
  marquee?: boolean;
  onPress?: () => void;
  theme?: Theme;
}

export function ListRow(props: ListRowProps) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().row(props.kind)} onPress={props.onPress}>
      <View class={t().rowLead}>
        <Text class={props.playing ? t().rowMarker(props.kind) : t().rowMuted(props.kind)}>{props.playing ? "♪" : props.lead ?? ""}</Text>
      </View>
      <Show
        when={props.count}
        fallback={
          <>
            <View class={t().rowTitleCell}>
              <Show when={props.marquee} fallback={<Text class={t().rowTitle(props.kind)}>{props.title}</Text>}>
                <Marquee text={props.title} class={t().rowTitle(props.kind)} slot={FONT_12} width={TITLE_PX} />
              </Show>
            </View>
            <View class={t().rowDetailCell}>
              <Text class={t().rowDetail(props.kind)}>{props.detail}</Text>
            </View>
          </>
        }
      >
        <View class={t().rowWideCell}>
          <Show when={props.marquee} fallback={<Text class={t().rowTitle(props.kind)}>{props.title}</Text>}>
            <Marquee text={props.title} class={t().rowTitle(props.kind)} slot={FONT_12} width={WIDE_TITLE_PX} />
          </Show>
        </View>
        <View class={t().rowCountCell}>
          <Text class={t().rowMuted(props.kind)}>{props.detail}</Text>
        </View>
      </Show>
    </View>
  );
}

/** Overlay for a `listBody` (which is `relative`): the track spans the body; the thumb is placed in px. */
export function Scrollbar(props: { thumbTop: number; thumbHeight: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().scrollTrack}>
      <View class={t().scrollThumb} style={{ insetT: props.thumbTop, height: props.thumbHeight }} />
    </View>
  );
}
