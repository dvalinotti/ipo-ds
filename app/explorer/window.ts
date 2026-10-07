// The Explorer list's window arithmetic (RecycledList, the Explorer's scroll position).

/** The row index slot `slot` shows for a window starting at `top` in a pool of `n` slots. */
export function slotIndex(slot: number, top: number, n: number): number {
  return top + ((((slot - top) % n) + n) % n);
}

/** The `top` that keeps `focus` in a window of `rows` with the least movement from `previous`. */
export function nearestTop(previous: number, focus: number, rows: number, count: number): number {
  const max = Math.max(0, count - rows);
  let top = Math.min(Math.max(0, previous), max);
  if (focus < top) top = focus;
  else if (focus >= top + rows) top = focus - rows + 1;
  return Math.min(Math.max(0, top), max);
}
