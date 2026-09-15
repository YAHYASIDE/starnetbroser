#!/usr/bin/env python3
"""Renders the static GitHub Pages status page published by
.github/workflows/staging.yml.

Deliberately a plain stdlib script (no Jinja/deps to install) since it
runs as one CI step. It renders ONLY build metadata (commit, timestamp,
test counts, links) - never anything from a real Starlink account, and
never talks to the backend/database, since this page is static and public.
"""
from __future__ import annotations

import argparse
import html


TEMPLATE = """<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>STAR NET Browser — معاينة تجريبية</title>
<style>
  :root {{
    color-scheme: light dark;
    --bg: #f3f7f5;
    --card: #ffffff;
    --ink: #0f2a20;
    --muted: #5b7268;
    --accent: #17a65b;
    --accent-ink: #ffffff;
    --border: #dbe7e1;
    --warn-bg: #fff4e5;
    --warn-ink: #7a4a00;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #0b1310;
      --card: #121c18;
      --ink: #eaf3ef;
      --muted: #9fb6ad;
      --border: #223129;
      --warn-bg: #2a2010;
      --warn-ink: #f0c675;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding-block: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-bottom));
    padding-inline: 16px;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
    line-height: 1.6;
  }}
  .wrap {{ max-width: 640px; margin: 0 auto; }}
  h1 {{ font-size: 1.4rem; margin: 0 0 4px; }}
  .sub {{ color: var(--muted); margin: 0 0 24px; font-size: 0.95rem; }}
  .card {{
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px;
    margin-bottom: 16px;
  }}
  .card h2 {{ font-size: 1rem; margin: 0 0 10px; color: var(--muted); font-weight: 600; }}
  .row {{ display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); }}
  .row:last-child {{ border-bottom: none; }}
  .row .k {{ color: var(--muted); }}
  .row .v {{ font-weight: 600; text-align: left; direction: ltr; }}
  .btn {{
    display: block;
    text-align: center;
    background: var(--accent);
    color: var(--accent-ink);
    text-decoration: none;
    font-weight: 700;
    padding: 14px 18px;
    border-radius: 12px;
    margin-bottom: 12px;
  }}
  .btn.secondary {{
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--border);
  }}
  .warn {{
    background: var(--warn-bg);
    color: var(--warn-ink);
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 0.9rem;
    margin-bottom: 20px;
  }}
  .status-ok {{ color: var(--accent); font-weight: 700; }}
  .status-bad {{ color: #c0392b; font-weight: 700; }}
  footer {{ color: var(--muted); font-size: 0.8rem; text-align: center; margin-top: 24px; }}
</style>
</head>
<body>
<div class="wrap">
  <h1>STAR NET Browser</h1>
  <p class="sub">معاينة تجريبية تلقائية لفرع claude/cloud-remote-browser</p>

  <div class="warn">
    ⚠️ هذه صفحة حالة فقط (معلومات البناء والتنزيل) - وليست التطبيق نفسه يعمل داخل المتصفح.
    STAR NET Browser تطبيق أندرويد أصلي (Native)، والمتصفح السحابي (Playwright/Chromium/noVNC)
    لا يعمل على GitHub Pages إطلاقًا - فقط على خادم حقيقي (VPS) بعد إعداده.
  </div>

  <a class="btn" href="{apk_url}">⬇️ تنزيل آخر نسخة APK (staging-latest)</a>
  <a class="btn secondary" href="{run_url}">عرض تفاصيل آخر بناء في GitHub Actions</a>

  <div class="card">
    <h2>معلومات هذا البناء</h2>
    <div class="row"><span class="k">Commit</span><span class="v"><a href="{commit_url}">{commit}</a></span></div>
    <div class="row"><span class="k">وقت البناء (UTC)</span><span class="v">{build_time}</span></div>
    <div class="row"><span class="k">اختبارات الخادم الخلفي</span>
      <span class="v {tests_class}">{tests_label}</span>
    </div>
  </div>

  <footer>
    يُبنى هذا تلقائيًا بعد كل Push إلى claude/cloud-remote-browser فقط عند نجاح الاختبارات.
    لا يحتوي على أي بيانات حسابات Starlink حقيقية.
  </footer>
</div>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--commit-url", required=True)
    parser.add_argument("--build-time", required=True)
    parser.add_argument("--pass-count", required=True)
    parser.add_argument("--fail-count", required=True)
    parser.add_argument("--apk-url", required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    failed = args.fail_count not in ("0", "?", "")
    tests_label = (
        f"{html.escape(args.pass_count)} ناجح"
        + (f" / {html.escape(args.fail_count)} فاشل" if failed else "")
    )

    page = TEMPLATE.format(
        commit=html.escape(args.commit),
        commit_url=html.escape(args.commit_url, quote=True),
        build_time=html.escape(args.build_time),
        tests_class="status-bad" if failed else "status-ok",
        tests_label=tests_label,
        apk_url=html.escape(args.apk_url, quote=True),
        run_url=html.escape(args.run_url, quote=True),
    )

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(page)


if __name__ == "__main__":
    main()
