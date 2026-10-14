package com.starnetbroser.localbrowser;

import java.util.HashMap;
import java.util.Map;

/**
 * 💳 «أضف البطاقة» by itself - the decisions of one run, from the moment he picks a card until
 * Billing shows it (his choice: everything automatic in Starlink; the KAST card is kept unfrozen):
 * Payment Method → Edit, fill, Save, «Verify transaction» → Email, wait for the code, Submit, then
 * «VISA ending in ####» = his card's last 4. Each frame reports what it shows (cardFlow.ts
 * "sight"); this says what to do next. Every step happens once per run; a run ends on success, an
 * error that appears, or after 10 minutes. Pure Java (no android.*), JUnit-tested.
 */
final class CardAddFlow {

    static final long MAX_MS = 10 * 60_000L;
    /** No result this long after Save → tell him to look at Billing himself. */
    static final long NO_RESULT_MS = 120_000L;

    enum Action { NONE, OPEN_FORM, SAVE, EMAIL, AWAIT_CODE, SAVED, NEEDS_VERIFICATION, DECLINED }

    /** What one frame shows (a "sight" message). */
    static final class Sight {
        final boolean save;
        final boolean verifyChoice;
        final boolean otp;
        final boolean paymentEdit;
        final String onFile;
        final String error;

        Sight(boolean save, boolean verifyChoice, boolean otp, boolean paymentEdit, String onFile, String error) {
            this.save = save;
            this.verifyChoice = verifyChoice;
            this.otp = otp;
            this.paymentEdit = paymentEdit;
            this.onFile = onFile;
            this.error = error;
        }

        static Sight of(String message) {
            return new Sight(
                CardFillMessage.flag(message, "save"),
                CardFillMessage.flag(message, "verifyChoice"),
                CardFillMessage.flag(message, "otp"),
                CardFillMessage.flag(message, "paymentEdit"),
                CardFillMessage.text(message, "onFile"),
                CardFillMessage.text(message, "error"));
        }
    }

    final String last4;
    final long startedAt;
    /** The card on file when he started (from Billing) - a same-last-4 card already there is not a result. */
    private final String onFileBefore;

    private boolean formAsked;
    private boolean filled;
    private boolean saveAsked;
    private boolean saveClicked;
    private long saveClickedAt;
    private boolean emailAsked;
    private boolean awaitingCode;
    private boolean codeSent;
    private boolean finished;
    private boolean toldNoResult;
    private Object saveFrame;
    private final Map<Object, String> lastError = new HashMap<>();

    CardAddFlow(String last4, long now, String onFileBefore) {
        this.last4 = last4;
        this.startedAt = now;
        this.onFileBefore = onFileBefore;
    }

    boolean isOver(long now) {
        return finished || now - startedAt > MAX_MS;
    }

    void finish() {
        finished = true;
    }

    /** He opened the form himself / it was opened for him. */
    void formAsked() {
        formAsked = true;
    }

    boolean isFilled() {
        return filled;
    }

    boolean awaitingCode() {
        return awaitingCode && !codeSent && !finished;
    }

    /** The frame whose Save to tap. */
    Object saveFrame() {
        return saveFrame;
    }

    /** The card went into the form: SAVE when the form's Save is already known. */
    Action filled(int count) {
        if (count <= 0 || finished) return Action.NONE;
        filled = true;
        if (saveFrame != null && !saveAsked) {
            saveAsked = true;
            return Action.SAVE;
        }
        return Action.NONE;
    }

    /** A frame tapped what it was told ("save", "email", "code", "open-form"). */
    void clicked(String what, long now) {
        if ("save".equals(what)) {
            saveClicked = true;
            saveClickedAt = now;
        } else if ("code".equals(what)) {
            codeSent = true;
            awaitingCode = false;
        }
    }

    Action onSight(Object frame, Sight s, long now) {
        if (finished) return Action.NONE;
        String before = lastError.put(frame, s.error);
        if (filled && s.error != null && !s.error.equals(before)) {
            finished = true;
            return "declined".equals(s.error) ? Action.DECLINED : Action.NEEDS_VERIFICATION;
        }
        if (s.save) saveFrame = frame;
        // Billing shows his card: after the code, or after Save when another card was on file before.
        if (filled && last4 != null && last4.equals(s.onFile) && (codeSent || (saveClicked && !last4.equals(onFileBefore)))) {
            finished = true;
            return Action.SAVED;
        }
        if (s.paymentEdit && !formAsked && !filled) {
            formAsked = true;
            return Action.OPEN_FORM;
        }
        if (s.save && filled && !saveAsked) {
            saveAsked = true;
            return Action.SAVE;
        }
        if (s.verifyChoice && filled && !emailAsked) {
            emailAsked = true;
            return Action.EMAIL;
        }
        if (s.otp && filled && !awaitingCode && !codeSent) {
            awaitingCode = true;
            return Action.AWAIT_CODE;
        }
        return Action.NONE;
    }

    /** True once, when Save was tapped long ago and nothing came back. */
    boolean noResultYet(long now) {
        if (finished || toldNoResult || !saveClicked || awaitingCode() || now - saveClickedAt < NO_RESULT_MS) return false;
        toldNoResult = true;
        return true;
    }
}
