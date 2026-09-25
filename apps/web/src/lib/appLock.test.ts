// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearAppPin, hasAppPin, setAppPin, verifyAppPin } from "./appLock";

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
