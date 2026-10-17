import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import { absorbRingResults, duplicatePairs, isCanceledDevice, planRing, renewedOn, ringCheckReport, RING_CHECK_MAX_MS } from "./deviceRings";

const device = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, ...extra }) as StarlinkAccountSummary;

describe("🔵 the home circles (his Oct 17 2026 ask)", () => {
  it("«ملغي» = an end date set or the service ended; SIS is not cancelled", () => {
    expect(isCanceledDevice(device("a", { pendingCancellationDate: "2026/11/01" }))).toBe(true);
    expect(isCanceledDevice(device("b", { serviceStatus: "canceled" }))).toBe(true);
    expect(isCanceledDevice(device("c", { noSubscription: true }))).toBe(true);
    expect(isCanceledDevice(device("d", { serviceStatus: "active" }))).toBe(false);
    expect(isCanceledDevice(device("e", { serviceStatus: "standby", planName: "Standby Mode" }))).toBe(false);
  });

  it("SIS / ROM / 100G from the plan", () => {
    expect(planRing(device("a", { planName: "Standby Mode" }))).toBe("SIS");
    expect(planRing(device("b", { planName: "Roaming Unlimited" }))).toBe("ROM");
    expect(planRing(device("c", { planName: "Roaming 100GB" }))).toBe("100G");
    expect(planRing(device("d", { planName: "Roaming 50GB" }))).toBeUndefined();
    expect(planRing(device("e", { planName: "Residential" }))).toBeUndefined();
  });

  it("«تم تجديد» = a renewal recorded today", () => {
    const sale = (id: string, date: string): LedgerEntry => ({ id, date, kind: "debit", amount: 50, currency: "USD", createdAt: date, description: "" }) as unknown as LedgerEntry;
    const ids = renewedOn({ a: [sale("1", "2026-10-17")], b: [sale("2", "2026-10-16")] }, "2026-10-17");
    expect([...ids]).toEqual(["a"]);
  });

  it("🔗 each duplicate pair once, keeping the operator's own over a rep's", () => {
    const mine = device("m", { kitNumber: "K1" });
    const reps = device("r", { kitNumber: "K1", addedByRepId: "rep1" });
    const twins = new Map([["m", reps], ["r", mine]]);
    const pairs = duplicatePairs(twins, [mine, reps], {});
    expect(pairs).toHaveLength(1);
    expect(pairs[0].keep.id).toBe("m");
    expect(pairs[0].drop.id).toBe("r");
  });
});

describe("🔍 a circle's check", () => {
  const question = { label: "ملغي", test: (a: StarlinkAccountSummary) => isCanceledDevice(a), yes: "ملغي فعلًا", no: "غير ملغي" };

  it("reports who really is, who changed and who couldn't be read", () => {
    const accounts = [device("a", { serviceStatus: "canceled" }), device("b", { serviceStatus: "active" }), device("c")];
    const report = ringCheckReport(question, ["a", "b", "c"], { a: true, b: true, c: true }, accounts, { a: "ok", b: "ok", c: "signedOut" });
    expect(report.yes).toEqual(["جهاز a"]);
    expect(report.changed).toEqual(["جهاز b: غير ملغي"]);
    expect(report.unchecked).toEqual(["جهاز c"]);
    expect(report.text.split("\n")[0]).toBe("🔍 فحص «ملغي» - 3 جهاز");
  });

  it("finishes once every device has an outcome, ignoring others'", () => {
    const run = { kind: "canceled", label: "ملغي", ids: ["a", "b"], before: {}, results: {}, startedAt: 0 };
    let step = absorbRingResults(run, [{ accountId: "a", outcome: "ok" }, { accountId: "x", outcome: "ok" }], 1);
    expect(step.finished).toBeNull();
    expect(step.run?.results).toEqual({ a: "ok" });
    step = absorbRingResults(step.run!, [{ accountId: "b", outcome: "stuck" }], 2);
    expect(step.finished?.results).toEqual({ a: "ok", b: "stuck" });
    expect(absorbRingResults(run, [], RING_CHECK_MAX_MS + 1)).toEqual({ run: null, finished: null });
  });
});
