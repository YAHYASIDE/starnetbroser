package com.starnet.browser.browser

import android.util.Log
import android.webkit.WebView
import com.starnet.browser.data.DeviceStatus
import com.starnet.browser.data.PageSnapshot
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Read-only Starlink account page reader.
 *
 * IMPORTANT: every JS string below lives inside a Kotlin raw string ("""..."""),
 * where backslashes are NOT interpreted by Kotlin. A single backslash here is a
 * single backslash in the generated JavaScript, exactly as needed for \s, \d, \b
 * and \/ escapes. Do not "clean up" these backslashes - a previous edit stripped
 * them and silently broke every regex in this file (this was the root cause of
 * "no data ever extracted": the script threw a SyntaxError on evaluateJavascript
 * and evaluateJavascript never surfaces that error to Kotlin, it just returns
 * "null").
 */
object StarlinkPageReader {
    private const val TAG = "StarNetReader"
    private const val SCAN_STATE_KEY = "starNetReadOnlyScanV5"

    private val script = """
        (function () {
          const documents = [document];
          const shadowTexts = [];
          const walk = (root) => {
            let elements = [];
            try { elements = [...root.querySelectorAll('*')]; } catch (_) {}
            for (const element of elements) {
              try {
                if (element.shadowRoot) {
                  shadowTexts.push(element.shadowRoot.textContent || '');
                  walk(element.shadowRoot);
                }
                if (element.tagName === 'IFRAME' && element.contentDocument) {
                  if (!documents.includes(element.contentDocument)) {
                    documents.push(element.contentDocument);
                    walk(element.contentDocument);
                  }
                }
              } catch (_) {}
            }
          };
          walk(document);

          const visible = (e) => {
            if (!e) return false;
            const s = getComputedStyle(e), r = e.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' &&
                   Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
          };
          const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
          const text = documents.map(d => d.body ? d.body.innerText : '')
            .concat(shadowTexts).join('\n');
          const lines = text.split('\n').map(clean).filter(Boolean);

          const first = (regex) => {
            const m = text.match(regex);
            return m ? clean(m[1]) : '';
          };
          const afterLabel = (labels, maxLookAhead) => {
            const index = lines.findIndex(line => labels.some(r => r.test(line)));
            if (index < 0) return '';
            const skip = /^(copy|edit|manage|pay|learn more|نسخ|تعديل|إدارة|دفع)$/i;
            for (let i = index + 1; i < Math.min(lines.length, index + 1 + maxLookAhead); i++) {
              if (!skip.test(lines[i]) && lines[i].length <= 220) return lines[i];
            }
            return '';
          };
          const planAfterLabel = () => {
            const index = lines.findIndex((line, i) =>
              /^Service Plan$/i.test(line) ||
              (/^Plan$/i.test(line) && i > 0 && /^Service$/i.test(lines[i - 1])) ||
              /^خطة الخدمة$/i.test(line)
            );
            if (index < 0) return '';
            const skip = /^(manage|إدارة|active|online|offline|suspended|standby mode pending|standby|نشط|غير متصل)$/i;
            for (let i = index + 1; i < Math.min(lines.length, index + 8); i++) {
              if (!skip.test(lines[i]) && lines[i].length <= 120) return lines[i];
            }
            return '';
          };

          const colorName = (value) => {
            const nums = (value || '').match(/\d+/g);
            if (!nums || nums.length < 3) return 'UNKNOWN';
            const r = +nums[0], g = +nums[1], b = +nums[2];
            if (g > 105 && g > r * 1.2 && g > b * 1.08) return 'GREEN';
            if (r > 135 && r > g * 1.22 && r > b * 1.18) return 'RED';
            if (r > 145 && g > 70 && g < r * .95 && b < 125) return 'YELLOW';
            if (Math.max(r,g,b) - Math.min(r,g,b) < 35 && r > 70 && r < 210) return 'GRAY';
            return 'UNKNOWN';
          };

          const statusNear = (labelRegex) => {
            for (const doc of documents) {
              const labels = [...doc.querySelectorAll('body *')]
                .filter(e => visible(e) && e.children.length === 0 &&
                  labelRegex.test(clean(e.textContent)));
              for (const label of labels) {
                let row = label;
                for (let depth = 0; depth < 6 && row; depth++, row = row.parentElement) {
                  const labelRect = label.getBoundingClientRect();
                  const dots = [...row.querySelectorAll('*')].map(e => {
                    if (!visible(e) || e === label) return null;
                    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
                    const status = colorName(s.backgroundColor);
                    const round = parseFloat(s.borderRadius) >= Math.min(r.width, r.height) * .35;
                    if (r.width < 6 || r.width > 28 || r.height < 6 || r.height > 28 ||
                        !round || status === 'UNKNOWN') return null;
                    return {
                      status,
                      distance: Math.abs((r.top + r.bottom - labelRect.top - labelRect.bottom) / 2)
                    };
                  }).filter(Boolean).sort((a,b) => a.distance - b.distance);
                  const colored = dots.find(d => d.status !== 'GRAY');
                  if (colored) return colored.status;
                  if (dots.length) return dots[0].status;
                }
              }
            }
            return 'UNKNOWN';
          };

          let alertReason = '';
          for (const doc of documents) {
            const selector = '[role="alert"], [class*="alert" i], [class*="warning" i], [class*="error" i]';
            for (const e of doc.querySelectorAll(selector)) {
              const t = clean(e.innerText || e.textContent);
              if (visible(e) && t.length >= 8 && t.length <= 350 &&
                  /(offline|standby|suspend|thermal|temperature|obstruct|disconnect|reboot|fault|outage|حرارة|غير متصل|عطل|حجب|استعداد)/i.test(t)) {
                alertReason = t;
                break;
              }
            }
            if (alertReason) break;
          }
          if (!alertReason) {
            alertReason = lines.find(t =>
              t.length >= 8 && t.length <= 250 &&
              /(offline|standby|suspend|thermal|high starlink temperature|obstructed|disconnected|rebooting|حرارة|غير متصل|عطل|حجب|استعداد)/i.test(t)
            ) || '';
          }

          const balanceMatch =
            text.match(/Balance\s*Due[\s:]*([$€£]?)\s*([\d.,]+)/i) ||
            text.match(/الرصيد\s*المستحق[\s:]*([$€£]?)\s*([\d.,]+)/i);
          const serviceState = first(/\b(Standby Mode Pending|Standby Mode|Suspended|Offline|Online|Active|Rebooting|Disconnected)\b/i);
          let dishStatus = statusNear(/^STARLINK$/i);
          const wifiStatus = statusNear(/^WIFI\b/i);
          if (dishStatus === 'UNKNOWN' && /offline|disconnected|غير متصل/i.test(alertReason)) {
            dishStatus = 'RED';
          }

          const foundFields = [];
          const track = (name, value) => { if (value) foundFields.push(name); return value; };

          const result = {
            pageUrl: location.href,
            balanceDue: track('balanceDue', balanceMatch ? balanceMatch[2] : ''),
            currency: balanceMatch && balanceMatch[1] ? balanceMatch[1] : '',
            standbyDate: track('standbyDate', first(/switch\s+to\s+Standby\s+Mode\s+on\s+([A-Za-z0-9,\-\/ ]+?)(?:\.|\n|$)/i)),
            kitNumber: track('kitNumber', first(/\b(KIT[A-Z0-9-]{8,})\b/i)),
            serialNumber: track('serialNumber',
              first(/Serial\s+Number[\s:]*([A-Z0-9-]{7,})/i) ||
              afterLabel([/^الرقم التسلسلي$/i], 3)),
            subscriptionId: track('subscriptionId', first(/\b(SL-[A-Z]{2}-[\d-]+)\b/i)),
            accountNumber: track('accountNumber', first(/\b(ACC-[\d-]+)\b/i)),
            deviceName: track('deviceName', afterLabel([/^Nickname$/i, /^الاسم المستعار$/i, /^اسم الجهاز$/i], 4)),
            starlinkId: track('starlinkId',
              afterLabel([/^Starlink ID$/i, /^معرف Starlink$/i, /^معرف الجهاز$/i], 3) ||
              first(/(\d{6,}-\d{6,}-[a-f0-9]{8})/i)),
            dishStatus: dishStatus,
            wifiStatus: wifiStatus,
            alertReason: track('alertReason', alertReason),
            lastUpdated: track('lastUpdated', afterLabel([/^Last Updated$/i, /^آخر تحديث$/i], 3)),
            planName: track('planName', planAfterLabel()),
            serviceStatus: serviceState,
            serviceLocation: track('serviceLocation', afterLabel([/^Service Location$/i, /^موقع الخدمة$/i], 4)),
            billingPeriod: track('billingPeriod', first(/Your\s+billing\s+period\s+is\s+([^\n.]+(?:\.[^\n.]+)?)/i)),
            paymentDueDate: track('paymentDueDate',
              first(/Payment\s+due\s+([A-Za-z0-9,\-\/ ]+?)(?:\.|\n|$)/i) ||
              afterLabel([/^تاريخ استحقاق الدفع$/i], 3)),
            softwareVersion: track('softwareVersion', afterLabel([/^Software Version$/i, /^إصدار البرنامج$/i], 3)),
            uptime: track('uptime', afterLabel([/^Uptime$/i, /^مدة التشغيل$/i], 3)),
            diagFieldsFound: foundFields
          };

          return JSON.stringify(result);
        })();
    """.trimIndent()

