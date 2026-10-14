// The top screen's toolbar: window lights, the iTunes status LCD and the
// Songs / Artists / Albums segmented tabs with their L / R hints.
import { For, Show, untrack } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import { TAB_ORDER, type Layout, type Tab, type Theme } from "../theme.ts";
import { FONT_12 } from "../fonts.ts";
import { Gel, GelLabel, tapTarget } from "./gel.tsx";
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

export function LcdStatus(props: {
  title: string;
  line: string;
  layout?: Layout;
  onPress?: () => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  const layout = () => props.layout ?? "wide";
  return (
    <View class={t().lcdStatus(layout())} ref={tapTarget(props.onPress)}>
      <Text class={t().lcdTitle}>{props.title}</Text>
      <Marquee text={props.line} class={t().lcdLine} slot={FONT_12} width={LCD_TEXT_PX[layout()]} />
    </View>
  );
}

/** One tab gel; with `onSelect` (the narrow Explorer) it is a tap target. */
function TabGel(props: { tab: Tab; active: boolean; layout: Layout; onSelect?: (tab: Tab) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  // Whether the tab is a tap target is decided once, at mount.
  const onSelect = untrack(() => props.onSelect);
  return (
    <Gel classes={t().tab(props.active, props.layout)} ref={tapTarget(onSelect && (() => onSelect(props.tab)))}>
      <GelLabel
        text={props.tab}
        class={t().tabText(props.active)}
        shadow={props.active ? t().tabTextShadow : undefined}
      />
    </Gel>
  );
}

/** Narrow (the touch screen) drops the L / R hints: there is no room, and the tabs are tapped. */
export function SegmentedTabs(props: { active: Tab; layout?: Layout; onSelect?: (tab: Tab) => void; theme?: Theme }) {
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
              <TabGel
                tab={tab}
                active={tab === props.active}
                layout={layout()}
                onSelect={props.onSelect}
                theme={props.theme}
              />
            </>
          )}
        </For>
        {/* hitPass: this absolute box covers the tabs, and a hit test by layout box would give it their touches. */}
        <View class={t().tabFrame} style={{ hitPass: 1 }} />
      </View>
      <Show when={layout() === "wide"}>
        <Text class={t().hint}>R</Text>
      </Show>
    </View>
  );
}

export function Toolbar(props: {
  title: string;
  line: string;
  active: Tab;
  layout?: Layout;
  onSelect?: (tab: Tab) => void;
  onPress?: () => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().toolbar}>
        <Lights theme={props.theme} />
        <LcdStatus
          title={props.title}
          line={props.line}
          layout={props.layout}
          onPress={props.onPress}
          theme={props.theme}
        />
        <SegmentedTabs active={props.active} layout={props.layout} onSelect={props.onSelect} theme={props.theme} />
      </View>
      <View class={t().toolbarRule} />
    </>
  );
}
