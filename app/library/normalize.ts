// Search and sort keys: lowercase, Latin-1 and Latin Extended-A letters
// folded to ASCII, combining marks (U+0300–U+036F, as decomposed tags
// carry them) removed, runs of whitespace collapsed. A fixed table rather than
// String.prototype.normalize, which the 3DS QuickJS build is not assumed to
// carry.
const GROUPS: readonly (readonly [string, string])[] = [
  ["a", "àáâãäåāăą"], ["c", "çćĉċč"], ["d", "ďđð"], ["e", "èéêëēĕėęě"], ["g", "ĝğġģ"],
  ["h", "ĥħ"], ["i", "ìíîïĩīĭįı"], ["j", "ĵ"], ["k", "ķĸ"], ["l", "ĺļľŀł"],
  ["n", "ñńņňŉŋ"], ["o", "òóôõöøōŏő"], ["r", "ŕŗř"], ["s", "śŝşšſ"], ["t", "ţťŧ"],
  ["u", "ùúûüũūŭůűų"], ["w", "ŵ"], ["y", "ýÿŷ"], ["z", "źżž"],
  ["ae", "æ"], ["ij", "ĳ"], ["oe", "œ"], ["ss", "ß"], ["th", "þ"],
];
const FOLD = new Map<string, string>();
for (const [ascii, letters] of GROUPS) for (const letter of letters) FOLD.set(letter, ascii);

export function normalize(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) out += FOLD.get(ch) ?? ch;
  return out.replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
