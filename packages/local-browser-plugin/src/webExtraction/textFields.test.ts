import { describe, expect, it } from "vitest";
import {
  BALANCE_LABELS,
  PLAN_LABELS,
  RENEWAL_DATE_LABELS,
  extractBalance,
  extractLabeledValue,
  normalizeDateLike,
} from "./textFields";

// Fake/dummy line arrays only - none of this is real Starlink account data.

describe("extractLabeledValue - forward-lookahead robustness", () => {
  it("skips an action-button line ('Manage') to find the real value further down", () => {
    const lines = ["Plan", "Manage", "Residential"];
    expect(extractLabeledValue(lines, PLAN_LABELS)).toBe("Residential");
  });

  it("skips an Arabic action-button line ('إدارة') the same way", () => {
    const lines = ["الخطة", "إدارة", "سكني"];
    expect(extractLabeledValue(lines, PLAN_LABELS)).toBe("سكني");
  });

  it("skips a line that is actually a different field's label, not this field's value", () => {
    // Matches a real card layout: the plan's bare label, an unrelated "Manage" button, then the
    // NEXT field's own label+value on one line, and only THEN the plan's actual value.
    const lines = ["خطة الخدمة", "إدارة", "النهاية ٢٠٢٦/٩/٢٨", "التجوال - غير محدود"];
    expect(extractLabeledValue(lines, PLAN_LABELS)).toBe("التجوال - غير محدود");
    expect(extractLabeledValue(lines, RENEWAL_DATE_LABELS)).toBe("٢٠٢٦/٩/٢٨");
  });

  it("never returns the Manage button or the other field's line as the plan name", () => {
    const lines = ["خطة الخدمة", "إدارة", "النهاية ٢٠٢٦/٩/٢٨", "التجوال - غير محدود"];
    const planName = extractLabeledValue(lines, PLAN_LABELS);
    expect(planName).not.toBe("إدارة");
    expect(planName).not.toContain("٢٠٢٦");
  });
});

describe("normalizeDateLike", () => {
  it("converts Arabic-Indic digits and zero-pads month/day", () => {
    expect(normalizeDateLike("٢٠٢٦/٩/٢٨")).toBe("2026/09/28");
  });

  it("leaves an already zero-padded Western date unchanged", () => {
    expect(normalizeDateLike("2026/09/28")).toBe("2026/09/28");
  });

  it("zero-pads a single-digit Western month and day", () => {
    expect(normalizeDateLike("2026/9/8")).toBe("2026/09/08");
  });

  it("passes through unrecognized shapes unchanged (after digit conversion)", () => {
    expect(normalizeDateLike("منتهي")).toBe("منتهي");
  });
});

describe("extractBalance - never scans the whole page", () => {
  it("finds the amount near a balance label", () => {
    const lines = ["Outstanding Balance", "$0.00"];
    expect(extractBalance(lines)).toEqual({ amount: "0.00", currency: "USD" });
  });

  it("returns undefined when there is no balance label at all, even if some other amount is on the page", () => {
    // e.g. the plan's price - must never be mistaken for the account balance.
    const lines = ["Plan", "Residential", "$49.99 / month"];
    expect(extractBalance(lines)).toBeUndefined();
  });

  it("does not fall back to an unrelated amount elsewhere on the page when the label's own lines have none", () => {
    const lines = [...BALANCE_LABELS.slice(0, 1), "see below for details", "$49.99 / month (plan price)"];
    expect(extractBalance(lines)).toBeUndefined();
  });
});
