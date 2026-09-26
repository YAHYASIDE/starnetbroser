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
}

const PARAM = "newDevice";

export function buildNewDeviceHref(prefill: NewDevicePrefill): string {
  const params = new URLSearchParams({ [PARAM]: "1", clientId: prefill.clientId });
  if (prefill.representativeId) params.set("representativeId", prefill.representativeId);
  if (prefill.name) params.set("name", prefill.name);
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
  };
}