    fun autofillLogin(
        webView: WebView,
        email: String,
        password: String,
        onResult: (String) -> Unit = {}
    ) {
        if (!isStarlinkPage(webView)) {
            onResult("بانتظار فتح صفحة starlink.com")
            return
        }
        if (email.isBlank() && password.isBlank()) {
            onResult("لا توجد بيانات دخول محفوظة")
            return
        }
        val autofillScript = """
            (function(email, password) {
              const roots = [document];
              const walk = (root) => {
                let elements = [];
                try { elements = [...root.querySelectorAll('*')]; } catch (_) {}
                for (const element of elements) {
                  try {
                    if (element.shadowRoot && !roots.includes(element.shadowRoot)) {
                      roots.push(element.shadowRoot);
                      walk(element.shadowRoot);
                    }
                    if (element.tagName === 'IFRAME' && element.contentDocument &&
                        !roots.includes(element.contentDocument)) {
                      roots.push(element.contentDocument);
                      walk(element.contentDocument);
                    }
                  } catch (_) {}
                }
              };
              walk(document);
              const find = (selectors) => {
                for (const root of roots) {
                  for (const selector of selectors) {
                    try {
                      const element = root.querySelector(selector);
                      if (element) return element;
                    } catch (_) {}
                  }
                }
                return null;
              };
              const setValue = (element, value) => {
                if (!element || !value) return false;
                try {
                  const view = element.ownerDocument.defaultView || window;
                  const setter = Object.getOwnPropertyDescriptor(
                    view.HTMLInputElement.prototype, 'value'
                  ).set;
                  element.focus();
                  setter.call(element, value);
                  element.dispatchEvent(new view.InputEvent('input', {
                    bubbles: true, inputType: 'insertText', data: value
                  }));
                  element.dispatchEvent(new view.Event('change', { bubbles: true }));
                  element.dispatchEvent(new view.Event('blur', { bubbles: true }));
                  return element.value === value;
                } catch (_) {
                  try {
                    element.value = value;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                  } catch (_) { return false; }
                }
              };
              const emailInput = find([
                'input[type="email"]','input[autocomplete="username"]',
                'input[name*="email" i]','input[id*="email" i]'
              ]);
              const passwordInput = find([
                'input[type="password"]','input[autocomplete="current-password"]',
                'input[name*="password" i]','input[id*="password" i]'
              ]);
              const emailAlreadyFilled = Boolean(emailInput && emailInput.value === email);
              const passwordAlreadyFilled = Boolean(passwordInput && passwordInput.value === password);
              const emailFilled = emailAlreadyFilled || setValue(emailInput, email);
              const passwordFilled = passwordAlreadyFilled || setValue(passwordInput, password);
              return JSON.stringify({
                emailFound: Boolean(emailInput),
                passwordFound: Boolean(passwordInput),
                emailFilled: emailFilled,
                passwordFilled: passwordFilled
              });
            })(${JSONObject.quote(email)}, ${JSONObject.quote(password)});
        """.trimIndent()
        webView.evaluateJavascript(autofillScript) { raw ->
            runCatching {
                val decoded = JSONTokener(raw).nextValue() as? String ?: raw
                val json = JSONObject(decoded)
                Log.d(
                    TAG,
                    "autofill: emailFound=${json.optBoolean("emailFound")} " +
                        "passwordFound=${json.optBoolean("passwordFound")} " +
                        "emailFilled=${json.optBoolean("emailFilled")} " +
                        "passwordFilled=${json.optBoolean("passwordFilled")}"
                )
                when {
                    json.optBoolean("passwordFilled") -> "تم ملء البريد وكلمة المرور — اضغط تسجيل الدخول يدويًا"
                    json.optBoolean("passwordFound") -> "وُجدت خانة كلمة المرور وتعذّر ملؤها"
                    json.optBoolean("emailFound") && json.optBoolean("emailFilled") ->
                        "تم ملء البريد؛ بانتظار خانة كلمة المرور"
                    json.optBoolean("emailFound") -> "وُجدت خانة البريد وتعذّر ملؤها"
                    else -> "لم يتم العثور على خانات الدخول — قد يكون تسجيل الدخول قد تم بالفعل"
                }
            }.onFailure {
                Log.d(TAG, "autofill: تعذر تنفيذ سكربت التعبئة (${it.message})")
            }.onSuccess(onResult)
        }
    }

