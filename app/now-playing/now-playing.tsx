// The bottom screen while not searching: the playing song's art, info LCD,
// a drag-to-seek capsule (one seek on release) and the transport row.
import { createMemo, createSignal, Show } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { createMediaScrubber } from "@pocketjs/framework/media";
import type { LocalTrack } from "@pocketjs/framework/localmedia";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ArtFrame, InfoLcd, SEEK_TRACK_PX, SEEK_TRACK_WIDE_PX, SeekCapsule, seekTrackLeft, TransportRow } from "../theme/parts/deck.tsx";
import { IdlePanel } from "../theme/parts/panels.tsx";

export function NowPlaying(props: { session: Session }) {
  const status = props.session.status;
  const player = props.session.player;
  const dispatch = props.session.dispatch;
  // A rescan can drop the playing song's file while the host keeps streaming
  // it, so the last details seen for the open id stay on screen.
  let last: LocalTrack | null = null;
  const track = createMemo(() => {
    const id = status().trackId;
    if (id < 0) return null;
    const known = props.session.library()?.tracks.get(id) ?? null;
    if (known) last = known;
    return known ?? (last?.id === id ? last : null);
  });
  const idle = () => player().index < 0 || track() === null;
  const duration = () => status().durationMs;
  const hours = () => needsHours(duration());

  // Drag-to-seek: preview locally while the contact moves, one seek on release.
  const [preview, setPreview] = createSignal<number | null>(null);
  const scrubber = createMediaScrubber((seconds) => dispatch({ type: "seek", ms: seconds * 1000 }));
  const fractionAt = (x: number) => (x - seekTrackLeft(hours())) / (hours() ? SEEK_TRACK_WIDE_PX : SEEK_TRACK_PX);
  let capsule: unknown = null;
  createGesture({
    surface: "auxiliary",
    axis: "x",
    region: { node: () => capsule as never },
    onDown: (c) => {
      if (idle()) return;
      scrubber.begin(fractionAt(c.x), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    },
    onMove: (c) => {
      if (!scrubber.active()) return;
      scrubber.move(fractionAt(c.x), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    },
    onUp: () => {
      scrubber.commit();
      setPreview(null);
    },
    onCancel: () => {
      scrubber.cancel();
      setPreview(null);
    },
  });
  const position = () => preview() ?? status().positionMs;
  const playing = () => status().phase === "playing" || status().phase === "loading";

  return (
    <View class={AQUA.bottomScreen}>
      <Show when={!idle()} fallback={<IdlePanel />}>
        <ArtFrame album={track()!.album} />
        <InfoLcd
          title={track()!.title}
          artist={track()!.artist}
          album={track()!.album}
          position={`${player().index + 1} of ${player().order.length}`}
          shuffle={player().shuffle}
          repeat={player().repeat}
        />
      </Show>
      <SeekCapsule
        ref={(node) => (capsule = node)}
        elapsed={idle() ? "--:--" : formatTime(position())}
        remaining={idle() ? "--:--" : formatRemaining(position(), duration())}
        fraction={duration() > 0 ? position() / duration() : 0}
        enabled={!idle()}
        hours={hours()}
      />
      <TransportRow
        playing={playing()}
        shuffle={player().shuffle}
        repeat={player().repeat}
        enabled={!idle()}
        onShuffle={() => dispatch({ type: "toggleShuffle" })}
        onPrev={() => dispatch({ type: "prev" })}
        onToggle={() => dispatch({ type: "toggle" })}
        onNext={() => dispatch({ type: "next" })}
        onRepeat={() => dispatch({ type: "cycleRepeat" })}
      />
    </View>
  );
}
