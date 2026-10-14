// Bars that sit between the toolbar and the list (search, breadcrumb) and the
// footer legend of button hints.
import { For, untrack } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { Theme } from "../theme.ts";
import { Gel, GelLabel, tapTarget } from "./gel.tsx";

export function SearchStrip(props: { query: string; count: number; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().strip}>
        <View class={t().searchField}>
          <Text class={t().searchLabel}>Search:</Text>
          <Text class={t().searchQuery}>{props.query}</Text>
        </View>
        <Text class={t().searchCount}>{`${props.count} found`}</Text>
      </View>
      <View class={t().stripRule} />
    </>
  );
}

/** The query and caret above the on-screen keyboard. */
export function KeyboardField(props: { text: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <View class={t().keyboardField}>
      <Text class={t().keyboardFieldText}>{props.text}</Text>
    </View>
  );
}

export function Breadcrumb(props: { root: string; leaf: string; detail: string; onBack?: () => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().crumb} ref={tapTarget(props.onBack)}>
        <Text class={t().crumbLink}>{props.root}</Text>
        <Text class={t().crumbText}>›</Text>
        <View class={t().crumbLeaf}>
          <Text class={t().crumbText}>{props.leaf}</Text>
        </View>
        <Text class={t().crumbDetail}>{props.detail}</Text>
      </View>
      <View class={t().crumbRule} />
    </>
  );
}

export function KeyBadge(props: { letter: string; primary?: boolean; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <Gel classes={t().badge(props.primary ?? false)}>
      <GelLabel
        text={props.letter}
        class={t().badgeText(props.primary ?? false)}
        shadow={props.primary ? t().badgeTextShadow : undefined}
      />
    </Gel>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  primary?: boolean;
}

export function FooterLegend(props: { items: readonly LegendItem[]; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().footerRule} />
      <View class={t().footer}>
        <For each={props.items}>
          {(item) => (
            <View class={t().footerItem}>
              <KeyBadge letter={item.key} primary={item.primary} theme={props.theme} />
              <Text class={t().footerText}>{item.label}</Text>
            </View>
          )}
        </For>
      </View>
    </>
  );
}

export type TouchAction = "search" | "back" | "rescan";

export interface TouchLegendItem {
  action: TouchAction;
  label: string;
}

/** One footer gel; with `onPress` it is a tap target. */
function FooterGel(props: { item: TouchLegendItem; onPress?: (action: TouchAction) => void; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  // Whether the gel is a tap target is decided once, at mount.
  const onPress = untrack(() => props.onPress);
  return (
    <Gel classes={t().footerGel} ref={tapTarget(onPress && (() => onPress(props.item.action)))}>
      <GelLabel text={props.item.label} class={t().footerText} />
    </Gel>
  );
}

/** The narrow (touch) footer: a gel per action. */
export function FooterGels(props: {
  items: readonly TouchLegendItem[];
  onPress?: (action: TouchAction) => void;
  theme?: Theme;
}) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().footerRule} />
      <View class={t().footer}>
        <For each={props.items}>{(item) => <FooterGel item={item} onPress={props.onPress} theme={props.theme} />}</For>
      </View>
    </>
  );
}
