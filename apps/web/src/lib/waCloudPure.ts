/**
 * ☁️ «واتساب الرسمي» - the pure parts (lib/waCloud.ts does the I/O): the settings' shape, what is missing, the Worker's
 * events → the statistics' events. Tested in waCloud.test.ts.
 */

import type { AgentEvent } from "./agentDesk";
import { newLinkKey } from "./deviceSyncCrypto";

export interface CloudConfig {
  on: boolean;
  /** https://starnet-wa.<account>.workers.dev */
  url: string;
  /** 64 hex - the same as the Worker's PACK_KEY. */
  packKey: string;
  /** Meta: the permanent access token, the phone number's id, the app's secret, the webhook's verify token. */
  token: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  /** The new number, for his eyes («+222 …»). */
  number: string;
}

export function newCloudConfig(): CloudConfig {
  return { on: false, url: "", packKey: newLinkKey(), token: "", phoneNumberId: "", appSecret: "", verifyToken: newLinkKey().slice(0, 24), number: "" };
}

/** What is missing before the Worker can answer (his words); [] = ready. */
export function cloudProblems(c: CloudConfig): string[] {
  const out: string[] = [];
  if (!/^https:\/\/[^\s/]+/.test(c.url)) out.push("رابط الخادم (يبدأ بـ https://)");
  if (!/^[0-9a-f]{64}$/.test(c.packKey)) out.push("مفتاح الربط");
  if (!c.token.trim()) out.push("مفتاح Meta (Access token)");
  if (!/^\d{6,}$/.test(c.phoneNumberId.trim())) out.push("Phone number ID");
  if (!c.appSecret.trim()) out.push("App secret");
  if (!c.verifyToken.trim()) out.push("Verify token");
  return out;
}

/** One event of the Worker (packages/wa-cloud core.ts AgentEvent) + its storage key. */
export interface CloudEvent {
  k: string;
  id: string;
  at: number;
  key: string;
  wa: string;
  name: string;
  type: "menu" | "handoff" | "ai_answer" | "ai_handoff" | "ai_silent" | "send_fail" | "staff_msg" | "staff_reply";
  text: string;
  node?: string;
  reply?: string;
  sent?: boolean;
  error?: string;
  reason?: string;
  ms?: number;
  model?: string;
  input?: number;
  output?: number;
  summary?: string;
}

/** The Worker's events → the statistics' events (the staff's own messages are not counted). Pure. */
export function waCloudEvents(list: CloudEvent[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const e of list) {
    if (e.type === "staff_msg" || e.type === "staff_reply" || e.type === "ai_silent") continue;
    out.push({
      id: `cloud_${e.id}`,
      at: e.at,
      key: e.key,
      type: e.type,
      ...(e.node ? { node: e.node } : {}),
      ...(e.type.startsWith("ai_") ? { text: e.text.slice(0, 120) } : {}),
      ...(typeof e.ms === "number" ? { ms: e.ms } : {}),
      ...(e.model ? { model: e.model, input: e.input ?? 0, output: e.output ?? 0 } : {}),
    });
  }
  return out;
}
