import { describe, expect, it } from "vitest";
import { handoverOutcome, loanOutcome, paymentOutcome, REQUEST_KIND_META } from "./repRequestView";

const money = (v: number, c: string) => `${v.toLocaleString("en-US")} ${c === "SIFA" ? "سيفا" : "أوقية"}`;

describe("📥 the reps' requests, in plain words", () => {
  it("every kind has a badge", () => {
    expect(REQUEST_KIND_META.handover.label).toBe("تسليم مبلغ لك");
    expect(REQUEST_KIND_META.loan.tone).toBe("out");
  });

  it("a handed-over sum says how it will be split", () => {
    expect(handoverOutcome({ toDevices: [{ name: "أخمدو", amount: 2600 }], remainder: 600 }, "SIFA", "🟠 الشخصي", money)).toEqual([
      "💳 2,600 سيفا تسدّد دين جهاز «أخمدو» (من زبائنه)",
      "💼 600 سيفا الباقي في حسابه 🟠 الشخصي",
      "🧾 يُسجَّل كعملية واحدة برقم واحد - لا تتعجّب من الأجزاء",
    ]);
    expect(handoverOutcome({ toDevices: [], remainder: 3200 }, "SIFA", "🟠 الشخصي", money)).toEqual(["💼 3,200 سيفا في حسابه 🟠 الشخصي"]);
  });

  it("a payment: which device, and where the money is", () => {
    expect(paymentOutcome({ amount: 6000, currency: "SIFA", deviceName: "جهاز 1", clientName: "زبون", cashMoved: false, method: "الكاش" }, money)).toEqual([
      "📡 6,000 سيفا تُسجَّل دفعةً على جهاز «جهاز 1» (زبون) - ينقص دين الجهاز",
      "🤝 المبلغ يبقى عند المندوب - يصير عليه حتى يسلّمه",
    ]);
    expect(paymentOutcome({ amount: 1, currency: "SIFA", cashMoved: true, method: "الكاش" }, money)).toEqual(["⚠️ اختر الجهاز أولًا"]);
  });

  it("a loan: sent, then owed", () => {
    expect(loanOutcome({ amount: 10000, currency: "MRU", fromAccount: "🟢 الأوقية", app: "بنكيلي" }, money)).toEqual([
      "📤 ترسل له 10,000 أوقية عبر بنكيلي",
      "🏦 تُسجَّل عليه سلفةً في حساب 🟢 الأوقية",
    ]);
  });
});
