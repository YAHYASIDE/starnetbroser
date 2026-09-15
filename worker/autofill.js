// Fills saved credentials into an already-loaded Starlink login form.
// Never clicks Sign In. Handles React-controlled inputs (native setter +
// input/change/blur events) and looks inside shadow roots and same-origin
// iframes. Ported from the validated Android autofill script.
//
// Called from Python as page.evaluate(AUTOFILL_JS, {"email": ..., "password": ...})
// - Playwright serializes the second argument itself, so credentials never
// pass through manual string interpolation/templating here.
(function ({ email, password }) {
  const roots = [document];
  const walk = (root) => {
    let elements = [];
    try { elements = [...root.querySelectorAll('*')]; } catch (_) {}
    for (const element of elements) {
      try {
        if (element.shadowRoot && !roots.includes(element.shadowRoot)) {
          roots.push(element.shadowRoot);
          walk(element.shadowRoot);
        }
        if (element.tagName === 'IFRAME' && element.contentDocument && !roots.includes(element.contentDocument)) {
          roots.push(element.contentDocument);
          walk(element.contentDocument);
        }
      } catch (_) {}
    }
  };
  walk(document);
  const find = (selectors) => {
    for (const root of roots) {
      for (const selector of selectors) {
        try {
          const element = root.querySelector(selector);
          if (element) return element;
        } catch (_) {}
      }
    }
    return null;
  };
  const setValue = (element, value) => {
    if (!element || !value) return false;
    try {
      const view = element.ownerDocument.defaultView || window;
      const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value').set;
      element.focus();
      setter.call(element, value);
      element.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      element.dispatchEvent(new view.Event('change', { bubbles: true }));
      element.dispatchEvent(new view.Event('blur', { bubbles: true }));
      return element.value === value;
    } catch (_) {
      try {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (_) { return false; }
    }
  };
  const emailInput = find([
    'input[type="email"]', 'input[autocomplete="username"]',
    'input[name*="email" i]', 'input[id*="email" i]',
  ]);
  const passwordInput = find([
    'input[type="password"]', 'input[autocomplete="current-password"]',
    'input[name*="password" i]', 'input[id*="password" i]',
  ]);
  const emailAlreadyFilled = Boolean(emailInput && emailInput.value === email);
  const passwordAlreadyFilled = Boolean(passwordInput && passwordInput.value === password);
  const emailFilled = emailAlreadyFilled || setValue(emailInput, email);
  const passwordFilled = passwordAlreadyFilled || setValue(passwordInput, password);
  // Plain object, not JSON.stringify - see status_probe.js for why.
  return {
    emailFound: Boolean(emailInput),
    passwordFound: Boolean(passwordInput),
    emailFilled: emailFilled,
    passwordFilled: passwordFilled,
  };
})
