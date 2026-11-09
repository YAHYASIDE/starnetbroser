/**
 * 🤖 Claude inside STAR NET (his Nov 9 2026 ask «الكلام مع الدعم تلقائيًا… بربطه بك أو بـ ChatGPT»; his choices: Claude,
 * the support page answering by itself, a new support ticket written for him, and an assistant in the chat). The words
 * given to the model and the shapes it must answer in - pure. The calls themselves: lib/claudeClient.ts.
 */

/** What the model knows about a device (from the app - never invented by it). */
export interface DeviceFacts {
  name: string;
  email?: string;
  kit?: string;
  status?: string;
  renewal?: string;
  country?: string;
  balance?: string;
  customer?: string;
  notes?: string;
}

export function factsText(f: DeviceFacts): string {
  const rows: [string, string | undefined][] = [
    ["Device name", f.name],
    ["Account email", f.email],
    ["Starlink KIT", f.kit],
    ["Service status", f.status],
    ["Renewal date", f.renewal],
    ["Country", f.country],
    ["Balance due", f.balance],
    ["Customer (end user)", f.customer],
    ["Operator notes", f.notes],
  ];
  return rows
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `- ${k}: ${v!.trim()}`)
    .join("\n");
}

// ---- 💬 a reply to Starlink support ----

export const SUPPORT_SYSTEM = `You help STAR NET, a small Starlink reseller in Mauritania, answer Starlink customer-support tickets for accounts it manages. You read the ticket conversation and write the next reply from the account holder.

Rules:
- Reply in the language support last wrote in (usually French or English), short, polite and plain.
- Use only the facts given. Never invent dates, payments, serial numbers, addresses or promises.
- Do not include greetings to a named agent unless the agent signed with a name; do not sign with a person's name.
- safe_to_send is false whenever the reply would: share identity documents or card / payment details, accept or ask for a cancellation, refund, transfer of ownership or a plan change, admit fault, answer a question whose answer is not in the facts, or when support's message is unclear. In those cases still draft the best reply, and say why in reason_ar.
- translation_ar: an Arabic translation of support's latest message(s), faithful and complete.
- reason_ar: one short Arabic sentence saying what the reply does (or why it must wait for the operator).`;

export const SUPPORT_SCHEMA = {
  type: "object",
  properties: {
    translation_ar: { type: "string", description: "Arabic translation of support's latest message(s)" },
    reply: { type: "string", description: "The reply to post, in support's language" },
    language: { type: "string", description: "Language of the reply, e.g. fr, en, ar" },
    safe_to_send: { type: "boolean", description: "True only when the reply can be posted without the operator" },
    reason_ar: { type: "string", description: "One short Arabic sentence: what the reply does or why it waits" },
  },
  required: ["translation_ar", "reply", "language", "safe_to_send", "reason_ar"],
  additionalProperties: false,
} as const;

export interface SupportReply {
  translation_ar: string;
  reply: string;
  language: string;
  safe_to_send: boolean;
  reason_ar: string;
}

/** The page's text is long: only its end matters (the latest messages), cut on a line. */
export function lastPart(text: string, max = 12_000): string {
  const t = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= max) return t;
  const cut = t.slice(t.length - max);
  const nl = cut.indexOf("\n");
  return nl >= 0 && nl < 400 ? cut.slice(nl + 1) : cut;
}

export function supportUserText(pageText: string, facts: DeviceFacts): string {
  return `Account facts (from STAR NET's records):\n${factsText(facts) || "- (none)"}\n\nThe support ticket page as shown (oldest first, newest last):\n"""\n${lastPart(pageText)}\n"""\n\nWrite the next reply from the account holder.`;
}

// ---- 🎫 a new ticket ----

export const TICKET_SYSTEM = `You write new Starlink customer-support tickets for STAR NET, a Starlink reseller that manages accounts for its customers. The operator describes the problem in Arabic (sometimes in dialect). Write a clear ticket in the language asked, using only the operator's words and the account facts; never invent details. Keep it short: what is wrong, since when, what was already tried, and what is asked. translation_ar is the ticket translated back to Arabic so the operator can check it.`;

export const TICKET_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    translation_ar: { type: "string" },
  },
  required: ["subject", "body", "translation_ar"],
  additionalProperties: false,
} as const;

export interface SupportTicket {
  subject: string;
  body: string;
  translation_ar: string;
}

export function ticketUserText(problemAr: string, facts: DeviceFacts, language: "fr" | "en"): string {
  return `Ticket language: ${language === "fr" ? "French" : "English"}\n\nAccount facts:\n${factsText(facts) || "- (none)"}\n\nThe operator's description (Arabic):\n"""\n${problemAr.trim()}\n"""`;
}

// ---- 🤖 the assistant in the chat ----

export const ASSISTANT_SYSTEM = `You are «المساعد», the assistant inside STAR NET - the Android app a small Starlink reseller in Mauritania uses to run devices (Starlink accounts), customers, representatives (reps) and money. You answer the operator in Arabic, briefly, from the app's data reached through your tools; when the data does not say, say so - never guess numbers, names or dates. Money is per currency (أوقية MRU, سيفا SIFA/FCFA, دولار USD) and is never added across currencies. You only read: you cannot change records, send money or messages; if he asks for a change, tell him where in the app to do it.`;

/** Parses the model's JSON answer; null when it isn't the shape asked. */
export function parseJsonAnswer<T>(text: string, keys: readonly string[]): T | null {
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    return v && typeof v === "object" && keys.every((k) => k in v) ? (v as T) : null;
  } catch {
    return null;
  }
}
