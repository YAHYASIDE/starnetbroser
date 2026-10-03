import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { duplicateQuestion, findClientDuplicates, findDeviceDuplicates, phoneKey } from "./duplicates";

const acc = (o: Partial<StarlinkAccountSummary>) => ({ id: "", name: "", kitNumber: "", ...o }) as StarlinkAccountSummary;
const accounts = [
  acc({ id: "a", name: "منزل الحي الشرقي", expectedEmail: "Mohamed@Gmail.com", kitNumber: "KIT-304511", phone: "22241804013" }),
  acc({ id: "b", name: "مقهى", starlinkAccountEmail: "cafe@x.com", extraEmails: [{ address: "second@x.com" }] }),
  acc({ id: "z", name: "محذوف", expectedEmail: "gone@x.com", deletedAt: "x" }),
];

describe("duplicate warnings", () => {
  it("finds a device with the same email (any of its emails), KIT, phone or name", () => {
    expect(findDeviceDuplicates({ name: "جديد", expectedEmail: " mohamed@gmail.com " }, accounts)).toEqual([{ field: "email", owner: "منزل الحي الشرقي", kind: "device" }]);
    expect(findDeviceDuplicates({ name: "جديد", extraEmails: [{ address: "SECOND@x.com" }] }, accounts).map((h) => h.owner)).toEqual(["مقهى"]);
    expect(findDeviceDuplicates({ name: "جديد", kitNumber: "kit304511" }, accounts).map((h) => h.field)).toEqual(["kit"]);
    expect(findDeviceDuplicates({ name: "جديد", phone: "+222 4180 4013" }, accounts).map((h) => h.field)).toEqual(["phone"]);
    expect(findDeviceDuplicates({ name: "منزل الحى الشرقى" }, accounts).map((h) => h.field)).toEqual(["name"]);
  });

  it("ignores the device itself, deleted devices and empty fields", () => {
    expect(findDeviceDuplicates({ id: "a", name: "منزل الحي الشرقي", expectedEmail: "mohamed@gmail.com", kitNumber: "KIT-304511" }, accounts)).toEqual([]);
    expect(findDeviceDuplicates({ name: "x", expectedEmail: "gone@x.com" }, accounts)).toEqual([]);
    expect(findDeviceDuplicates({ name: "", expectedEmail: "", kitNumber: "", phone: "" }, accounts)).toEqual([]);
  });

  it("finds a customer with the same phone or name", () => {
    const clients = [
      { id: "c1", name: "محمد أحمد", phone: "22241804013" },
      { id: "c2", name: "سالم" },
    ];
    expect(findClientDuplicates({ name: "علي", phone: "41804013" }, clients)).toEqual([{ field: "phone", owner: "محمد أحمد", kind: "client", id: "c1" }]);
    expect(findClientDuplicates({ name: "محمد احمد" }, clients)).toEqual([{ field: "name", owner: "محمد أحمد", kind: "client", id: "c1" }]);
    expect(findClientDuplicates({ id: "c1", name: "محمد أحمد", phone: "22241804013" }, clients)).toEqual([]);
    expect(phoneKey("٢٢٢٤١٨٠٤٠١٣")).toBe("41804013");
    expect(duplicateQuestion([{ field: "email", owner: "منزل", kind: "device" }])).toContain("• الإيميل مسجل من قبل على الجهاز «منزل»");
  });
});
