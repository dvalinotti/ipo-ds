// Which screen shows what (spec §4.1). The keyboard and DJ Mode always take
// the bottom screen; the keyboard pulls the Explorer to the top so its live
// results stay visible; DJ Mode hides whatever the bottom screen was showing.
export type TopScreen = "explorer" | "deck";
export type BottomScreen = "explorer" | "deck" | "dj" | "keyboard";

export interface Placement {
  top: TopScreen;
  bottom: BottomScreen;
}

export function placement(swapped: boolean, dj: boolean, searching: boolean): Placement {
  if (searching) return { top: "explorer", bottom: "keyboard" };
  if (dj) return { top: swapped ? "deck" : "explorer", bottom: "dj" };
  return swapped ? { top: "deck", bottom: "explorer" } : { top: "explorer", bottom: "deck" };
}
