import { describe, expect, it } from "vitest";
import { callQualityText, cleanIceServers, iceServersFor, parseTurnSetting } from "./callIce";

describe("📞 the call's relay (his Nov 8 2026 «الاتصال غير مستقر»)", () => {
  it("takes metered's API link or a relay list; anything else is refused", () => {
    expect(parseTurnSetting(" https://demo-app.metered.live/api/v1/turn/credentials?apiKey=abc123 ")).toEqual({ kind: "url", url: "https://demo-app.metered.live/api/v1/turn/credentials?apiKey=abc123" });
    const list = '[{"urls":"stun:stun.relay.metered.ca:80"},{"urls":"turn:global.relay.metered.ca:80","username":"u","credential":"p"}]';
    expect(parseTurnSetting(`const iceServers = ${list};`)).toEqual({ kind: "servers", servers: cleanIceServers(JSON.parse(list)) });
    expect(parseTurnSetting('[{"urls":"stun:x:1"}]')).toBeNull(); // no relay in it
    // pasted from metered's «Show ICE Servers Array» exactly: JavaScript, unquoted keys, trailing commas
    const js = `var myPeerConnection = new RTCPeerConnection({
  iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "demo-user",
        credential: "demo/pass",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "demo-user",
        credential: "demo/pass",
      },
  ],
});`;
    const fromJs = parseTurnSetting(js);
    expect(fromJs?.kind).toBe("servers");
    expect(fromJs?.kind === "servers" && fromJs.servers[1]).toEqual({ urls: ["turn:global.relay.metered.ca:80"], username: "demo-user", credential: "demo/pass" });
    expect(fromJs?.kind === "servers" && fromJs.servers).toHaveLength(3);
    expect(parseTurnSetting("https://evil.example.com/x")).toBeNull();
    expect(cleanIceServers([{ urls: ["http://x", "turn:a:3478"] }, { urls: "javascript:x" }])).toEqual([{ urls: ["turn:a:3478"] }]);
  });

  it("the private relay comes first, the public one behind it; quality in words", () => {
    expect(JSON.stringify(iceServersFor(null))).toContain("openrelay");
    const mine = iceServersFor([{ urls: ["turn:global.relay.metered.ca:80"], username: "u", credential: "p" }]);
    expect(JSON.stringify(mine[1])).toContain("global.relay.metered.ca"); // mine first, the public one behind it
    expect(callQualityText({ rttMs: 120, lossPct: 0, relayed: false })).toBe("📶 جيد · مباشر · 120ms");
    expect(callQualityText({ rttMs: 700, lossPct: 1, relayed: true })).toContain("📶 ضعيف · عبر خادم الوصل");
  });
});
