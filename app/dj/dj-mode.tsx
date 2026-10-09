// The bottom screen in DJ Mode: the record (turning under the motor or the
// finger, app/dj/scratch.ts) and the side panel with the song, its time,
// prev / next and the gel back to the deck.
import { View } from "@pocketjs/framework/components";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { DjPanel, Platter } from "../theme/parts/platter.tsx";
import { createScratchGrab } from "./scratch.ts";

export function DjMode(props: { session: Session; onDeck: () => void }) {
  const session = props.session;
  const status = session.status;
  const idle = () => session.player().index < 0 || session.track() === null;
  let platter: unknown = null;
  const angle = createScratchGrab(session, () => platter, idle);

  const duration = () => status().durationMs;
  const hours = () => needsHours(duration());
  return (
    <View class={AQUA.bottomScreen}>
      <Platter
        ref={(node) => (platter = node)}
        angle={angle()}
        cover={idle() ? 0 : session.cover()}
        loading={!idle() && session.coverLoading()}
      />
      <DjPanel
        title={idle() ? "Nothing playing" : session.track()!.title}
        artist={idle() ? "Pick a song above" : session.track()!.artist}
        elapsed={idle() ? "--:--" : formatTime(status().positionMs, hours())}
        remaining={idle() ? "--:--" : formatRemaining(status().positionMs, duration())}
        enabled={!idle()}
        onPrev={() => session.dispatch({ type: "prev" })}
        onNext={() => session.dispatch({ type: "next" })}
        onDeck={props.onDeck}
      />
    </View>
  );
}
