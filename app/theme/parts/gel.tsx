// Aqua gels (docs/superpowers/specs/2026-10-07-aqua-gels-design.md): a body box
// with its gloss as the first child and the content on top; a white label with
// its 1 px navy shadow copy.
import { Show, type JSX } from "solid-js";
import { Text, View, type ViewProps } from "@pocketjs/framework/components";
import type { GelClasses } from "../theme.ts";

export function Gel(props: { classes: GelClasses; style?: ViewProps["style"]; ref?: ViewProps["ref"]; children?: JSX.Element }) {
  return (
    <View class={props.classes.body} style={props.style} ref={props.ref as never}>
      <View class={props.classes.gloss} />
      {props.children}
    </View>
  );
}

/** A label; with `shadow`, a copy of it in that class (absolute, 1 px lower) is drawn first. */
export function GelLabel(props: { text: string; class: string; shadow?: string }) {
  return (
    <Show when={props.shadow} fallback={<Text class={props.class}>{props.text}</Text>}>
      <View class="relative">
        <Text class={props.shadow!}>{props.text}</Text>
        <Text class={props.class}>{props.text}</Text>
      </View>
    </Show>
  );
}
