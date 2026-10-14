package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * 🤖 The automatic Outlook sign-in («إضافة الحساب» → «📧 البريد» first, then Starlink): which of
 * Microsoft's sign-in steps the page is, and what to press on it - with no one touching the phone.
 * Real, confirmed order (screenshots): «Sign in» (email) → «Get a sign-in request» → «Other ways
 * to sign in» → «Sign in another way» → «Use your password» → «Enter your password» → «Next» →
 * sometimes «Verify your email» (the shop's Gmail, «Send code») → «Enter your code» (read from
 * Gmail - GmailCodeFetcher) → «Next» → «We're updating our terms» → «Next» → «Stay signed in?» →
 * «Yes» → the inbox. Some accounts first ask «Add an email address» (the shop's Gmail, «Next»,
 * then its code). The steps come in any order and any of them may be absent.
 *
 * The rules (confirmed by the operator):
 *  - always the saved «كود البريد» first («Use your password»);
 *  - «Send a code to st*****@gmail.com» only when the password is missing or wrong AND the masked
 *    address is the shop's own Gmail (the code can then be read); otherwise stop and say so;
 *  - an unknown page: press nothing.
 * Pure (reads the page's state as JSON and returns one step) so it is unit-tested; the values are
 * only ever embedded as JSON string literals (LoginAutofill.literal), never logged.
 */
final class MsSignIn {

    private MsSignIn() {}

    /** What the page shows, as JSON: h = the visible headings, o = the visible buttons/links'
     * texts, m = the masked address on the page ("st*****@gmail.com") or "", pw/pwv = a visible
     * password field / it has a value, tn/tv = the visible text|email|tel fields' count / the
     * first one's value, af = every such field has a value, w = the page says the password is
     * wrong. */
    static final String STATE_SCRIPT = "(function(){"
        + "function vis(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}"
        + "function txt(el){return (el.textContent||el.value||'').replace(/\\s+/g,' ').trim();}"
        + "var h=[],hs=document.querySelectorAll('h1,h2,[role=heading]');for(var i=0;i<hs.length;i++)if(vis(hs[i]))h.push(txt(hs[i]));"
        + "var o=[],os=document.querySelectorAll('button,a,[role=button],[role=link],[role=option],input[type=submit],input[type=button],[tabindex]');"
        + "for(var j=0;j<os.length&&o.length<40;j++){var b=os[j];if(!vis(b)||b.disabled||b.getAttribute('aria-disabled')==='true')continue;"
        + "var t=txt(b);if(t&&t.length<=120&&o.indexOf(t)<0)o.push(t);}"
        + "var body=(document.body&&document.body.innerText)||'';"
        + "var mm=body.match(/([a-z0-9._-]{1,8})\\*{2,}@([a-z0-9*.-]+\\.[a-z]{2,})/i);"
        + "var pw=null,ps=document.querySelectorAll('input[type=password]');for(var k=0;k<ps.length;k++)if(vis(ps[k])){pw=ps[k];break;}"
        + "var tf=[],ts=document.querySelectorAll('input');for(var n=0;n<ts.length;n++){var x=ts[n],ty=(x.type||'text').toLowerCase();"
        + "if((ty==='text'||ty==='email'||ty==='tel'||ty==='number')&&vis(x)&&!x.disabled&&!x.readOnly)tf.push(x);}"
        + "var w=/incorrect|wrong password|password is incorrect|isn't right|isn't correct|كلمة المرور غير صحيحة/i.test(body);"
        + "return JSON.stringify({h:h,o:o,m:mm?mm[0].toLowerCase():'',pw:pw?1:0,pwv:pw&&pw.value?1:0,tn:tf.length,tv:tf.length?tf[0].value:'',"
        + "af:tf.length>0&&tf.every(function(x){return x.value;})?1:0,w:w?1:0});})()";

    /** "1" when the inbox itself is on the screen (Outlook's «New mail» button, message list or
     * «Inbox» folder, and no sign-in field) - the URL alone says "/mail/" a moment before Microsoft
     * sends the page to its sign-in (real, confirmed: the mailbox was called signed in and left at
     * once), so only the rendered inbox counts. "0" otherwise. */
    static final String INBOX_SCRIPT = "(function(){"
        + "function vis(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}"
        + "var ins=document.querySelectorAll('input[type=password],input[name=loginfmt],input[type=email]');"
        + "for(var i=0;i<ins.length;i++)if(vis(ins[i]))return '0';"
        + "if(document.querySelector('[aria-label=\"Message list\"],[aria-label=\"قائمة الرسائل\"],[data-app-section=\"MessageList\"],[role=\"treeitem\"][title=\"Inbox\"]'))return '1';"
        + "var l=document.querySelectorAll('button,[role=button],[role=treeitem],[role=tab],span,div');"
        + "for(var j=0;j<l.length;j++){var el=l[j];if(!vis(el)||el.children.length>2)continue;var t=(el.getAttribute('aria-label')||el.textContent||'').replace(/\\s+/g,' ').trim();"
        + "if(/^(new mail|new message|بريد جديد|رسالة جديدة|inbox|علبة الوارد|البريد الوارد|focused|مركّز|مركز)$/i.test(t))return '1';}"
        + "return '0';})()";

    enum Kind { EMAIL, REQUEST, WAYS, PASSWORD, VERIFY, CODE, TERMS, STAY, ADD_EMAIL, OTHER }

    static final class State {
        final String headings;
        final List<String> options;
        final String masked;
        final boolean hasPassword;
        final boolean passwordTyped;
        final int textFields;
        final String textValue;
        final boolean allFilled;
        final boolean wrongPassword;

        State(String headings, List<String> options, String masked, boolean hasPassword, boolean passwordTyped,
              int textFields, String textValue, boolean allFilled, boolean wrongPassword) {
            this.headings = headings;
            this.options = options;
            this.masked = masked;
            this.hasPassword = hasPassword;
            this.passwordTyped = passwordTyped;
            this.textFields = textFields;
            this.textValue = textValue;
            this.allFilled = allFilled;
            this.wrongPassword = wrongPassword;
        }
    }

    /** evaluateJavascript's JSON-quoted result -> the state, or null when unreadable. */
    static State parse(String evaluateResult) {
        if (evaluateResult == null || "null".equals(evaluateResult)) return null;
        try {
            Object unquoted = new JSONTokener(evaluateResult).nextValue();
            if (!(unquoted instanceof String)) return null;
            JSONObject o = new JSONObject((String) unquoted);
            StringBuilder headings = new StringBuilder();
            JSONArray h = o.optJSONArray("h");
            for (int i = 0; h != null && i < h.length(); i++) headings.append(' ').append(h.optString(i, ""));
            List<String> options = new ArrayList<>();
            JSONArray os = o.optJSONArray("o");
            for (int i = 0; os != null && i < os.length(); i++) options.add(os.optString(i, ""));
            return new State(headings.toString().trim(), options, o.optString("m", ""), o.optInt("pw", 0) == 1,
                o.optInt("pwv", 0) == 1, o.optInt("tn", 0), o.optString("tv", ""), o.optInt("af", 0) == 1, o.optInt("w", 0) == 1);
        } catch (JSONException e) {
            return null;
        }
    }

    private static final Pattern H_REQUEST = Pattern.compile("sign-?in request|approve (the |your )?sign|authenticator app|approve a request|طلب تسجيل الدخول", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_WAYS = Pattern.compile("sign in another way|other ways to sign in|sign-?in options|choose a way|how would you like to sign in|verify your identity|طريقة أخرى", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_VERIFY = Pattern.compile("verify your email|تحقق من بريدك", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_CODE = Pattern.compile("enter (the |your )?(security |verification )?code|check your email|أدخل الرمز|رمز الأمان|رمز التحقق", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_TERMS = Pattern.compile("updating our terms|terms of use|services agreement|privacy statement|تحديث شروطنا", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_STAY = Pattern.compile("stay signed in|البقاء مسجلا|البقاء مسجّلاً", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_ADD_EMAIL = Pattern.compile("add an email|add security info|alternate email|protect your account|recovery email|أضف عنوان بريد|بريد.{0,12}(استرداد|بديل)", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_PASSWORD = Pattern.compile("enter (your )?password|^password$|أدخل كلمة المرور", Pattern.CASE_INSENSITIVE);
    private static final Pattern H_EMAIL = Pattern.compile("^sign in\\b|sign in to|تسجيل الدخول|enter your email|email, phone", Pattern.CASE_INSENSITIVE);

    /** Which of Microsoft's steps the page is - the heading first, then the fields. */
    static Kind kindOf(State s) {
        String h = s.headings;
        if (H_STAY.matcher(h).find()) return Kind.STAY;
        if (H_TERMS.matcher(h).find()) return Kind.TERMS;
        if (H_REQUEST.matcher(h).find()) return Kind.REQUEST;
        if (H_WAYS.matcher(h).find()) return Kind.WAYS;
        if (H_VERIFY.matcher(h).find()) return Kind.VERIFY;
        if (H_ADD_EMAIL.matcher(h).find()) return Kind.ADD_EMAIL;
        if (H_CODE.matcher(h).find()) return Kind.CODE;
        if (s.hasPassword || H_PASSWORD.matcher(h).find()) return Kind.PASSWORD;
        if (H_EMAIL.matcher(h).find() && s.textFields > 0) return Kind.EMAIL;
        return Kind.OTHER;
    }

    /** One step: `click` = a JS regex source for the button to press (clickScript), `fillPassword`
     * = type the saved password first, `passwordFailed` = Microsoft refused it, `stop` = why the
     * automatic sign-in stops here (Arabic, for the operator). Everything null = wait. */
    static final class Step {
        final String click;
        final boolean fillPassword;
        final boolean passwordFailed;
        final String stop;

        private Step(String click, boolean fillPassword, boolean passwordFailed, String stop) {
            this.click = click;
            this.fillPassword = fillPassword;
            this.passwordFailed = passwordFailed;
            this.stop = stop;
        }

        static final Step WAIT = new Step(null, false, false, null);

        static Step click(String regex) {
            return new Step(regex, false, false, null);
        }

        static Step stop(String reason) {
            return new Step(null, false, false, reason);
        }
    }

    static final String NEXT = "^(next|التالي)$";
    static final String OTHER_WAYS = "other ways to sign in|sign in another way|use a different (verification )?(option|method)|try another way|طريقة أخرى";
    static final String USE_PASSWORD = "^use (your|my|a) password|استخدم كلمة المرور";
    static final String SEND_CODE = "^send (the )?code|إرسال الرمز";
    static final String CODE_NEXT = "^(next|verify|continue|submit|التالي|تحقق)$";
    static final String TERMS_NEXT = "^(next|accept|agree|continue|التالي|موافق)$";
    static final String YES = "^(yes|نعم)$";

    /** What to do on this page. `hasPassword` = a «كود البريد» is saved for the device;
     * `passwordFailed` = Microsoft already refused it on this sign-in; `recoveryEmail` = the
     * shop's Gmail where codes can be read. */
    static Step decide(State s, boolean hasPassword, boolean passwordFailed, String recoveryEmail) {
        Kind kind = kindOf(s);
        switch (kind) {
            case EMAIL:
                return s.textValue.isEmpty() ? Step.WAIT : Step.click(NEXT);
            case REQUEST:
                return Step.click(OTHER_WAYS);
            case WAYS: {
                if (hasPassword && !passwordFailed && hasOption(s, USE_PASSWORD)) return Step.click(USE_PASSWORD);
                String code = codeOption(s, recoveryEmail);
                if (code != null) return Step.click(exact(code));
                if (hasPassword && !passwordFailed) return Step.WAIT;
                return Step.stop(passwordFailed
                    ? "كلمة مرور البريد غير صحيحة، ولا يمكن إرسال الرمز إلى بريد المحل - أكمل بنفسك"
                    : "لا «كود بريد» محفوظ لهذا الجهاز ولا يمكن إرسال الرمز إلى بريد المحل - أكمل بنفسك");
            }
            case PASSWORD: {
                if (s.wrongPassword) {
                    if (hasOption(s, OTHER_WAYS)) return new Step(OTHER_WAYS, false, true, null);
                    return new Step(null, false, true, "كلمة مرور البريد غير صحيحة - أكمل بنفسك");
                }
                if (s.passwordTyped) return Step.click(NEXT);
                if (!hasPassword) return Step.stop("لا «كود بريد» محفوظ لهذا الجهاز - اكتبه بنفسك");
                return new Step(null, true, false, null);
            }
            case VERIFY:
            case ADD_EMAIL:
                if (s.textFields == 0) return kind == Kind.ADD_EMAIL ? Step.click(NEXT) : Step.WAIT;
                if (recoveryEmail != null && s.textValue.trim().equalsIgnoreCase(recoveryEmail.trim())) {
                    return Step.click(kind == Kind.VERIFY ? SEND_CODE + "|" + NEXT : NEXT);
                }
                return Step.WAIT; // GmailCodes.recoveryEmailScript types it
            case CODE:
                return s.allFilled ? Step.click(CODE_NEXT) : Step.WAIT; // GmailCodeFetcher types it
            case TERMS:
                return Step.click(TERMS_NEXT);
            case STAY:
                return Step.click(YES);
            default:
                return Step.WAIT;
        }
    }

    private static boolean hasOption(State s, String regex) {
        Pattern p = Pattern.compile(regex, Pattern.CASE_INSENSITIVE);
        for (String option : s.options) if (p.matcher(option).find()) return true;
        return false;
    }

    private static final Pattern CODE_OPTION = Pattern.compile("^(send|email|text) (a |the )?code|^email ", Pattern.CASE_INSENSITIVE);
    private static final Pattern MASKED = Pattern.compile("[a-z0-9._-]{1,8}\\*{2,}@[a-z0-9*.-]+\\.[a-z]{2,}", Pattern.CASE_INSENSITIVE);

    /** The «Send a code to st*****@gmail.com» option whose masked address is the shop's Gmail. */
    static String codeOption(State s, String recoveryEmail) {
        for (String option : s.options) {
            if (!CODE_OPTION.matcher(option).find()) continue;
            java.util.regex.Matcher m = MASKED.matcher(option);
            if (m.find() && maskedMatches(m.group(), recoveryEmail)) return option;
        }
        return null;
    }

    /** Whether "st*****@gmail.com" can be `email` (the shown letters and the domain agree). */
    static boolean maskedMatches(String masked, String email) {
        if (masked == null || email == null || email.trim().isEmpty()) return false;
        StringBuilder regex = new StringBuilder("^");
        boolean star = false;
        for (char c : masked.trim().toLowerCase(Locale.ROOT).toCharArray()) {
            if (c == '*') {
                if (!star) regex.append(".*");
                star = true;
            } else {
                regex.append(Pattern.quote(String.valueOf(c)));
                star = false;
            }
        }
        String pattern = regex.append('$').toString();
        return Pattern.compile(pattern).matcher(email.trim().toLowerCase(Locale.ROOT)).matches();
    }

    /** A regex source matching exactly this button text. */
    static String exact(String text) {
        StringBuilder out = new StringBuilder("^");
        for (char c : text.toCharArray()) {
            if ("\\^$.|?*+()[]{}/".indexOf(c) >= 0) out.append('\\');
            out.append(c);
        }
        return out.append('$').toString();
    }

    /** Presses the visible, enabled button/link whose text matches `regex` (case-insensitive) -
     * the smallest such element, so a container holding several options is never the one pressed.
     * Returns "ok" / "none". */
    static String clickScript(String regex) {
        return "(function(src){var re=new RegExp(src,'i');"
            + "function vis(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}"
            + "var l=document.querySelectorAll('button,a,[role=button],[role=link],[role=option],input[type=submit],input[type=button],[tabindex]'),best=null,bt=1e9;"
            + "for(var i=0;i<l.length;i++){var b=l[i];if(!vis(b)||b.disabled||b.getAttribute('aria-disabled')==='true')continue;"
            + "var t=(b.textContent||b.value||'').replace(/\\s+/g,' ').trim();if(!t||!re.test(t))continue;"
            + "if(t.length<bt){best=b;bt=t.length;}}"
            + "if(!best)return 'none';best.click();return 'ok';})(" + LoginAutofill.literal(regex) + ")";
    }
}
