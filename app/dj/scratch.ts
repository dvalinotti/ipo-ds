// The record's angle on the bottom screen in DJ Mode. The motor turns it at
// 33⅓ RPM while the song plays and holds it while it does not. A finger on it
// owns it (app/dj/grab.ts): each frame, the angle it turned the record since
// the last frame becomes the scratch rate and turns the record by as much.
// Lifting the finger, a track change, or leaving DJ Mode lets go.
import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { Session } from "../session.ts";
import { createGrab } from "./grab.ts";
import { SPIN_PER_FRAME, wrap360 } from "./platter.ts";

/**
 * Binds a grab to the platter node, the session and the frame; returns the record's angle.
 * `idle` says there is no song to scratch (a down then does nothing).
 */
export function createScratchGrab(session: Session, platter: () => unknown, idle: Accessor<boolean>): Accessor<number> {
  const status = session.status;
  const [angle, setAngle] = createSignal(0);
  const grab = createGrab(session);

  createGesture({
    surface: "auxiliary",
    axis: "any",
    region: { node: () => platter() as never },
    onDown: (c) => {
      if (!idle()) grab.down(c.x, c.y);
    },
    onMove: (c) => grab.move(c.x, c.y),
    onUp: grab.release,
    onCancel: grab.release,
  });
  // A grab belongs to the song it started on, as a seek drag does: another open lets go. The host can
  // also end a scratch itself (a seek, such as ZL restarting the song): the grab goes with it, with
  // nothing to send. One effect, so a track change (which ends the host's scratch too) still sends its end.
  const opened = createMemo(() => status().openSerial);
  let serial = opened();
  createEffect(
    on([opened, session.scratching], ([now, scratching]) => {
      if (now !== serial) {
        serial = now;
        grab.release();
      } else if (!scratching) grab.hostEnded();
    }, { defer: true }),
  );
  // Leaving DJ Mode (SELECT, the keyboard) with the finger down lets go too.
  onCleanup(grab.release);

  onFrame(() => {
    // The effect lets go after the frame; a scratch the host has already ended is not followed meanwhile.
    const turned = grab.tick();
    if (turned !== null) {
      if (turned !== 0) setAngle(wrap360(angle() + turned));
      return;
    }
    if (status().phase === "playing") setAngle(wrap360(angle() + SPIN_PER_FRAME));
  });

  return angle;
}
