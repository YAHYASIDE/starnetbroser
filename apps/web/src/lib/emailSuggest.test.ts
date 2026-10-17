import { describe, expect, it } from "vitest";
import { emailBaseFor, latinWord, suggestEmail, suggestPassword } from "./emailSuggest";

const fixed = (value: number) => () => value;

describe("✉️ the new email from the account's name (his Oct 17 2026 choice: ahmed.salem + 3 digits)", () => {
  it("first + last name in Latin, «ولد» / «بنت» dropped", () => {
    expect(emailBaseFor("أحمد ولد سالم")).toBe("ahmed.salem");
    expect(emailBaseFor("فاطمة بنت محمد")).toBe("fatma.mohamed");
    expect(emailBaseFor("الوالد عمار البوجبيهي")).toBe("elwaled.elboujbihi");
    expect(emailBaseFor("محمد")).toBe("mohamed");
    expect(emailBaseFor("Demo Name")).toBe("demo.name");
    expect(emailBaseFor("  ")).toBe("");
  });

  it("unknown names letter by letter", () => {
    expect(latinWord("زبيرا")).toBe("zbira");
    expect(latinWord("الشيخ")).toBe("cheikh");
    expect(latinWord("ودادي")).toBe("wdadi");
  });

  it("3 digits and @outlook.com", () => {
    expect(suggestEmail("أحمد ولد سالم", fixed(0))).toBe("ahmed.salem100@outlook.com");
    expect(suggestEmail("أحمد ولد سالم", fixed(0.999))).toBe("ahmed.salem999@outlook.com");
    expect(suggestEmail("", fixed(0.5))).toBe("");
  });

  it("the account code in his pattern: StarNetOm# + 4 digits no other device has", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) expect(suggestPassword(random)).toMatch(/^StarNetOm#\d{4}$/);
    expect(suggestPassword(fixed(0.5))).toBe("StarNetOm#5500");
    // taken by another device → other digits
    let n = 0;
    const steps = () => [0.5, 0.1][n++] ?? 0.9;
    expect(suggestPassword(steps, ["StarNetOm#5500"])).toBe("StarNetOm#1900");
  });
});
