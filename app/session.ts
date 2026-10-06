// The app's connection to the host's local media module: scans at launch,
// rebuilds the library after every completed scan (composing decomposed
// accents first), runs the player controller and polls status once per frame.
// Everything the screens read is a Solid signal here.
import { createSignal, type Accessor } from "solid-js";
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
  const [readFailed, setReadFailed] = createSignal(false);
  let controller: PlayerController | null = null;

  if (media) {
    controller = createPlayerController(media, { onChange: setPlayer });
    let generation = 0;
    media.scan();
    // A frame that throws tears the guest down on the 3DS host, so a host
    // reply that does not validate becomes an on-screen error instead.
    onFrame(() => {
      try {
        controller!.poll();
        const now = controller!.state().status;
        setStatus(now);
        setScanning(now.scanning);
        if (now.scanGeneration !== generation) {
          generation = now.scanGeneration;
          const next = buildLibrary(media.tracks().map(composed));
          setLibrary(next);
          controller!.dispatch({ type: "prune", ids: [...next.tracks.keys()] });
          setReadFailed(false);
        }
      } catch {
        setReadFailed(true);
      }
    });
  }

  return {
    available: media !== null,
    library,
    player,
    status,
    scanning,
    readFailed,
    dispatch: (action) => controller?.dispatch(action),
    rescan: () => {
      media?.scan();
    },
  };
}
