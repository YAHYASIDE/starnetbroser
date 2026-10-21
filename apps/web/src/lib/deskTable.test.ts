import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeDeskFilters,
  applyDeskFilters,
  DEFAULT_SORT,
  defaultColumns,
  isStale,
  matchesExpiry,
  nextSort,
  NO_DESK_FILTERS,
  parseColumns,
  planChoices,
  sortDevices,
  starlinkDue,
  statusView,
  toggleColumn,
} from "./deskTable";

function device(over: Partial<StarlinkAccountSummary>): StarlinkAccountSummary {
  return {
    id: "d",
    customerId: "",
    name: "",
    deviceName: "",
    kitNumber: "",
    serialNumber: "",
    standbyDate: "",
    rechargeDate: "",
    balanceDue: "0",
    currency: "$",
    dishStatus: DeviceStatus.GREEN,
    wifiStatus: DeviceStatus.GREEN,
    alertReason: "",
    lastUpdated: "",
    lastSuccessfulScanAt: null,
    planName: "",
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("columns", () => {
  it("keeps «الحساب» and the table's own order, whatever was saved", () => {
    expect(parseColumns(["wifi", "nope", "plan"])).toEqual(["name", "plan", "wifi"]);
    expect(parseColumns("broken")).toEqual(defaultColumns());
    expect(toggleColumn(["name", "plan"], "name")).toEqual(["name", "plan"]);
    expect(toggleColumn(["name", "plan"], "email")).toEqual(["name", "email", "plan"]);
    expect(toggleColumn(["name", "email", "plan"], "email")).toEqual(["name", "plan"]);
  });
});

describe("statusView", () => {
  it("gives every status words and a sign, not only a color", () => {
    expect(statusView(DeviceStatus.GREEN)).toEqual({ tone: "ok", label: "متصل", sign: "●" });
    expect(statusView(DeviceStatus.RED).label).toBe("غير متصل");
    expect(statusView(DeviceStatus.GRAY).tone).toBe("unknown");
    expect(statusView(undefined).label).toBe("غير معروف");
  });
});

describe("expiry", () => {
  it("counts days as the card does (the renewal date is the stop instant)", () => {
    expect(matchesExpiry(device({ rechargeDate: "2026/10/21" }), "expired")).toBe(true);
    expect(matchesExpiry(device({ rechargeDate: "2026/10/22" }), "today")).toBe(true);
    expect(matchesExpiry(device({ rechargeDate: "2026/10/23" }), "tomorrow")).toBe(true);
    expect(matchesExpiry(device({ rechargeDate: "2026/10/28" }), "week")).toBe(true);
    expect(matchesExpiry(device({ rechargeDate: "2026/10/29" }), "week")).toBe(false);
    expect(matchesExpiry(device({ standbyDate: "2026/10/22" }), "today")).toBe(true);
    expect(matchesExpiry(device({}), "unread")).toBe(true);
    expect(matchesExpiry(device({}), "expired")).toBe(false);
  });
});

describe("desk filters", () => {
  const list = [
    device({ id: "a", planName: "Roam 50GB", rechargeDate: "2026/10/22" }),
    device({ id: "b", planName: "Residential", rechargeDate: "2026/11/10" }),
    device({ id: "c", planName: "Roam 50GB", rechargeDate: "2026/11/10" }),
  ];
  it("lists the plans most used first and filters by plan, date and category", () => {
    expect(planChoices(list)).toEqual(["Roam 50GB", "Residential"]);
    expect(applyDeskFilters(list, { ...NO_DESK_FILTERS, plan: "Roam 50GB" }).map((d) => d.id)).toEqual(["a", "c"]);
    expect(applyDeskFilters(list, { ...NO_DESK_FILTERS, expiry: "today" }).map((d) => d.id)).toEqual(["a"]);
    expect(applyDeskFilters(list, { ...NO_DESK_FILTERS, category: "vip" }, (d) => (d.id === "b" ? ["vip"] : [])).map((d) => d.id)).toEqual(["b"]);
    expect(activeDeskFilters({ plan: "x", expiry: "week", category: "" })).toBe(2);
  });
});

describe("sort", () => {
  const ctx = { clientName: (d: StarlinkAccountSummary) => (d.id === "a" ? "محمد" : d.id === "b" ? "أحمد" : ""), owed: () => 0 };
  const list = [
    device({ id: "a", name: "ب", rechargeDate: "2026/11/10", balanceDue: "12.5", dishStatus: DeviceStatus.GREEN }),
    device({ id: "b", name: "أ", rechargeDate: "2026/10/25", balanceDue: "0", dishStatus: DeviceStatus.RED }),
    device({ id: "c", name: "ت", rechargeDate: "", balanceDue: "65", dishStatus: DeviceStatus.YELLOW }),
  ];
  it("sorts by date with unread dates last, both ways", () => {
    expect(sortDevices(list, DEFAULT_SORT, ctx).map((d) => d.id)).toEqual(["b", "a", "c"]);
    expect(sortDevices(list, { key: "renewal", dir: "desc" }, ctx).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });
  it("sorts by amount, name, customer and status (worst first)", () => {
    expect(sortDevices(list, { key: "due", dir: "desc" }, ctx).map((d) => d.id)).toEqual(["c", "a", "b"]);
    expect(sortDevices(list, { key: "name", dir: "asc" }, ctx).map((d) => d.id)).toEqual(["b", "a", "c"]);
    expect(sortDevices(list, { key: "client", dir: "asc" }, ctx).map((d) => d.id)).toEqual(["b", "a", "c"]);
    expect(sortDevices(list, { key: "dish", dir: "asc" }, ctx).map((d) => d.id)).toEqual(["b", "c", "a"]);
  });
  it("a second click on the same header flips it", () => {
    expect(nextSort(DEFAULT_SORT, "renewal")).toEqual({ key: "renewal", dir: "desc" });
    expect(nextSort(DEFAULT_SORT, "due")).toEqual({ key: "due", dir: "asc" });
  });
});

describe("amounts and age", () => {
  it("reads Starlink's balance and tells an old read", () => {
    expect(starlinkDue(device({ balanceDue: "1,250.50" }))).toBe(1250.5);
    expect(starlinkDue(device({ balanceDue: "" }))).toBe(0);
    expect(isStale(null)).toBe(true);
    expect(isStale(new Date(2026, 9, 21, 8).toISOString())).toBe(false);
    expect(isStale(new Date(2026, 9, 18).toISOString())).toBe(true);
  });
});
