import { normalize } from "../library/normalize.ts";
export interface PlaceholderArt { hue: number; initials: string }
/** FNV-1a (32-bit) over the folded album name, finalized with fmix32, picks a hue; initials come from the name as written. */
export function placeholderArt(album: string, hueCount: number): PlaceholderArt {
  let hash = 0x811c9dc5;
  for (const ch of normalize(album)) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // fmix32 (MurmurHash3's finalizer) spreads FNV's low bits before the modulo.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  // Initials come from letters and digits only: punctuation ("(What's…",
  // "...And…") and combining marks are skipped. A letter whose case mapping
  // expands (ß → SS) keeps its own form so initials stay two characters.
  const letters = [...album].filter((ch) => /[\p{L}\p{N}]/u.test(ch));
  const fold = (ch: string, mapped: string) => ([...mapped].length === 1 ? mapped : ch);
  const initials = letters.length === 0
    ? "♪"
    : fold(letters[0]!, letters[0]!.toUpperCase()) + (letters[1] ? fold(letters[1], letters[1].toLowerCase()) : "");
  return { hue: (hash >>> 0) % hueCount, initials };
}
