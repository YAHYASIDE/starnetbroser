import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildCodeDevices } from "./codeDevices";

describe("🔑 the device details sent with each code", () => {
  it("name, customer, email and KIT; deleted devices left out", () => {
    const accounts = [
      { id: "d1", name: "جهاز السوق", clientId: "c1", expectedEmail: "demo-1@example.com", kitNumber: "KIT000000", serialNumber: "" },
      { id: "d2", name: " ", serialNumber: "SN000", kitNumber: "" },
      { id: "d3", name: "محذوف", deletedAt: "2026-10-01" },
    ] as StarlinkAccountSummary[];
    expect(buildCodeDevices(accounts, { c1: { id: "c1", name: "زبون تجريبي", createdAt: "", updatedAt: "" } })).toEqual({
      d1: { name: "جهاز السوق", client: "زبون تجريبي", email: "demo-1@example.com", kit: "KIT000000" },
      d2: { kit: "SN000" },
    });
  });
});
