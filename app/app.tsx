// Ds Man — a walkman-style MP3 player. The top screen browses the library;
// the bottom screen is the now-playing deck.
import { createSignal } from "solid-js";
import { AuxiliarySurface, Text, View } from "@pocketjs/framework/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { localMedia, type LocalMedia, type LocalTrack } from "@pocketjs/framework/localmedia";
import { libraryLine } from "./library/status.ts";

/** The host's local media module, or null on a build without media.local. */
function connect(): LocalMedia | null {
  try {
    return localMedia();
  } catch {
    return null;
  }
}

export default function App() {
  const media = connect();
  const [tracks, setTracks] = createSignal<LocalTrack[]>([]);
  const [scanning, setScanning] = createSignal(media !== null);
  if (media) {
    let generation = 0;
    media.scan();
    onFrame(() => {
      const status = media.status();
      setScanning(status.scanning);
      if (status.scanGeneration !== generation) {
        generation = status.scanGeneration;
        setTracks(media.tracks());
      }
    });
  }
  return (
    <>
      <View class="w-full h-full flex-col items-center justify-center gap-2 bg-slate-950">
        <Text class="text-xl text-white font-bold">Ds Man</Text>
        <Text class="text-sm text-slate-400">{libraryLine(media !== null, scanning(), tracks().length)}</Text>
      </View>
      <AuxiliarySurface>
        <View class="w-full h-full flex-col items-center justify-center bg-slate-900">
          <Text class="text-sm text-slate-400">Nothing playing — pick a song above</Text>
        </View>
      </AuxiliarySurface>
    </>
  );
}
