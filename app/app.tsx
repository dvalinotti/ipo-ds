// Ds Man — a walkman-style MP3 player. The top screen is the Explorer; the
// bottom screen is Now Playing, or the search keyboard while it is open.
import { Show } from "solid-js";
import { AuxiliarySurface, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
import { NowPlaying } from "./now-playing/now-playing.tsx";
import { createSearch, SearchKeyboard } from "./search.tsx";
import { createSession } from "./session.ts";

export default function App() {
  const session = createSession();
  const store = createExplorerStore();
  const osk = createSearch(store);
  const notSearching = () => !osk.isOpen();
  // Transport from either screen (the keyboard uses START to commit while open).
  onButtonPress(BTN.START, () => session.dispatch({ type: "toggle" }), { active: notSearching });
  onButtonPress(BTN.ZL, () => session.dispatch({ type: "prev" }), { active: notSearching });
  onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
  return (
    <>
      <Explorer session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
      <AuxiliarySurface>
        {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Show> renders once). */}
        <View class="relative w-full h-full flex-col">
          <Show when={osk.isOpen()} fallback={<NowPlaying session={session} />}>
            <SearchKeyboard osk={osk} />
          </Show>
        </View>
      </AuxiliarySurface>
    </>
  );
}
