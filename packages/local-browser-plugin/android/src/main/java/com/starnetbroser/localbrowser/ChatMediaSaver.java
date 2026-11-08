package com.starnetbroser.localbrowser;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * ⬇️ The chat's «حفظ في المعرض» (his Nov 8 2026 ask «أضف ميزة تنزيل الوسائط في المعرض»): a picture goes to Pictures /
 * STAR NET (the gallery shows it), a voice message to Music / STAR NET, a file (the rep's statement PDF) to Download /
 * STAR NET - and a file can be opened right away. Android 9 and older: the app's own folder, opened in a viewer.
 */
final class ChatMediaSaver {

    private ChatMediaSaver() {}

    /** Where it went: "gallery" / "music" / "downloads" (Android 10+), "app" (older), or null when it failed. */
    static String save(Context context, String name, byte[] bytes, String mime, boolean open) {
        String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        String where;
        Uri uri;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                Uri collection;
                if (type.startsWith("image/")) {
                    collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/STAR NET");
                    where = "gallery";
                } else if (type.startsWith("audio/")) {
                    collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/STAR NET");
                    where = "music";
                } else {
                    collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/STAR NET");
                    where = "downloads";
                }
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, type);
                uri = resolver.insert(collection, values);
                if (uri == null) return null;
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) return null;
                    out.write(bytes);
                }
            } else {
                File dir = new File(context.getCacheDir(), "starnet_downloads");
                if (!dir.isDirectory() && !dir.mkdirs()) return null;
                File file = new File(dir, name);
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                uri = FileProvider.getUriForFile(context, context.getPackageName() + CaptureFileProvider.AUTHORITY_SUFFIX, file);
                where = "app";
                open = true; // nowhere the user can find it otherwise: show it (the viewer can save / share it)
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
        if (open) {
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(view, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(chooser);
            } catch (ActivityNotFoundException ignored) {
                // no viewer: it stays saved
            }
        }
        return where;
    }
}
