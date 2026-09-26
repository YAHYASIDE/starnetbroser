package com.starnetbroser.localbrowser;

import android.content.Context;
import com.getcapacitor.JSObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONTokener;

/**
 * Loading the bundled script and parsing its result is identical whether the caller is
 * AccountBrowserActivity (a visible, user-initiated "تحديث من Starlink" tap) or AutoSyncWorker (a
 * background, unattended periodic run) - both inject the exact same asset into the exact same
 * kind of isolated per-account WebView and get back the exact same JSON-encoded string. Shared
 * here so the two never drift out of sync with each other.
 *
 * The bundle itself (see injectedScript.ts) only ever DEFINES a handful of `__starnet*` functions
 * on globalThis and runs nothing on its own - every method below appends the one trailing
 * statement that actually invokes a given step (extract the current page, or one of the Stage-2
 * navigation taps in navigation.ts), so a single multi-page sync re-injects the same cached bundle
 * text several times, once per step, each time with a different trailing call.
 */
final class StarlinkExtractorSupport {

    private static volatile String cachedExtractorScript;

    private StarlinkExtractorSupport() {
    }

    /** Reads whatever section of the page is currently open (Stage 1) - the result is a
     * JSON-encoded fields object, parsed with parseExtractedFields. */
    static String loadExtractScript(Context context) throws IOException {
        return loadBundle(context) + "\n__starnetExtract();";
    }

    /** Clicks the `index`th icon (0-based, top to bottom) in the account portal's own right-edge
     * icon rail (see navigation.ts's own doc - e.g. index 1 opens "الاشتراكات", index 3 opens
     * "فوترة"). The result is a bare boolean, parsed with parseBooleanResult. */
    static String loadClickIconRailItemScript(Context context, int index) throws IOException {
        return loadBundle(context) + "\n__starnetClickIconRailItem(" + index + ");";
    }

    /** Clicks the account's first subscription row on the "الاشتراكات" list page. Boolean result. */
    static String loadClickFirstSubscriptionRowScript(Context context) throws IOException {
        return loadBundle(context) + "\n__starnetClickFirstSubscriptionRow();";
    }

    /** Expands the "الأجهزة" accordion (confirmed always collapsed by default) on the "الاشتراك"
     * detail page, so its device status dots actually render for the next extract step to find.
     * Boolean result. */
    static String loadExpandDevicesSectionScript(Context context) throws IOException {
        return loadBundle(context) + "\n__starnetExpandDevicesSection();";
    }

    private static String loadBundle(Context context) throws IOException {
        String cached = cachedExtractorScript;
        if (cached != null) {
            return cached;
        }
        StringBuilder builder = new StringBuilder();
        try (
            InputStream input = context.getAssets().open("starlinkExtractor.js");
            BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
        }
        String script = builder.toString();
        cachedExtractorScript = script;
        return script;
    }

    /**
     * WebView#evaluateJavascript hands back a JSON-encoded string (e.g. a literal newline comes
     * back as the two characters \ and n) - org.json (built into Android since API 1, no extra
     * dependency) decodes that encoding first, then parses the resulting JSON text itself.
     */
    static JSObject parseExtractedFields(String evaluateJavascriptResult) {
        if (evaluateJavascriptResult == null || "null".equals(evaluateJavascriptResult)) {
            return null;
        }
        try {
            Object unquoted = new JSONTokener(evaluateJavascriptResult).nextValue();
            if (!(unquoted instanceof String) || ((String) unquoted).isEmpty()) {
                return null;
            }
            return new JSObject((String) unquoted);
        } catch (JSONException e) {
            return null;
        }
    }

    /** evaluateJavascript's completion value for a JS `true`/`false` return is the bare literal
     * string "true"/"false" (never quoted like a string result) - anything else (null, "undefined",
     * a thrown-away value) is treated as false, never as an error to propagate. */
    static boolean parseBooleanResult(String evaluateJavascriptResult) {
        return "true".equals(evaluateJavascriptResult);
    }
}
