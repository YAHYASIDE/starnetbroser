// 🌐 The customers' page: «#j.…» = the request forms, «#v.…» = one customer's «حسابي». Talks only to the owner's
// portal Firebase project (REST, no sign-in): a request is sealed here with his public key before it leaves the phone.
import { cleanRequest, firestoreDocUrl, openView, readHash, sealForOwner } from "./portal.js";

const app = document.getElementById("app");
const link = readHash(location.hash);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function shell(inner) {
  const biz = esc((link && link.data.n) || "STAR NET");
  document.title = biz;
  app.innerHTML = `<header><div class="logo" aria-hidden="true">📡</div><div><h1>${biz}</h1><p class="sub">ستارلينك</p></div></header>${inner}`;
}

function fail(text) {
  shell(`<div class="card"><p>${esc(text)}</p></div>`);
}

function digitsLatin(s) {
  return String(s).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}

// ---- requests ----

function form(kind, prefill = {}) {
  const existing = kind === "existing";
  shell(`
    <p class="sub" style="margin-top:4px">سجّل جهازك عندنا - نراجع طلبك ونتواصل معك.</p>
    <div class="tabs" role="group">
      <button type="button" class="tab" data-kind="existing" aria-pressed="${existing}">📡 عندي حساب</button>
      <button type="button" class="tab" data-kind="new" aria-pressed="${!existing}">🆕 جهاز جديد</button>
    </div>
    <form class="card" id="f" novalidate>
      <label for="name">الاسم الكامل</label>
      <input id="name" name="name" autocomplete="name" required maxlength="80" value="${esc(prefill.name)}">
      <label for="phone">رقم الهاتف <span class="opt">(اختياري)</span></label>
      <input id="phone" name="phone" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" maxlength="30" value="${esc(prefill.phone)}">
      ${
        existing
          ? `<label for="email">إيميل حساب ستارلينك</label>
      <input id="email" name="email" type="email" dir="ltr" inputmode="email" autocomplete="email" required maxlength="120">
      <label for="emailCode">كود البريد <span class="opt">(كلمة سر الإيميل)</span></label>
      <input id="emailCode" name="emailCode" dir="ltr" autocomplete="off" maxlength="120">
      <label for="wifiCode">كود الواي فاي</label>
      <input id="wifiCode" name="wifiCode" dir="ltr" autocomplete="off" maxlength="120">
      <p class="hint">🔒 تُقفَل بياناتك على هاتفك ولا يقرؤها إلا ${esc((link && link.data.n) || "STAR NET")}.</p>`
          : `<label for="kit">رقم KIT أو SN</label>
      <input id="kit" name="kit" dir="ltr" autocomplete="off" required maxlength="60" placeholder="KIT… / SN">
      <p class="hint">تجده على علبة الجهاز أو على ملصق خلف الطبق.</p>`
      }
      <button class="go" type="submit">إرسال</button>
      <div id="err" class="err" hidden></div>
    </form>`);
  for (const b of app.querySelectorAll(".tab")) b.addEventListener("click", () => form(b.dataset.kind, { name: app.querySelector("#name").value, phone: app.querySelector("#phone").value }));
  const f = app.querySelector("#f");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = app.querySelector("#err");
    const val = (id) => (f.querySelector(`#${id}`) ? f.querySelector(`#${id}`).value : "");
    const req = cleanRequest({ kind, name: val("name"), phone: digitsLatin(val("phone")), email: val("email"), emailCode: val("emailCode"), wifiCode: val("wifiCode"), kit: digitsLatin(val("kit")) });
    if (!req) {
      err.hidden = false;
      err.textContent = !val("name").trim() ? "اكتب اسمك الكامل." : existing ? "اكتب إيميلًا صحيحًا مثل name@gmail.com" : "اكتب رقم KIT أو SN.";
      return;
    }
    const btn = f.querySelector("button.go");
    btn.disabled = true;
    btn.textContent = "⏳ جارِ الإرسال…";
    err.hidden = true;
    try {
      const sealed = await sealForOwner(link.data.e, { ...req, sentAt: new Date().toISOString() });
      const res = await fetch(firestoreDocUrl(link.data.p, `portal/${link.data.s}/requests`, link.data.k), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { c: { stringValue: sealed } } }),
      });
      if (!res.ok) throw new Error(String(res.status));
      shell(`<div class="card ok"><div class="big">✅</div><h2>وصل طلبك</h2><p>شكرًا ${esc(req.name)}، سنراجعه ونتواصل معك قريبًا.</p><button type="button" class="link" id="again">إرسال طلب آخر</button></div>`);
      app.querySelector("#again").addEventListener("click", () => form(kind, { name: req.name, phone: req.phone }));
    } catch {
      btn.disabled = false;
      btn.textContent = "إرسال";
      err.hidden = false;
      err.textContent = "لم يُرسل - تأكد من الإنترنت وحاول مرة أخرى.";
    }
  });
}

