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
     * "w": 1 when Starlink says the password is wrong, "e": the visible email field's value,
     * "ef": 1 when an (enabled) email field shows}. */
    static final String SCRIPT = "(function(){"
        // Really on the screen: a sized but hidden/off-screen field (Starlink's email step carries one -
        // real, confirmed silent wait) must not count as "the password step".
        + "function vis(el){if(el.offsetParent===null&&getComputedStyle(el).position!=='fixed')return false;var r=el.getBoundingClientRect();"
        + "if(r.width<=0||r.height<=0||r.bottom<=0||r.right<=0)return false;var s=getComputedStyle(el);return s.visibility!=='hidden'&&s.opacity!=='0';}"
        // The visible one: Microsoft's sign-in also carries a hidden password input.
        + "var l=document.querySelectorAll('input[type=password]'),f=null;"
        + "for(var i=0;i<l.length;i++){if(vis(l[i])){f=l[i];break;}}"
        + "var m=document.querySelectorAll('input[type=email],input[autocomplete=username],input[name*=mail i],input[id*=mail i],input[name=loginfmt]'),e=null;"
        + "for(var j=0;j<m.length;j++){if(vis(m[j])&&!m[j].disabled&&!m[j].readOnly){e=m[j];break;}}"
        // Else any visible plain field holding an address, or labelled as the email (Starlink's own form).
        + "if(!e){var a=document.querySelectorAll('input[type=text],input:not([type])');for(var k=0;k<a.length;k++){var x=a[k];if(!vis(x)||x.disabled||x.readOnly)continue;"
        + "var d=[x.placeholder,x.getAttribute('aria-label'),x.name,x.id].join(' ');if(x.value.indexOf('@')>0||/mail|بريد/i.test(d)){e=x;break;}}}"
        + "var t=((document.body&&document.body.innerText)||'').toLowerCase();"
        + "var w=/كلمة المرور غير صحيحة|كلمة السر غير صحيحة|incorrect password|wrong password|password is incorrect|invalid email or password|password isn't right/.test(t);"
        + "return JSON.stringify({p:f?f.value:'',f:f?1:0,w:w?1:0,e:e?e.value:'',ef:e?1:0,a:window.__starnetAutoNote||''});})()";

    static final class State {
        final String password;
        final boolean hasPasswordField;
        final boolean wrongPassword;
        final String email;
        final boolean hasEmailField;
        /** The in-page automatic sign-in's last note (AUTO_SCRIPT), "" when it isn't running. */
        final String note;

        State(String password, boolean hasPasswordField, boolean wrongPassword) {
            this(password, hasPasswordField, wrongPassword, "", false, "");
        }

        State(String password, boolean hasPasswordField, boolean wrongPassword, String email, boolean hasEmailField) {
            this(password, hasPasswordField, wrongPassword, email, hasEmailField, "");
        }

        State(String password, boolean hasPasswordField, boolean wrongPassword, String email, boolean hasEmailField, String note) {
            this.password = password;
            this.hasPasswordField = hasPasswordField;
            this.wrongPassword = wrongPassword;
            this.email = email;
            this.hasEmailField = hasEmailField;
            this.note = note;
        }
    }

    /** evaluateJavascript's JSON-quoted string result -> the state, or null when unreadable. */
    static State parse(String evaluateResult) {
        if (evaluateResult == null || "null".equals(evaluateResult)) return null;
        try {
            Object unquoted = new JSONTokener(evaluateResult).nextValue();
            if (!(unquoted instanceof String)) return null;
            JSONObject o = new JSONObject((String) unquoted);
            return new State(o.optString("p", ""), o.optInt("f", 0) == 1, o.optInt("w", 0) == 1, o.optString("e", ""), o.optInt("ef", 0) == 1, o.optString("a", ""));
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

    /** 🤖 The automatic Starlink sign-in (after the automatic Outlook one), run INSIDE the page
     * like SignupFill's «متابعة» (real, confirmed to press there): every 0.7 s, once the typed
     * email (LoginAutofill) has sat for a moment it presses «التالي»; once the typed password has,
     * «تسجيل الدخول» - a real button/submit input first (never a wrapper carrying the same text),
     * else the field's form, else Enter. Up to 3 presses per step, 4 s apart; stops on Starlink's
     * "wrong password". «التحقق بخطوتين» is typed and pressed by StarlinkTwoStep. Its last note is
     * left in window.__starnetAutoNote for the watch (SCRIPT) to read: "next:ok", "in:form",
     * "wait:e-", "stuck:next", "wrong". */
    static final String NEXT = "^(التالي|next|continue)(\\s|$)";
    static final String SIGN_IN = "^(تسجيل الدخول|sign in|log in)(\\s|$)";

    static final String AUTO_SCRIPT = "(function(){"
        + "if(window.__starnetAutoLogin)return;window.__starnetAutoLogin=1;"
        + "function vis(el){if(el.offsetParent===null&&getComputedStyle(el).position!=='fixed')return false;var r=el.getBoundingClientRect();"
        + "if(r.width<=0||r.height<=0||r.bottom<=0||r.right<=0)return false;var s=getComputedStyle(el);return s.visibility!=='hidden'&&s.opacity!=='0';}"
        + "function txt(b){return (b.textContent||b.value||'').replace(/\\s+/g,' ').trim();}"
        + "function wrong(){return /كلمة المرور غير صحيحة|كلمة السر غير صحيحة|incorrect password|wrong password|password is incorrect|invalid email or password|password isn't right/i.test((document.body&&document.body.innerText)||'');}"
        + "function press(re,f){var l=document.querySelectorAll('button,input[type=submit],input[type=button],a,[role=button],[role=link],[tabindex]'),best=null,bs=-1e9;"
        + "for(var i=0;i<l.length;i++){var b=l[i];if(!vis(b)||b.disabled||b.getAttribute('aria-disabled')==='true')continue;"
        + "var t=txt(b);if(!t||t.length>40||!re.test(t))continue;var s=(b.tagName==='BUTTON'||b.tagName==='INPUT'?1000:0)-t.length;if(s>=bs){best=b;bs=s;}}"
        + "if(best){best.click();return 'ok';}"
        + "var form=f.form||f.closest('form');"
        + "if(form){var sb=form.querySelector('button[type=submit],input[type=submit],button:not([type])');if(sb&&vis(sb)&&!sb.disabled){sb.click();return 'form';}"
        + "if(form.requestSubmit){form.requestSubmit();return 'form';}}"
        + "['keydown','keypress','keyup'].forEach(function(k){f.dispatchEvent(new KeyboardEvent(k,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));});return 'enter';}"
        + "function pwField(){var l=document.querySelectorAll('input[type=password]');for(var i=0;i<l.length;i++)if(vis(l[i])&&!l[i].disabled)return l[i];return null;}"
        + "function emField(){var m=document.querySelectorAll('input[type=email],input[autocomplete=username],input[name*=mail i],input[id*=mail i]');"
        + "for(var j=0;j<m.length;j++)if(vis(m[j])&&!m[j].disabled&&!m[j].readOnly)return m[j];"
        + "var a=document.querySelectorAll('input[type=text],input:not([type])');for(var k=0;k<a.length;k++){var x=a[k];if(!vis(x)||x.disabled||x.readOnly)continue;"
        + "var d=[x.placeholder,x.getAttribute('aria-label'),x.name,x.id].join(' ');if(x.value.indexOf('@')>0||/mail|بريد/i.test(d))return x;}return null;}"
        + "var NEXT=new RegExp(" + LoginAutofill.literal(NEXT) + ",'i'),IN=new RegExp(" + LoginAutofill.literal(SIGN_IN) + ",'i');"
        + "var d={n:0,i:0,at:0,seen:0,step:''};"
        + "function note(v){window.__starnetAutoNote=v;}"
        + "function tick(){if(wrong()){note('wrong');return;}"
        + "var pw=pwField(),em=emField(),now=Date.now(),step='',f=null;"
        + "if(em&&em.value.indexOf('@')>0&&(!pw||!pw.value)){step='next';f=em;}else if(pw&&pw.value){step='in';f=pw;}"
        + "if(!step){d.step='';d.seen=0;note('wait:'+(em?'e':'-')+(pw?'p':'-'));return;}"
        // The typed value must have sat for a moment (the page takes it in) before the press.
        + "if(step!==d.step){d.step=step;d.seen=now;return;}if(now-d.seen<800||now-d.at<4000)return;"
        + "var k=step==='next'?'n':'i';if(d[k]>=3){note('stuck:'+step);return;}d[k]++;d.at=now;"
        + "note(step+':'+press(step==='next'?NEXT:IN,f));}"
        + "tick();var n=0;var t=setInterval(function(){tick();if(++n>600)clearInterval(t);},700);"
        + "})();";

    /** What the watch sees, for the one diagnostic toast when nothing gets pressed. */
    static String describe(State s, String url) {
        String where = "";
        try {
            java.net.URI u = new java.net.URI(url);
            where = u.getHost() + (u.getPath() == null ? "" : u.getPath());
        } catch (java.net.URISyntaxException | NullPointerException ignored) {
            // no url to show
        }
        return "بريد " + (s.hasEmailField ? (s.email.isEmpty() ? "فارغ" : "مكتوب") : "لا") + " · كلمة " + (s.hasPasswordField ? (s.password.isEmpty() ? "فارغة" : "مكتوبة") : "لا")
            + (s.wrongPassword ? " · خطأ" : "") + " · " + (s.note.isEmpty() ? "السكربت لا يعمل" : s.note) + " · " + where;
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
