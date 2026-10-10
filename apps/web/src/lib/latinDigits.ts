/**
 * What a number field holds, in Latin digits: Arabic/Persian digits → 0-9, «٫» or «,» → «.»
 * (a number field never has thousands separators), «٬» and spaces dropped, and anything else that
 * isn't part of a number removed - so "٥٤٨٧٦,٤٨" becomes "54876.48".
 */
export function latinNumberText(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".")
    .replace(/[^0-9.\-]/g, "");
}
