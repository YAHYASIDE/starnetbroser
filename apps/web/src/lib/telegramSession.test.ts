import { describe, expect, it } from "vitest";
import { PART_GAP_MS, SessionCollector, looksLikeSessionContinuation, looksLikeSessionStart, sessionDevice } from "./telegramSession";

// Shaped like a «Cookie-Editor» export - fake names and values only.
const LONG = "A".repeat(5000);
const EXPORT = JSON.stringify(
  [
    { name: "DemoAuth", value: LONG, domain: "starlink.com", hostOnly: true, path: "/", secure: true },
    { name: "Starlink.Com.Demo", value: "demo-value-1", domain: "starlink.com", path: "/" },
    { name: "other", value: "x", domain: "example.com", path: "/" },
  ],
  null,
  4,
);

/** Telegram's cut: ~4096 characters per message. */
function cut(text: string, size = 4096): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

describe("📋 a session sent to a bot", () => {
  it("joins Telegram's parts into one session (only starlink.com cookies)", () => {
    const c = new SessionCollector();
    const parts = cut(EXPORT);
    expect(parts.length).toBeGreaterThan(1);
    const steps = parts.map((p, i) => c.add("owner", p, 1000 + i));
    expect(steps.slice(0, -1).every((s) => s.status === "waiting")).toBe(true);
    const last = steps.at(-1)!;
    expect(last.status).toBe("done");
    if (last.status !== "done") return;
    expect(last.count).toBe(2);
    expect(last.cookiesByUrl["https://starlink.com/"]).toBe(`DemoAuth=${LONG}; Starlink.Com.Demo=demo-value-1`);
  });

  it("a whole session in one message, and a cut where Telegram dropped the line break", () => {
    const c = new SessionCollector();
    const short = JSON.stringify([{ name: "Starlink.Com.Demo", value: "v", domain: "starlink.com", path: "/" }], null, 2);
    expect(c.add("owner", short, 0)).toMatchObject({ status: "done", count: 1 });
    const at = short.indexOf("\n", short.indexOf('"value"'));
    const [a, b] = [short.slice(0, at), short.slice(at + 1)];
    expect(c.add("owner", a, 0).status).toBe("waiting");
    expect(c.add("owner", b, 10).status).toBe("done");
  });

  it("ordinary messages are not sessions", () => {
    const c = new SessionCollector();
    expect(c.add("owner", "متوقف", 0).status).toBe("ignored");
    expect(c.add("owner", "starlink", 0).status).toBe("ignored");
    expect(looksLikeSessionStart("كم رصيد الكاش")).toBe(false);
    expect(looksLikeSessionContinuation("ابحث عن محمد")).toBe(false);
  });

  it("parts of different chats never mix; a part long after is a new message", () => {
    const c = new SessionCollector();
    const [first, second] = cut(EXPORT);
    expect(c.add("rep-1", first!, 0).status).toBe("waiting");
    expect(c.add("rep-2", second!, 1).status).toBe("ignored");
    expect(c.isOpen("rep-1", 2)).toBe(true);
    expect(c.isOpen("rep-1", PART_GAP_MS + 10)).toBe(false);
    expect(c.add("rep-1", second!, PART_GAP_MS + 10).status).not.toBe("done");
  });

  it("no starlink.com cookie → tells him what to do", () => {
    const c = new SessionCollector();
    const other = JSON.stringify([{ name: "x", value: "y", domain: "starlink.example.com.evil", path: "/" }]);
    expect(c.add("owner", other, 0)).toMatchObject({ status: "failed" });
  });

  it("the new device: named until «مزامنة» reads it, with a rep's mark when given", () => {
    const now = new Date(2026, 9, 4, 9, 5);
    const d = sessionDevice("dev-1", now, { addedByRepId: "r1" });
    expect(d).toMatchObject({ id: "dev-1", name: "📋 جهاز جديد 09:05", rechargeDate: "", addedByRepId: "r1" });
  });
});
