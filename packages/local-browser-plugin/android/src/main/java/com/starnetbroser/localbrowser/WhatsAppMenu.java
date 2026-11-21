package com.starnetbroser.localbrowser;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 🗂️ STAR NET's customer-service menus in the phone's reader (his Nov 21 2026 brief) - the same rules and the same
 * words as the app's apps/web lib/agentMenus.ts (menuStep / renderMenu), so a menu works with the app closed and costs
 * no Claude call: a number opens a section or an item, «0» / a keyword the main menu, «رجوع» the section above,
 * «موظف» a person; a greeting starts a new conversation with the welcome. Pure, no android.* - JUnit: WhatsAppMenuTest.
 */
final class WhatsAppMenu {

    private WhatsAppMenu() {}

    static final String NAV_LINE = "0️⃣ 🏠 الرئيسية · «رجوع» ↩️ · «موظف» 👨‍💼";
    static final String MENU_HINT = "اكتب 0 لعرض قائمة خدمات STAR NET 👇";
    private static final String[] DIGITS = {"1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"};
    private static final String[] GREETINGS = {"سلام", "السلام", "مرحبا", "مرحبًا", "اهلا", "أهلا", "هلا", "صباح", "مساء", "bonjour", "salut", "salam", "hello", "hi", "bonsoir", "slm"};

    /** One step: kind "reply" / "ai" / "handoff", its text (reply, handoff) or topic / suffix (ai), and the new state. */
    static final class Step {
        String kind;
        String text = "";
        String topic = "";
        String suffix = "";
        String node = "";
        String at;
        long lastWelcomeAt;
    }

    static List<JSONObject> children(JSONObject doc, String parentId, boolean onlyEnabled) {
        List<JSONObject> out = new ArrayList<>();
        JSONArray nodes = doc.optJSONArray("nodes");
        if (nodes == null) return out;
        for (int i = 0; i < nodes.length(); i++) {
            JSONObject n = nodes.optJSONObject(i);
            if (n == null) continue;
            String p = n.isNull("parentId") ? null : n.optString("parentId", null);
            boolean same = parentId == null ? p == null : parentId.equals(p);
            if (same && (!onlyEnabled || n.optBoolean("enabled", true))) out.add(n);
        }
        return out;
    }

    static JSONObject find(JSONObject doc, String id) {
        if (id == null) return null;
        JSONArray nodes = doc.optJSONArray("nodes");
        if (nodes == null) return null;
        for (int i = 0; i < nodes.length(); i++) {
            JSONObject n = nodes.optJSONObject(i);
            if (n != null && id.equals(n.optString("id"))) return n;
        }
        return null;
    }

    static String renderMenu(JSONObject doc, String parentId) {
        List<JSONObject> items = children(doc, parentId, true);
        StringBuilder sb = new StringBuilder();
        if (parentId != null) {
            JSONObject p = find(doc, parentId);
            String head = ((p == null ? "" : p.optString("icon", "")) + " " + (p == null ? "" : p.optString("title", ""))).replaceAll("^\\s+", "");
            sb.append(head).append("\n\n");
        }
        for (int i = 0; i < Math.min(9, items.size()); i++) {
            if (i > 0) sb.append('\n');
            JSONObject n = items.get(i);
            sb.append(DIGITS[i]).append(' ').append(n.optString("icon", "")).append(' ').append(n.optString("title", ""));
        }
        sb.append("\n\n").append(parentId == null ? "اكتب رقم الخدمة 👆" : NAV_LINE);
        return sb.toString();
    }

    private static String fmt(double n) {
        DecimalFormat f = new DecimalFormat("#,##0.##", DecimalFormatSymbols.getInstance(Locale.US));
        return f.format(n);
    }

