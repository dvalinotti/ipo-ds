// Text-width caching for the marquee.

/** Caches `measure` by font slot and text, dropping the oldest entry past `max`. */
export function measureCache(measure: (text: string, slot: number) => number, max = 512): (text: string, slot: number) => number {
  const widths = new Map<string, number>();
  return (text, slot) => {
    const key = `${slot}\u0000${text}`;
    let width = widths.get(key);
    if (width === undefined) {
      width = measure(text, slot);
      if (widths.size >= max) widths.delete(widths.keys().next().value!);
      widths.set(key, width);
    }
    return width;
  };
}