// ---- «حسابي» ----

/** "+ 12,000 أوقية" → the signed number kept left-to-right, the currency after it. */
function amountHtml(text) {
  const m = String(text).match(/^([+-]?\s?[\d,.]+)\s+(.+)$/);
  return m ? `<bdi dir="ltr">${esc(m[1].replace(/\s/g, ""))}</bdi> ${esc(m[2])}` : esc(text);
}

function daysText(d) {
  if (!d.renewal) return d.status.includes("لم يُفعَّل") ? "" : "موعد التجديد: لم يُقرأ بعد";
  const day = d.renewal.replace(/-/g, "/");
  if (d.daysLeft === null || d.daysLeft <= 0) return `⛔ انتهى الاشتراك - موعده كان <bdi dir="ltr">${esc(day)}</bdi>`;
  if (d.daysLeft === 1) return `⏰ ينتهي الليلة (<bdi dir="ltr">${esc(day)}</bdi>)`;
  return `🗓️ التجديد يوم <bdi dir="ltr">${esc(day)}</bdi> - بعد ${d.daysLeft - 1} يوم`;
}

async function account() {
  const { p, k, s, t, x } = link.data;
  let res;
  try {
    res = await fetch(firestoreDocUrl(p, `portal/${s}/views/${t}`, k));
  } catch {
    return fail("لا يوجد اتصال بالإنترنت - حاول بعد قليل.");
  }
  if (res.status === 404 || res.status === 403) return fail("هذا الرابط لم يعد يعمل - اطلب رابطًا جديدًا.");
  if (!res.ok) return fail("تعذّر الفتح الآن - حاول بعد قليل.");
  let v;
  try {
    const doc = await res.json();
    v = await openView(x, doc.fields.c.stringValue);
  } catch {
    return fail("هذا الرابط لم يعد يعمل - اطلب رابطًا جديدًا.");
  }
  if (v.business) link.data.n = v.business;
  const owed = v.owed.length
    ? `<div class="owed">💰 عليك: ${v.owed.map((o) => `<bdi>${esc(o)}</bdi>`).join(" + ")}</div>`
    : `<div class="owed zero">✓ لا شيء عليك</div>`;
  const credit = v.credit.length ? `<p class="muted">لك عندنا: ${v.credit.map((o) => `<bdi>${esc(o)}</bdi>`).join(" + ")}</p>` : "";
  const devices = v.devices.length
    ? v.devices
        .map((d) => `<div class="dev"><b>🛰️ ${esc(d.name)}</b><span>${esc(d.status)}</span>${daysText(d) ? `<br><span class="muted">${daysText(d)}</span>` : ""}${d.price ? `<br><span class="muted">سعر التجديد: <bdi>${esc(d.price)}</bdi></span>` : ""}</div>`)
        .join("")
    : `<p class="muted">لا يوجد جهاز مسجّل باسمك بعد.</p>`;
  const rows = v.rows.length
    ? `<div class="card"><h2>🧾 آخر العمليات</h2>${v.rows
        .map((r) => `<div class="row"><span class="l">${esc(r.label)}<br><span class="muted"><bdi dir="ltr">${esc(r.date.replace(/-/g, "/"))}</bdi></span></span><span class="a ${r.paid ? "paid" : ""}">${amountHtml(r.amount)}</span></div>`)
        .join("")}</div>`
    : "";
  const at = new Date(v.at);
  const updated = Number.isNaN(at.getTime()) ? "" : at.toLocaleString("ar", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  shell(`
    <div class="card"><h2>مرحبًا ${esc(v.name)} 👋</h2>${owed}${credit}</div>
    <div class="card"><h2>📡 أجهزتك</h2>${devices}</div>
    ${rows}
    ${v.pay ? `<div class="card"><h2>💳 طرق الدفع</h2><p class="pay">${esc(v.pay)}</p></div>` : ""}
    ${link.data.e ? `<p style="text-align:center"><button type="button" class="link" id="add">➕ أضف جهازًا آخر</button></p>` : ""}
    <p class="muted" style="text-align:center">آخر تحديث: <bdi>${esc(updated)}</bdi></p>`);
  const add = app.querySelector("#add");
  if (add) add.addEventListener("click", () => form("new", { name: v.name }));
}

if (!link || !link.data.p || !link.data.k || !link.data.s) fail("افتح الرابط الذي وصلك من STAR NET كما هو.");
else if (link.kind === "j") {
  if (!link.data.e) fail("الرابط ناقص - اطلب رابطًا جديدًا.");
  else form("existing");
} else if (!link.data.t || !link.data.x) fail("الرابط ناقص - اطلب رابطًا جديدًا.");
else void account();

addEventListener("hashchange", () => location.reload());
