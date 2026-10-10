package com.starnetbroser.localbrowser;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.app.NotificationCompat;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.ArrayList;
import java.util.List;

/**
 * 🔄 «مزامنة الآن» fully in the background (the operator's choice): one device after another, each
 * in its own isolated profile, read by SyncRunner (the same walk as the device browser's «مزامنة»).
 * A WebView that isn't on any screen often doesn't draw Starlink's page (real, confirmed: the old
 * hidden sync "did nothing"), so each one sits in an invisible, untouchable window over the screen
 * (the «الظهور فوق التطبيقات» permission, granted once) - it draws normally while the operator sees
 * nothing and keeps using the phone. A notification shows "3 / 10" with «إيقاف»; a device not signed
 * in is alerted on the owner's bot at once, and the whole run is reported there at the end.
 *
 * 🛂 The same service runs «كشف توثيق» in the background (EXTRA_TRAVEL_CHECK): each such device is
 * read Home-only by SyncRunner, and those devices get their own report (TravelCheckReport). Every
 * device keeps the mode it was queued with, so a check added while a sync runs (or the other way
 * round) is never read the wrong way.
 */
public class BackgroundSyncService extends Service {

    static final String ACTION_START = "com.starnetbroser.localbrowser.BG_SYNC_START";
    static final String ACTION_STOP = "com.starnetbroser.localbrowser.BG_SYNC_STOP";
    static final String EXTRA_IDS = "ids";
    static final String EXTRA_NAMES = "names";
    static final String EXTRA_LABEL = "label";
    static final String EXTRA_TRAVEL_CHECK = "travelCheck";

    private static final String CHANNEL_ID = "starnet_bg_sync_v1";
    private static final int NOTIFICATION_ID = 4417;
    private static final long GAP_MS = 1000;
    private static final long MAX_HOLD_MS = 3L * 60 * 60 * 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> ids = new ArrayList<>();
    private final List<String> names = new ArrayList<>();
    private final List<String> outcomes = new ArrayList<>();
    /** 🛂 Per device: queued as a «كشف توثيق» (Home only), and its label. */
    private final List<Boolean> travelModes = new ArrayList<>();
    private final List<String> labels = new ArrayList<>();
    /** 🛂 Per finished device of a check: needs / clear / why unchecked, and the deadline. */
    private final List<String> travelResults = new ArrayList<>();
    private final List<String> travelDues = new ArrayList<>();
    private int index;
    private boolean running;
    private WebView webView;
    private SyncRunner runner;
    private PowerManager.WakeLock wakeLock;

