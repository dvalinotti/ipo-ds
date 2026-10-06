// Whole-area messages: the top screen's scanning / empty panel and the bottom
// screen's idle LCD.
import { For, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import { trackOffset } from "../geometry.ts";
import type { Theme } from "../theme.ts";

/** Inner width of the progress track (220 wide with a 1 px border). */
export const PROGRESS_TRACK_PX = 218;

/** Fills the list area. `progress` (0..1) adds the aqua progress bar. */
export function StatePanel(props: { title: string; lines: readonly string[]; progress?: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().panel}>
      <Text class={t().panelTitle}>{props.title}</Text>
      <For each={props.lines}>{(line) => <Text class={t().panelText}>{line}</Text>}</For>
      <Show when={props.progress !== undefined}>
        <View class={t().progressTrack}>
          <View class={t().progressFill} style={{ width: trackOffset(props.progress ?? 0, PROGRESS_TRACK_PX) }} />
        </View>
      </Show>
    </View>
  );
}

export function IdlePanel(props: { theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().idlePanel}>
      <Text class={t().panelTitle}>Nothing playing</Text>
      <Text class={t().panelText}>Pick a song above and press Ⓐ</Text>
    </View>
  );
}
