package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 🆕 «تحديث جديد» inside the app (his Oct 22 2026 report: the update link opened in Edge and never
 * downloaded). The APK is fetched here into the app's cache and handed straight to Android's
 * installer - no browser. A finished file is kept 30 minutes, so coming back from «السماح من هذا
 * المصدر» installs without downloading again.
 */
final class AppUpdateInstaller {

    interface Progress {
        void onPercent(int percent);
    }

    static final String STATUS_INSTALLING = "installing";
    static final String STATUS_NEEDS_PERMISSION = "needsPermission";

    private static final String DIR = "starnet_update";
    private static final String NAME = "STAR-NET-update.apk";
    private static final long KEEP_MS = 30 * 60 * 1000L;
    private static final int TIMEOUT_MS = 30_000;
    private static final int MAX_REDIRECTS = 5;

    private AppUpdateInstaller() {
    }

    /** Downloads (unless a fresh copy is there) then opens the installer; blocking - off the main thread. */
    static String downloadAndInstall(Context context, String url, Progress progress) throws IOException {
        File dir = new File(context.getCacheDir(), DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache dir");
        File apk = new File(dir, NAME);
        if (!apk.isFile() || System.currentTimeMillis() - apk.lastModified() > KEEP_MS || apk.length() == 0) {
            File part = new File(dir, NAME + ".part");
            download(url, part, progress);
            if (apk.exists() && !apk.delete()) throw new IOException("old file");
            if (!part.renameTo(apk)) throw new IOException("rename failed");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
            allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(allow);
            return STATUS_NEEDS_PERMISSION;
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + CaptureFileProvider.AUTHORITY_SUFFIX, apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(install);
        return STATUS_INSTALLING;
    }

    private static void download(String url, File target, Progress progress) throws IOException {
        HttpURLConnection connection = open(url);
        try {
            long total = contentLength(connection);
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                long done = 0;
                int last = -1;
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    done += read;
                    int percent = total > 0 ? (int) Math.min(100, done * 100 / total) : -1;
                    if (percent != last) {
                        last = percent;
                        progress.onPercent(percent);
                    }
                }
                if (total > 0 && done != total) throw new IOException("incomplete");
            }
        } finally {
            connection.disconnect();
        }
    }

    /** The size in bytes, or -1 (getContentLengthLong needs Android 7; the app runs from 5.1). */
    private static long contentLength(HttpURLConnection connection) {
        try {
            return Long.parseLong(connection.getHeaderField("Content-Length").trim());
        } catch (RuntimeException e) {
            return -1;
        }
    }

    /** GitHub's release link redirects to its file host - followed by hand (https only). */
    private static HttpURLConnection open(String url) throws IOException {
        String current = url;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            if (!current.startsWith("https://")) throw new IOException("not https");
            HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String next = connection.getHeaderField("Location");
                connection.disconnect();
                if (next == null) throw new IOException("redirect without location");
                current = new URL(new URL(current), next).toString();
                continue;
            }
            if (status != 200) {
                connection.disconnect();
                throw new IOException("HTTP " + status);
            }
            return connection;
        }
        throw new IOException("too many redirects");
    }
}
