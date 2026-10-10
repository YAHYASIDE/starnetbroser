import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup, WrongPasswordError } from "./backupCrypto";

describe("backupCrypto", () => {
  it("round-trips arbitrary JSON-serializable data with the correct password", async () => {
    const data = { accounts: [{ id: "acc-1", name: "مقهى النخيل" }], sessions: { "acc-1": { url: "cookie=1" } } };
    const backup = await encryptBackup(data, "correct horse battery staple");
    await expect(decryptBackup(backup, "correct horse battery staple")).resolves.toEqual(data);
  });

  it("rejects the wrong password with WrongPasswordError", async () => {
    const backup = await encryptBackup({ hello: "world" }, "right-password");
    await expect(decryptBackup(backup, "wrong-password")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("rejects a tampered ciphertext with the same WrongPasswordError, never silently decrypting it", async () => {
    const backup = await encryptBackup({ hello: "world" }, "a-password");
    const tampered = { ...backup, ciphertext: backup.ciphertext.slice(0, -4) + "abcd" };
    await expect(decryptBackup(tampered, "a-password")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("produces different ciphertext for the same data and password on repeated calls (fresh salt/IV each time)", async () => {
    const first = await encryptBackup({ x: 1 }, "same-password");
    const second = await encryptBackup({ x: 1 }, "same-password");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });

  it("carries no plaintext trace of the original data or password in the envelope itself", async () => {
    const backup = await encryptBackup({ secret: "chekzeynitaher827" }, "hunter2-password");
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toContain("chekzeynitaher827");
    expect(serialized).not.toContain("hunter2-password");
  });
});
