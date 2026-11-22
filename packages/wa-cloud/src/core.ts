/**
 * 🤖 STAR NET's WhatsApp agent on the official Cloud API (his Nov 22 2026 choice «احترافي، أسرع وأأمن»: a new number for
 * the agent, a Cloudflare Worker). One customer message → the menus (apps/web lib/agentMenus.ts, the same rules as the
 * app and the phone's reader) as WhatsApp's interactive messages (lib/waInteractive.ts), Claude for a typed question,
 * a person when he asks («موظف» / an order) - and every step written as an event the app takes in (its log, «المحوّلون»,
 * «تنتظرك», the statistics). Everything it needs comes from the app's sealed pack. Pure over injected I/O - core.test.ts.
 */

import { menuSelect, menuStep, type MenuDoc, type MenuSettings, type MenuStep } from "../../../apps/web/src/lib/agentMenus";
import { navWord, productOf, waMessages, waPayload, type WaOut } from "../../../apps/web/src/lib/waInteractive";

export interface Turn {
  from: "customer" | "agent";
  text: string;
  at: number;
}

/** What the app sends (sealed) - the same fields as the phone reader's pack, plus the Cloud API's settings. */
export interface Pack {
  apiKey: string;
  model: string;
  system: string;
  schema: Record<string, unknown>;
  business: string;
  payment: string;
  lessons: string;
  catalog: string;
  menu: string;
  facts: Record<string, string>;
  chats: Record<string, Turn[]>;
  open: Record<string, number>;
  menus: MenuDoc | null;
  menuSettings: MenuSettings | null;
  paused: Record<string, number>;
  /** Minutes to add to UTC for the staff's hours (Mauritania / Mali = 0). */
  tz?: number;
  cloud: { token: string; phoneNumberId: string; appSecret: string; verifyToken: string };
  /** Product pictures (data URLs) by product id - served at /img/<id>. */
  images?: Record<string, string>;
}

