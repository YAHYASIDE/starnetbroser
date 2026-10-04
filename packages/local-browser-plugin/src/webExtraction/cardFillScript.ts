/**
 * 💳 Runs at the start of every frame of a device's browser (AccountBrowserActivity, through
 * androidx.webkit's document-start script), talking to the app through the `starnetCardFill`
 * bridge (a web-message listener - present only in this app's own browser):
 *  - a frame that has card fields says so once ("ready") - only those frames ever receive a card;
 *  - tapping a card field asks the app to show the operator's cards ("focus");
 *  - the card he picks comes back as a message and fills this frame's card fields.
 * Nothing is read from the page except which card fields exist.
 */
import { cardFieldKind, cardFields, fillCardFields, type FillCard } from "./cardFill";

interface Bridge {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

(() => {
  const w = window as unknown as { starnetCardFill?: Bridge; __starnetCardFillOn?: boolean };
  const bridge = w.starnetCardFill;
  if (!bridge || w.__starnetCardFillOn) return;
  w.__starnetCardFillOn = true;
  if (location.protocol !== "https:") return;

  let announced = false;
  const announce = () => {
    if (announced) return;
    const kinds = cardFields(document).map((f) => f.kind);
    if (!kinds.length) return;
    announced = true;
    bridge.postMessage(JSON.stringify({ type: "ready", kinds }));
  };

  let pending = false;
  const observer = new MutationObserver(() => {
    if (announced || pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      announce();
    }, 300);
  });
  observer.observe(document, { childList: true, subtree: true });

  document.addEventListener(
    "focusin",
    (event) => {
      const kind = cardFieldKind(event.target);
      if (!kind) return;
      announce();
      bridge.postMessage(JSON.stringify({ type: "focus", kind }));
    },
    true,
  );

  bridge.onmessage = (event) => {
    let card: FillCard;
    try {
      card = JSON.parse(event.data) as FillCard;
    } catch {
      return;
    }
    const count = fillCardFields(document, card);
    bridge.postMessage(JSON.stringify({ type: "filled", count }));
  };
})();