    static String renderPrices(JSONObject doc) {
        JSONArray plans = doc.optJSONArray("plans");
        StringBuilder sb = new StringBuilder();
        if (plans != null) for (int i = 0; i < plans.length(); i++) {
            JSONObject p = plans.optJSONObject(i);
            if (p == null || !p.optBoolean("enabled", true)) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append("• ").append(p.optString("name")).append(": ").append(fmt(p.optDouble("price", 0))).append(' ').append(p.optString("currency"));
            if (!p.optString("period").isEmpty()) sb.append(" / ").append(p.optString("period"));
            if (!p.optString("country").isEmpty()) sb.append(" (").append(p.optString("country")).append(')');
            if (!p.optString("details").isEmpty()) sb.append("\n  ").append(p.optString("details"));
        }
        return sb.toString();
    }

    static String renderProducts(JSONObject doc) {
        JSONArray items = doc.optJSONArray("products");
        StringBuilder sb = new StringBuilder();
        if (items != null) for (int i = 0; i < items.length(); i++) {
            JSONObject p = items.optJSONObject(i);
            if (p == null || !p.optBoolean("enabled", true)) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append("• ").append(p.optString("name")).append(": ").append(fmt(p.optDouble("price", 0))).append(' ').append(p.optString("currency"))
                .append(" - ").append(p.optBoolean("available", false) ? "✅ متوفر" : "⏳ غير متوفر الآن");
            if (!p.optString("description").isEmpty()) sb.append("\n  ").append(p.optString("description"));
        }
        return sb.toString();
    }

    static String norm(String s) {
        if (s == null) return "";
        String t = s.trim().toLowerCase(Locale.ROOT).replaceAll("[\\u064B-\\u0652]", "").replaceAll("[إأآ]", "ا");
        StringBuilder sb = new StringBuilder();
        for (char c : t.toCharArray()) sb.append(c >= '٠' && c <= '٩' ? (char) ('0' + (c - '٠')) : c);
        return sb.toString().replaceAll("[!؟?.،,]+$", "").trim();
    }

    static boolean isGreeting(String text) {
        String t = norm(text);
        if (t.isEmpty() || t.length() > 40 || text.contains("؟") || text.contains("?")) return false;
        for (String g : GREETINGS) {
            String n = norm(g);
            if (t.equals(n) || t.startsWith(n + " ") || t.startsWith(n + "م")) return true;
        }
        return false;
    }

