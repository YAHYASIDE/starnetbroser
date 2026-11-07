import { describe, expect, it } from "vitest";
import { alertWatchConfig, staleAlertIds, teamAlertDocId, teamAlertPayload, teamAlertsPath, TEAM_ALERT_KEEP_MS } from "./alertWatch";

describe("🔴🟡 alerts while the app is closed", () => {
  const firebase = { apiKey: "fake-api-key", projectId: "demo-project" };
  const link = { spaceId: "team-space", key: "a".repeat(64), memberId: "m2", enabled: true };

  it("watches the reps' channels with their names and the team's alerts", () => {
    const json = alertWatchConfig({ firebase, channels: { r1: { spaceId: "s1", key: "b".repeat(64) } }, repName: (id) => (id === "r1" ? "الحسين" : ""), link });
    expect(JSON.parse(json)).toEqual({
      apiKey: "fake-api-key",
      projectId: "demo-project",
      me: "m2",
      channels: [{ spaceId: "s1", key: "b".repeat(64), repName: "الحسين" }],
      team: { spaceId: "team-space", key: "a".repeat(64) },
      chats: [],
    });
    const rep = JSON.parse(alertWatchConfig({ firebase, channels: {}, repName: () => "", link: null, chats: [{ conv: "rep:r1", spaceId: "s1", key: "b".repeat(64), mine: "rep" }] }));
    expect(rep.chats).toEqual([{ conv: "rep:r1", spaceId: "s1", key: "b".repeat(64), mine: "rep" }]);
    expect(rep.team).toBeNull();
  });

  it("nothing to watch without Firebase, or with no channel and no team", () => {
    expect(alertWatchConfig({ firebase: null, channels: {}, repName: () => "", link })).toBe("");
    expect(alertWatchConfig({ firebase, channels: {}, repName: () => "", link: null })).toBe("");
    expect(alertWatchConfig({ firebase, channels: {}, repName: () => "", link: { ...link, enabled: false } })).toBe("");
  });

  it("a team alert's copy: who, level, short note, no picture; a safe document id", () => {
    const flag = { id: "browser-s:1", deviceName: "DEMO 1", note: "x".repeat(500), level: "urgent" as const, by: "المسؤول 2", at: 1700000000000, image: "data:image/jpeg;base64,AAAA" };
    const payload = JSON.parse(teamAlertPayload(flag, "m2"));
    expect(payload).toMatchObject({ deviceName: "DEMO 1", level: "urgent", by: "المسؤول 2", member: "m2", at: 1700000000000 });
    expect(payload.note).toHaveLength(300);
    expect(payload.image).toBeUndefined();
    expect(teamAlertDocId(flag)).toBe("1700000000000-browser-s1");
    expect(teamAlertsPath("team-space")).toBe("starnet/team-space/alerts");
  });

  it("copies older than 3 days are removed", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    const old = new Date(now - TEAM_ALERT_KEEP_MS - 1000).toISOString();
    expect(staleAlertIds([{ id: "a", createTime: old }, { id: "b", createTime: new Date(now).toISOString() }, { id: "c" }], now)).toEqual(["a"]);
  });
});
