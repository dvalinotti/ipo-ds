// The touch Explorer's scroll arithmetic (spec §5.2–§5.4), pure: the Explorer binds it to the
// framework's kinetic scroller. Offsets are px of content above the window; `max` is the
// largest offset, (rows − page) × row height, never negative.

/** The bottom screen's width, and the scrollbar's hit region at its right edge (the drawn track is 14). */
export const NARROW_W = 320;
export const TRACK_HIT_PX = 20;

const clamp = (value: number, max: number) => Math.min(Math.max(0, max), Math.max(0, value));

/** Whole rows above the window and the sub-row remainder the canvas is shifted by. */
export function splitOffset(offset: number, rowPx: number): { top: number; shift: number } {
  const top = Math.floor(offset / rowPx);
  return { top, shift: offset - top * rowPx };
}

/** The row boundary nearest a rest position, inside the range. */
export function snapToRow(rest: number, rowPx: number, max: number): number {
  return clamp(Math.round(rest / rowPx) * rowPx, max);
}

export function clampVelocity(v: number, max: number): number {
  return Math.min(max, Math.max(-max, v));
}

/** The row under screen y, or −1 above the body or past the last row. */
export function rowAt(y: number, bodyTop: number, offset: number, rowPx: number, count: number): number {
  if (y < bodyTop) return -1;
  const index = Math.floor((y - bodyTop + offset) / rowPx);
  return index < count ? index : -1;
}

/** Thumb top and height for `offset` px of `content` in a `view` px window; null when it all fits. */
export function thumbFor(offset: number, content: number, view: number): { top: number; height: number } | null {
  if (content <= view) return null;
  const height = Math.max(16, Math.round((view * view) / content));
  return { top: Math.round((clamp(offset, content - view) / (content - view)) * (view - height)), height };
}

/** The offset that puts the thumb's top at `thumbTop` px down the track. */
export function offsetForThumb(thumbTop: number, content: number, view: number, thumbHeight: number): number {
  const travel = view - thumbHeight;
  if (travel <= 0) return 0;
  return clamp((thumbTop / travel) * (content - view), content - view);
}

export function pageOffset(offset: number, direction: -1 | 1, pagePx: number, max: number): number {
  return clamp(offset + direction * pagePx, max);
}

/** The offset that shows `row` in the middle of a `page`-row window. */
export function centredOffset(row: number, page: number, rowPx: number, max: number): number {
  return clamp((row - Math.floor(page / 2)) * rowPx, max);
}

/** Toolbar 34 + rule, header 15 + rule, and 21 per strip (search, crumb) above the list body. */
export function bodyTopPx(strips: number): number {
  return 51 + strips * 21;
}
