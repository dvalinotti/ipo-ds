// Text that fits its box sits still (aligned by its class). Text too wide
// starts at the left edge and, while active, scrolls to reveal its end on a
// hold–scroll–hold cycle (geometry.marqueeOffset), restarting when it changes.
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { getOps } from "@pocketjs/framework";
import { Text, View } from "@pocketjs/framework/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { virtualFrame } from "@pocketjs/framework/clock";
import { marqueeOffset } from "../geometry.ts";
import { measureCache } from "../measure.ts";

/** measureText results: rows rebinding their titles reuse them. */
const measured = measureCache((text, slot) => getOps().measureText(text, slot));

export function Marquee(props: {
  text: string;
  /** The text's class (size, weight, colour, alignment). */
  class: string;
  /** Font slot of that class (app/theme/fonts.ts). */
  slot: number;
  /** Box width in px. */
  width: number;
  /** Scrolls only while active; an inactive marquee is plain clipped text and never measures. */
  active?: boolean;
}) {
  const live = () => props.active ?? true;
  const textWidth = createMemo(() => (live() ? measured(props.text, props.slot) : 0));
  const overflow = () => Math.max(0, Math.ceil(textWidth() - props.width));
  const [start, setStart] = createSignal(virtualFrame());
  createEffect(on(() => [props.text, props.active] as const, () => setStart(virtualFrame()), { defer: true }));
  const [offset, setOffset] = createSignal(0);
  onFrame(() => {
    const next = live() && overflow() > 0 ? marqueeOffset(virtualFrame() - start(), overflow()) : 0;
    if (next !== offset()) setOffset(next);
  });
  return (
    <View class="overflow-hidden" style={{ width: props.width }}>
      <Text class={props.class} style={{ width: overflow() > 0 ? Math.ceil(textWidth()) : props.width, translateX: offset() }}>
        {props.text}
      </Text>
    </View>
  );
}
