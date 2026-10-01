package com.starnetbroser.localbrowser;

/**
 * 🆕 «إنشاء حساب جديد»: the two pages a brand-new account goes through, filled from what the
 * operator typed in the app.
 *  - Microsoft's «إنشاء حساب» (a new Outlook email): email, password, first and family name - only
 *    empty fields, never a button (Microsoft's human check is the operator's).
 *  - Starlink's «تفعيل Starlink»: the KIT/SN, then «متابعة»; then «معلومات الاتصال»: name, email
 *    and phone - and it stops there, the rest is done by hand. If the page opens on the sign-in
 *    page instead, it taps «تفعيل خدمة Starlink» first.
 * Pure (builds the scripts) so it is unit-tested; the values are only embedded as JSON string
 * literals (LoginAutofill.literal), never logged.
 */
final class SignupFill {

    private SignupFill() {}

    /** Outlook's own "create a free account" link: Microsoft's signup, then the new inbox. */
    static final String OUTLOOK_SIGNUP_URL = "https://outlook.live.com/owa/?nlp=1&signup=1";

    /** Starlink's activation page (the same as «تفعيل خدمة Starlink» on the sign-in page). */
    static final String STARLINK_ACTIVATE_URL = "https://starlink.com/activate";

    /** Microsoft's own signup pages (signup.live.com) - seen before the new inbox counts as made. */
    static boolean isSignupPage(String url) {
        if (!MailUrl.isAllowed(url)) return false;
        try {
            String host = new java.net.URI(url).getHost();
            return host != null && host.toLowerCase(java.util.Locale.ROOT).startsWith("signup.");
        } catch (java.net.URISyntaxException e) {
            return false;
        }
    }

    /** Shared helpers: typing into a React-controlled field, and finding a field by its label. */
    private static final String PRELUDE =
        "function put(el,v){var pr=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;"
        + "var s=Object.getOwnPropertyDescriptor(pr,'value').set;el.focus();s.call(el,v);"
        + "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();}"
        + "function vis(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}"
        + "function desc(el){var t=[el.placeholder,el.getAttribute('aria-label'),el.name,el.id,el.getAttribute('autocomplete'),el.type];"
        + "if(el.labels)for(var i=0;i<el.labels.length;i++)t.push(el.labels[i].textContent);"
        + "var lb=el.getAttribute('aria-labelledby');if(lb)lb.split(' ').forEach(function(id){var x=document.getElementById(id);if(x)t.push(x.textContent);});"
        + "var p=el.parentElement;for(var k=0;k<2&&p;k++){if(p.querySelectorAll('input,textarea,select').length>1)break;t.push(p.textContent);p=p.parentElement;}"
        + "return t.filter(Boolean).join(' | ');}"
        + "function field(re,skip){var l=document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]),textarea');"
        + "for(var i=0;i<l.length;i++){var el=l[i];if(!vis(el)||el.disabled||el.readOnly)continue;var d=desc(el);"
        + "if(re.test(d)&&!(skip&&skip.test(d)))return el;}return null;}"
        + "function button(re){var l=document.querySelectorAll('button,a,[role=button],[role=link],input[type=submit]');"
        + "for(var i=0;i<l.length;i++){var b=l[i];if(!vis(b)||b.disabled||b.getAttribute('aria-disabled')==='true')continue;"
        + "var t=(b.textContent||b.value||'').replace(/\\s+/g,' ').trim();if(re.test(t))return b;}return null;}"
        + "var d={};"
        + "function once(k,re,v,skip){if(d[k]||!v)return;var el=field(re,skip);if(el&&!el.value){put(el,v);d[k]=1;}}";

    private static final String FIRST = "/first|given|الاسم الأول/i";
    private static final String LAST = "/last|family|surname|اسم العائلة/i";

    /** Microsoft's signup pages. Null when there is no email to create. */
    static String outlookScript(String email, String password, String firstName, String lastName) {
        if (email == null || email.trim().isEmpty()) return null;
        return "(function(e,p,f,l){"
            + "if(window.__starnetSignup)return;window.__starnetSignup=1;"
            + PRELUDE
            + "function tick(){"
            // A «@outlook.com» domain picker next to the field: the name goes in, the domain is picked.
            + "if(!d.e){var el=field(/mail|member|username|البريد/i,/password|كلمة/i);if(el&&!el.value){"
            + "var at=e.indexOf('@'),dom=e.slice(at+1),sel=null,ss=document.querySelectorAll('select');"
            + "for(var i=0;i<ss.length;i++){for(var j=0;j<ss[i].options.length;j++){if(ss[i].options[j].text.toLowerCase().indexOf(dom)>=0){sel=ss[i];sel.selectedIndex=j;"
            + "sel.dispatchEvent(new Event('change',{bubbles:true}));break;}}if(sel)break;}"
            + "put(el,sel?e.slice(0,at):e);d.e=1;}}"
            + "if(!d.p&&p){var w=document.querySelector('input[type=password]');if(w&&vis(w)&&!w.value){put(w,p);d.p=1;}}"
            + "once('f'," + FIRST + ",f);once('l'," + LAST + ",l);}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>500)clearInterval(t);},700);"
            + "})(" + LoginAutofill.literal(email.trim()) + "," + LoginAutofill.literal(password) + ","
            + LoginAutofill.literal(firstName) + "," + LoginAutofill.literal(lastName) + ");";
    }

    /** Starlink's activation pages. Null when there is no KIT/SN. */
    static String starlinkScript(String kit, String firstName, String lastName, String email, String phone) {
        if (kit == null || kit.trim().isEmpty()) return null;
        return "(function(a,f,l,e,ph){"
            + "if(window.__starnetActivate)return;window.__starnetActivate=1;"
            + PRELUDE
            + "var KIT=/معرّف\\s*Starlink|معرف\\s*Starlink|Starlink\\s*ID|\\bKIT\\b|serial|التسلسلي/i;"
            + "function tick(){"
            + "var k=field(KIT,/mail|password|بريد|كلمة/i);"
            + "if(k){if(!d.k&&!k.value){put(k,a);d.k=Date.now();}"
            // «متابعة» once the page has taken the KIT in.
            + "if(d.k&&!d.go&&Date.now()-d.k>800){var b=button(/^(متابعة|التالي|استمرار|continue|next)$/i);if(b){b.click();d.go=1;}}return;}"
            + "if(field(" + FIRST + ")||field(" + LAST + ")){"
            + "once('f'," + FIRST + ",f);once('l'," + LAST + ",l);"
            + "once('e',/mail|البريد/i,e);once('ph',/tel|phone|mobile|الهاتف|الجوال/i,ph,/mail/i);return;}"
            // On the sign-in page: «تفعيل خدمة Starlink» (once).
            + "if(!d.link){var g=button(/تفعيل خدمة\\s*Starlink|activate\\s*(your\\s*)?starlink/i);if(g){g.click();d.link=1;}}}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>500)clearInterval(t);},700);"
            + "})(" + LoginAutofill.literal(kit.trim()) + "," + LoginAutofill.literal(firstName) + ","
            + LoginAutofill.literal(lastName) + "," + LoginAutofill.literal(email) + "," + LoginAutofill.literal(phone) + ");";
    }
}
