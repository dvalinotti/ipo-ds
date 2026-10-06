// The player as a pure function: (state, action) -> (state, commands). The
// host adapter runs the commands against media.local and feeds each status
// snapshot back as a hostStatus action.
import type { LocalStatus } from "@pocketjs/framework/localmedia";

export type Repeat = "off" | "all" | "one";
export interface PlayerState {
  /** The list the user played from, in its original order. */
  queue: readonly number[];
  /** The play order: queue, or queue shuffled with the current song first. */
  order: readonly number[];
  /** Position in order; -1 before anything plays. */
  index: number;
  shuffle: boolean;
  repeat: Repeat;
  /** The last host snapshot. */
  status: LocalStatus;
  /** Consecutive songs that failed to play. */
  failures: number;
  /** Serial the host returned for the latest open; 0 until it is known. */
  serial: number;
}
export type PlayerAction =
  | { type: "playFrom"; ids: readonly number[]; startId: number }
  | { type: "toggle" } | { type: "next" } | { type: "prev" }
  | { type: "seek"; ms: number }
  | { type: "toggleShuffle" } | { type: "cycleRepeat" }
  | { type: "hostStatus"; status: LocalStatus }
  /** The host accepted the latest open command and returned this serial. */
  | { type: "opened"; serial: number }
  /** A rescan listed these ids; drop the rest from the queue (the current song stays). */
  | { type: "prune"; ids: readonly number[] };
export type PlayerCommand = { type: "open"; id: number } | { type: "paused"; value: boolean } | { type: "seek"; ms: number };
export interface Reduced { state: PlayerState; commands: PlayerCommand[] }

export const RESTART_THRESHOLD_MS = 3000;
export const IDLE_STATUS: LocalStatus = Object.freeze({
  phase: "idle", trackId: -1, openSerial: 0, positionMs: 0, durationMs: 0, scanning: false, scanGeneration: 0, underruns: 0, error: "",
});

export function initialPlayer(): PlayerState {
  return { queue: [], order: [], index: -1, shuffle: false, repeat: "off", status: IDLE_STATUS, failures: 0, serial: 0 };
}

export function currentId(state: PlayerState): number {
  return state.index >= 0 ? state.order[state.index]! : -1;
}

/** Fisher–Yates over a copy; `random` returns [0, 1). */
export function shuffled(ids: readonly number[], random: () => number): number[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const none = (state: PlayerState): Reduced => ({ state, commands: [] });
const openAt = (state: PlayerState, index: number): Reduced =>
  ({ state: { ...state, index, serial: 0 }, commands: [{ type: "open", id: state.order[index]! }] });

/** auto: the host finished or failed the song; failed: it failed. */
function advance(state: PlayerState, auto: boolean, failed: boolean): Reduced {
  if (auto && !failed && state.repeat === "one") return openAt(state, state.index);
  if (state.index + 1 < state.order.length) return openAt(state, state.index + 1);
  if (state.repeat === "all") return openAt(state, 0);
  if (!auto || failed) return none(state);
  return { state, commands: [{ type: "seek", ms: 0 }, { type: "paused", value: true }] };
}

export function reducePlayer(state: PlayerState, action: PlayerAction, random: () => number = Math.random): Reduced {
  switch (action.type) {
    case "playFrom": {
      if (!action.ids.includes(action.startId)) return none(state);
      const queue = [...action.ids];
      const order = state.shuffle
        ? [action.startId, ...shuffled(queue.filter((id) => id !== action.startId), random)]
        : queue;
      return openAt({ ...state, queue, order, failures: 0 }, order.indexOf(action.startId));
    }
    case "toggle": {
      if (state.index < 0) return none(state);
      const { phase, trackId } = state.status;
      if (trackId !== currentId(state) || phase === "idle" || phase === "error" || phase === "ended") return openAt(state, state.index);
      if (phase === "paused") return { state, commands: [{ type: "paused", value: false }] };
      return { state, commands: [{ type: "paused", value: true }] };
    }
    case "next":
      return state.index < 0 ? none(state) : advance({ ...state, failures: 0 }, false, false);
    case "prev": {
      if (state.index < 0) return none(state);
      const restart = state.status.trackId === currentId(state) && state.status.positionMs > RESTART_THRESHOLD_MS;
      if (!restart && state.index > 0) return openAt(state, state.index - 1);
      if (!restart && state.repeat === "all") return openAt(state, state.order.length - 1);
      return { state, commands: [{ type: "seek", ms: 0 }] };
    }
    case "seek": {
      if (state.index < 0 || state.status.trackId !== currentId(state)) return none(state);
      const max = state.status.durationMs > 0 ? state.status.durationMs : Number.MAX_SAFE_INTEGER;
      const ms = Number.isFinite(action.ms) ? Math.round(action.ms) : 0;
      return { state, commands: [{ type: "seek", ms: Math.min(max, Math.max(0, ms)) }] };
    }
    case "toggleShuffle": {
      const id = currentId(state);
      if (state.shuffle) return none({ ...state, shuffle: false, order: state.queue, index: id < 0 ? -1 : state.queue.indexOf(id) });
      const rest = shuffled(state.queue.filter((queued) => queued !== id), random);
      return none({ ...state, shuffle: true, order: id < 0 ? rest : [id, ...rest], index: id < 0 ? -1 : 0 });
    }
    case "opened":
      return none({ ...state, serial: action.serial });
    case "prune": {
      const id = currentId(state);
      const keep = new Set(action.ids);
      const kept = (list: readonly number[]) => list.filter((queued) => queued === id || keep.has(queued));
      const order = kept(state.order);
      return none({ ...state, queue: kept(state.queue), order, index: id < 0 ? -1 : order.indexOf(id) });
    }
    case "cycleRepeat":
      return none({ ...state, repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" });
    case "hostStatus": {
      const next = { ...state, status: action.status };
      // A snapshot of another track, or of an earlier open of this one, is stored but never acted on.
      const stale = action.status.trackId !== currentId(state) || (state.serial > 0 && action.status.openSerial !== state.serial);
      if (state.index < 0 || stale) return none(next);
      if (action.status.phase === "playing") return none({ ...next, failures: 0 });
      if (action.status.phase === "ended") return advance({ ...next, failures: 0 }, true, false);
      if (action.status.phase === "error") {
        const failures = state.failures + 1;
        if (failures >= state.order.length) return none({ ...next, failures });
        return advance({ ...next, failures }, true, true);
      }
      return none(next);
    }
  }
}
