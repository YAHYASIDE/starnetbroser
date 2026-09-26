"use client";

import Anthropic from "@anthropic-ai/sdk";
import { CapacitorHttp } from "@capacitor/core";
import { AI_PROVIDERS, AiConfig, AiUsage, describeAiError } from "./aiSettings";
import { isRunningInAndroidApp } from "./localBrowser";
import { RECEIPT_PROMPT, RECEIPT_SCHEMA, ReceiptFields, normalizeReceipt } from "./aiReceipt";

/**
 * Talks to Claude straight from the app (the operator's own key; no STAR NET server in between).
 * `dangerouslyAllowBrowser` is the SDK's opt-in for exactly this: the key is the operator's, typed
 * on their own phone, and never shipped inside the APK.
 */

/**
 * fetch() through Android's native HTTP (CapacitorHttp) - used for OpenRouter inside the app so a
 * browser CORS rule on their side can never block the WebView. The answer then arrives in one piece
 * instead of word by word; the SDK parses it exactly the same.
 */
async function nativeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    headers[key] = value;
  });
  let data: unknown;
  if (typeof init?.body === "string") {
    try {
      data = JSON.parse(init.body);
    } catch {
      data = init.body;
    }
  }
  const response = await CapacitorHttp.request({ url, method: init?.method ?? "GET", headers, data, responseType: "text" });
  const body = response.status === 204 || response.status === 304 ? null : typeof response.data === "string" ? response.data : JSON.stringify(response.data ?? "");
  return new Response(body, { status: response.status, headers: response.headers ?? {} });
}

function makeClient(config: AiConfig, maxRetries = 1): Anthropic {
  if (config.provider === "openrouter") {
    return new Anthropic({
      apiKey: null,
      authToken: config.key,
      baseURL: AI_PROVIDERS.openrouter.baseURL,
      dangerouslyAllowBrowser: true,
      maxRetries,
      fetch: isRunningInAndroidApp() ? nativeFetch : undefined,
      defaultHeaders: { "X-Title": "STAR NET" },
    });
  }
  return new Anthropic({ apiKey: config.key, dangerouslyAllowBrowser: true, maxRetries });
}

export interface ChatImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** base64, no "data:" prefix */
  data: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  images?: ChatImage[];
}

export const SYSTEM_PROMPT = `أنت «المساعد الذكي» داخل تطبيق STAR NET، تطبيق يدير به صاحبه تجارة إعادة بيع اشتراكات Starlink في موريتانيا: أجهزة (حسابات Starlink)، زبائن، مندوبون بنسب من الربح، متجر وفواتير، صندوق نقدي، وبطاقة كاش بالدولار يدفع منها لستارلينك.

ستجد بيانات العمل الحالية كاملة بصيغة JSON في رسالة النظام التالية. قواعد مهمة:
- أجب بالعربية دائمًا، بإيجاز ووضوح، بنص عادي بدون Markdown ولا جداول (استعمل أسطرًا قصيرة و • للقوائم).
- اعتمد على البيانات فقط. إذا لم تكن المعلومة موجودة فقل ذلك بوضوح، ولا تخترع أرقامًا أبدًا.
- العملات لا تُخلط: USD و MRU (أوقية) و SIFA وغيرها. اذكر العملة مع كل مبلغ. إذا حوّلت بين العملات فاستعمل exchangeRatesPerUsd وقل إنه تحويل تقريبي بسعر اليوم.
- الربح لا يُحسب إلا بعد الدفع لستارلينك، ويُحسب بتاريخ الدفع (profitDate) لا بتاريخ الشحنة. استعمل profitUsd/profitMru كما هي.
- D تعني أن تكلفة ستارلينك لم تُدفع بعد (دين على صاحب العمل لستارلينك)، وليست دينًا على الزبون. balanceOwedByClient هو ما على الزبون.
- حصة المندوب = repPercent من ربح العملية.
- عندما يطلب منك كتابة رسائل واتساب لزبائن، اكتب كل رسالة بهذا الشكل بالضبط (رقم الهاتف من البيانات، أو اتركه فارغًا إن لم يوجد):
[[whatsapp:رقم_الهاتف|اسم_الزبون]]
نص الرسالة
[[/whatsapp]]
الرسائل مهذبة وقصيرة، تذكر المبلغ بعملته والجهاز، وتبدأ بالسلام.
- إذا أُرسلت لك صورة (إيصال، فاتورة، شاشة Starlink) فاقرأ منها المبالغ والتواريخ والعملة بدقة، وقل بصراحة ما لم تستطع قراءته.
- لا تستطيع تعديل البيانات بنفسك: إذا احتاج الأمر تسجيل عملية فاشرح للمستخدم أين يسجلها في التطبيق.`;

