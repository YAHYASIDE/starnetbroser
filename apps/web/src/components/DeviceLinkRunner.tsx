"use client";

import { requestDataReload } from "@/lib/dataReload";

import { useEffect } from "react";
import { browserLinkStorage, LINK_EXCLUDED_KEYS, LINK_SHARED_SETTINGS, loadLinkConfig, loadTeam, runLinkRound } from "@/lib/deviceLink";
import { isLinkedWrite, startLinkPulse } from "@/lib/linkPulse";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { exportAccountSessions, importAccountSessions } from "@/lib/localBrowser";
import { runSessionRound, SESSION_ROUND_MS } from "@/lib/teamSessions";
import { notifyPhone } from "@/lib/appEvents";
import { activityNotification } from "@/lib/teamActivity";

/** Asks for one round now (Settings' «🔄 مزامنة الآن»). */
export const DEVICE_LINK_NOW_EVENT = "starnet:device-link-now";
/** Fired after each round (Settings shows the status). */
export const DEVICE_LINK_EVENT = "starnet:device-link";
/** «📥 خذ جلسات الفريق»: every newer Starlink session from the team, now. */
export const TEAM_SESSIONS_NOW_EVENT = "starnet:team-sessions-now";
/** Fired after a sessions round ({ sent, taken, message }). */
export const TEAM_SESSIONS_EVENT = "starnet:team-sessions";
/** 📊 While sessions come in ({ done, total }). */
export const TEAM_SESSIONS_PROGRESS_EVENT = "starnet:team-sessions-progress";
/** A sessions round never holds the button longer than this. */
const SESSION_ROUND_LIMIT_MS = 4 * 60_000;

/** A round this often while the app is open (his Nov 5 2026 choice: a change reaches the others in about 10 s) -
 * while the live listener works (lib/linkPulse.ts, his Nov 7 2026 «سريعة جدًا») only every 30 s, as a safety net. */
const EVERY_MS = 8_000;
const EVERY_LIVE_MS = 30_000;
/** A save here goes out this soon after (several saves in a row: once). */
const SEND_AFTER_MS = 800;
/** How often «is he still in the middle of something?» is asked once a full round waits for it. */
const IDLE_CHECK_MS = 1_500;

/** He isn't in the middle of something: no open sheet / dialog and no field being typed in. A round
 * that brings changes reloads the page, so it waits for this. */
function isIdle(): boolean {
  if (document.visibilityState !== "visible") return false;
  if (document.querySelector('[role="dialog"], .party-sheet-backdrop, .dialog-backdrop')) return false;
  const active = document.activeElement;
  return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement);
}

/**
 * 🔗 The link team (lib/deviceLink.ts): a round every 8 s while the app is open and in front, and at once when it
 * comes back. In the middle of something (an open sheet, a field being typed in) only what changed here goes out;
 * the others' changes come in the moment he is done. When they landed, the page reloads so every screen reads them
 * (a screen holding the old list would otherwise write it back).
 */
