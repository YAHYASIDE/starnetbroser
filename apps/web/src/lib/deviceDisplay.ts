/**
 * 🏷️ A device's name is optional when adding it (his Nov 2 2026 ask «اسم الحساب اجعله غير ضروري»): left empty, the
 * card is named by its email, else its KIT, else «جهاز جديد». Pure.
 */
export function fallbackDeviceName(device: { name?: string; expectedEmail?: string; starlinkAccountEmail?: string; kitNumber?: string }): string {
  return device.name?.trim() || device.expectedEmail?.trim() || device.starlinkAccountEmail?.trim() || device.kitNumber?.trim() || "جهاز جديد";
}
