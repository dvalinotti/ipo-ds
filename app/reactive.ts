// Reactive helpers for hot paths.
import { createComputed, createSignal, untrack, type Accessor } from "solid-js";

/**
 * A value derived from a frequently-written source, behind a firewall. A memo's readers are
 * marked stale whenever any of its sources is written, before Solid knows the memo's value is
 * unchanged, so a big reader graph pays for every write. A settled value is a signal set by one
 * computation: writing the source re-runs only that computation, and readers hear about it only
 * when `equals` says the value changed.
 */
export function settled<T>(fn: () => T, equals: (a: T, b: T) => boolean = Object.is): Accessor<T> {
  const [value, setValue] = createSignal<T>(untrack(fn), { equals });
  createComputed(() => {
    const next = fn();
    setValue(() => next);
  });
  return value;
}
