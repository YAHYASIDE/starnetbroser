// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractStarlinkFields } from "./extractStarlinkFields";
import { extractOutsideHomeDays } from "./textFields";

// Shaped like his Oct 2026 Subscription page screenshot - fake ids only.
const page = (banner: string) => {
  document.body.innerHTML = `
    <div><a>Subscriptions</a><h1>Subscription</h1><div>SL-DF-00000000-00000-0</div>
    ${banner}
    <div>Nickname</div><div>Roam - Unlimited</div><button>Edit</button>
    <div>Service Plan</div><span>Ending 2026/11/14</span><div>Roam - Unlimited</div><button>Manage</button></div>`;
  return document;
};
const BANNER = `<div><p>Your Starlink is outside its home country. Service will be restricted if it remains there after your plan's travel allowance is used. Days remaining: 9. Travel allowance: 30. See more <a>here</a>.</p></div>`;

describe("🌍 outside its home country - the days left before the restriction", () => {
  it("reads the days left and the allowance from the subscription page", () => {
    const fields = extractStarlinkFields(page(BANNER));
    expect(fields.outsideHomeDaysRemaining).toBe(9);
    expect(fields.outsideHomeAllowanceDays).toBe(30);
  });

  it("the subscription page without the banner clears it; a page without the plan says nothing", () => {
    expect(extractStarlinkFields(page("")).outsideHomeDaysRemaining).toBeNull();
    document.body.innerHTML = `<div><h1>Billing</h1><div>Balance Due</div><div>$0.00</div></div>`;
    expect(extractStarlinkFields(document).outsideHomeDaysRemaining).toBeUndefined();
  });

  it("the sentence split over lines, Arabic digits", () => {
    expect(extractOutsideHomeDays(["Your Starlink is outside its home country.", "Service will be restricted…", "Days remaining: ١٢. Travel allowance: 30."])).toEqual({ daysRemaining: 12, allowanceDays: 30 });
    expect(extractOutsideHomeDays(["Days remaining: 3"])).toBeUndefined();
  });
});
