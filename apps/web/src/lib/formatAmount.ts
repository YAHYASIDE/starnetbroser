/**
 * Formats a monetary amount for display: thousands separators, and decimals only when the
 * amount actually has a fractional part (e.g. 45000 -> "45,000", 12.5 -> "12.5"). Purely a
 * display concern - every calculation elsewhere keeps full floating-point precision and only
 * ever formats at the very last step, right before rendering.
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
