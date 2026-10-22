// 🖥️🔑 Starlink's «التحقق بخطوتين» on the laptop (his Oct 22 2026 choice «يقرؤه ويكتبه وحده») - a port of
// the phone's StarlinkTwoStep + MailCode + CodeLog: spot the code page, find the newest code in the
// device's mailbox page text, type it, and keep it in «🔑 الأكواد». Pure (no Electron) - twostep.test.js.

/** "0" = not that page, "1" = the page with an empty code box, "2" = the page, box filled. */
const DETECT_SCRIPT =
  "(function(){var t=(document.body&&document.body.innerText)||'';" +
  "if(!/\\u0627\\u0644\\u062a\\u062d\\u0642\\u0642 \\u0628\\u062e\\u0637\\u0648\\u062a\\u064a\\u0646|two[- ]step|two[- ]factor|\\u0631\\u0645\\u0632 \\u0627\\u0644\\u0645\\u0631\\u0648\\u0631|passcode|one[- ]time code/i.test(t))return '0';" +
  "var ins=document.querySelectorAll('input');for(var i=0;i<ins.length;i++){var x=ins[i];var ty=(x.type||'text').toLowerCase();" +
  "if((ty==='text'||ty==='tel'||ty==='number')&&x.offsetParent!==null&&!x.disabled)return x.value?'2':'1';}return '0';})()";

/** Types the code into the passcode box (React-safe) and presses «التحقق» / Verify. */
function fillScript(code) {
  return (
    "(function(c){var ins=[].slice.call(document.querySelectorAll('input')).filter(function(x){var ty=(x.type||'text').toLowerCase();" +
    "return (ty==='text'||ty==='tel'||ty==='number')&&x.offsetParent!==null&&!x.disabled;});" +
    "var el=ins.filter(function(x){return /one-time|otp|code|passcode|\\u0631\\u0645\\u0632/i.test([x.autocomplete,x.name,x.id,x.placeholder,x.getAttribute('aria-label')].join(' '));})[0]||ins[0];" +
    "if(!el)return 'no-input';var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;" +
    "el.focus();s.call(el,c);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));" +
    "setTimeout(function(){var b=[].slice.call(document.querySelectorAll('button,[role=button],input[type=submit]')).filter(function(x){" +
    "return /^\\s*(\\u0627\\u0644\\u062a\\u062d\\u0642\\u0642|\\u062a\\u062d\\u0642\\u0642|verify|submit|continue|\\u0645\\u062a\\u0627\\u0628\\u0639\\u0629)\\s*$/i.test(x.innerText||x.value||'')&&!x.disabled;})[0];" +
    "if(b)b.click();},700);return 'ok';})(" +
    JSON.stringify(String(code)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e") +
    ");"
  );
}

/** Taps Outlook's «أخرى» / Other tab (its Focused Inbox hides Starlink's code there). */
const OTHER_TAB_SCRIPT =
  "(function(){var l=document.querySelectorAll('[role=tab],button');for(var i=0;i<l.length;i++){" +
  "var t=(l[i].innerText||l[i].textContent||'').replace(/\\s+/g,' ').trim();if(/^(other|\\u0623\\u062e\\u0631\\u0649)$/i.test(t)){l[i].click();return 'clicked';}}return 'none';})()";

const CODE = /(?<![\d.:/,+-])(\d{4,8})(?![\d:/,]|\.\d)/g;
const HINT = /starlink|verification|verify|one[- ]time|passcode|security code|\bcode\b|\bOTP\b|رمز|كود|تحقق|التحقق/i;
const CODE_WORDS = /verification|verify|one[- ]time|passcode|security code|\bcode\b|\bOTP\b|رمز|كود|تحقق/i;
const LOOKAHEAD = 4;

function latinDigits(s) {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).toLowerCase();
}

function codeIn(line) {
  const saysCode = CODE_WORDS.test(line);
  for (const m of latinDigits(line).matchAll(CODE)) {
    const digits = m[1];
    // Starlink codes are 6 digits; another length only when the line says it's a code.
    if (digits.length !== 6 && !saysCode) continue;
    if (digits.length === 4) {
      const n = Number(digits);
      if (n >= 1900 && n <= 2100) continue; // a year
    }
    return digits;
  }
  return null;
}

/** The newest code on the mailbox page (its visible text, newest first), or null. */
function findMailCode(pageText) {
  if (!pageText) return null;
  const lines = String(pageText).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!HINT.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 1 + LOOKAHEAD); j++) {
      const code = codeIn(lines[j]);
      if (code) return code;
    }
  }
  return null;
}

const REMEMBERED = 10;

/** Codes already typed on a device (newest first, ≤ 10) - an old code in the mailbox is never retried. */
function remember(tried, code) {
  return [code, ...(Array.isArray(tried) ? tried : []).filter((c) => c !== code)].slice(0, REMEMBERED);
}

function isNew(code, tried) {
  return Boolean(code) && !(Array.isArray(tried) ? tried : []).includes(code);
}

const LOG_MAX = 200;
const LOG_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** «🔑 الأكواد» on the laptop: [{at, accountId, kind, code}], newest last, 30 days / 200 codes, one per device+code. */
function appendCode(log, entry, now) {
  const kept = (Array.isArray(log) ? log : []).filter(
    (e) => e && now - e.at <= LOG_KEEP_MS && !(e.accountId === entry.accountId && e.code === entry.code),
  );
  if (entry.code) kept.push({ at: entry.at, accountId: entry.accountId || "", kind: entry.kind || "starlink", code: String(entry.code) });
  return kept.slice(-LOG_MAX);
}

module.exports = { DETECT_SCRIPT, OTHER_TAB_SCRIPT, fillScript, findMailCode, remember, isNew, appendCode, LOG_MAX };
