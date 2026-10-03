package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.List;

/**
 * Starlink's «التحقق بخطوتين» page (a passcode sent to the device email): the script that spots it,
 * the script that types the code and presses «التحقق», and the short memory of codes already
 * tried on a device (so an old code in the mailbox is never typed twice). Pure, unit-tested.
 */
final class StarlinkTwoStep {

    private StarlinkTwoStep() {}

    /** How many recent codes per device are remembered as "already tried". */
    static final int REMEMBERED = 10;

    /** "0" = not that page, "1" = the page with an empty code box, "2" = the page, box filled. */
    static final String DETECT_SCRIPT = "(function(){"
        + "var t=(document.body&&document.body.innerText)||'';"
        + "if(!/\\u0627\\u0644\\u062a\\u062d\\u0642\\u0642 \\u0628\\u062e\\u0637\\u0648\\u062a\\u064a\\u0646|two[- ]step|two[- ]factor|\\u0631\\u0645\\u0632 \\u0627\\u0644\\u0645\\u0631\\u0648\\u0631|passcode|one[- ]time code/i.test(t))return '0';"
        + "var ins=document.querySelectorAll('input');"
        + "for(var i=0;i<ins.length;i++){var x=ins[i];var ty=(x.type||'text').toLowerCase();"
        + "if((ty==='text'||ty==='tel'||ty==='number')&&x.offsetParent!==null&&!x.disabled)return x.value?'2':'1';}"
        + "return '0';})()";

    /** Types the code into the passcode box (React-safe) and presses «التحقق» / Verify. */
    static String fillScript(String code) {
        return "(function(c){"
            + "var ins=[].slice.call(document.querySelectorAll('input')).filter(function(x){var ty=(x.type||'text').toLowerCase();"
            + "return (ty==='text'||ty==='tel'||ty==='number')&&x.offsetParent!==null&&!x.disabled;});"
            + "var el=ins.filter(function(x){return /one-time|otp|code|passcode|\\u0631\\u0645\\u0632/i.test([x.autocomplete,x.name,x.id,x.placeholder,x.getAttribute('aria-label')].join(' '));})[0]||ins[0];"
            + "if(!el)return 'no-input';"
            + "var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
            + "el.focus();s.call(el,c);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));"
            + "setTimeout(function(){var b=[].slice.call(document.querySelectorAll('button,[role=button],input[type=submit]')).filter(function(x){"
            + "return /^\\s*(\\u0627\\u0644\\u062a\\u062d\\u0642\\u0642|\\u062a\\u062d\\u0642\\u0642|verify|submit|continue|\\u0645\\u062a\\u0627\\u0628\\u0639\\u0629)\\s*$/i.test(x.innerText||x.value||'')&&!x.disabled;})[0];"
            + "if(b)b.click();},700);"
            + "return 'ok';})(" + LoginAutofill.literal(code) + ");";
    }

    /** The remembered codes, newest first, from their stored form ("a,b,c"). */
    static List<String> parseTried(String stored) {
        List<String> out = new ArrayList<>();
        if (stored == null || stored.isEmpty()) return out;
        for (String part : stored.split(",")) {
            if (!part.isEmpty()) out.add(part);
        }
        return out;
    }

    /** Adds a tried code (newest first, no duplicates, at most REMEMBERED). */
    static String remember(String stored, String code) {
        List<String> list = parseTried(stored);
        list.remove(code);
        list.add(0, code);
        while (list.size() > REMEMBERED) list.remove(list.size() - 1);
        return String.join(",", list);
    }

    /** Whether the mailbox's newest code is worth typing: present and not tried on this device. */
    static boolean isNew(String code, String stored) {
        return code != null && !parseTried(stored).contains(code);
    }
}
