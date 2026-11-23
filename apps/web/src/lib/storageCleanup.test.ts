import { describe, expect, it } from "vitest";
import { applyCleanup, cleanupPlan, PROTECTED, RULES } from "./storageCleanup";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const DAY = 86400_000;

function mem(init: Record<string, string>) {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe("🧹 «تفريغ المساحة» (his Nov 23 2026 «الذاكرة ممتلئة»)", () => {
  it("never touches money, devices, customers, reps or the link's agreed state", () => {
    for (const r of RULES) expect((PROTECTED as readonly string[]).includes(r.key)).toBe(false);
    const s = mem({ starnet_customer_ledger_v1: "x".repeat(10_000), "starnet.deviceLinkBase": "y".repeat(10_000) });
    expect(cleanupPlan(s, NOW)).toEqual([]);
  });

  it("trims logs and old copies, keeps what is recent or still waiting", () => {
    const s = mem({
      "starnet.deviceLinkConflicts": JSON.stringify([{ lost: "z".repeat(5000) }]),
      "starnet.deviceLinkLog": JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ i }))),
      "starnet_agent_events_v1": JSON.stringify([{ at: NOW - 90 * DAY }, { at: NOW - DAY }]),
      "starnet_agent_questions_v1": JSON.stringify([
        { status: "open", at: NOW - 90 * DAY },
        { status: "answered", at: NOW - 90 * DAY },
        { status: "answered", at: NOW - 90 * DAY, send: "waiting" },
        { status: "dismissed", at: NOW - DAY },
      ]),
      "starnet_agent_menus_v1": JSON.stringify({ versions: [1, 2, 3, 4].map(() => ({ doc: { nodes: [{ id: "a", image: "data:" + "i".repeat(3000) }], products: [] } })) }),
      "starnet.whatsappAgentChats": JSON.stringify({ old: [{ at: NOW - 10 * DAY }], fresh: [{ at: NOW - DAY }] }),
      "starnet.searchHistory": JSON.stringify(["a", "b"]),
    });
    const plan = cleanupPlan(s, NOW);
    expect(plan.map((p) => p.key).sort()).toEqual(
      ["starnet.deviceLinkConflicts", "starnet.deviceLinkLog", "starnet.searchHistory", "starnet.whatsappAgentChats", "starnet_agent_events_v1", "starnet_agent_menus_v1", "starnet_agent_questions_v1"].sort(),
    );
    const freed = applyCleanup(s, plan);
    expect(freed).toBeGreaterThan(15_000);
    expect(s.data.has("starnet.deviceLinkConflicts")).toBe(false);
    expect(JSON.parse(s.data.get("starnet.deviceLinkLog")!)).toHaveLength(60);
    expect(JSON.parse(s.data.get("starnet_agent_events_v1")!)).toEqual([{ at: NOW - DAY }]);
    expect(JSON.parse(s.data.get("starnet_agent_questions_v1")!).map((q: { status: string }) => q.status)).toEqual(["open", "answered", "dismissed"]);
    const menus = JSON.parse(s.data.get("starnet_agent_menus_v1")!);
    expect(menus.versions).toHaveLength(3);
    expect(menus.versions[0].doc.nodes[0]).toEqual({ id: "a" });
    expect(Object.keys(JSON.parse(s.data.get("starnet.whatsappAgentChats")!))).toEqual(["fresh"]);
    // a second run has nothing left to do
    expect(cleanupPlan(s, NOW)).toEqual([]);
  });

  it("a write the phone refuses leaves that key as it was", () => {
    const s = mem({ "starnet.deviceLinkLog": JSON.stringify(Array.from({ length: 100 }, (_, i) => i)) });
    const plan = cleanupPlan(s, NOW);
    const broken = { ...s, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(applyCleanup(broken, plan)).toBe(0);
    expect(JSON.parse(s.data.get("starnet.deviceLinkLog")!)).toHaveLength(100);
  });
});
