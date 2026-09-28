import { describe, expect, it } from "vitest";
import { parseRepPromise } from "./repPromises";

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
