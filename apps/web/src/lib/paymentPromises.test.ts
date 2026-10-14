import { describe, expect, it } from "vitest";
import { addPromise, bucketPromises, buildPromiseReminder, reliabilityByClient, resolvePromise, validatePromise } from "./paymentPromises";

describe("payment promises", () => {
  it("validates, buckets by due date and tracks reliability", () => {
    expect(validatePromise({ name: "", amount: 1, currency: "MRU", dueDate: "2026-09-28" })).toBeTruthy();
    expect(validatePromise({ name: "م", amount: 0, currency: "MRU", dueDate: "2026-09-28" })).toBeTruthy();
    let list = addPromise([], { clientId: "c1", name: "محمد", amount: 5000, currency: "MRU", dueDate: "2026-09-25" });
    list = addPromise(list, { clientId: "c1", name: "محمد", amount: 1000, currency: "MRU", dueDate: "2026-09-28" });
    list = addPromise(list, { name: " سالم ", amount: 20, currency: "USD", dueDate: "2026-10-02" });
    const b = bucketPromises(list, "2026-09-28");
    expect([b.overdue.length, b.today.length, b.upcoming.length]).toEqual([1, 1, 1]);
    expect(b.upcoming[0]!.name).toBe("سالم");
    list = resolvePromise(list, b.overdue[0]!.id, "broken");
    list = resolvePromise(list, b.today[0]!.id, "kept");
    expect(reliabilityByClient(list).c1).toEqual({ kept: 1, broken: 1, rate: 0.5 });
    expect(bucketPromises(list, "2026-09-28").overdue).toHaveLength(0);
    expect(buildPromiseReminder({ name: "محمد", amount: 5000, dueDate: "2026-09-28" }, "أوقية", "2026-09-28")).toContain("اليوم: 5,000 أوقية");
  });
});
