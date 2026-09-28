import { describe, expect, it } from "vitest";
import { starlinkLoginFor } from "./localBrowser";

describe("starlinkLoginFor", () => {
  it("fills the email and uses the Wi-Fi code as the Starlink password", () => {
    expect(starlinkLoginFor({ expectedEmail: " a@b.com ", wifiPassword: "Aa1", expectedEmailPassword: "Bb2" })).toEqual({ loginEmail: "a@b.com", loginPassword: "Aa1" });
  });

  it("falls back to the email's own code, and leaves out what is missing", () => {
    expect(starlinkLoginFor({ expectedEmail: "a@b.com", expectedEmailPassword: "Bb2" })).toEqual({ loginEmail: "a@b.com", loginPassword: "Bb2" });
    expect(starlinkLoginFor({ wifiPassword: " " })).toEqual({});
  });
});
