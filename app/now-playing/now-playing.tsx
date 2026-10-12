// The bottom screen while not searching: the playing song's art, info LCD,
// a drag-to-seek capsule (one seek on release) and the transport row. The
// LCD's status row shows a playback error, or diagnostics while L+R are held.
// The transport row's last gel opens DJ Mode. On the top screen (layout "wide", swapped) the deck is
// 400 px wide, has no touch, and owns A (play / pause) and left / right (seek).
import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { getOps } from "@pocketjs/framework";
import { View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
import { createMediaScrubber } from "@pocketjs/framework/media";
import { seekTarget } from "../controls.ts";
import { onRepeat } from "../input.ts";
import { formatRemaining, formatTime, needsHours } from "../format.ts";
import type { Session } from "../session.ts";
import { frameNote } from "./frame-time.ts";
import { AQUA } from "../theme/aqua.ts";
import { ArtFrame, CoverImage, CoverLoading, InfoLcd, SeekCapsule, seekTrackLeft, seekTrackPx, TransportRow } from "../theme/parts/deck.tsx";
import { IdlePanel } from "../theme/parts/panels.tsx";
import type { Layout } from "../theme/theme.ts";

export function NowPlaying(props: { layout: Layout; session: Session; onDj?: () => void }) {
  const wide = props.layout === "wide";
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
  // A drag belongs to the song it started on. When another open lands under it (the song ended
  // and the next one started, or a skip), the release must not seek the new song to the old
  // preview. Every open carries a new serial (a skip, the next song, repeat-one's reopen), so the
  // memo fires once per open and not on the 15 Hz status reads.
  const opened = createMemo(() => status().openSerial);
  createEffect(on(opened, () => {
    if (!scrubber.active()) return;
    scrubber.cancel();
    setPreview(null);
  }, { defer: true }));
  const trackPx = () => seekTrackPx(hours(), props.layout);
  const fractionAt = (x: number) => (x - seekTrackLeft(hours())) / trackPx();
  /** Downs on the time labels are not seeks (a tap on "-3:58" would jump to the end). */
  const onTrack = (x: number) => x >= seekTrackLeft(hours()) - 6 && x <= seekTrackLeft(hours()) + trackPx() + 6;
  let capsule: unknown = null;
  // The top screen has no digitizer: no drag recognizer there.
  if (!wide) {
    createGesture({
      surface: "auxiliary",
      axis: "x",
      region: { node: () => capsule as never },
      onDown: (c) => {
        // No duration (a VBR file without a header reports 0): nothing to map the contact to, so no seek.
        if (idle() || duration() <= 0 || !onTrack(c.x)) return;
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
  }
  // Wide (top screen, swapped): A and left / right drive playback (spec §6.2). This screen is unmounted
  // while the keyboard is open, so the handlers need no search gate; latched keeps a button that was
  // already down at mount (A through a swap) from firing.
  if (wide) {
    onButtonPress(BTN.CIRCLE, () => { if (!idle()) dispatch({ type: "toggle" }); }, { latched: true });
    // Left / right seek through the same scrubber as the capsule drag: the press previews ±5 s, each repeat
    // ±2 s more from the preview, and the release sends the one seek. A seek is a host command that forces
    // a status re-read and can flush the decoder, so a held button must not send one at the repeat rate.
    const seekBy = (direction: -1 | 1, repeat: boolean) => {
      if (idle() || duration() <= 0) return;
      const from = repeat && scrubber.active() ? scrubber.preview() * 1000 : status().positionMs;
      const target = seekTarget(from, duration(), direction, repeat);
      if (target === null) return;
      if (scrubber.active()) scrubber.move(target / duration(), duration() / 1000);
      else scrubber.begin(target / duration(), duration() / 1000);
      setPreview(scrubber.preview() * 1000);
    };
    const commitSeek = () => {
      if (!scrubber.active()) return;
      scrubber.commit();
      setPreview(null);
    };
    onRepeat(BTN.LEFT, (repeat) => seekBy(-1, repeat), () => true, commitSeek);
    onRepeat(BTN.RIGHT, (repeat) => seekBy(1, repeat), () => true, commitSeek);
  }
  const position = () => preview() ?? status().positionMs;
  const SHOULDERS = BTN.LTRIGGER | BTN.RTRIGGER;
  const [diagnostics, setDiagnostics] = createSignal(false);
  const [frameTime, setFrameTime] = createSignal("F:-");
  let heldFrames = 0;
  onFrame((buttons) => {
    const held = (buttons & SHOULDERS) === SHOULDERS;
    // The host's frame time is read only while L+R are held: at once, then twice a second.
    if (held && heldFrames++ % 30 === 0) setFrameTime(frameNote(getOps().debugStats?.()));
    if (!held) heldFrames = 0;
    setDiagnostics(held);
  });
  const note = () => {
    const now = status();
    if (diagnostics()) return `U:${now.underruns} D:${now.decodeLoad}% A:${now.artHandles} ${frameTime()}`;
    return now.phase === "error" ? now.error : undefined;
  };
  const playing = () => status().phase === "playing" || status().phase === "loading";

  return (
    <View class={AQUA.bottomScreen}>
      <Show when={!idle()} fallback={<IdlePanel layout={props.layout} />}>
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
          layout={props.layout}
        />
      </Show>
      <SeekCapsule
        ref={(node) => (capsule = node)}
        elapsed={idle() ? "--:--" : formatTime(position(), hours())}
        remaining={idle() ? "--:--" : formatRemaining(position(), duration())}
        fraction={duration() > 0 ? position() / duration() : 0}
        enabled={!idle()}
        hours={hours()}
        layout={props.layout}
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
        onDj={props.onDj}
        layout={props.layout}
        touch={!wide}
      />
    </View>
  );
}
