process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/starnet_test";

import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { CustomersService } from "./customers.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CustomersService (real Postgres)", () => {
  let customers: CustomersService;
  let prisma: PrismaService;
  let ownerA: string;
  let ownerB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CustomersService, PrismaService],
    }).compile();
    customers = moduleRef.get(CustomersService);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.starlinkAccount.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    const a = await prisma.user.create({ data: { email: `a-${randomBytes(4).toString("hex")}@ex.com`, passwordHash: "x" } });
    const b = await prisma.user.create({ data: { email: `b-${randomBytes(4).toString("hex")}@ex.com`, passwordHash: "x" } });
    ownerA = a.id;
    ownerB = b.id;
  });

  it("creates and lists a customer scoped to its owner", async () => {
    await customers.create(ownerA, { name: "Ahmed" });
    const listA = await customers.list(ownerA);
    const listB = await customers.list(ownerB);
    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("Ahmed");
    expect(listB).toHaveLength(0);
  });

  it("prevents one owner from reading, updating or deleting another owner's customer", async () => {
    const c = await customers.create(ownerA, { name: "Sara" });
    await expect(customers.get(ownerB, c.id)).rejects.toThrow(NotFoundException);
    await expect(customers.update(ownerB, c.id, { name: "Hacked" })).rejects.toThrow(NotFoundException);
    await expect(customers.remove(ownerB, c.id)).rejects.toThrow(NotFoundException);
  });

  it("updates only the fields provided", async () => {
    const c = await customers.create(ownerA, { name: "Original", notes: "first note" });
    const updated = await customers.update(ownerA, c.id, { name: "Renamed" });
    expect(updated.name).toBe("Renamed");
    expect(updated.notes).toBe("first note");
  });
});
