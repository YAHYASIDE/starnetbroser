/**
 * Password-based encryption for the "protected backup" feature (account list + login-session
 * cookies, see accountBackup.ts). PBKDF2-SHA256 (210,000 iterations - current OWASP guidance for
 * PBKDF2-HMAC-SHA256) derives an AES-256-GCM key from the user's password; AES-GCM's built-in
 * authentication tag is what turns "wrong password" and "corrupted/tampered file" into the exact
 * same safe failure (WrongPasswordError) instead of silently decrypting garbage. Nothing here
 * ever writes to disk or logs anything - it only ever returns/accepts plain in-memory values.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

export interface EncryptedBackup {
  /** Schema version of this envelope shape - bumped only if the crypto parameters below change. */
  v: 1;
  /** Base64. Not secret - PBKDF2 salts are meant to be stored alongside the ciphertext. */
  salt: string;
  /** Base64. Not secret - an AES-GCM IV is safe to store in the clear. */
  iv: string;
  /** Base64. The only part that's actually opaque without the password. */
  ciphertext: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("كلمة المرور غير صحيحة أو الملف تالف");
    this.name = "WrongPasswordError";
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Serializes `data` as JSON and encrypts it with a key derived from `password`. A fresh random
 * salt and IV are generated on every call, so encrypting the same data twice with the same
 * password yields different ciphertext each time - never reuse an IV across encryptions, which
 * this guarantees by construction. */
export async function encryptBackup(data: unknown, password: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext);
  return {
    v: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Reverses encryptBackup. Throws WrongPasswordError - and only that error type - for either a
 * wrong password or a corrupted/tampered ciphertext; AES-GCM's authentication check makes the two
 * indistinguishable by design, so callers must never assume a caught error here means the file is
 * definitely corrupt rather than just mistyped. */
export async function decryptBackup(backup: EncryptedBackup, password: string): Promise<unknown> {
  const salt = fromBase64(backup.salt);
  const iv = fromBase64(backup.iv);
  const key = await deriveKey(password, salt);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(backup.ciphertext) as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new WrongPasswordError();
  }
}
