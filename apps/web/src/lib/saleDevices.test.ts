import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Invoice } from "./invoiceStore";
import { findKitClashes, isStarlinkItem, markActivated, releaseSaleDevices, resizeUnits, syncSaleDevices } from "./saleDevices";

let n = 0;
const newId = () => `id-${++n}`;
const NOW = "2026-10-22T10:00:00.000Z";

function invoice(lines: Invoice["lines"], patch: Partial<Invoice> = {}): Invoice {
  return { id: "inv-1", kind: "sale", date: "2026-10-22", currencyCode: "MRU", lines, discount: 0, paidAmount: 0, clientId: "c1", createdAt: NOW, ...patch };
}

const v4 = (units: { id: string; kit?: string; name?: string }[]) => ({ itemId: "v4", quantity: units.length, unitPrice: 180000, transactionId: "t1", units });

const input = (inv: Invoice) => ({
  invoice: inv,
  itemName: (id: string) => (id === "v4" ? "V 4" : "كابل"),
  isDeviceItem: (id: string) => id === "v4",
  client: { name: "زبون تجريبي", phone: "22200000000" },
  now: NOW,
  newId,
});

describe("isStarlinkItem", () => {
  it("guesses devices from the name and lets his flag win", () => {
    expect(isStarlinkItem({ name: "V 4" })).toBe(true);
    expect(isStarlinkItem({ name: "Starlink Mini" })).toBe(true);
    expect(isStarlinkItem({ name: "كابل ستارلينك 15 متر" })).toBe(false);
    expect(isStarlinkItem({ name: "راوتر" })).toBe(false);
    expect(isStarlinkItem({ name: "كابل", isStarlinkDevice: true })).toBe(true);
    expect(isStarlinkItem({ name: "V 4", isStarlinkDevice: false })).toBe(false);
  });
});

describe("resizeUnits", () => {
  it("keeps typed pieces, pads and cuts to the quantity", () => {
    const two = resizeUnits([{ id: "a", kit: "KIT1" }], 2, () => "b");
    expect(two).toEqual([{ id: "a", kit: "KIT1" }, { id: "b" }]);
    expect(resizeUnits(two, 1, newId)).toEqual([{ id: "a", kit: "KIT1" }]);
    expect(resizeUnits(two, 1.5, newId)).toEqual([]);
  });
});

