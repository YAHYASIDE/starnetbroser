// 🖥️🔄 «تحديث من Starlink» on the laptop (his Oct 22 2026 choice «زر تحديث يعمل على اللابتوب»): the device's
// window walks the same pages as the phone's «مزامنة» (English → Subscriptions → the subscription → its
// devices → Billing → Settings → Home), reading each with the phone's own extractor bundle until it
// settles. Every read is kept in pending-syncs.json BEFORE the app is told (the phone's PendingSyncStore),
// and the app merges and acknowledges them - so nothing is lost if the app's window was busy.
const { app, Notification } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { T, SettleTracker, settleKey, hasColoredDot, hasRenewalDate, keepStoppedWithinRun, keepRestrictedWithinRun, isAccountPage } = require("./syncplan");

const HOME_URL = "https://starlink.com/account/home";
const WANT = { ANY: 0, DOTS: 1, RENEWAL: 2 };

// ---- the extractor (packages/local-browser-plugin's bundle, shipped beside the program) ----
let bundle = null;
function extractorBundle() {
  if (bundle !== null) return bundle;
  const candidates = [
    path.join(process.resourcesPath || "", "starlinkExtractor.js"),
    path.join(__dirname, "..", "packages", "local-browser-plugin", "android", "src", "main", "assets", "starlinkExtractor.js"),
  ];
  for (const file of candidates) {
    try {
      bundle = fs.readFileSync(file, "utf8");
      return bundle;
    } catch {
      // next place
    }
  }
  bundle = "";
  return bundle;
}

