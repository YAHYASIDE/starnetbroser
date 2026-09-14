package com.starnet.browser.browser

import android.webkit.WebView
import com.starnet.browser.data.DeviceStatus
import com.starnet.browser.data.PageSnapshot
import org.json.JSONObject
import org.json.JSONTokener

object StarlinkPageReader {
    private const val SCAN_STATE_KEY = "starNetReadOnlyScanV3"

    private val script = """
        (function () {
          const visible = (e) => {
            if (!e) return false;
            const s = getComputedStyle(e), r = e.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' &&
                   Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
          };
          const clean = (v) => (v || '').replace(/s+/g, ' ').trim();
          const text = document.body ? document.body.innerText : '';
          const lines = text.split('
').map(clean).filter(Boolean);

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
            let index = lines.findIndex((line, i) =>
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
            const nums = (value || '').match(/d+/g);
            if (!nums || nums.length < 3) return 'UNKNOWN';
            const r = +nums[0], g = +nums[1], b = +nums[2];
            if (g > 105 && g > r * 1.2 && g > b * 1.08) return 'GREEN';
            if (r > 135 && r > g * 1.22 && r > b * 1.18) return 'RED';
            if (r > 145 && g > 70 && g < r * .95 && b < 125) return 'YELLOW';
            if (Math.max(r,g,b) - Math.min(r,g,b) < 35 && r > 70 && r < 210) return 'GRAY';
            return 'UNKNOWN';
          };

          const statusNear = (labelRegex) => {
            const labels = [...document.querySelectorAll('body *')]
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
                  const distance = Math.abs((r.top + r.bottom) / 2 -
                    (labelRect.top + labelRect.bottom) / 2);
                  return { status, distance };
                }).filter(Boolean).sort((a,b) => a.distance - b.distance);
                const colored = dots.find(d => d.status !== 'GRAY');
                if (colored) return colored.status;
                if (dots.length) return dots[0].status;
              }
            }
            return 'UNKNOWN';
          };

          const alertSelectors =
            '[role="alert"], [class*="alert" i], [class*="warning" i], [class*="error" i]';
          let alertReason = '';
          for (const e of document.querySelectorAll(alertSelectors)) {
            const t = clean(e.innerText);
            if (visible(e) && t.length >= 8 && t.length <= 350 &&
                /(offline|standby|suspend|thermal|temperature|obstruct|disconnect|reboot|fault|outage|حرارة|غير متصل|عطل|حجب|استعداد)/i.test(t)) {
              alertReason = t;
              break;
            }
          }
          if (!alertReason) {
            const line = lines.find(t =>
              t.length >= 8 && t.length <= 250 &&
              /(offline|standby|suspend|thermal|high starlink temperature|obstructed|disconnected|rebooting|حرارة|غير متصل|عطل|حجب|استعداد)/i.test(t)
            );
            alertReason = line || '';
          }

          const balanceMatch =
            text.match(/Balances*Due[s:]*([$€£]?)s*([d.,]+)/i) ||
            text.match(/الرصيدs*المستحق[s:]*([$€£]?)s*([d.,]+)/i);
          const serviceState = first(/(Standby Mode Pending|Standby Mode|Suspended|Offline|Online|Active|Rebooting|Disconnected)/i);
          let dishStatus = statusNear(/^STARLINK$/i);
          let wifiStatus = statusNear(/^WIFI/i);
          if (dishStatus === 'UNKNOWN' && /offline|disconnected|غير متصل/i.test(alertReason)) {
            dishStatus = 'RED';
          }

          return JSON.stringify({
            balanceDue: balanceMatch ? balanceMatch[2] : '',
            currency: balanceMatch && balanceMatch[1] ? balanceMatch[1] : '',
            standbyDate: first(/switchs+tos+Standbys+Modes+ons+([A-Za-z0-9,-/ ]+?)(?:.|
|$)/i),
            kitNumber: first(/(KIT[A-Z0-9-]{8,})/i),
            serialNumber:
              first(/Serials+Number[s:]*([A-Z0-9-]{7,})/i) ||
              afterLabel([/^الرقم التسلسلي$/i], 3),
            subscriptionId: first(/(SL-[A-Z]{2}-[d-]+)/i),
            accountNumber: first(/(ACC-[d-]+)/i),
            deviceName: afterLabel([/^Nickname$/i, /^الاسم المستعار$/i, /^اسم الجهاز$/i], 4),
            starlinkId:
              afterLabel([/^Starlink ID$/i, /^معرف Starlink$/i, /^معرف الجهاز$/i], 3) ||
              first(/(d{6,}-d{6,}-[a-f0-9]{8})/i),
            dishStatus: dishStatus,
            wifiStatus: wifiStatus,
            alertReason: alertReason,
            lastUpdated: afterLabel([/^Last Updated$/i, /^آخر تحديث$/i], 3),
            planName: planAfterLabel(),
            serviceStatus: serviceState,
            serviceLocation: afterLabel([/^Service Location$/i, /^موقع الخدمة$/i], 4),
            billingPeriod: first(/Yours+billings+periods+iss+([^
.]+(?:.[^
.]+)?)/i),
            paymentDueDate:
              first(/Payments+dues+([A-Za-z0-9,-/ ]+?)(?:.|
|$)/i) ||
              afterLabel([/^تاريخ استحقاق الدفع$/i], 3),
            softwareVersion: afterLabel([/^Software Version$/i, /^إصدار البرنامج$/i], 3),
            uptime: afterLabel([/^Uptime$/i, /^مدة التشغيل$/i], 3)
          });
        })();
    """.trimIndent()

