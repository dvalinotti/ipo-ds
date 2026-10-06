import { afterAll, expect, test } from "bun:test";
import { bootApp, disposeGuest, screenText } from "./support/app-world.ts";

afterAll(disposeGuest);

test("both screens mount: the explorer on top, the now-playing deck below", async () => {
  const world = await bootApp();
  for (let frame = 0; frame < 5; frame++) world.step();
  expect(world.failure).toBeNull();
  expect(screenText(world, "primary")).toContain("Ds Man");
  expect(screenText(world, "auxiliary")).toContain("Nothing playing — pick a song above");
}, 120_000);
