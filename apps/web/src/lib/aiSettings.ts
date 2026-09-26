/**
 * المساعد الذكي (Claude) - the operator's own Anthropic API key and the model/price constants.
 * The key lives only on this phone (a `starnet.` settings key: never in a backup, never in the
 * repository, never logged) and is sent only to api.anthropic.com.
 */

/**
 * Two ways to reach the same Claude Sonnet 5:
 * - "anthropic": Anthropic's own API (paid by bank card at console.anthropic.com).
 * - "openrouter": OpenRouter's Anthropic-compatible endpoint (credits payable in crypto, e.g. USDC)
 *   - for when local bank cards are refused.
 */
export type AiProvider = "anthropic" | "openrouter";

export const AI_PROVIDERS: Record<AiProvider, { label: string; model: string; baseURL?: string; keyPrefix: string; keysUrl: string }> = {
  anthropic: { label: "Anthropic (بطاقة بنكية)", model: "claude-sonnet-5", keyPrefix: "sk-ant-", keysUrl: "console.anthropic.com" },
  openrouter: {
    label: "OpenRouter (عملات رقمية)",
    model: "anthropic/claude-sonnet-5",
    baseURL: "https://openrouter.ai/api",
    keyPrefix: "sk-or-",
    keysUrl: "openrouter.ai/settings/keys",
  },
};

export const AI_MODEL = AI_PROVIDERS.anthropic.model;
export const AI_MODEL_LABEL = "Claude Sonnet 5";

/** USD per million tokens (Claude Sonnet 5): input, output, 5-minute cache write (1.25x input) and
 * cache read (0.1x input). Used only to show the operator what each answer roughly cost. */
export const AI_PRICE_PER_MTOK = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 };

const PROVIDER_KEY = "starnet.aiProvider";
const KEY_STORAGE: Record<AiProvider, string> = { anthropic: "starnet.claudeApiKey", openrouter: "starnet.openrouterApiKey" };

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked - the assistant simply stays unconfigured.
  }
}

export function getAiProvider(): AiProvider {
  return read(PROVIDER_KEY) === "openrouter" ? "openrouter" : "anthropic";
}

export function setAiProvider(provider: AiProvider): void {
  write(PROVIDER_KEY, provider);
}

export function getAiKey(provider: AiProvider): string | null {
  return read(KEY_STORAGE[provider]);
}

export function setAiKey(provider: AiProvider, key: string | null): void {
  write(KEY_STORAGE[provider], key === null ? null : key.trim());
}

export interface AiConfig {
  provider: AiProvider;
  key: string;
  model: string;
}

/** The provider chosen in Settings, with its key - null until a key is saved for it. */
export function getAiConfig(): AiConfig | null {
  const provider = getAiProvider();
  const key = getAiKey(provider);
  return key ? { provider, key, model: AI_PROVIDERS[provider].model } : null;
}

/** Kept for the Anthropic-only callers and tests. */
export function getClaudeApiKey(): string | null {
  return getAiKey("anthropic");
}

export function setClaudeApiKey(key: string | null): void {
  setAiKey("anthropic", key);
}

/** Catches a pasted wrong value before any request: Anthropic keys start "sk-ant-", OpenRouter "sk-or-". */
export function looksLikeAiKey(provider: AiProvider, key: string): boolean {
  const trimmed = key.trim();
  const prefix = AI_PROVIDERS[provider].keyPrefix;
  return trimmed.startsWith(prefix) && /^[A-Za-z0-9_-]{20,}$/.test(trimmed.slice(prefix.length));
}

export function looksLikeClaudeKey(key: string): boolean {
  return looksLikeAiKey("anthropic", key);
}

/** "sk-ant-…a1b2" - enough to recognise the key without showing it. */
export function maskAiKey(key: string): string {
  const trimmed = key.trim();
  const prefix = trimmed.startsWith("sk-or-") ? "sk-or-" : "sk-ant-";
  return trimmed.length <= 12 ? `${prefix}…` : `${prefix}…${trimmed.slice(-4)}`;
}

export const maskClaudeKey = maskAiKey;

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
  if (status === 402) return "رصيد OpenRouter غير كافٍ - اشحن من openrouter.ai ← Credits";
  if (status === 404) return "النموذج غير متاح لهذا المفتاح";
  if (status === 413) return "البيانات أو الصور كبيرة جدًا لسؤال واحد";
  if (status === 429) return "طلبات كثيرة في وقت قصير - انتظر دقيقة ثم أعد المحاولة";
  if (status === 529 || (status !== undefined && status >= 500)) return "خوادم Claude مشغولة الآن - أعد المحاولة بعد قليل";
  if (status === undefined) return "لا يوجد اتصال بالإنترنت أو انقطع الاتصال";
  return `تعذر الحصول على إجابة (${status})`;
}
