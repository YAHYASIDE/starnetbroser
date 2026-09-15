# The GitHub Pages preview link - what it actually is

`.github/workflows/staging.yml` publishes `https://<owner>.github.io/starnetbroser/`
after every push to `claude/cloud-remote-browser` that passes its tests. Before
using it, understand exactly what it can and can't show you.

## What it is

A **static status page**: which commit is currently built, when it was
built, the backend test result count, and a direct download link for that
build's APK (also published as the `staging-latest` GitHub Release - see
below). It's there so you can glance at a phone browser and confirm "yes,
this is today's build" without digging through Actions run logs.

## What it is NOT

**It does not run the app.** STAR NET Browser is a native Android
application (Kotlin/Jetpack Compose) - there is no way to "open" a native
Android app inside a web page. GitHub Pages only serves static files
(HTML/CSS/JS); it cannot run a Python backend, a Postgres database, Docker
containers, or Playwright/Chromium. So this page can never show you the
actual cloud browser session, noVNC view, or live Starlink data - only a
VPS deployment can do that (see `docs/DEPLOYMENT.md` and
`.github/workflows/deploy-vps.yml`).

Concretely: **a green Pages preview proves the code built and the backend
tests passed - it is not evidence the cloud browser (Playwright/Chromium/
Starlink login) actually works.** Only a real VPS deployment and the
acceptance tests in the original task description prove that.

## Data safety

The page template (`scripts/render_status_page.py`) only ever renders
build metadata it's given as command-line arguments (commit hash, a
timestamp, a pass/fail count, three fixed URLs) - it has no access to the
database, no access to any StarlinkAccount row, and no way to render
anything else even by mistake. Nothing resembling a real account, password,
cookie, or session ever passes through this workflow.

## One-time setup this needs from you

GitHub Pages must be enabled once, manually, in the repository's settings
(there's no API this session's tools can drive for repo-admin settings):

1. Go to **Settings -> Pages** in the `starnetbroser` repo.
2. Under **Build and deployment -> Source**, choose **GitHub Actions**.
3. Save. The next push to `claude/cloud-remote-browser` (or the next manual
   run of the "Staging Preview" workflow) will then successfully deploy.

If this hasn't been done yet, the `deploy` job in `staging.yml` will fail
with a clear "Pages site not found"-style error - that's the signal to do
the step above, not a bug in the workflow.
