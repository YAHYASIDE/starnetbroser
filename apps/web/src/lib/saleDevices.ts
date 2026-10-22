/**
 * 📦 Selling a Starlink device by invoice (his Oct 22 2026 ask): each device on a sale line (one per
 * piece, its own KIT and optional name) becomes its own device record - linked to the customer and
 * the invoice, «⏳ غير مفعّل» until «شحن / تفعيل». The devices carry no money: the sale's amount,
 * profit and debt stay the invoice's alone. Pure: the device list in, the device list out.
 */

import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";
import { normalizeKit } from "./accountCreation";
import type { Invoice, SaleUnit } from "./invoiceStore";

const DEVICE_NAME = /starlink|ستار ?لينك|\bkit\b|كيت|جهاز|طبق|dish|mini|ميني|\bv ?[2-9]\b|\bgen ?[1-9]\b|standard|ستاندرد|\bhp\b|flat/i;
const ACCESSORY_NAME = /كابل|cable|راوتر|router|حامل|mount|محول|adapter|شاحن|charger|wire|سلك|pipe|ماسورة/i;

/** 🛰️ The item is a Starlink device: his own flag on the item, else guessed from its name (a cable,
 * router or mount never is). */
export function isStarlinkItem(item: { name: string; isStarlinkDevice?: boolean } | undefined): boolean {
  if (!item) return false;
  if (item.isStarlinkDevice !== undefined) return item.isStarlinkDevice;
  return DEVICE_NAME.test(item.name) && !ACCESSORY_NAME.test(item.name);
}

/** The devices a line of `quantity` pieces holds: the ones typed so far, cut or padded to the count
 * (a whole number of pieces - a fraction makes no device). */
export function resizeUnits(units: SaleUnit[] | undefined, quantity: number, newId: () => string): SaleUnit[] {
  const count = Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 200) : 0;
  const list = (units ?? []).slice(0, count);
  while (list.length < count) list.push({ id: newId() });
  return list;
}

export function cleanKit(kit: string | undefined): string {
  return normalizeKit(kit ?? "");
}

export interface KitClash {
  kit: string;
  /** Typed twice in this same invoice. */
  sameInvoice?: boolean;
  /** Already on a device (not one of this invoice's own). */
  accountId?: string;
  accountName?: string;
  clientId?: string;
}

/**
 * Every KIT that can't be saved: typed twice in the form, or already on another device (its KIT or
 * serial, trash excluded). The invoice's own devices don't count - an edit keeps its KITs.
 */
export function findKitClashes(units: SaleUnit[], accounts: StarlinkAccountSummary[], invoiceId?: string): KitClash[] {
  const out: KitClash[] = [];
  const seen = new Set<string>();
  const ownUnits = new Set(units.map((u) => u.id));
  for (const unit of units) {
    const kit = cleanKit(unit.kit);
    if (!kit) continue;
    if (seen.has(kit)) {
      if (!out.some((c) => c.kit === kit && c.sameInvoice)) out.push({ kit, sameInvoice: true });
      continue;
    }
    seen.add(kit);
    const owner = accounts.find(
      (a) =>
        !a.deletedAt &&
        !(a.storeSaleUnitId && ownUnits.has(a.storeSaleUnitId)) &&
        !(invoiceId && a.storeInvoiceId === invoiceId && a.storeSaleUnitId) &&
        (cleanKit(a.kitNumber) === kit || cleanKit(a.serialNumber) === kit),
    );
    if (owner) out.push({ kit, accountId: owner.id, accountName: owner.name, clientId: owner.clientId });
  }
  return out;
}

/** The Arabic message for the first clash, naming the device that has the KIT. */
export function kitClashMessage(clash: KitClash, clientName?: (id: string) => string | undefined): string {
  if (clash.sameInvoice) return `رقم KIT ${clash.kit} مكتوب لجهازين في هذه الفاتورة`;
  const owner = clash.clientId ? clientName?.(clash.clientId) : undefined;
  return `رقم KIT ${clash.kit} مسجّل مسبقًا للجهاز «${clash.accountName ?? ""}»${owner ? ` (${owner})` : ""} - افتحه من الأجهزة بدل إنشاء نسخة ثانية`;
}

function blankDevice(id: string, now: string): StarlinkAccountSummary {
  return {
    id,
    customerId: `customer-${id}`,
    addedAt: now,
    name: "",
    phone: "",
    expectedEmail: "",
    deviceName: "Standard Kit",
    kitNumber: "",
    serialNumber: "",
    standbyDate: "",
    rechargeDate: "",
    balanceDue: "0",
    currency: "$",
    dishStatus: DeviceStatus.GRAY,
    wifiStatus: DeviceStatus.GRAY,
    alertReason: "",
    lastUpdated: "الآن",
    lastSuccessfulScanAt: null,
    planName: "",
  };
}

export interface SaleDevicesInput {
  invoice: Invoice;
  itemName: (itemId: string) => string | undefined;
  isDeviceItem: (itemId: string) => boolean;
  client?: { name: string; phone?: string };
  now: string;
  newId: () => string;
}

