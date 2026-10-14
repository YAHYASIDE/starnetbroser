import { describe, expect, it } from "vitest";
import { parseRepPromise, repOpenPromises, repPromisesDueLines, repPromisesText } from "./repPromises";
import type { PaymentPromise } from "./paymentPromises";
import { parseRepCommand } from "./telegramRepMessages";

// Monday 28 Sep 2026
const today = new Date(2026, 8, 28);

describe("rep promise parsing", () => {
  it("reads amount, customer and the day in many spellings", () => {
    expect(parseRepPromise("5000 محمد الخميس", today)).toEqual({ amount: 5000, currency: "MRU", query: "محمد", dueDate: "2026-10-01", defaulted: false });
    expect(parseRepPromise("20 دولار سالم 05/10", today)).toMatchObject({ amount: 20, currency: "USD", query: "سالم", dueDate: "2026-10-05" });
    expect(parseRepPromise("3000 علي غداً", today)!.dueDate).toBe("2026-09-29");
    expect(parseRepPromise("3000 علي بعد غد", today)!.dueDate).toBe("2026-09-30");
    expect(parseRepPromise("3000 علي بعد 3 أيام", today)).toMatchObject({ dueDate: "2026-10-01", query: "علي" });
    expect(parseRepPromise("3000 علي يوم 30", today)!.dueDate).toBe("2026-09-30");
    expect(parseRepPromise("3000 علي يوم 5", today)!.dueDate).toBe("2026-10-05");
    expect(parseRepPromise("3000 علي الاثنين", today)!.dueDate).toBe("2026-10-05");
    expect(parseRepPromise("3000 علي يوم السبت", today)).toMatchObject({ dueDate: "2026-10-03", query: "علي" });
    expect(parseRepPromise("3000 علي اليوم", today)!.dueDate).toBe("2026-09-28");
    expect(parseRepPromise("3000 علي 01/01", today)!.dueDate).toBe("2027-01-01");
    expect(parseRepPromise("3000 علي بعد اسبوعين", today)!.dueDate).toBe("2026-10-12");
  });

  it("defaults to a week without a day; null without an amount", () => {
    expect(parseRepPromise("5000 محمد أحمد", today)).toEqual({ amount: 5000, currency: "MRU", query: "محمد أحمد", dueDate: "2026-10-05", defaulted: true });
    expect(parseRepPromise("محمد الخميس", today)).toBeNull();
  });
});

describe("a rep's promises", () => {
  const p = (o: Partial<PaymentPromise>): PaymentPromise => ({ id: "x", name: "محمد", amount: 5000, currency: "MRU", dueDate: "2026-09-28", status: "open", createdAt: "x", ...o });
  const list = [
    p({ id: "1", repId: "r1", dueDate: "2026-09-30" }),
    p({ id: "2", clientId: "c1", name: "سالم", dueDate: "2026-09-25" }),
    p({ id: "3", clientId: "c9" }),
    p({ id: "4", repId: "r1", status: "kept" }),
    p({ id: "5", repId: "r2" }),
  ];

  it("are the ones he reported and his customers', oldest first", () => {
    const open = repOpenPromises("r1", list, new Set(["c1"]));
    expect(open.map((x) => x.id)).toEqual(["2", "1"]);
    const text = repPromisesText(open, "2026-09-28");
    expect(text).toContain("🤝 وعود زبائنك (2)");
    expect(text).toContain("• سالم: 5,000 أوقية - 25/09 ⏰ متأخر");
    expect(text).toContain("• محمد: 5,000 أوقية - 30/09");
    expect(repPromisesText([], "2026-09-28")).toContain("لا وعود");
    expect(repPromisesDueLines(open, "2026-09-28")).toEqual(["", "🤝 وعود دفع مستحقة (1):", "• سالم: 5,000 أوقية ⏰"]);
    expect(parseRepCommand("وعودي")).toEqual({ kind: "mypromises" });
  });
});
