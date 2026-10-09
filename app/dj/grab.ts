// A finger's hold on the record, as plain state: whether it holds, the angle it
// was last seen at, how far it has turned the record since the last frame, and
// the rate last sent to the host. Pure (tests/grab.test.ts); app/dj/scratch.ts
// binds it to the gesture, the session and the frame.
import { angleAt, fingerRate, inDeadZone, inDisc, PLATTER, smoothRate, wrapDelta } from "./platter.ts";

/** What the grab needs of the host: the scratch commands and the host's last word on whether it is scratching. */
export interface GrabHost {
  scratch: { begin(): void; rate(rate: number): void; end(): void };
  scratching(): boolean;
}

export interface Grab {
  /** Whether the finger holds the record. */
  held(): boolean;
  /** A finger down at (x, y): grabs if it is on the record and the host takes the grab. */
  down(x: number, y: number): void;
  /** The finger at (x, y) while holding. Over the spindle the record holds still. */
  move(x: number, y: number): void;
  /** The finger lifts (or the grab is taken away): lets go and tells the host, once. */
  release(): void;
  /** The host ended the scratch itself (a seek): the grab goes with it, with nothing to send. */
  hostEnded(): void;
  /**
   * Once a frame. While holding (and the host still scratching) sends the smoothed rate when it
   * changed, and returns the degrees the finger turned the record since the last frame. Otherwise null.
   */
  tick(): number | null;
}

export function createGrab(host: GrabHost, cx: number = PLATTER.cx, cy: number = PLATTER.cy): Grab {
  let held = false;
  // null over the spindle, so leaving the dead zone starts afresh.
  let last: number | null = null;
  let turned = 0;
  let rate = 0;
  let sent = 0;
  const follow = (x: number, y: number) => {
    if (inDeadZone(cx, cy, x, y)) {
      last = null;
      return;
    }
    const now = angleAt(cx, cy, x, y);
    if (last !== null) turned += wrapDelta(now - last);
    last = now;
  };
  return {
    held: () => held,
    down(x, y) {
      if (held || !inDisc(cx, cy, x, y)) return;
      held = true;
      last = null;
      turned = 0;
      rate = sent = 0;
      follow(x, y);
      host.scratch.begin();
      // The host answers at once; if it did not take the grab, the record does not turn under the finger.
      if (!host.scratching()) held = false;
    },
    move(x, y) {
      if (held) follow(x, y);
    },
    release() {
      if (!held) return;
      held = false;
      host.scratch.end();
    },
    hostEnded() {
      held = false;
    },
    tick() {
      if (!held || !host.scratching()) return null;
      rate = smoothRate(rate, fingerRate(turned));
      if (rate !== sent) {
        host.scratch.rate(rate);
        sent = rate;
      }
      const degrees = turned;
      turned = 0;
      return degrees;
    },
  };
}
