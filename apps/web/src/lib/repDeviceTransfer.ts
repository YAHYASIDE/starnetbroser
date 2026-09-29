/**
 * 📱 وضع المندوب: a representative runs STAR NET in "rep mode" on his own phone, adds his
 * customer's device and signs in to Starlink there, then sends the device - with its login
 * session - to the operator through the reps bot, as a small file encrypted with a code the
 * operator gave him (one code per rep). The operator's app downloads it, and only when he approves
 * does the device get added and its session restored, so he just opens it. The rep's phone keeps
 * no operator data, and its copy of the session is deleted once the file has arrived.
 *
 * Pure helpers + small stores. The code is a secret (settings-style `starnet.` key, never backed
 * up); the rep's own device list is ordinary `starnet_` data.
 */

import { decryptBackup, encryptBackup, type EncryptedBackup } from "./backupCrypto";

// ---- the pairing code ----

/** No 0/O/1/I/L - read aloud or typed from a screenshot without mistakes. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;

/** "K7QM-2XPA-9RTD" (12 random characters, ~59 bits - PBKDF2 makes guessing it hopeless). */
export function generateRepDeviceCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(CODE_LENGTH);
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return formatRepDeviceCode(raw)!;
}

/** What the rep typed -> "XXXX-XXXX-XXXX", or null when it can't be a code. Spaces, dashes and
 * lower case are fine; a character outside the alphabet (O, I, L, 0, 1) is a typo and is refused
 * rather than silently becoming a different key. */
export function formatRepDeviceCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s\-_.]/g, "");
  if (raw.length !== CODE_LENGTH || [...raw].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

// ---- the file the rep sends ----

export interface RepDeviceDetails {
  /** The customer's name. */
  clientName: string;
  phone?: string;
  /** Starlink login email. */
  email?: string;
  kit?: string;
  /** What the card is called; defaults to the email / KIT / customer name. */
  deviceName?: string;
  /** «كود البريد» - the email's own password (travels only inside the encrypted file). */
  emailPassword?: string;
  /** «كود الواي فاي» - also the Starlink password (travels only inside the encrypted file). */
  wifiPassword?: string;
}

export interface RepDevicePayload {
  device: RepDeviceDetails;
  /** url -> cookie string, as exportSessionCookies gives it for this device. */
  cookies: Record<string, string>;
  /** The device's Outlook mailbox session, when the rep signed into it too (url -> cookie). */
  mailCookies?: Record<string, string>;
  createdAt: string;
}

interface RepDeviceFile {
  kind: "starnet-rep-device";
  v: 1;
  enc: EncryptedBackup;
}

export class NotADeviceFileError extends Error {
  constructor() {
    super("هذا ليس ملف جهاز من تطبيق المندوب");
    this.name = "NotADeviceFileError";
  }
}

/** "starnet-device-<id>.json" - the prefix is how the bot service recognises it. */
export function repDeviceFileName(deviceId: string): string {
  const slug = deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "x";
  return `starnet-device-${slug}.json`;
}

export async function buildRepDeviceFile(payload: RepDevicePayload, code: string): Promise<string> {
  const file: RepDeviceFile = { kind: "starnet-rep-device", v: 1, enc: await encryptBackup(payload, code) };
  return JSON.stringify(file);
}

/** Throws NotADeviceFileError for anything else, WrongPasswordError for another rep's code. */
export async function readRepDeviceFile(text: string, code: string): Promise<RepDevicePayload> {
  let file: Partial<RepDeviceFile>;
  try {
    file = JSON.parse(text) as Partial<RepDeviceFile>;
  } catch {
    throw new NotADeviceFileError();
  }
  if (file?.kind !== "starnet-rep-device" || !file.enc?.ciphertext) throw new NotADeviceFileError();
  const payload = (await decryptBackup(file.enc, code)) as Partial<RepDevicePayload>;
  if (!payload?.device?.clientName || !payload.cookies || typeof payload.cookies !== "object") throw new NotADeviceFileError();
  return payload as RepDevicePayload;
}

export function deviceDisplayName(device: RepDeviceDetails): string {
  return device.deviceName?.trim() || device.email?.trim() || device.kit?.trim() || device.clientName.trim();
}

// ---- operator side: one code per rep ----

const CODES_KEY = "starnet.repDeviceCodes";

export function loadRepDeviceCodes(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(CODES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function repDeviceCode(repId: string): string | undefined {
  return loadRepDeviceCodes()[repId];
}

/** The rep's code, created the first time. `renew`: a new one (the old one stops working). */
export function ensureRepDeviceCode(repId: string, renew = false): string {
  const codes = loadRepDeviceCodes();
  if (codes[repId] && !renew) return codes[repId]!;
  codes[repId] = generateRepDeviceCode();
  try {
    window.localStorage.setItem(CODES_KEY, JSON.stringify(codes));
  } catch {
    // storage full - the code still shows; it just won't be remembered
  }
  return codes[repId]!;
}

// ---- rep side: the mode and his devices ----

const MODE_KEY = "starnet.repMode";

export interface RepModeSettings {
  code: string;
  /** How he's greeted (optional). */
  name?: string;
}

export function loadRepMode(): RepModeSettings | null {
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RepModeSettings) : null;
    return parsed && formatRepDeviceCode(parsed.code) ? parsed : null;
  } catch {
    return null;
  }
}

/** Fired on window when the mode is switched, so the app swaps its whole screen. */
export const REP_MODE_EVENT = "starnet-repmode";

export function saveRepMode(settings: RepModeSettings | null): void {
  try {
    if (settings) window.localStorage.setItem(MODE_KEY, JSON.stringify(settings));
    else window.localStorage.removeItem(MODE_KEY);
  } catch {
    // unavailable
  }
  window.dispatchEvent(new Event(REP_MODE_EVENT));
}

export interface RepModeDevice extends RepDeviceDetails {
  /** Also the id of its isolated Starlink browser on this phone. */
  id: string;
  createdAt: string;
  /** When he last shared the file. */
  sentAt?: string;
}

const DEVICES_KEY = "starnet_repmode_devices_v1";

export function loadRepModeDevices(): RepModeDevice[] {
  try {
    const raw = window.localStorage.getItem(DEVICES_KEY);
    const list = raw ? (JSON.parse(raw) as RepModeDevice[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRepModeDevices(list: RepModeDevice[]): void {
  try {
    window.localStorage.setItem(DEVICES_KEY, JSON.stringify(list));
  } catch {
    // storage full
  }
}

/** Trimmed; null when there's no customer name. */
export function cleanRepDeviceDetails(input: RepDeviceDetails): RepDeviceDetails | null {
  const clientName = input.clientName.trim();
  if (!clientName) return null;
  const phone = input.phone?.replace(/[^\d+]/g, "") || undefined;
  const email = input.email?.trim().toLowerCase() || undefined;
  const kit = input.kit?.trim().toUpperCase() || undefined;
  const deviceName = input.deviceName?.trim() || undefined;
  const emailPassword = input.emailPassword?.trim() || undefined;
  const wifiPassword = input.wifiPassword?.trim() || undefined;
  return {
    clientName,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(kit ? { kit } : {}),
    ...(deviceName ? { deviceName } : {}),
    ...(emailPassword ? { emailPassword } : {}),
    ...(wifiPassword ? { wifiPassword } : {}),
  };
}

export function addRepModeDevice(list: RepModeDevice[], details: RepDeviceDetails, now = new Date()): RepModeDevice[] {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rd-${now.getTime()}`;
  return [{ ...details, id, createdAt: now.toISOString() }, ...list];
}
