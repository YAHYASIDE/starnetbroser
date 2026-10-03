"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { homeSearchHref } from "@/lib/homeActions";
import { clientLeaderboard, monthsSince, repLeaderboard } from "@/lib/leaderboards";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { currencyLabelFor, moneyText, todayIso, type ToolsData } from "./useToolsData";

const MEDALS = ["🥇", "🥈", "🥉"];

/** 🏆 Reps this month and 👑 the most loyal customers. */
export function LeadersTool({ data }: { data: ToolsData }) {
  const [view, setView] = useState<"reps" | "clients">("reps");
  const month = todayIso().slice(0, 7);
  const label = currencyLabelFor(data.currencies);
  const reps = useMemo(() => repLeaderboard(data.accounts, data.ledger, data.reps, month, new Date()), [data, month]);
  const clients = useMemo(() => clientLeaderboard(data.accounts, data.ledger, data.clients).slice(0, 30), [data]);
  return (
    <div className="tool-body">
      <div className="tool-chips">
        <button type="button" className={`tool-chip${view === "reps" ? " tool-chip-on" : ""}`} onClick={() => setView("reps")}>
          🏆 المندوبون هذا الشهر
        </button>
        <button type="button" className={`tool-chip${view === "clients" ? " tool-chip-on" : ""}`} onClick={() => setView("clients")}>
          👑 أوفى الزبائن
        </button>
      </div>
      {view === "reps" ? (
        reps.length === 0 ? (
          <p className="settings-hint">لا يوجد مندوبون بعد.</p>
        ) : (
          <ul className="tool-list">
            {reps.map((r, i) => (
              <li key={r.repId} className="leader-row">
                <span className="leader-rank">{MEDALS[i] ?? i + 1}</span>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.shipments} شحنة هذا الشهر · تحصيل {moneyText(r.collected, label)}
                  </small>
                  <small>
                    📡 {r.devices} جهاز · ✓ {r.active} نشط{r.lapsed ? ` · ⛔ ${r.lapsed} منتهٍ` : ""}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : clients.length === 0 ? (
        <p className="settings-hint">لا توجد عمليات بعد.</p>
      ) : (
        <ul className="tool-list">
          {clients.map((c, i) => {
            const link = buildWhatsAppLink(c.phone, `مرحباً ${c.name} 🌟\nشكراً لثقتك في STAR NET طوال هذه المدة - أنت من أفضل زبائننا 🙏`);
            const owes = Object.fromEntries(Object.entries(c.owes).filter(([, v]) => v > 0));
            return (
              <li key={c.clientId} className="leader-row">
                <span className="leader-rank">{MEDALS[i] ?? i + 1}</span>
                <div>
                  <Link href={homeSearchHref(c.name)} className="tool-link">
                    {c.name}
                  </Link>
                  <small>
                    {c.shipments} شحنة · 📡 {c.devices} جهاز{c.since ? (monthsSince(c.since, new Date()) === 0 ? " · زبون جديد هذا الشهر" : ` · زبون منذ ${monthsSince(c.since, new Date())} شهراً`) : ""}
                  </small>
                  <small>
                    دفع {moneyText(c.paid, label)}
                    {Object.keys(owes).length ? ` · عليه ${moneyText(owes, label)}` : " · ✓ لا دين"}
                  </small>
                </div>
                {link && (
                  <a className="tool-wa" href={link} target="_blank" rel="noreferrer">
                    شكر
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
