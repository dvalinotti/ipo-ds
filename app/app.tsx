// iPoDS — a walkman-style MP3 player. Normally the top screen is the Explorer
// and the bottom screen is Now Playing, DJ Mode (a SELECT tap, or the DJ gel,
// flips them) or the search keyboard while it is open. Holding SELECT swaps
// the screens: Now Playing goes to the top, the Explorer to the touch screen,
// and the buttons drive playback (app/placement.ts says what shows where).
import { createMemo, createSignal, Match, Switch } from "solid-js";
import { AuxiliarySurface, FocusScope, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import { DjMode } from "./dj/dj-mode.tsx";
import { createExplorerStore, Explorer } from "./explorer/explorer.tsx";
import { onTapOrHold } from "./input.ts";
import { NowPlaying } from "./now-playing/now-playing.tsx";
import { placement } from "./placement.ts";
import { createSearch, SearchKeyboard } from "./search.tsx";
import { createSession } from "./session.ts";

export default function App() {
  const session = createSession();
  const store = createExplorerStore();
  const osk = createSearch(store);
  const notSearching = () => !osk.isOpen();
  const [mode, setMode] = createSignal<"deck" | "dj">("deck");
  const [swapped, setSwapped] = createSignal(false);
  const place = createMemo(() => placement(swapped(), mode() === "dj", osk.isOpen()));
  // Transport from either screen (the keyboard uses START to commit while open).
  onButtonPress(BTN.START, () => session.dispatch({ type: "toggle" }), { active: notSearching });
  onButtonPress(BTN.ZL, () => session.dispatch({ type: "prev" }), { active: notSearching });
  onButtonPress(BTN.ZR, () => session.dispatch({ type: "next" }), { active: notSearching });
  // A SELECT tap flips the bottom screen to DJ Mode and back; a 1 s hold swaps the screens. Neither
  // with L or R anywhere in the press (the host's devmenu chord is L+R+SELECT).
  const chorded = (held: number) => (held & (BTN.LTRIGGER | BTN.RTRIGGER)) !== 0;
  onTapOrHold(
    BTN.SELECT,
    (held) => { if (!chorded(held)) setMode((now) => (now === "dj" ? "deck" : "dj")); },
    (held) => { if (!chorded(held)) setSwapped((now) => !now); },
    notSearching,
  );
  const explorer = (layout: "wide" | "narrow") => (
    <Explorer layout={layout} session={session} store={store} searching={osk.isOpen} openSearch={() => osk.open()} />
  );
  return (
    <>
      {/* The app moves its own focus; this empty scope keeps the framework's d-pad traversal
          from walking the whole tree on every press (the keyboard pushes its own scope). */}
      <FocusScope class="absolute left-[0] top-[0] w-[0] h-[0]" />
      {/* A wrapping View here too: the primary root now holds a reactive Switch, as the auxiliary always has. */}
      <View class="relative w-full h-full flex-col">
        <Switch>
          <Match when={place().top === "explorer"}>{explorer("wide")}</Match>
          <Match when={place().top === "deck"}>
            <NowPlaying layout="wide" session={session} />
          </Match>
        </Switch>
      </View>
      <AuxiliarySurface>
        {/* A wrapping View: AuxiliarySurface does not track a lone reactive child (a bare <Switch> renders once). */}
        <View class="relative w-full h-full flex-col">
          <Switch>
            <Match when={place().bottom === "keyboard"}>
              <SearchKeyboard osk={osk} />
            </Match>
            <Match when={place().bottom === "dj"}>
              <DjMode session={session} onDeck={() => setMode("deck")} />
            </Match>
            <Match when={place().bottom === "explorer"}>{explorer("narrow")}</Match>
            <Match when={place().bottom === "deck"}>
              <NowPlaying layout="narrow" session={session} onDj={() => setMode("dj")} />
            </Match>
          </Switch>
        </View>
      </AuxiliarySurface>
    </>
  );
}
