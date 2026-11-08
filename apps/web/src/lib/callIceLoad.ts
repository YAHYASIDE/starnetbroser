"use client";

/** 📞 The call relay on this phone (lib/callIce.ts): the setting, the relay's passwords fetched before a call, a test. */

import { CALL_TURN_KEY, cleanIceServers, iceServersFor, parseTurnSetting } from "./callIce";
import { loadRepCopy } from "./repCopy";

/** What was pasted here (or shared by the team), else what the rep's copy brought. */
export function loadCallTurnText(): string {
  try {
    return window.localStorage.getItem(CALL_TURN_KEY) ?? loadRepCopy()?.callTurn ?? "";
  } catch {
    return "";
  }
}

export function saveCallTurnText(text: string): void {
  try {
    if (text.trim()) window.localStorage.setItem(CALL_TURN_KEY, text.trim());
    else window.localStorage.removeItem(CALL_TURN_KEY);
  } catch {
    // storage full
  }
  cached = null;
}

let cached: { at: number; servers: RTCIceServer[] } | null = null;
const CACHE_MS = 20 * 60_000;

/** The private relay's servers (fetched from metered's link, kept 20 min), or null when there is none / it failed. */
export async function privateIceServers(): Promise<RTCIceServer[] | null> {
  const setting = parseTurnSetting(loadCallTurnText());
  if (!setting) return null;
  if (setting.kind === "servers") return setting.servers;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.servers;
  try {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(setting.url, { signal: ctl.signal });
    window.clearTimeout(t);
    if (!r.ok) return null;
    const servers = cleanIceServers(await r.json());
    if (servers.length === 0) return null;
    cached = { at: Date.now(), servers };
    return servers;
  } catch {
    return null;
  }
}

/** Everything a call uses now. */
export async function iceServersNow(): Promise<RTCIceServer[]> {
  return iceServersFor(await privateIceServers());
}

/** 🧪 Does a relay answer? A connection allowed to go through the relay only: a «relay» address within 8 s = it works. */
export async function testRelay(): Promise<{ ok: boolean; text: string }> {
  const own = await privateIceServers();
  const setting = parseTurnSetting(loadCallTurnText());
  if (setting && !own) return { ok: false, text: "✗ الرابط لا يعمل - تأكد أنك نسخته كاملًا من metered.ca" };
  // the test asks the private relay alone when there is one (the public one behind it would hide a dead key)
  const servers = own ? own : iceServersFor(null);
  const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: "relay" });
  try {
    pc.createDataChannel("t");
    const found = new Promise<boolean>((resolve) => {
      pc.onicecandidate = (e) => {
        if (e.candidate && / relay /.test(e.candidate.candidate)) resolve(true);
        if (!e.candidate) resolve(false);
      };
      window.setTimeout(() => resolve(false), 8000);
    });
    await pc.setLocalDescription(await pc.createOffer());
    const ok = await found;
    const which = own ? "خادمك الخاص" : "الخادم المجاني العام";
    return ok ? { ok, text: `✓ ${which} يعمل - المكالمات تمر عبره حين لا يتصل الهاتفان مباشرة` } : { ok, text: `✗ ${which} لا يرد من هذه الشبكة${own ? "" : " - ضع خادمًا خاصًا"}` };
  } catch {
    return { ok: false, text: "✗ تعذّر الاختبار على هذا الهاتف" };
  } finally {
    pc.close();
  }
}
