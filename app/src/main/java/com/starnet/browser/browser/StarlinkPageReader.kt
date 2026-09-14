package com.starnet.browser.browser

import android.webkit.WebView
import com.starnet.browser.data.DeviceStatus
import com.starnet.browser.data.PageSnapshot
import org.json.JSONObject
import org.json.JSONTokener

object StarlinkPageReader {
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

          const first = (regex) => {
            const m = text.match(regex);
            return m ? clean(m[1]) : '';
          };

          const colorName = (value) => {
            const nums = (value || '').match(/d+/g);
            if (!nums || nums.length < 3) return 'UNKNOWN';
            const r = +nums[0], g = +nums[1], b = +nums[2];
            if (r < 95 && g > 110 && g > r * 1.25 && g > b * 1.1) return 'GREEN';
            if (r > 145 && r > g * 1.3 && r > b * 1.25) return 'RED';
            if (r > 145 && g > 75 && g < r * 0.9 && b < 100) return 'YELLOW';
            if (Math.max(r,g,b) - Math.min(r,g,b) < 45) return 'GRAY';
            return 'UNKNOWN';
          };

          const statusNear = (labelRegex) => {
            const labels = [...document.querySelectorAll('body *')]
              .filter(e => visible(e) && e.children.length === 0 &&
                labelRegex.test(clean(e.textContent)));
            for (const label of labels) {
              let row = label;
              for (let depth = 0; depth < 5 && row; depth++, row = row.parentElement) {
                const dots = [...row.querySelectorAll('*')].filter(e => {
                  if (!visible(e) || e === label) return false;
                  const r = e.getBoundingClientRect();
                  const s = getComputedStyle(e);
                  const round = parseFloat(s.borderRadius) >= Math.min(r.width, r.height) * .35;
                  return r.width >= 6 && r.width <= 32 && r.height >= 6 &&
                         r.height <= 32 && round &&
                         colorName(s.backgroundColor) !== 'UNKNOWN';
                });
                if (dots.length) {
                  const s = getComputedStyle(dots[dots.length - 1]);
                  return colorName(s.backgroundColor);
                }
              }
            }
            return 'UNKNOWN';
          };

          const alertSelectors =
            '[role="alert"], [class*="alert" i], [class*="warning" i], [class*="error" i]';
          let alertReason = '';
          for (const e of document.querySelectorAll(alertSelectors)) {
            const t = clean(e.innerText);
            if (visible(e) && t.length >= 8 && t.length <= 300 &&
                /(offline|standby|suspend|thermal|temperature|obstruct|disconnect|reboot|fault|outage)/i.test(t)) {
              alertReason = t;
              break;
            }
          }
          if (!alertReason) {
            const line = text.split('
').map(clean).find(t =>
              t.length >= 8 && t.length <= 220 &&
              /(offline|standby|suspend|thermal|high starlink temperature|obstructed|disconnected|rebooting)/i.test(t)
            );
            alertReason = line || '';
          }

          const balanceMatch = text.match(/Balances*Due[s:]*([$€£]?)s*([d.,]+)/i);
          const result = {
            balanceDue: balanceMatch ? balanceMatch[2] : '',
            currency: balanceMatch && balanceMatch[1] ? balanceMatch[1] : '',
            standbyDate: first(/switchs+tos+Standbys+Modes+ons+([A-Za-z0-9,-/ ]+?)(?:.|
|$)/i),
            kitNumber: first(/(KIT[A-Z0-9-]{8,})/i),
            serialNumber: first(/Serials+Number[s:]*([A-Z0-9-]{8,})/i),
            subscriptionId: first(/(SL-[A-Z]{2}-[d-]+)/i),
            dishStatus: statusNear(/^STARLINK$/i),
            wifiStatus: statusNear(/^WIFI/i),
            alertReason: alertReason,
            lastUpdated: first(/Lasts+Updated[s:]*([^
]+)/i)
          };
          return JSON.stringify(result);
        })();
    """.trimIndent()

    fun read(webView: WebView, onResult: (PageSnapshot) -> Unit) {
        val host = runCatching { android.net.Uri.parse(webView.url).host.orEmpty() }
            .getOrDefault("")
        if (!(host == "starlink.com" || host.endsWith(".starlink.com"))) return

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
                    dishStatus = DeviceStatus.from(json.optString("dishStatus")),
                    wifiStatus = DeviceStatus.from(json.optString("wifiStatus")),
                    alertReason = json.optString("alertReason"),
                    lastUpdated = json.optString("lastUpdated")
                )
            }.onSuccess(onResult)
        }
    }
}