    fun resetFullScan(webView: WebView) {
        if (!isStarlinkPage(webView)) return
        webView.evaluateJavascript(
            "sessionStorage.removeItem(" + JSONObject.quote(SCAN_STATE_KEY) + ");",
            null
        )
    }

    /**
     * Visits the next queued read-only account/billing/device page, if any.
     * Calls back with "LOGIN" (a password field is still showing), "DONE"
     * (no more safe pages queued) or "VISIT:<url>" (navigation started).
     */
    fun visitNextReadOnlyPage(webView: WebView, onResult: (String) -> Unit = {}) {
        if (!isStarlinkPage(webView)) {
            onResult("DONE")
            return
        }
        val scanScript = """
            (function() {
              if (document.querySelector('input[type="password"]')) return 'LOGIN';
              const key = ${JSONObject.quote(SCAN_STATE_KEY)};
              let state;
              try {
                state = JSON.parse(sessionStorage.getItem(key)) ||
                  { visited: [], queue: [] };
              } catch (_) {
                state = { visited: [], queue: [] };
              }
              const normalize = (value) => {
                try {
                  const u = new URL(value, location.href);
                  u.hash = '';
                  return u.origin + u.pathname + u.search;
                } catch (_) { return ''; }
              };
              const current = normalize(location.href);
              if (current && !state.visited.includes(current)) state.visited.push(current);

              const safe = /(account|billing|invoice|subscription|service|device|hardware|network)/i;
              const blocked = /(shop|checkout|order|logout|log-out|support|ticket|cancel|activate|transfer|reboot|restart|^\/?pay|payment-method|\bedit\b|\bmanage\b|\bchange\b)/i;
              const found = [...document.querySelectorAll('a[href], [role="link"][href]')]
                .map(e => normalize(e.href || e.getAttribute('href')))
                .filter(url => {
                  if (!url) return false;
                  let u;
                  try { u = new URL(url); } catch (_) { return false; }
                  return (u.hostname === 'starlink.com' || u.hostname.endsWith('.starlink.com')) &&
                    safe.test(u.pathname + u.search) && !blocked.test(u.pathname + u.search);
                });
              for (const url of found) {
                if (!state.visited.includes(url) && !state.queue.includes(url) &&
                    state.queue.length < 20) state.queue.push(url);
              }
              state.queue = state.queue.filter(url => !state.visited.includes(url));
              sessionStorage.setItem(key, JSON.stringify(state));
              if (state.queue.length) {
                const next = state.queue.shift();
                sessionStorage.setItem(key, JSON.stringify(state));
                location.href = next;
                return 'VISIT:' + next;
              }

              return 'DONE';
            })();
        """.trimIndent()
        webView.evaluateJavascript(scanScript) { raw ->
            val decoded = runCatching {
                (JSONTokener(raw).nextValue() as? String) ?: raw
            }.getOrDefault(raw).trim('"')
            Log.d(TAG, "scan step: $decoded")
            onResult(decoded)
        }
    }

