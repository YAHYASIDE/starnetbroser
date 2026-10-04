import { describe, expect, it } from "vitest";
import { ADD_EXPENSE_ROUTE, isShortcutRoute, parseAddExpense, phoneShortcut, routePath, shortcutId, shortcutLabel } from "./shortcuts";

describe("📌 home-screen shortcuts", () => {
  it("only in-app routes can be pinned", () => {
    expect(isShortcutRoute("/tools#pay")).toBe(true);
    expect(isShortcutRoute("/?action=sync")).toBe(true);
    expect(isShortcutRoute("//evil.example")).toBe(false);
    expect(isShortcutRoute("https://x.y")).toBe(false);
    expect(isShortcutRoute("javascript:alert(1)")).toBe(false);
    expect(isShortcutRoute("/a b")).toBe(false);
  });

  it("each page gets its own icon and a stable id", () => {
    expect(phoneShortcut("/tools#pay", "💵 دفعة سريعة")).toEqual({ id: "sc_tools_pay", label: "💵 دفعة سريعة", route: "/tools#pay", emoji: "💵", color: "#0e9f6e" });
    expect(phoneShortcut("/tools", "الأدوات")?.emoji).toBe("🧰");
    expect(phoneShortcut("/?action=sync", "مزامنة الآن")?.emoji).toBe("🔄");
    expect(phoneShortcut("/", "الرئيسية")?.emoji).toBe("🏠");
    expect(phoneShortcut("/something-new", "x")?.emoji).toBe("★");
    expect(phoneShortcut("https://x.y", "x")).toBeNull();
    expect(shortcutId("/")).toBe("sc_home");
  });

  it("labels drop badge counts and stay short", () => {
    expect(shortcutLabel("  التذكيرات  3 ")).toBe("التذكيرات");
    expect(shortcutLabel("9+ التذكيرات")).toBe("التذكيرات");
    expect(shortcutLabel("")).toBe("STAR NET");
    expect(shortcutLabel("أ".repeat(40))).toHaveLength(25);
  });

  it("🧾 «إضافة مصروف» can be pinned with its own icon and opens a new expense", () => {
    expect(isShortcutRoute(ADD_EXPENSE_ROUTE)).toBe(true);
    expect(phoneShortcut(ADD_EXPENSE_ROUTE, "إضافة مصروف")).toMatchObject({ id: "sc_reports_add_expense", emoji: "🧾" });
    expect(phoneShortcut("/reports", "التقارير")?.emoji).toBe("📊");
    expect(parseAddExpense(ADD_EXPENSE_ROUTE.slice(ADD_EXPENSE_ROUTE.indexOf("?")))).toBe(true);
    expect(parseAddExpense("?tab=net")).toBe(false);
    expect(routePath(ADD_EXPENSE_ROUTE)).toBe("/reports");
    expect(routePath("/tools#pay")).toBe("/tools");
    expect(routePath("/?q=x")).toBe("/");
  });
});
