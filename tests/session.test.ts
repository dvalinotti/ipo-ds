import { expect, test } from "bun:test";
import { createRoot } from "solid-js";
import { createSession } from "../app/session.ts";

test("without media.local the session is unavailable and every call is inert", () => {
  createRoot((dispose) => {
    const session = createSession(null);
    expect(session.available).toBe(false);
    expect(session.library()).toBeNull();
    expect(session.status().phase).toBe("idle");
    expect(session.scanning()).toBe(false);
    expect(session.readFailed()).toBe(false);
    session.dispatch({ type: "toggle" });
    session.rescan();
    session.scratch.begin();
    session.scratch.rate(2);
    session.scratch.end();
    expect(session.scratching()).toBe(false);
    expect(session.player().index).toBe(-1);
    expect(session.track()).toBeNull();
    // The player view carries no status: screens read status(), which moves every frame of playback.
    // @ts-expect-error the status is not part of the player view
    session.player().status;
    dispose();
  });
});
