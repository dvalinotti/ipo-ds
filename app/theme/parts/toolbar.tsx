// The top screen's toolbar: window lights, the iTunes status LCD and the
// Songs / Artists / Albums segmented tabs with their L / R hints.
import { For, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import { TAB_ORDER, type Tab, type Theme } from "../theme.ts";
import { FONT_12 } from "../fonts.ts";
import { Gel, GelLabel } from "./gel.tsx";
import { Marquee } from "./marquee.tsx";

/** Text width inside the 144 px LCD (6 px padding each side). */
const LCD_TEXT_PX = 132;

export function Lights(props: { theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class="flex-row items-center gap-[4]">
      <View class={t().light("red")} />
      <View class={t().light("amber")} />
      <View class={t().light("green")} />
    </View>
  );
}

export function LcdStatus(props: { title: string; line: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().lcdStatus}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX} />
    </View>
  );
}

export function SegmentedTabs(props: { active: Tab; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().tabs}>
      <Text class={t().hint}>L</Text>
      <View class={t().tabGroup}>
        <For each={TAB_ORDER}>
          {(tab, i) => (
            <>
              <Show when={i() > 0}>
                <View class={t().tabDivider} />
              </Show>
              <Gel classes={t().tab(tab === props.active)}>
                <GelLabel text={tab} class={t().tabText(tab === props.active)} shadow={tab === props.active ? t().tabTextShadow : undefined} />
              </Gel>
            </>
          )}
        </For>
        <View class={t().tabFrame} />
      </View>
      <Text class={t().hint}>R</Text>
    </View>
  );
}

export function Toolbar(props: { title: string; line: string; active: Tab; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().toolbar}>
        <Lights theme={props.theme} />
        <LcdStatus title={props.title} line={props.line} theme={props.theme} />
        <SegmentedTabs active={props.active} theme={props.theme} />
      </View>
      <View class={t().toolbarRule} />
    </>
  );
}
