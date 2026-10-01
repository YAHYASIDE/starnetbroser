package com.starnetbroser.localbrowser;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Watches Starlink's sign-in form inside a device's browser: the password typed in its field, and
 * Starlink's "wrong password" message (real, confirmed screenshot: «كلمة المرور غير صحيحة. يُرجى
 * إعادة المحاولة...»). When the operator then types the right one and gets in, the device keeps
 * it (AccountBrowserActivity) - the old, wrong one is replaced. The value only ever goes to the
 * phone's own storage; never logged.
 */
final class StarlinkLoginWatch {

    private StarlinkLoginWatch() {}

    /** {"p": the password field's value ("" when none), "f": 1 when a password field shows,
     * "w": 1 when Starlink says the password is wrong}. */
    static final String SCRIPT = "(function(){"
        // The visible one: Microsoft's sign-in also carries a hidden password input.
        + "var l=document.querySelectorAll('input[type=password]'),f=null;"
        + "for(var i=0;i<l.length;i++){var r=l[i].getBoundingClientRect();if(r.width>0&&r.height>0){f=l[i];break;}}"
        + "var t=((document.body&&document.body.innerText)||'').toLowerCase();"
        + "var w=/كلمة المرور غير صحيحة|كلمة السر غير صحيحة|incorrect password|wrong password|password is incorrect|invalid email or password|password isn't right/.test(t);"
        + "return JSON.stringify({p:f?f.value:'',f:f?1:0,w:w?1:0});})()";

    static final class State {
        final String password;
        final boolean hasPasswordField;
        final boolean wrongPassword;

        State(String password, boolean hasPasswordField, boolean wrongPassword) {
            this.password = password;
            this.hasPasswordField = hasPasswordField;
            this.wrongPassword = wrongPassword;
        }
    }

    /** evaluateJavascript's JSON-quoted string result -> the state, or null when unreadable. */
    static State parse(String evaluateResult) {
        if (evaluateResult == null || "null".equals(evaluateResult)) return null;
        try {
            Object unquoted = new JSONTokener(evaluateResult).nextValue();
            if (!(unquoted instanceof String)) return null;
            JSONObject o = new JSONObject((String) unquoted);
            return new State(o.optString("p", ""), o.optInt("f", 0) == 1, o.optInt("w", 0) == 1);
        } catch (JSONException e) {
            return null;
        }
    }

    /** Types `value` into the visible password field (the operator picked it from the list). */
    static String fillPasswordScript(String value) {
        return "(function(v){var l=document.querySelectorAll('input[type=password]');"
            + "for(var i=0;i<l.length;i++){var el=l[i],r=el.getBoundingClientRect();if(r.width>0&&r.height>0){"
            + "var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;el.focus();s.call(el,v);"
            + "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 1;}}return 0;})("
            + LoginAutofill.literal(value) + ")";
    }

    /** Signed in: an account page (never the sign-in / verification steps). */
    static boolean isSignedInUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("/account") && !lower.contains("login") && !lower.contains("auth") && !lower.contains("sign");
    }

    /** The password typed and used for this sign-in, when it is new for this device. */
    static boolean isNewPassword(String typed, String saved) {
        return typed != null && !typed.isEmpty() && !typed.equals(saved == null ? "" : saved);
    }
}
