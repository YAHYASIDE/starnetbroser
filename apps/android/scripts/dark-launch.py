"""🌑 The launch screen dark, not white (his Oct 30 2026 report: «دائمًا وقت فتح التطبيق تظهر هذه الشاشة البيضاء»).

Capacitor's generated project shows a white `@drawable/splash` image while the app starts. The native project
is regenerated in CI, so this runs after `npx cap add android`: a plain #060A14 drawable (the app's own dark
ground, capacitor.config.ts backgroundColor) for the launch theme, also as Android 12's splash background.
Run from apps/android: python3 scripts/dark-launch.py
"""

import pathlib
import re
import sys

RES = pathlib.Path("android/app/src/main/res")
COLOR = "#060A14"

styles = RES / "values" / "styles.xml"
if not styles.exists():
    sys.exit(f"missing {styles} - run after `npx cap add android`")

(RES / "drawable").mkdir(parents=True, exist_ok=True)
(RES / "drawable" / "starnet_launch.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
    f'    <solid android:color="{COLOR}" />\n'
    "</shape>\n",
    encoding="utf-8",
)
(RES / "values" / "starnet_launch_colors.xml").write_text(
    f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="starnet_launch_bg">{COLOR}</color>\n</resources>\n',
    encoding="utf-8",
)

text = styles.read_text(encoding="utf-8")
launch = re.search(r'<style name="AppTheme\.NoActionBarLaunch"[^>]*>(.*?)</style>', text, re.S)
if not launch:
    sys.exit("AppTheme.NoActionBarLaunch not found in styles.xml")
body = (
    "\n        <item name=\"android:background\">@drawable/starnet_launch</item>"
    "\n        <item name=\"android:windowBackground\">@drawable/starnet_launch</item>"
    "\n        <item name=\"windowSplashScreenBackground\">@color/starnet_launch_bg</item>\n    "
)
text = text[: launch.start(1)] + body + text[launch.end(1) :]
styles.write_text(text, encoding="utf-8")
print("dark launch screen: ok")
