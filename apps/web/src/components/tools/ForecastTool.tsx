"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { homeSearchHref } from "@/lib/homeActions";
import { computeRenewalForecast } from "@/lib/renewalForecast";
import { currencyLabelFor, moneyText, type ToolsData } from "./useToolsData";

const HORIZONS = [7, 30, 60, 90];

/** 📈 What the coming renewals should bring in, per currency and per week. */
export function ForecastTool({ data }: { data: ToolsData }) {
  const [horizon, setHorizon] = useState(30);
  const forecast = useMemo(() => computeRenewalForecast(data.accounts, new Date(), horizon), [data.accounts, horizon]);
  const label = currencyLabelFor(data.currencies);
  const maxWeek = Math.max(1, ...forecast.weeks.map((w) => w.count));
  return (
    <div className="tool-body">
      <div className="tool-chips" role="tablist">
        {HORIZONS.map((h) => (
          <button key={h} type="button" className={`tool-chip${h === horizon ? " tool-chip-on" : ""}`} onClick={() => setHorizon(h)}>
            {h} يوماً
          </button>
        ))}
      </div>
      <div className="tool-kpis">
        <div className="tool-kpi">
          <span>أجهزة تتجدد</span>
          <strong>{forecast.devices.length}</strong>
        </div>
        <div className="tool-kpi">
          <span>الدخل المتوقع</span>
          <strong>{moneyText(forecast.sale, label)}</strong>
        </div>
        <div className="tool-kpi">
          <span>تكلفة Starlink</span>
          <strong>{moneyText(forecast.cost, label)}</strong>
        </div>
      </div>
      {forecast.missingPrice > 0 && (
        <p className="settings-hint telegram-stopped">⚠️ {forecast.missingPrice} جهاز بدون سعر شهري - غير محسوب في الدخل. أضف السعر من «التفاصيل» في البطاقة.</p>
      )}
      <ul className="tool-bars">
        {forecast.weeks.map((week) => (
          <li key={week.index}>
            <span className="tool-bar-label">
              <bdi dir="ltr">
                {week.from.slice(8)}/{week.from.slice(5, 7)} - {week.to.slice(8)}/{week.to.slice(5, 7)}
              </bdi>
            </span>
            <span className="tool-bar-track">
              <span className="tool-bar-fill" style={{ width: `${(week.count / maxWeek) * 100}%` }} />
            </span>
            <span className="tool-bar-value">{week.count}</span>
          </li>
        ))}
      </ul>
      <details className="tool-issue">
        <summary>
          <span className="tool-issue-title">قائمة الأجهزة</span>
          <span className="tool-count">{forecast.devices.length}</span>
        </summary>
        <ul className="tool-list">
          {forecast.devices.map((d) => (
            <li key={d.id}>
              <Link href={homeSearchHref(d.name)} className="tool-link">
                📡 {d.name}
              </Link>
              <small>
                {d.days === 0 ? "اليوم" : `بعد ${d.days} يوماً`}
                {d.sale ? ` · ${moneyText({ [d.sale.currency]: d.sale.amount }, label)}` : " · بدون سعر"}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
