import { describe, expect, it } from "vitest";
import { isSignedInSession, sessionReport } from "./sessionTicket";

// Fake cookie values only.
describe("🔍 «تقرير الجلسة» (his Nov 15 2026 report)", () => {
  it("names and sizes only, never a value; says whether the sign-in ticket is there", () => {
    const signedIn = { "https://starlink.com": "Starlink.Com.Access.V1=fakeTicketValue; _ga=GA1.2" , "https://api.starlink.com": "" };
    const r = sessionReport(signedIn);
    expect(r.signedIn).toBe(true);
    expect(r.lines[0]).toBe("starlink.com: 🔑Starlink.Com.Access.V1(15) _ga(5)");
    expect(r.lines.join(" ")).not.toContain("fakeTicketValue");
    expect(r.lines[1]).toBe("api.starlink.com: -");
    const out = sessionReport({ "https://www.starlink.com": "_ga=1; _gid=2" });
    expect(out.signedIn).toBe(false);
    expect(sessionReport(undefined).lines[0]).toContain("لا كوكيز");
    expect(isSignedInSession({ "https://starlink.com": `x=${"a".repeat(1000)}` })).toBe(true);
  });
});
