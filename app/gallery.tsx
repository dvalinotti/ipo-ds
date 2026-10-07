// iPoDS theme gallery: a separate bundle (gallery.pocket.json) that shows the
// approved Aqua mockup states built from app/theme parts. L / R flip states.
import { createSignal, For, Show } from "solid-js";
import { AuxiliarySurface } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { mount } from "@pocketjs/framework/solid";
import { STATES } from "./gallery/states.tsx";

function Gallery() {
  const [index, setIndex] = createSignal(0);
  onButtonPress(BTN.RTRIGGER, () => setIndex((i) => (i + 1) % STATES.length));
  onButtonPress(BTN.LTRIGGER, () => setIndex((i) => (i + STATES.length - 1) % STATES.length));
  return (
    <>
      <For each={STATES}>{(state, i) => <Show when={index() === i()}>{state.top()}</Show>}</For>
      <AuxiliarySurface>
        <For each={STATES}>{(state, i) => <Show when={index() === i()}>{state.bottom()}</Show>}</For>
      </AuxiliarySurface>
    </>
  );
}

mount(() => <Gallery />);
