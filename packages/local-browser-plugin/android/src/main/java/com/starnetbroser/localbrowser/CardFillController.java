package com.starnetbroser.localbrowser;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
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
 * 💳 «أضف البطاقة» in a device's browser, by itself (his choice - the KAST card is kept unfrozen):
 * he picks one of his saved cards (CardFillStore) from «💳» or by tapping a card field, and the
 * app opens Billing → Payment Method → Edit, fills the card, taps Save, picks Email on the card
 * company's «Verify transaction», types the code from no-reply's mail (read from the phone's mail
 * notification - PaymentCodeInbox - or from what he copied) and taps Submit, then tells him when
 * Billing shows the card's last 4 and runs «مزامنة». The steps are decided by CardAddFlow.
 * starnetCardFill.js runs at the start of every frame (the card fields are often inside the
 * payment company's frames) and reports what it shows; a card goes only to the secure frames that
 * have card fields, a code only to the frame that shows the code field. Nothing is logged.
 */
final class CardFillController {

    interface Host {
        /** Taps Billing in Starlink's side rail. */
        void openBilling();

        /** The card is on the device: read it into the app («مزامنة»). */
        void cardSaved();
    }

    private static final String BRIDGE = "starnetCardFill";
    /** After a fill the fields get focus again - don't pop the list right back up. */
    private static final long QUIET_AFTER_FILL_MS = 6000;
    private static final long FILL_DEBOUNCE_MS = 800;
    private static final long SAVE_DELAY_MS = 1500;
    private static final long TICK_MS = 5000;

    private final Activity activity;
    private final Host host;
    private final Handler handler = new Handler(Looper.getMainLooper());
    /** Frames with card fields (only these receive a card). */
    private final List<JavaScriptReplyProxy> cardFrames = new ArrayList<>();
    private boolean on;
    private boolean showing;
    private long filledAt;
    private boolean toldFilled;

    private CardAddFlow flow;
    private String flowPayload;
    private String lastOnFile;
    private JavaScriptReplyProxy paymentEditFrame;
    private JavaScriptReplyProxy otpFrame;
    /** What was on the clipboard when the code field showed - an old copy is never the code. */
    private String clipAtOtp;
    private final PaymentCodeInbox.Listener codeListener = code -> new Handler(Looper.getMainLooper()).post(() -> sendCode(code));

    CardFillController(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
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
        cardFrames.clear();
        paymentEditFrame = null;
        otpFrame = null;
    }

    /** The screen is gone. */
    void release() {
        endFlow();
        handler.removeCallbacksAndMessages(null);
    }

    /** Back from the mail app: the code he copied («نسخ الرمز»). */
    void onWindowFocus(boolean hasFocus) {
        if (!hasFocus || !flowRunning() || !flow.awaitingCode()) return;
        String clip = readClipboard();
        String code = PaymentCode.fromClipboard(clip);
        if (code != null && !clip.equals(clipAtOtp)) sendCode(code);
    }

    private boolean flowRunning() {
        return flow != null && !flow.isOver(System.currentTimeMillis());
    }

    private void onMessage(String data, Uri sourceOrigin, JavaScriptReplyProxy frame) {
        if (sourceOrigin == null || !CardFillMessage.isSecureOrigin(sourceOrigin.getScheme())) return;
        String type = CardFillMessage.type(data);
        if (type == null) return;
        long now = System.currentTimeMillis();
        switch (type) {
            case "ready":
                if (!cardFrames.contains(frame)) cardFrames.add(frame);
                if (flowRunning() && !flow.isFilled()) {
                    flow.formAsked();
                    handler.removeCallbacks(fillNow);
                    handler.postDelayed(fillNow, FILL_DEBOUNCE_MS);
                }
                break;
            case "focus":
                if (!cardFrames.contains(frame)) cardFrames.add(frame);
                if (!flowRunning() && now - filledAt > QUIET_AFTER_FILL_MS) showPicker();
                break;
            case "filled":
                onFilled(CardFillMessage.count(data));
                break;
            case "sight":
                onSight(frame, CardAddFlow.Sight.of(data), now);
                break;
            case "clicked":
                onClicked(CardFillMessage.text(data, "what"), now);
                break;
            case "stuck":
                onStuck(CardFillMessage.text(data, "what"));
                break;
            default:
                break;
        }
    }

    private void onFilled(int count) {
        if (count <= 0 || toldFilled) return;
        toldFilled = true;
        if (!flowRunning()) {
            Toast.makeText(activity, "💳 مُلئت بيانات البطاقة - راجعها ثم احفظ", Toast.LENGTH_SHORT).show();
            return;
        }
        CardAddFlow.Action action = flow.filled(count);
        Toast.makeText(activity, "💳 مُلئت البطاقة - يحفظها التطبيق الآن", Toast.LENGTH_SHORT).show();
        if (action == CardAddFlow.Action.SAVE) handler.postDelayed(this::sendSave, SAVE_DELAY_MS);
    }

    private void onSight(JavaScriptReplyProxy frame, CardAddFlow.Sight s, long now) {
        if (s.paymentEdit) {
            paymentEditFrame = frame;
            if (s.onFile != null) lastOnFile = s.onFile;
        }
        if (!flowRunning()) return;
        switch (flow.onSight(frame, s, now)) {
            case OPEN_FORM:
                send(frame, "{\"cmd\":\"open-form\"}");
                break;
            case SAVE:
                handler.postDelayed(this::sendSave, SAVE_DELAY_MS);
                break;
            case EMAIL:
                send(frame, "{\"cmd\":\"email\"}");
                break;
            case AWAIT_CODE:
                otpFrame = frame;
                awaitCode();
                break;
            case SAVED:
                Toast.makeText(activity, "✅ البطاقة •••• " + flow.last4 + " صارت على هذا الجهاز", Toast.LENGTH_LONG).show();
                AlertSound.play(activity);
                endFlow();
                host.cardSaved();
                break;
            case NEEDS_VERIFICATION:
                Toast.makeText(activity, "⚠️ Starlink يطلب تحققًا إضافيًا - غالبًا بطاقة KAST مجمّدة: ألغِ تجميدها في KAST ثم أعد «💳»", Toast.LENGTH_LONG).show();
                AlertSound.play(activity);
                endFlow();
                break;
            case DECLINED:
                Toast.makeText(activity, "❌ رُفضت البطاقة - راجع رصيدها وبياناتها", Toast.LENGTH_LONG).show();
                AlertSound.play(activity);
                endFlow();
                break;
            default:
                break;
        }
    }

    private void onClicked(String what, long now) {
        if (!flowRunning() || what == null) return;
        flow.clicked(what, now);
        if ("save".equals(what)) Toast.makeText(activity, "💾 ضُغط Save - ينتظر Starlink", Toast.LENGTH_SHORT).show();
        else if ("email".equals(what)) Toast.makeText(activity, "📧 طُلب الرمز على البريد", Toast.LENGTH_SHORT).show();
        else if ("code".equals(what)) Toast.makeText(activity, "✅ أُدخل رمز no-reply وضُغط Submit", Toast.LENGTH_SHORT).show();
    }

    private void onStuck(String what) {
        if (!flowRunning() || what == null) return;
        String message;
        switch (what) {
            case "save": message = "اضغط «Save» بنفسك - يكمل التطبيق بعدها"; break;
            case "email": message = "اختر «Email» بنفسك - يكمل التطبيق بعدها"; break;
            case "code": message = "أُدخل الرمز - اضغط «Submit» بنفسك"; break;
            case "open-form": message = "افتح «Payment Method» ← «Edit» بنفسك - يكمل التطبيق بعدها"; break;
            default: return;
        }
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }

    /** The saved cards; the one picked is added to this device by itself. */
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
            .setTitle("💳 أضف البطاقة لهذا الجهاز")
            .setItems(labels, (dialog, which) -> startFlow(cards.get(which).payload))
            .setNegativeButton("إلغاء", null)
            .setOnDismissListener(dialog -> showing = false)
            .show();
    }

    private void startFlow(String payload) {
        endFlow();
        long now = System.currentTimeMillis();
        flow = new CardAddFlow(PaymentCode.last4OfPayload(payload), now, lastOnFile);
        flowPayload = payload;
        handler.postDelayed(tick, TICK_MS);
        if (!cardFrames.isEmpty()) {
            flow.formAsked();
            fillNow.run();
        } else if (paymentEditFrame != null) {
            flow.formAsked();
            send(paymentEditFrame, "{\"cmd\":\"open-form\"}");
        } else {
            Toast.makeText(activity, "💳 يفتح Billing ← Payment Method…", Toast.LENGTH_SHORT).show();
            host.openBilling();
        }
    }

    private final Runnable fillNow = () -> {
        if (!flowRunning() || flowPayload == null) return;
        if (cardFrames.isEmpty()) {
            Toast.makeText(activity, "لم تُعرف خانات البطاقة في هذه الصفحة - أرسل «🧪 لقطة تشخيص»", Toast.LENGTH_LONG).show();
            return;
        }
        filledAt = System.currentTimeMillis();
        toldFilled = false;
        String command = "{\"cmd\":\"fill\",\"card\":" + flowPayload + "}";
        for (JavaScriptReplyProxy frame : new ArrayList<>(cardFrames)) send(frame, command);
    };

    private void sendSave() {
        if (!flowRunning()) return;
        Object frame = flow.saveFrame();
        if (frame instanceof JavaScriptReplyProxy) send((JavaScriptReplyProxy) frame, "{\"cmd\":\"save\"}");
        else onStuck("save");
    }

    private void awaitCode() {
        clipAtOtp = readClipboard();
        PaymentCodeInbox.await(flow.startedAt, codeListener);
        if (KastNotificationListener.isEnabled(activity)) {
            Toast.makeText(activity, "📧 ينتظر رمز no-reply من البريد - يُدخله التطبيق عند وصوله", Toast.LENGTH_LONG).show();
        } else {
            Toast.makeText(activity, "📧 انسخ رمز no-reply من البريد وارجع - يُدخله التطبيق (أو فعّل «الوصول للإشعارات» ليقرأه وحده)", Toast.LENGTH_LONG).show();
        }
    }

    private void sendCode(String code) {
        if (!flowRunning() || !flow.awaitingCode() || otpFrame == null) return;
        PaymentCodeInbox.stop(codeListener);
        send(otpFrame, "{\"cmd\":\"code\",\"code\":\"" + code.replaceAll("\\D", "") + "\"}");
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (flow == null) return;
            long now = System.currentTimeMillis();
            if (flow.isOver(now)) {
                Toast.makeText(activity, "⌛ انتهت محاولة إضافة البطاقة - افتح Billing وتأكد", Toast.LENGTH_LONG).show();
                endFlow();
                return;
            }
            if (flow.noResultYet(now)) Toast.makeText(activity, "لم يظهر رد Starlink بعد - افتح Billing وتأكد من البطاقة", Toast.LENGTH_LONG).show();
            handler.postDelayed(this, TICK_MS);
        }
    };

    private void endFlow() {
        if (flow != null) flow.finish();
        flow = null;
        flowPayload = null;
        otpFrame = null;
        clipAtOtp = null;
        PaymentCodeInbox.stop(codeListener);
        handler.removeCallbacks(tick);
        handler.removeCallbacks(fillNow);
    }

    private void send(JavaScriptReplyProxy frame, String command) {
        try {
            frame.postMessage(command);
        } catch (RuntimeException ignored) {
            // that frame is gone
        }
    }

    private String readClipboard() {
        try {
            ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(activity);
            return text == null ? "" : text.toString();
        } catch (RuntimeException e) {
            return "";
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
