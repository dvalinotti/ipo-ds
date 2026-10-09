// iPoDS — a walkman-style MP3 player. The top screen is the Explorer; the
// bottom screen is Now Playing or DJ Mode (SELECT, or the DJ gel, flips them),
// or the search keyboard while it is open.
import { createSignal, Match, Switch } from "solid-js";
import { AuxiliarySurface, FocusScope, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { DjMode } from "./dj/dj-mode.tsx";
import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
import { NowPlaying } from "./now-playing/now-playing.tsx";
import { createSearch, SearchKeyboard } from "./search.tsx";
import { createSession } from "./session.ts";

export default function App() {
  const session = createSession();
  const store = createExplorerStore();
  const osk = createSearch(store);
  const notSearching = () => !osk.isOpen();
  const [mode, setMode] = createSignal<"deck" | "dj">("deck");
  // Transport from either screen (the keyboard uses START to commit while open).
  onButtonPress(BTN.START, () => session.dispatch({ type: "toggle" }), { active: notSearching });
  onButtonPress(BTN.ZL, () => session.dispatch({ type: "prev" }), { active: notSearching });
  onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
  // SELECT flips the bottom screen between the deck and DJ Mode; not with L or R held (the host's
  // devmenu chord is L+R+SELECT).
  onButtonPress(
    BTN.SELECT,
    (_pressed, buttons) => {
      if (buttons & (BTN.LTRIGGER | BTN.RTRIGGER)) return;
      setMode((now) => (now === "dj" ? "deck" : "dj"));
    },
    { active: notSearching },
  );
  return (
    <>
      {/* The app moves its own focus; this empty scope keeps the framework's d-pad traversal
          from walking the whole tree on every press (the keyboard pushes its own scope). */}
      <FocusScope class="absolute left-[0] top-[0] w-[0] h-[0]" />
      <Explorer session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
      <AuxiliarySurface>
        {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Switch> renders once). */}
        <View class="relative w-full h-full flex-col">
          <Switch fallback={<NowPlaying session={session} onDj={() => setMode("dj")} />}>
            <Match when={osk.isOpen()}>
              <SearchKeyboard osk={osk} />
            </Match>
            <Match when={mode() === "dj"}>
              <DjMode session={session} onDeck={() => setMode("deck")} />
            </Match>
          </Switch>
        </View>
      </AuxiliarySurface>
    </>
  );
}
