// The top screen's toolbar: window lights, the iTunes status LCD and the
// Songs / Artists / Albums segmented tabs with their L / R hints.
import { For, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import { TAB_ORDER, type Layout, type Tab, type Theme } from "../theme.ts";
import { FONT_12 } from "../fonts.ts";
import { Gel, GelLabel } from "./gel.tsx";
import { Marquee } from "./marquee.tsx";

/** Text width inside the LCD (6 px padding each side of 144 / 92). */
const LCD_TEXT_PX: Record<Layout, number> = { wide: 132, narrow: 80 };

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

export function LcdStatus(props: { title: string; line: string; layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  return (
    <View class={t().lcdStatus(layout())}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX[layout()]} />
    </View>
  );
}

/** Narrow (the touch screen) drops the L / R hints: there is no room, and the tabs are tapped. */
export function SegmentedTabs(props: { active: Tab; layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  return (
    <View class={t().tabs}>
      <Show when={layout() === "wide"}>
        <Text class={t().hint}>L</Text>
      </Show>
      <View class={t().tabGroup}>
        <For each={TAB_ORDER}>
          {(tab, i) => (
            <>
              <Show when={i() > 0}>
                <View class={t().tabDivider} />
              </Show>
              <Gel classes={t().tab(tab === props.active, layout())}>
                <GelLabel text={tab} class={t().tabText(tab === props.active)} shadow={tab === props.active ? t().tabTextShadow : undefined} />
              </Gel>
            </>
          )}
        </For>
        <View class={t().tabFrame} />
      </View>
      <Show when={layout() === "wide"}>
        <Text class={t().hint}>R</Text>
      </Show>
    </View>
  );
}

export function Toolbar(props: { title: string; line: string; active: Tab; layout?: Layout; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().toolbar}>
        <Lights theme={props.theme} />
        <LcdStatus title={props.title} line={props.line} layout={props.layout} theme={props.theme} />
        <SegmentedTabs active={props.active} layout={props.layout} theme={props.theme} />
      </View>
      <View class={t().toolbarRule} />
    </>
  );
}
