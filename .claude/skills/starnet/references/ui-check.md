# Checking a screen at 360px / 390px

1. Start the dev server in the background and wait for it:
   ```bash
   cd apps/web && (npm run dev -- -p 3100 > "$SCRATCH/dev.log" 2>&1 &)
   for i in $(seq 1 10); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 4; done
   ```
2. Fake devices for the pages that need them:
   `bash .claude/skills/starnet/scripts/demo-accounts.sh > "$SCRATCH/accts.json"`
3. Write a script like this in the scratchpad (`.cjs`), run it with
   `NODE_PATH=$(npm root -g):$(pwd)/node_modules:$(cd ../.. && pwd)/node_modules node script.cjs "$SCRATCH"`
   from `apps/web`:

```js
const { chromium } = require('playwright-core');
const S = process.argv[2];
const ACCTS = require('fs').readFileSync(S + '/accts.json', 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const width of [360, 390]) {
    const p = await b.newPage({ viewport: { width, height: 800 } });
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    p.on('dialog', (d) => d.accept());                     // window.confirm in the app
    await p.goto('http://localhost:3100/', { waitUntil: 'load' }); await p.waitForTimeout(2000);
    await p.evaluate((ACCTS) => {
      const now = new Date().toISOString();
      localStorage.setItem('starnet_demo_accounts_v1', ACCTS);
      // The reports convert to أوقية only with an MRU rate - without it every total shows 0.
      localStorage.setItem('starnet_currencies_v1', JSON.stringify({
        USD: { code: 'USD', name: 'دولار', symbol: '$', rateFromUsd: 1, updatedAt: now, enabled: true },
        MRU: { code: 'MRU', name: 'أوقية', symbol: 'MRU', rateFromUsd: 40, updatedAt: now, enabled: true },
      }));
      // ...seed whatever the screen needs: starnet_customer_ledger_v1, starnet_clients_v1, ...
    }, ACCTS);
    await p.goto('http://localhost:3100/<page>/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    // click through the new flow, print what matters, read stored results back with p.evaluate
    console.log(width, 'scrollW', await p.evaluate(() => document.documentElement.scrollWidth));
    await p.screenshot({ path: `${S}/shot-${width}.png`, fullPage: true });
    await p.close();
  }
  await b.close();
})();
```

4. Open the screenshots with Read and look at them: clipped titles, squeezed text, empty sections.
5. Stop the server: `pkill -f "next dev"` (exit code 144 is expected).

Notes
- Useful keys: `starnet_demo_accounts_v1`, `starnet_customer_ledger_v1`, `starnet_clients_v1`,
  `starnet_representatives_v1`, `starnet_cash_entries_v1`, `starnet_card_deposits_v1`,
  `starnet.reportsTab`, `starnet.settingsGroup`.
- Native-only features (fingerprint, Gmail, KAST notifications, Telegram service) render nothing or a
  hint in the browser - verify their logic with unit tests and tell the operator to try them on the phone.
