// The app's connection to the host's local media module: scans at launch,
// rebuilds the library after every completed scan (composing decomposed
// accents first), runs the player controller and polls status once per frame.
// Everything the screens read is a Solid signal here, including the open
// track's cover texture.
import { createMemo, createSignal, type Accessor } from "solid-js";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { localMedia, type LocalMedia, type LocalStatus, type LocalTrack } from "@pocketjs/framework/localmedia";
import { composeMarks } from "./library/compose.ts";
import { buildLibrary, type Library } from "./library/library.ts";
import { createPlayerController, type PlayerController } from "./player/controller.ts";
import { IDLE_STATUS, initialPlayer, type PlayerAction, type PlayerState } from "./player/reducer.ts";

/** The player as the screens see it: the queue, its order and position, the modes. The status moves
 * every frame of playback and is read from `status`; it is not part of this view. */
export type PlayerView = Omit<PlayerState, "status">;

export interface Session {
  /** False on a build without media.local. */
  available: boolean;
  /** Null until the first scan completes. */
  library: Accessor<Library | null>;
  player: Accessor<PlayerView>;
  status: Accessor<LocalStatus>;
  scanning: Accessor<boolean>;
  /** A host reply failed validation; the screens report it instead of crashing the frame. */
  readFailed: Accessor<boolean>;
  /** The open track's details. A rescan can drop its file while the host keeps streaming it,
   * so the last details seen for the open id stay until another song opens. */
  track: Accessor<LocalTrack | null>;
  /** The open track's cover texture; 0 shows the placeholder (or the spinner while loading). A
   * track change releases the previous cover at once. */
  cover: Accessor<number>;
  /** The open track has art that is still decoding. */
  coverLoading: Accessor<boolean>;
  dispatch(action: PlayerAction): void;
  rescan(): void;
}

/** The host's local media module, or null on a build without media.local. */
function connect(): LocalMedia | null {
  try {
    return localMedia();
  } catch {
    return null;
  }
}

function composed(track: LocalTrack): LocalTrack {
  return { ...track, title: composeMarks(track.title), artist: composeMarks(track.artist), album: composeMarks(track.album) };
}

/** Frames between status reads (15 Hz at 60 fps); "loading" and a failed read poll every frame. */
export const POLL_EVERY = 4;

function samePlayer(a: PlayerState, b: PlayerState): boolean {
  return a.queue === b.queue && a.order === b.order && a.index === b.index && a.shuffle === b.shuffle
    && a.repeat === b.repeat && a.serial === b.serial && a.failures === b.failures;
}

export function createSession(media: LocalMedia | null = connect()): Session {
  const [library, setLibrary] = createSignal<Library | null>(null);
  // The status inside the player state changes every frame of playback; screens read it from
  // `status`, so the player signal only fires when the queue or its position in it changes.
  const [player, setPlayer] = createSignal<PlayerState>(initialPlayer(), { equals: samePlayer });
  const [status, setStatus] = createSignal<LocalStatus>(IDLE_STATUS);
  const [scanning, setScanning] = createSignal(media !== null);
  // Two kinds of bad host reply: a status read (cleared by the next good poll) and a
  // track list (kept until a later scan reads cleanly, or the library would sit at "Scanning").
  const [statusFailed, setStatusFailed] = createSignal(false);
  const [listFailed, setListFailed] = createSignal(false);
  const readFailed = () => statusFailed() || listFailed();
  const [cover, setCover] = createSignal(0);
  const [coverLoading, setCoverLoading] = createSignal(false);
  let controller: PlayerController | null = null;
  // The id whose cover is shown or requested, and whether its request resolved.
  let coverFor = -1;
  let coverResolved = true;
  // Read the status on the next frame regardless of the playing cadence (after a command).
  let pollNext = true;

  if (media) {
    controller = createPlayerController(media, { onChange: setPlayer });
    let generation = 0;
    media.scan();
    // A frame that throws tears the guest down on the 3DS host, so a host
    // reply that does not validate becomes an on-screen error instead.
    let frame = 0;
    onFrame(() => {
      // Nothing in a snapshot moves faster than the seek bar needs, so every POLL_EVERY frames is
      // enough in every phase (15 Hz at 60 fps). "loading" is read each frame so a refused or
      // corrupt open is skipped at once; a command re-reads at once (pollNext); a failed read retries.
      frame++;
      if (!pollNext && !statusFailed() && status().phase !== "loading" && frame % POLL_EVERY !== 0) return;
      pollNext = false;
      let now: LocalStatus;
      try {
        controller!.poll();
        now = controller!.state().status;
      } catch {
        setStatusFailed(true);
        return;
      }
      publish(now);
      if (now.scanGeneration === generation) return;
      generation = now.scanGeneration;
      try {
        const next = buildLibrary(media.tracks().map(composed));
        setLibrary(next);
        setListFailed(false);
        controller!.dispatch({ type: "prune", ids: [...next.tracks.keys()] });
      } catch {
        setListFailed(true);
      }
    });
  }

  /** What the screens read from a snapshot: the status, the scan flag and the open track's cover. */
  function publish(now: LocalStatus): void {
    setStatusFailed(false);
    setStatus(now);
    setScanning(now.scanning);
    updateCover(now.trackId);
  }

  /** Asks for the open track's art each frame until it resolves; tracks without art never ask. */
  function updateCover(id: number): void {
    if (!media) return;
    if (id !== coverFor) {
      coverFor = id;
      coverResolved = false;
      // The old cover belongs to another song: drop it now rather than show it under this one.
      const previous = cover();
      if (previous > 0) {
        setCover(0);
        media.releaseArtwork(previous);
      }
    }
    if (coverResolved) return;
    let next = 0;
    if (id >= 0 && track()?.hasArt) {
      const art = media.artwork(id);
      if (art === "pending") {
        setCoverLoading(true);
        return;
      }
      next = art;
    }
    coverResolved = true;
    setCoverLoading(false);
    setCover(next);
  }
  let last: LocalTrack | null = null;
  const track = createMemo(() => {
    const id = status().trackId;
    if (id < 0) return null;
    const known = library()?.tracks.get(id) ?? null;
    if (known) last = known;
    return known ?? (last?.id === id ? last : null);
  });

  return {
    available: media !== null,
    library,
    player,
    status,
    scanning,
    readFailed,
    track,
    cover,
    coverLoading,
    // A command re-reads the status; a reply that fails validation must not throw out of the frame.
    dispatch: (action) => {
      pollNext = true;
      if (!controller) return;
      const before = controller.state().status;
      try {
        controller.dispatch(action);
      } catch {
        setStatusFailed(true);
        return;
      }
      // The controller re-reads the status only for a command it sent to the host: show that
      // snapshot on this frame, not the next. A command that sent nothing read nothing, so there is
      // nothing to publish and no failed read to clear.
      const now = controller.state().status;
      if (now !== before) publish(now);
    },
    rescan: () => {
      pollNext = true;
      media?.scan();
    },
  };
}
