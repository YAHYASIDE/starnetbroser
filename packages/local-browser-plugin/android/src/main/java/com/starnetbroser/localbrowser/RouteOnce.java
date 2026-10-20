package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;

/**
 * 🔔 A notification's page opens once (his Oct 20 2026 report: «يخرجني من المكان الذي كنت أعمل فيه
 * ويذهب بي إلى مكان البطاقات»). The app opened from a notification keeps that launch intent: when
 * Android kills it in the background (weak phone, other apps) and he comes back, the activity is
 * rebuilt from the SAME intent and its page (a KAST notice's «ستارلينك والبطاقة») opened again in the
 * middle of his work. Each notification's intent carries its own id; an id already opened, or an
 * intent replayed from the recents list, opens nothing. Pure, no android.* - JUnit: RouteOnceTest.
 */
final class RouteOnce {

    /** The extra with the notification's own id. */
    static final String EXTRA_ID = "starnet_route_id";
    /** How many opened ids are remembered. */
    static final int KEEP = 40;

    private RouteOnce() {}

    /** Whether to open `route`: never a replay from recents, never an id already opened. */
    static boolean shouldOpen(String route, String id, boolean fromHistory, List<String> opened) {
        if (route == null || route.isEmpty() || fromHistory) return false;
        return id == null || id.isEmpty() || !opened.contains(id);
    }

    /** The remembered ids with `id` added (newest last, at most KEEP). */
    static List<String> remember(List<String> opened, String id) {
        List<String> next = new ArrayList<>(opened);
        if (id == null || id.isEmpty() || next.contains(id)) return next;
        next.add(id);
        while (next.size() > KEEP) next.remove(0);
        return next;
    }

    static String encode(List<String> ids) {
        return String.join("\n", ids);
    }

    static List<String> decode(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isEmpty()) return out;
        for (String part : raw.split("\n")) if (!part.isEmpty()) out.add(part);
        return out;
    }
}
