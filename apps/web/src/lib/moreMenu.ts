/**
 * «المزيد» at the top of the home page repeats nothing that is already at the bottom (his Oct 10 2026
 * request: «ايقونات المزيد فيهم أشياء مكررة… أزل أي شيء في الفوق يكون في السفلي، اتركه»): a top item
 * whose page is a bottom-bar tab or in the bottom «المزيد» is left out. Pure.
 */

export function withoutBottomDuplicates<T>(top: T[], bottomHrefs: string[], hrefOf: (item: T) => string | undefined): T[] {
  const bottom = new Set(bottomHrefs);
  return top.filter((item) => {
    const href = hrefOf(item);
    return !href || !bottom.has(href);
  });
}