export interface ClaudeReply {
  text: string;
  usage: AiUsage;
  stopReason: string | null;
}

function toMessages(history: ChatTurn[]): Anthropic.MessageParam[] {
  return history.map((turn) => {
    if (turn.role === "assistant" || !turn.images?.length) return { role: turn.role, content: turn.text };
    return {
      role: "user",
      content: [
        ...turn.images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })),
        { type: "text" as const, text: turn.text || "اقرأ هذه الصورة." },
      ],
    };
  });
}

/** Streams one answer. The business snapshot is a cached system block, so follow-up questions in
 * the same conversation re-read it at a tenth of the price. */
export async function askClaude(options: {
  config: AiConfig;
  snapshot: string;
  history: ChatTurn[];
  onText: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<ClaudeReply> {
  const client = makeClient(options.config);
  try {
    const stream = client.messages.stream(
      {
        model: options.config.model,
        max_tokens: 16000,
        system: [
          { type: "text", text: SYSTEM_PROMPT },
          { type: "text", text: `بيانات العمل الحالية (JSON):\n${options.snapshot}`, cache_control: { type: "ephemeral" } },
        ],
        messages: toMessages(options.history),
      },
      { signal: options.signal },
    );
    stream.on("text", (delta) => options.onText(delta));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      return { text: "اعتذر Claude عن الإجابة على هذا الطلب.", usage: final.usage, stopReason: final.stop_reason };
    }
    const text = final.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    return { text, usage: final.usage, stopReason: final.stop_reason };
  } catch (err) {
    throw new Error(aiErrorMessage(err));
  }
}

/** «قراءة من صورة»: reads one receipt into form fields (structured output - always valid JSON). */
export async function readReceipt(config: AiConfig, image: ChatImage): Promise<ReceiptFields> {
  const client = makeClient(config);
  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: RECEIPT_PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("تعذرت قراءة هذه الصورة");
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    try {
      return normalizeReceipt(JSON.parse(text));
    } catch {
      throw new Error("لم يستطع Claude قراءة الإيصال - أدخل القيم يدويًا");
    }
  } catch (err) {
    throw new Error(aiErrorMessage(err));
  }
}

/** Key check for Settings - costs nothing: Anthropic's model info, or OpenRouter's key info. */
export async function testAiKey(config: AiConfig): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (config.provider === "openrouter") {
      const doFetch = isRunningInAndroidApp() ? nativeFetch : fetch;
      const response = await doFetch(`${AI_PROVIDERS.openrouter.baseURL}/v1/key`, { headers: { Authorization: `Bearer ${config.key}` } });
      return response.ok ? { ok: true } : { ok: false, message: describeAiError(response.status) };
    }
    await makeClient(config, 0).models.retrieve(config.model);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}

export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) return "أُوقفت الإجابة";
  if (err instanceof Anthropic.APIConnectionError) return describeAiError(undefined);
  if (err instanceof Anthropic.APIError) return describeAiError(err.status, err.message);
  return err instanceof Error ? err.message : "تعذر الحصول على إجابة";
}
