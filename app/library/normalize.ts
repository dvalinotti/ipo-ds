// Search and sort keys: lowercase, Latin-1 and Latin Extended-A letters
// folded to ASCII, runs of whitespace collapsed. A fixed table rather than
// String.prototype.normalize, which the 3DS QuickJS build is not assumed to
// carry.
const GROUPS: readonly (readonly [string, string])[] = [
  ["a", "àáâãäåāăą"], ["c", "çćĉċč"], ["d", "ďđð"], ["e", "èéêëēĕėęě"], ["g", "ĝğġģ"],
  ["h", "ĥħ"], ["i", "ìíîïĩīĭįı"], ["j", "ĵ"], ["k", "ķĸ"], ["l", "ĺļľŀł"],
  ["n", "ñńņňŉŋ"], ["o", "òóôõöøōŏő"], ["r", "ŕŗř"], ["s", "śŝşšſ"], ["t", "ţťŧ"],
  ["u", "ùúûüũūŭůűų"], ["w", "ŵ"], ["y", "ýÿŷ"], ["z", "źżž"],
  ["ae", "æ"], ["oe", "œ"], ["ss", "ß"], ["th", "þ"],
];
const FOLD = new Map<string, string>();
for (const [ascii, letters] of GROUPS) for (const letter of letters) FOLD.set(letter, ascii);

export function normalize(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) out += FOLD.get(ch) ?? ch;
  return out.replace(/\s+/g, " ").trim();
}
