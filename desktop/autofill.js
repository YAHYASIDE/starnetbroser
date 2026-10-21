// 🖥️ Fills a device's Starlink sign-in with its saved email and password - the phone's
// LoginAutofill.script, ported: only empty VISIBLE fields, never submits, only on a login page,
// stops typing the password once the page says it's wrong. Pure (builds the script) - tested in
// autofill.test.js. The values are embedded as JSON literals and never logged.

/** A JSON string literal safe inside a script ("<", ">" and the line separators escaped). */
function literal(value) {
  return JSON.stringify(typeof value === "string" ? value : "")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** null when there is nothing to fill. Keeps checking ~3 minutes (email, «Next», then password). */
function loginScript(email, password) {
  const e = typeof email === "string" ? email.trim() : "";
  const p = typeof password === "string" ? password : "";
  if (!e && !p) return null;
  return (
    "(function(e,p){" +
    "if(window.__starnetAutofill)return;window.__starnetAutofill=1;" +
    "function isLogin(){if(/login|auth|sign/i.test(location.href))return true;" +
    "var h=document.querySelectorAll('h1,h2');for(var i=0;i<h.length;i++){" +
    "if(/\\u062a\\u0633\\u062c\\u064a\\u0644 \\u0627\\u0644\\u062f\\u062e\\u0648\\u0644|sign in|log in|enter your password|connexion|se connecter/i.test(h[i].textContent||''))return true;}return false;}" +
    "function vis(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}" +
    "function put(el,v){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;" +
    "s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}" +
    "function wrong(){return /\\u0643\\u0644\\u0645\\u0629 \\u0627\\u0644\\u0645\\u0631\\u0648\\u0631 \\u063a\\u064a\\u0631 \\u0635\\u062d\\u064a\\u062d\\u0629|incorrect|wrong password|isn't right/i.test((document.body&&document.body.innerText)||'');}" +
    "function each(sel,f){var l=document.querySelectorAll(sel);for(var i=0;i<l.length;i++)if(vis(l[i])&&!l[i].value&&!l[i].__starnet)f(l[i]);}" +
    "function tick(){if(!isLogin())return;" +
    "if(e)each('input[type=email],input[autocomplete=username],input[name*=mail i],input[id*=mail i]',function(m){put(m,e);m.__starnet=1;});" +
    "if(p&&!wrong())each('input[type=password]',function(w){put(w,p);w.__starnet=1;});}" +
    "tick();var n=0;var t=setInterval(function(){tick();if(++n>300)clearInterval(t);},600);" +
    "})(" +
    literal(e) +
    "," +
    literal(p) +
    ");"
  );
}

module.exports = { literal, loginScript };
