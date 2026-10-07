// Whole-area messages: the top screen's scanning / empty panel and the bottom
// screen's idle LCD.
import { For, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import { Gel } from "./gel.tsx";
import { KeyBadge } from "./strips.tsx";
import { trackOffset } from "../geometry.ts";
import type { Theme } from "../theme.ts";

/** Inner width of the progress track (220 wide with a 1 px border). */
export const PROGRESS_TRACK_PX = 218;

/** A line of text, or text with a key badge between two runs ("then press", "X", "to scan again."). */
export type PanelLine = string | readonly [before: string, key: string, after: string];

function Line(props: { line: PanelLine; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const parts = () => (typeof props.line === "string" ? null : props.line);
  return (
    <Show when={parts()} fallback={<Text class={t().panelText}>{props.line as string}</Text>}>
      {(p) => (
        <View class={t().panelKeyLine}>
          <Text class={t().panelText}>{p()[0]}</Text>
          <KeyBadge letter={p()[1]} theme={props.theme} />
          <Show when={p()[2] !== ""}>
            <Text class={t().panelText}>{p()[2]}</Text>
          </Show>
        </View>
      )}
    </Show>
  );
}

/** Fills the list area. `progress` (0..1) adds the aqua progress bar. */
export function StatePanel(props: { title: string; lines: readonly PanelLine[]; progress?: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().panel}>
      <Text class={t().panelTitle}>{props.title}</Text>
      <For each={props.lines}>{(line) => <Line line={line} theme={props.theme} />}</For>
      <Show when={props.progress !== undefined}>
        <View class={t().progressTrack}>
          <Gel classes={t().progressFill} style={{ width: trackOffset(props.progress ?? 0, PROGRESS_TRACK_PX) }} />
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
      <Line line={["Pick a song above and press", "A", ""]} theme={props.theme} />
    </View>
  );
}
