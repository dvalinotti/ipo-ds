// The bottom screen while not searching: the playing song's art, info LCD,
// a drag-to-seek capsule (one seek on release) and the transport row. The
// LCD's status row shows a playback error, or diagnostics while L+R are held.
import { createSignal, Show } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { createMediaScrubber } from "@pocketjs/framework/media";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { AQUA } from "../theme/aqua.ts";
import { ArtFrame, CoverImage, CoverLoading, InfoLcd, SEEK_TRACK_PX, SEEK_TRACK_WIDE_PX, SeekCapsule, seekTrackLeft, TransportRow } from "../theme/parts/deck.tsx";
import { IdlePanel } from "../theme/parts/panels.tsx";

export function NowPlaying(props: { session: Session }) {
  const status = props.session.status;
  const player = props.session.player;
  const dispatch = props.session.dispatch;
  const track = props.session.track;
  const idle = () => player().index < 0 || track() === null;
  const duration = () => status().durationMs;
  const hours = () => needsHours(duration());

  // Drag-to-seek: preview locally while the contact moves, one seek on release.
  const [preview, setPreview] = createSignal<number | null>(null);
  const scrubber = createMediaScrubber((seconds) => dispatch({ type: "seek", ms: seconds * 1000 }));
  const trackPx = () => (hours() ? SEEK_TRACK_WIDE_PX : SEEK_TRACK_PX);
  const fractionAt = (x: number) => (x - seekTrackLeft(hours())) / trackPx();
  /** Downs on the time labels are not seeks (a tap on "-3:58" would jump to the end). */
  const onTrack = (x: number) => x >= seekTrackLeft(hours()) - 6 && x <= seekTrackLeft(hours()) + trackPx() + 6;
  let capsule: unknown = null;
  createGesture({
    surface: "auxiliary",
    axis: "x",
    region: { node: () => capsule as never },
    onDown: (c) => {
      if (idle() || !onTrack(c.x)) return;
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
  const SHOULDERS = BTN.LTRIGGER | BTN.RTRIGGER;
  const [diagnostics, setDiagnostics] = createSignal(false);
  onFrame((buttons) => setDiagnostics((buttons & SHOULDERS) === SHOULDERS));
  const note = () => {
    const now = status();
    if (diagnostics()) return `U:${now.underruns} D:${now.decodeLoad}% A:${now.artHandles}`;
    return now.phase === "error" ? now.error : undefined;
  };
  const playing = () => status().phase === "playing" || status().phase === "loading";

  return (
    <View class={AQUA.bottomScreen}>
      <Show when={!idle()} fallback={<IdlePanel />}>
        <ArtFrame album={track()!.album}>
          {props.session.coverLoading() ? <CoverLoading /> : props.session.cover() > 0 ? <CoverImage handle={props.session.cover()} /> : undefined}
        </ArtFrame>
        <InfoLcd
          title={track()!.title}
          artist={track()!.artist}
          album={track()!.album}
          position={`${player().index + 1} of ${player().order.length}`}
          shuffle={player().shuffle}
          repeat={player().repeat}
          note={note()}
          alert={!diagnostics() && status().phase === "error"}
        />
      </Show>
      <SeekCapsule
        ref={(node) => (capsule = node)}
        elapsed={idle() ? "--:--" : formatTime(position(), hours())}
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