// ---- pending reads (survive until the app merged them) ----
const pendingFile = () => path.join(app.getPath("userData"), "pending-syncs.json");
function readPending() {
  try {
    const parsed = JSON.parse(fs.readFileSync(pendingFile(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writePending(list) {
  fs.writeFileSync(pendingFile(), JSON.stringify(list));
}
function savePending(accountId, fields) {
  const entry = { syncId: crypto.randomUUID(), accountId, fields, recordedAt: Date.now() };
  try {
    writePending([...readPending(), entry].slice(-500));
    return entry;
  } catch {
    return null;
  }
}
function listPending() {
  return readPending();
}
function ackPending(ids) {
  const drop = new Set(Array.isArray(ids) ? ids : []);
  try {
    writePending(readPending().filter((e) => !drop.has(e.syncId)));
    return true;
  } catch {
    return false;
  }
}

function notify(body) {
  try {
    if (Notification.isSupported()) new Notification({ title: "STAR NET", body }).show();
  } catch {
    // nothing to show it on
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const running = new Set();

/** Runs one sync in `view` (the device's window). `emit(entry)` tells the app a read is waiting. */
async function syncDevice(view, accountId, emit) {
  if (running.has(accountId)) return { ok: false, message: "التحديث يعمل الآن على هذا الجهاز" };
  const code = extractorBundle();
  if (!code) return { ok: false, message: "قارئ Starlink غير موجود في البرنامج - حدّث STAR NET" };
  running.add(accountId);
  const wc = view.webContents;
  const alive = () => !view.isDestroyed();
  const run = (call) => wc.executeJavaScript(`${code}\n${call}`, false);
  let found = false;
  let failed = false;
  let sawStopped = false;
  let sawRestricted = false;
  let lastKey = "";

  async function readSettled(minMs, maxMs, stable, mustChange, want) {
    const tracker = new SettleTracker(minMs, maxMs, stable);
    const started = Date.now();
    const previous = mustChange ? lastKey : null;
    let latest = null;
    while (alive()) {
      if (!isAccountPage(wc.getURL())) return;
      let fields = null;
      try {
        fields = JSON.parse(await run("__starnetExtract();"));
      } catch {
        fields = null;
      }
      const key = settleKey(fields);
      const stillOld = previous !== null && key !== "" && key === previous;
      if (key && !stillOld) latest = fields;
      const good = !stillOld && (want !== WANT.DOTS || hasColoredDot(fields)) && (want !== WANT.RENEWAL || hasRenewalDate(fields));
      if (tracker.offer(stillOld ? "" : key, good, Date.now() - started)) break;
      await wait(T.READ_POLL_MS);
    }
    if (!latest || !Object.keys(latest).length) return;
    lastKey = settleKey(latest);
    sawStopped = keepStoppedWithinRun(latest, sawStopped);
    sawRestricted = keepRestrictedWithinRun(latest, sawRestricted);
    const entry = savePending(accountId, latest);
    if (!entry) {
      failed = true;
      return;
    }
    found = true;
    emit(entry);
  }

  async function click(call) {
    if (!alive() || !isAccountPage(wc.getURL())) return;
    await run(call).catch(() => {});
    await wait(T.AFTER_TAP_ADVANCE_MS);
  }

  async function goHome() {
    if (!alive()) return;
    lastKey = "";
    await wc.loadURL(HOME_URL).catch(() => {});
    await wait(T.AFTER_TAP_ADVANCE_MS);
  }

  async function ensureEnglish() {
    let menuOpened = false;
    for (let steps = 1; alive() && steps <= T.MAX_ENGLISH_STEPS; steps++) {
      const step = await run(`__starnetEnsureEnglish(${menuOpened});`).catch(() => "");
      const done = step === "english" || step === "unknown" || !step || steps >= T.MAX_ENGLISH_STEPS;
      if (done) {
        if (menuOpened && step !== "english") {
          await wc.loadURL(HOME_URL).catch(() => {});
          await wait(T.ENGLISH_RELOAD_DELAY_MS);
        } else if (steps > 1) await wait(T.HOME_SETTLE_DELAY_MS);
        return;
      }
      if (step === "menu") menuOpened = true;
      if (step === "clicked") {
        menuOpened = false;
        await wait(T.ENGLISH_RELOAD_DELAY_MS);
        if (alive() && !isAccountPage(wc.getURL())) {
          await wc.loadURL(HOME_URL).catch(() => {});
          await wait(T.ENGLISH_RELOAD_DELAY_MS);
        }
        continue;
      }
      await wait(T.SYNC_STEP_DELAY_MS);
    }
  }

  try {
    // The account must be open: up to 20 s for the page (and a saved sign-in) to land on it.
    for (let i = 0; alive() && i < 40 && !isAccountPage(wc.getURL()); i++) await wait(500);
    if (!alive()) return { ok: false, message: "أُغلقت نافذة الجهاز" };
    if (!isAccountPage(wc.getURL())) {
      notify("🔐 الجهاز غير مسجّل الدخول في Starlink - سجّل الدخول في نافذته ثم اضغط «تحديث» من جديد");
      return { ok: false, outcome: "signedOut", message: "الجهاز غير مسجّل الدخول في Starlink - سجّل الدخول في نافذته ثم حدّث من جديد" };
    }
    await ensureEnglish();
    await readSettled(0, T.CURRENT_PAGE_MAX_MS, 2, false, WANT.ANY);
    await click("__starnetClickSubscriptionsRailItem();");
    await readSettled(T.AFTER_TAP_MIN_MS, T.AFTER_TAP_MAX_MS, 2, true, WANT.ANY);
    await click("__starnetClickFirstSubscriptionRow();");
    await readSettled(T.AFTER_TAP_MIN_MS, T.AFTER_TAP_MAX_MS, 2, true, WANT.ANY);
    await click("__starnetExpandDevicesSection();");
    await readSettled(T.AFTER_TAP_MIN_MS, T.DEVICES_MAX_MS, 2, false, WANT.DOTS);
    await click("__starnetClickBillingRailItem();");
    await readSettled(T.AFTER_TAP_MIN_MS, T.BILLING_MAX_MS, 2, true, WANT.RENEWAL);
    await click("__starnetClickSettingsRailItem();");
    await readSettled(T.AFTER_TAP_MIN_MS, T.AFTER_TAP_MAX_MS, 2, true, WANT.ANY);
    await goHome();
    await readSettled(T.HOME_MIN_MS, T.HOME_MAX_MS, 3, false, WANT.ANY);
    const outcome = failed ? "saveFailed" : found ? "ok" : "nothing";
    notify(outcome === "ok" ? "✅ تم التحديث من Starlink" : outcome === "saveFailed" ? "تعذّر حفظ القراءة - حاول مرة أخرى" : "لم يُعثر على بيانات في صفحات Starlink");
    return { ok: outcome !== "saveFailed", outcome };
  } finally {
    running.delete(accountId);
  }
}

module.exports = { syncDevice, listPending, ackPending };
