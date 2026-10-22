import { describe, expect, it } from "vitest";
import { buildNewDeviceHref, deviceInvoiceLines, parseNewDevicePrefill, saleLooksLikeDevice } from "./deviceFromSale";

describe("deviceFromSale", () => {
  it("recognises Starlink kits by name in Arabic or English", () => {
    expect(saleLooksLikeDevice(["كابل", "Starlink Standard"])).toBe(true);
    expect(saleLooksLikeDevice(["جهاز ستارلينك ميني"])).toBe(true);
    expect(saleLooksLikeDevice(["كابل", "راوتر"])).toBe(false);
  });

  it("round-trips the prefill through the home URL", () => {
    const href = buildNewDeviceHref({ clientId: "c 1", representativeId: "r1", name: "محمد" });
    expect(parseNewDevicePrefill(href.slice(1))).toEqual({ clientId: "c 1", representativeId: "r1", name: "محمد" });
    expect(parseNewDevicePrefill(buildNewDeviceHref({ clientId: "c1", repRequestId: "rq1" }).slice(1))).toEqual({ clientId: "c1", repRequestId: "rq1" });
    expect(parseNewDevicePrefill("?clientId=x")).toBeNull();
    expect(parseNewDevicePrefill("")).toBeNull();
  });
});

describe("🛰️ a device sold by a store invoice (his Oct 22 2026 ask)", () => {
  it("carries the invoice and opens «إنشاء حساب جديد»", () => {
    const href = buildNewDeviceHref({ clientId: "c1", invoiceId: "inv-1", create: true });
    expect(parseNewDevicePrefill(href.slice(1))).toMatchObject({ clientId: "c1", invoiceId: "inv-1", create: true });
    expect(parseNewDevicePrefill(buildNewDeviceHref({ clientId: "c1" }).slice(1))).toMatchObject({ invoiceId: undefined, create: undefined });
  });

  it("its invoice in short lines: price, shipping with its cost, paid and left", () => {
    const lines = deviceInvoiceLines(
      { date: "2026-10-22", currencyCode: "MRU", discount: 0, paidAmount: 100000, lines: [{ itemId: "mini", quantity: 1, unitPrice: 180000, shippingCost: 83.5, shippingCharge: 45000 }] },
      () => "MINI",
      () => "أوقية",
    );
    expect(lines).toEqual(["MINI × 1 = 180,000 أوقية", "🚚 شحن MINI: 45,000 أوقية (التكلفة 83.5)", "الإجمالي 225,000 أوقية · دُفع 100,000 · الباقي 125,000"]);
  });
});
