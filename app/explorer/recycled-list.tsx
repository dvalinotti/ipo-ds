// The Explorer's list: a fixed pool of row slots over a window of the rows.
// Slot k always shows the row whose index is congruent to k modulo the pool
// size, so scrolling one row rebinds one slot (its texts and its top) and
// moves the list by a transform; no row is created or destroyed while the
// list scrolls. The Explorer owns focus and the scroll position (`top`).
import { createComputed, createMemo, createSignal, Index, Show, type Accessor, type JSX, type Setter } from "solid-js";
import { View } from "@pocketjs/framework/components";
import { slotIndex } from "./window.ts";

export function RecycledList(props: {
  count: number;
  rowHeight: number;
  /** Rows the window shows (the body height in rows). */
  rows: number;
  /** Index of the first row in the window. */
  top: number;
  /** Renders slot `slot` (constant), which shows row `index()`; with the even pool, `index()`
   * always has the parity of `slot`. */
  slot: (index: Accessor<number>, slot: number) => JSX.Element;
}) {
  // At least one extra slot, so a row entering the window never shares a slot with one still
  // showing, rounded up to even: a slot's rows then all have the same parity, so its stripe never
  // changes when it rebinds.
  const pool = createMemo(() => Math.min(props.count, props.rows + 1 + ((props.rows + 1) % 2)));
  const slots = createMemo(() => Array.from({ length: pool() }, (_, k) => k));
  // One signal per slot, set by a single computation: scrolling one row changes one slot's
  // index, and only that slot hears about it.
  const indices: [Accessor<number>, Setter<number>][] = [];
  const slotSignal = (k: number) => (indices[k] ??= createSignal(slotIndex(k, props.top, Math.max(1, pool()))));
  createComputed(() => {
    const n = pool(), top = props.top;
    for (let k = 0; k < n; k++) slotSignal(k)[1](slotIndex(k, top, n));
  });
  return (
    <View class="absolute left-[0] top-[0] w-full" style={{ translateY: -props.top * props.rowHeight }}>
      <Index each={slots()}>
        {(slot) => {
          const index = slotSignal(slot())[0];
          return (
            <Show when={index() < props.count}>
              <View class="absolute left-[0] w-full" style={{ insetT: index() * props.rowHeight, height: props.rowHeight }}>
                {props.slot(index, slot())}
              </View>
            </Show>
          );
        }}
      </Index>
    </View>
  );
}
