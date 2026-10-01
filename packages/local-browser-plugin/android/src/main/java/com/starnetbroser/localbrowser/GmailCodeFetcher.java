package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 📨 Waits for a fresh code in the linked «بريد الرموز» Gmail (GmailCodes): every few seconds for
 * a few minutes, asks Gmail for the newest messages and hands back the first code received after
 * the page asked for it. The access token comes silently from Google Play services (linked once in
 * Settings) and is never stored; message text never leaves the phone and is never logged.
 */
final class GmailCodeFetcher implements CodeSource {

    private static final String PREFS = "starnet_gmail_codes";
    private static final String KEY_EMAIL = "email";
    private static final long POLL_MS = 5000;
    private static final int MAX_POLLS = 36; // 3 minutes
    private static final int TIMEOUT_MS = 15_000;

    /** The linked Gmail address, or null when «بريد الرموز» was never linked. */
    static String linkedEmail(Context context) {
        String email = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_EMAIL, null);
        return email == null || email.isEmpty() ? null : email;
    }

    static void setLinkedEmail(Context context, String email) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (email == null || email.isEmpty()) editor.remove(KEY_EMAIL);
        else editor.putString(KEY_EMAIL, email.trim().toLowerCase(java.util.Locale.ROOT));
        editor.apply();
    }

    /** A Gmail API answer other than 200 (401 = the token was refused). */
    static final class HttpError extends IOException {
        final int status;

        HttpError(int status) {
            super("HTTP " + status);
            this.status = status;
        }
    }

    static String get(String url, String token) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            int status = connection.getResponseCode();
            if (status != 200) throw new HttpError(status);
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            connection.disconnect();
        }
    }

    /** The newest code received at or after `sinceMs` in this token's mailbox, or null. Blocking. */
    static String newestCode(String token, long sinceMs) throws IOException {
        for (String id : GmailCodes.parseIds(get(GmailCodes.listUrl(), token))) {
            String code = GmailCodes.codeIn(get(GmailCodes.messageUrl(id), token), sinceMs);
            if (code != null) return code;
        }
        return null;
    }

    private final Activity activity;
    private final long sinceMs;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Runnable poll = this::poll;
    private int polls;
    private boolean stopped;
    private boolean checkedAccount;

    GmailCodeFetcher(Activity activity, long sinceMs, Listener listener) {
        this.activity = activity;
        this.sinceMs = sinceMs;
        this.listener = listener;
    }

    @Override
    public void start() {
        main.post(poll);
    }

    @Override
    public void stop() {
        stopped = true;
        main.removeCallbacks(poll);
        network.shutdownNow();
    }

    private void poll() {
        if (stopped) return;
        if (++polls > MAX_POLLS) {
            stop();
            listener.onGiveUp();
            return;
        }
        DriveAuthorizer.authorizeSilently(activity, GmailCodes.SCOPE, linkedEmail(activity), new DriveAuthorizer.TokenCallback() {
            @Override
            public void onToken(String token) {
                if (stopped) return;
                network.execute(() -> check(token));
            }

            @Override
            public void onError(String message, String code) {
                if (stopped) return;
                stop();
                listener.onSignedOut(); // not linked (or no longer allowed): Settings → «بريد الرموز»
            }
        });
    }

    private void check(String token) {
        String code = null;
        boolean wrongAccount = false;
        try {
            if (!checkedAccount) {
                String linked = linkedEmail(activity);
                wrongAccount = linked != null && !linked.equals(GmailCodes.profileEmail(get(GmailCodes.PROFILE_URL, token)));
                checkedAccount = true;
            }
            if (!wrongAccount) code = newestCode(token, sinceMs);
        } catch (IOException ignored) {
            // a network hiccup or a stale token: the next poll tries again
        }
        final String found = code;
        final boolean wrong = wrongAccount;
        main.post(() -> {
            if (stopped) return;
            if (wrong) {
                stop();
                listener.onSignedOut();
            } else if (found != null) {
                stop();
                listener.onCode(found);
            } else {
                main.postDelayed(poll, POLL_MS);
            }
        });
    }
}
