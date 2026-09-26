/**
 * المساعد الذكي (Claude) - the operator's own Anthropic API key and the model/price constants.
 * The key lives only on this phone (a `starnet.` settings key: never in a backup, never in the
 * repository, never logged) and is sent only to api.anthropic.com.
 */

export const AI_MODEL = "claude-sonnet-5";
export const AI_MODEL_LABEL = "Claude Sonnet 5";

/** USD per million tokens (Claude Sonnet 5): input, output, 5-minute cache write (1.25x input) and
 * cache read (0.1x input). Used only to show the operator what each answer roughly cost. */
export const AI_PRICE_PER_MTOK = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 };

const KEY = "starnet.claudeApiKey";

export function getClaudeApiKey(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setClaudeApiKey(key: string | null): void {
  try {
    if (key === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, key.trim());
  } catch {
    // Storage blocked - the assistant simply stays unconfigured.
  }
}

/** Anthropic API keys start with "sk-ant-" - catches a pasted wrong value before any request. */
export function looksLikeClaudeKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

/** "sk-ant-…a1b2" - enough to recognise the key without showing it. */
export function maskClaudeKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.length <= 12 ? "sk-ant-…" : `sk-ant-…${trimmed.slice(-4)}`;
}

export interface AiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function estimateCostUsd(usage: AiUsage): number {
  const p = AI_PRICE_PER_MTOK;
  const cost =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead;
  return cost / 1_000_000;
}

/** Arabic explanation for a failed request, from its HTTP status and message. */
export function describeAiError(status: number | undefined, message = ""): string {
  if (status === 401) return "مفتاح Claude غير صحيح - تحقق منه في الإعدادات";
  if (status === 403) return "هذا المفتاح لا يملك صلاحية استعمال Claude";
  if (status === 400 && /credit balance/i.test(message)) return "رصيد حسابك في Anthropic غير كافٍ - اشحن من console.anthropic.com ← Billing";
  if (status === 404) return "النموذج غير متاح لهذا المفتاح";
  if (status === 413) return "البيانات أو الصور كبيرة جدًا لسؤال واحد";
  if (status === 429) return "طلبات كثيرة في وقت قصير - انتظر دقيقة ثم أعد المحاولة";
  if (status === 529 || (status !== undefined && status >= 500)) return "خوادم Claude مشغولة الآن - أعد المحاولة بعد قليل";
  if (status === undefined) return "لا يوجد اتصال بالإنترنت أو انقطع الاتصال";
  return `تعذر الحصول على إجابة (${status})`;
}
