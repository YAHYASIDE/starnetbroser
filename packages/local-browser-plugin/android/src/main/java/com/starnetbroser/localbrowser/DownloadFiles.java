package com.starnetbroser.localbrowser;

import java.util.Locale;

/**
 * ⬇️ Files a page in a device's browser hands out (his Oct 2026 report «لماذا لا يمكنني تنزيل pdf
 * الفاتورة»: Starlink's «Invoice PDF» did nothing - a WebView drops every download unless the app
 * takes it). Starlink builds the PDF inside the page as a {@code blob:} link, which only the page
 * itself can read: {@link #BLOB_HOOK} keeps each blob reachable for a minute even when the page
 * revokes it right after the click, and {@link #readBlobScript} reads it back as a data URL for the
 * app to save. Pure (no android.*) - AccountBrowserActivity does the saving and opening.
 */
final class DownloadFiles {

    private DownloadFiles() {}

    /** The JavaScript bridge name the read-back script reports to. */
    static final String BRIDGE = "StarnetDownload";

    /** Largest file taken (bytes) - an invoice is a few hundred KB. */
    static final int MAX_BYTES = 25 * 1024 * 1024;

    /** Remembers every blob the page creates and delays its revoke, so a click that revokes the
     * link at once can still be read. Idempotent. */
    static final String BLOB_HOOK =
        "(function(){if(window.__starnetBlobHook)return;window.__starnetBlobHook=true;var keep={};"
            + "var create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);"
            + "URL.createObjectURL=function(o){var u=create(o);try{if(o instanceof Blob)keep[u]=o;}catch(e){}return u;};"
            + "URL.revokeObjectURL=function(u){setTimeout(function(){delete keep[u];revoke(u);},60000);};"
            + "window.__starnetBlob=function(u){return keep[u];};})();";

    static boolean isBlob(String url) {
        return url != null && url.startsWith("blob:");
    }

    static boolean isDataUrl(String url) {
        return url != null && url.startsWith("data:");
    }

    /** Reads `blobUrl` in the page and sends it to {@link #BRIDGE}.save(dataUrl, name, mime), or
     * .failed(reason). */
    static String readBlobScript(String blobUrl, String fileName, String mime) {
        String u = jsString(blobUrl), n = jsString(fileName), m = jsString(mime == null ? "" : mime);
        return "(function(){var u=" + u + ";var kept=window.__starnetBlob&&window.__starnetBlob(u);"
            + "(kept?Promise.resolve(kept):fetch(u).then(function(r){return r.blob();}))"
            + ".then(function(b){var fr=new FileReader();fr.onload=function(){" + BRIDGE + ".save(fr.result," + n + ",b.type||" + m + ");};"
            + "fr.onerror=function(){" + BRIDGE + ".failed('read');};fr.readAsDataURL(b);})"
            + ".catch(function(e){" + BRIDGE + ".failed(String(e));});})();";
    }

    /** A JavaScript string literal for `value` (quotes, backslashes and line breaks escaped). */
    static String jsString(String value) {
        StringBuilder out = new StringBuilder("'");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '\'': out.append("\\'"); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '<': out.append("\\x3c"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    else out.append(c);
            }
        }
        return out.append('\'').toString();
    }

    /** The data URL's MIME type and its base64 payload, or null when it isn't base64. */
    static String[] splitDataUrl(String dataUrl) {
        if (!isDataUrl(dataUrl)) return null;
        int comma = dataUrl.indexOf(',');
        if (comma < 0) return null;
        String head = dataUrl.substring(5, comma);
        if (!head.endsWith(";base64")) return null;
        String mime = head.substring(0, head.length() - ";base64".length());
        int semi = mime.indexOf(';');
        if (semi >= 0) mime = mime.substring(0, semi);
        return new String[] {mime.isEmpty() ? "application/octet-stream" : mime, dataUrl.substring(comma + 1)};
    }

    /** The name from a Content-Disposition header (filename*=UTF-8''… or filename="…"), or null. */
    static String nameFromDisposition(String disposition) {
        if (disposition == null) return null;
        String lower = disposition.toLowerCase(Locale.ROOT);
        int star = lower.indexOf("filename*=");
        if (star >= 0) {
            String v = disposition.substring(star + 10).split(";")[0].trim();
            int quotes = v.indexOf("''");
            if (quotes >= 0) v = v.substring(quotes + 2);
            return percentDecode(stripQuotes(v));
        }
        int plain = lower.indexOf("filename=");
        if (plain >= 0) return stripQuotes(disposition.substring(plain + 9).split(";")[0].trim());
        return null;
    }

    /** A safe file name: no folders or odd characters, the right extension, never empty. */
    static String fileName(String suggested, String mime, long now) {
        String name = suggested == null ? "" : suggested.trim();
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        name = name.replaceAll("[\\x00-\\x1f:*?\"<>|]", "_").replaceAll("^\\.+", "");
        if (name.length() > 80) name = name.substring(name.length() - 80);
        String ext = extensionFor(mime);
        if (name.isEmpty()) name = "starlink-" + now + (ext == null ? "" : ext);
        else if (ext != null && !name.toLowerCase(Locale.ROOT).endsWith(ext)) name = name + ext;
        return name;
    }

    static String extensionFor(String mime) {
        if (mime == null) return null;
        switch (mime.toLowerCase(Locale.ROOT)) {
            case "application/pdf": return ".pdf";
            case "image/png": return ".png";
            case "image/jpeg": return ".jpg";
            case "text/csv": return ".csv";
            default: return null;
        }
    }

    private static String stripQuotes(String v) {
        return v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"") ? v.substring(1, v.length() - 1) : v;
    }

    private static String percentDecode(String v) {
        try {
            return java.net.URLDecoder.decode(v.replace("+", "%2B"), "UTF-8");
        } catch (Exception e) {
            return v;
        }
    }
}
