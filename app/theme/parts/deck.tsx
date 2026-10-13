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
import type { Layout, RepeatMode, Theme, TransportKind } from "../theme.ts";
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
  layout?: Layout;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "narrow";
  return (
    <View class={t().infoLcd(layout())}>
      <Marquee text={props.title} class={t().infoTitle} slot={FONT_16_BOLD} width={INFO_TEXT_PX[layout()]} />
      <Marquee text={props.artist} class={t().infoArtist} slot={FONT_12} width={INFO_TEXT_PX[layout()]} />
      <Marquee text={props.album} class={t().infoAlbum} slot={FONT_12} width={INFO_TEXT_PX[layout()]} />
      <Show
        when={!props.note}
        fallback={
          <View class={t().infoStatus}>
            <Marquee text={props.note!} class={props.alert ? t().infoAlert : t().infoNote} slot={props.alert ? FONT_12_BOLD : FONT_12} width={INFO_TEXT_PX[layout()]} />
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

/** Inner width of the seek track (1 px border): 200 / 280 wide, or 176 / 256 with h:mm:ss times. */
const SEEK_TRACK_PX: Record<Layout, number> = { narrow: 198, wide: 278 };
const SEEK_TRACK_WIDE_PX: Record<Layout, number> = { narrow: 174, wide: 254 };
export function seekTrackPx(hours: boolean, layout: Layout): number {
  return hours ? SEEK_TRACK_WIDE_PX[layout] : SEEK_TRACK_PX[layout];
}
/** Screen x of the track's inner left edge: capsule 10 + padding 8 + time cell + gap 8 + border 1. */
export function seekTrackLeft(hours: boolean): number {
  return 10 + 8 + (hours ? 46 : 34) + 8 + 1;
}
/** Text width inside the info LCD (8 px padding each side of 192 / 272). */
const INFO_TEXT_PX: Record<Layout, number> = { narrow: 176, wide: 256 };

export function SeekCapsule(props: {
  elapsed: string;
  remaining: string;
  fraction: number;
  enabled: boolean;
  /** Times read h:mm:ss: wider time cells, shorter track. */
  hours?: boolean;
  layout?: Layout;
  ref?: (node: unknown) => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "narrow";
  const x = () => trackOffset(props.fraction, seekTrackPx(props.hours ?? false, layout()));
  return (
    <View class={t().seekCapsule(layout())} ref={props.ref as never}>
      <Text class={props.hours ? t().seekTimeWide : t().seekTime}>{props.elapsed}</Text>
      <View class={props.hours ? t().seekTrackWide(layout()) : t().seekTrack(layout())}>
        <Show when={props.enabled}>
          <View class={t().seekFill} style={{ width: x() }} />
          <Gel classes={t().seekKnob} style={{ insetL: x() - 8 }} />
        </Show>
      </View>
      <Text class={props.hours ? t().seekTimeRightWide : t().seekTimeRight}>{props.remaining}</Text>
    </View>
  );
}

/** `compact` draws prev / next as a 34 px grey gel (the DJ Mode side panel); other kinds ignore it. */
export function TransportButton(props: { kind: TransportKind; on?: boolean; enabled?: boolean; compact?: boolean; touch?: boolean; onPress?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const enabled = () => props.enabled ?? true;
  const big = () => props.kind === "play" || props.kind === "pause";
  // Aqua gels carry white ink: play/pause, and shuffle/repeat while on. Graphite carries dark ink.
  const ink = () => (enabled() && (big() || ((props.kind === "shuffle" || props.kind === "repeat" || props.kind === "dj") && props.on)) ? "white" : "ink");
  // A View's onPress answers the focused node's A press; a touch on the bottom
  // screen needs its own recognizer over this button. On the top screen (touch false) there is no
  // digitizer: no recognizer.
  let node: unknown = null;
  if (props.touch ?? true) {
    createGesture({
      surface: "auxiliary",
      region: { node: () => node as never },
      onTap: () => {
        if (enabled()) props.onPress?.();
      },
    });
  }
  return (
    <Gel
      classes={props.compact && (props.kind === "prev" || props.kind === "next") ? t().transportCompact(enabled()) : t().transport(props.kind, props.on ?? false, enabled())}
      ref={(n: unknown) => (node = n)}
    >
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
  layout?: Layout;
  touch?: boolean;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().transportRow(props.layout ?? "narrow")}>
      <TransportButton kind="shuffle" on={props.shuffle} enabled={props.enabled} onPress={props.onShuffle} touch={props.touch} theme={props.theme} />
      <TransportButton kind="prev" enabled={props.enabled} onPress={props.onPrev} touch={props.touch} theme={props.theme} />
      <TransportButton kind={props.playing ? "pause" : "play"} enabled={props.enabled} onPress={props.onToggle} touch={props.touch} theme={props.theme} />
      <TransportButton kind="next" enabled={props.enabled} onPress={props.onNext} touch={props.touch} theme={props.theme} />
      <TransportButton kind="repeat" on={props.repeat !== "off"} enabled={props.enabled} onPress={props.onRepeat} touch={props.touch} theme={props.theme} />
      <TransportButton kind="dj" on={props.dj ?? false} onPress={props.onDj} touch={props.touch} theme={props.theme} />
    </View>
  );
}