export interface SaleDevicesResult {
  accounts: StarlinkAccountSummary[];
  created: StarlinkAccountSummary[];
  updated: StarlinkAccountSummary[];
  /** Devices whose piece left the invoice: a «غير مفعّل» one goes to the trash, an active one only
   * loses its link to the sale. */
  released: StarlinkAccountSummary[];
}

/**
 * The invoice's devices made to match it: a new piece → a new «غير مفعّل» device; an existing one
 * (found by its unit id, so saving twice never doubles it) → its KIT, name, customer and rep follow
 * the invoice; a piece no longer there → released. A return invoice makes nothing.
 */
export function syncSaleDevices(accounts: StarlinkAccountSummary[], input: SaleDevicesInput): SaleDevicesResult {
  const { invoice } = input;
  const created: StarlinkAccountSummary[] = [];
  const updated: StarlinkAccountSummary[] = [];
  const keep = new Set<string>();
  let next = accounts.slice();
  if (invoice.kind === "sale" && !invoice.returnOfInvoiceId) {
    for (const line of invoice.lines) {
      if (!line.units?.length || !input.isDeviceItem(line.itemId)) continue;
      const model = input.itemName(line.itemId) ?? "";
      line.units.forEach((unit, index) => {
        keep.add(unit.id);
        const kit = cleanKit(unit.kit);
        const typedName = unit.name?.trim();
        const fallbackName = [input.client?.name, model].filter(Boolean).join(" - ") + (line.units!.length > 1 ? ` (${index + 1})` : "");
        const at = next.findIndex((a) => a.storeSaleUnitId === unit.id);
        if (at === -1) {
          const device: StarlinkAccountSummary = {
            ...blankDevice(input.newId(), input.now),
            name: typedName || fallbackName || model || "جهاز",
            phone: input.client?.phone ?? "",
            kitNumber: kit,
            deviceModel: model || undefined,
            clientId: invoice.clientId,
            representativeId: invoice.representativeId,
            storeInvoiceId: invoice.id,
            storeSaleUnitId: unit.id,
            pendingActivation: { soldAt: invoice.date },
          };
          created.push(device);
          next = [device, ...next];
          return;
        }
        const current = next[at]!;
        const pending = Boolean(current.pendingActivation);
        const patched: StarlinkAccountSummary = {
          ...current,
          ...(kit && kit !== cleanKit(current.kitNumber) ? { kitNumber: kit } : {}),
          ...(!kit && pending ? { kitNumber: "" } : {}),
          // a typed name wins; an automatic one («الزبون - V4») follows the customer while still «غير مفعّل».
          ...(typedName ? { name: typedName } : pending && fallbackName ? { name: fallbackName } : {}),
          clientId: invoice.clientId,
          ...(pending ? { representativeId: invoice.representativeId, pendingActivation: { soldAt: invoice.date } } : {}),
          deviceModel: model || current.deviceModel,
          storeInvoiceId: invoice.id,
        };
        if (JSON.stringify(patched) !== JSON.stringify(current)) {
          next[at] = patched;
          updated.push(patched);
        }
      });
    }
  }
  const released: StarlinkAccountSummary[] = [];
  next = next.map((a) => {
    if (a.storeInvoiceId !== invoice.id || !a.storeSaleUnitId || keep.has(a.storeSaleUnitId) || a.deletedAt) return a;
    const out: StarlinkAccountSummary = a.pendingActivation
      ? { ...a, deletedAt: input.now }
      : (({ storeSaleUnitId: _unit, ...rest }) => rest)(a);
    released.push(out);
    return out;
  });
  return { accounts: next, created, updated, released };
}

/** 🗑 The invoice is gone: its «غير مفعّل» devices go to the trash, active ones only lose the link. */
export function releaseSaleDevices(accounts: StarlinkAccountSummary[], invoiceId: string, now: string): SaleDevicesResult {
  const empty = { id: invoiceId, kind: "sale", date: "", currencyCode: "", lines: [], discount: 0, paidAmount: 0, createdAt: now } as Invoice;
  return syncSaleDevices(accounts, { invoice: empty, itemName: () => undefined, isDeviceItem: () => false, now, newId: () => "" });
}

/** ✅ «شحن / تفعيل» done (the account saved or a first charge): the device is active from now on. */
export function markActivated(account: StarlinkAccountSummary, now: string): StarlinkAccountSummary {
  if (!account.pendingActivation) return account;
  return { ...account, pendingActivation: null, activatedAt: now };
}

export function isPendingActivation(account: Pick<StarlinkAccountSummary, "pendingActivation" | "deletedAt" | "archivedAt">): boolean {
  return Boolean(account.pendingActivation) && !account.deletedAt && !account.archivedAt;
}

/** The pieces still missing a KIT (shown on the card as «KIT ناقص»). */
export function missingKit(account: Pick<StarlinkAccountSummary, "kitNumber" | "serialNumber">): boolean {
  return !cleanKit(account.kitNumber) && !cleanKit(account.serialNumber);
}
