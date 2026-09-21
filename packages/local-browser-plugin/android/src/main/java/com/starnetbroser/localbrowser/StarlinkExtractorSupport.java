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
 * Loading the bundled extractor script and parsing its result is identical whether the caller is
 * AccountBrowserActivity (a visible, user-initiated "تحديث من Starlink" tap) or AutoSyncWorker (a
 * background, unattended periodic run) - both inject the exact same asset into the exact same
 * kind of isolated per-account WebView and get back the exact same JSON-encoded string. Shared
 * here so the two never drift out of sync with each other.
 */
final class StarlinkExtractorSupport {

    private static volatile String cachedExtractorScript;

    private StarlinkExtractorSupport() {
    }

    /** The bundled extractor script, appended with the statement that yields its own result. */
    static String loadExecutableScript(Context context) throws IOException {
        return loadExtractorScript(context) + "\n__starnetSyncResult;";
    }

    private static String loadExtractorScript(Context context) throws IOException {
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
}