    fun autofillLogin(webView: WebView, email: String, password: String) {
        if (email.isBlank() && password.isBlank()) return
        if (!isStarlinkPage(webView)) return
        val autofillScript = """
            (function(email, password) {
              const setValue = (element, value) => {
                if (!element || !value) return;
                const setter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype, 'value'
                ).set;
                setter.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
              };
              setValue(document.querySelector(
                'input[type="email"], input[autocomplete="username"], input[name*="email" i]'
              ), email);
              setValue(document.querySelector(
                'input[type="password"], input[autocomplete="current-password"]'
              ), password);
            })(${JSONObject.quote(email)}, ${JSONObject.quote(password)});
        """.trimIndent()
        webView.evaluateJavascript(autofillScript, null)
    }

    fun resetFullScan(webView: WebView) {
        if (!isStarlinkPage(webView)) return
        webView.evaluateJavascript(
            "sessionStorage.removeItem(" + JSONObject.quote(SCAN_STATE_KEY) + ");",
            null
        )
    }

    fun visitNextReadOnlyPage(webView: WebView) {
        if (!isStarlinkPage(webView)) return
        val scanScript = """
            (function() {
              if (document.querySelector('input[type="password"]')) return 'LOGIN';
              const key = ${JSONObject.quote(SCAN_STATE_KEY)};
              let state;
              try {
                state = JSON.parse(sessionStorage.getItem(key)) ||
                  { visited: [], queue: [], clicked: [] };
              } catch (_) {
                state = { visited: [], queue: [], clicked: [] };
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
              const blocked = /(shop|checkout|order|logout|support|ticket|cancel|activate|transfer|reboot|/pay|payment-method|/edit|/change)/i;
              const found = [...document.querySelectorAll('a[href], [role="link"][href]')]
                .map(e => normalize(e.href || e.getAttribute('href')))
                .filter(url => {
                  if (!url) return false;
                  const u = new URL(url);
                  return (u.hostname === 'starlink.com' || u.hostname.endsWith('.starlink.com')) &&
                    safe.test(u.pathname + u.search) && !blocked.test(u.pathname + u.search);
                });
              for (const url of found) {
                if (!state.visited.includes(url) && !state.queue.includes(url) &&
                    state.queue.length < 16) state.queue.push(url);
              }
              state.queue = state.queue.filter(url => !state.visited.includes(url));
              sessionStorage.setItem(key, JSON.stringify(state));
              if (state.queue.length) {
                const next = state.queue.shift();
                sessionStorage.setItem(key, JSON.stringify(state));
                location.href = next;
                return 'VISIT:' + next;
              }

              const safeLabels = [
                'billing','invoices','subscriptions','service lines','starlink','network',
                'الفواتير','الاشتراكات','خطوط الخدمة','ستارلينك','الشبكة'
              ];
              const controls = [...document.querySelectorAll('a,button,[role="link"],[role="button"]')];
              for (const wanted of safeLabels) {
                if (state.clicked.includes(wanted)) continue;
                const element = controls.find(e => {
                  const label = (e.innerText || e.getAttribute('aria-label') ||
                    e.getAttribute('title') || '').replace(/s+/g, ' ').trim().toLowerCase();
                  return label === wanted;
                });
                state.clicked.push(wanted);
                sessionStorage.setItem(key, JSON.stringify(state));
                if (element) {
                  element.click();
                  return 'CLICK:' + wanted;
                }
              }
              return 'DONE';
            })();
        """.trimIndent()
        webView.evaluateJavascript(scanScript, null)
    }

    fun read(webView: WebView, onResult: (PageSnapshot) -> Unit) {
        if (!isStarlinkPage(webView)) return
        webView.evaluateJavascript(script) { raw ->
            runCatching {
                val decoded = JSONTokener(raw).nextValue()
                val json = JSONObject(decoded as? String ?: raw)
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
            }.onSuccess(onResult)
        }
    }

    private fun isStarlinkPage(webView: WebView): Boolean {
        val host = runCatching { android.net.Uri.parse(webView.url).host.orEmpty() }
            .getOrDefault("")
        return host == "starlink.com" || host.endsWith(".starlink.com")
    }
}
