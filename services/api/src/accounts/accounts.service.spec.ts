process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/starnet_test";

import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { AccountsService } from "./accounts.service";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "../vault/vault.service";
import { AuditService } from "../audit/audit.service";

describe("AccountsService (real Postgres)", () => {
  let accounts: AccountsService;
  let prisma: PrismaService;
  let vault: VaultService;
  let ownerA: string;
  let ownerB: string;
  let customerA: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ VAULT_KEY: randomBytes(32).toString("base64") })],
        }),
      ],
      providers: [AccountsService, PrismaService, VaultService, AuditService],
    }).compile();
    accounts = moduleRef.get(AccountsService);
    prisma = moduleRef.get(PrismaService);
    vault = moduleRef.get(VaultService);
    vault.onModuleInit();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.starlinkAccount.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    const a = await prisma.user.create({ data: { email: `a-${randomBytes(4).toString("hex")}@ex.com`, passwordHash: "x" } });
    const b = await prisma.user.create({ data: { email: `b-${randomBytes(4).toString("hex")}@ex.com`, passwordHash: "x" } });
    ownerA = a.id;
    ownerB = b.id;
    const c = await prisma.customer.create({ data: { ownerUserId: ownerA, name: "Customer A" } });
    customerA = c.id;
  });

  it("creates an account with secrets encrypted at rest, never storing plaintext", async () => {
    const detail = await accounts.create(ownerA, {
      customerId: customerA,
      name: "Window 1",
      password: "super-secret-password",
      wifiCode: "wifi-1234",
      kitNumber: "KIT-1",
      serialNumber: "SER-1",
    });
    expect(detail.emailSecret).toBe("••••••••");

    const row = await prisma.starlinkAccount.findUniqueOrThrow({ where: { id: detail.id } });
    expect(row.emailSecretEnc).not.toContain("super-secret-password");
    expect(row.wifiCodeEnc).not.toContain("wifi-1234");
  });

  it("redacts secrets on getDetail but reveals them (and audits it) via reveal()", async () => {
    const created = await accounts.create(ownerA, {
      customerId: customerA,
      name: "Window 2",
      password: "reveal-me-please",
    });

    const redacted = await accounts.getDetail(ownerA, created.id);
    expect(redacted.emailSecret).toBe("••••••••");

    const revealed = await accounts.reveal(ownerA, created.id);
    expect(revealed.emailSecret).toBe("reveal-me-please");

    const auditRows = await prisma.auditLog.findMany({ where: { accountId: created.id, action: "account_secrets_revealed" } });
    expect(auditRows).toHaveLength(1);
  });

  it("scopes account access to the owning user via the customer relation", async () => {
    const created = await accounts.create(ownerA, { customerId: customerA, name: "Window 3" });
    await expect(accounts.getDetail(ownerB, created.id)).rejects.toThrow(NotFoundException);
    await expect(accounts.reveal(ownerB, created.id)).rejects.toThrow(NotFoundException);
  });

  it("refuses to create an account under a customer the caller does not own", async () => {
    await expect(
      accounts.create(ownerB, { customerId: customerA, name: "Should fail" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("searches by name, KIT number and serial number", async () => {
    await accounts.create(ownerA, { customerId: customerA, name: "Ahmed House", kitNumber: "KIT-777", serialNumber: "SER-1" });
    await accounts.create(ownerA, { customerId: customerA, name: "Sara Cafe", kitNumber: "KIT-2", serialNumber: "SER-999" });

    expect((await accounts.search(ownerA, "ahmed")).map((a) => a.name)).toEqual(["Ahmed House"]);
    expect((await accounts.search(ownerA, "KIT-777")).map((a) => a.name)).toEqual(["Ahmed House"]);
    expect((await accounts.search(ownerA, "SER-999")).map((a) => a.name)).toEqual(["Sara Cafe"]);
    expect(await accounts.search(ownerA)).toHaveLength(2);
  });

  it("updating a secret field re-encrypts it, and omitting it leaves it untouched", async () => {
    const created = await accounts.create(ownerA, { customerId: customerA, name: "Window 4", password: "first-secret" });
    await accounts.update(ownerA, created.id, { name: "Window 4 Renamed" });
    expect((await accounts.reveal(ownerA, created.id)).emailSecret).toBe("first-secret");

    await accounts.update(ownerA, created.id, { password: "second-secret" });
    expect((await accounts.reveal(ownerA, created.id)).emailSecret).toBe("second-secret");
  });
});
