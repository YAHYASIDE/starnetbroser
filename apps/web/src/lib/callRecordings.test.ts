import { describe, expect, it } from "vitest";
import { addRecording, recordingKey, recordingsOf, type CallRecording } from "./callRecordings";

const rec = (id: string, at: number, conv = "team"): CallRecording => ({ id, conv, peer: "YOUBE", at, seconds: 10 });

describe("⏺ call recordings", () => {
  it("newest first, the same call once, the oldest beyond the limit dropped", () => {
    let r = addRecording([], rec("a", 1));
    r = addRecording(r.list, rec("b", 2));
    r = addRecording(r.list, rec("b", 2));
    expect(r.list.map((x) => x.id)).toEqual(["b", "a"]);
    const full = addRecording(r.list, rec("c", 3), 2);
    expect(full.list.map((x) => x.id)).toEqual(["c", "b"]);
    expect(full.dropped).toEqual(["a"]);
  });
  it("per conversation, and its sound's key", () => {
    expect(recordingsOf([rec("a", 1), rec("b", 2, "rep:r1")], "rep:r1").map((x) => x.id)).toEqual(["b"]);
    expect(recordingKey("abc")).toBe("callrec:abc");
  });
});
