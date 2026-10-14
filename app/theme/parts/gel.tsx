// Aqua gels (docs/superpowers/specs/2026-10-07-aqua-gels-design.md): a body box
// with its gloss as the first child and the content on top; a white label with
// its 1 px navy shadow copy.
import { Show, type JSX } from "solid-js";
import { Text, View, type ViewProps } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import type { GelClasses } from "../theme.ts";

export function Gel(props: {
  classes: GelClasses;
  style?: ViewProps["style"];
  ref?: ViewProps["ref"];
  children?: JSX.Element;
}) {
  return (
    <View class={props.classes.body} style={props.style} ref={props.ref}>
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
        <Text class={props.shadow}>{props.text}</Text>
        <Text class={props.class}>{props.text}</Text>
      </View>
    </Show>
  );
}

/**
 * A ref setter that makes its node a tap target on the bottom screen. With no handler nothing is
 * registered (the top screen has no touch). Call it in a component scope: the recognizer disposes
 * with it. Reading a handler prop once here is right because a part's handlers are constant for
 * a mount (the Explorer passes them per layout, and it remounts when the layout changes).
 */
export function tapTarget(onTap?: () => void): (node: unknown) => void {
  let node: unknown = null;
  if (onTap) createGesture({ surface: "auxiliary", region: { node: () => node as never }, onTap });
  return (n) => {
    node = n;
  };
}
