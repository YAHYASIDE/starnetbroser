/**
 * 💳 Runs at the start of every frame of a device's browser (AccountBrowserActivity, through
 * androidx.webkit's document-start script), talking to the app through the `starnetCardFill`
 * bridge (a web-message listener - present only in this app's own browser):
 *  - a frame that has card fields says so once ("ready") - only those frames ever receive a card;
 *  - tapping a card field asks the app to show the operator's cards ("focus");
 *  - what the frame shows on the way to a saved card ("sight": Save, Verify transaction, the
 *    code field, Billing's card on file, an error - cardFlow.ts), each time it changes;
 *  - the app's command comes back to the frame that showed it: fill the card, tap Save, pick
 *    Email, type the code + Submit, open «Payment Method» → Edit.
 * Nothing is read from the page except these.
 */
import { cardFieldKind, cardFields, fillCardFields, type FillCard } from "./cardFill";
import { cardSight, findContinueButton, findEmailChoice, findOtpField, findPaymentEdit, findSaveButton, isEnabled, typeCode } from "./cardFlow";

interface Bridge {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

interface Command {
  cmd?: "fill" | "save" | "email" | "code" | "open-form";
  card?: FillCard;
  code?: string;
}

(() => {
  const w = window as unknown as { starnetCardFill?: Bridge; __starnetCardFillOn?: boolean };
  const bridge = w.starnetCardFill;
  if (!bridge || w.__starnetCardFillOn) return;
  w.__starnetCardFillOn = true;
  if (location.protocol !== "https:") return;

  const post = (message: object) => bridge.postMessage(JSON.stringify(message));

  let announced = false;
  const announce = () => {
    if (announced) return;
    const kinds = cardFields(document).map((f) => f.kind);
    if (!kinds.length) return;
    announced = true;
    post({ type: "ready", kinds });
  };

  let lastSight = "";
  const report = () => {
    if (!document.body) return;
    const sight = cardSight(document);
    const key = JSON.stringify(sight);
    const empty = !sight.save && !sight.verifyChoice && !sight.otp && !sight.paymentEdit && !sight.onFile && !sight.error;
    if (key === lastSight || (empty && !lastSight)) return;
    lastSight = key;
    post({ type: "sight", ...sight });
  };

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      announce();
      report();
    }, 400);
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true });

  document.addEventListener(
    "focusin",
    (event) => {
      const kind = cardFieldKind(event.target);
      if (!kind) return;
      announce();
      post({ type: "focus", kind });
    },
    true,
  );

  /** Tries `step` every 400 ms (a button is often disabled for a moment) up to ~10 s. */
  const retry = (step: () => boolean, what: string) => {
    let tries = 0;
    const tick = () => {
      if (step()) {
        post({ type: "clicked", what });
        return;
      }
      if (++tries < 25) setTimeout(tick, 400);
      else post({ type: "stuck", what });
    };
    tick();
  };

  bridge.onmessage = (event) => {
    let command: Command;
    try {
      command = JSON.parse(event.data) as Command;
    } catch {
      return;
    }
    switch (command.cmd) {
      case "fill":
        if (command.card) post({ type: "filled", count: fillCardFields(document, command.card) });
        break;
      case "save":
        retry(() => {
          const save = findSaveButton(document);
          if (!save || !isEnabled(save)) return false;
          save.click();
          return true;
        }, "save");
        break;
      case "email":
        retry(() => {
          const email = findEmailChoice(document);
          if (!email || !isEnabled(email)) return false;
          email.click();
          if (email.tagName === "LABEL" || email.querySelector("input[type='radio']")) setTimeout(() => findContinueButton(document)?.click(), 400);
          return true;
        }, "email");
        break;
      case "code": {
        const code = (command.code || "").replace(/\D/g, "");
        if (!code) break;
        let typed = false;
        retry(() => {
          const otp = findOtpField(document);
          if (!otp) return false;
          if (!typed) typed = typeCode(otp.input, code);
          if (!typed || !otp.submit || !isEnabled(otp.submit)) return false;
          otp.submit.click();
          return true;
        }, "code");
        break;
      }
      case "open-form":
        retry(() => {
          const edit = findPaymentEdit(document);
          if (!edit) return false;
          edit.click();
          return true;
        }, "open-form");
        break;
    }
  };
})();
