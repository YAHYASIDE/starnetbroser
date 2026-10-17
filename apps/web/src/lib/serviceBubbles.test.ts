import { describe, expect, it } from "vitest";
import { changesTo, serviceBubbles } from "./serviceBubbles";

const TODAY = "2026-10-17";
const roam = "Roam - Unlimited";
const g100 = "Roam - 100GB";
const sis = "Standby Mode";

describe("🫧 the two service bubbles - his screenshots, one by one (Oct 17 2026)", () => {
  it("ROM: active, switching to SIS, ending", () => {
    expect(serviceBubbles({ planName: roam, serviceStatus: "active" }, TODAY)).toEqual({ now: "ROM", next: "ROM" });
    expect(serviceBubbles({ planName: roam, serviceStatus: "active", pendingStandbyDate: "2026/10/28" }, TODAY)).toEqual({ now: "ROM", next: "SIS", nextDate: "2026/10/28" });
    expect(serviceBubbles({ planName: roam, serviceStatus: "active", pendingCancellationDate: "2026/10/28" }, TODAY)).toEqual({ now: "ROM", next: "STOP", nextDate: "2026/10/28" });
  });

  it("100G works the same", () => {
    expect(serviceBubbles({ planName: g100, serviceStatus: "active" }, TODAY)).toEqual({ now: "100G", next: "100G" });
    expect(serviceBubbles({ planName: g100, pendingStandbyDate: "2026/11/11" }, TODAY)).toEqual({ now: "100G", next: "SIS", nextDate: "2026/11/11" });
    expect(serviceBubbles({ planName: g100, pendingCancellationDate: "2026/11/11" }, TODAY)).toEqual({ now: "100G", next: "STOP", nextDate: "2026/11/11" });
  });

  it("SIS stays SIS or stops - never back to ROM / 100G", () => {
    expect(serviceBubbles({ planName: sis, serviceStatus: "active" }, TODAY)).toEqual({ now: "SIS", next: "SIS" });
    expect(serviceBubbles({ planName: sis, pendingCancellationDate: "2026/11/17" }, TODAY)).toEqual({ now: "SIS", next: "STOP", nextDate: "2026/11/17" });
    expect(serviceBubbles({ planName: sis, pendingStandbyDate: "2026/11/17" }, TODAY)).toEqual({ now: "SIS", next: "SIS" });
  });

  it("Inactive, no subscription, or an end date that has come = STOP → STOP", () => {
    expect(serviceBubbles({ planName: roam, serviceStatus: "canceled" }, TODAY)).toEqual({ now: "STOP", next: "STOP" });
    expect(serviceBubbles({ planName: roam, noSubscription: true }, TODAY)).toEqual({ now: "STOP", next: "STOP" });
    expect(serviceBubbles({ planName: g100, pendingCancellationDate: "2026/10/17" }, TODAY)).toEqual({ now: "STOP", next: "STOP" });
  });

  it("a standby switch whose day has come is SIS now", () => {
    expect(serviceBubbles({ planName: roam, pendingStandbyDate: "2026/10/16" }, TODAY)).toEqual({ now: "SIS", next: "SIS" });
  });

  it("suspended for billing keeps his plan; an unknown plan shows nothing", () => {
    expect(serviceBubbles({ planName: roam, serviceStatus: "suspended" }, TODAY)).toEqual({ now: "ROM", next: "ROM" });
    expect(serviceBubbles({ planName: "Residential", serviceStatus: "active" }, TODAY)).toBeNull();
    expect(serviceBubbles({}, TODAY)).toBeNull();
  });

  it("«→ SIS» / «→ STOP» circles", () => {
    expect(changesTo({ planName: roam, pendingStandbyDate: "2026/10/28" }, TODAY, "SIS")).toBe(true);
    expect(changesTo({ planName: sis }, TODAY, "SIS")).toBe(false);
    expect(changesTo({ planName: sis, pendingCancellationDate: "2026/11/17" }, TODAY, "STOP")).toBe(true);
    expect(changesTo({ planName: roam, serviceStatus: "canceled" }, TODAY, "STOP")).toBe(false);
  });
});
