import { expect, test } from "bun:test";
import { angleAt, DEAD_ZONE_PX, fingerRate, inDeadZone, inDisc, MAX_RATE, PLATTER, smoothRate, SPIN_PER_FRAME, wrap360, wrapDelta } from "../app/dj/platter.ts";

const { cx, cy } = PLATTER;

test("the platter sits left of the side panel, centred in its box", () => {
  expect(PLATTER).toEqual({ x: 10, y: 20, size: 200, cx: 110, cy: 120 });
  expect(PLATTER.x + PLATTER.size).toBeLessThanOrEqual(220 - 10);
});

test("angles run clockwise from 12 o'clock", () => {
  expect(angleAt(cx, cy, cx, cy - 60)).toBeCloseTo(0);
  expect(angleAt(cx, cy, cx + 60, cy)).toBeCloseTo(90);
  expect(angleAt(cx, cy, cx, cy + 60)).toBeCloseTo(180);
  expect(angleAt(cx, cy, cx - 60, cy)).toBeCloseTo(270);
  expect(angleAt(cx, cy, cx + 60, cy - 60)).toBeCloseTo(45);
});

test("wrap360 and wrapDelta keep turns short across 12 o'clock", () => {
  expect(wrap360(-10)).toBeCloseTo(350);
  expect(wrap360(370)).toBeCloseTo(10);
  expect(wrapDelta(5 - 355)).toBeCloseTo(10);   // 355° → 5°: 10° clockwise, not -350°
  expect(wrapDelta(355 - 5)).toBeCloseTo(-10);
  expect(wrapDelta(180)).toBe(180);
  expect(wrapDelta(-180)).toBe(180);
  expect(wrapDelta(190)).toBeCloseTo(-170);
});

test("a finger moving with the motor plays at 1x; one turn is 1.8 s of audio", () => {
  expect(SPIN_PER_FRAME).toBeCloseTo(10 / 3);
  expect(fingerRate(SPIN_PER_FRAME)).toBeCloseTo(1);
  expect(fingerRate(-SPIN_PER_FRAME * 2)).toBeCloseTo(-2);
  expect(fingerRate(0)).toBe(0);
  expect((360 / 200) * 1000).toBe(1800);
});

test("rates are smoothed, clamped to ±4 and settle on exactly 0", () => {
  expect(smoothRate(0, 3)).toBe(1.5);
  expect(smoothRate(1.5, 3)).toBe(2.25);
  expect(smoothRate(4, 10)).toBe(MAX_RATE);
  expect(smoothRate(-4, -10)).toBe(-MAX_RATE);
  let rate = 3;
  for (let i = 0; i < 20; i++) rate = smoothRate(rate, 0);
  expect(rate).toBe(0);
  expect(smoothRate(0.01, 0)).toBe(0);
});

test("the spindle is a dead zone", () => {
  expect(inDeadZone(cx, cy, cx, cy)).toBe(true);
  expect(inDeadZone(cx, cy, cx + DEAD_ZONE_PX - 1, cy)).toBe(true);
  expect(inDeadZone(cx, cy, cx + DEAD_ZONE_PX, cy)).toBe(false);
  expect(inDeadZone(cx, cy, cx + 12, cy + 12)).toBe(false);
});

test("the disc is the circle inside the platter's square", () => {
  expect(inDisc(cx, cy, cx, cy)).toBe(true);
  expect(inDisc(cx, cy, cx + 99, cy)).toBe(true);
  expect(inDisc(cx, cy, cx + 100, cy + 1)).toBe(false);
  expect(inDisc(cx, cy, PLATTER.x + 2, PLATTER.y + 2)).toBe(false);
});
