import { francHint } from "@/lib/payCurrency";

/** 🟠 Under an amount typed for أورانج / نيتا: «10,000 فرانك = 2,000 سيفا» (lib/payCurrency.ts). */
export function FrancHint({ amount, where }: { amount: string | number; where?: string }) {
  const value = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  return <p className="settings-hint franc-hint">🟠 {francHint(value, where)}</p>;
}

/** Stands in for the currency select when the amount is in فرانك. */
export function FrancUnit() {
  return <span className="search-input franc-unit">🟠 فرانك</span>;
}
