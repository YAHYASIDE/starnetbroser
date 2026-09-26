"use client";

import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, AiUsage, describeAiError } from "./aiSettings";
import { RECEIPT_PROMPT, RECEIPT_SCHEMA, ReceiptFields, normalizeReceipt } from "./aiReceipt";

/**
 * Talks to Claude straight from the app (the operator's own key; no STAR NET server in between).
 * `dangerouslyAllowBrowser` is the SDK's opt-in for exactly this: the key is the operator's, typed
 * on their own phone, and never shipped inside the APK.
 */

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
  apiKey: string;
  snapshot: string;
  history: ChatTurn[];
  onText: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<ClaudeReply> {
  const client = new Anthropic({ apiKey: options.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const stream = client.messages.stream(
      {
        model: AI_MODEL,
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
export async function readReceipt(apiKey: string, image: ChatImage): Promise<ReceiptFields> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: AI_MODEL,
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

/** Cheap key check for Settings: reading the model's info costs nothing. */
export async function testClaudeKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 }).models.retrieve(AI_MODEL);
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
