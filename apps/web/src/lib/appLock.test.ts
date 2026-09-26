// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  FREE_PIN_ATTEMPTS,
  PinFailures,
  RELOCK_AFTER_MS,
  clearAppPin,
  formatLockoutWait,
  hasAppPin,
  isInternalLeave,
  loadPinFailures,
  lockoutRemainingMs,
  markInternalLeave,
  registerPinFailure,
  savePinFailures,
  setAppPin,
  shouldRelock,
  verifyAppPin,
} from "./appLock";

describe("appLock", () => {
  beforeEach(() => {
    clearAppPin();
  });

  it("hasAppPin is false until a PIN is actually set", () => {
    expect(hasAppPin()).toBe(false);
  });

  it("hasAppPin is true once a PIN is set, and verifyAppPin accepts the correct PIN", async () => {
    await setAppPin("1234");
    expect(hasAppPin()).toBe(true);
    await expect(verifyAppPin("1234")).resolves.toBe(true);
  });

  it("rejects a wrong PIN", async () => {
    await setAppPin("1234");
    await expect(verifyAppPin("9999")).resolves.toBe(false);
  });

  it("verifyAppPin is false (never throws) when no PIN was ever set", async () => {
    await expect(verifyAppPin("1234")).resolves.toBe(false);
  });

  it("clearAppPin removes it - hasAppPin goes back to false and any PIN is rejected", async () => {
    await setAppPin("1234");
    clearAppPin();
    expect(hasAppPin()).toBe(false);
    await expect(verifyAppPin("1234")).resolves.toBe(false);
  });

  it("setAppPin replaces a previous PIN outright - only the new one verifies", async () => {
    await setAppPin("1234");
    await setAppPin("5678");
    await expect(verifyAppPin("1234")).resolves.toBe(false);
    await expect(verifyAppPin("5678")).resolves.toBe(true);
  });

  it("stores no plaintext trace of the PIN itself", async () => {
    await setAppPin("135790");
    const raw = window.localStorage.getItem("starnet.appPinHash") ?? "";
    expect(raw).not.toContain("135790");
  });
});

describe("appLock re-lock and wrong-PIN limit", () => {
  it("re-locks only after a minute away, and never after the app's own browser hand-off", () => {
    expect(shouldRelock(null, 100_000, false)).toBe(false);
    expect(shouldRelock(0, RELOCK_AFTER_MS - 1, false)).toBe(false);
    expect(shouldRelock(0, RELOCK_AFTER_MS, false)).toBe(true);
    expect(shouldRelock(0, 10 * RELOCK_AFTER_MS, true)).toBe(false);
  });

  it("treats a hide right after opening the device browser as internal", () => {
    markInternalLeave(1_000_000);
    expect(isInternalLeave(1_000_500)).toBe(true);
    expect(isInternalLeave(1_010_000)).toBe(false);
    expect(isInternalLeave(999_000)).toBe(false);
  });

  it("allows 5 wrong PINs, then waits 30s doubling up to 15 minutes", () => {
    let state: PinFailures = { count: 0, lockedUntil: 0 };
    for (let i = 0; i < FREE_PIN_ATTEMPTS - 1; i++) {
      state = registerPinFailure(state, 0);
      expect(lockoutRemainingMs(state, 0)).toBe(0);
    }
    state = registerPinFailure(state, 0);
    expect(lockoutRemainingMs(state, 0)).toBe(30_000);
    state = registerPinFailure(state, 0);
    expect(lockoutRemainingMs(state, 0)).toBe(60_000);
    for (let i = 0; i < 10; i++) state = registerPinFailure(state, 0);
    expect(lockoutRemainingMs(state, 0)).toBe(15 * 60_000);
    expect(lockoutRemainingMs(state, 15 * 60_000)).toBe(0);
  });

  it("persists failures across reloads and clears them on reset", () => {
    savePinFailures({ count: 6, lockedUntil: 123 });
    expect(loadPinFailures()).toEqual({ count: 6, lockedUntil: 123 });
    savePinFailures({ count: 0, lockedUntil: 0 });
    expect(loadPinFailures()).toEqual({ count: 0, lockedUntil: 0 });
    window.localStorage.setItem("starnet.pinFailures", "garbage");
    expect(loadPinFailures()).toEqual({ count: 0, lockedUntil: 0 });
  });

  it("formats the wait in Arabic", () => {
    expect(formatLockoutWait(30_000)).toBe("30 ثانية");
    expect(formatLockoutWait(120_000)).toBe("2 دقيقة");
  });
});