export function DeviceLinkRunner() {
  useEffect(() => {
    let running = false;
    /** Asked again while a round ran (another phone wrote, or a save here): one more round right after. */
    let again = false;
    /** A full round waits for him to finish what he is doing. */
    let waiting = false;
    /** The live listener works. */
    let live = false;
    let lastRound = 0;
    const tick = async (force = false) => {
      if (document.visibilityState !== "visible") return;
      if (running) {
        again = true;
        return;
      }
      const storage = browserLinkStorage();
      if (!loadLinkConfig(storage)?.enabled) return;
      const full = force || isIdle();
      waiting = !full;
      running = true;
      lastRound = Date.now();
      try {
        const result = await runLinkRound(storage, fetch, new Date(), { sendOnly: !full });
        if (!full) return;
        window.dispatchEvent(new CustomEvent(DEVICE_LINK_EVENT, { detail: result }));
        // 👥 a new device or money operation from another member: one notification for the round
        const text = activityNotification(result.incoming);
        if (text) await notifyPhone(text);
        // 🗑️ on YAHYA: another member deleted something - it waits for him
        if (result.pending) await notifyPhone(`🗑️ حذف من الفريق بانتظار موافقتك (${result.pending}) - الإعدادات ← 🔗 ربط الأجهزة`);
        // 🔄 the open page reads again in place - never a reload (it opened the home page under another page)
        if (result.changedKeys.length > 0) requestDataReload();
      } finally {
        running = false;
        if (again) {
          again = false;
          window.setTimeout(() => void tick(), 50);
        }
      }
    };
    // 🔐 the devices' Starlink sessions in the team (lib/teamSessions.ts): every 30 minutes, or at once when asked
    let sessionsBusy = false;
    const sessions = async (force = false) => {
      const storage = browserLinkStorage();
      const config = loadLinkConfig(storage);
      const skip = (message: string) => force && window.dispatchEvent(new CustomEvent(TEAM_SESSIONS_EVENT, { detail: { ok: false, sent: 0, taken: 0, message } }));
      if (sessionsBusy) return void skip("ما زال ينقل الجلسات - انتظر قليلًا ثم أعد");
      if (!config?.enabled) return void skip("الربط غير مفعّل");
      const team = loadTeam(storage);
      if (team.length < 2) return void skip("لا يرى هذا الهاتف عضوًا آخر في الفريق بعد - اضغط «🔄 مزامنة الآن» ثم أعد");
      sessionsBusy = true;
      try {
        let timer = 0;
        const limit = new Promise<{ ok: false; sent: 0; taken: 0; message: string }>((resolve) => {
          timer = window.setTimeout(() => resolve({ ok: false, sent: 0, taken: 0, message: "توقف نقل الجلسات (أكثر من 4 دقائق) - أعد «📥»" }), SESSION_ROUND_LIMIT_MS);
        });
        const round = runSessionRound(
          {
            config,
            team,
            accountIds: loadDemoAccounts(demoAccounts).filter((a) => !a.deletedAt).map((a) => a.id),
            exportSessions: (ids) => exportAccountSessions(ids),
            importSessions: (s) => importAccountSessions(s),
            getSetting: (k) => storage.getSetting(k),
            setSetting: (k, v) => storage.setSetting(k, v),
            onProgress: (done, total) => window.dispatchEvent(new CustomEvent(TEAM_SESSIONS_PROGRESS_EVENT, { detail: { done, total } })),
          },
          force,
        );
        const result = await Promise.race([round, limit]);
        window.clearTimeout(timer);
        window.dispatchEvent(new CustomEvent(TEAM_SESSIONS_EVENT, { detail: result }));
      } finally {
        sessionsBusy = false;
      }
    };
    const firstSessions = window.setTimeout(() => void sessions(), 30_000);
    const sessionsTimer = window.setInterval(() => void sessions(), SESSION_ROUND_MS);
    const onSessionsNow = () => void sessions(true);
    window.addEventListener(TEAM_SESSIONS_NOW_EVENT, onSessionsNow);
    const first = window.setTimeout(() => void tick(), 3000);
    const timer = window.setInterval(() => {
      if (live && Date.now() - lastRound < EVERY_LIVE_MS) return;
      void tick();
    }, EVERY_MS);
    // ⚡ live: another phone wrote → our round at once (lib/linkPulse.ts)
    let stopPulse: (() => void) | null = null;
    const startPulse = () => {
      const config = loadLinkConfig(browserLinkStorage());
      if (stopPulse || !config?.enabled) return;
      stopPulse = startLinkPulse(config, () => void tick(), (state) => (live = state));
    };
    startPulse();
    const onLinkEvent = () => startPulse();
    window.addEventListener(DEVICE_LINK_EVENT, onLinkEvent);
    // 💾 a save on this phone goes out within a second
    let sendTimer = 0;
    const proto = Storage.prototype;
    const originalSetItem = proto.setItem;
    proto.setItem = function (this: Storage, key: string, value: string) {
      originalSetItem.call(this, key, value);
      // (what a round writes in also lands here - one extra quiet round, nothing to send)
      if (this === window.localStorage && isLinkedWrite(key, LINK_SHARED_SETTINGS) && !(LINK_EXCLUDED_KEYS as readonly string[]).includes(key)) {
        window.clearTimeout(sendTimer);
        sendTimer = window.setTimeout(() => void tick(), SEND_AFTER_MS);
      }
    };
    const idleTimer = window.setInterval(() => waiting && isIdle() && void tick(), IDLE_CHECK_MS);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    const onNow = () => void tick(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DEVICE_LINK_NOW_EVENT, onNow);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.clearInterval(idleTimer);
      window.clearTimeout(sendTimer);
      window.removeEventListener(DEVICE_LINK_EVENT, onLinkEvent);
      stopPulse?.();
      proto.setItem = originalSetItem;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(DEVICE_LINK_NOW_EVENT, onNow);
      window.clearTimeout(firstSessions);
      window.clearInterval(sessionsTimer);
      window.removeEventListener(TEAM_SESSIONS_NOW_EVENT, onSessionsNow);
    };
  }, []);
  return null;
}
