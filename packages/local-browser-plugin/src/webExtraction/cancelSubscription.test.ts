// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancelSubscriptionStep, scheduledEnd } from "./cancelSubscription";
import { clickSubscriptionRow, subscriptionRowCount } from "./navigation";

// Fake pages shaped like the real, confirmed screenshots (English Starlink page). jsdom has no
// layout, so every element gets a small box unless it is hidden on purpose (data-hidden).
const REASON = "Service is too expensive";
const realRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    const hidden = this.closest("[data-hidden]");
    const size = hidden ? 0 : 20;
    return { x: 0, y: 0, top: 0, left: 0, right: size, bottom: size, width: size, height: size, toJSON() {} } as DOMRect;
  };
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  document.body.innerHTML = "";
});

const SUBSCRIPTION_PAGE = `
  <div><p>Nickname</p><p>Roam - Unlimited</p><button id="edit-name">Edit</button></div>
  <div><div><p>Service Plan</p><span>Active</span></div><p>Roam - Unlimited</p><button id="manage">Manage</button></div>
  <div><p>Service Location</p><button id="edit-location">Edit</button></div>`;

const MANAGE_DIALOG = `<div role="dialog"><h2>Manage Service Plan</h2>
  <button>Change plan</button><button>Pause current service</button><button id="cancel-service">Cancel service</button><button>Cancel</button></div>`;

function keepDialog(selected = "", described = "") {
  return `<div role="dialog"><h2>Keep your service?</h2><p>Your service will continue through 10/9/2026 if you cancel.</p>
    <div role="combobox" aria-haspopup="listbox" id="reason">${selected}</div>
    <input aria-hidden="true" class="MuiSelect-nativeInput" value="${selected}">
    ${selected ? `<label>Please describe your reason</label><input type="text" id="describe" value="${described}">` : ""}
    <button id="continue">Continue To Cancel</button><button>Keep Service</button></div>`;
}

const REASONS_LIST = `<ul role="listbox">
  <li role="option">Performance is not meeting my needs</li>
  <li role="option" id="expensive">Service is too expensive</li>
  <li role="option">I want to transfer my Starlink</li></ul>`;

const PLANS_DIALOG = `<div role="dialog"><h2>Before you cancel, consider the following plans</h2>
  <div>Standby Mode $10/mo</div><button>Close</button><button id="continue-plans">Continue To Cancel</button><button>Change Plan</button></div>`;

const RIGHT_DIALOG = `<div role="dialog"><h2>Let us make things right.</h2>
  <button>Close</button><button id="confirm">Confirm &amp; Cancel Service</button><button>Contact Support</button></div>`;

function clicked(id: string): () => boolean {
  let hit = false;
  document.getElementById(id)!.addEventListener("click", () => {
    hit = true;
  });
  return () => hit;
}

