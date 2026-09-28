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

    /** Null when there is nothing to fill. Keeps checking for ~90s, since Starlink's login is two
     * client-rendered steps (email, then "التالي", then the password). */
    static String script(String email, String password) {
        boolean hasEmail = email != null && !email.trim().isEmpty();
        boolean hasPassword = password != null && !password.isEmpty();
        if (!hasEmail && !hasPassword) return null;
        return "(function(e,p){"
            + "if(window.__starnetAutofill)return;window.__starnetAutofill=1;"
            + "var d={};"
            + "function isLogin(){if(/login|auth|sign/i.test(location.href))return true;"
            + "var h=document.querySelectorAll('h1,h2');for(var i=0;i<h.length;i++){"
            + "if(/\\u062a\\u0633\\u062c\\u064a\\u0644 \\u0627\\u0644\\u062f\\u062e\\u0648\\u0644|sign in|log in/i.test(h[i].textContent||''))return true;}return false;}"
            + "function put(el,v){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
            + "s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}"
            + "function tick(){if(!isLogin())return;"
            + "if(e&&!d.e){var m=document.querySelector('input[type=email],input[autocomplete=username],input[name*=mail i],input[id*=mail i]');"
            + "if(m&&!m.value){put(m,e);d.e=1;}}"
            + "if(p&&!d.p){var w=document.querySelector('input[type=password]');if(w&&!w.value){put(w,p);d.p=1;}}}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>150||(d.e||!e)&&(d.p||!p))clearInterval(t);},600);"
            + "})(" + literal(hasEmail ? email.trim() : "") + "," + literal(hasPassword ? password : "") + ");";
    }
}
