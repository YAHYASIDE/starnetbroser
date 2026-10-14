import { describe, expect, it } from "vitest";
import { createReadyGate } from "./readyGate";

describe("createReadyGate", () => {
  it("does not resolve whenReady() until markReady() is called", async () => {
    const gate = createReadyGate();
    let resolved = false;
    gate.whenReady().then(() => {
      resolved = true;
    });

    // Flush any already-queued microtasks - whenReady() must still be pending.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(gate.isReady).toBe(false);

    gate.markReady();
    await gate.whenReady();
    expect(gate.isReady).toBe(true);
  });

  it("resolves immediately for a whenReady() call made after markReady()", async () => {
    const gate = createReadyGate();
    gate.markReady();

    let resolved = false;
    gate.whenReady().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("is safe to call markReady() more than once", async () => {
    const gate = createReadyGate();
    gate.markReady();
    gate.markReady();
    await expect(gate.whenReady()).resolves.toBeUndefined();
    expect(gate.isReady).toBe(true);
  });

  it("every whenReady() call (before or after markReady) resolves from the same gate instance", async () => {
    const gate = createReadyGate();
    const first = gate.whenReady();
    gate.markReady();
    const second = gate.whenReady();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  // The three tests below model HomeView's exact usage: synchronous work (updating accountsRef/
  // dataStateRef, e.g. loading "mounay" from localStorage) must complete before markReady() is
  // called, and a whenReady() awaiter must never observe the gate as open any earlier than that.

  it("never lets a whenReady() awaiter observe state from before the synchronous work that precedes markReady()", async () => {
    const gate = createReadyGate();
    let accountsRef = { current: ["demo-seed-only"] };

    let observedAtReady: string[] | undefined;
    gate.whenReady().then(() => {
      observedAtReady = accountsRef.current;
    });

    // The exact HomeView pattern: mutate the ref synchronously, THEN call markReady(), in the
    // same synchronous block - never split across a later tick or a `finally`.
    accountsRef = { current: ["mounay-acc"] };
    gate.markReady();

    await gate.whenReady();
    expect(observedAtReady).toEqual(["mounay-acc"]);
  });

  it("never resolves at all if markReady() is never called - modeling a failed account load", async () => {
    const gate = createReadyGate();
    let resolved = false;
    gate.whenReady().then(() => {
      resolved = true;
    });

    // Give it several microtask ticks - a failed/not-logged-in load must never call markReady().
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(resolved).toBe(false);
    expect(gate.isReady).toBe(false);
  });

  it("a later markReady() from a successful retry still resolves whenReady() calls made during the earlier failure window", async () => {
    const gate = createReadyGate();
    let resolvedDuringFailureWindow = false;
    gate.whenReady().then(() => {
      resolvedDuringFailureWindow = true;
    });

    // "API call failed" - nothing calls markReady() yet, so any drain awaiting the gate just waits.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolvedDuringFailureWindow).toBe(false);

    // "إعادة المحاولة" succeeds this time.
    gate.markReady();
    await gate.whenReady();
    expect(resolvedDuringFailureWindow).toBe(true);
  });
});
