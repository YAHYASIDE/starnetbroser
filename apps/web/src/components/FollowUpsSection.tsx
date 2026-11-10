"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PartySheet } from "@/components/AccountsSection";
import { isRepWorkspace } from "@/lib/repMode";
import { addOwnFollow, followItems, loadFollowStore, removeOwnFollow, saveFollowStore, toggleFollow, type FollowGroup, type FollowItem, type FollowStore } from "@/lib/followUps";

const GROUPS: { id: FollowGroup; title: string }[] = [
  { id: "mine", title: "👤 عليك أنت" },
  { id: "app", title: "🛠️ لم يكتمل في التطبيق" },
];

/** 📋 «قائمة المتابعة» on the reminders page (lib/followUps.ts). */
export function FollowUpsSection() {
  const [store, setStore] = useState<FollowStore | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  // the app list is long: folded, his own steps stay open
  const [showApp, setShowApp] = useState(false);

  useEffect(() => {
    if (!isRepWorkspace()) setStore(loadFollowStore());
  }, []);
  if (!store) return null;

  const update = (next: FollowStore) => {
    setStore(next);
    saveFollowStore(next);
  };
  const { open, done } = followItems(store);
  const item = [...open, ...done].find((i) => i.id === openId) ?? null;

  const row = (i: FollowItem) => {
    const ticked = !!store.done[i.id];
    return (
      <li key={i.id} className={`follow-row${ticked ? " is-done" : ""}`}>
        <button type="button" className="follow-check" aria-label={ticked ? "إرجاعها" : "تمّت"} aria-pressed={ticked} onClick={() => update(toggleFollow(store, i.id, Date.now()))}>
          {ticked ? "✓" : ""}
        </button>
        <button type="button" className="follow-body" onClick={() => setOpenId(i.id)}>
          <span className="follow-title">{i.title}</span>
          {i.waits && !ticked && <small className="follow-waits">⏳ {i.waits}</small>}
        </button>
      </li>
    );
  };

  return (
    <section className="section" data-tour="follow-ups">
      <h2 className="report-section-title">📋 قائمة المتابعة ({open.length})</h2>
      {GROUPS.map((g) => {
        const list = open.filter((i) => i.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id} className="follow-group">
            {g.id === "app" ? (
              <button type="button" className="follow-group-title follow-group-toggle" aria-expanded={showApp} onClick={() => setShowApp((v) => !v)}>
                {g.title} ({list.length}) {showApp ? "▴" : "▾"}
              </button>
            ) : (
              <p className="follow-group-title">{g.title}</p>
            )}
            {(g.id !== "app" || showApp) && <ul className="follow-list">{list.map(row)}</ul>}
          </div>
        );
      })}
      {open.length === 0 && <p className="settings-hint">لا شيء مفتوح ✓</p>}
      <div className="follow-actions">
        <button type="button" className="text-action" onClick={() => setAdding(true)}>
          ＋ أضف ملاحظة
        </button>
        {done.length > 0 && (
          <button type="button" className="text-action" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "إخفاء المنجزة" : `✓ المنجزة (${done.length})`}
          </button>
        )}
      </div>
      {showDone && done.length > 0 && <ul className="follow-list">{done.map(row)}</ul>}

      {item && (
        <PartySheet title={item.title} onClose={() => setOpenId(null)}>
          {item.waits && <p className="settings-hint">⏳ {item.waits}</p>}
          {item.steps.length > 0 && (
            <ol className="follow-steps">
              {item.steps.map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ol>
          )}
          <div className="call-server-actions">
            <button
              type="button"
              className="dialog-primary"
              onClick={() => {
                update(toggleFollow(store, item.id, Date.now()));
                setOpenId(null);
              }}
            >
              {store.done[item.id] ? "↩️ أرجعها مفتوحة" : "✓ تمّت"}
            </button>
            {item.path && (
              <Link href={item.path} className="dialog-secondary">
                افتح المكان
              </Link>
            )}
            {item.own && (
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => {
                  update(removeOwnFollow(store, item.id));
                  setOpenId(null);
                }}
              >
                🗑️ حذف
              </button>
            )}
          </div>
        </PartySheet>
      )}

      {adding && (
        <PartySheet title="＋ ملاحظة متابعة" onClose={() => setAdding(false)}>
          <textarea className="msg-input" rows={4} placeholder={"السطر الأول: العنوان\nالأسطر التالية: الخطوات"} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <button
            type="button"
            className="dialog-primary"
            disabled={!text.trim()}
            onClick={() => {
              update(addOwnFollow(store, text, "mine", Date.now()));
              setText("");
              setAdding(false);
            }}
          >
            حفظ
          </button>
        </PartySheet>
      )}
    </section>
  );
}
