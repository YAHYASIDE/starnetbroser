import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { mergeSyncedFields } from "./starlinkSync";
import {
  buildCreatedAccount,
  creationProblem,
  normalizeNewEmail,
  outlookSignupFor,
  splitFullName,
  starlinkActivationFor,
} from "./accountCreation";

// Fake data only.
const base = { id: "d1", name: "", kitNumber: "", serialNumber: "" } as StarlinkAccountSummary;
const input = { fullName: "أحمد ولد سالم", phone: "22212345678", kit: " kit00000demo1 ", email: "demo.ahmed", password: "demo-pass-1" };

describe("إنشاء حساب جديد", () => {
  it("splits the customer's name into first and family name", () => {
    expect(splitFullName("أحمد ولد سالم")).toEqual({ firstName: "أحمد", lastName: "ولد سالم" });
    expect(splitFullName("  أحمد ")).toEqual({ firstName: "أحمد", lastName: "أحمد" });
  });

  it("a bare name becomes an Outlook address", () => {
    expect(normalizeNewEmail(" Demo.Ahmed ")).toBe("demo.ahmed@outlook.com");
    expect(normalizeNewEmail("demo@hotmail.com")).toBe("demo@hotmail.com");
  });

  it("asks for the KIT, the email and an 8-character password", () => {
    expect(creationProblem(input)).toBeNull();
    expect(creationProblem({ ...input, fullName: "" })).toBe("اختر الزبون أولاً");
    expect(creationProblem({ ...input, kit: "12" })).toContain("KIT");
    expect(creationProblem({ ...input, email: "" })).toContain("البريد");
    expect(creationProblem({ ...input, password: "short" })).toContain("8");
  });

  it("saves the device right away, marked as being created", () => {
    const device = buildCreatedAccount(base, input, new Date("2026-10-01T10:00:00.000Z"));
    expect(device).toMatchObject({
      name: "أحمد ولد سالم",
      phone: "22212345678",
      expectedEmail: "demo.ahmed@outlook.com",
      expectedEmailPassword: "demo-pass-1",
      kitNumber: "KIT00000DEMO1",
      serialNumber: "",
      creation: { firstName: "أحمد", lastName: "ولد سالم", startedAt: "2026-10-01T10:00:00.000Z" },
    });
    expect(buildCreatedAccount(base, { ...input, kit: "2demo0000sn" }).serialNumber).toBe("2DEMO0000SN");
  });

  it("fills Microsoft's signup and Starlink's activation from the device", () => {
    const device = buildCreatedAccount(base, input);
    expect(outlookSignupFor(device)).toEqual({
      email: "demo.ahmed@outlook.com",
      password: "demo-pass-1",
      firstName: "أحمد",
      lastName: "ولد سالم",
      recoveryEmail: "starnet.om@gmail.com",
    });
    expect(starlinkActivationFor(device)).toEqual({
      kit: "KIT00000DEMO1",
      firstName: "أحمد",
      lastName: "ولد سالم",
      email: "demo.ahmed@outlook.com",
      phone: "12345678",
    });
  });

  it("a device not being created fills nothing", () => {
    expect(outlookSignupFor({ ...base, expectedEmail: "x@outlook.com" })).toBeNull();
    expect(starlinkActivationFor(base)).toBeNull();
  });

  it("the first sync that reads the new account's number ends «قيد الإنشاء»", () => {
    const device = buildCreatedAccount(base, input);
    expect(mergeSyncedFields(device, { accountNumber: "ACC-0000-0000-DEMO" }).account.creation).toBeNull();
    expect(mergeSyncedFields(device, { planName: "Residential" }).account.creation).not.toBeNull();
  });
});
