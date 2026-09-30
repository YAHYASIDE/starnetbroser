// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractStarlinkFields } from "./extractStarlinkFields";
import { clickFirstSubscriptionRow, expandDevicesSection } from "./navigation";
import { extractBillingDueDay, extractSubscriptionInvoiceDueDay, normalizeDateLike } from "./textFields";

// Sync switches Starlink to English (United States) first (language.ts) - these are the English
// pages it then reads. Fake/dummy data only - none of it is a real Starlink account.

function read(html: string) {
  document.body.innerHTML = html;
  return extractStarlinkFields(document);
}

describe("English (United States) dates", () => {
  it("reads month-first and month-name dates as YYYY/MM/DD", () => {
    expect(normalizeDateLike("9/28/2026")).toBe("2026/09/28");
    expect(normalizeDateLike("on Sep 28, 2026.")).toBe("2026/09/28");
    expect(normalizeDateLike("September 8, 2026")).toBe("2026/09/08");
    expect(normalizeDateLike("28 Sept 2026")).toBe("2026/09/28");
    expect(normalizeDateLike("٢٠٢٦/٩/٢٨")).toBe("2026/09/28");
  });

  it("never makes a date out of an impossible month", () => {
    expect(normalizeDateLike("13/40/2026")).not.toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  it("reads the Billing page's due day and the invoice list in English", () => {
    expect(extractBillingDueDay(["Payment due date: August 28."])).toBe(28);
    expect(extractBillingDueDay(["Payment due date", "Aug 5"])).toBe(5);
    expect(extractSubscriptionInvoiceDueDay(["Paid", "Subscription", "Aug 24, 2026"])).toBe(24);
  });
});

describe("English Home page", () => {
  it("reads the restricted-outside-home-country banner", () => {
    const fields = read(`
      <div>DEMO NAME • ACC-0000-0000-DEMO</div>
      <div>Your Starlink's service is restricted because it has been outside of its home country for too long. To resume service, return your Starlink to its home country.</div>
    `);
    expect(fields.isRestricted).toBe(true);
    expect(fields.serviceStatus).toBe("active");
  });

  it("reads the scheduled-to-end banner's date", () => {
    const fields = read(`
      <div>DEMO NAME • ACC-0000-0000-DEMO</div>
      <div>Your service is scheduled to end on September 28, 2026.</div>
    `);
    expect(fields.renewalDate).toBe("2026/09/28");
    expect(fields.pendingCancellationDate).toBe("2026/09/28");
    expect(fields.serviceStatus).toBe("active");
  });

  it("reads the transition-to-standby banner the same way", () => {
    const fields = read(`
      <div>DEMO NAME • ACC-0000-0000-DEMO</div>
      <div>Your current service will transition to Standby Mode on 10/24/2026.</div>
    `);
    expect(fields.pendingCancellationDate).toBe("2026/10/24");
  });
});

describe("English Home page - real, confirmed wording (fake name/number)", () => {
  it("reads restricted + the scheduled end date together", () => {
    const fields = read(`
      <div><div>Earn €45 for each referral</div><div>Share your link to get started</div><button>Refer Now</button></div>
      <div><div>Your Starlink's service is restricted because it has been outside of its home country for too long. To resume service, return Starlink to its home country, and ensure it is powered on and active for at least 24 hours.</div></div>
      <div><div>Your service is scheduled to end on 10/16/2026.</div><button>Resume</button></div>
      <h1>Home</h1>
      <div>DEMO NAME • ACC-0000000-00000-00</div>
    `);
    expect(fields.isRestricted).toBe(true);
    expect(fields.renewalDate).toBe("2026/10/16");
    expect(fields.pendingCancellationDate).toBe("2026/10/16");
    expect(fields.serviceStatus).toBe("active");
  });
});

describe("English subscription page", () => {
  it("reads the Service Plan badge and the Ends date", () => {
    const fields = read(`
      <div>Service Plan</div>
      <div>Active</div>
      <div>Roam Unlimited</div>
      <div>Ends 9/28/2026</div>
    `);
    expect(fields.serviceStatus).toBe("active");
    expect(fields.planName).toBe("Roam Unlimited");
    expect(fields.renewalDate).toBe("2026/09/28");
  });
});

describe("English navigation", () => {
  it("opens the first subscription row under the Subscription column, never Add Subscription", () => {
    document.body.innerHTML = `
      <div>Subscription</div>
      <button id="add">Add Subscription</button>
      <button id="row">DEMO SUBSCRIPTION</button>
    `;
    const seen: string[] = [];
    for (const id of ["add", "row"]) document.getElementById(id)!.addEventListener("click", () => seen.push(id));
    expect(clickFirstSubscriptionRow()).toBe(true);
    expect(seen).toEqual(["row"]);
  });

  it("expands the Devices section by its STARLINK row", () => {
    document.body.innerHTML = `
      <h3>Devices</h3>
      <button id="icon"></button>
      <button id="dish" aria-expanded="false">STARLINK</button>
    `;
    let clicked = "";
    document.getElementById("dish")!.addEventListener("click", () => (clicked = "dish"));
    expect(expandDevicesSection()).toBe(true);
    expect(clicked).toBe("dish");
  });
});
