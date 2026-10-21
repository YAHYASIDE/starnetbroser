"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { ACTION_LABELS, monthWeeks, WEEKDAYS, type FollowUp } from "@/lib/deskDashboard";
import { renewalOf, starlinkDue, statusView } from "@/lib/deskTable";
import { renewalDateLabel } from "@/lib/date";
import { formatAmount } from "@/lib/formatAmount";
import { currencyLabel } from "@/lib/telegramMessages";
import type { BalanceByCurrency } from "@/lib/ledgerStore";

export interface DeskKpi {
  /** HomeView's status filter it opens on «الأجهزة» ("" = all devices). */
  filter: string;
  label: string;
  value: number;
  tone: "calm" | "ok" | "soon" | "down";
}

interface Props {
  kpis: DeskKpi[];
  total: number;
  follow: FollowUp<StarlinkAccountSummary>;
  dayCounts: Map<number | string, number>;
  devicesOnDay: (day: number) => StarlinkAccountSummary[];
  clientName: (device: StarlinkAccountSummary) => string;
  /** What the customers owe on their devices, per currency (positive = they owe). */
  customersOwe: BalanceByCurrency;
  /** Devices Starlink stopped while their D is still unpaid. */
  stoppedWithD: number;
  /** The phone's every list of devices (the circles), folded. */
  allLists: ReactNode;
  /** The phone's banners (backup, update, D…). */
  notices: ReactNode;
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function deviceHref(device: StarlinkAccountSummary) {
  return `/devices?id=${encodeURIComponent(device.id)}`;
}

function FollowColumn({ title, hint, list, href, clientName, focal = false }: { title: string; hint: string; list: StarlinkAccountSummary[]; href: string; clientName: (d: StarlinkAccountSummary) => string; focal?: boolean }) {
  return (
    <section className={`desk-follow-col${focal ? " is-focal" : ""}`} aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span className="desk-follow-count desk-num">{list.length}</span>
      </header>
      <p className="desk-follow-hint">{hint}</p>
      {list.length === 0 ? (
        <p className="desk-faint desk-follow-empty">لا شيء هنا ✓</p>
      ) : (
        <ul>
          {list.slice(0, 6).map((d) => (
            <li key={d.id}>
              <Link href={deviceHref(d)} className="desk-follow-row">
                <span className="desk-follow-name" dir="auto">{d.name || d.starlinkAccountHolderName || "بدون اسم"}</span>
                <span className="desk-follow-meta">{clientName(d) || "بدون زبون"}</span>
                {starlinkDue(d) > 0 && (
                  <bdi dir="ltr" className="desk-num desk-follow-due">
                    {formatAmount(starlinkDue(d))} {d.currency || "$"}
                  </bdi>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <Link href={href} className="desk-link desk-follow-more">
          عرض الكل ({list.length})
        </Link>
      )}
    </section>
  );
}

export function DeskDashboard(props: Props) {
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [day, setDay] = useState<number>(() => Math.min(today.getDate(), 28));
  const weeks = monthWeeks(month.y, month.m);
  // How full each day is, against the busiest one - the calendar's own shading.
  const busiest = Math.max(1, ...Array.from({ length: 28 }, (_, i) => props.dayCounts.get(i + 1) ?? 0));
  const isThisMonth = month.y === today.getFullYear() && month.m === today.getMonth();
  const onDay = props.devicesOnDay(day);
  const owe = Object.entries(props.customersOwe).filter(([, v]) => typeof v === "number" && Math.abs(v) > 0.005);
  const shift = (delta: number) =>
    setMonth((cur) => {
      const d = new Date(cur.y, cur.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="desk-home">
      {props.notices}

      <section className="desk-kpis" aria-label="المؤشرات الرئيسية">
        {props.kpis.map((k) => (
          <Link key={k.label} href={k.filter ? `/devices?f=${k.filter}` : "/devices"} className={`desk-kpi desk-kpi-${k.tone}`}>
            <span className="desk-kpi-label">{k.label}</span>
            <span className="desk-kpi-value desk-num">{k.value}</span>
            <span className="desk-kpi-bar" aria-hidden="true">
              <span style={{ inlineSize: `${props.total ? Math.round((k.value / props.total) * 100) : 0}%` }} />
            </span>
          </Link>
        ))}
      </section>

      <div className="desk-home-grid">
        <section className="desk-card desk-follow" aria-label="المتابعة">
          <header className="desk-card-head">
            <h2>المتابعة</h2>
            <Link href="/devices?exp=week" className="desk-link">
              كل ما ينتهي هذا الأسبوع
            </Link>
          </header>
          <div className="desk-follow-cols">
            <FollowColumn title="تنتهي الليلة" hint="آخر ليلة لها - جدّدها اليوم" list={props.follow.tonight} href="/devices?exp=today" clientName={props.clientName} focal />
            <FollowColumn title="تنتهي غدًا" hint="آخر ليلة غدًا" list={props.follow.tomorrow} href="/devices?exp=tomorrow" clientName={props.clientName} />
            <FollowColumn title="توقفت" hint="وصل تاريخ توقفها - الأحدث أولًا" list={props.follow.expired} href="/devices?exp=expired" clientName={props.clientName} />
          </div>
        </section>

        <div className="desk-home-side">
        <aside className="desk-card desk-money-sum" aria-label="ملخص مالي">
          <header className="desk-card-head">
            <h2>المال</h2>
            <Link href="/money" className="desk-link">
              حسابي
            </Link>
          </header>
          <dl className="desk-kvs">
            <div className="desk-kv">
              <dt>على الزبائن (الأجهزة)</dt>
              <dd>
                {owe.length === 0 ? (
                  <span className="desk-faint">لا ديون</span>
                ) : (
                  <span className="desk-owed">
                    {owe.map(([c, v]) => (
                      <bdi key={c} dir="ltr" className={`desk-num ${(v as number) > 0 ? "desk-owed-due" : "desk-owed-credit"}`}>
                        {formatAmount(Math.abs(v as number))} {currencyLabel(c)}
                      </bdi>
                    ))}
                  </span>
                )}
              </dd>
            </div>
            <div className="desk-kv">
              <dt>موقوفة وعليها D</dt>
              <dd>
                {props.stoppedWithD > 0 ? (
                  <Link href="/starlink" className="desk-link">
                    <span className="desk-num">{props.stoppedWithD}</span> جهاز - سدّد Starlink
                  </Link>
                ) : (
                  <span className="desk-faint">لا شيء</span>
                )}
              </dd>
            </div>
          </dl>
          <p className="desk-faint desk-money-note">كل عملة وحدها، بلا تحويل - التفاصيل والتحويل في «حسابي».</p>
        </aside>
        <section className="desk-card desk-action-card" aria-label="تحتاج إجراءً">
          <header className="desk-card-head">
            <h2>
              تحتاج إجراءً <span className="desk-num desk-faint">({props.follow.action.length})</span>
            </h2>
          </header>
          {props.follow.action.length === 0 ? (
            <p className="desk-faint desk-follow-empty">لا شيء ينتظرك ✓</p>
          ) : (
            <ul className="desk-action-ul">
              {props.follow.action.slice(0, 10).map(({ account, reasons }) => (
                <li key={account.id}>
                  <Link href={deviceHref(account)} className="desk-action-row">
                    <span dir="auto">{account.name || "بدون اسم"}</span>
                    <span className="desk-action-reasons">
                      {reasons.map((r) => (
                        <span key={r} className="desk-tag desk-tag-soon">
                          {ACTION_LABELS[r]}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>

      <section className="desk-card desk-calendar-card" aria-label="تقويم التجديد">
        <header className="desk-card-head">
          <h2>تقويم التجديد</h2>
          <div className="desk-month-nav">
            <button type="button" className="desk-icon-btn" onClick={() => shift(-1)} aria-label="الشهر السابق">
              ›
            </button>
            <strong>
              {MONTHS[month.m]} <bdi className="desk-num">{month.y}</bdi>
            </strong>
            <button type="button" className="desk-icon-btn" onClick={() => shift(1)} aria-label="الشهر التالي">
              ‹
            </button>
          </div>
        </header>
        <div className="desk-calendar-wrap">
          <table className="desk-calendar">
            <thead>
              <tr>
                {WEEKDAYS.map((w) => (
                  <th key={w} scope="col">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, i) => (
                <tr key={i}>
                  {week.map((d, j) => {
                    if (d === null) return <td key={j} className="is-out" />;
                    const count = d <= 28 ? props.dayCounts.get(d) ?? 0 : 0;
                    const noBilling = d > 28;
                    const isToday = isThisMonth && d === today.getDate();
                    return (
                      <td key={j} className={`${noBilling ? "is-nobill" : ""}${isToday ? " is-today" : ""}${d === day ? " is-picked" : ""}`}>
                        {noBilling ? (
                          <span className="desk-cal-cell" title="Starlink لا يفوتر يوم 29-31">
                            <span className="desk-cal-day desk-num">{d}</span>
                            <span className="desk-cal-none">لا فوترة</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="desk-cal-cell"
                            style={{ "--heat": count / busiest } as CSSProperties}
                            onClick={() => setDay(d)}
                            aria-pressed={d === day}
                            aria-label={`يوم ${d}: ${count} جهاز`}
                          >
                            <span className="desk-cal-day desk-num">{d}</span>
                            {count > 0 && <span className="desk-cal-count desk-num">{count}</span>}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="desk-day-list" aria-live="polite">
            <header>
              <h3>
                يوم <span className="desk-num">{day}</span>
              </h3>
              <span className="desk-faint">
                <span className="desk-num">{onDay.length}</span> جهاز يتجدّد
              </span>
            </header>
            {onDay.length === 0 ? (
              <p className="desk-faint">لا أجهزة تتجدّد في هذا اليوم.</p>
            ) : (
              <ul>
                {onDay.map((d) => {
                  const dish = statusView(d.dishStatus);
                  return (
                    <li key={d.id}>
                      <Link href={deviceHref(d)} className="desk-follow-row">
                        <span className="desk-follow-name" dir="auto">{d.name || "بدون اسم"}</span>
                        <span className="desk-follow-meta">{props.clientName(d) || "بدون زبون"}</span>
                        <span className={`desk-status desk-status-${dish.tone}`}>
                          <span aria-hidden="true">{dish.sign}</span>
                          {dish.label}
                        </span>
                        <bdi dir="ltr" className="desk-num desk-faint">{renewalDateLabel(renewalOf(d))}</bdi>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {onDay.length > 0 && (
              <Link href={`/devices?day=${day}`} className="desk-link">
                افتحها في الجدول
              </Link>
            )}
          </div>
        </div>
      </section>

      <details className="desk-card desk-fold">
        <summary>
          <span>كل قوائم الأجهزة</span>
          <span className="desk-faint">المتصلة، الملغاة، SIS، ROM، المعطلة، التوثيق، المندوبون…</span>
        </summary>
        <div className="desk-fold-body">{props.allLists}</div>
      </details>
    </div>
  );
}
