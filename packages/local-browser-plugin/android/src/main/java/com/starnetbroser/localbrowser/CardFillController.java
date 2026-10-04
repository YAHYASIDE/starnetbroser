package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * 💳 Fills Starlink's card form in a device's browser with one of the operator's saved cards
 * (CardFillStore). starnetCardFill.js runs at the start of every frame - the card fields are often
 * inside the payment company's own frames - and tells us which frames have card fields; tapping
 * one (or «💳 بطاقة» in the top bar) shows the cards, and the one he picks goes to those frames
 * only (secure ones), which fill their fields. Nothing is logged.
 */
final class CardFillController {

    private static final String BRIDGE = "starnetCardFill";
    /** After a fill the fields get focus again - don't pop the list right back up. */
    private static final long QUIET_AFTER_FILL_MS = 6000;

    private final Activity activity;
    private final List<JavaScriptReplyProxy> frames = new ArrayList<>();
    private boolean on;
    private boolean showing;
    private long filledAt;
    private boolean toldFilled;

    CardFillController(Activity activity) {
        this.activity = activity;
    }

    /** Before the first page loads. False when there are no cards or this WebView can't. */
    boolean setUp(WebView webView) {
        if (CardFillStore.cards(activity).isEmpty()) return false;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false;
        String script = loadScript();
        if (script == null) return false;
        Set<String> everyOrigin = Collections.singleton("*");
        try {
            WebViewCompat.addWebMessageListener(webView, BRIDGE, everyOrigin, (view, message, sourceOrigin, isMainFrame, replyProxy) ->
                onMessage(message.getData(), sourceOrigin, replyProxy));
            WebViewCompat.addDocumentStartJavaScript(webView, script, everyOrigin);
        } catch (RuntimeException e) {
            return false;
        }
        on = true;
        return true;
    }

    boolean isOn() {
        return on;
    }

    /** A new page in the main frame: the old frames are gone. */
    void onNewPage() {
        frames.clear();
    }

    private void onMessage(String data, Uri sourceOrigin, JavaScriptReplyProxy frame) {
        if (sourceOrigin == null || !CardFillMessage.isSecureOrigin(sourceOrigin.getScheme())) return;
        String type = CardFillMessage.type(data);
        if (type == null) return;
        if (!frames.contains(frame)) frames.add(frame);
        if ("focus".equals(type) && System.currentTimeMillis() - filledAt > QUIET_AFTER_FILL_MS) showPicker();
        if ("filled".equals(type) && CardFillMessage.count(data) > 0 && !toldFilled) {
            toldFilled = true;
            Toast.makeText(activity, "💳 مُلئت بيانات البطاقة - راجعها ثم احفظ", Toast.LENGTH_SHORT).show();
        }
    }

    /** The saved cards; the one picked fills the form. */
    void showPicker() {
        if (showing || activity.isFinishing()) return;
        List<CardFillStore.Card> cards = CardFillStore.cards(activity);
        if (cards.isEmpty()) {
            Toast.makeText(activity, "لا بطاقات للتعبئة - أكمل بيانات بطاقاتك في «ستارلينك والبطاقة»", Toast.LENGTH_LONG).show();
            return;
        }
        String[] labels = new String[cards.size()];
        for (int i = 0; i < cards.size(); i++) labels[i] = cards.get(i).label;
        showing = true;
        new AlertDialog.Builder(activity)
            .setTitle("💳 اختر البطاقة")
            .setItems(labels, (dialog, which) -> fill(cards.get(which).payload))
            .setNegativeButton("إلغاء", null)
            .setOnDismissListener(dialog -> showing = false)
            .show();
    }

    private void fill(String payload) {
        if (frames.isEmpty()) {
            Toast.makeText(activity, "لم تُعرف خانات البطاقة في هذه الصفحة - أرسل «🧪 لقطة تشخيص»", Toast.LENGTH_LONG).show();
            return;
        }
        filledAt = System.currentTimeMillis();
        toldFilled = false;
        for (JavaScriptReplyProxy frame : new ArrayList<>(frames)) {
            try {
                frame.postMessage(payload);
            } catch (RuntimeException ignored) {
                // that frame is gone
            }
        }
    }

    private String loadScript() {
        try (InputStream input = activity.getAssets().open("starnetCardFill.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = input.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            return null;
        }
    }
}
