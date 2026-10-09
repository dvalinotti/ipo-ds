// The bottom screen's Now Playing deck: art frame, info LCD, seek capsule and
// transport buttons (shuffle, previous, play/pause, next, repeat, and the DJ
// Mode gel). Each transport button owns its touch recognizer and calls
// `onPress`; the screen (app/now-playing) wires the seek drag and the actions.
import { children, Show } from "solid-js";
import { Image, Sprite, Text, View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { ready, ResourceImage } from "@pocketjs/framework/resource";
import type { JSX as SolidJSX } from "solid-js";
import { AQUA } from "../aqua.ts";
import { trackOffset } from "../geometry.ts";
import { placeholderArt } from "../placeholder.ts";
import type { RepeatMode, Theme, TransportKind } from "../theme.ts";
import { FONT_12, FONT_12_BOLD, FONT_16_BOLD } from "../fonts.ts";
import { Gel } from "./gel.tsx";
import { Marquee } from "./marquee.tsx";

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

/** An uploaded cover texture (128×128) drawn at the art frame's 98×98 interior. */
export function CoverImage(props: { handle: number }) {
  return <ResourceImage class="w-[98] h-[98]" state={() => ready({ handle: props.handle, width: 98, height: 98 })} fallback={() => null} />;
}

/** The art frame's interior while a cover decodes: the Aqua spinner on soft grey. */
export function CoverLoading(props: { theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().artLoading}>
      <Sprite class="w-[32] h-[32]" sprite="theme/icons/spinner-atlas.svg" />
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
  /** Replaces the status row: diagnostics, or a playback error when `alert`. */
  note?: string;
  alert?: boolean;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().infoLcd}>
      <Marquee text={props.title} class={t().infoTitle} slot={FONT_16_BOLD} width={INFO_TEXT_PX} />
      <Marquee text={props.artist} class={t().infoArtist} slot={FONT_12} width={INFO_TEXT_PX} />
      <Marquee text={props.album} class={t().infoAlbum} slot={FONT_12} width={INFO_TEXT_PX} />
      <Show
        when={!props.note}
        fallback={
          <View class={t().infoStatus}>
            <Marquee text={props.note!} class={props.alert ? t().infoAlert : t().infoNote} slot={props.alert ? FONT_12_BOLD : FONT_12} width={INFO_TEXT_PX} />
          </View>
        }
      >
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
      </Show>
    </View>
  );
}

/** Inner width of the seek track (200 wide with a 1 px border); the fill starts at x 1 and the 18 px knob centres on its end. */
export const SEEK_TRACK_PX = 198;
/** The same with h:mm:ss times (176 wide). */
export const SEEK_TRACK_WIDE_PX = 174;
/** Screen x of the track's inner left edge: capsule 10 + padding 8 + time cell + gap 8 + border 1. */
export function seekTrackLeft(hours: boolean): number {
  return 10 + 8 + (hours ? 46 : 34) + 8 + 1;
}
/** Text width inside the 192 px info LCD (8 px padding each side). */
export const INFO_TEXT_PX = 176;

export function SeekCapsule(props: {
  elapsed: string;
  remaining: string;
  fraction: number;
  enabled: boolean;
  /** Times read h:mm:ss: wider time cells, shorter track. */
  hours?: boolean;
  ref?: (node: unknown) => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  const x = () => trackOffset(props.fraction, props.hours ? SEEK_TRACK_WIDE_PX : SEEK_TRACK_PX);
  return (
    <View class={t().seekCapsule} ref={props.ref as never}>
      <Text class={props.hours ? t().seekTimeWide : t().seekTime}>{props.elapsed}</Text>
      <View class={props.hours ? t().seekTrackWide : t().seekTrack}>
        <Show when={props.enabled}>
          <View class={t().seekFill} style={{ width: x() }} />
          <Gel classes={t().seekKnob} style={{ insetL: x() - 8 }} />
        </Show>
      </View>
      <Text class={props.hours ? t().seekTimeRightWide : t().seekTimeRight}>{props.remaining}</Text>
    </View>
  );
}

export function TransportButton(props: { kind: TransportKind; on?: boolean; enabled?: boolean; onPress?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const enabled = () => props.enabled ?? true;
  const big = () => props.kind === "play" || props.kind === "pause";
  // Aqua gels carry white ink: play/pause, and shuffle/repeat while on. Graphite carries dark ink.
  const ink = () => (enabled() && (big() || ((props.kind === "shuffle" || props.kind === "repeat" || props.kind === "dj") && props.on)) ? "white" : "ink");
  // A View's onPress answers the focused node's A press; a touch on the bottom
  // screen needs its own recognizer over this button.
  let node: unknown = null;
  createGesture({
    surface: "auxiliary",
    region: { node: () => node as never },
    onTap: () => {
      if (enabled()) props.onPress?.();
    },
  });
  return (
    <Gel classes={t().transport(props.kind, props.on ?? false, enabled())} ref={(n: unknown) => (node = n)}>
      <Show
        when={big()}
        fallback={<Image class="w-[16] h-[16]" src={t().icon(props.kind as "shuffle" | "repeat" | "prev" | "next" | "dj", ink())} />}
      >
        <Image class="w-[32] h-[32]" src={t().iconLarge(props.kind as "play" | "pause", ink() === "white" ? "white" : "ink")} />
      </Show>
    </Gel>
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
  dj?: boolean;
  onDj?: () => void;
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
      <TransportButton kind="dj" on={props.dj ?? false} onPress={props.onDj} theme={props.theme} />
    </View>
  );
}
