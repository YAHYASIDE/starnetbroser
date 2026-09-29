package com.starnetbroser.localbrowser;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The Gmail side of the automatic two-step code: polls the device's Gmail over IMAP
 * (GmailImap, its saved app password) for a code received after the Starlink page appeared.
 */
final class GmailCodePoller implements CodeSource {

    private static final long POLL_MS = 5000;
    private static final long GIVE_UP_MS = 150000;
    /** Codes sent a little before the page was noticed still count. */
    static final long SINCE_MARGIN_MS = 3 * 60 * 1000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Context appContext;
    private final String accountId;
    private final String email;
    private final String password;
    private final String tried;
    private final Listener listener;
    private final long since;
    private long startedAt;
    private volatile boolean done;

    GmailCodePoller(Context context, String accountId, String email, String password, String tried, Listener listener) {
        this.appContext = context.getApplicationContext();
        this.accountId = accountId;
        this.email = email;
        this.password = password;
        this.tried = tried;
        this.listener = listener;
        this.since = System.currentTimeMillis() - SINCE_MARGIN_MS;
    }

    @Override
    public void start() {
        startedAt = System.currentTimeMillis();
        poll();
    }

    @Override
    public void stop() {
        done = true;
        main.removeCallbacksAndMessages(null);
        worker.shutdownNow();
    }

    private void poll() {
        if (done) return;
        if (System.currentTimeMillis() - startedAt > GIVE_UP_MS) {
            finish(listener::onGiveUp);
            return;
        }
        worker.execute(() -> {
            String code = null;
            boolean badPassword = false;
            try {
                List<MailMessage> recent = GmailImap.fetchRecent(email, password, 10);
                MailSessionStore.markSignedIn(appContext, accountId, email);
                code = MailMessages.newCode(recent, since, tried);
            } catch (GmailImap.BadPassword e) {
                badPassword = true;
            } catch (Exception e) {
                // offline for a moment - try again next round
            }
            final String found = code;
            final boolean refused = badPassword;
            main.post(() -> {
                if (done) return;
                if (refused) {
                    MailSessionStore.markSignedOut(appContext, accountId);
                    finish(listener::onSignedOut);
                } else if (found != null) {
                    finish(() -> listener.onCode(found));
                } else {
                    main.postDelayed(this::poll, POLL_MS);
                }
            });
        });
    }

    private void finish(Runnable report) {
        stop();
        report.run();
    }
}
