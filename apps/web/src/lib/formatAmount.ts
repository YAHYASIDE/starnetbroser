/**
 * Formats a monetary amount for display: exactly 2 decimal places with clear thousands
 * separators (e.g. 45000 -> "45,000.00"). Purely a display concern - every calculation elsewhere
 * keeps full floating-point precision and only ever formats at the very last step, right before
 * rendering.
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
