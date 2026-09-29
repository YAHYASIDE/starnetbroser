import { describe, expect, it } from "vitest";
import { WrongPasswordError } from "./backupCrypto";
import {
  addRepModeDevice,
  buildRepDeviceFile,
  cleanRepDeviceDetails,
  deviceDisplayName,
  formatRepDeviceCode,
  generateRepDeviceCode,
  NotADeviceFileError,
  readRepDeviceFile,
  repDeviceFileName,
} from "./repDeviceTransfer";

describe("pairing code", () => {
  it("is 12 characters from a typo-safe alphabet, grouped by four", () => {
    const code = generateRepDeviceCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(generateRepDeviceCode()).not.toBe(code);
    expect(generateRepDeviceCode(() => new Uint8Array(12))).toBe("AAAA-AAAA-AAAA");
  });

  it("accepts what the rep types (spaces, dashes, lower case) and refuses typos", () => {
    expect(formatRepDeviceCode(" k7qm 2xpa-9rtd ")).toBe("K7QM-2XPA-9RTD");
    expect(formatRepDeviceCode("K7QM2XPA9RTD")).toBe("K7QM-2XPA-9RTD");
    expect(formatRepDeviceCode("K7QM-2XPA-9RT")).toBeNull();
    expect(formatRepDeviceCode("K7QM-2XPA-9RT0")).toBeNull(); // 0 isn't in the alphabet
    expect(formatRepDeviceCode("")).toBeNull();
  });
});

describe("device file", () => {
  const payload = {
    device: { clientName: "محمد", phone: "22212345", email: "x@gmail.com", kit: "KIT304" },
    cookies: { "https://starlink.com": "a=1; b=2" },
    createdAt: "2026-09-28T10:00:00.000Z",
  };

  it("round-trips with the rep's code and never carries the cookies in the clear", async () => {
    const text = await buildRepDeviceFile(payload, "K7QM-2XPA-9RTD");
    expect(text).not.toContain("a=1");
    expect(text).not.toContain("x@gmail.com");
    await expect(readRepDeviceFile(text, "K7QM-2XPA-9RTD")).resolves.toEqual(payload);
  });

  it("another rep's code / a random file are refused", async () => {
    const text = await buildRepDeviceFile(payload, "K7QM-2XPA-9RTD");
    await expect(readRepDeviceFile(text, "AAAA-AAAA-AAAA")).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(readRepDeviceFile("{\"hello\":1}", "K7QM-2XPA-9RTD")).rejects.toBeInstanceOf(NotADeviceFileError);
    await expect(readRepDeviceFile("not json", "K7QM-2XPA-9RTD")).rejects.toBeInstanceOf(NotADeviceFileError);
  });

  it("is named so the bot recognises it", () => {
    expect(repDeviceFileName("3f2a-99b1-x")).toBe("starnet-device-3f2a99b1x.json");
    expect(repDeviceFileName("---")).toBe("starnet-device-x.json");
  });
});

describe("rep's devices", () => {
  it("needs a customer name; tidies the rest", () => {
    expect(cleanRepDeviceDetails({ clientName: "  " })).toBeNull();
    expect(cleanRepDeviceDetails({ clientName: " محمد ", phone: "+222 1234-5678", email: " X@Gmail.com ", kit: "kit304", deviceName: "" })).toEqual({
      clientName: "محمد",
      phone: "+22212345678",
      email: "x@gmail.com",
      kit: "KIT304",
    });
  });

  it("keeps the email and Wi-Fi codes exactly as typed (case matters), trimmed", () => {
    // Fake codes only.
    expect(cleanRepDeviceDetails({ clientName: "محمد", emailPassword: " Ab12Cd ", wifiPassword: " WiFi-99 " })).toEqual({
      clientName: "محمد",
      emailPassword: "Ab12Cd",
      wifiPassword: "WiFi-99",
    });
    expect(cleanRepDeviceDetails({ clientName: "محمد", emailPassword: "  ", wifiPassword: "" })).toEqual({ clientName: "محمد" });
  });

  it("the card name falls back to email, KIT, then customer", () => {
    expect(deviceDisplayName({ clientName: "محمد", email: "x@gmail.com", kit: "K" })).toBe("x@gmail.com");
    expect(deviceDisplayName({ clientName: "محمد", kit: "K" })).toBe("K");
    expect(deviceDisplayName({ clientName: "محمد" })).toBe("محمد");
    expect(deviceDisplayName({ clientName: "محمد", deviceName: "منزل" })).toBe("منزل");
  });

  it("newest first, each with its own id", () => {
    const list = addRepModeDevice(addRepModeDevice([], { clientName: "أ" }), { clientName: "ب" });
    expect(list.map((d) => d.clientName)).toEqual(["ب", "أ"]);
    expect(list[0]!.id).not.toBe(list[1]!.id);
  });
});
