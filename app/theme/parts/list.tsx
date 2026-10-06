// Column header, list rows and the scrollbar for the top screen's lists.
import { Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { RowKind, Theme } from "../theme.ts";

export function ColumnHeader(props: { left: string; right: string; sorted?: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().header}>
        <View class={t().headerLeft(props.sorted ?? true)}>
          <Text class={t().headerText}>{props.left}</Text>
          <Show when={props.sorted ?? true}>
            <Image class="w-[8] h-[8]" src={t().sortIcon} />
          </Show>
        </View>
        <View class={t().headerRight}>
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
              <Text class={t().rowTitle(props.kind)}>{props.title}</Text>
            </View>
            <View class={t().rowDetailCell}>
              <Text class={t().rowDetail(props.kind)}>{props.detail}</Text>
            </View>
          </>
        }
      >
        <View class={t().rowDetailCell}>
          <Text class={t().rowTitle(props.kind)}>{props.title}</Text>
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
