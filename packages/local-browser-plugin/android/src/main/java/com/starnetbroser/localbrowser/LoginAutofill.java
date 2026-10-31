package com.starnetbroser.localbrowser;

/**
 * Fills the Starlink login form with the device's saved email and password (the operator typed
 * them in "إضافة حساب جديد") - only ever empty fields, never submits, and only while the page
 * looks like a login page. Pure (builds the script) so it is unit-tested; the values are never
 * logged, only embedded as JSON string literals.
 */
final class LoginAutofill {

    private LoginAutofill() {}

    /** A JSON string literal safe to embed in a script ("</script>" and line separators escaped). */
    static String literal(String value) {
        if (value == null) return "\"\"";
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                case '<': out.append("\\u003c"); break;
                case '>': out.append("\\u003e"); break;
                case ' ': out.append("\\u2028"); break;
                case ' ': out.append("\\u2029"); break;
                default:
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
            }
        }
        return out.append('"').toString();
    }

    /**
     * 🔢 A code field (Starlink's «التحقق بخطوتين» / «Two-step verification», a payment's code) opens the phone's
     * number pad (his Oct 30 2026 screenshot: the full keyboard came up for «رمز المرور»): `inputmode=numeric`,
     * `autocomplete=one-time-code` on every visible field described as a code - never a password or an email field.
     * Runs on every page of the real Starlink site (watching for 10 minutes, the pages render late); refocuses a field
     * that already had the keyboard so the number pad takes its place.
     */
    static final String NUMPAD_SCRIPT = "(function(){"
        + "if(window.__starnetNumpad)return;window.__starnetNumpad=1;"
        + "var CODE=/code|otp|passcode|verification|one-time|\\u0631\\u0645\\u0632/i,NOT=/password|e-?mail|\\u0643\\u0644\\u0645\\u0629|\\u0628\\u0631\\u064a\\u062f/i;"
        + "function said(el){var t=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('autocomplete')];"
        + "if(el.labels)for(var i=0;i<el.labels.length;i++)t.push(el.labels[i].textContent);"
        + "var box=el.closest&&el.closest('.MuiFormControl-root,.MuiTextField-root,label');if(box)t.push((box.textContent||'').slice(0,60));"
        + "return t.join(' ');}"
        + "function mark(){var l=document.querySelectorAll('input');for(var i=0;i<l.length;i++){var el=l[i],ty=(el.type||'text').toLowerCase();"
        + "if(el.__starnetNum||['text','tel','number',''].indexOf(ty)<0)continue;var d=said(el);"
        + "if(el.getAttribute('autocomplete')!=='one-time-code'&&(!CODE.test(d)||NOT.test(d)))continue;"
        + "el.__starnetNum=1;el.setAttribute('inputmode','numeric');el.setAttribute('pattern','[0-9]*');el.setAttribute('autocomplete','one-time-code');"
        + "if(document.activeElement===el){el.blur();setTimeout(function(x){return function(){x.focus();};}(el),50);}}}"
        + "mark();new MutationObserver(function(){mark();}).observe(document.documentElement,{childList:true,subtree:true});"
        + "var n=0,t=setInterval(function(){mark();if(++n>600)clearInterval(t);},1000);"
        + "})();";

    /** Null when there is nothing to fill. Keeps checking for ~3 minutes, since both sign-ins are
     * client-rendered steps (email, then «التالي»/Next, then the password). Only VISIBLE fields:
     * Microsoft's page carries a hidden password input on its email step, and filling that one
     * left the real field empty. Once the page says the password is wrong, the saved one is not
     * typed again (the operator picks or types the right one). */
    static String script(String email, String password) {
        boolean hasEmail = email != null && !email.trim().isEmpty();
        boolean hasPassword = password != null && !password.isEmpty();
        if (!hasEmail && !hasPassword) return null;
        return "(function(e,p){"
            + "if(window.__starnetAutofill)return;window.__starnetAutofill=1;"
            + "function isLogin(){if(/login|auth|sign/i.test(location.href))return true;"
            + "var h=document.querySelectorAll('h1,h2');for(var i=0;i<h.length;i++){"
            + "if(/\\u062a\\u0633\\u062c\\u064a\\u0644 \\u0627\\u0644\\u062f\\u062e\\u0648\\u0644|sign in|log in|enter your password/i.test(h[i].textContent||''))return true;}return false;}"
            + "function vis(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}"
            + "function put(el,v){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
            + "s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}"
            + "function wrong(){return /\\u0643\\u0644\\u0645\\u0629 \\u0627\\u0644\\u0645\\u0631\\u0648\\u0631 \\u063a\\u064a\\u0631 \\u0635\\u062d\\u064a\\u062d\\u0629|incorrect|wrong password|isn't right/i.test((document.body&&document.body.innerText)||'');}"
            + "function each(sel,f){var l=document.querySelectorAll(sel);for(var i=0;i<l.length;i++)if(vis(l[i])&&!l[i].value&&!l[i].__starnet)f(l[i]);}"
            // Microsoft's recovery-email steps («Verify your email» / «Add an email address») ask for
            // ANOTHER address - the device's own email must never go there (real screenshot).
            + "function recov(){var h=document.querySelectorAll('h1,h2,[role=heading]'),t='';for(var i=0;i<h.length;i++)t+=' '+h[i].textContent;"
            + "return " + GmailCodes.RECOVERY_HEADINGS + ".test(t)||/\\*{2,}@/.test((document.body&&document.body.innerText)||'');}"
            // 🔑 Starlink trying a passkey («Signing in with passkey…») hangs in this browser (his Oct 30 2026
            // screenshot): with a saved password, «Continue with Password» is tapped after ~2 s, at most twice.
            + "var pkSeen=0,pkTaps=0;function skipPasskey(){if(!p||pkTaps>=2)return;"
            + "if(!/passkey|\\u0645\\u0641\\u062a\\u0627\\u062d \\u0627\\u0644\\u0645\\u0631\\u0648\\u0631|cl\\u00e9 d.acc\\u00e8s/i.test((document.body&&document.body.innerText)||'')){pkSeen=0;return;}"
            + "var f=document.querySelectorAll('input[type=password]');for(var j=0;j<f.length;j++)if(vis(f[j]))return;"
            + "if(++pkSeen<3)return;var b=document.querySelectorAll('button,a,[role=button]');for(var i=0;i<b.length;i++){var x=(b[i].textContent||'').trim();"
            + "if(vis(b[i])&&/continue with password|use (your )?password|\\u0643\\u0644\\u0645\\u0629 \\u0627\\u0644\\u0645\\u0631\\u0648\\u0631|mot de passe/i.test(x)&&!/forgot|reset|\\u0646\\u0633\\u064a\\u062a|oubli/i.test(x)){b[i].click();pkTaps++;pkSeen=0;return;}}}"
            + "function tick(){if(!isLogin())return;skipPasskey();"
            + "if(e&&!recov())each('input[type=email],input[autocomplete=username],input[name*=mail i],input[id*=mail i],input[name=loginfmt]',function(m){put(m,e);m.__starnet=1;});"
            + "if(p&&!wrong())each('input[type=password]',function(w){put(w,p);w.__starnet=1;});}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>300)clearInterval(t);},600);"
            + "})(" + literal(hasEmail ? email.trim() : "") + "," + literal(hasPassword ? password : "") + ");";
    }
}
