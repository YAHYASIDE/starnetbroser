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
            + "function tick(){if(!isLogin())return;"
            + "if(e)each('input[type=email],input[autocomplete=username],input[name*=mail i],input[id*=mail i],input[name=loginfmt]',function(m){put(m,e);m.__starnet=1;});"
            + "if(p&&!wrong())each('input[type=password]',function(w){put(w,p);w.__starnet=1;});}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>300)clearInterval(t);},600);"
            + "})(" + literal(hasEmail ? email.trim() : "") + "," + literal(hasPassword ? password : "") + ");";
    }
}
