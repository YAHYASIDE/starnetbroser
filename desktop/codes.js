// 🖥️🔑 The laptop's two-step helper: while a device's Starlink window shows «التحقق بخطوتين», the code
// is read from that device's mailbox window (hidden unless it needs a sign-in) and typed; every code
// goes to «🔑 الأكواد» (codes.json - app data on this laptop, never logged).
const { app, Notification } = require("electron");
const fs = require("fs");
const path = require("path");
const { DETECT_SCRIPT, OTHER_TAB_SCRIPT, fillScript, findMailCode, remember, isNew, appendCode } = require("./twostep");
const { mailSessionState } = require("./sessions");

const file = () => path.join(app.getPath("userData"), "codes.json");
function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), "utf8"));
    return { tried: (parsed && parsed.tried) || {}, log: Array.isArray(parsed && parsed.log) ? parsed.log : [] };
  } catch {
    return { tried: {}, log: [] };
  }
}
function write(data) {
  try {
    fs.writeFileSync(file(), JSON.stringify(data));
  } catch {
    // the code was still typed - only its trace is lost
  }
}

function record(accountId, kind, code) {
  const data = read();
  const now = Date.now();
  data.log = appendCode(data.log, { at: now, accountId, kind, code }, now);
  if (kind === "starlink") data.tried[accountId] = remember(data.tried[accountId], code);
  write(data);
}

/** Newest first, as the phone's plugin gives them. */
function listCodes() {
  return [...read().log].reverse();
}

function clearCodes() {
  const data = read();
  data.log = [];
  write(data);
}

function notify(body) {
  try {
    if (Notification.isSupported()) new Notification({ title: "STAR NET", body }).show();
  } catch {
    // no notification - the window still shows the page
  }
}

const POLL_MS = 4000;
const READ_FOR_MS = 2 * 60 * 1000;
const REFILL_AFTER_MS = 60 * 1000;
const MAX_FILLS = 3;

/**
 * Watches one device window. `openMail(show)` opens (or returns) its mailbox window -> {ok, view}.
 * Stops by itself when the window closes.
 */
function watch(view, accountId, openMail) {
  let reading = false;
  let lastFill = 0;
  let fills = 0;
  let off = false;
  const wc = view.webContents;

  async function readCode() {
    reading = true;
    try {
      const opened = openMail(false);
      if (!opened || !opened.ok || !opened.view) return;
      const mailWin = opened.view;
      const mwc = mailWin.webContents;
      const started = Date.now();
      let clickedOther = false;
      let lastReload = Date.now();
      while (!view.isDestroyed() && !mailWin.isDestroyed() && Date.now() - started < READ_FOR_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (view.isDestroyed() || mailWin.isDestroyed()) return;
        const state = mailSessionState(mwc.getURL());
        if (state === "signedOut") {
          // The mailbox isn't signed in here: show it so he signs in once (then codes come by themselves).
          mailWin.show();
          notify("📧 سجّل الدخول في بريد هذا الجهاز مرة واحدة ليُكتب رمز Starlink وحده");
          off = true;
          return;
        }
        if (state !== "signedIn") continue;
        const textNow = await mwc.executeJavaScript("(document.body&&document.body.innerText)||''", false).catch(() => "");
        const code = findMailCode(textNow);
        if (isNew(code, read().tried[accountId])) {
          record(accountId, "starlink", code);
          if (!view.isDestroyed()) await wc.executeJavaScript(fillScript(code), false).catch(() => {});
          lastFill = Date.now();
          fills++;
          notify(`✅ أُدخل رمز التحقق من البريد: ${code}`);
          return;
        }
        if (!clickedOther) {
          clickedOther = true;
          await mwc.executeJavaScript(OTHER_TAB_SCRIPT, false).catch(() => {});
        } else if (Date.now() - lastReload > 20000) {
          lastReload = Date.now();
          mwc.reload();
          clickedOther = false;
        }
      }
      notify("لم يصل رمز جديد إلى البريد - اطلب رمزًا جديدًا من Starlink");
    } finally {
      reading = false;
    }
  }

  const timer = setInterval(async () => {
    if (view.isDestroyed()) return clearInterval(timer);
    if (off || reading || fills >= MAX_FILLS || Date.now() - lastFill < REFILL_AFTER_MS) return;
    const state = await wc.executeJavaScript(DETECT_SCRIPT, false).catch(() => "0");
    if (state === "1") void readCode();
  }, 3000);
  view.on("closed", () => clearInterval(timer));
}

module.exports = { watch, record, listCodes, clearCodes };
