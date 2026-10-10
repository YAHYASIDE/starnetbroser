package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.content.Intent;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.widget.Button;

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
        Intent launch = activity.getPackageManager().getLaunchIntentForPackage(activity.getPackageName());
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        activity.startActivity(launch);
    }

    /** The five buttons of a browser screen: رجوع · تحديث · الرئيسية · إغلاق · (main action). */
    static void setUp(Activity activity, Runnable back, Runnable refresh, String mainIcon, String mainLabel, Runnable main) {
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
        backButton.setOnClickListener(v -> back.run());
        refreshButton.setOnClickListener(v -> refresh.run());
        // «الرئيسية»: back to the app, this page stays open behind it (in Recents).
        homeButton.setOnClickListener(v -> returnToApp(activity));
        // «إغلاق»: close this page and land back in the app.
        closeButton.setOnClickListener(v -> {
            returnToApp(activity);
            activity.finish();
        });
        mainButton.setOnClickListener(v -> main.run());
    }
}
