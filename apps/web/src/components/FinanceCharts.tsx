"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/formatAmount";

/** Categorical slots in fixed order (validated set: adjacent pairs pass CVD + normal vision in both
 * themes). A 9th slice folds into «أخرى» - never a generated color. */
const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)"];

function mru(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))}`;
}

/** ⭕ One ratio as a ring - its value inside, its name below; a tap shows how it is computed and the
 * numbers it comes from. `ratio` undefined = «لا توجد بيانات كافية». */
export function Ring({ label, ratio, tone, how }: { label: string; ratio?: number; tone: "good" | "bad" | "warn" | "rev"; how: string }) {
  const [open, setOpen] = useState(false);
  const r = 26;
  const c = 2 * Math.PI * r;
  const shown = ratio === undefined ? 0 : Math.max(0, Math.min(1, ratio));
  const color = tone === "good" ? "var(--green)" : tone === "bad" ? "var(--red)" : tone === "warn" ? "var(--yellow)" : "var(--chart-1)";
  return (
    <div className={`fin-ring${open ? " fin-ring-open" : ""}`}>
      <button type="button" className="fin-ring-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 64 64" className="fin-ring-svg" role="img" aria-label={`${label}: ${ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`}`}>
          <circle cx="32" cy="32" r={r} className="fin-ring-track" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${shown * c} ${c}`} transform="rotate(-90 32 32)" />
          <text x="32" y="36" textAnchor="middle" className="fin-ring-text">
            {ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`}
          </text>
        </svg>
        <span className="fin-ring-label">{label}</span>
      </button>
      {open && <p className="fin-ring-how">{ratio === undefined ? `لا توجد بيانات كافية. ${how}` : how}</p>}
    </div>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
}

/** 🍩 A share of a whole: slices in fixed color order with a 2px gap, and a legend with each value
 * and % (the labels carry the identity, not the color alone). Tap a row to highlight its slice. */
export function Donut({ title, slices, unit = "أوقية" }: { title: string; slices: Slice[]; unit?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const positive = slices.filter((s) => s.value > 0.5);
  const folded = positive.length > 8 ? [...positive.slice(0, 7), { key: "other", label: "أخرى", value: positive.slice(7).reduce((sum, s) => sum + s.value, 0) }] : positive;
  const total = folded.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <p className="party-empty">{title}: لا توجد أرقام في هذه الفترة.</p>;
  const r = 30;
  const c = 2 * Math.PI * r;
  const gap = folded.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="fin-donut">
      <strong className="fin-donut-title">{title}</strong>
      <div className="fin-donut-body">
        <svg viewBox="0 0 80 80" className="fin-donut-svg" role="img" aria-label={title}>
          <circle cx="40" cy="40" r={r} className="fin-ring-track" strokeWidth="12" />
          {folded.map((s, i) => {
            const len = (s.value / total) * c;
            const dash = `${Math.max(0.5, len - gap)} ${c}`;
            const el = (
              <circle
                key={s.key}
                cx="40"
                cy="40"
                r={r}
                fill="none"
                stroke={CAT[i]}
                strokeWidth={active === s.key ? 15 : 12}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform="rotate(-90 40 40)"
                opacity={active && active !== s.key ? 0.35 : 1}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <ul className="fin-donut-legend">
          {folded.map((s, i) => (
            <li key={s.key}>
              <button type="button" className={active === s.key ? "fin-donut-on" : undefined} onClick={() => setActive(active === s.key ? null : s.key)}>
                <i style={{ background: CAT[i] }} aria-hidden="true" />
                <span>{s.label}</span>
                <bdi dir="ltr">{mru(s.value)}</bdi>
                <small>{Math.round((s.value / total) * 100)}%</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <small className="fin-donut-unit">{unit}</small>
    </div>
  );
}

/** 🎯 A half-circle gauge: how far the monthly profit goal is. */
export function Gauge({ label, done, target }: { label: string; done: number; target: number }) {
  const ratio = target > 0 ? done / target : 0;
  const shown = Math.max(0, Math.min(1, ratio));
  const r = 52;
  const len = Math.PI * r;
  const color = ratio >= 1 ? "var(--green)" : ratio >= 0.8 ? "var(--yellow)" : "var(--chart-1)";
  return (
    <div className="fin-gauge" role="img" aria-label={`${label}: ${Math.round(ratio * 100)}%`}>
      <svg viewBox="0 0 128 72" className="fin-gauge-svg">
        <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" className="fin-ring-track" strokeWidth="10" strokeLinecap="round" />
        <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${shown * len} ${len}`} />
        <text x="64" y="58" textAnchor="middle" className="fin-gauge-text">{`${Math.round(ratio * 100)}%`}</text>
      </svg>
      <span className="fin-gauge-label">{label}</span>
      <small className="fin-gauge-sub">
        <bdi dir="ltr">{mru(done)}</bdi> من <bdi dir="ltr">{mru(target)}</bdi> أوقية
      </small>
    </div>
  );
}
