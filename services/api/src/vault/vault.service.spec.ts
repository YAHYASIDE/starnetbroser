import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { randomBytes } from "crypto";
import { VaultService } from "./vault.service";

describe("VaultService", () => {
  let service: VaultService;
  // @nestjs/config always merges process.env into ConfigService lookups -
  // ignoreEnvFile/ignoreEnvVars only skip the .env file and schema
  // validation, not process.env itself - so an ambient VAULT_KEY (CI sets
  // one at the job level for the other specs) would otherwise silently
  // win over the deliberately-bad value the "rejects" test below needs.
  const ambientVaultKey = process.env.VAULT_KEY;

  beforeAll(() => {
    delete process.env.VAULT_KEY;
  });

  afterAll(() => {
    if (ambientVaultKey !== undefined) process.env.VAULT_KEY = ambientVaultKey;
  });

  beforeEach(async () => {
    const testKey = randomBytes(32).toString("base64");
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ VAULT_KEY: testKey })] })],
      providers: [VaultService],
    }).compile();

    service = moduleRef.get(VaultService);
    service.onModuleInit();
  });

  it("round-trips plaintext through encrypt/decrypt", () => {
    const plaintext = "correct-horse-battery-staple-أرقام";
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const a = service.encrypt("same-secret");
    const b = service.encrypt("same-secret");
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe("same-secret");
    expect(service.decrypt(b)).toBe("same-secret");
  });

  it("returns empty string for empty payload without touching crypto", () => {
    expect(service.decrypt("")).toBe("");
  });

  it("throws if the ciphertext was tampered with (GCM auth tag mismatch)", () => {
    const encrypted = service.encrypt("tamper-me");
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it("rejects a VAULT_KEY that is not 32 bytes", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ VAULT_KEY: Buffer.from("too-short").toString("base64") })],
        }),
      ],
      providers: [VaultService],
    }).compile();
    const badService = moduleRef.get(VaultService);
    expect(() => badService.onModuleInit()).toThrow();
  });
});
