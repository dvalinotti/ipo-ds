// Runs the player reducer against the host's local media module. The UI
// calls poll() once per frame and dispatch() for user actions; whenever a
// step issued commands, the status is read again so the UI never renders
// the previous song's snapshot for a frame.
import type { LocalMedia } from "@pocketjs/framework/localmedia";
import { initialPlayer, reducePlayer, type PlayerAction, type PlayerCommand, type PlayerState } from "./reducer.ts";

export interface PlayerController {
  state(): PlayerState;
  dispatch(action: PlayerAction): void;
  poll(): void;
}

export interface CommandResult {
  /** Serial of the last open the host accepted; 0 when none ran. */
  serial: number;
  /** Id of an open the host refused (running stops there); -1 when none. */
  refused: number;
}

export function runCommands(media: LocalMedia, commands: readonly PlayerCommand[]): CommandResult {
  let serial = 0;
  for (const command of commands) {
    if (command.type === "open") {
      const opened = media.open(command.id);
      if (opened === 0) return { serial, refused: command.id };
      serial = opened;
    } else if (command.type === "paused") media.pause(command.value);
    else media.seek(command.ms);
  }
  return { serial, refused: -1 };
}

export function createPlayerController(
  media: LocalMedia,
  options: { random?: () => number; onChange?: (state: PlayerState) => void } = {},
): PlayerController {
  const random = options.random ?? Math.random;
  let state = initialPlayer();
  const apply = (action: PlayerAction): number => {
    const reduced = reducePlayer(state, action, random);
    state = reduced.state;
    const { serial, refused } = runCommands(media, reduced.commands);
    if (serial > 0) state = reducePlayer(state, { type: "opened", serial }, random).state;
    // A refused id (one a rescan dropped) is reported as a failed song, so
    // the reducer's skip-and-stop rules apply. Each refusal raises the
    // failure count, which bounds this recursion by the queue length.
    if (refused >= 0) {
      const failed = { ...media.status(), phase: "error" as const, trackId: refused, openSerial: state.serial, positionMs: 0, durationMs: 0, error: "Track is not in the library" };
      apply({ type: "hostStatus", status: failed });
    }
    return reduced.commands.length;
  };
  const step = (action: PlayerAction) => {
    if (apply(action) > 0) apply({ type: "hostStatus", status: media.status() });
    options.onChange?.(state);
  };
  return {
    state: () => state,
    dispatch: step,
    poll: () => step({ type: "hostStatus", status: media.status() }),
  };
}
