package com.starnetbroser.localbrowser;

/**
 * The pure half of LocalBrowserPlugin#checkSession: a tiny page script that only reports where the
 * isolated WebView ended up (never reads or returns any account data), and the rules that turn a
 * series of those reports into one answer. Kept free of Android types so it is unit-testable.
 */
final class SessionProbe {

    static final String STATUS_LOGGED_IN = "loggedIn";
    static final String STATUS_LOGIN_REQUIRED = "loginRequired";
    static final String STATUS_NONE = "none";
    static final String STATUS_UNKNOWN = "unknown";

    static final String PROBE_LOGIN = "login";
    static final String PROBE_ACCOUNT = "account";
    static final String PROBE_OTHER = "other";

    /** Returns "login" when the page is a sign-in form/route, "account" when it is the logged-in
     * account portal, "other" otherwise. */
    static final String SCRIPT =
        "(function(){try{"
            + "var p=(location.pathname||'').toLowerCase();"
            + "if(document.querySelector('input[type=password]'))return 'login';"
            + "if(/login|signin|sign-in|\\/auth(\\/|$)/.test(p))return 'login';"
            + "if(p.indexOf('/account')===0)return 'account';"
            + "return 'other';"
            + "}catch(e){return 'other';}})()";

    /** How many consecutive "account" reports (SETTLE apart) count as logged in - the portal is a
     * client-rendered SPA that can show /account for a moment before redirecting a logged-out
     * visitor to the login page, so a single report is not enough. */
    static final int ACCOUNT_CONFIRMATIONS = 2;

    private SessionProbe() {
    }

    /** evaluateJavascript hands back a JSON literal ("\"login\""); anything unexpected is "other". */
    static String parse(String evaluateJavascriptResult) {
        if (evaluateJavascriptResult == null) {
            return PROBE_OTHER;
        }
        String v = evaluateJavascriptResult.trim();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) {
            v = v.substring(1, v.length() - 1);
        }
        if (PROBE_LOGIN.equals(v) || PROBE_ACCOUNT.equals(v)) {
            return v;
        }
        return PROBE_OTHER;
    }

    /**
     * Folds one more report into the running count of consecutive "account" reports. Returns the
     * final status once decided, or null to keep probing. A login page is decisive at once.
     */
    static String decide(String probe, int[] consecutiveAccount) {
        if (PROBE_LOGIN.equals(probe)) {
            return STATUS_LOGIN_REQUIRED;
        }
        if (PROBE_ACCOUNT.equals(probe)) {
            consecutiveAccount[0]++;
            return consecutiveAccount[0] >= ACCOUNT_CONFIRMATIONS ? STATUS_LOGGED_IN : null;
        }
        consecutiveAccount[0] = 0;
        return null;
    }

    /** What to answer when time runs out before a decision: the portal was showing the account
     * (just not twice yet) -> logged in; anything else -> unknown. */
    static String onTimeout(String lastProbe) {
        return PROBE_ACCOUNT.equals(lastProbe) ? STATUS_LOGGED_IN : STATUS_UNKNOWN;
    }
}
