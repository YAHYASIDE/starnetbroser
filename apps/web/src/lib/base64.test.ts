import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./base64";

describe("⚡ base64 in chunks (his Nov 18 2026 freeze)", () => {
  it("same result as one character at a time, also across chunk edges, and fast on megabytes", () => {
    const bytes = new Uint8Array(100_003).map((_, i) => (i * 31 + 7) % 256);
    let slow = "";
    for (const b of bytes) slow += String.fromCharCode(b);
    expect(bytesToBase64(bytes)).toBe(btoa(slow));
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    expect(bytesToBase64(new Uint8Array())).toBe("");
    const big = new Uint8Array(8 * 1024 * 1024);
    const t = Date.now();
    bytesToBase64(big);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
