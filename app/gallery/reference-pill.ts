// The reference button (a Mac OS X "default" push button, 230×88 at 2×) as an
// Aqua gel at the gallery's scale, for the side-by-side check in
// docs/superpowers/specs/2026-10-07-aqua-gels-design.md §6.3. Gallery-only.
import type { GelClasses } from "../theme/theme.ts";

export const REFERENCE_PILL: GelClasses = {
  body: "absolute left-[20] top-[16] w-[115] h-[44] rounded-[22] items-center justify-center shadow bg-gradient-to-b from-[#4a80da] via-[#4a80da] to-[#c8daf6] border border-[#2b4f8c]",
  gloss: "absolute left-[9] top-[2] w-[97] h-[18] rounded-[9] bg-gradient-to-b from-[#f5f8fe] via-[#d3e1f8] to-[#93b4eb]",
};
export const REFERENCE_LABEL = "text-base font-bold text-white";
export const REFERENCE_LABEL_SHADOW = "absolute left-[0] top-[1] text-base font-bold text-[#1d3f8099]";
