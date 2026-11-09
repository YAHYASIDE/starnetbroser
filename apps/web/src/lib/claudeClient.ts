"use client";

/**
 * 🤖 The calls to Claude (lib/claudeAssist.ts holds the words). His own Anthropic API key, pasted once in Settings
 * («🤖 مساعد Claude», `starnet.claudeKey`) - kept on this phone only: never in the code, the backup, the team link or a
 * rep's copy. The app talks to the API directly (no server of our own - his Nov 9 2026 choice), so the key lives on his
 * phone the way his bot tokens do. Model: Claude Opus 5.5; a declined request falls back server-side ("default").
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { parseJsonAnswer } from "./claudeAssist";

const KEY = "starnet.claudeKey";
export const CLAUDE_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function loadClaudeKey(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveClaudeKey(key: string): void {
  try {
    if (key.trim()) window.localStorage.setItem(KEY, key.trim());
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage full
  }
}

export function hasClaudeKey(): boolean {
  return /^sk-ant-/.test(loadClaudeKey());
}

function client(): Anthropic {
  return new Anthropic({ apiKey: loadClaudeKey(), dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120_000 });
}

export type ClaudeResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** What went wrong, in his words. */
function failure(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "مفتاح Claude غير صحيح - تأكد منه في الإعدادات";
  if (err instanceof Anthropic.PermissionDeniedError) return "المفتاح لا يملك صلاحية - تحقق من حسابك في console.anthropic.com";
  if (err instanceof Anthropic.RateLimitError) return "طلبات كثيرة - انتظر دقيقة وأعد";
  if (err instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(err.message)) return "رصيد حساب Claude انتهى - اشحنه في console.anthropic.com";
  if (err instanceof Anthropic.APIConnectionError) return "لا اتصال بالإنترنت";
  if (err instanceof Anthropic.APIError) return `خطأ من Claude (${err.status ?? "?"})`;
  return "تعذّر الاتصال بـ Claude";
}

/** One question, a JSON answer of the given shape. */
export async function askClaudeJson<T>(input: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  keys: readonly string[];
  effort?: "low" | "medium" | "high";
}): Promise<ClaudeResult<T>> {
  if (!hasClaudeKey()) return { ok: false, message: "ضع مفتاح Claude أولًا: الإعدادات ← 🤖 مساعد Claude" };
  try {
    const message = await client().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      output_config: { effort: input.effort ?? "medium", format: { type: "json_schema", schema: input.schema } },
    });
    if (message.stop_reason === "refusal") return { ok: false, message: "رفض Claude هذا الطلب" };
    if (message.stop_reason === "max_tokens") return { ok: false, message: "الجواب طويل جدًا - أعد المحاولة" };
    const text = message.content.find((b) => b.type === "text");
    const value = text && text.type === "text" ? parseJsonAnswer<T>(text.text, input.keys) : null;
    return value ? { ok: true, value } : { ok: false, message: "جواب غير مفهوم من Claude - أعد المحاولة" };
  } catch (err) {
    return { ok: false, message: failure(err) };
  }
}

/** 🧪 «اختبار»: does the key answer? */
export async function testClaudeKey(): Promise<ClaudeResult<string>> {
  if (!hasClaudeKey()) return { ok: false, message: "المفتاح يبدأ بـ sk-ant-" };
  try {
    const message = await client().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "قل «جاهز» فقط." }],
    });
    const text = message.content.find((b) => b.type === "text");
    return { ok: true, value: text && text.type === "text" ? text.text.trim() : "جاهز" };
  } catch (err) {
    return { ok: false, message: failure(err) };
  }
}

export interface AssistantTool {
  name: string;
  description: string;
  schema: { type: "object"; properties: Record<string, { type: "string" | "number" | "boolean"; description?: string }>; required?: string[]; additionalProperties?: boolean };
  run: (input: Record<string, unknown>) => Promise<string> | string;
}

/** 🤖 The assistant: the conversation so far + read-only tools over the app's data; the final answer's text. */
export async function askAssistant(system: string, history: { role: "user" | "assistant"; text: string }[], tools: AssistantTool[]): Promise<ClaudeResult<string>> {
  if (!hasClaudeKey()) return { ok: false, message: "ضع مفتاح Claude أولًا: الإعدادات ← 🤖 مساعد Claude" };
  try {
    const runner = client().beta.messages.toolRunner({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      max_iterations: 8,
      system,
      output_config: { effort: "medium" },
      tools: tools.map((t) =>
        betaTool({
          name: t.name,
          description: t.description,
          inputSchema: t.schema,
          run: async (args) => {
            try {
              return await t.run((args ?? {}) as Record<string, unknown>);
            } catch {
              return "تعذّر قراءة هذه البيانات.";
            }
          },
        }),
      ),
      messages: history.map((m) => ({ role: m.role, content: m.text })),
    });
    const final = await runner.runUntilDone();
    if (final.stop_reason === "refusal") return { ok: false, message: "رفض Claude هذا الطلب" };
    const text = final.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    return text ? { ok: true, value: text } : { ok: false, message: "لم يصل جواب - أعد السؤال" };
  } catch (err) {
    return { ok: false, message: failure(err) };
  }
}
