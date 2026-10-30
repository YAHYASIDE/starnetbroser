"use client";

import { useEffect } from "react";

/**
 * 🌌 The opening screen (his Oct 30 2026 ask: «بدل الشاشة البيضاء قبل البدء: سوداء فيها رسوم 8K ومتحركة»): black, with
 * a moving star field, Earth's glow, a satellite on its orbit and the «★ STAR NET» mark - all CSS and vectors, so
 * it's sharp on any screen. It's in the page's first HTML (dark from the first frame), fades out once the app has
 * started (at least 1.2 s), and shows once per app start (a page reload in the same session skips it).
 */
const SPLASH_CSS = `
#starnet-splash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#02040a;color:#e8eefc;transition:opacity .5s ease,visibility .5s;pointer-events:auto}
html.no-splash #starnet-splash,#starnet-splash.is-done{opacity:0;visibility:hidden;pointer-events:none}
#starnet-splash .sp-stars{position:absolute;inset:-50%;background-image:radial-gradient(1px 1px at 20px 30px,#fff,transparent),radial-gradient(1px 1px at 120px 80px,#cfe1ff,transparent),radial-gradient(1.5px 1.5px at 200px 160px,#fff,transparent),radial-gradient(1px 1px at 60px 200px,#9fc2ff,transparent),radial-gradient(1px 1px at 260px 40px,#fff,transparent),radial-gradient(1.2px 1.2px at 300px 240px,#e6f0ff,transparent);background-size:150px 140px;animation:sp-drift 40s linear infinite;opacity:.85}
#starnet-splash .sp-stars.sp-far{background-size:90px 85px;opacity:.4;animation-duration:70s}
#starnet-splash .sp-earth{position:absolute;bottom:-104vmax;left:50%;width:120vmax;height:120vmax;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle at 50% 8%,#2a6bff 0%,#0b2f7a 22%,#04122f 45%,#02040a 62%);box-shadow:0 -2vmax 8vmax rgba(64,140,255,.45),inset 0 3vmax 6vmax rgba(120,190,255,.35);animation:sp-glow 4s ease-in-out infinite}
#starnet-splash .sp-orbit{position:absolute;width:78vmin;height:78vmin;border-radius:50%;border:1px solid rgba(120,170,255,.18);animation:sp-spin 9s linear infinite}
#starnet-splash .sp-orbit.sp-o2{width:58vmin;height:58vmin;border-color:rgba(120,170,255,.12);animation-duration:6s;animation-direction:reverse}
#starnet-splash .sp-sat{position:absolute;top:-7px;left:50%;width:14px;height:14px;margin-left:-7px;border-radius:3px;background:linear-gradient(135deg,#fff,#8fb6ff);box-shadow:0 0 14px 4px rgba(140,190,255,.8)}
#starnet-splash .sp-sat::before,#starnet-splash .sp-sat::after{content:"";position:absolute;top:4px;width:16px;height:6px;background:linear-gradient(90deg,#1d4fbf,#5d8dff);border-radius:1px}
#starnet-splash .sp-sat::before{right:16px}#starnet-splash .sp-sat::after{left:16px}
#starnet-splash .sp-mark{position:relative;display:grid;justify-items:center;gap:10px;text-align:center}
#starnet-splash .sp-logo{font:800 clamp(30px,9vw,54px)/1 "IBM Plex Sans Arabic",system-ui,sans-serif;letter-spacing:.06em;background:linear-gradient(100deg,#7fb0ff 0%,#ffffff 40%,#7fb0ff 60%,#ffffff 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:sp-shine 2.4s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(90,150,255,.55))}
#starnet-splash .sp-sub{font:500 13px/1.4 "IBM Plex Sans Arabic",system-ui,sans-serif;color:#9db4dd;letter-spacing:.2em}
#starnet-splash .sp-bar{width:140px;height:3px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
#starnet-splash .sp-bar::after{content:"";display:block;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,transparent,#6aa4ff,#fff);animation:sp-load 1.1s ease-in-out infinite}
@keyframes sp-drift{to{transform:translate(160px,140px)}}
@keyframes sp-spin{to{transform:rotate(360deg)}}
@keyframes sp-glow{50%{box-shadow:0 -2vmax 11vmax rgba(64,140,255,.6),inset 0 3vmax 7vmax rgba(120,190,255,.45)}}
@keyframes sp-shine{0%{background-position:100% 0}100%{background-position:-150% 0}}
@keyframes sp-load{0%{transform:translateX(250%)}100%{transform:translateX(-120%)}}
@media (prefers-reduced-motion:reduce){#starnet-splash *{animation-duration:0s!important;animation-iteration-count:1!important}}
`;

/** Before first paint: a page reload in the same app session skips the splash. */
const SPLASH_INIT = `try{if(sessionStorage.getItem("starnet.splashShown"))document.documentElement.classList.add("no-splash")}catch(e){}`;

const MIN_MS = 1200;

export function LaunchSplash() {
  useEffect(() => {
    const el = document.getElementById("starnet-splash");
    if (!el || document.documentElement.classList.contains("no-splash")) {
      el?.remove();
      return;
    }
    try {
      sessionStorage.setItem("starnet.splashShown", "1");
    } catch {
      // storage unavailable - shown again on reload, no harm
    }
    const started = performance.now();
    const wait = Math.max(0, MIN_MS - started);
    const hide = window.setTimeout(() => el.classList.add("is-done"), wait);
    const remove = window.setTimeout(() => el.remove(), wait + 600);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(remove);
    };
  }, []);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: SPLASH_INIT }} />
      <div id="starnet-splash" aria-hidden="true">
        <div className="sp-stars sp-far" />
        <div className="sp-stars" />
        <div className="sp-earth" />
        <div className="sp-orbit">
          <span className="sp-sat" />
        </div>
        <div className="sp-orbit sp-o2" />
        <div className="sp-mark">
          <div className="sp-logo" dir="ltr">★ STAR NET</div>
          <div className="sp-sub" dir="ltr">STARLINK · CREDIT</div>
          <div className="sp-bar" />
        </div>
      </div>
    </>
  );
}
