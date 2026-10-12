import { expect, test } from "bun:test";
import { placement } from "../app/placement.ts";

test("the keyboard and DJ Mode always take the bottom screen; the keyboard pulls the Explorer up", () => {
  expect(placement(false, false, false)).toEqual({ top: "explorer", bottom: "deck" });
  expect(placement(false, true, false)).toEqual({ top: "explorer", bottom: "dj" });
  expect(placement(false, false, true)).toEqual({ top: "explorer", bottom: "keyboard" });
  expect(placement(false, true, true)).toEqual({ top: "explorer", bottom: "keyboard" });
  expect(placement(true, false, false)).toEqual({ top: "deck", bottom: "explorer" });
  expect(placement(true, true, false)).toEqual({ top: "deck", bottom: "dj" });
  expect(placement(true, false, true)).toEqual({ top: "explorer", bottom: "keyboard" });
  expect(placement(true, true, true)).toEqual({ top: "explorer", bottom: "keyboard" });
});
