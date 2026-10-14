"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BulkWhatsAppSender } from "@/components/BulkWhatsAppSender";
import { homeSearchHref } from "@/lib/homeActions";
import { exportXlsx } from "@/lib/xlsxExport";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { buildWinBackMessage, listLapsedDevices } from "@/lib/winBack";
import type { ToolsData } from "./useToolsData";

const SENT_KEY = "starnet.winBackSent";

function loadSent(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** 🔁 Lapsed customers, freshest first, each one tap from a WhatsApp win-back message. */
export function WinBackTool({ data }: { data: ToolsData }) {
  const [maxDays, setMaxDays] = useState(60);
  const [sent, setSent] = useState<Record<string, string>>(() => (typeof window === "undefined" ? {} : loadSent()));
  const lapsed = useMemo(() => listLapsedDevices(data.accounts, data.clients, new Date(), { maxDays }), [data.accounts, data.clients, maxDays]);

  async function exportList() {
    const rows = [["الجهاز", "الزبون", "الهاتف", "متوقف منذ (أيام)"], ...lapsed.map((d) => [d.name, d.clientName ?? "", d.phone ?? "", d.daysLapsed])];
    await exportXlsx([{ name: "للاسترجاع", rows }], "starnet-winback.xlsx", "زبائن للاسترجاع");
  }

  function markSent(id: string) {
    const next = { ...sent, [id]: new Date().toISOString().slice(0, 10) };
    setSent(next);
    try {
      window.localStorage.setItem(SENT_KEY, JSON.stringify(next));
    } catch {
      // storage full
    }
  }

  return (
    <div className="tool-body">
      <p className="settings-hint">أجهزة انتهى تجديدها ولم تُجدَّد - أسهل الزبائن استرجاعاً هم الأحدث.</p>
      <div className="tool-chips">
        {[30, 60, 120].map((d) => (
          <button key={d} type="button" className={`tool-chip${d === maxDays ? " tool-chip-on" : ""}`} onClick={() => setMaxDays(d)}>
            آخر {d} يوماً
          </button>
        ))}
      </div>
      {lapsed.length === 0 && <p className="settings-hint">✓ لا يوجد زبائن متوقفون في هذه الفترة.</p>}
      <BulkWhatsAppSender
        targets={lapsed.flatMap((d) => {
          const link = buildWhatsAppLink(d.phone, buildWinBackMessage(d));
          return link ? [{ id: d.id, name: d.clientName ? `${d.name} - ${d.clientName}` : d.name, link }] : [];
        })}
        label="رسالة استرجاع للكل"
      />
      {lapsed.length > 0 && (
        <button type="button" className="text-action" onClick={() => void exportList()}>
          📥 Excel
        </button>
      )}
      <ul className="tool-list">
        {lapsed.map((d) => {
          const link = buildWhatsAppLink(d.phone, buildWinBackMessage(d));
          return (
            <li key={d.id} className="tool-row">
              <div>
                <Link href={homeSearchHref(d.name)} className="tool-link">
                  📡 {d.name}
                </Link>
                <small>
                  {d.clientName ? `${d.clientName} · ` : ""}متوقف منذ {d.daysLapsed} يوماً
                  {sent[d.id] ? ` · ✓ رُسل ${sent[d.id]!.slice(8)}/${sent[d.id]!.slice(5, 7)}` : ""}
                </small>
              </div>
              {link ? (
                <a className="tool-wa" href={link} target="_blank" rel="noreferrer" onClick={() => markSent(d.id)}>
                  واتساب
                </a>
              ) : (
                <small className="telegram-stopped">بدون هاتف</small>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
