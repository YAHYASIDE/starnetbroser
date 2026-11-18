import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { AUTO_COPY_QUIET_MS, AUTO_COPY_RETRY_MS, autoCopyKey, decideAutoCopy } from "./repCopyAuto";

const MIN = 60_000;

describe("📤 نسخة المندوب تلقائيًا - 10 minutes after the last change (his Oct 17 2026 choice)", () => {
  it("waits 10 quiet minutes, and every new change starts the wait again", () => {
    let step = decideAutoCopy(undefined, "k1", 0);
    expect(step.send).toBe(false);
    step = decideAutoCopy(step.state, "k1", 9 * MIN);
    expect(step.send).toBe(false);
    step = decideAutoCopy(step.state, "k2", 9 * MIN);
    expect(step.send).toBe(false);
    step = decideAutoCopy(step.state, "k2", 9 * MIN + AUTO_COPY_QUIET_MS - 1);
    expect(step.send).toBe(false);
    step = decideAutoCopy(step.state, "k2", 9 * MIN + AUTO_COPY_QUIET_MS);
    expect(step.send).toBe(true);
  });

  it("nothing to send once his copy is current; a failed send waits 30 minutes", () => {
    expect(decideAutoCopy({ key: "k", since: 0 }, null, 60 * MIN)).toEqual({ send: false });
    const failed = { key: "k", since: 0, failedAt: 20 * MIN };
    expect(decideAutoCopy(failed, "k", 20 * MIN + AUTO_COPY_RETRY_MS - 1).send).toBe(false);
    expect(decideAutoCopy(failed, "k", 20 * MIN + AUTO_COPY_RETRY_MS).send).toBe(true);
  });

  it("measures against the last copy sent: no copy yet = nothing automatic", () => {
    const accounts = [{ id: "d1", representativeId: "r1", clientId: "c1" }, { id: "d2", representativeId: "r1" }] as unknown as StarlinkAccountSummary[];
    expect(autoCopyKey(accounts, "r1", {})).toBeNull();
    expect(autoCopyKey(accounts, "r1", { r1: { d1: "c1", d2: "" } })).toBeNull();
    expect(autoCopyKey(accounts, "r1", { r1: { d1: "c1" } })).toBe(JSON.stringify([["d1", "c1"], ["d2", ""]]));
  });

  it("💱 a rate he changed sends the copy too (his Nov 18 2026 ask); a 5th-digit wobble does not", async () => {
    const { ratesFingerprint } = await import("./repCopyAuto");
    const accounts = [{ id: "d1", representativeId: "r1", clientId: "c1" }] as unknown as StarlinkAccountSummary[];
    const sent = { r1: { d1: "c1" } };
    const before = ratesFingerprint({ EUR: { code: "EUR", rateFromUsd: 1.01, enabled: true } } as never);
    const after = ratesFingerprint({ EUR: { code: "EUR", rateFromUsd: 0.86, enabled: true } } as never);
    const wobble = ratesFingerprint({ EUR: { code: "EUR", rateFromUsd: 1.010004, enabled: true } } as never);
    expect(autoCopyKey(accounts, "r1", sent, before, before)).toBeNull();
    expect(autoCopyKey(accounts, "r1", sent, wobble, before)).toBeNull();
    expect(autoCopyKey(accounts, "r1", sent, after, before)).toContain("EUR:0.86");
    // no copy sent by hand yet = nothing automatic, rates or not
    expect(autoCopyKey(accounts, "r1", {}, after, before)).toBeNull();
  });
});
