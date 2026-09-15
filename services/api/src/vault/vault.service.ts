import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypts/decrypts secrets (Starlink account passwords, wifi codes, notes)
 * at rest with AES-256-GCM. Output layout: base64(iv[12] | authTag[16] | ciphertext).
 * Never logs plaintext or key material.
 */
@Injectable()
export class VaultService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>("VAULT_KEY");
    if (!raw) {
      throw new Error("VAULT_KEY is not set");
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("VAULT_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key)");
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  decrypt(payload: string): string {
    if (!payload) {
      return "";
    }
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = buf.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
