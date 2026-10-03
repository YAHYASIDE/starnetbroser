package com.starnetbroser.localbrowser;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

/**
 * 📌 A page of the app pinned to the phone's home screen (long-press any page or tool in the app).
 * Tapping it opens the app on that page: the launch intent carries the route in EXTRA_ROUTE, read
 * by LocalBrowserPlugin (first launch and onNewIntent). Only in-app routes ("/tools#pay") pass.
 */
final class PhoneShortcuts {
    static final String EXTRA_ROUTE = "starnet_route";

    private PhoneShortcuts() {
    }

    /** "/settings", "/tools#pay", "/?action=sync" - never "//host" or a full URL. */
    static boolean isRoute(String route) {
        return route != null && route.length() <= 200 && route.startsWith("/") && !route.startsWith("//") && !route.contains("\n");
    }

    static boolean supported(Context context) {
        return ShortcutManagerCompat.isRequestPinShortcutSupported(context);
    }

    /** Asks the launcher to pin it (the phone shows its own confirmation). False when refused. */
    static boolean pin(Context context, String id, String label, String route, String emoji, String color) {
        if (!isRoute(route) || !supported(context)) return false;
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) return false;
        launch.setAction(Intent.ACTION_MAIN);
        launch.putExtra(EXTRA_ROUTE, route);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String name = label == null || label.trim().isEmpty() ? "STAR NET" : label.trim();
        ShortcutInfoCompat info = new ShortcutInfoCompat.Builder(context, id)
            .setShortLabel(name.length() > 25 ? name.substring(0, 25) : name)
            .setLongLabel(name)
            .setIcon(IconCompat.createWithBitmap(icon(emoji, color)))
            .setIntent(launch)
            .build();
        return ShortcutManagerCompat.requestPinShortcut(context, info, null);
    }

    /** A round colored badge with the page's emoji on it. */
    private static Bitmap icon(String emoji, String color) {
        int size = 192;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint circle = new Paint(Paint.ANTI_ALIAS_FLAG);
        int fill;
        try {
            fill = Color.parseColor(color == null || color.isEmpty() ? "#2f80ff" : color);
        } catch (IllegalArgumentException bad) {
            fill = Color.parseColor("#2f80ff");
        }
        circle.setColor(fill);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, circle);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(size * 0.5f);
        text.setTextAlign(Paint.Align.CENTER);
        String glyph = emoji == null || emoji.isEmpty() ? "★" : emoji;
        Rect bounds = new Rect();
        text.getTextBounds(glyph, 0, glyph.length(), bounds);
        canvas.drawText(glyph, size / 2f, size / 2f - bounds.exactCenterY(), text);
        return bitmap;
    }
}
