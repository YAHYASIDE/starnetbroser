import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { priorityAlertsToSend, priorityDataLine, priorityDataState, priorityPlanGb, priorityTelegramText } from "./priorityData";

const PLAN_100 = "التجوال - 100 غيغابايت";
const acc = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, ...extra }) as StarlinkAccountSummary;

describe("priorityPlanGb", () => {
  it("reads the GB amount of a data plan", () => {
    expect(priorityPlanGb(PLAN_100)).toBe(100);
    expect(priorityPlanGb("Roaming 50GB")).toBe(50);
  });

  it("is undefined for unlimited, SIS, an address or nothing", () => {
    expect(priorityPlanGb("التجوال - غير محدود")).toBeUndefined();
    expect(priorityPlanGb("وضع الاستعداد")).toBeUndefined();
    expect(priorityPlanGb("Street 100 GB, GR")).toBeUndefined();
    expect(priorityPlanGb(undefined)).toBeUndefined();
  });
});

describe("priorityDataState", () => {
  it("is exhausted when Starlink shows the banner, whatever the plan", () => {
    expect(priorityDataState({ priorityDataExhausted: true })?.kind).toBe("exhausted");
  });

  it("is exhausted when a 100G device's usage reaches 100 GB (real case: 121 GB)", () => {
    expect(priorityDataState({ planName: PLAN_100, dataUsageGb: "121" })).toEqual({ kind: "exhausted", usedGb: 121, limitGb: 100 });
    expect(priorityDataState({ planName: PLAN_100, dataUsageGb: "100" })?.kind).toBe("exhausted");
  });

  it("warns near the limit, and is quiet below it or on unlimited plans", () => {
    expect(priorityDataState({ planName: PLAN_100, dataUsageGb: "92.5" })?.kind).toBe("near");
    expect(priorityDataState({ planName: PLAN_100, dataUsageGb: "40" })).toBeNull();
    expect(priorityDataState({ planName: "التجوال - غير محدود", dataUsageGb: "900" })).toBeNull();
    expect(priorityDataState({ planName: PLAN_100 })).toBeNull();
  });

  it("describes the state in one line", () => {
    expect(priorityDataLine({ kind: "exhausted", usedGb: 121, limitGb: 100 })).toContain("نفدت باقة الأولوية (100 جيجا) - الاستهلاك 121 GB");
    expect(priorityDataLine({ kind: "near", usedGb: 95, limitGb: 100 })).toContain("قاربت");
  });
});

describe("priorityAlertsToSend", () => {
  it("alerts once per device, and again after a new cycle", () => {
    const out = acc("a", { planName: PLAN_100, dataUsageGb: "120" });
    const first = priorityAlertsToSend([out, acc("b", { planName: PLAN_100, dataUsageGb: "10" })], []);
    expect(first.send.map((a) => a.id)).toEqual(["a"]);
    expect(priorityAlertsToSend([out], first.keep).send).toEqual([]);
    const renewed = priorityAlertsToSend([acc("a", { planName: PLAN_100, dataUsageGb: "3", priorityDataExhausted: false })], first.keep);
    expect(renewed.keep).toEqual([]);
    expect(priorityAlertsToSend([out], renewed.keep).send).toHaveLength(1);
  });

  it("skips deleted, archived and canceled devices", () => {
    const list = [
      acc("a", { priorityDataExhausted: true, deletedAt: "x" }),
      acc("b", { priorityDataExhausted: true, archivedAt: "x" }),
      acc("c", { priorityDataExhausted: true, serviceStatus: "canceled" }),
    ];
    expect(priorityAlertsToSend(list, []).send).toEqual([]);
  });

  it("builds the Telegram message", () => {
    const text = priorityTelegramText([acc("a", { planName: PLAN_100, dataUsageGb: "121" })]);
    expect(text).toContain("📶 جهاز a 100G - الاستهلاك 121 GB");
    expect(text).toContain("بسرعة محدودة");
  });
});
