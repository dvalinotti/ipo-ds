// The bottom screen's Now Playing deck: art frame, info LCD, seek capsule and
// transport buttons. Presentational only: Plan 3 wires the seek gesture and
// the handlers.
import { children, Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import type { JSX as SolidJSX } from "solid-js";
import { AQUA } from "../aqua.ts";
import { trackOffset } from "../geometry.ts";
import { placeholderArt } from "../placeholder.ts";
import type { RepeatMode, Theme, TransportKind } from "../theme.ts";

export function PlaceholderArt(props: { album: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const art = () => placeholderArt(props.album, t().placeholderHues.length);
  const hue = () => t().placeholderHues[art().hue]!;
  return (
    <View class={hue().cover}>
      <View class={t().ring("outer")} />
      <View class={t().ring("inner")} />
      <View class={t().hub}>
        <Text class={hue().hubText}>{art().initials}</Text>
      </View>
    </View>
  );
}

/** 100×100 white-matted frame. Children are the embedded cover; without them the placeholder for `album` shows. */
export function ArtFrame(props: { album: string; children?: SolidJSX.Element; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  // Resolve the children once: each read of props.children builds the tree again,
  // and a copy built only for the `when` test is never inserted, so its nodes leak.
  const cover = children(() => props.children);
  return (
    <View class={t().artFrame}>
      <Show when={cover()} fallback={<PlaceholderArt album={props.album} theme={props.theme} />}>
        {cover()}
      </Show>
    </View>
  );
}

export function InfoLcd(props: {
  title: string;
  artist: string;
  album: string;
  position: string;
  shuffle: boolean;
  repeat: RepeatMode;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().infoLcd}>
      <Text class={t().infoTitle}>{props.title}</Text>
      <Text class={t().infoArtist}>{props.artist}</Text>
      <Text class={t().infoAlbum}>{props.album}</Text>
      <View class={t().infoStatus}>
        <Text class={t().infoStatusText}>{props.position}</Text>
        <Show when={props.shuffle}>
          <Image class="w-[16] h-[16]" src={t().icon("shuffle", "blue")} />
        </Show>
        <Show when={props.repeat !== "off"}>
          <Image class="w-[16] h-[16]" src={t().icon("repeat", "blue")} />
        </Show>
        <Show when={props.repeat === "one"}>
          <Text class={t().infoFlagText}>1</Text>
        </Show>
      </View>
    </View>
  );
}

/** Inner width of the seek track (200 wide with a 1 px border); the fill starts at x 1 and the 18 px knob centres on its end. */
export const SEEK_TRACK_PX = 198;

export function SeekCapsule(props: { elapsed: string; remaining: string; fraction: number; enabled: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const x = () => trackOffset(props.fraction, SEEK_TRACK_PX);
  return (
    <View class={t().seekCapsule}>
      <Text class={t().seekTime}>{props.elapsed}</Text>
      <View class={t().seekTrack}>
        <Show when={props.enabled}>
          <View class={t().seekFill} style={{ width: x() }} />
          <View class={t().seekKnob} style={{ insetL: x() - 8 }} />
        </Show>
      </View>
      <Text class={t().seekTimeRight}>{props.remaining}</Text>
    </View>
  );
}

export function TransportButton(props: { kind: TransportKind; on?: boolean; enabled?: boolean; onPress?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const enabled = () => props.enabled ?? true;
  const big = () => props.kind === "play" || props.kind === "pause";
  // Aqua gels carry white ink: play/pause, and shuffle/repeat while on. Graphite carries dark ink.
  const ink = () => (enabled() && (big() || ((props.kind === "shuffle" || props.kind === "repeat") && props.on)) ? "white" : "ink");
  return (
    <View class={t().transport(props.kind, props.on ?? false, enabled())} onPress={enabled() ? props.onPress : undefined}>
      <Show
        when={big()}
        fallback={<Image class="w-[16] h-[16]" src={t().icon(props.kind as "shuffle" | "repeat" | "prev" | "next", ink())} />}
      >
        <Image class="w-[32] h-[32]" src={t().iconLarge(props.kind as "play" | "pause", ink() === "white" ? "white" : "ink")} />
      </Show>
    </View>
  );
}

export function TransportRow(props: {
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  enabled: boolean;
  onShuffle?: () => void;
  onPrev?: () => void;
  onToggle?: () => void;
  onNext?: () => void;
  onRepeat?: () => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().transportRow}>
      <TransportButton kind="shuffle" on={props.shuffle} enabled={props.enabled} onPress={props.onShuffle} theme={props.theme} />
      <TransportButton kind="prev" enabled={props.enabled} onPress={props.onPrev} theme={props.theme} />
      <TransportButton kind={props.playing ? "pause" : "play"} enabled={props.enabled} onPress={props.onToggle} theme={props.theme} />
      <TransportButton kind="next" enabled={props.enabled} onPress={props.onNext} theme={props.theme} />
      <TransportButton kind="repeat" on={props.repeat !== "off"} enabled={props.enabled} onPress={props.onRepeat} theme={props.theme} />
    </View>
  );
}
