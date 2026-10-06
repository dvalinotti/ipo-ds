import { expect, test } from "bun:test";
import { formatRemaining, formatTime, needsHours } from "../app/format.ts";

test("times read m:ss below an hour and h:mm:ss from an hour", () => {
  expect([formatTime(0), formatTime(9_999), formatTime(102_000), formatTime(3_599_999), formatTime(3_600_000), formatTime(45_153_000)])
    .toEqual(["0:00", "0:09", "1:42", "59:59", "1:00:00", "12:32:33"]);
});

test("negative and non-finite times read as zero", () => {
  expect([formatTime(-5_000), formatTime(NaN), formatTime(Infinity)]).toEqual(["0:00", "0:00", "0:00"]);
});

test("remaining time carries a minus sign and never goes below zero", () => {
  expect([formatRemaining(102_000, 340_000), formatRemaining(400_000, 340_000), formatRemaining(0, 3_754_000)]).toEqual(["-3:58", "-0:00", "-1:02:34"]);
  expect([needsHours(3_599_999), needsHours(3_600_000)]).toEqual([false, true]);
});
