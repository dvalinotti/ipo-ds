import { expect, test } from "bun:test";
import { createComputed, createRoot, createSignal } from "solid-js";
import { settled } from "../app/reactive.ts";

test("a settled value tells its readers only when it changes", () => {
  createRoot((dispose) => {
    const [source, setSource] = createSignal(1);
    const parity = settled(() => source() % 2);
    let runs = 0;
    createComputed(() => {
      parity();
      runs++;
    });
    expect(runs).toBe(1);
    setSource(3); // same parity
    expect(runs).toBe(1);
    expect(parity()).toBe(1);
    setSource(4);
    expect(runs).toBe(2);
    expect(parity()).toBe(0);
    dispose();
  });
});

test("a settled value can compare by its own rule", () => {
  createRoot((dispose) => {
    const [source, setSource] = createSignal({ key: "a", n: 1 });
    const view = settled(source, (a, b) => a.key === b.key);
    let runs = 0;
    createComputed(() => {
      view();
      runs++;
    });
    setSource({ key: "a", n: 2 });
    expect(runs).toBe(1);
    setSource({ key: "b", n: 2 });
    expect(runs).toBe(2);
    dispose();
  });
});
