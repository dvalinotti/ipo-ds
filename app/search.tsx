// Search: the on-screen keyboard edits the Explorer's query live. While it is
// open it replaces Now Playing on the bottom screen and owns input.
import { View } from "@pocketjs/framework/components";
import { createOsk, Osk, type OskController } from "@pocketjs/framework/osk";
import type { ExplorerStore } from "./explorer/explorer.tsx";
import { AQUA } from "./theme/aqua.ts";
import { KeyboardField } from "./theme/parts/strips.tsx";

export function createSearch(store: ExplorerStore): OskController {
  return createOsk({ value: () => store.state().query, setValue: (query) => store.dispatch({ type: "setQuery", query }) });
}

export function SearchKeyboard(props: { osk: OskController }) {
  return (
    <View class={AQUA.bottomScreen}>
      <View class="absolute left-[8] top-[3] w-[304]">
        <KeyboardField text={props.osk.display("|")} />
      </View>
      {/* The keyboard rests at the top of its own box (it slides in from below), so the box starts under the field. */}
      <View class="absolute left-[0] top-[26] w-[320] h-[214]">
        <Osk osk={props.osk} surface="auxiliary" theme={AQUA.osk} keyHeight={AQUA.oskKeyHeight} />
      </View>
    </View>
  );
}
