import { describe, expect, it } from "vitest";
import { byLastActivity, clientLastActivity, latestStamp } from "./clientActivity";

describe("🕒 customers by latest activity", () => {
  it("the newest of the customer edit, a device operation, an invoice, a balance entry", () => {
    const client = { createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z" };
    expect(clientLastActivity({ client, entries: [], invoices: [], adjustments: [] })).toBe("2026-09-02T10:00:00.000Z");
    expect(
      clientLastActivity({ client, entries: [{ date: "2026-10-01", createdAt: "2026-10-05T08:00:00.000Z" }], invoices: [{ date: "2026-10-03", createdAt: "2026-10-03T09:00:00.000Z" }], adjustments: [] }),
    ).toBe("2026-10-05T08:00:00.000Z");
    // a record with only its day still counts
    expect(latestStamp([{ date: "2026-10-09" }, { createdAt: "2026-10-08T00:00:00.000Z" }])).toBe("2026-10-09");
  });

  it("newest first, then by name", () => {
    const rows = [
      { name: "ب", activity: "" },
      { name: "أ", activity: "" },
      { name: "ج", activity: "2026-10-01T00:00:00.000Z" },
      { name: "د", activity: "2026-10-06T00:00:00.000Z" },
    ];
    expect([...rows].sort(byLastActivity).map((r) => r.name)).toEqual(["د", "ج", "أ", "ب"]);
  });
});
