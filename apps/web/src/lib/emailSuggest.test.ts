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

  it("a strong 10-character code Microsoft accepts", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) {
      const code = suggestPassword(random);
      expect(code).toHaveLength(10);
      expect(code).toMatch(/^[A-Z][a-z]{5}\d{3}[#@!$]$/);
      expect(code).not.toMatch(/[O0l1I]/);
    }
  });
});
