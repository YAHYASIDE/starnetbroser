import { describe, expect, it } from "vitest";
import { factsText, lastPart, parseJsonAnswer, supportUserText, ticketUserText, type SupportReply } from "./claudeAssist";

describe("🤖 Claude's words (his Nov 9 2026 ask)", () => {
  it("only the facts the app has; the page's newest part", () => {
    expect(factsText({ name: "DEMO 1", email: "demo@example.com", kit: " ", status: "Active" })).toBe("- Device name: DEMO 1\n- Account email: demo@example.com\n- Service status: Active");
    const long = `${"old line\n".repeat(3000)}Starlink Support\nAvez-vous besoin d'aide ?`;
    const cut = lastPart(long, 200);
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut.endsWith("Avez-vous besoin d'aide ?")).toBe(true);
    expect(supportUserText("Bonjour", { name: "DEMO 1" })).toContain('"""\nBonjour\n"""');
    expect(ticketUserText(" الطبق لا يتصل ", { name: "DEMO 1" }, "fr")).toContain("Ticket language: French");
  });

  it("the answer must have its shape", () => {
    const ok = parseJsonAnswer<SupportReply>('{"translation_ar":"x","reply":"y","language":"fr","safe_to_send":true,"reason_ar":"z"}', ["reply", "safe_to_send"]);
    expect(ok?.reply).toBe("y");
    expect(parseJsonAnswer('{"reply":"y"}', ["reply", "safe_to_send"])).toBeNull();
    expect(parseJsonAnswer("not json", ["reply"])).toBeNull();
  });
});
