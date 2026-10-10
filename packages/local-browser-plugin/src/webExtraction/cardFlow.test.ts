// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cardSight, findEmailChoice, findOtpField, findPaymentEdit, findSaveButton, typeCode } from "./cardFlow";

// Shaped like the operator's screenshots (English Starlink + the card company's pages); fake data.
function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const CARD_FORM = `
  <div class="modal">
    <button>Card</button><button>Klarna</button>
    <label for="n">Name (As it appears on card)</label><input id="n">
    <input id="c" placeholder="1234 1234 1234 1234">
    <input id="e" placeholder="MM / YY"><input id="v" placeholder="CVC">
    <label for="z">Billing Zip / Postal Code</label><input id="z">
    <div class="actions"><button>Cancel</button><button id="save">Save</button></div>
  </div>`;

const BILLING = `
  <h2>Billing</h2>
  <div class="box"><span>Balance Due</span><button>Pay</button></div>
  <div class="box"><div class="row"><span>Payment Method</span><button id="edit">Edit</button></div>
    <p>DEMO NAME</p><p>VISA ending in 1111</p><p>Expires: 03/30</p></div>`;

describe("«أضف البطاقة» page detectors", () => {
  it("finds the card form's Save (next to Cancel, with card fields) - not another Save", () => {
    page(CARD_FORM);
    expect(findSaveButton(document)?.id).toBe("save");
    page(`<form><input name="nickname"><button>Cancel</button><button>Save</button></form>`);
    expect(findSaveButton(document)).toBeNull();
  });

  it("the Save of a form whose card fields are in the payment company's frames", () => {
    page(`<div><iframe title="card number"></iframe><iframe title="cvc"></iframe><div><button>Cancel</button><button id="s">Save</button></div></div>`);
    expect(findSaveButton(document)?.id).toBe("s");
  });

  it("«Verify transaction» → the Email choice (not SMS)", () => {
    page(`<h1>Verify transaction</h1><p>How would you like to verify this transaction?</p><button id="m">Email</button><button>SMS</button>`);
    expect(findEmailChoice(document)?.id).toBe("m");
    page(`<p>Choose a plan</p><button>Email</button>`);
    expect(findEmailChoice(document)).toBeNull();
  });

  it("the payment code page: code field + Submit (not Resend)", () => {
    page(`<h1>Verify transaction</h1><p>STARLINK INTERNET</p><p>€ 0.00</p><p>Card • 1111</p>
      <p>Enter the code we sent to your email demo*****@*****com</p>
      <input id="code" placeholder="Code *"><button id="sub" disabled>Submit</button><button>Resend</button>`);
    const otp = findOtpField(document);
    expect(otp?.input.id).toBe("code");
    expect(otp?.submit?.id).toBe("sub");
    expect(typeCode(otp!.input, "123456")).toBe(true);
    expect((document.getElementById("code") as HTMLInputElement).value).toBe("123456");
  });

  it("Starlink's own sign-in code page is not the payment's", () => {
    page(`<h1>Two-step verification</h1><p>Enter the code we sent to your email</p><input placeholder="Code"><button>Submit</button>`);
    expect(findOtpField(document)).toBeNull();
  });

  it("Billing: Payment Method → Edit, the card on file, the frozen-card error", () => {
    page(BILLING);
    expect(findPaymentEdit(document)?.id).toBe("edit");
    expect(cardSight(document)).toMatchObject({ paymentEdit: true, onFile: "1111", error: null, save: false, otp: false });
    page(CARD_FORM + `<div role="alert">Additional verification needed to process this payment. Contact your bank, or payment processor if you are unable to complete the required authentication.</div>`);
    expect(cardSight(document)).toMatchObject({ save: true, error: "needs-verification" });
  });
});
