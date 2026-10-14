import { describe, expect, it } from "vitest";
import { withoutBottomDuplicates } from "./moreMenu";

describe("top «المزيد» repeats nothing from the bottom", () => {
  it("drops a top item whose page is already at the bottom; keeps the rest and actions", () => {
    const top = [{ href: "/tools" }, { href: "/starlink" }, { href: "/settings" }, { href: "/archive" }, { action: "x" }];
    const kept = withoutBottomDuplicates(top, ["/", "/money", "/settings", "/starlink", "/tools#pay"], (i) => ("href" in i ? i.href : undefined));
    expect(kept).toEqual([{ href: "/tools" }, { href: "/archive" }, { action: "x" }]);
  });
});
