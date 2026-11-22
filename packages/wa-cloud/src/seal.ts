/**
 * 🔐 What travels between the STAR NET app and the Worker is sealed with one key the two share (AES-256-GCM, the
 * same shape as the app's lib/deviceSyncCrypto.ts: { iv, data } base64) - the pack, the events, a staff reply. Only a
 * holder of the key can write a pack or read the events, so no other password is needed. Meta's webhooks are checked
 * with their own signature (X-Hub-Signature-256 = HMAC-SHA256 of the raw body with the Meta app's secret).
 */

export interface Sealed {
  iv: string;
  data: string;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array {
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

export function isKeyHex(hex: string | undefined): hex is string {
  return typeof hex === "string" && /^[0-9a-f]{64}$/.test(hex);
}

async function aesKey(hex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromHex(hex) as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function seal(text: string, keyHex: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await aesKey(keyHex), new TextEncoder().encode(text));
  return { iv: b64(iv), data: b64(new Uint8Array(data)) };
}

/** Throws on a wrong key or tampered data. */
export async function open(sealed: Sealed, keyHex: string): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) as BufferSource }, await aesKey(keyHex), unb64(sealed.data) as BufferSource);
  return new TextDecoder().decode(plain);
}

/** Meta's webhook signature: "sha256=<hex>" over the raw body. Constant-time compare. */
export async function validMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7).toLowerCase();
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
