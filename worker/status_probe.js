// Reads the colored STARLINK/Wi-Fi status dots from a live, rendered page.
// This needs real computed CSS (getComputedStyle/getBoundingClientRect), so
// it only works from inside an actual browser page (page.evaluate) - the
// static-HTML text parser in app/reader/parser.py deliberately does not
// attempt this, see its module docstring.
(function () {
  const visible = (e) => {
    if (!e) return false;
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' &&
           Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
  };
  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();

  const colorName = (value) => {
    const nums = (value || '').match(/\d+/g);
    if (!nums || nums.length < 3) return 'UNKNOWN';
    const r = +nums[0], g = +nums[1], b = +nums[2];
    if (g > 105 && g > r * 1.2 && g > b * 1.08) return 'GREEN';
    if (r > 135 && r > g * 1.22 && r > b * 1.18) return 'RED';
    if (r > 145 && g > 70 && g < r * .95 && b < 125) return 'YELLOW';
    if (Math.max(r, g, b) - Math.min(r, g, b) < 35 && r > 70 && r < 210) return 'GRAY';
    return 'UNKNOWN';
  };

  const statusNear = (labelRegex) => {
    const labels = [...document.querySelectorAll('body *')]
      .filter(e => visible(e) && e.children.length === 0 && labelRegex.test(clean(e.textContent)));
    for (const label of labels) {
      let row = label;
      for (let depth = 0; depth < 6 && row; depth++, row = row.parentElement) {
        const labelRect = label.getBoundingClientRect();
        const dots = [...row.querySelectorAll('*')].map(e => {
          if (!visible(e) || e === label) return null;
          const r = e.getBoundingClientRect(), s = getComputedStyle(e);
          const status = colorName(s.backgroundColor);
          const round = parseFloat(s.borderRadius) >= Math.min(r.width, r.height) * .35;
          if (r.width < 6 || r.width > 28 || r.height < 6 || r.height > 28 || !round || status === 'UNKNOWN') {
            return null;
          }
          return { status, distance: Math.abs((r.top + r.bottom - labelRect.top - labelRect.bottom) / 2) };
        }).filter(Boolean).sort((a, b) => a.distance - b.distance);
        const colored = dots.find(d => d.status !== 'GRAY');
        if (colored) return colored.status;
        if (dots.length) return dots[0].status;
      }
    }
    return 'UNKNOWN';
  };

  // Returned as a plain object - Playwright's page.evaluate() serializes
  // this to a native Python dict itself; do NOT JSON.stringify (that was
  // only needed for the old Android WebView.evaluateJavascript bridge).
  return {
    dish_status: statusNear(/^STARLINK$/i),
    wifi_status: statusNear(/^WIFI\b/i),
  };
})();
