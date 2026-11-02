package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.content.Intent;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.Button;
import android.widget.Toast;

/**
 * The device/mail browser's bottom bar: each button is a big icon over a small label, and
 * «الرئيسية» / «إغلاق» go back to the STAR NET app itself (not the web page's own home).
 */
final class BrowserBar {

    private BrowserBar() {}

    /** Sets a button to "icon" (larger) over "label". */
    static void label(Button button, String icon, String label) {
        SpannableString text = new SpannableString(icon + "\n" + label);
        text.setSpan(new RelativeSizeSpan(1.6f), 0, icon.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        button.setText(text);
    }

    /** Brings STAR NET to the front, the same as tapping its icon (the open app, not a new one). */
    static void returnToApp(Activity activity) {
        returnToApp(activity, null);
    }

    /** …on one page of the app (`route`, e.g. a device's card «/?q=email») - the way a 🔔 notification opens it. */
    static void returnToApp(Activity activity, String route) {
        Intent launch = activity.getPackageManager().getLaunchIntentForPackage(activity.getPackageName());
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        if (route != null && PhoneShortcuts.isRoute(route)) launch.putExtra(PhoneShortcuts.EXTRA_ROUTE, route);
        activity.startActivity(launch);
    }

    /** ✋ Acts on a long press only (his Nov 2 2026 ask - no more taps by mistake while browsing); a short tap says so. */
    static void onHold(View view, Runnable action) {
        view.setOnClickListener(v -> Toast.makeText(v.getContext(), "✋ اضغط مطولًا", Toast.LENGTH_SHORT).show());
        view.setOnLongClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            action.run();
            return true;
        });
    }

    private static void bind(View view, boolean hold, Runnable action) {
        if (hold) onHold(view, action);
        else view.setOnClickListener(v -> action.run());
    }

    /** The five buttons of a browser screen: رجوع · تحديث · الرئيسية · إغلاق · (main action). */
    static void setUp(Activity activity, Runnable back, Runnable refresh, String mainIcon, String mainLabel, Runnable main) {
        setUp(activity, back, refresh, mainIcon, mainLabel, main, false);
    }

    /** `hold`: every button acts on a long press only (the device browser). */
    static void setUp(Activity activity, Runnable back, Runnable refresh, String mainIcon, String mainLabel, Runnable main, boolean hold) {
        Button backButton = activity.findViewById(R.id.starnet_btn_back);
        Button refreshButton = activity.findViewById(R.id.starnet_btn_refresh);
        Button homeButton = activity.findViewById(R.id.starnet_btn_home);
        Button closeButton = activity.findViewById(R.id.starnet_btn_close);
        Button mainButton = activity.findViewById(R.id.starnet_btn_sync);
        label(backButton, "→", activity.getString(R.string.starnet_action_back));
        label(refreshButton, "⟳", activity.getString(R.string.starnet_action_refresh));
        label(homeButton, "⌂", activity.getString(R.string.starnet_action_home));
        label(closeButton, "✕", activity.getString(R.string.starnet_action_close));
        label(mainButton, mainIcon, mainLabel);
        bind(backButton, hold, back);
        bind(refreshButton, hold, refresh);
        // «الرئيسية»: back to the app, this page stays open behind it (in Recents).
        bind(homeButton, hold, () -> returnToApp(activity));
        // «إغلاق»: close this page and land back in the app.
        bind(closeButton, hold, () -> {
            returnToApp(activity);
            activity.finish();
        });
        bind(mainButton, hold, main);
    }
}
