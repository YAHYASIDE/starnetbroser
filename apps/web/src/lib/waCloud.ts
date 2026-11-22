"use client";

/**
 * ☁️ «واتساب الرسمي» - the app's side of the Cloud API agent (his Nov 22 2026 choice: a new number for the agent on
 * WhatsApp's official platform, a Cloudflare Worker - packages/wa-cloud). This phone keeps the settings (the Worker's
 * address, the shared key, Meta's token and ids - phone-only, never in a backup or the team link), sends the Worker
 * the agent's pack sealed with the shared key, takes in what the Worker did (log, «المحوّلون», «تنتظرك», statistics,
 * spend) and sends a person's reply. Pure mapping in waCloudEvents (tested); I/O below.
 */

import { addHandoff, addToThread, loadHandoffs, recordEvents, saveHandoffs } from "./agentDesk";
import { addQuestion, loadQuestions, saveQuestions } from "./agentTraining";
import { loadMenus } from "./agentMenus";
import { openText, sealText, type Sealed } from "./deviceSyncCrypto";
import { cloudProblems, newCloudConfig, waCloudEvents, type CloudConfig, type CloudEvent } from "./waCloudPure";

export { cloudProblems, newCloudConfig, waCloudEvents, type CloudConfig, type CloudEvent };
import { addLog, buildPackJson, recordSpend } from "./whatsappAgentLink";

const CONFIG_KEY = "starnet.waCloud";
const STATUS_KEY = "starnet.waCloudStatus";
export const CLOUD_EVENT = "starnet:wa-cloud";

export function loadCloudConfig(): CloudConfig | null {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? ({ ...newCloudConfig(), ...(JSON.parse(raw) as Partial<CloudConfig>) } as CloudConfig) : null;
  } catch {
    return null;
  }
}

export function saveCloudConfig(c: CloudConfig): void {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  window.dispatchEvent(new Event(CLOUD_EVENT));
}

export interface CloudStatus {
  at: number;
  ok: boolean;
  text: string;
}

export function loadCloudStatus(): CloudStatus | null {
  try {
    return JSON.parse(window.localStorage.getItem(STATUS_KEY) ?? "null") as CloudStatus | null;
  } catch {
    return null;
  }
}

function setStatus(ok: boolean, text: string): void {
  try {
    window.localStorage.setItem(STATUS_KEY, JSON.stringify({ at: Date.now(), ok, text }));
  } catch {
    // only a status line
  }
  window.dispatchEvent(new Event(CLOUD_EVENT));
}

const base = (c: CloudConfig) => c.url.trim().replace(/\/+$/, "");

