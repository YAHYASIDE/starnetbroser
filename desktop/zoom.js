// 🖥️ Ctrl + / Ctrl - / Ctrl 0 and Ctrl + mouse wheel make the whole window bigger or smaller (his
// Oct 21 2026 choice «عادي + تكبير بـ Ctrl»), remembered for the next start. Pure decisions here -
// tested in zoom.test.js; main.js wires them to the windows.
const STEP = 0.5;
const MIN = -3;
const MAX = 4;

function clamp(level) {
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX, Math.max(MIN, Math.round(level / STEP) * STEP));
}

/** What a key press does: "in" / "out" / "reset", or null when it is not a zoom shortcut. */
function zoomAction(input) {
  if (!input || input.type !== "keyDown" || !(input.control || input.meta) || input.alt) return null;
  if (input.key === "+" || input.key === "=" || input.code === "NumpadAdd") return "in";
  if (input.key === "-" || input.key === "_" || input.code === "NumpadSubtract") return "out";
  if (input.key === "0" || input.code === "Numpad0") return "reset";
  return null;
}

function nextZoom(level, action) {
  if (action === "reset") return 0;
  if (action === "in") return clamp(level + STEP);
  if (action === "out") return clamp(level - STEP);
  return clamp(level);
}

/** The saved level from the settings file's text ({"zoom": n}); 0 when missing or broken. */
function readZoom(text) {
  try {
    return clamp(Number(JSON.parse(text).zoom));
  } catch {
    return 0;
  }
}

module.exports = { STEP, MIN, MAX, clamp, zoomAction, nextZoom, readZoom };

/** Wires one window's page to the shared level (store: {get(), set(level)} - set applies it to
 * every open window and saves it). */
function attachZoom(wc, store) {
  wc.on("before-input-event", (event, input) => {
    const action = zoomAction(input);
    if (!action) return;
    event.preventDefault();
    store.set(nextZoom(store.get(), action));
  });
  // Ctrl + mouse wheel.
  wc.on("zoom-changed", (_event, direction) => store.set(nextZoom(store.get(), direction === "in" ? "in" : "out")));
  wc.on("did-finish-load", () => wc.setZoomLevel(store.get()));
}

module.exports.attachZoom = attachZoom;
