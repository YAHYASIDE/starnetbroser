package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 📥 «فتح بـ STAR NET» / «مشاركة» of a file from Telegram (the rep's 📋 copy of his devices): keeps
 * the file's text for the app, then opens STAR NET, which reads it (LocalBrowserPlugin#takeSharedFile)
 * and decides what it is - nothing here trusts or acts on the contents. No screen of its own.
 */
public class SharedFileActivity extends Activity {

    static final String FILE_NAME = "shared-file.txt";
    /** A copy of a rep's devices with their sessions stays far below this. */
    private static final int MAX_BYTES = 20 * 1024 * 1024;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null && intent != null && Intent.ACTION_SEND.equals(intent.getAction())) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        boolean kept = uri != null && keep(uri);
        if (!kept) Toast.makeText(this, "تعذّر فتح الملف", Toast.LENGTH_LONG).show();
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(launch);
        }
        finish();
    }

    private boolean keep(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return false;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > MAX_BYTES) return false;
            }
            try (FileOutputStream file = new FileOutputStream(new File(getFilesDir(), FILE_NAME))) {
                file.write(out.toString(StandardCharsets.UTF_8.name()).getBytes(StandardCharsets.UTF_8));
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
