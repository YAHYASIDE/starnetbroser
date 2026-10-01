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

    private static final String FIRST = "/first|given|fname|الاسم الأول|الاسم الاول|الإسم الأول/i";
    private static final String LAST = "/last|family|surname|lname|العائلة|اللقب/i";

    /** Microsoft's signup pages. Null when there is no email to create.
     *  - «New email» comes with Microsoft's own «@outlook.com» domain list (a custom drop-down,
     *    real screenshot): only the name before "@" is typed, the domain is picked from the list.
     *  - «Add an email address» (the recovery email Microsoft sends its codes to) gets
     *    `recoveryEmail`, never the new address itself. */
    static String outlookScript(String email, String password, String firstName, String lastName, String recoveryEmail) {
        if (email == null || email.trim().isEmpty()) return null;
        return "(function(e,p,f,l,r){"
            + "if(window.__starnetSignup)return;window.__starnetSignup=1;"
            + PRELUDE
            + "var at=e.indexOf('@'),dom=e.slice(at).toLowerCase();"
            + "function heading(){var h=document.querySelectorAll('h1,h2,[role=heading]'),t='';for(var i=0;i<h.length;i++)if(vis(h[i]))t+=' '+h[i].textContent;return t;}"
            // The domain list next to «New email»: a <select>, or Microsoft's own drop-down.
            + "function picker(el){var c=document.querySelectorAll('select,[role=combobox],[aria-haspopup],button');"
            + "for(var i=0;i<c.length;i++){var x=c[i];if(x===el||!vis(x))continue;"
            + "var t=x.tagName==='SELECT'?((x.options[x.selectedIndex]||{}).text||''):(x.textContent||'');"
            + "if(/@(outlook|hotmail)\\.[a-z.]+/i.test(t))return x;}return null;}"
            + "function pickDomain(x){if(x.tagName==='SELECT'){for(var j=0;j<x.options.length;j++)if(x.options[j].text.toLowerCase().indexOf(dom)>=0){x.selectedIndex=j;"
            + "x.dispatchEvent(new Event('change',{bubbles:true}));return;}return;}"
            + "if((x.textContent||'').toLowerCase().indexOf(dom)>=0)return;x.click();"
            + "setTimeout(function(){var o=document.querySelectorAll('[role=option],[role=menuitem],li,button');"
            + "for(var k=0;k<o.length;k++)if(vis(o[k])&&(o[k].textContent||'').trim().toLowerCase()===dom){o[k].click();return;}},500);}"
            + "function tick(){"
            // The recovery email page: Microsoft's codes go to the shop's own address.
            + "if(/add an email|recovery|security info|protect your account|alternate email|بريد.{0,12}(استرداد|بديل)|أضف عنوان بريد/i.test(heading())){"
            + "if(r&&!d.r){var re=field(/mail|البريد/i,/password|كلمة/i);if(re&&!re.value){put(re,r);d.r=1;}}return;}"
            + "if(!d.e){var el=field(/mail|member|username|البريد/i,/password|كلمة/i);if(el&&!el.value){"
            + "var x=picker(el);if(x)pickDomain(x);"
            + "put(el,x||/new email|بريد إلكتروني جديد/i.test(desc(el))?e.slice(0,at):e);d.e=1;}}"
            + "if(!d.p&&p){var w=document.querySelector('input[type=password]');if(w&&vis(w)&&!w.value){put(w,p);d.p=1;}}"
            + "once('f'," + FIRST + ",f);once('l'," + LAST + ",l);}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>500)clearInterval(t);},700);"
            + "})(" + LoginAutofill.literal(email.trim()) + "," + LoginAutofill.literal(password) + ","
            + LoginAutofill.literal(firstName) + "," + LoginAutofill.literal(lastName) + ","
            + LoginAutofill.literal(recoveryEmail == null ? "" : recoveryEmail.trim()) + ");";
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
            // «معلومات الاتصال»: the names by their labels, else by place - the first and second plain
            // text fields (not the email, phone or country) - since the page's labels aren't always
            // tied to their fields (real screenshot: email and phone filled, names left empty).
            + "var em=field(/mail|البريد/i),tel=field(/tel|phone|mobile|الهاتف|الجوال/i,/mail/i);"
            + "var fi=field(" + FIRST + ",/mail/i),la=field(" + LAST + ",/mail/i);"
            + "if(fi||la||(em&&tel)){"
            + "var plain=[],ins=document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit])');"
            + "for(var i=0;i<ins.length;i++){var x=ins[i];if(!vis(x)||x.disabled||x.readOnly||x===em||x===tel||x.type==='email'||x.type==='tel'"
            + "||x.getAttribute('role')==='combobox'||/mail|phone|tel|الهاتف|البريد|البلد|country/i.test(desc(x)))continue;plain.push(x);}"
            + "if(!fi)fi=plain.filter(function(x){return x!==la;})[0];if(!la)la=plain.filter(function(x){return x!==fi;})[0];"
            + "function fill(k,el,v){if(!d[k]&&el&&!el.value&&v){put(el,v);d[k]=1;}}"
            + "fill('f',fi,f);fill('l',la,l);fill('e',em,e);fill('ph',tel,ph);return;}"
            // On the sign-in page: «تفعيل خدمة Starlink» (once).
            + "if(!d.link){var g=button(/تفعيل خدمة\\s*Starlink|activate\\s*(your\\s*)?starlink/i);if(g){g.click();d.link=1;}}}"
            + "tick();var n=0;var t=setInterval(function(){tick();if(++n>500)clearInterval(t);},700);"
            + "})(" + LoginAutofill.literal(kit.trim()) + "," + LoginAutofill.literal(firstName) + ","
            + LoginAutofill.literal(lastName) + "," + LoginAutofill.literal(email) + "," + LoginAutofill.literal(phone) + ");";
    }
}
