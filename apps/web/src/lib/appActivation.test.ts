import { describe, expect, it } from "vitest";
import { ACTIVATION, checkActivationCode, deriveProof, isValidProof, registerActivationFailure, type ActivationConfig } from "./appActivation";

// A fake code and its own config - the real code is never in the repo.
const FAKE: ActivationConfig = { salt: "00112233445566778899aabbccddeeff", iterations: 1000, check: "" };

async function fakeConfig(): Promise<ActivationConfig> {
  const proof = await deriveProof("Demo-Code-123", { ...FAKE });
  const bytes = new Uint8Array((proof.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const check = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { ...FAKE, check };
}

describe("🔐 تفعيل التطبيق - a copied app doesn't open without his code (his Oct 16 2026 ask)", () => {
  it("the right code gives the proof the phone keeps; a wrong one, an empty one or another case gives nothing", async () => {
    const config = await fakeConfig();
    const proof = await checkActivationCode("Demo-Code-123", config);
    expect(proof).toMatch(/^[0-9a-f]{64}$/);
    expect(await checkActivationCode("  Demo-Code-123  ", config)).toBe(proof);
    expect(await checkActivationCode("demo-code-123", config)).toBeNull();
    expect(await checkActivationCode("Demo-Code-12", config)).toBeNull();
    expect(await checkActivationCode("", config)).toBeNull();
  });

  it("a kept proof can't be faked - only the real proof passes", async () => {
    const config = await fakeConfig();
    const proof = (await checkActivationCode("Demo-Code-123", config))!;
    expect(await isValidProof(proof, config)).toBe(true);
    expect(await isValidProof("true", config)).toBe(false);
    expect(await isValidProof("0".repeat(64), config)).toBe(false);
    expect(await isValidProof(null, config)).toBe(false);
  });

  it("the app carries only a salt and a check, never the code", () => {
    expect(Object.keys(ACTIVATION).sort()).toEqual(["check", "iterations", "salt"]);
    expect(ACTIVATION.check).toMatch(/^[0-9a-f]{64}$/);
    expect(ACTIVATION.iterations).toBeGreaterThanOrEqual(100000);
  });

  it("5 wrong guesses start a growing wait", () => {
    let state = { count: 0, lockedUntil: 0 };
    for (let i = 0; i < 4; i++) state = registerActivationFailure(state, 1000);
    expect(state.lockedUntil).toBe(0);
    state = registerActivationFailure(state, 1000);
    expect(state.lockedUntil).toBe(1000 + 30_000);
    state = registerActivationFailure(state, 1000);
    expect(state.lockedUntil).toBe(1000 + 60_000);
  });
});
