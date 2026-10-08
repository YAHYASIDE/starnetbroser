package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * ⬇️ Takes the files a device's browser hands out (Starlink's «Invoice PDF») - a WebView drops every
 * download unless the app takes it. A {@code blob:} link (how Starlink builds the PDF) is read back
 * by the page itself (DownloadFiles), an http(s) one is fetched with this device's own session
 * cookies. The file is saved in Downloads / STAR NET and opened (share / print / WhatsApp from the
 * viewer). Only on the real Starlink site (AllowedUrl).
 */
final class PageDownloads {

    private final Activity activity;
    private final WebView webView;
    private final String profileName;
    private final Handler main = new Handler(Looper.getMainLooper());

    PageDownloads(Activity activity, WebView webView, String profileName) {
        this.activity = activity;
        this.webView = webView;
        this.profileName = profileName;
    }

    /** Call once, right after the WebView's settings. */
    void attach() {
        webView.addJavascriptInterface(new Bridge(), DownloadFiles.BRIDGE);
        webView.setDownloadListener((url, userAgent, disposition, mime, length) -> start(url, userAgent, disposition, mime));
    }

    /** Keeps the page's blob links readable - run after each page load. */
    void hookPage() {
        if (AllowedUrl.isAllowed(webView.getUrl())) webView.evaluateJavascript(DownloadFiles.BLOB_HOOK, null);
    }

    /** A download link from the page (also a blob: / data: link the page navigated to). */
    void start(String url, String userAgent, String disposition, String mime) {
        if (!AllowedUrl.isAllowed(webView.getUrl())) return;
        String suggested = DownloadFiles.nameFromDisposition(disposition);
        if (suggested == null && !DownloadFiles.isBlob(url) && !DownloadFiles.isDataUrl(url)) suggested = URLUtil.guessFileName(url, disposition, mime);
        String name = DownloadFiles.fileName(suggested, mime, System.currentTimeMillis());
        toast("⬇️ جارٍ تنزيل الملف…");
        if (DownloadFiles.isBlob(url)) {
            webView.evaluateJavascript(DownloadFiles.readBlobScript(url, name, mime), null);
        } else if (DownloadFiles.isDataUrl(url)) {
            saveDataUrl(url, name, mime);
        } else if (url.startsWith("https://") || url.startsWith("http://")) {
            String cookies = cookiesFor(url);
            String agent = userAgent != null ? userAgent : webView.getSettings().getUserAgentString();
            new Thread(() -> fetch(url, agent, cookies, name, mime), "starnet-download").start();
        }
    }

    private String cookiesFor(String url) {
        try {
            Profile profile = ProfileStore.getInstance().getProfile(profileName);
            return profile != null ? profile.getCookieManager().getCookie(url) : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void fetch(String url, String agent, String cookies, String name, String mime) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(60_000);
            if (agent != null) connection.setRequestProperty("User-Agent", agent);
            if (cookies != null) connection.setRequestProperty("Cookie", cookies);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            String type = connection.getContentType();
            String realMime = type != null ? type.split(";")[0].trim() : mime;
            String fromHeader = DownloadFiles.nameFromDisposition(connection.getHeaderField("Content-Disposition"));
            String finalName = DownloadFiles.fileName(fromHeader != null ? fromHeader : name, realMime, System.currentTimeMillis());
            byte[] bytes = readAll(connection.getInputStream());
            main.post(() -> saveAndOpen(bytes, finalName, realMime));
        } catch (IOException e) {
            main.post(() -> toast("⚠️ تعذّر تنزيل الملف - افتح الصفحة من جديد وحاول مرة أخرى"));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > DownloadFiles.MAX_BYTES) throw new IOException("too large");
            }
            return out.toByteArray();
        }
    }

    private void saveDataUrl(String dataUrl, String name, String mime) {
        String[] parts = DownloadFiles.splitDataUrl(dataUrl);
        if (parts == null || (long) parts[1].length() * 3 / 4 > DownloadFiles.MAX_BYTES) {
            toast("⚠️ تعذّر قراءة الملف");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(parts[1], Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            toast("⚠️ تعذّر قراءة الملف");
            return;
        }
        String realMime = parts[0].equals("application/octet-stream") && mime != null && !mime.isEmpty() ? mime : parts[0];
        saveAndOpen(bytes, DownloadFiles.fileName(name, realMime, System.currentTimeMillis()), realMime);
    }

    private void saveAndOpen(byte[] bytes, String name, String mime) {
        String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        Uri uri;
        try {
            uri = save(bytes, name, type);
        } catch (IOException | RuntimeException e) {
            toast("⚠️ تعذّر حفظ الملف على الهاتف");
            return;
        }
        toast(Build.VERSION.SDK_INT >= 29 ? "✓ حُفظ «" + name + "» في التنزيلات / STAR NET" : "✓ نُزّل «" + name + "»");
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(Intent.createChooser(view, name));
        } catch (ActivityNotFoundException e) {
            // No viewer for this type: it stays in Downloads.
        }
    }

    private Uri save(byte[] bytes, String name, String mime) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = activity.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/STAR NET");
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("no downloads folder");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("no output");
                out.write(bytes);
            }
            return uri;
        }
        // Older Android: the app's own folder, shared with the viewer through its FileProvider.
        File dir = new File(activity.getCacheDir(), "starnet_downloads");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no folder");
        File file = new File(dir, name);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(activity, activity.getPackageName() + CaptureFileProvider.AUTHORITY_SUFFIX, file);
    }

    private void toast(String text) {
        Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
    }

    /** What the page's read-back script reports to (DownloadFiles.readBlobScript). */
    private final class Bridge {
        @JavascriptInterface
        public void save(String dataUrl, String name, String mime) {
            main.post(() -> {
                if (!AllowedUrl.isAllowed(webView.getUrl())) return;
                saveDataUrl(dataUrl, name, mime);
            });
        }

        @JavascriptInterface
        public void failed(String reason) {
            main.post(() -> toast("⚠️ تعذّر تنزيل الملف - افتح الصفحة من جديد وحاول مرة أخرى"));
        }
    }
}
