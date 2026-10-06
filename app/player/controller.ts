// Runs the player reducer against the host's local media module. The UI
// calls poll() once per frame and dispatch() for user actions; after a
// dispatch that issued commands, the status is read again so the UI never
// renders the previous song's snapshot for a frame.
import type { LocalMedia } from "@pocketjs/framework/localmedia";
import { initialPlayer, reducePlayer, type PlayerAction, type PlayerCommand, type PlayerState } from "./reducer.ts";

export interface PlayerController {
  state(): PlayerState;
  dispatch(action: PlayerAction): void;
  poll(): void;
}

export function runCommands(media: LocalMedia, commands: readonly PlayerCommand[]): void {
  for (const command of commands) {
    if (command.type === "open") media.open(command.id);
    else if (command.type === "paused") media.pause(command.value);
    else media.seek(command.ms);
  }
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
    runCommands(media, reduced.commands);
    return reduced.commands.length;
  };
  return {
    state: () => state,
    dispatch(action) {
      if (apply(action) > 0) apply({ type: "hostStatus", status: media.status() });
      options.onChange?.(state);
    },
    poll() {
      apply({ type: "hostStatus", status: media.status() });
      options.onChange?.(state);
    },
  };
}
