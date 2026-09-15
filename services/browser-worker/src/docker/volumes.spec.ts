import { volumeNameFor } from "./volumes";

describe("volumeNameFor", () => {
  it("builds a prefixed volume name for a normal id", () => {
    expect(volumeNameFor("abc-123")).toBe("starnet_profile_abc-123");
  });

  it("rejects path traversal / shell-metacharacter attempts", () => {
    expect(() => volumeNameFor("../../etc/passwd")).toThrow();
    expect(() => volumeNameFor("id; rm -rf /")).toThrow();
    expect(() => volumeNameFor("id$(whoami)")).toThrow();
    expect(() => volumeNameFor("")).toThrow();
  });
});
