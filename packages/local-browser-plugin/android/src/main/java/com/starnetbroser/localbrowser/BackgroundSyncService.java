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
 */
public class BackgroundSyncService extends Service {

    static final String ACTION_START = "com.starnetbroser.localbrowser.BG_SYNC_START";
    static final String ACTION_STOP = "com.starnetbroser.localbrowser.BG_SYNC_STOP";
    static final String EXTRA_IDS = "ids";
    static final String EXTRA_NAMES = "names";
    static final String EXTRA_LABEL = "label";

    private static final String CHANNEL_ID = "starnet_bg_sync_v1";
    private static final int NOTIFICATION_ID = 4417;
    private static final long GAP_MS = 1000;
    private static final long MAX_HOLD_MS = 3L * 60 * 60 * 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> ids = new ArrayList<>();
    private final List<String> names = new ArrayList<>();
    private final List<String> outcomes = new ArrayList<>();
    private String label = "";
    private int index;
    private boolean running;
    private WebView webView;
    private SyncRunner runner;
    private PowerManager.WakeLock wakeLock;

    /** The overlay permission this needs («الظهور فوق التطبيقات»). */
    static boolean canRun(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
    }

    static void start(Context context, String[] accountIds, String[] accountNames, String runLabel) {
        Intent intent = new Intent(context, BackgroundSyncService.class).setAction(ACTION_START)
            .putExtra(EXTRA_IDS, accountIds).putExtra(EXTRA_NAMES, accountNames).putExtra(EXTRA_LABEL, runLabel);
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
        if (newIds != null) {
            for (int i = 0; i < newIds.length; i++) {
                if (newIds[i] == null || ids.contains(newIds[i])) continue;
                ids.add(newIds[i]);
                names.add(newNames != null && i < newNames.length && newNames[i] != null ? newNames[i] : "");
            }
        }
        if (!running) {
            String newLabel = intent != null ? intent.getStringExtra(EXTRA_LABEL) : null;
            label = newLabel != null ? newLabel : "";
            running = true;
            acquireWakeLock();
            handler.post(this::runNext);
        }
        return START_NOT_STICKY;
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
        updateProgress("🔄 مزامنة في الخلفية · " + BackgroundSyncReport.progress(index, ids.size(), name));
        String profileName;
        try {
            profileName = ProfileNaming.profileNameFor(accountId);
            showWebView(profileName);
        } catch (RuntimeException e) {
            deviceDone(accountId, name, "stuck");
            return;
        }
        String homeUrl = LocalBrowserPlugin.DEFAULT_URL;
        runner = new SyncRunner(this, webView, accountId, homeUrl, outcome -> deviceDone(accountId, name, outcome));
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
        if (wasRunning && !outcomes.isEmpty()) {
            String report = BackgroundSyncReport.report(label, names.subList(0, outcomes.size()), outcomes, stopped);
            TelegramSendWorker.enqueue(this, report);
            // The whole report in the notification bar; a tap opens the app's home screen.
            AppEventNotifier.post(this, report, AppEventText.HOME_ROUTE);
            AlertSound.play(this);
        }
        stopSelfNow();
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