describe("cancelSubscriptionStep", () => {
  it("presses «Manage» next to «Service Plan», never an «Edit»", () => {
    document.body.innerHTML = SUBSCRIPTION_PAGE;
    const manage = clicked("manage");
    const editName = clicked("edit-name");
    expect(cancelSubscriptionStep(REASON)).toBe("manage");
    expect(manage()).toBe(true);
    expect(editName()).toBe(false);
  });

  it("picks «Cancel service» in «Manage Service Plan», never the dialog's own «Cancel»", () => {
    document.body.innerHTML = SUBSCRIPTION_PAGE + MANAGE_DIALOG;
    const cancelService = clicked("cancel-service");
    expect(cancelSubscriptionStep(REASON)).toBe("cancel-service");
    expect(cancelService()).toBe(true);
  });

  it("fills «Keep your service?»: opens the reason list, picks the reason, types it, then continues", () => {
    document.body.innerHTML = SUBSCRIPTION_PAGE + keepDialog();
    let opened = false;
    document.getElementById("reason")!.addEventListener("mousedown", () => {
      opened = true;
    });
    expect(cancelSubscriptionStep(REASON)).toBe("open-reason");
    expect(opened).toBe(true);

    document.body.innerHTML = SUBSCRIPTION_PAGE + keepDialog() + REASONS_LIST;
    const expensive = clicked("expensive");
    expect(cancelSubscriptionStep(REASON)).toBe("pick-reason");
    expect(expensive()).toBe(true);

    document.body.innerHTML = SUBSCRIPTION_PAGE + keepDialog(REASON);
    expect(cancelSubscriptionStep(REASON)).toBe("type-reason");
    expect((document.getElementById("describe") as HTMLInputElement).value).toBe(REASON);

    document.body.innerHTML = SUBSCRIPTION_PAGE + keepDialog(REASON, REASON);
    const proceed = clicked("continue");
    expect(cancelSubscriptionStep(REASON)).toBe("continue");
    expect(proceed()).toBe(true);
  });

  it("goes past the plans offer and confirms on the dialog stacked on top", () => {
    document.body.innerHTML = SUBSCRIPTION_PAGE + PLANS_DIALOG;
    const plans = clicked("continue-plans");
    expect(cancelSubscriptionStep(REASON)).toBe("continue-plans");
    expect(plans()).toBe(true);

    // «Let us make things right.» sits over «Keep your service?» (real screenshot).
    document.body.innerHTML = SUBSCRIPTION_PAGE + keepDialog(REASON, REASON) + RIGHT_DIALOG;
    const confirm = clicked("confirm");
    expect(cancelSubscriptionStep(REASON)).toBe("confirm");
    expect(confirm()).toBe(true);
  });

  it("waits on a disabled button instead of pressing something else", () => {
    document.body.innerHTML = SUBSCRIPTION_PAGE + RIGHT_DIALOG.replace('id="confirm"', 'id="confirm" disabled');
    expect(cancelSubscriptionStep(REASON)).toBe("wait");
  });

  it("is done once the page says the service ends, and reads the date", () => {
    document.body.innerHTML = `<p>Your service is scheduled to end on 10/9/2026.</p><button>Resume</button>
      <div><p>Service Plan</p><span>Ending ٢٠٢٦/١٠/٩</span><button>Manage</button></div>`;
    expect(cancelSubscriptionStep(REASON)).toBe("done:2026/10/09");
  });

  it("presses nothing on a page it doesn't know", () => {
    document.body.innerHTML = `<div role="dialog"><h2>Something new</h2><button id="x">Continue To Cancel</button></div>`;
    const x = clicked("x");
    expect(cancelSubscriptionStep(REASON)).toBe("unknown");
    expect(x()).toBe(false);
    document.body.innerHTML = `<p>Home</p><button>Manage</button>`;
    expect(cancelSubscriptionStep(REASON)).toBe("unknown");
  });
});

describe("scheduledEnd", () => {
  it("reads the English banner as month/day/year and the chip as year/month/day", () => {
    document.body.innerHTML = `<p>Your service is scheduled to end on 10/9/2026.</p>`;
    expect(scheduledEnd(document.body)).toBe("2026/10/09");
    document.body.innerHTML = `<span>Ending 2026/10/9</span>`;
    expect(scheduledEnd(document.body)).toBe("2026/10/09");
    document.body.innerHTML = `<p>Service Plan Active</p>`;
    expect(scheduledEnd(document.body)).toBeNull();
  });
});

describe("subscription rows", () => {
  it("counts and opens each subscription row, never «Add subscription»", () => {
    document.body.innerHTML = `<div><span>Subscription</span><button>Add subscription</button></div>
      <a class="row" id="r1">Roam - Unlimited</a><a class="row" id="r2">Residential Lite</a><a class="footer">Privacy</a>`;
    expect(subscriptionRowCount()).toBe(2);
    const second = clicked("r2");
    expect(clickSubscriptionRow(1)).toBe(true);
    expect(second()).toBe(true);
    expect(clickSubscriptionRow(2)).toBe(false);
  });
});
