"use client";

import { useEffect, useState } from "react";
import { CalculatorTool } from "@/components/tools/CalculatorTool";
import { DataHealthTool } from "@/components/tools/DataHealthTool";
import { ForecastTool } from "@/components/tools/ForecastTool";
import { GoalsTool } from "@/components/tools/GoalsTool";
import { PromisesTool } from "@/components/tools/PromisesTool";
import { QuoteTool } from "@/components/tools/QuoteTool";
import { useToolsData } from "@/components/tools/useToolsData";
import { WinBackTool } from "@/components/tools/WinBackTool";

const TOOLS = [
  { id: "forecast", icon: "📈", label: "التوقعات", hint: "دخل التجديدات القادمة" },
  { id: "promises", icon: "🤝", label: "وعود الدفع", hint: "من وعد بالدفع ومتى" },
  { id: "winback", icon: "🔁", label: "الاسترجاع", hint: "زبائن توقفوا عن التجديد" },
  { id: "goals", icon: "🎯", label: "الأهداف", hint: "أهداف الشهر وتقدمك" },
  { id: "health", icon: "🩺", label: "فحص البيانات", hint: "نواقص وتكرارات" },
  { id: "calculator", icon: "🧮", label: "حاسبة الربح", hint: "كم أربح بهذا السعر؟" },
  { id: "quote", icon: "🧾", label: "عرض سعر", hint: "لزبون جديد عبر واتساب" },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

function toolFromHash(): ToolId {
  const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return (TOOLS.find((t) => t.id === hash)?.id ?? "forecast") as ToolId;
}

export default function ToolsPage() {
  const data = useToolsData();
  const [tool, setTool] = useState<ToolId>("forecast");
  useEffect(() => {
    setTool(toolFromHash());
    const onHash = () => setTool(toolFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function open(id: ToolId) {
    setTool(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const current = TOOLS.find((t) => t.id === tool)!;
  return (
    <main className="home tools-page">
      <header className="tools-head">
        <h1>🧰 الأدوات</h1>
        <p>توقعات، متابعة، وحسابات سريعة - من بياناتك على هذا الهاتف.</p>
      </header>
      <nav className="tools-grid" aria-label="الأدوات">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={`tools-tile${t.id === tool ? " tools-tile-on" : ""}`} onClick={() => open(t.id)} aria-pressed={t.id === tool}>
            <span aria-hidden="true">{t.icon}</span>
            <strong>{t.label}</strong>
          </button>
        ))}
      </nav>
      <section className="section tools-panel">
        <h2 className="section-title">
          {current.icon} {current.label}
        </h2>
        <p className="settings-hint">{current.hint}</p>
        {!data.loaded ? (
          <p className="settings-hint">جارِ التحميل…</p>
        ) : tool === "forecast" ? (
          <ForecastTool data={data} />
        ) : tool === "promises" ? (
          <PromisesTool data={data} />
        ) : tool === "winback" ? (
          <WinBackTool data={data} />
        ) : tool === "goals" ? (
          <GoalsTool data={data} />
        ) : tool === "health" ? (
          <DataHealthTool data={data} />
        ) : tool === "calculator" ? (
          <CalculatorTool data={data} />
        ) : (
          <QuoteTool data={data} />
        )}
      </section>
    </main>
  );
}
