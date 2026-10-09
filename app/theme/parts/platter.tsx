// DJ Mode's parts: the platter (a vinyl record turning over the cover, or over
// the generated label, with a still spindle) and the side panel (the song, its
// time, prev / next and the gel back to the deck). app/dj/dj-mode.tsx turns the
// platter and wires the touch.
import { Show } from "solid-js";
import { Image, Sprite, Text, View } from "@pocketjs/framework/components";
import { ready, ResourceImage } from "@pocketjs/framework/resource";
import { AQUA } from "../aqua.ts";
import { FONT_12, FONT_16_BOLD } from "../fonts.ts";
import type { Theme } from "../theme.ts";
import { TransportButton } from "./deck.tsx";
import { Marquee } from "./marquee.tsx";

/** Text width in the 90 px side panel. */
export const DJ_TEXT_PX = 78;

/** The record. One View turns: the label (cover or generated) under the vinyl. The spindle and the
 * cover spinner stay still on top. */
export function Platter(props: { angle: number; cover: number; loading?: boolean; ref?: (node: unknown) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().platter} ref={props.ref as never}>
      <View class={t().platterDisc} style={{ rotate: props.angle }}>
        <View class={t().platterLabel}>
          <Show when={props.cover > 0} fallback={<Image class="w-[88] h-[88]" src={t().labelArt} />}>
            <ResourceImage class="w-[88] h-[88]" state={() => ready({ handle: props.cover, width: 88, height: 88 })} fallback={() => null} />
          </Show>
        </View>
        <Image class="absolute left-[0] top-[0] w-[200] h-[200]" src={t().vinylArt} />
      </View>
      <Show when={props.loading}>
        <View class={t().platterLoading}>
          <Sprite class="w-[32] h-[32]" sprite="theme/icons/spinner-atlas.svg" />
        </View>
      </Show>
      <View class={t().spindle} />
    </View>
  );
}

export function DjPanel(props: {
  title: string;
  artist: string;
  elapsed: string;
  remaining: string;
  enabled: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onDeck?: () => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().djPanel}>
      <Marquee text={props.title} class={t().infoTitle} slot={FONT_16_BOLD} width={DJ_TEXT_PX} />
      <Marquee text={props.artist} class={t().infoArtist} slot={FONT_12} width={DJ_TEXT_PX} />
      <Text class={t().djTime}>{props.elapsed}</Text>
      <Text class={t().djRemaining}>{props.remaining}</Text>
      <View class={t().djSkipRow}>
        <TransportButton kind="prev" enabled={props.enabled} onPress={props.onPrev} theme={props.theme} />
        <TransportButton kind="next" enabled={props.enabled} onPress={props.onNext} theme={props.theme} />
      </View>
      <View class={t().djDeckGel}>
        <TransportButton kind="dj" on onPress={props.onDeck} theme={props.theme} />
      </View>
    </View>
  );
}