    fun read(webView: WebView, onResult: (PageSnapshot) -> Unit) {
        if (!isStarlinkPage(webView)) return
        webView.evaluateJavascript(script) { raw ->
            runCatching {
                val decoded = JSONTokener(raw).nextValue()
                val json = JSONObject(decoded as? String ?: raw)
                val foundFields = json.optJSONArray("diagFieldsFound")
                val foundNames = buildList {
                    if (foundFields != null) {
                        for (i in 0 until foundFields.length()) add(foundFields.optString(i))
                    }
                }
                Log.d(TAG, "read: page=${json.optString("pageUrl")} fields=$foundNames")
                PageSnapshot(
                    balanceDue = json.optString("balanceDue"),
                    currency = json.optString("currency"),
                    standbyDate = json.optString("standbyDate"),
                    kitNumber = json.optString("kitNumber"),
                    serialNumber = json.optString("serialNumber"),
                    subscriptionId = json.optString("subscriptionId"),
                    accountNumber = json.optString("accountNumber"),
                    deviceName = json.optString("deviceName"),
                    starlinkId = json.optString("starlinkId"),
                    dishStatus = DeviceStatus.from(json.optString("dishStatus")),
                    wifiStatus = DeviceStatus.from(json.optString("wifiStatus")),
                    alertReason = json.optString("alertReason"),
                    lastUpdated = json.optString("lastUpdated"),
                    planName = json.optString("planName"),
                    serviceStatus = json.optString("serviceStatus"),
                    serviceLocation = json.optString("serviceLocation"),
                    billingPeriod = json.optString("billingPeriod"),
                    paymentDueDate = json.optString("paymentDueDate"),
                    softwareVersion = json.optString("softwareVersion"),
                    uptime = json.optString("uptime")
                )
            }.onFailure {
                Log.d(TAG, "read: تعذر تنفيذ سكربت القراءة (${it.message})")
            }.onSuccess(onResult)
        }
    }

    fun hasData(snapshot: PageSnapshot): Boolean =
        snapshot.balanceDue.isNotBlank() ||
            snapshot.kitNumber.isNotBlank() ||
            snapshot.serialNumber.isNotBlank() ||
            snapshot.subscriptionId.isNotBlank() ||
            snapshot.deviceName.isNotBlank() ||
            snapshot.starlinkId.isNotBlank() ||
            snapshot.planName.isNotBlank() ||
            snapshot.lastUpdated.isNotBlank() ||
            snapshot.dishStatus != DeviceStatus.UNKNOWN ||
            snapshot.wifiStatus != DeviceStatus.UNKNOWN

    private fun isStarlinkPage(webView: WebView): Boolean {
        val host = runCatching { android.net.Uri.parse(webView.url).host.orEmpty() }
            .getOrDefault("")
        return host == "starlink.com" || host.endsWith(".starlink.com")
    }
}
