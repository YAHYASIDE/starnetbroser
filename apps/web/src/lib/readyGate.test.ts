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
});