async function post(c: CloudConfig, path: string, body: unknown): Promise<Response> {
  const sealed = await sealText(JSON.stringify(body), c.packKey);
  return fetch(`${base(c)}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sealed) });
}

/** 🧪 Is the Worker there, with its key, and has it got the pack? */
export async function testCloud(c: CloudConfig): Promise<CloudStatus> {
  try {
    const r = await fetch(`${base(c)}/`, { method: "GET" });
    const v = (await r.json()) as { ok?: boolean; keySet?: boolean; packReady?: boolean; menus?: boolean };
    const text = !v.ok
      ? "الخادم لا يجيب"
      : !v.keySet
        ? "الخادم يعمل لكن PACK_KEY غير مضبوط فيه"
        : !v.packReady
          ? "الخادم يعمل - اضغط «📤 أرسل للخادم»"
          : `✓ الخادم جاهز${v.menus ? " - والقوائم منشورة" : " - القوائم غير منشورة بعد"}`;
    const ok = Boolean(v.ok && v.keySet && v.packReady);
    setStatus(ok, text);
    return { at: Date.now(), ok, text };
  } catch {
    setStatus(false, "لا يصل التطبيق إلى الخادم - تأكد من الرابط");
    return { at: Date.now(), ok: false, text: "لا يصل التطبيق إلى الخادم - تأكد من الرابط" };
  }
}

let lastPack = "";
let lastPackAt = 0;

/** The pack + the Cloud API's settings + the product pictures, sealed, to the Worker (when changed; `force` = now). */
export async function pushCloudPack(force = false): Promise<boolean> {
  const c = loadCloudConfig();
  if (!c?.on || cloudProblems(c).length) return false;
  if (!force && Date.now() - lastPackAt < 60_000) return false;
  lastPackAt = Date.now();
  const menus = loadMenus();
  const images: Record<string, string> = {};
  for (const p of menus.published?.products ?? []) if (p.enabled && p.image) images[p.id] = p.image;
  const pack = { ...JSON.parse(buildPackJson().json), tz: -new Date().getTimezoneOffset(), images, cloud: { token: c.token.trim(), phoneNumberId: c.phoneNumberId.trim(), appSecret: c.appSecret.trim(), verifyToken: c.verifyToken.trim() } };
  const text = JSON.stringify(pack);
  if (!force && text === lastPack) return true;
  try {
    const r = await post(c, "/pack", pack);
    const v = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !v.ok) {
      setStatus(false, `لم يقبل الخادم الإعدادات: ${v.error ?? r.status}`);
      return false;
    }
    lastPack = text;
    setStatus(true, "✓ أُرسلت الإعدادات للخادم");
    return true;
  } catch {
    setStatus(false, "لا يصل التطبيق إلى الخادم");
    return false;
  }
}

let pulling = false;

/** What the Worker did since the last time → the app's stores; then the Worker forgets it. Returns how many. */
export async function pullCloudEvents(): Promise<number> {
  const c = loadCloudConfig();
  if (!c?.on || cloudProblems(c).length || pulling) return 0;
  pulling = true;
  try {
    const r = await post(c, "/events", { limit: 300 });
    if (!r.ok) return 0;
    const list = JSON.parse(await openText((await r.json()) as Sealed, c.packKey)) as CloudEvent[];
    if (!list.length) return 0;
    for (const e of list) {
      if (e.type === "staff_reply") continue;
      if (e.type === "staff_msg") {
        saveHandoffs(addToThread(loadHandoffs(), e.wa, { from: "customer", text: e.text, at: e.at }));
        continue;
      }
      addLog({ at: e.at, name: e.name, question: e.text, reply: e.reply ?? "", handoff: e.type === "handoff" || e.type === "ai_handoff", sent: e.sent === true, ...(e.error ? { error: `☁️ ${e.error}` } : e.type === "ai_silent" ? { error: "🤐 سكت - ينتظر جوابك في «🎓 تدريب الوكيل»" } : {}) });
      if (e.model && (e.input || e.output)) recordSpend({ model: e.model, input: e.input ?? 0, output: e.output ?? 0 });
      if (e.type === "handoff") {
        saveHandoffs(addHandoff(loadHandoffs(), { id: `cloud_${e.id}`, key: e.key, phone: e.wa, wa: e.wa, name: e.name, text: e.text, summary: e.summary ?? "", at: e.at }));
      }
      if (e.type === "ai_handoff" || e.type === "ai_silent") {
        const before = loadQuestions();
        const after = addQuestion(before, { messageId: `cloud_${e.id}`, key: e.key, phone: e.wa, wa: e.wa, name: e.name, text: e.text, at: e.at, agentReply: e.reply ?? "", reason: e.reason ?? "" }, Date.now());
        if (after !== before) saveQuestions(after);
      }
    }
    recordEvents(waCloudEvents(list));
    await post(c, "/ack", { keys: list.map((e) => e.k) });
    return list.length;
  } catch {
    return 0;
  } finally {
    pulling = false;
  }
}

/** A person's reply to a customer of the official number (inside WhatsApp's 24 hours). */
export async function cloudSend(wa: string, text: string, by: string): Promise<{ ok: boolean; error?: string }> {
  const c = loadCloudConfig();
  if (!c?.on || cloudProblems(c).length) return { ok: false, error: "واتساب الرسمي غير مضبوط على هذا الهاتف" };
  try {
    const r = await post(c, "/send", { to: wa, text, by });
    const v = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (v.ok) saveHandoffs(addToThread(loadHandoffs(), wa, { from: "staff", text, at: Date.now(), by }));
    return { ok: v.ok === true, ...(v.error ? { error: v.error } : {}) };
  } catch {
    return { ok: false, error: "لا يصل التطبيق إلى الخادم" };
  }
}

/** «🤖 إعادة المحادثة للوكيل» for a customer of the official number. */
export async function cloudRelease(wa: string): Promise<void> {
  const c = loadCloudConfig();
  if (!c?.on || cloudProblems(c).length) return;
  try {
    await post(c, "/release", { to: wa });
  } catch {
    // the pack's paused list lets him go anyway at the next push
  }
}
