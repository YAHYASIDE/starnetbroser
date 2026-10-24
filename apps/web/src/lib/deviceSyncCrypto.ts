/**
 * 🔐 The phone ↔ laptop link's encryption: a random 256-bit key made on the phone and carried to the
 * laptop inside the «رمز الربط» - so plain AES-256-GCM, no password stretching (that would cost a
 * second per batch). Firebase only ever sees ciphertext.
 */

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function newLinkKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isLinkKey(hex: string): boolean {
  return /^[0-9a-f]{64}$/.test(hex);
}

const keys = new Map<string, Promise<CryptoKey>>();

function keyFor(hex: string): Promise<CryptoKey> {
  let key = keys.get(hex);
  if (!key) {
    key = crypto.subtle.importKey("raw", fromHex(hex) as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    keys.set(hex, key);
  }
  return key;
}

export interface Sealed {
  iv: string;
  data: string;
}

export async function sealText(text: string, keyHex: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await keyFor(keyHex), new TextEncoder().encode(text));
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** Throws on a wrong key or tampered data (AES-GCM's check). */
export async function openText(sealed: Sealed, keyHex: string): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) as BufferSource }, await keyFor(keyHex), fromBase64(sealed.data) as BufferSource);
  return new TextDecoder().decode(plain);
}