    private static int minutes(String hhmm) {
        String[] p = hhmm.split(":");
        try {
            return Integer.parseInt(p[0].trim()) * 60 + (p.length > 1 ? Integer.parseInt(p[1].trim()) : 0);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static boolean inHours(JSONObject settings, int minutesOfDay) {
        int a = minutes(settings.optString("hoursFrom", "08:00"));
        int b = minutes(settings.optString("hoursTo", "22:00"));
        return a <= b ? minutesOfDay >= a && minutesOfDay < b : minutesOfDay >= a || minutesOfDay < b;
    }

    static String handoffText(JSONObject settings, int minutesOfDay) {
        return inHours(settings, minutesOfDay)
            ? "👨‍💼 تم تحويل محادثتك إلى فريق STAR NET، وسيرد عليك موظف في أقرب وقت. اكتب سؤالك هنا 🙏"
            : "👨‍💼 تم تحويل محادثتك إلى فريق STAR NET. أوقات عمل الموظفين من " + settings.optString("hoursFrom", "08:00") + " إلى " + settings.optString("hoursTo", "22:00") + "، وسيرد عليك موظف في أقرب وقت 🙏";
    }

    private static Step reply(String text, String node, String at, long welcome) {
        Step s = new Step();
        s.kind = "reply";
        s.text = text;
        s.node = node == null ? "" : node;
        s.at = at;
        s.lastWelcomeAt = welcome;
        return s;
    }

    private static Step other(String kind, String node, String at, long welcome) {
        Step s = new Step();
        s.kind = kind;
        s.node = node == null ? "" : node;
        s.at = at;
        s.lastWelcomeAt = welcome;
        return s;
    }

    /** The app's menuStep, for the same inputs. `stateAt` / `lastWelcomeAt`: this customer's place. */
    static Step step(JSONObject doc, JSONObject settings, String stateAt, long lastWelcomeAt, String text, long now, int minutesOfDay, String paymentText) throws JSONException {
        String t = norm(text);
        JSONObject open = find(doc, stateAt);
        String at = open != null && open.optBoolean("enabled", true) ? stateAt : null;
        String mode = settings.optString("mode", "auto");
        if ("off".equals(mode)) return other("ai", null, at, lastWelcomeAt);
        if (t.equals("موظف") || t.equals("employe") || t.equals("agent")) {
            Step s = other("handoff", "staff", at, lastWelcomeAt);
            s.text = handoffText(settings, minutesOfDay);
            return s;
        }
        boolean keyword = t.equals("0");
        JSONArray kw = settings.optJSONArray("keywords");
        if (kw != null) for (int i = 0; i < kw.length(); i++) if (norm(kw.optString(i)).equals(t)) keyword = true;
        if (keyword) return reply(renderMenu(doc, null), null, null, lastWelcomeAt);
        if (t.equals("رجوع") || t.equals("retour")) {
            String parent = null;
            if (at != null) {
                JSONObject n = find(doc, at);
                parent = n == null || n.isNull("parentId") ? null : n.optString("parentId", null);
            }
            return reply(renderMenu(doc, parent), parent, parent, lastWelcomeAt);
        }
        if (t.matches("^[1-9]$")) {
            List<JSONObject> items = children(doc, at, true);
            int k = Integer.parseInt(t);
            if (k <= Math.min(9, items.size())) return pick(doc, settings, at, lastWelcomeAt, items.get(k - 1), minutesOfDay, paymentText);
        }
        JSONObject openNode = find(doc, at);
        String topic = openNode == null ? "" : openNode.optString("title", "");
        if ("auto".equals(mode)) {
            boolean due = now - lastWelcomeAt >= (long) (settings.optDouble("welcomeEveryHours", 12) * 3600_000L);
            if (due && isGreeting(text)) return reply(doc.optString("welcome", "") + "\n\n" + renderMenu(doc, null), null, null, now);
            if (due) {
                Step s = other("ai", null, at, now);
                s.topic = topic;
                s.suffix = MENU_HINT;
                return s;
            }
            if (isGreeting(text)) return reply(renderMenu(doc, null), null, null, lastWelcomeAt);
        }
        Step s = other("ai", null, at, lastWelcomeAt);
        s.topic = topic;
        if (at != null) s.suffix = NAV_LINE;
        return s;
    }

    private static Step pick(JSONObject doc, JSONObject settings, String at, long welcome, JSONObject n, int minutesOfDay, String paymentText) {
        String back = "\n\n" + NAV_LINE;
        String id = n.optString("id");
        String title = n.optString("title");
        JSONObject action = n.optJSONObject("action");
        String type = action == null ? "ai" : action.optString("type", "ai");
        switch (type) {
            case "submenu":
                return reply(renderMenu(doc, id), id, id, welcome);
            case "answer":
                return reply(action.optString("text", "") + back, id, at, welcome);
            case "prices": {
                String p = renderPrices(doc);
                if (!p.isEmpty()) return reply("💰 " + title + "\n\n" + p + back, id, at, welcome);
                break;
            }
            case "products": {
                String p = renderProducts(doc);
                if (!p.isEmpty()) return reply("🛰️ " + title + "\n\n" + p + back, id, at, welcome);
                break;
            }
            case "payments":
                if (paymentText != null && !paymentText.trim().isEmpty()) return reply("💳 " + title + "\n\n" + paymentText.trim() + back, id, at, welcome);
                break;
            case "handoff": {
                Step s = other("handoff", id, at, welcome);
                s.text = handoffText(settings, minutesOfDay);
                return s;
            }
            case "ai": {
                Step s = other("ai", id, at, welcome);
                String topic = action.optString("topic", "");
                s.topic = topic.isEmpty() ? title : topic;
                return s;
            }
            default:
                break;
        }
        Step s = other("ai", id, at, welcome);
        s.topic = title;
        return s;
    }
}
