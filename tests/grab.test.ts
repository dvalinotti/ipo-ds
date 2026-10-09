import { expect, test } from "bun:test";
import { createGrab, type GrabHost } from "../app/dj/grab.ts";
import { DEAD_ZONE_PX, PLATTER, SPIN_PER_FRAME } from "../app/dj/platter.ts";

const { cx, cy } = PLATTER;

/** A host that takes grabs (or not) and logs what it is told. */
function fakeHost(takes = true) {
  let scratching = false;
  const log: string[] = [];
  const host: GrabHost & { log: string[]; endItself(): void } = {
    scratch: {
      begin: () => (log.push("begin"), (scratching = takes)),
      rate: (rate) => log.push(`rate ${Math.round(rate * 1000) / 1000}`),
      end: () => (log.push("end"), (scratching = false)),
    },
    scratching: () => scratching,
    log,
    endItself: () => (scratching = false),
  };
  return host;
}

/** The point at `deg` clockwise from 12 o'clock, 60 px out. */
const at = (deg: number) => [cx + 60 * Math.sin((deg * Math.PI) / 180), cy - 60 * Math.cos((deg * Math.PI) / 180)] as const;

test("a down on the record grabs it; off the record or over the corners it does not", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(PLATTER.x + 2, PLATTER.y + 2); // the square's corner, off the disc
  expect(grab.held()).toBe(false);
  expect(host.log).toEqual([]);
  grab.down(...at(90));
  expect(grab.held()).toBe(true);
  expect(host.log).toEqual(["begin"]);
});

test("the record does not turn under a finger whose grab the host did not take", () => {
  const host = fakeHost(false);
  const grab = createGrab(host);
  grab.down(...at(0));
  expect(grab.held()).toBe(false);
  grab.move(...at(30));
  expect(grab.tick()).toBeNull();
  grab.release();
  expect(host.log).toEqual(["begin"]);
});

test("each frame the turn since the last becomes the rate and the degrees to turn the record", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(0));
  grab.move(...at(SPIN_PER_FRAME));
  expect(grab.tick()).toBeCloseTo(SPIN_PER_FRAME);
  expect(host.log).toEqual(["begin", "rate 0.5"]); // smoothed: half of 1x
  grab.move(...at(SPIN_PER_FRAME * 2));
  expect(grab.tick()).toBeCloseTo(SPIN_PER_FRAME);
  expect(host.log.at(-1)).toBe("rate 0.75");
  // Two moves in one frame add up; the turn is measured from the last position, not the down.
  grab.move(...at(SPIN_PER_FRAME * 2 + 5));
  grab.move(...at(SPIN_PER_FRAME * 2 + 10));
  expect(grab.tick()).toBeCloseTo(10);
});

test("turning across 12 o'clock goes the short way round", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(355));
  grab.move(...at(5));
  expect(grab.tick()).toBeCloseTo(10);
  grab.move(...at(350));
  expect(grab.tick()).toBeCloseTo(-15);
});

test("a still finger settles to 0 and sends it once; a rate is only sent when it changes", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(0));
  grab.move(...at(SPIN_PER_FRAME));
  grab.tick();
  const sends = () => host.log.filter((line) => line.startsWith("rate")).length;
  const before = sends();
  for (let i = 0; i < 12; i++) grab.tick();
  expect(host.log.at(-1)).toBe("rate 0");
  const settled = sends();
  expect(settled).toBeGreaterThan(before);
  for (let i = 0; i < 12; i++) expect(grab.tick()).toBe(0);
  expect(sends()).toBe(settled);
});

test("over the spindle the record holds still, and leaving the dead zone starts afresh", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(0));
  grab.move(cx + DEAD_ZONE_PX / 2, cy);
  expect(grab.tick()).toBe(0);
  grab.move(...at(180)); // out the other side: no 180° swing
  expect(grab.tick()).toBe(0);
  grab.move(...at(190));
  expect(grab.tick()).toBeCloseTo(10);
});

test("lifting the finger tells the host once; a second release is nothing", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(0));
  grab.release();
  grab.release();
  expect(host.log).toEqual(["begin", "end"]);
  expect(grab.held()).toBe(false);
  expect(grab.tick()).toBeNull();
});

test("a scratch the host ended itself is not followed, and lets go with nothing to send", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(0));
  host.endItself();
  grab.move(...at(20));
  expect(grab.tick()).toBeNull(); // the host's word stands even before the grab hears of it
  grab.hostEnded();
  expect(grab.held()).toBe(false);
  grab.release();
  expect(host.log).toEqual(["begin"]);
  // The finger has to lift and come down again to grab afresh.
  grab.down(...at(0));
  expect(host.log).toEqual(["begin", "begin"]);
});

test("a second down while holding is ignored", () => {
  const host = fakeHost();
  const grab = createGrab(host);
  grab.down(...at(0));
  grab.down(...at(90));
  expect(host.log).toEqual(["begin"]);
  grab.move(...at(10));
  expect(grab.tick()).toBeCloseTo(10);
});
