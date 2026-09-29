import { describe, expect, it } from "vitest";
import { mailLoginFor, starlinkLoginFor } from "./localBrowser";

describe("starlinkLoginFor", () => {
  it("fills the email and uses the Wi-Fi code as the Starlink password", () => {
    expect(starlinkLoginFor({ expectedEmail: " a@b.com ", wifiPassword: "Aa1", expectedEmailPassword: "Bb2" })).toEqual({ loginEmail: "a@b.com", loginPassword: "Aa1" });
  });

  it("falls back to the email's own code, and leaves out what is missing", () => {
    expect(starlinkLoginFor({ expectedEmail: "a@b.com", expectedEmailPassword: "Bb2" })).toEqual({ loginEmail: "a@b.com", loginPassword: "Bb2" });
    expect(starlinkLoginFor({ wifiPassword: " " })).toEqual({});
  });
});

describe("mailLoginFor", () => {
  it("is the device email with the email's own password, never the Wi-Fi code", () => {
    expect(mailLoginFor({ expectedEmail: " a@outlook.com ", expectedEmailPassword: " Bb2 " })).toEqual({ email: "a@outlook.com", password: "Bb2" });
    expect(mailLoginFor({ expectedEmail: "a@outlook.com" })).toEqual({ email: "a@outlook.com" });
    expect(mailLoginFor({})).toEqual({});
  });
});
