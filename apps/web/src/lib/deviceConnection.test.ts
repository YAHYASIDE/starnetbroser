import { describe, expect, it } from "vitest";
import { DeviceStatus } from "@starnet/shared";
import { connectionDot, connectionLine, connectionMessage } from "./deviceConnection";

describe("deviceConnection", () => {
  it("maps each dot color to a word", () => {
    expect(connectionDot(DeviceStatus.GREEN)).toEqual({ tone: "green", emoji: "🟢", word: "متصل" });
    expect(connectionDot(DeviceStatus.RED).word).toBe("غير متصل");
    expect(connectionDot(DeviceStatus.UNKNOWN).tone).toBe("gray");
  });

  it("builds the bot line and the customer message", () => {
    const account = { name: "منزل", dishStatus: DeviceStatus.RED, wifiStatus: DeviceStatus.GREEN };
    expect(connectionLine(account)).toBe("🛰️ الطبق: 🔴 غير متصل · 📶 الواي فاي: 🟢 متصل");
    const message = connectionMessage("محمد", account);
    expect(message).toContain("مرحبًا محمد، حالة جهازك (منزل)");
    expect(message).toContain("🔴 الطبق (Starlink): غير متصل (غير موصول بالكهرباء أو مطفأ)");
    expect(message).toContain("🟢 الواي فاي: متصل");
    expect(message).toContain("تأكد أن الجهاز موصول بالكهرباء");
  });
});
