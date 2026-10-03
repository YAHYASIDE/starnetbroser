package com.starnetbroser.localbrowser;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import android.webkit.WebView;

/**
 * The device browser's WebView. While an automatic task runs on it (a sync, «إلغاء الاشتراك»),
 * the Starlink page keeps being told it is on screen even after the operator switches to another
 * app - a page that thinks it is hidden slows its own timers and may hold back what it shows,
 * which made those tasks stall until the app was opened again (real report).
 */
public class TaskWebView extends WebView {

    private boolean keepVisible;

    public TaskWebView(Context context) {
        super(context);
    }

    public TaskWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public TaskWebView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    void setKeepVisible(boolean keep) {
        if (keepVisible == keep) return;
        keepVisible = keep;
        // Back to the truth once the task ends (the window may be hidden by now).
        super.onWindowVisibilityChanged(keep ? View.VISIBLE : getWindowVisibility());
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(keepVisible ? View.VISIBLE : visibility);
    }
}
