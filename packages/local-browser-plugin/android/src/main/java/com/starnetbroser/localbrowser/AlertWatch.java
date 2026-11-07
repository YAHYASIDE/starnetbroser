package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 🔴🟡 The alerts while the app is closed (his Nov 7 2026 choice «نعم، عبر خدمة الخلفية»): TelegramReplyService's
 * background thread reads, about once a minute, every rep's warnings channel (`starnet/{space}/flags`) and the team's
 * alerts (`starnet/{team}/alerts`, written by the member who made the alert), opens them (AlertCrypto) and shows a
 * phone notification. It never deletes or changes anything - the app takes the warnings when it opens, as before.
 * What the app already saw (it was open) is never announced again. The config (Firebase, the channels' keys) comes
 * from the app (LocalBrowserPlugin#setAlertWatch) and is never logged.
 */
final class AlertWatch {

    private static final String PREFS = "starnet_alert_watch";
    private static final String KEY_CONFIG = "config";
    private static final String KEY_SEEN = "seen";
    private static final String KEY_APP_SEEN = "appSeenUntil";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_REFRESH = "refresh";
    private static final String KEY_EXPIRES = "expires";
    private static final int MAX_SEEN = 400;

    private AlertWatch() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void configure(Context context, String json) {
        SharedPreferences.Editor e = prefs(context).edit();
        if (json == null || json.trim().isEmpty()) e.remove(KEY_CONFIG);
        else e.putString(KEY_CONFIG, json);
        e.apply();
    }

    static boolean isConfigured(Context context) {
        JSONObject c = config(context);
        return c != null && (nonEmpty(c.optJSONArray("channels")) || c.optJSONObject("team") != null || nonEmpty(c.optJSONArray("chats")));
    }

    private static boolean nonEmpty(JSONArray a) {
        return a != null && a.length() > 0;
    }

    private static JSONObject config(Context context) {
        String raw = prefs(context).getString(KEY_CONFIG, null);
        if (raw == null) return null;
        try {
            JSONObject c = new JSONObject(raw);
            return c.optString("apiKey").isEmpty() || c.optString("projectId").isEmpty() ? null : c;
        } catch (JSONException e) {
            return null;
        }
    }

    /** The app is in front: everything up to now it shows itself. */
    static void markAppSeen(Context context) {
        prefs(context).edit().putLong(KEY_APP_SEEN, System.currentTimeMillis()).apply();
    }

    /** One look at every channel; returns how many alerts were announced. Network problems = next time. */
    static int check(Context context) {
        JSONObject c = config(context);
        if (c == null) return 0;
        String token = idToken(context, c.optString("apiKey"));
        if (token == null) return 0;
        long appSeen = prefs(context).getLong(KEY_APP_SEEN, System.currentTimeMillis());
        List<String> seen = loadSeen(context);
        int shown = 0;
        JSONArray channels = c.optJSONArray("channels");
        for (int i = 0; channels != null && i < channels.length(); i++) {
            JSONObject ch = channels.optJSONObject(i);
            if (ch == null) continue;
            for (JSONObject doc : list(c.optString("projectId"), "starnet/" + ch.optString("spaceId") + "/flags", token)) {
                String id = "f:" + doc.optString("id");
                if (seen.contains(id)) continue;
                seen.add(id);
                if (!AlertCrypto.isNewSince(doc.optLong("createdAt"), appSeen)) continue;
                JSONObject flag = openDoc(doc, ch.optString("key"));
                if (flag == null) continue;
                String text = AlertCrypto.repFlagText(flag.optString("level"), ch.optString("repName"), flag.optString("deviceName", "جهاز"), flag.optString("note"));
                if (AppEventNotifier.post(context, text, "/")) shown++;
            }
        }
        JSONObject team = c.optJSONObject("team");
        if (team != null) {
            String me = c.optString("me");
            for (JSONObject doc : list(c.optString("projectId"), "starnet/" + team.optString("spaceId") + "/alerts", token)) {
                String id = "t:" + doc.optString("id");
                if (seen.contains(id)) continue;
                seen.add(id);
                if (!AlertCrypto.isNewSince(doc.optLong("createdAt"), appSeen)) continue;
                JSONObject alert = openDoc(doc, team.optString("key"));
                if (alert == null || me.equals(alert.optString("member"))) continue;
                String text = AlertCrypto.teamFlagText(alert.optString("level"), alert.optString("by"), alert.optString("deviceName", "جهاز"), alert.optString("note"));
                if (AppEventNotifier.post(context, text, "/")) shown++;
            }
        }
        // 💬 the chat: what came after the app was last open, not mine (`mine` = my side: owner / rep; on the team, my member id)
        JSONArray chats = c.optJSONArray("chats");
        String me = c.optString("me");
        for (int i = 0; chats != null && i < chats.length(); i++) {
            JSONObject chat = chats.optJSONObject(i);
            if (chat == null) continue;
            for (JSONObject doc : chatSince(c.optString("projectId"), chat.optString("spaceId"), AlertCrypto.atKey(appSeen - 60_000), token)) {
                String id = "c:" + doc.optString("id");
                if (seen.contains(id)) continue;
                seen.add(id);
                JSONObject m = openDoc(doc, chat.optString("key"));
                if (m == null) continue;
                boolean teamChat = "team".equals(chat.optString("conv"));
                boolean mine = teamChat ? me.equals(m.optString("member")) : chat.optString("mine").equals(m.optString("from", "owner"));
                if (mine || m.optLong("at", 0) < appSeen - 60_000) continue;
                JSONObject device = m.optJSONObject("device");
                String text = AlertCrypto.chatText(m.optString("by"), m.optString("text"), m.has("image"), device == null ? null : device.optString("name"));
                if (AppEventNotifier.post(context, text, "/chat")) shown++;
            }
        }
        saveSeen(context, seen);
        return shown;
    }

    /** The chat documents of a space whose `at` is after `afterKey` (runQuery - only those are read). */
    private static List<JSONObject> chatSince(String projectId, String spaceId, String afterKey, String token) {
        List<JSONObject> out = new ArrayList<>();
        try {
            String url = "https://firestore.googleapis.com/v1/projects/" + enc(projectId) + "/databases/(default)/documents/starnet/" + enc(spaceId) + ":runQuery";
            JSONObject query = new JSONObject()
                .put("from", new JSONArray().put(new JSONObject().put("collectionId", "chat")))
                .put("where", new JSONObject().put("fieldFilter", new JSONObject()
                    .put("field", new JSONObject().put("fieldPath", "at"))
                    .put("op", "GREATER_THAN")
                    .put("value", new JSONObject().put("stringValue", afterKey))))
                .put("limit", 20);
            String body = http("POST", url, token, new JSONObject().put("structuredQuery", query).toString(), "application/json");
            if (body == null) return out;
            JSONArray rows = new JSONArray(body);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject d = rows.optJSONObject(i) == null ? null : rows.optJSONObject(i).optJSONObject("document");
                if (d == null) continue;
                String name = d.optString("name");
                JSONObject fields = d.optJSONObject("fields");
                JSONObject sealed = fields == null ? null : fields.optJSONObject("sealed");
                if (sealed == null) continue;
                JSONObject item = new JSONObject();
                item.put("id", name.substring(name.lastIndexOf('/') + 1));
                item.put("sealed", sealed.optString("stringValue"));
                out.add(item);
            }
        } catch (Exception e) {
            // offline / refused: next round
        }
        return out;
    }

    private static JSONObject openDoc(JSONObject doc, String keyHex) {
        try {
            JSONObject sealed = new JSONObject(doc.optString("sealed"));
            String text = AlertCrypto.open(sealed.optString("iv"), sealed.optString("data"), keyHex);
            return text == null ? null : new JSONObject(text);
        } catch (JSONException e) {
            return null;
        }
    }

    // ---- Firestore REST ----

    private static List<JSONObject> list(String projectId, String path, String token) {
        List<JSONObject> out = new ArrayList<>();
        try {
            StringBuilder url = new StringBuilder("https://firestore.googleapis.com/v1/projects/").append(enc(projectId)).append("/databases/(default)/documents");
            for (String part : path.split("/")) url.append('/').append(enc(part));
            url.append("?pageSize=100");
            String body = http("GET", url.toString(), token, null, null);
            if (body == null) return out;
            JSONArray docs = new JSONObject(body).optJSONArray("documents");
            for (int i = 0; docs != null && i < docs.length(); i++) {
                JSONObject d = docs.optJSONObject(i);
                if (d == null) continue;
                String name = d.optString("name");
                JSONObject fields = d.optJSONObject("fields");
                JSONObject sealed = fields == null ? null : fields.optJSONObject("sealed");
                if (sealed == null) continue;
                JSONObject item = new JSONObject();
                item.put("id", name.substring(name.lastIndexOf('/') + 1));
                item.put("sealed", sealed.optString("stringValue"));
                item.put("createdAt", parseTime(d.optString("createTime")));
                out.add(item);
            }
        } catch (Exception e) {
            // offline / refused: next round
        }
        return out;
    }

    private static long parseTime(String iso) {
        if (iso == null || iso.length() < 19) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(iso.substring(0, 19));
            return d == null ? 0 : d.getTime();
        } catch (Exception e) {
            return 0;
        }
    }

    /** An anonymous Firebase sign-in of its own (refreshed when about to expire). */
    private static String idToken(Context context, String apiKey) {
        SharedPreferences p = prefs(context);
        long now = System.currentTimeMillis();
        String saved = p.getString(KEY_TOKEN, null);
        if (saved != null && p.getLong(KEY_EXPIRES, 0) - 60_000 > now) return saved;
        try {
            String refresh = p.getString(KEY_REFRESH, null);
            if (refresh != null) {
                String body = http("POST", "https://securetoken.googleapis.com/v1/token?key=" + enc(apiKey), null,
                    "grant_type=refresh_token&refresh_token=" + enc(refresh), "application/x-www-form-urlencoded");
                if (body != null) {
                    JSONObject j = new JSONObject(body);
                    return keep(p, j.optString("id_token"), j.optString("refresh_token"), j.optString("expires_in"), now);
                }
            }
            String body = http("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + enc(apiKey), null, "{\"returnSecureToken\":true}", "application/json");
            if (body == null) return null;
            JSONObject j = new JSONObject(body);
            return keep(p, j.optString("idToken"), j.optString("refreshToken"), j.optString("expiresIn"), now);
        } catch (Exception e) {
            return null;
        }
    }

    private static String keep(SharedPreferences p, String token, String refresh, String expiresIn, long now) {
        if (token == null || token.isEmpty()) return null;
        long seconds;
        try {
            seconds = Long.parseLong(expiresIn);
        } catch (NumberFormatException e) {
            seconds = 3600;
        }
        p.edit().putString(KEY_TOKEN, token).putString(KEY_REFRESH, refresh).putLong(KEY_EXPIRES, now + seconds * 1000).apply();
        return token;
    }

    /** The body of a 200 answer, else null. */
    private static String http(String method, String url, String bearer, String body, String contentType) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(20_000);
            if (bearer != null) conn.setRequestProperty("Authorization", "Bearer " + bearer);
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", contentType);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            if (conn.getResponseCode() != 200) return null;
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                return buf.toString("UTF-8");
            }
        } finally {
            conn.disconnect();
        }
    }

    private static String enc(String s) throws java.io.UnsupportedEncodingException {
        return URLEncoder.encode(s == null ? "" : s, "UTF-8").replace("+", "%20");
    }

    // ---- what was announced ----

    private static List<String> loadSeen(Context context) {
        List<String> out = new ArrayList<>();
        String raw = prefs(context).getString(KEY_SEEN, "");
        for (String id : raw.split("\n")) if (!id.isEmpty()) out.add(id);
        return out;
    }

    private static void saveSeen(Context context, List<String> seen) {
        List<String> kept = seen.size() > MAX_SEEN ? seen.subList(seen.size() - MAX_SEEN, seen.size()) : seen;
        prefs(context).edit().putString(KEY_SEEN, android.text.TextUtils.join("\n", kept)).apply();
    }
}
