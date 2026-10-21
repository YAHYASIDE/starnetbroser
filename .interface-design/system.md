# Design System - STAR NET for Windows (desk)

The laptop layout of the operator's Starlink resale app. Applies only in the Windows app (`html.desk`) at
>= 900px; the phone layout is separate and unchanged. Tokens and components live at the end of
`apps/web/src/app/globals.css` («STAR NET for Windows - its own layout»).

## Direction

**Who:** the shop owner at his laptop through the day, between WhatsApp calls - which dishes stop tonight,
who paid, open a device's Starlink account, record a payment.
**Feel:** a night operations console - the app's own night canvas, calm, dense enough to see 15+ devices
at once, nothing glowing.
**Personality:** Utility & Data. **Foundation:** cool navy (the app's `--bg`). **Depth:** borders-only
(hairlines), no shadows except popovers.

**Signature:** the renewal date read the way the business reads it - the stop instant at midnight: the
tags «الليلة» / «غدًا» / «منتهٍ» beside every date, and the renewal calendar where 29-31 are hatched
«لا فوترة» (Starlink never bills those days) and each day is shaded by how many devices renew on it.
Dish and Wi-Fi are always two separate states, each a sign + a word (+ color).

## Tokens (html.desk)

### Surfaces
`--night` canvas (= `--bg`) · `--deck` panels (= `--surface`) · `--deck-raised` popovers ·
`--well` inputs (darker than the deck) · `--hairline` 9% ink · `--hairline-strong` 16% ink

### Ink (4 steps)
`--ink` primary · `--ink-2` supporting · `--ink-3` labels / metadata (= `--text-muted`) · `--ink-4` faint / empty

### Color
One accent: `--signal` (= `--brand`) for what is chosen, the primary action, the focal count.
`--signal-wash` 14% for selected rows / active nav. State only: `--dish-ok` green, `--dish-weak` amber,
`--dish-down` red. Never decorative.

### Spacing
Base 4px. Component padding 8-16. Page gutter 24. Section gap 16.

### Radius
`--r-s` 6px (buttons, inputs, cells) · `--r-m` 10px (nav items, inner blocks) · `--r-l` 14px (panels)

### Typography
IBM Plex Sans Arabic (the app's face). Scale ~1.2: 11 · 12 · 13 · 14 (base) · 16 · 20 · 26.
Hierarchy by weight + ink: values 600/ink, labels 500/ink-3, meta 400/ink-4. Numbers `tabular-nums`,
LTR inside `<bdi dir="ltr">`.

### Motion
120ms color/background, 160-200ms popovers / panel (`cubic-bezier(0.23, 1, 0.32, 1)`), press scale 0.97,
none under `prefers-reduced-motion`.

## Patterns

- **Sidebar** - 232px (64px folded, remembered `starnet.deskSidebar`), same night as the page, hairline
  apart; groups العمل / المال / أدوات / النظام; item 36px, active = signal-wash + signal ink; folded = icons
  with their names as tips.
- **Top bar** - sticky; page title 20/600 + 12px subtitle, search 36px well (Ctrl K), bell, one primary action.
- **Button** - 32px h · 0 12px · r-s · 13/500 · hairline-strong border; primary = signal fill;
  quiet = no border; sm = 28px.
- **Field** - label 12/500 ink-3 beside a 32px well select.
- **Table** - deck panel r-l; sticky header 36px 12/500 ink-3; rows 48px, hairline dividers, hover 4% ink,
  selected signal-wash; sortable headers (↑ ↓ ↕); columns chosen and saved (`starnet.deskDevices`).
- **Details panel** - 420px beside the table (360px and fewer columns under 1600px, a slide-over with a scrim
  under 1280px); header (name + Starlink holder), frequent actions (فتح الحساب، دفعة، تعديل، المزيد), tabs
  الملخص / الجهاز / المالية / التجديد / الملاحظات / كل الإجراءات (the full phone card - delete lives there).
- **KPI strip** - one deck panel split by hairlines (not separate boxes): label 12/500, value 26/600,
  a 3px share-of-total bar in the state color.
- **Follow-up** - three night-inset columns (الليلة focal with the signal count, غدًا, توقفت).
- **Calendar** - Saturday first, 52px cells, count 16/600, today in signal, picked = signal ring,
  29-31 hatched.

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Borders-only, no glow | Dense daily tool; the phone's glows read as noise on a big screen («تقليل التوهج») | 2026-10-21 |
| One accent (brand blue) | Color means «chosen / do this»; states keep their dish colors | 2026-10-21 |
| Table first, cards optional | 40+ devices must be scanned and sorted; cards stay for a visual pass | 2026-10-21 |
| Panel, not expanding cards | Opening one device never stretches the others | 2026-10-21 |
| Phone card inside «كل الإجراءات» | Every existing action (archive, delete with its confirm) kept, none rewritten | 2026-10-21 |
