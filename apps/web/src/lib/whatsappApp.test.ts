import { describe, expect, it } from "vitest";
import { decideApp, isWhatsAppLink, parseChoice } from "./whatsappApp";

describe("💬 which WhatsApp (his Nov 27 2026)", () => {
  it("only WhatsApp chat links are taken over", () => {
    expect(isWhatsAppLink("https://wa.me/22227268?text=hi")).toBe(true);
    expect(isWhatsAppLink("https://wa.me/?text=hi")).toBe(true);
    expect(isWhatsAppLink("https://api.whatsapp.com/send?phone=1")).toBe(true);
    expect(isWhatsAppLink("https://wa.me.evil.com/1")).toBe(false);
    expect(isWhatsAppLink("http://wa.me/1")).toBe(false);
    expect(isWhatsAppLink("https://example.com/?u=https://wa.me/1")).toBe(false);
    expect(isWhatsAppLink(undefined)).toBe(false);
  });

  it("the saved choice is read safely", () => {
    expect(parseChoice("business")).toBe("business");
    expect(parseChoice("personal")).toBe("personal");
    expect(parseChoice("x")).toBe("ask");
    expect(parseChoice(null)).toBe("ask");
  });

  it("one app = opens it; two = his saved choice, else asks; none = the system", () => {
    expect(decideApp([], "ask")).toEqual({ do: "system" });
    expect(decideApp(["business"], "ask")).toEqual({ do: "open", app: "business" });
    expect(decideApp(["personal"], "business")).toEqual({ do: "open", app: "personal" });
    expect(decideApp(["personal", "business"], "ask")).toEqual({ do: "ask" });
    expect(decideApp(["personal", "business"], "business")).toEqual({ do: "open", app: "business" });
    expect(decideApp(["personal", "business"], "personal")).toEqual({ do: "open", app: "personal" });
  });
});
