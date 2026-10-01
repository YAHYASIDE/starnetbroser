import type { StarlinkAccountSummary } from "@starnet/shared";
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

  it("offers the device's other codes and the most used passwords, never the saved one again", () => {
    const others = [{ name: "x", wifiPassword: "demo-common" }, { name: "y", expectedEmailPassword: "demo-mail" }] as StarlinkAccountSummary[];
    expect(mailLoginFor({ expectedEmail: "a@outlook.com", expectedEmailPassword: "demo-mail", wifiPassword: "demo-wifi" }, others)).toEqual({
      email: "a@outlook.com",
      password: "demo-mail",
      suggestions: ["demo-wifi", "demo-common"],
    });
  });
});
