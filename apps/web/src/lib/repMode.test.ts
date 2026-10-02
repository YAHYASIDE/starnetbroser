import { describe, expect, it } from "vitest";
import { isRepAllowedPath } from "./repMode";

describe("rep app pages", () => {
  it("opens only the pages the operator chose", () => {
    for (const ok of ["/", "/clients", "/clients/", "/currencies/", "/reminders", "/mailboxes", "/tools", "/settings"]) expect(isRepAllowedPath(ok)).toBe(true);
    for (const no of ["/reports", "/store/", "/representatives", "/starlink", "/archive", "/trash", "/session"]) expect(isRepAllowedPath(no)).toBe(false);
  });
});
