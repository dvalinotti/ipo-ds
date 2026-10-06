// The app's connection to the host's local media module: scans at launch,
// rebuilds the library after every completed scan (composing decomposed
// accents first), runs the player controller and polls status once per frame.
// Everything the screens read is a Solid signal here.
import { createMemo, createSignal, type Accessor } from "solid-js";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { localMedia, type LocalMedia, type LocalStatus, type LocalTrack } from "@pocketjs/framework/localmedia";
import { composeMarks } from "./library/compose.ts";
import { buildLibrary, type Library } from "./library/library.ts";
import { createPlayerController, type PlayerController } from "./player/controller.ts";
import { IDLE_STATUS, initialPlayer, type PlayerAction, type PlayerState } from "./player/reducer.ts";

export interface Session {
  /** False on a build without media.local. */
  available: boolean;
  /** Null until the first scan completes. */
  library: Accessor<Library | null>;
  player: Accessor<PlayerState>;
  status: Accessor<LocalStatus>;
  scanning: Accessor<boolean>;
  /** A host reply failed validation; the screens report it instead of crashing the frame. */
  readFailed: Accessor<boolean>;
  /** The open track's details. A rescan can drop its file while the host keeps streaming it,
   * so the last details seen for the open id stay until another song opens. */
  track: Accessor<LocalTrack | null>;
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

export function createSession(media: LocalMedia | null = connect()): Session {
  const [library, setLibrary] = createSignal<Library | null>(null);
  const [player, setPlayer] = createSignal<PlayerState>(initialPlayer(), { equals: false });
  const [status, setStatus] = createSignal<LocalStatus>(IDLE_STATUS);
  const [scanning, setScanning] = createSignal(media !== null);
  // Two kinds of bad host reply: a status read (cleared by the next good poll) and a
  // track list (kept until a later scan reads cleanly, or the library would sit at "Scanning").
  const [statusFailed, setStatusFailed] = createSignal(false);
  const [listFailed, setListFailed] = createSignal(false);
  const readFailed = () => statusFailed() || listFailed();
  let controller: PlayerController | null = null;

  if (media) {
    controller = createPlayerController(media, { onChange: setPlayer });
    let generation = 0;
    media.scan();
    // A frame that throws tears the guest down on the 3DS host, so a host
    // reply that does not validate becomes an on-screen error instead.
    onFrame(() => {
      let now: LocalStatus;
      try {
        controller!.poll();
        now = controller!.state().status;
      } catch {
        setStatusFailed(true);
        return;
      }
      setStatusFailed(false);
      setStatus(now);
      setScanning(now.scanning);
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
    // A command re-reads status; a reply that fails validation must not throw out of the frame.
    dispatch: (action) => {
      try {
        controller?.dispatch(action);
      } catch {
        setStatusFailed(true);
      }
    },
    rescan: () => {
      media?.scan();
    },
  };
}
