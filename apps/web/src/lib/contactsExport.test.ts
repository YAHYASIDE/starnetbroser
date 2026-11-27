import { describe, expect, it } from "vitest";
import type { Client } from "./clientStore";
import { buildCards, internationalPhone, toVcf, vcfDataUrl } from "./contactsExport";

const c = (id: string, name: string, phone?: string, extra: Partial<Client> = {}): Client => ({ id, name, phone, createdAt: "2026-01-01T00:00:00Z", ...extra }) as Client;

describe("📇 the customers as phone contacts (his Nov 27 2026)", () => {
  it("an international number from what is stored", () => {
    expect(internationalPhone("22222205105")).toBe("+22222205105");
    expect(internationalPhone("+222 22 20 51 05")).toBe("+22222205105");
    expect(internationalPhone("0022237451517")).toBe("+22237451517");
    // a bare local number falls back to Mauritania
    expect(internationalPhone("22205105")).toBe("+22222205105");
    expect(internationalPhone("123")).toBeNull();
    expect(internationalPhone(undefined)).toBeNull();
  });

  it("who gets a card, and why the others don't", () => {
    const clients = [
      c("1", "أحمد", "22222205105"),
      c("2", "بلا رقم"),
      c("3", "22249607010", "22249607010", { noName: true }),
      c("4", "نسخة مكررة", "+222 22 20 51 05"),
      c("5", "سالم", "22337451517"),
    ];
    const all = buildCards(clients, []);
    expect(all.cards.map((x) => x.name)).toEqual(["أحمد", "سالم"]);
    expect(all).toMatchObject({ skippedNoPhone: 1, skippedNoName: 1, duplicates: 1 });
    const withDevices = buildCards(clients, [{ clientId: "5" }], { onlyWithDevices: true });
    expect(withDevices.cards.map((x) => x.name)).toEqual(["سالم"]);
    expect(withDevices.skippedNoDevice).toBe(2); // أحمد and his duplicate
    // a mark before the name
    expect(buildCards([c("1", "أحمد", "22222205105")], [], { prefix: "ستارلينك -" }).cards[0]!.name).toBe("ستارلينك - أحمد");
  });

  it("the .vcf is a valid vCard 3.0 with escaped text", () => {
    const vcf = toVcf([
      { name: "أحمد, سالم; ولد\\x", phone: "+22222205105" },
      { name: "علي", phone: "+22337451517" },
    ]);
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(vcf.match(/END:VCARD/g)).toHaveLength(2);
    expect(vcf).toContain("FN:أحمد\\, سالم\; ولد\\\\x");
    expect(vcf).toContain("TEL;TYPE=CELL:+22222205105");
    expect(toVcf([])).toBe("");
  });

  it("the data URL carries UTF-8 and decodes back", () => {
    const vcf = toVcf([{ name: "أحمد", phone: "+22222205105" }]);
    const url = vcfDataUrl(vcf);
    expect(url.startsWith("data:text/x-vcard;base64,")).toBe(true);
    const bin = atob(url.split(",")[1]!);
    const back = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    expect(back).toBe(vcf);
  });
});