describe("syncSaleDevices", () => {
  it("makes one «غير مفعّل» device per piece, linked to the customer and the invoice, with no money", () => {
    const inv = invoice([v4([{ id: "u1", kit: " kit 0001 " }, { id: "u2", name: "جهاز المحل" }])]);
    const result = syncSaleDevices([], input(inv));
    expect(result.created).toHaveLength(2);
    const [second, first] = result.accounts;
    expect(first).toMatchObject({
      name: "زبون تجريبي - V 4 (1)",
      kitNumber: "KIT0001",
      deviceModel: "V 4",
      clientId: "c1",
      phone: "22200000000",
      storeInvoiceId: "inv-1",
      storeSaleUnitId: "u1",
      pendingActivation: { soldAt: "2026-10-22" },
      rechargeDate: "",
      balanceDue: "0",
    });
    expect(second).toMatchObject({ name: "جهاز المحل", kitNumber: "", storeSaleUnitId: "u2" });
  });

  it("saving again never doubles a device; an edit moves KIT and customer onto the same device", () => {
    const first = syncSaleDevices([], input(invoice([v4([{ id: "u1", kit: "KIT0001" }])])));
    const again = syncSaleDevices(first.accounts, input(invoice([v4([{ id: "u1", kit: "KIT0001" }])])));
    expect(again.created).toHaveLength(0);
    expect(again.accounts).toHaveLength(1);
    const edited = syncSaleDevices(first.accounts, input(invoice([v4([{ id: "u1", kit: "KIT0002" }])], { clientId: "c2" })));
    expect(edited.accounts).toHaveLength(1);
    expect(edited.accounts[0]).toMatchObject({ id: first.created[0]!.id, kitNumber: "KIT0002", clientId: "c2" });
    const renamed = syncSaleDevices(first.accounts, { ...input(invoice([v4([{ id: "u1", kit: "KIT0001" }])], { clientId: "c2" })), client: { name: "زبون آخر" } });
    expect(renamed.accounts[0]!.name).toBe("زبون آخر - V 4");
  });

  it("a piece removed from the invoice: a pending device goes to the trash, an active one only loses the link", () => {
    const start = syncSaleDevices([], input(invoice([v4([{ id: "u1" }, { id: "u2" }])])));
    const activated = start.accounts.map((a) => (a.storeSaleUnitId === "u2" ? markActivated(a, NOW) : a));
    const cut = syncSaleDevices(activated, input(invoice([v4([])])));
    const u1 = cut.accounts.find((a) => a.id === start.accounts.find((x) => x.storeSaleUnitId === "u1")!.id)!;
    expect(u1.deletedAt).toBe(NOW);
    const u2 = cut.accounts.find((a) => a.activatedAt)!;
    expect(u2.deletedAt).toBeUndefined();
    expect(u2.storeSaleUnitId).toBeUndefined();
    expect(u2.storeInvoiceId).toBe("inv-1");
  });

  it("releases everything when the invoice is deleted, and a return makes no device", () => {
    const start = syncSaleDevices([], input(invoice([v4([{ id: "u1" }])])));
    expect(releaseSaleDevices(start.accounts, "inv-1", NOW).accounts[0]!.deletedAt).toBe(NOW);
    expect(syncSaleDevices([], input(invoice([v4([{ id: "u9" }])], { returnOfInvoiceId: "inv-0" }))).created).toHaveLength(0);
  });

  it("an activated device keeps its own rep and stays active through an edit", () => {
    const start = syncSaleDevices([], input(invoice([v4([{ id: "u1" }])])));
    const active = start.accounts.map((a) => ({ ...markActivated(a, NOW), representativeId: "r9" }));
    const edited = syncSaleDevices(active, input(invoice([v4([{ id: "u1", kit: "KIT7" }])], { representativeId: "r1" })));
    expect(edited.accounts[0]).toMatchObject({ representativeId: "r9", pendingActivation: null, kitNumber: "KIT7" });
  });
});

describe("findKitClashes", () => {
  const existing = { id: "d9", name: "جهاز قديم", kitNumber: "KIT0009", serialNumber: "", clientId: "c3" } as StarlinkAccountSummary;
  it("finds a KIT typed twice and one already on another device", () => {
    expect(findKitClashes([{ id: "a", kit: "kit0001" }, { id: "b", kit: "KIT0001" }], [])).toEqual([{ kit: "KIT0001", sameInvoice: true }]);
    expect(findKitClashes([{ id: "a", kit: "kit 0009" }], [existing])).toEqual([{ kit: "KIT0009", accountId: "d9", accountName: "جهاز قديم", clientId: "c3" }]);
  });

  it("ignores the invoice's own devices and the trash", () => {
    const own = { ...existing, storeSaleUnitId: "a" };
    expect(findKitClashes([{ id: "a", kit: "KIT0009" }], [own])).toEqual([]);
    expect(findKitClashes([{ id: "a", kit: "KIT0009" }], [{ ...existing, deletedAt: NOW }])).toEqual([]);
  });
});

describe("markActivated", () => {
  it("clears «غير مفعّل» once", () => {
    const pending = { id: "x", pendingActivation: { soldAt: "2026-10-01" } } as unknown as StarlinkAccountSummary;
    expect(markActivated(pending, NOW)).toMatchObject({ pendingActivation: null, activatedAt: NOW });
    const active = markActivated(pending, NOW);
    expect(markActivated(active, "later")).toBe(active);
  });
});
