// The bottom screen in DJ Mode. The record turns at 33⅓ RPM while the song
// plays and holds while it does not. A finger on it owns it: each frame, the
// angle it turned the record since the last frame becomes the scratch rate
// (app/dj/platter.ts) and turns the record by as much. Lifting the finger, a
// track change, or leaving DJ Mode lets go. The side panel carries the song,
// its time, prev / next and the gel back to the deck.
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { DjPanel, Platter } from "../theme/parts/platter.tsx";
import { angleAt, fingerRate, inDeadZone, PLATTER, smoothRate, SPIN_PER_FRAME, wrap360, wrapDelta } from "./platter.ts";

export function DjMode(props: { session: Session; onDeck: () => void }) {
  const session = props.session;
  const status = session.status;
  const idle = () => session.player().index < 0 || session.track() === null;
  const [angle, setAngle] = createSignal(0);

  // The finger: whether it holds the record, its last angle (null over the spindle, so leaving the
  // dead zone starts afresh), the turn since the last frame, the smoothed rate and the rate last sent.
  let held = false;
  let last: number | null = null;
  let turned = 0;
  let rate = 0;
  let sent = 0;
  const follow = (x: number, y: number) => {
    if (inDeadZone(PLATTER.cx, PLATTER.cy, x, y)) {
      last = null;
      return;
    }
    const now = angleAt(PLATTER.cx, PLATTER.cy, x, y);
    if (last !== null) turned += wrapDelta(now - last);
    last = now;
  };
  const release = () => {
    if (!held) return;
    held = false;
    session.scratch.end();
  };
  let platter: unknown = null;
  createGesture({
    surface: "auxiliary",
    axis: "any",
    region: { node: () => platter as never },
    onDown: (c) => {
      if (idle()) return;
      held = true;
      last = null;
      turned = 0;
      rate = sent = 0;
      follow(c.x, c.y);
      session.scratch.begin();
    },
    onMove: (c) => {
      if (held) follow(c.x, c.y);
    },
    onUp: release,
    onCancel: release,
  });
  // A grab belongs to the song it started on, as a seek drag does: another open lets go.
  const opened = createMemo(() => status().openSerial);
  createEffect(on(opened, () => release(), { defer: true }));
  // Leaving DJ Mode (SELECT, the keyboard) with the finger down lets go too.
  onCleanup(release);

  onFrame(() => {
    if (held) {
      rate = smoothRate(rate, fingerRate(turned));
      if (rate !== sent) {
        session.scratch.rate(rate);
        sent = rate;
      }
      if (turned !== 0) setAngle(wrap360(angle() + turned));
      turned = 0;
      return;
    }
    if (status().phase === "playing") setAngle(wrap360(angle() + SPIN_PER_FRAME));
  });

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
