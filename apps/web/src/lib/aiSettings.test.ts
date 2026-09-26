// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { describeAiError, estimateCostUsd, getClaudeApiKey, looksLikeClaudeKey, maskClaudeKey, setClaudeApiKey } from "./aiSettings";
import { parseAssistantReply } from "./aiDrafts";

describe("aiSettings", () => {
  it("stores, masks and clears the key", () => {
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";
    setClaudeApiKey(` ${key} `);
    expect(getClaudeApiKey()).toBe(key);
    expect(maskClaudeKey(key)).toBe("sk-ant-…0123");
    setClaudeApiKey(null);
    expect(getClaudeApiKey()).toBeNull();
  });

  it("recognises the key shape", () => {
    expect(looksLikeClaudeKey("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(looksLikeClaudeKey("AIzaSyWrongKind")).toBe(false);
    expect(looksLikeClaudeKey("sk-ant-short")).toBe(false);
  });

  it("estimates an answer's cost from its usage", () => {
    const cost = estimateCostUsd({ input_tokens: 1000, output_tokens: 1000, cache_creation_input_tokens: 40000, cache_read_input_tokens: 0 });
    expect(cost).toBeCloseTo(0.002 + 0.01 + 0.1, 6);
    expect(estimateCostUsd({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 40000 })).toBeCloseTo(0.008, 6);
  });

  it("explains failures in Arabic", () => {
    expect(describeAiError(401)).toContain("غير صحيح");
    expect(describeAiError(400, "Your credit balance is too low")).toContain("رصيد");
    expect(describeAiError(529)).toContain("مشغولة");
    expect(describeAiError(undefined)).toContain("اتصال");
  });
});

describe("parseAssistantReply", () => {
  it("splits WhatsApp drafts out of the text", () => {
    const text = "هذه الرسائل:\n[[whatsapp:+22212345678|محمد]]\nالسلام عليكم يا محمد\n[[/whatsapp]]\n[[whatsapp:|سالم]]مرحبا[[/whatsapp]]\nانتهى";
    expect(parseAssistantReply(text)).toEqual([
      { type: "text", text: "هذه الرسائل:" },
      { type: "whatsapp", phone: "+22212345678", name: "محمد", message: "السلام عليكم يا محمد" },
      { type: "whatsapp", phone: null, name: "سالم", message: "مرحبا" },
      { type: "text", text: "انتهى" },
    ]);
  });

  it("leaves text without drafts (or an unfinished one while streaming) as text", () => {
    expect(parseAssistantReply("ربحك 500")).toEqual([{ type: "text", text: "ربحك 500" }]);
    expect(parseAssistantReply("[[whatsapp:+222|x]] نص")).toEqual([{ type: "text", text: "[[whatsapp:+222|x]] نص" }]);
  });
});
