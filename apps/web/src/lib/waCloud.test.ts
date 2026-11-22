import { describe, expect, it } from "vitest";
import { cloudProblems, newCloudConfig, waCloudEvents, type CloudEvent } from "./waCloudPure";

// Fake numbers and ids only.
describe("☁️ the official number's settings and events (Nov 22 2026)", () => {
  it("says what is missing; a new setup has its own key and verify token", () => {
    const c = newCloudConfig();
    expect(c.packKey).toMatch(/^[0-9a-f]{64}$/);
    expect(c.verifyToken).toHaveLength(24);
    expect(cloudProblems(c)).toEqual(["رابط الخادم (يبدأ بـ https://)", "مفتاح Meta (Access token)", "Phone number ID", "App secret"]);
    expect(cloudProblems({ ...c, url: "https://x.workers.dev", token: "EAA", phoneNumberId: "123456789", appSecret: "s" })).toEqual([]);
  });

  it("the Worker's events become the statistics' (staff messages not counted)", () => {
    const e = (type: CloudEvent["type"], extra: Partial<CloudEvent> = {}): CloudEvent => ({ k: `ev:${type}`, id: type, at: 1, key: "70000001", wa: "22270000001", name: "زبون", type, text: "كم السعر؟", ...extra });
    const out = waCloudEvents([e("menu", { node: "pay", ms: 900 }), e("ai_answer", { model: "claude-haiku-5-5", input: 10, output: 2 }), e("staff_msg"), e("staff_reply"), e("ai_silent")]);
    expect(out).toEqual([
      { id: "cloud_menu", at: 1, key: "70000001", type: "menu", node: "pay", ms: 900 },
      { id: "cloud_ai_answer", at: 1, key: "70000001", type: "ai_answer", text: "كم السعر؟", model: "claude-haiku-5-5", input: 10, output: 2 },
    ]);
  });
});
