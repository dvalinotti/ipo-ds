// Tag text from some taggers (macOS tools, decomposed filenames) carries
// accents as a base letter plus a combining mark. The baked font draws the
// precomposed letter, so compose them before anything is shown.
import { COMPOSE } from "./compose-table.ts";

const MARK = /[\u0300-\u036f]/;

export function composeMarks(text: string): string {
  if (!MARK.test(text)) return text;
  let out = "";
  for (const ch of text) {
    const composed = MARK.test(ch) && out.length > 0 ? COMPOSE[out[out.length - 1]! + ch] : undefined;
    out = composed ? out.slice(0, -1) + composed : out + ch;
  }
  return out;
}
