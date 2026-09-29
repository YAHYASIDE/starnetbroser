package com.starnetbroser.localbrowser;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The in-app Gmail screens as local HTML (GmailInboxActivity): the one-time «كلمة مرور التطبيق»
 * setup and the inbox list. Pure; every value from a message is HTML-escaped. The pages talk to
 * the app only through the `StarNet` bridge (save / open a Google page / copy a code).
 */
final class MailInboxHtml {

    private MailInboxHtml() {}

    static String escape(String s) {
        if (s == null) return "";
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&': out.append("&amp;"); break;
                case '<': out.append("&lt;"); break;
                case '>': out.append("&gt;"); break;
                case '"': out.append("&quot;"); break;
                case '\'': out.append("&#39;"); break;
                default: out.append(c);
            }
        }
        return out.toString();
    }

    private static final String STYLE = "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<style>"
        + ":root{--bg:#f3f6fb;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--brand:#2f6feb;--mint:#0891b2;--mintbg:#dbf3f9;--red:#e0294a}"
        + "@media(prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#121c2e;--ink:#e6edf7;--muted:#94a3b8;--line:#1e2a3f;--mintbg:#0c2a33}}"
        + "*{box-sizing:border-box}body{margin:0;padding:12px;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}"
        + ".head{display:flex;align-items:center;gap:8px;margin:2px 2px 10px;color:var(--muted);font-size:13px}"
        + ".chip{padding:2px 10px;border-radius:999px;background:var(--mintbg);color:var(--mint);font-weight:700}"
        + ".msg{background:var(--card);border:1.5px solid var(--line);border-radius:14px;margin:0 0 8px;overflow:hidden}"
        + ".msg summary{list-style:none;padding:10px 12px;cursor:pointer}.msg summary::-webkit-details-marker{display:none}"
        + ".row{display:flex;justify-content:space-between;gap:8px}.from{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
        + ".time{color:var(--muted);font-size:12px;white-space:nowrap}.subj{font-weight:600;font-size:14px}"
        + ".prev{color:var(--muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
        + ".body{padding:0 12px 12px;white-space:pre-wrap;word-break:break-word;font-size:13.5px;border-top:1px dashed var(--line)}"
        + ".code{display:inline-block;margin-top:6px;padding:4px 12px;border:0;border-radius:10px;background:var(--brand);color:#fff;font:700 14px system-ui;letter-spacing:2px}"
        + ".card{background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:14px;margin-bottom:10px}"
        + ".step{display:flex;gap:10px;margin:10px 0}.n{flex:none;width:26px;height:26px;border-radius:50%;background:var(--mintbg);color:var(--mint);display:grid;place-items:center;font-weight:800}"
        + ".btn{width:100%;margin-top:6px;padding:10px;border:1.5px solid var(--brand);border-radius:12px;background:transparent;color:var(--brand);font:700 14px system-ui}"
        + ".primary{background:var(--brand);color:#fff}"
        + "input{width:100%;padding:11px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:16px monospace;letter-spacing:1px;direction:ltr}"
        + ".err{color:var(--red);font-weight:700;min-height:20px}.empty{text-align:center;color:var(--muted);padding:40px 10px}"
        + "</style>";

    /** The one-time setup: 2-step verification on, an app password made, pasted here. */
    static String setupPage(String email, String error) {
        return "<!doctype html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>" + STYLE + "</head><body>"
            + "<div class='card'><b>📧 إضافة بريد Gmail داخل التطبيق</b><div class='head' dir='ltr'>" + escape(email) + "</div>"
            + "<div style='color:var(--muted);font-size:13px'>مرة واحدة فقط لهذا الإيميل: Google تسمح لتطبيقات البريد بقراءة Gmail بـ«كلمة مرور التطبيق» (16 حرفاً). بعدها يفتح البريد هنا ويُدخل رمز Starlink تلقائياً.</div></div>"
            + "<div class='card'>"
            + "<div class='step'><span class='n'>1</span><div>فعّل «التحقق بخطوتين» في هذا الحساب (إن لم يكن مفعّلاً).<button class='btn' onclick=\"StarNet.openGoogle('twosv')\">فتح التحقق بخطوتين</button></div></div>"
            + "<div class='step'><span class='n'>2</span><div>افتح «كلمات مرور التطبيقات»، اكتب اسماً مثل <b>STAR NET</b> واضغط «إنشاء»، ثم انسخ الكلمة.<button class='btn' onclick=\"StarNet.openGoogle('apppasswords')\">فتح كلمات مرور التطبيقات</button></div></div>"
            + "<div class='step'><span class='n'>3</span><div style='flex:1'>الصقها هنا:<input id='pw' autocomplete='off' autocapitalize='off' spellcheck='false' placeholder='xxxx xxxx xxxx xxxx'>"
            + "<div class='err' id='err'>" + escape(error) + "</div>"
            + "<button class='btn primary' id='save' onclick=\"var b=this;b.disabled=true;b.textContent='جارِ التجربة…';StarNet.save(document.getElementById('pw').value)\">حفظ وفتح البريد</button></div></div>"
            + "</div></body></html>";
    }

    /** The inbox: newest first, tap a message to read it, a code button on messages that carry one. */
    static String inboxPage(String email, List<MailMessage> newestFirst, TimeZone zone) {
        SimpleDateFormat time = new SimpleDateFormat("dd/MM HH:mm", Locale.US);
        time.setTimeZone(zone);
        StringBuilder out = new StringBuilder("<!doctype html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>")
            .append(STYLE).append("</head><body><div class='head'><span class='chip'>✓ Gmail</span><span dir='ltr'>")
            .append(escape(email)).append("</span></div>");
        if (newestFirst.isEmpty()) out.append("<div class='empty'>لا توجد رسائل في البريد الوارد</div>");
        for (MailMessage m : newestFirst) {
            String code = MailMessages.codeOf(m);
            out.append("<details class='msg'><summary><div class='row'><span class='from' dir='auto'>").append(escape(m.from))
                .append("</span><span class='time' dir='ltr'>").append(escape(time.format(new Date(m.receivedAt))))
                .append("</span></div><div class='subj' dir='auto'>").append(escape(m.subject)).append("</div><div class='prev' dir='auto'>")
                .append(escape(MailMessages.preview(m.text, 90))).append("</div>");
            if (code != null) {
                out.append("<button class='code' onclick=\"event.preventDefault();StarNet.copy('").append(escape(code))
                    .append("')\">📋 ").append(escape(code)).append("</button>");
            }
            out.append("</summary><div class='body' dir='auto'>").append(escape(m.text)).append("</div></details>");
        }
        return out.append("</body></html>").toString();
    }
}
