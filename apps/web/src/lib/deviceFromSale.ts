/**
 * "بيع جهاز من المتجر → حساب جهاز": when a store sale to a client looks like a Starlink kit, the
 * store offers to open the home page's add-device dialog already linked to that client (and the
 * sale's representative), instead of the operator re-typing it all. Nothing is created without
 * the operator confirming that dialog.
 */

const DEVICE_NAME_PATTERN = /starlink|ستار ?لينك|\bkit\b|كيت|جهاز|طبق|dish|mini|ميني/i;

/** True when any sold item's name looks like a Starlink device. */
export function saleLooksLikeDevice(itemNames: string[]): boolean {
  return itemNames.some((name) => DEVICE_NAME_PATTERN.test(name));
}

export interface NewDevicePrefill {
  clientId: string;
  representativeId?: string;
  name?: string;
  /** From a rep's "➕ زبون جديد" request. */
  email?: string;
  kit?: string;
  /** A 📱 device from the rep's app: its session is restored once the dialog saves. */
  repRequestId?: string;
  /** 🛰️ The store sale it comes from (his Oct 22 2026 ask) - kept on the device. */
  invoiceId?: string;
  /** Open on «🆕 إنشاء حساب جديد» (a new Starlink account) instead of «جهاز له حساب». */
  create?: boolean;
}

const PARAM = "newDevice";

export function buildNewDeviceHref(prefill: NewDevicePrefill): string {
  const params = new URLSearchParams({ [PARAM]: "1", clientId: prefill.clientId });
  if (prefill.representativeId) params.set("representativeId", prefill.representativeId);
  if (prefill.name) params.set("name", prefill.name);
  if (prefill.email) params.set("email", prefill.email);
  if (prefill.kit) params.set("kit", prefill.kit);
  if (prefill.repRequestId) params.set("repRequest", prefill.repRequestId);
  if (prefill.invoiceId) params.set("invoice", prefill.invoiceId);
  if (prefill.create) params.set("create", "1");
  return `/?${params.toString()}`;
}

/** Reads a prefill back from the home page's query string - null when this isn't one. */
export function parseNewDevicePrefill(search: string): NewDevicePrefill | null {
  const params = new URLSearchParams(search);
  const clientId = params.get("clientId");
  if (params.get(PARAM) !== "1" || !clientId) return null;
  return {
    clientId,
    representativeId: params.get("representativeId") || undefined,
    name: params.get("name") || undefined,
    email: params.get("email") || undefined,
    kit: params.get("kit") || undefined,
    repRequestId: params.get("repRequest") || undefined,
    invoiceId: params.get("invoice") || undefined,
    create: params.get("create") === "1" || undefined,
  };
}

/** 🧾 The store sale a device came with, as short lines for «معلومات الحساب»: each item, its shipping
 * (and what it cost us), what was paid and what is left. */
export function deviceInvoiceLines(
  invoice: { date: string; currencyCode: string; discount: number; paidAmount: number; lines: { itemId: string; quantity: number; unitPrice: number; shippingCost?: number; shippingCharge?: number }[] },
  itemName: (id: string) => string | undefined,
  currencyLabel: (code: string) => string,
): string[] {
  const cur = currencyLabel(invoice.currencyCode);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
  const out: string[] = [];
  let total = 0;
  for (const l of invoice.lines) {
    const name = itemName(l.itemId) ?? "صنف";
    total += l.quantity * l.unitPrice + (l.shippingCharge ?? 0);
    out.push(`${name} × ${fmt(l.quantity)} = ${fmt(l.quantity * l.unitPrice)} ${cur}`);
    if (l.shippingCharge !== undefined || l.shippingCost !== undefined) {
      out.push(`🚚 شحن ${name}: ${fmt(l.shippingCharge ?? 0)} ${cur}${l.shippingCost !== undefined ? ` (التكلفة ${fmt(l.shippingCost)})` : ""}`);
    }
  }
  total = Math.max(0, total - invoice.discount);
  if (invoice.discount > 0) out.push(`الخصم: ${fmt(invoice.discount)} ${cur}`);
  const left = total - invoice.paidAmount;
  out.push(`الإجمالي ${fmt(total)} ${cur} · دُفع ${fmt(invoice.paidAmount)}${left > 0.005 ? ` · الباقي ${fmt(left)}` : " · مدفوعة"}`);
  return out;
}