export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface Deps {
  store: Store;
  now(): number;
  /** POST /<phone-number-id>/messages. */
  sendWa(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
  /** POST https://api.anthropic.com/v1/messages with the pack's key. */
  claude(body: Record<string, unknown>): Promise<{ status: number; text: string }>;
  imageUrl(productId: string): string | null;
}

/** One customer message, as the webhook gives it (normalized). */
export interface Incoming {
  id: string;
  /** The customer's WhatsApp id (international digits). */
  from: string;
  name: string;
  at: number;
  /** What he typed (a caption, or «[رسالة صوتية]» for a voice note). */
  text: string;
  /** The row / button he tapped (its stable id) and its label. */
  tapId?: string;
  tapTitle?: string;
}

export interface AgentEvent {
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

interface ConvState {
  at: string | null;
  lastWelcomeAt: number;
  chat: Turn[];
  pausedUntil?: number;
  /** When Claude handed him to a person (the silence rule: 2 in 24 h). */
  handoffs: number[];
}

const MAX_TURNS = 12;
const DAY = 24 * 3600_000;
const SEEN_TTL = 2 * 24 * 3600;
const STATE_TTL = 30 * 24 * 3600;
const EVENT_TTL = 14 * 24 * 3600;

export function key8(wa: string): string {
  const d = wa.replace(/\D/g, "");
  return d.slice(-8);
}

/** The webhook's messages, normalized (statuses and other changes are ignored). */
export function incomingFrom(body: unknown): Incoming[] {
  const out: Incoming[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const e of entries as { changes?: { value?: Record<string, unknown> }[] }[]) {
    for (const c of e.changes ?? []) {
      const v = c.value ?? {};
      const names = new Map<string, string>();
      for (const ct of (v.contacts as { wa_id?: string; profile?: { name?: string } }[]) ?? []) if (ct.wa_id) names.set(ct.wa_id, ct.profile?.name ?? "");
      for (const m of (v.messages as Record<string, unknown>[]) ?? []) {
        const from = String(m.from ?? "");
        const id = String(m.id ?? "");
        if (!from || !id) continue;
        const at = Number(m.timestamp ?? 0) * 1000 || Date.now();
        const base = { id, from, name: names.get(from) ?? "", at };
        const type = String(m.type ?? "");
        if (type === "text") out.push({ ...base, text: String((m.text as { body?: string })?.body ?? "") });
        else if (type === "interactive") {
          const i = m.interactive as { list_reply?: { id: string; title: string }; button_reply?: { id: string; title: string } };
          const r = i?.list_reply ?? i?.button_reply;
          if (r) out.push({ ...base, text: r.title ?? "", tapId: r.id, tapTitle: r.title });
        } else if (type === "button") {
          const b = m.button as { payload?: string; text?: string };
          out.push({ ...base, text: b?.text ?? "", ...(b?.payload ? { tapId: b.payload, tapTitle: b.text ?? "" } : {}) });
        } else if (type === "audio") out.push({ ...base, text: "[رسالة صوتية]" });
        else {
          const caption = (m[type] as { caption?: string } | undefined)?.caption;
          out.push({ ...base, text: caption ? caption : `[${type === "image" ? "صورة" : type === "document" ? "ملف" : type}]` });
        }
      }
    }
  }
  return out;
}

/** Exactly the app's agentUserText (and the reader's): the order and the words. */
export function userText(pack: Pack, key: string, senderName: string, chat: Turn[], message: string, today: string, section?: string): string {
  const history = chat.length ? chat.map((t) => `${t.from === "customer" ? "Customer" : "STAR NET"}: ${t.text}`).join("\n") : "(no earlier messages)";
  return [
    `Business: ${pack.business}`,
    `How to pay:\n${pack.payment}`,
    pack.facts[key] ?? `Unknown sender (not a registered customer). WhatsApp name: ${senderName || "-"}`,
    ...(pack.lessons ? [`Owner's lessons:\n${pack.lessons}`] : []),
    ...(pack.catalog ? [pack.catalog] : []),
    ...(pack.menu ? [`Owner's menu:\n${pack.menu}`] : []),
    `Today: ${today}`,
    `Conversation so far:\n${history}`,
    ...(section ? [`Customer chose in the menu: ${section}`] : []),
    `Customer's newest message:\n${message}`,
  ].join("\n\n");
}

export interface AiAnswer {
  reply: string;
  handoff: boolean;
  reason: string;
  input: number;
  output: number;
  error?: string;
}

export function parseClaude(status: number, text: string): AiAnswer {
  const fail = (error: string): AiAnswer => ({ reply: "", handoff: true, reason: "", input: 0, output: 0, error });
  let r: { stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number }; content?: { type: string; text?: string }[]; error?: { message?: string } };
  try {
    r = JSON.parse(text);
  } catch {
    return fail("جواب غير مفهوم من Claude");
  }
  if (status === 401) return fail("مفتاح Claude غير صحيح");
  if (status === 429) return fail("طلبات كثيرة على Claude");
  if (status < 200 || status >= 300) return fail(/credit|balance|billing/i.test(r.error?.message ?? "") ? "رصيد حساب Claude انتهى" : `خطأ من Claude (${status})`);
  if (r.stop_reason === "refusal") return fail("رفض Claude هذا الطلب");
  const t = r.content?.find((b) => b.type === "text")?.text;
  try {
    const v = JSON.parse(t ?? "") as { reply?: string; handoff?: boolean; reason?: string };
    const reply = (v.reply ?? "").trim();
    if (!reply) return fail("جواب فارغ من Claude");
    return { reply, handoff: v.handoff === true, reason: v.reason ?? "", input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 };
  } catch {
    return fail("جواب غير مفهوم من Claude");
  }
}

function minutesOfDay(now: number, tz = 0): number {
  const d = new Date(now + tz * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

async function loadState(store: Store, wa: string): Promise<ConvState> {
  try {
    const raw = await store.get(`st:${wa}`);
    const s = raw ? (JSON.parse(raw) as Partial<ConvState>) : {};
    return { at: s.at ?? null, lastWelcomeAt: s.lastWelcomeAt ?? 0, chat: Array.isArray(s.chat) ? s.chat : [], handoffs: Array.isArray(s.handoffs) ? s.handoffs : [], ...(s.pausedUntil ? { pausedUntil: s.pausedUntil } : {}) };
  } catch {
    return { at: null, lastWelcomeAt: 0, chat: [], handoffs: [] };
  }
}

export async function writeEvent(store: Store, e: AgentEvent): Promise<void> {
  await store.put(`ev:${String(e.at).padStart(13, "0")}:${e.id}`, JSON.stringify(e), EVENT_TTL);
}

async function sendAll(deps: Deps, to: string, outs: WaOut[]): Promise<{ sent: boolean; error?: string }> {
  for (const o of outs) {
    const r = await deps.sendWa(waPayload(to, o));
    if (!r.ok) return { sent: false, error: r.error ?? "تعذّر الإرسال" };
  }
  return { sent: outs.length > 0 };
}

const turnsWith = (chat: Turn[], ...t: Turn[]) => [...chat, ...t].slice(-MAX_TURNS);

/** One customer message, start to end. Never throws on a bad message - it becomes an event. */
export async function handleIncoming(pack: Pack, msg: Incoming, deps: Deps): Promise<void> {
  const { store } = deps;
  if (await store.get(`seen:${msg.id}`)) return; // 🔁 Meta delivers a webhook again: never answered twice
  await store.put(`seen:${msg.id}`, "1", SEEN_TTL);
  const now = deps.now();
  const key = key8(msg.from);
  const state = await loadState(store, msg.from);
  const ev = (e: Partial<AgentEvent> & Pick<AgentEvent, "type">): AgentEvent => ({ id: msg.id, at: now, key, wa: msg.from, name: msg.name, text: msg.text, ...e });
  const save = async () => store.put(`st:${msg.from}`, JSON.stringify(state), STATE_TTL);
  // ✓✓ read, at once (best effort)
  await deps.sendWa({ messaging_product: "whatsapp", status: "read", message_id: msg.id }).catch(() => undefined);

  // 👨‍💼 a person has him: the agent is silent, the app shows his message in «المحوّلون»
  if ((state.pausedUntil ?? 0) > now || (pack.paused[key] ?? 0) > now) {
    state.chat = turnsWith(state.chat, { from: "customer", text: msg.text, at: msg.at });
    await save();
    await writeEvent(store, ev({ type: "staff_msg" }));
    return;
  }

  const doc = pack.menus;
  const settings = pack.menuSettings;
  const minutes = minutesOfDay(now, pack.tz ?? 0);
  let step: MenuStep = { kind: "ai", state: { at: state.at, lastWelcomeAt: state.lastWelcomeAt } };
  let order: string | null = null;
  if (doc && settings) {
    const cur = { at: state.at, lastWelcomeAt: state.lastWelcomeAt };
    const product = msg.tapId ? productOf(doc, msg.tapId) : null;
    if (product) order = product.name;
    else if (msg.tapId && navWord(msg.tapId)) step = menuStep(doc, settings, cur, navWord(msg.tapId)!, now, minutes, pack.payment);
    else if (msg.tapId) step = menuSelect(doc, settings, cur, msg.tapId, minutes, pack.payment) ?? menuStep(doc, settings, cur, msg.text, now, minutes, pack.payment);
    else step = menuStep(doc, settings, cur, msg.text, now, minutes, pack.payment);
  }

  // 🛒 an order from the product cards: a person completes it (never automatic)
  if (order !== null) {
    const text = `🛒 تم تسجيل طلبك: ${order}\nسيتواصل معك موظف STAR NET لإكمال الطلب 🙏`;
    const r = await sendAll(deps, msg.from, [{ type: "text", text }]);
    state.pausedUntil = now + (settings?.handoffHours ?? 24) * 3600_000;
    state.chat = turnsWith(state.chat, { from: "customer", text: `أريد طلب ${order}`, at: msg.at }, { from: "agent", text, at: now });
    await save();
    await writeEvent(store, ev({ type: r.sent ? "handoff" : "send_fail", node: msg.tapId, text: `أريد طلب ${order}`, reply: text, sent: r.sent, error: r.error, summary: summary(state.chat), ms: deps.now() - msg.at }));
    return;
  }

  state.at = step.state.at;
  state.lastWelcomeAt = step.state.lastWelcomeAt;

  if (step.kind === "reply" || step.kind === "handoff") {
    const outs = doc ? waMessages(doc, step, deps.imageUrl) : [{ type: "text" as const, text: step.text }];
    const r = await sendAll(deps, msg.from, outs);
    state.chat = turnsWith(state.chat, { from: "customer", text: msg.text, at: msg.at }, { from: "agent", text: step.text, at: now });
    if (step.kind === "handoff") state.pausedUntil = now + (settings?.handoffHours ?? 24) * 3600_000;
    await save();
    await writeEvent(store, ev({ type: !r.sent ? "send_fail" : step.kind === "handoff" ? "handoff" : "menu", node: step.node, reply: step.text, sent: r.sent, error: r.error, ms: deps.now() - msg.at, ...(step.kind === "handoff" ? { summary: summary(state.chat) } : {}) }));
    return;
  }

  // 🤐 two questions waiting for him (the app's) / handed to him here in 24 h: silent, no Claude cost
  const recent = state.handoffs.filter((t) => now - t < DAY);
  if ((pack.open[key] ?? 0) + recent.length >= 2) {
    state.chat = turnsWith(state.chat, { from: "customer", text: msg.text, at: msg.at });
    await save();
    await writeEvent(store, ev({ type: "ai_silent", reason: "سكت الوكيل: سؤالان قبله بلا جوابك" }));
    return;
  }

  const today = new Date(now).toISOString().slice(0, 10);
  const chat = turnsWith(pack.chats[key] ?? [], ...state.chat);
  const user = userText(pack, key, msg.name, chat, msg.text, today, step.topic);
  const res = await deps.claude({
    model: pack.model,
    max_tokens: 4000,
    system: pack.system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema: pack.schema } },
  });
  const a = parseClaude(res.status, res.text);
  if (a.error) {
    const hold = "لحظة من فضلك، سأتأكد وأرد عليك 🙏";
    const r = await sendAll(deps, msg.from, [{ type: "text", text: hold }]);
    state.handoffs = [...recent, now];
    state.chat = turnsWith(state.chat, { from: "customer", text: msg.text, at: msg.at });
    await save();
    await writeEvent(store, ev({ type: "ai_handoff", reply: hold, sent: r.sent, error: a.error, reason: `لم يرد الوكيل: ${a.error}`, ms: deps.now() - msg.at }));
    return;
  }
  const outs = doc ? waMessages(doc, step, deps.imageUrl, a.reply) : [{ type: "text" as const, text: a.reply }];
  const r = await sendAll(deps, msg.from, outs);
  if (a.handoff) state.handoffs = [...recent, now];
  state.chat = turnsWith(state.chat, { from: "customer", text: msg.text, at: msg.at }, ...(r.sent ? [{ from: "agent" as const, text: a.reply, at: now }] : []));
  await save();
  await writeEvent(
    store,
    ev({
      type: !r.sent ? "send_fail" : a.handoff ? "ai_handoff" : "ai_answer",
      reply: a.reply,
      sent: r.sent,
      error: r.error,
      reason: a.reason,
      ms: deps.now() - msg.at,
      model: pack.model,
      input: a.input,
      output: a.output,
    }),
  );
}

/** The last turns, for the person who takes the conversation. */
export function summary(chat: Turn[]): string {
  return chat
    .slice(-6)
    .map((t) => `${t.from === "customer" ? "الزبون" : "الوكيل"}: ${t.text.slice(0, 80)}`)
    .join("\n");
}

/** A person answers from the app («المحوّلون»): text only, inside WhatsApp's 24-hour window. */
export async function staffReply(deps: Deps, to: string, text: string, by: string): Promise<{ ok: boolean; error?: string }> {
  const r = await deps.sendWa(waPayload(to, { type: "text", text }));
  const now = deps.now();
  const state = await loadState(deps.store, to);
  state.chat = turnsWith(state.chat, { from: "agent", text, at: now });
  await deps.store.put(`st:${to}`, JSON.stringify(state), STATE_TTL);
  await writeEvent(deps.store, { id: `staff_${now}`, at: now, key: key8(to), wa: to, name: by, type: r.ok ? "staff_reply" : "send_fail", text, sent: r.ok, ...(r.error ? { error: r.error } : {}) });
  return r;
}

/** «🤖 إعادة المحادثة للوكيل» (or his list's change): the person lets him go. */
export async function release(store: Store, wa: string): Promise<void> {
  const state = await loadState(store, wa);
  delete state.pausedUntil;
  state.handoffs = [];
  await store.put(`st:${wa}`, JSON.stringify(state), STATE_TTL);
}
