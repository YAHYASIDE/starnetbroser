import { describe, expect, it } from "vitest";
import { businessDataSize } from "./chatOpsSend";

const fake = (data: Record<string, string>) => {
  const keys = Object.keys(data);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => data[k] ?? null };
};

describe("⚡ op cards look again only when the business data changed", () => {
  it("counts the business stores and their sizes, never the chat or the settings", () => {
    const a = businessDataSize(fake({ starnet_customer_ledger_v1: "[1]", starnet_chat_v1: "{...}", "starnet.claudeKey": "x" }));
    expect(a).toBe("1:3");
    expect(businessDataSize(fake({ starnet_customer_ledger_v1: "[1]", starnet_chat_v1: "{......more}" }))).toBe(a);
    expect(businessDataSize(fake({ starnet_customer_ledger_v1: "[1,2]" }))).not.toBe(a);
  });
});
