// Bars that sit between the toolbar and the list (search, breadcrumb) and the
// footer legend of button hints.
import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { AQUA } from "../aqua.ts";
import type { Theme } from "../theme.ts";

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

export function Breadcrumb(props: { root: string; leaf: string; detail: string; theme?: Theme }) {
  const t = () => props.theme ?? AQUA;
  return (
    <>
      <View class={t().crumb}>
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
    <View class={t().badge(props.primary ?? false)}>
      <Text class={t().badgeText(props.primary ?? false)}>{props.letter}</Text>
    </View>
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
