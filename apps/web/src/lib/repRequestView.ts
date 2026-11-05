/**
 * 📥 «طلبات المندوبين» made clear (his Nov 5 2026 ask «أريد تطوير واجهة المعاملات التي يرسلها المندوبون» -
 * «غير واضحة»): each card says WHAT it is (a coloured badge), HOW MUCH (large), and WHAT APPROVING WILL DO in
 * plain words - above all how a handed-over sum is split (his customers' devices first, the rest in his account),
 * the reason a «600» he never typed surprised them. Pure.
 */

import type { RepRequestKind } from "./repRequests";

export type RequestTone = "in" | "out" | "info";

export const REQUEST_KIND_META: Record<RepRequestKind, { icon: string; label: string; tone: RequestTone }> = {
  handover: { icon: "🤲", label: "تسليم مبلغ لك", tone: "in" },
  payment: { icon: "💵", label: "دفعة من زبون", tone: "in" },
  loan: { icon: "🏦", label: "طلب سلفة", tone: "out" },
  client: { icon: "➕", label: "زبون جديد", tone: "info" },
  device: { icon: "📱", label: "جهاز جديد", tone: "info" },
  edit: { icon: "✏️", label: "تعديل جهاز", tone: "info" },
  activation: { icon: "⚡", label: "تفعيل", tone: "info" },
  session: { icon: "📋", label: "جلسة Starlink", tone: "info" },
};

type Money = (amount: number, currency: string) => string;

/** 🤲 «عند الموافقة» of a handed-over sum: each device of his customers it pays first, then the rest. */
export function handoverOutcome(
  preview: { toDevices: { name: string; amount: number }[]; remainder: number },
  currency: string,
  accountLabel: string,
  money: Money,
): string[] {
  const lines: string[] = [];
  for (const d of preview.toDevices) lines.push(`💳 ${money(d.amount, currency)} تسدّد دين جهاز «${d.name}» (من زبائنه)`);
  if (preview.remainder > 0.005) lines.push(`💼 ${money(preview.remainder, currency)} ${preview.toDevices.length ? "الباقي " : ""}في حسابه ${accountLabel}`);
  if (preview.toDevices.length) lines.push(`🧾 يُسجَّل كعملية واحدة برقم واحد - لا تتعجّب من الأجزاء`);
  return lines;
}

/** 💵 «عند الموافقة» of a customer's payment he brought. */
export function paymentOutcome(input: { amount: number; currency: string; deviceName?: string; clientName?: string; cashMoved: boolean; method: string }, money: Money): string[] {
  if (!input.deviceName) return ["⚠️ اختر الجهاز أولًا"];
  const who = input.clientName ? ` (${input.clientName})` : "";
  return [
    `📡 ${money(input.amount, input.currency)} تُسجَّل دفعةً على جهاز «${input.deviceName}»${who} - ينقص دين الجهاز`,
    input.cashMoved ? `💰 تدخل ${input.method} الآن` : "🤝 المبلغ يبقى عند المندوب - يصير عليه حتى يسلّمه",
  ];
}

/** 🏦 «عند الموافقة» of a loan. */
export function loanOutcome(input: { amount: number; currency: string; fromAccount?: string; app?: string }, money: Money): string[] {
  return [
    `📤 ترسل له ${money(input.amount, input.currency)}${input.app ? ` عبر ${input.app}` : ""}`,
    `🏦 تُسجَّل عليه سلفةً${input.fromAccount ? ` في حساب ${input.fromAccount}` : " في حسابه"}`,
  ];
}