    /** The overlay permission this needs («الظهور فوق التطبيقات»). */
    static boolean canRun(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    static void start(Context context, String[] accountIds, String[] accountNames, String runLabel, boolean travelCheck) {
        Intent intent = new Intent(context, BackgroundSyncService.class).setAction(ACTION_START)
            .putExtra(EXTRA_IDS, accountIds).putExtra(EXTRA_NAMES, accountNames).putExtra(EXTRA_LABEL, runLabel)
            .putExtra(EXTRA_TRAVEL_CHECK, travelCheck);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification notification = buildProgress("🔄 تبدأ المزامنة في الخلفية…");
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIFICATION_ID, notification);
        } catch (RuntimeException refused) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            finishRun(true);
            return START_NOT_STICKY;
        }
        if (!canRun(this) || !WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            AppEventNotifier.post(this, "⚠️ اسمح لـ STAR NET بـ«الظهور فوق التطبيقات» لتعمل المزامنة في الخلفية", "/settings");
            stopSelfNow();
            return START_NOT_STICKY;
        }
        String[] newIds = intent != null ? intent.getStringArrayExtra(EXTRA_IDS) : null;
        String[] newNames = intent != null ? intent.getStringArrayExtra(EXTRA_NAMES) : null;
        boolean travelCheck = intent != null && intent.getBooleanExtra(EXTRA_TRAVEL_CHECK, false);
        String newLabel = intent != null ? intent.getStringExtra(EXTRA_LABEL) : null;
        if (newIds != null) {
            for (int i = 0; i < newIds.length; i++) {
                if (newIds[i] == null) continue;
                // Already waiting in the same mode: once is enough. Already done, or in the other
                // mode: queued again (a check after a sync is a different read).
                if (isQueued(newIds[i], travelCheck)) continue;
                ids.add(newIds[i]);
                names.add(newNames != null && i < newNames.length && newNames[i] != null ? newNames[i] : "");
                travelModes.add(travelCheck);
                labels.add(newLabel != null ? newLabel : "");
            }
        }
        if (!running) {
            running = true;
            acquireWakeLock();
            handler.post(this::runNext);
        }
        return START_NOT_STICKY;
    }

    private boolean isQueued(String accountId, boolean travelCheck) {
        for (int i = index; i < ids.size(); i++) {
            if (ids.get(i).equals(accountId) && travelModes.get(i) == travelCheck) return true;
        }
        return false;
    }

    private void acquireWakeLock() {
        if (wakeLock != null) return;
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power == null) return;
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "starnet:bgsync");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(MAX_HOLD_MS);
    }

    private void runNext() {
        if (!running) return;
        if (index >= ids.size()) {
            finishRun(false);
            return;
        }
        String accountId = ids.get(index);
        String name = names.get(index);
        boolean travelCheck = travelModes.get(index);
        updateProgress(travelCheck
            ? TravelCheckReport.progress(index, ids.size(), name)
            : "🔄 مزامنة في الخلفية · " + BackgroundSyncReport.progress(index, ids.size(), name));
        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(accountId);
            showWebView(profileName);
        } catch (RuntimeException e) {
            deviceDone(accountId, name, "stuck");
            return;
        }
        String homeUrl = LocalBrowserPlugin.DEFAULT_URL;
        runner = new SyncRunner(this, webView, accountId, homeUrl, travelCheck, outcome -> deviceDone(accountId, name, outcome));
        webView.loadUrl(homeUrl);
        runner.start();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showWebView(String profileName) {
        ProfileStore.getInstance().getOrCreateProfile(profileName);
        TaskWebView view = new TaskWebView(this);
        WebViewCompat.setProfile(view, profileName);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return scheme == null || (!scheme.equals("http") && !scheme.equals("https"));
            }
        });
        view.setKeepVisible(true);
        // Full screen so the page lays out like on the phone (the taps rely on real positions),
        // invisible (alpha) and untouchable, so the operator sees and uses the phone as usual.
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                // WebView needs a hardware-accelerated window to draw normally.
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT);
        params.alpha = 0.01f;
        params.setTitle("STAR NET sync");
        WindowManager windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        windows.addView(view, params);
        webView = view;
    }

    private void removeWebView() {
        if (runner != null) {
            runner.stop();
            runner = null;
        }
        if (webView == null) return;
        try {
            WindowManager windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            windows.removeView(webView);
        } catch (RuntimeException ignored) {
            // already gone
        }
        webView.stopLoading();
        webView.destroy();
        webView = null;
    }

    private void deviceDone(String accountId, String name, String outcome) {
        if (!running) return;
        outcomes.add(outcome);
        if (travelModes.get(index)) {
            SyncRunner finished = runner;
            travelResults.add(TravelCheckReport.result(outcome, finished != null ? finished.travelRequired() : null));
            travelDues.add(finished != null ? finished.travelDue() : "");
        } else {
            travelResults.add(null);
            travelDues.add(null);
        }
        if ("signedOut".equals(outcome)) {
            String alert = BackgroundSyncReport.signedOutAlert(name);
            TelegramSendWorker.enqueue(this, alert);
            AppEventNotifier.post(this, alert, AppEventText.deviceRoute(name));
        }
        // Kept for the app too: it shows why a device wasn't synced when it comes back.
        AutoSyncResults.record(this, accountId, outcome);
        removeWebView();
        index++;
        handler.postDelayed(this::runNext, GAP_MS);
    }

    private void finishRun(boolean stopped) {
        boolean wasRunning = running;
        running = false;
        handler.removeCallbacksAndMessages(null);
        removeWebView();
        if (wasRunning) {
            // 🛂 A check's devices that never ran are recorded as such, so the app closes the run.
            for (int i = outcomes.size(); i < ids.size(); i++) {
                if (travelModes.get(i)) AutoSyncResults.record(this, ids.get(i), "closed");
            }
            List<String> syncNames = new ArrayList<>();
            List<String> syncOutcomes = new ArrayList<>();
            List<String> travelNames = new ArrayList<>();
            List<String> checks = new ArrayList<>();
            List<String> dues = new ArrayList<>();
            String syncLabel = null;
            String travelLabel = null;
            for (int i = 0; i < outcomes.size(); i++) {
                if (travelModes.get(i)) {
                    if (travelLabel == null) travelLabel = labels.get(i);
                    travelNames.add(names.get(i));
                    checks.add(travelResults.get(i));
                    dues.add(travelDues.get(i));
                } else {
                    if (syncLabel == null) syncLabel = labels.get(i);
                    syncNames.add(names.get(i));
                    syncOutcomes.add(outcomes.get(i));
                }
            }
            if (!syncOutcomes.isEmpty()) announce(BackgroundSyncReport.report(syncLabel, syncNames, syncOutcomes, stopped));
            if (!checks.isEmpty()) announce(TravelCheckReport.report(travelLabel, travelNames, checks, dues, stopped));
            if (!outcomes.isEmpty()) AlertSound.play(this);
        }
        stopSelfNow();
    }

    /** The owner's bot, and the whole report in the notification bar (a tap opens the home screen). */
    private void announce(String report) {
        TelegramSendWorker.enqueue(this, report);
        AppEventNotifier.post(this, report, AppEventText.HOME_ROUTE);
    }

    private void stopSelfNow() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    private void ensureChannel() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "المزامنة في الخلفية", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("تقدّم «مزامنة الآن» في الخلفية، مع زر الإيقاف");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildProgress(String text) {
        ensureChannel();
        Intent stop = new Intent(this, BackgroundSyncService.class).setAction(ACTION_STOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop, flags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("STAR NET")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, "⏹ إيقاف", stopIntent)
            .build();
    }

    private void updateProgress(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        try {
            manager.notify(NOTIFICATION_ID, buildProgress(text));
        } catch (RuntimeException ignored) {
            // notifications off - the run goes on
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        running = false;
        handler.removeCallbacksAndMessages(null);
        removeWebView();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
