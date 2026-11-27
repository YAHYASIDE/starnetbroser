/**
 * 📇 The customers as phone contacts (his Nov 27 2026 «كيف أثبّت كل هذه جهات الاتصال» - the WhatsApp Business chat list
 * full of bare numbers): one .vcf file; opening it on the phone imports every customer into the phone's contacts, so
 * WhatsApp (and the devices linked to it) show the names. Pure - tested in contactsExport.test.ts.
 */

import type { Client } from "./clientStore";
import { splitPhoneNumber } from "./phoneCountryCodes";

export interface ContactsOptions {
  /** Written before each name («ستارلينك - أحمد») - empty = the name as it is. */
  prefix?: string;
  /** Only customers that have at least one device (clientId on an account). */
  onlyWithDevices?: boolean;
  /** Customers added by number only (their name IS the number) are left out - nothing to show. */
  skipNoName?: boolean;
}

export interface ContactCard {
  name: string;
  /** International: +<dial><number>. */
  phone: string;
}

export interface ContactsBuild {
  cards: ContactCard[];
  skippedNoPhone: number;
  skippedNoName: number;
  skippedNoDevice: number;
  duplicates: number;
}

/** «+22222205105» from whatever is stored; null when there is no usable number. */
export function internationalPhone(phone: string | undefined): string | null {
  let digits = (phone ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7) return null;
  // 8 digits = a Mauritanian local number (a country code would make it 10+): never read its first digits as a code
  if (digits.length === 8) return `+222${digits}`;
  const { dialCode, localNumber } = splitPhoneNumber(digits);
  if (!localNumber) return null;
  return `${dialCode}${localNumber}`;
}

export function buildCards(clients: Client[], devices: { clientId?: string }[], options: ContactsOptions = {}): ContactsBuild {
  const withDevice = new Set(devices.map((d) => d.clientId).filter((id): id is string => Boolean(id)));
  const out: ContactsBuild = { cards: [], skippedNoPhone: 0, skippedNoName: 0, skippedNoDevice: 0, duplicates: 0 };
  const seen = new Set<string>();
  const prefix = (options.prefix ?? "").trim();
  for (const c of clients) {
    const phone = internationalPhone(c.phone);
    if (!phone) {
      out.skippedNoPhone++;
      continue;
    }
    if (options.skipNoName !== false && c.noName) {
      out.skippedNoName++;
      continue;
    }
    if (options.onlyWithDevices && !withDevice.has(c.id)) {
      out.skippedNoDevice++;
      continue;
    }
    if (seen.has(phone)) {
      out.duplicates++;
      continue;
    }
    seen.add(phone);
    out.cards.push({ name: `${prefix ? `${prefix} ` : ""}${c.name.trim()}`.trim(), phone });
  }
  return out;
}

/** vCard text values: backslash, comma, semicolon and line breaks escaped. */
function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** One .vcf (vCard 3.0, UTF-8, CRLF lines) with every card. */
export function toVcf(cards: ContactCard[]): string {
  return (
    cards
      .map((c) => ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(c.name)}`, `N:${esc(c.name)};;;;`, `TEL;TYPE=CELL:${c.phone}`, "END:VCARD"].join("\r\n"))
      .join("\r\n") + (cards.length ? "\r\n" : "")
  );
}

/** A data: URL for the save-to-phone helper (UTF-8 text → base64). */
export function vcfDataUrl(vcf: string): string {
  const bytes = new TextEncoder().encode(vcf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:text/x-vcard;base64,${btoa(bin)}`;
}
