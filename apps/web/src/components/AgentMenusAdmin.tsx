"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addNode,
  childrenOf,
  docProblems,
  loadMenus,
  MENUS_EVENT,
  menuStep,
  moveNode,
  newNodeId,
  NO_STATE,
  publishMenus,
  removeNode,
  restoreVersion,
  saveMenus,
  unpublishMenus,
  updateNode,
  type CatalogPlan,
  type CatalogProduct,
  type MenuAction,
  type MenuDoc,
  type MenuNode,
  type MenuSettings,
  type MenuState,
  type MenusStore,
} from "@/lib/agentMenus";
import { paymentInstructions } from "@/lib/pdfDocument";
import { teamMemberName } from "@/components/TeamFlagSheet";

const ICONS = ["📡", "💰", "🛰️", "💳", "🛠️", "👨‍💼", "🆕", "➕", "🔎", "ℹ️", "📶", "📅", "🔄", "🌍", "♾️", "⚡", "🎁", "⚖️", "📦", "🛒", "🔌", "🚚", "📍", "🏦", "🧾", "📄", "⏳", "📊", "🔴", "🐢", "⛔", "⚙️", "👤", "📧", "❓", "✅"];

const ACTIONS: { type: MenuAction["type"]; label: string }[] = [
  { type: "submenu", label: "📂 قائمة فرعية" },
  { type: "answer", label: "💬 جواب ثابت" },
  { type: "ai", label: "🤖 يجيب الوكيل عن موضوع" },
  { type: "prices", label: "💰 قائمة الأسعار" },
  { type: "products", label: "🛰️ قائمة المنتجات" },
  { type: "payments", label: "💳 طرق الدفع" },
  { type: "handoff", label: "👨‍💼 تحويل لموظف" },
];

function actionOf(type: MenuAction["type"], old: MenuAction, title: string): MenuAction {
  if (type === "answer") return { type, text: old.type === "answer" ? old.text : "" };
  if (type === "ai") return { type, topic: old.type === "ai" ? old.topic : title };
  return { type } as MenuAction;
}

/** A picture made small (max 320 px, JPEG) - kept in the menus store. */
async function smallImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 320 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * 🗂️ «إدارة القوائم» (his Nov 21 2026 brief): the menus' draft - sections, items, what each does, the welcome, the price
 * and product lists, the sending settings - a WhatsApp preview that runs the real navigation, and publish / stop /
 * restore. Customers get only what is published. Logic: lib/agentMenus.ts (and WhatsAppMenu.java in the reader).
 */
export function AgentMenusAdmin() {
  const [store, setStore] = useState<MenusStore | null>(null);
  const [section, setSection] = useState<"tree" | "settings" | "catalog" | "publish">("tree");
  useEffect(() => {
    const load = () => setStore(loadMenus());
    load();
    window.addEventListener(MENUS_EVENT, load);
    return () => window.removeEventListener(MENUS_EVENT, load);
  }, []);
  if (!store) return null;

  const save = (next: MenusStore) => {
    setStore(next);
    saveMenus(next);
  };
  const setDraft = (doc: MenuDoc) => save({ ...store, draft: doc });

  return (
    <section className="section agent-list menus-admin">
      <div className={`menus-status ${store.published ? "menus-status-live" : ""}`}>
        {store.published ? (
          <>
            🟢 القوائم منشورة للعملاء منذ {fmtTime(store.publishedAt)}
            {store.publishedBy ? ` · ${store.publishedBy}` : ""}. ما تعدّله هنا مسودة حتى تنشرها.
          </>
        ) : (
          <>📝 مسودة فقط - لم تُنشر للعملاء بعد. جرّبها في المعاينة ثم انشرها من «🚀 النشر».</>
        )}
      </div>
      <div className="menus-subtabs" role="tablist">
        {(
          [
            ["tree", "🗂️ الأقسام"],
            ["settings", "⚙️ الإرسال"],
            ["catalog", "💰 الأسعار والمنتجات"],
            ["publish", "🚀 النشر"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={section === k} className={`menus-subtab${section === k ? " menus-subtab-on" : ""}`} onClick={() => setSection(k)}>
            {label}
          </button>
        ))}
      </div>

      {section === "tree" && <TreeEditor doc={store.draft} onChange={setDraft} />}
      {section === "settings" && <SettingsEditor store={store} onChange={save} />}
      {section === "catalog" && <CatalogEditor doc={store.draft} onChange={setDraft} />}
      {section === "publish" && <PublishPanel store={store} onChange={save} />}

      <WhatsAppPreview doc={store.draft} settings={store.settings} />
    </section>
  );
}

// ---- the sections and items ----

function TreeEditor({ doc, onChange }: { doc: MenuDoc; onChange: (d: MenuDoc) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const add = (parentId: string | null) => {
    const id = newNodeId(doc);
    onChange(addNode(doc, { id, parentId, title: parentId ? "خيار جديد" : "قسم جديد", icon: parentId ? "❓" : "📂", enabled: true, action: parentId ? { type: "answer", text: "" } : { type: "submenu" } }));
    if (!parentId) setOpen(id);
  };
  return (
    <div className="agent-list">
      <label className="add-field-label" htmlFor="menus-welcome">
        رسالة الترحيب (أول رسالة في محادثة جديدة)
      </label>
      <textarea id="menus-welcome" className="search-input menus-text" rows={6} value={doc.welcome} onChange={(e) => onChange({ ...doc, welcome: e.target.value })} />
      {childrenOf(doc, null).map((n, i, all) => (
        <div key={n.id} className={`menus-card${n.enabled ? "" : " menus-off"}`}>
          <NodeRow doc={doc} node={n} index={i} count={all.length} onChange={onChange} />
          {n.action.type === "submenu" && (
            <>
              <button type="button" className="text-action" onClick={() => setOpen(open === n.id ? null : n.id)}>
                {open === n.id ? "▲ إخفاء الخيارات" : `▼ الخيارات (${childrenOf(doc, n.id).length})`}
              </button>
              {open === n.id && (
                <div className="menus-children">
                  {childrenOf(doc, n.id).map((c, j, kids) => (
                    <div key={c.id} className={`menus-card menus-child${c.enabled ? "" : " menus-off"}`}>
                      <NodeRow doc={doc} node={c} index={j} count={kids.length} onChange={onChange} />
                    </div>
                  ))}
                  <button type="button" className="text-action" onClick={() => add(n.id)}>
                    ➕ أضف خيارًا
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
      <button type="button" className="dialog-secondary" onClick={() => add(null)}>
        ➕ أضف قسمًا رئيسيًا
      </button>
    </div>
  );
}

function NodeRow({ doc, node, index, count, onChange }: { doc: MenuDoc; node: MenuNode; index: number; count: number; onChange: (d: MenuDoc) => void }) {
  const [icons, setIcons] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<MenuNode>) => onChange(updateNode(doc, node.id, patch));
  return (
    <div className="menus-node">
      <div className="menus-node-head">
        <button type="button" className="menus-icon" aria-label="اختر أيقونة" onClick={() => setIcons(!icons)}>
          {node.icon}
        </button>
        <input className="search-input menus-title" aria-label="الاسم" value={node.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      {icons && (
        <div className="menus-icons">
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className="menus-icon"
              onClick={() => {
                set({ icon: ic });
                setIcons(false);
              }}
            >
              {ic}
            </button>
          ))}
        </div>
      )}
      <select className="search-input" aria-label="عند الاختيار" value={node.action.type} onChange={(e) => set({ action: actionOf(e.target.value as MenuAction["type"], node.action, node.title) })}>
        {ACTIONS.map((a) => (
          <option key={a.type} value={a.type}>
            {a.label}
          </option>
        ))}
      </select>
      {node.action.type === "answer" && (
        <textarea className="search-input menus-text" rows={3} placeholder="الجواب الذي يُرسل" value={node.action.text} onChange={(e) => set({ action: { type: "answer", text: e.target.value } })} />
      )}
      {node.action.type === "ai" && (
        <textarea className="search-input menus-text" rows={2} placeholder="ماذا يجيب الوكيل" value={node.action.topic} onChange={(e) => set({ action: { type: "ai", topic: e.target.value } })} />
      )}
      <div className="agent-actions">
        <button type="button" className="text-action" disabled={index === 0} onClick={() => onChange(moveNode(doc, node.id, -1))} aria-label="أعلى">
          ⬆️
        </button>
        <button type="button" className="text-action" disabled={index === count - 1} onClick={() => onChange(moveNode(doc, node.id, 1))} aria-label="أسفل">
          ⬇️
        </button>
        <label className="menus-toggle">
          <input type="checkbox" checked={node.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> مفعّل
        </label>
        <label className="text-action menus-file">
          🖼️ صورة
          <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && set({ image: await smallImage(e.target.files[0]) })} />
        </label>
        {node.image && (
          <button type="button" className="text-action" onClick={() => set({ image: undefined })}>
            ✕ الصورة
          </button>
        )}
        {confirm ? (
          <button type="button" className="text-action agent-danger" onClick={() => onChange(removeNode(doc, node.id))}>
            تأكيد الحذف
          </button>
        ) : (
          <button type="button" className="text-action agent-danger" onClick={() => setConfirm(true)}>
            🗑️
          </button>
        )}
      </div>
      {node.image && <img className="menus-thumb" src={node.image} alt="" />}
    </div>
  );
}

// ---- sending settings ----

function SettingsEditor({ store, onChange }: { store: MenusStore; onChange: (s: MenusStore) => void }) {
  const s = store.settings;
  const set = (patch: Partial<MenuSettings>) => onChange({ ...store, settings: { ...s, ...patch } });
  return (
    <div className="agent-list menus-card">
      <label className="add-field-label" htmlFor="menus-mode">
        متى تُرسل القائمة
      </label>
      <select id="menus-mode" className="search-input" value={s.mode} onChange={(e) => set({ mode: e.target.value as MenuSettings["mode"] })}>
        <option value="auto">تلقائيًا: الترحيب عند محادثة جديدة، والقائمة عند «0» أو كلمة</option>
        <option value="keyword">فقط عندما يكتب الزبون كلمة من الكلمات أو «0»</option>
        <option value="off">أوقف القوائم (يبقى الوكيل يجيب)</option>
      </select>
      <label className="add-field-label" htmlFor="menus-keys">
        كلمات تفتح القائمة (افصل بفاصلة)
      </label>
      <input id="menus-keys" className="search-input" value={s.keywords.join("، ")} onChange={(e) => set({ keywords: e.target.value.split(/[,،]/).map((k) => k.trim()).filter(Boolean) })} />
      <label className="add-field-label" htmlFor="menus-every">
        لا يتكرر الترحيب قبل (ساعات)
      </label>
      <input id="menus-every" className="search-input" type="number" min={1} max={168} value={s.welcomeEveryHours} onChange={(e) => set({ welcomeEveryHours: Math.max(1, Number(e.target.value) || 12) })} />
      <div className="menus-hours">
        <label className="add-field-label" htmlFor="menus-from">
          عمل الموظفين من
        </label>
        <input id="menus-from" className="search-input" type="time" value={s.hoursFrom} onChange={(e) => set({ hoursFrom: e.target.value })} />
        <label className="add-field-label" htmlFor="menus-to">
          إلى
        </label>
        <input id="menus-to" className="search-input" type="time" value={s.hoursTo} onChange={(e) => set({ hoursTo: e.target.value })} />
      </div>
      <label className="add-field-label" htmlFor="menus-handoff">
        يعود الوكيل وحده بعد التحويل لموظف (ساعات)
      </label>
      <input id="menus-handoff" className="search-input" type="number" min={1} max={168} value={s.handoffHours} onChange={(e) => set({ handoffHours: Math.max(1, Number(e.target.value) || 24) })} />
      <p className="settings-hint">لا يرسل الوكيل أي رسالة جماعية أو ترويجية: يرد فقط على من يراسله. هذه الإعدادات تُطبَّق فورًا على القوائم المنشورة.</p>
    </div>
  );
}

// ---- prices and products ----

function CatalogEditor({ doc, onChange }: { doc: MenuDoc; onChange: (d: MenuDoc) => void }) {
  const setPlan = (i: number, patch: Partial<CatalogPlan>) => onChange({ ...doc, plans: doc.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setProduct = (i: number, patch: Partial<CatalogProduct>) => onChange({ ...doc, products: doc.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const rid = () => Math.random().toString(36).slice(2, 8);
  return (
    <div className="agent-list">
      <p className="settings-hint">الوكيل يأخذ الأسعار من هنا فقط (ومن سعر الزبون المعتاد). لا يخترع سعرًا، ولا يعد بمنتج غير متوفر.</p>
      <h3 className="section-title">💰 الباقات والأسعار</h3>
      {doc.plans.map((p, i) => (
        <div key={p.id} className={`menus-card${p.enabled ? "" : " menus-off"}`}>
          <input className="search-input" aria-label="اسم الباقة" placeholder="اسم الباقة (مثلًا: الباقة القياسية)" value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} />
          <div className="menus-row2">
            <input className="search-input" aria-label="السعر" type="number" inputMode="decimal" placeholder="السعر" value={p.price || ""} onChange={(e) => setPlan(i, { price: Number(e.target.value) || 0 })} />
            <input className="search-input" aria-label="العملة" placeholder="العملة" value={p.currency} onChange={(e) => setPlan(i, { currency: e.target.value })} />
          </div>
          <div className="menus-row2">
            <input className="search-input" aria-label="الدولة" placeholder="الدولة" value={p.country} onChange={(e) => setPlan(i, { country: e.target.value })} />
            <input className="search-input" aria-label="المدة" placeholder="المدة (شهر)" value={p.period} onChange={(e) => setPlan(i, { period: e.target.value })} />
          </div>
          <input className="search-input" aria-label="التفاصيل" placeholder="تفاصيل مختصرة" value={p.details} onChange={(e) => setPlan(i, { details: e.target.value })} />
          <div className="agent-actions">
            <label className="menus-toggle">
              <input type="checkbox" checked={p.enabled} onChange={(e) => setPlan(i, { enabled: e.target.checked })} /> مفعّلة
            </label>
            <button type="button" className="text-action agent-danger" onClick={() => onChange({ ...doc, plans: doc.plans.filter((_, j) => j !== i) })}>
              🗑️ احذف
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="dialog-secondary" onClick={() => onChange({ ...doc, plans: [...doc.plans, { id: `p_${rid()}`, name: "", price: 0, currency: "أوقية", country: "", period: "شهر", details: "", enabled: true }] })}>
        ➕ أضف باقة
      </button>

      <h3 className="section-title">🛰️ الأجهزة والإكسسوارات</h3>
      {doc.products.map((p, i) => (
        <div key={p.id} className={`menus-card menus-product${p.enabled ? "" : " menus-off"}`}>
          {p.image && <img className="menus-product-img" src={p.image} alt={p.name} />}
          <input className="search-input" aria-label="اسم المنتج" placeholder="اسم المنتج (Starlink Mini)" value={p.name} onChange={(e) => setProduct(i, { name: e.target.value })} />
          <div className="menus-row2">
            <input className="search-input" aria-label="السعر" type="number" inputMode="decimal" placeholder="السعر" value={p.price || ""} onChange={(e) => setProduct(i, { price: Number(e.target.value) || 0 })} />
            <input className="search-input" aria-label="العملة" placeholder="العملة" value={p.currency} onChange={(e) => setProduct(i, { currency: e.target.value })} />
          </div>
          <input className="search-input" aria-label="الوصف" placeholder="وصف مختصر" value={p.description} onChange={(e) => setProduct(i, { description: e.target.value })} />
          <div className="agent-actions">
            <label className="menus-toggle">
              <input type="checkbox" checked={p.available} onChange={(e) => setProduct(i, { available: e.target.checked })} /> متوفر
            </label>
            <label className="menus-toggle">
              <input type="checkbox" checked={p.enabled} onChange={(e) => setProduct(i, { enabled: e.target.checked })} /> ظاهر
            </label>
            <label className="text-action menus-file">
              🖼️ صورة
              <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setProduct(i, { image: await smallImage(e.target.files[0]) })} />
            </label>
            <button type="button" className="text-action agent-danger" onClick={() => onChange({ ...doc, products: doc.products.filter((_, j) => j !== i) })}>
              🗑️ احذف
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="dialog-secondary" onClick={() => onChange({ ...doc, products: [...doc.products, { id: `d_${rid()}`, name: "", price: 0, currency: "أوقية", available: true, description: "", enabled: true }] })}>
        ➕ أضف منتجًا
      </button>
      <p className="settings-hint">طرق الدفع تُؤخذ من بيانات نشاطك (الإعدادات ← بيانات النشاط) كما في الكشوفات والفواتير.</p>
    </div>
  );
}

// ---- publish / stop / versions ----

function PublishPanel({ store, onChange }: { store: MenusStore; onChange: (s: MenusStore) => void }) {
  const [confirm, setConfirm] = useState(false);
  const problems = docProblems(store.draft);
  return (
    <div className="agent-list menus-card">
      {problems.length > 0 ? (
        <div className="menus-problems">
          <strong>⚠️ صحّح قبل النشر:</strong>
          <ul>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="settings-hint">✓ المسودة جاهزة. جرّبها في المعاينة تحت قبل النشر.</p>
      )}
      {confirm ? (
        <div className="agent-actions">
          <button
            type="button"
            className="dialog-primary"
            onClick={() => {
              onChange(publishMenus(store, new Date().toISOString(), teamMemberName()));
              setConfirm(false);
            }}
          >
            ✓ نعم، انشرها للعملاء الآن
          </button>
          <button type="button" className="text-action" onClick={() => setConfirm(false)}>
            إلغاء
          </button>
        </div>
      ) : (
        <button type="button" className="dialog-primary" disabled={problems.length > 0} onClick={() => setConfirm(true)}>
          🚀 انشر القوائم للعملاء
        </button>
      )}
      {store.published && (
        <button type="button" className="dialog-secondary" onClick={() => onChange(unpublishMenus(store))}>
          ⏸️ أوقف القوائم عن العملاء (المسودة تبقى)
        </button>
      )}
      {store.versions.length > 0 && (
        <>
          <p className="settings-hint">نسخ سابقة (تُستعاد إلى المسودة، ثم تنشرها):</p>
          <ul className="menus-versions">
            {store.versions.map((v, i) => (
              <li key={i}>
                {fmtTime(v.at)}
                {v.by ? ` · ${v.by}` : ""} · {childrenOf(v.doc, null).length} قسم
                <button type="button" className="text-action" onClick={() => onChange(restoreVersion(store, i))}>
                  ↩️ استعد
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="settings-hint">
        حدّ واتساب الحالي: الوكيل يرد من «رد» الإشعار، فتصل القائمة نصًا مرقّمًا. القوائم التفاعلية والأزرار وصور المنتجات داخل واتساب تحتاج ربط WhatsApp
        Cloud API الرسمي (قيد الدراسة) - والمعرّفات الثابتة جاهزة لذلك.
      </p>
    </div>
  );
}

// ---- the WhatsApp preview (the real navigation, on the draft) ----

interface Bubble {
  from: "customer" | "agent" | "note";
  text: string;
}

function WhatsAppPreview({ doc, settings }: { doc: MenuDoc; settings: MenuSettings }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [state, setState] = useState<MenuState>(NO_STATE);
  const [text, setText] = useState("");
  const body = useRef<HTMLDivElement>(null);
  // the newest message in view
  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [bubbles]);
  const payment = useMemo(() => {
    try {
      return paymentInstructions();
    } catch {
      return "";
    }
  }, []);
  const send = (input: string) => {
    if (!input.trim()) return;
    const now = Date.now();
    const d = new Date();
    const step = menuStep(doc, settings, state, input, now, d.getHours() * 60 + d.getMinutes(), payment);
    const out: Bubble[] = [{ from: "customer", text: input }];
    if (step.kind === "reply" || step.kind === "handoff") out.push({ from: "agent", text: step.text });
    if (step.kind === "handoff") out.push({ from: "note", text: "👨‍💼 يُسكت الوكيل مع هذا الزبون ويظهر في «المحوّلون»" });
    if (step.kind === "ai") out.push({ from: "note", text: `🤖 هنا يجيب الوكيل (Claude)${step.topic ? ` عن: ${step.topic}` : ""}${step.suffix ? ` - ثم: «${step.suffix}»` : ""}. جرّبه فعليًا في «💬 جرّب».` });
    setBubbles((b) => [...b, ...out].slice(-30));
    setState(step.state);
    setText("");
  };
  return (
    <div className="wa-preview">
      <div className="wa-preview-head">
        <strong>📱 معاينة واتساب (المسودة)</strong>
        <button
          type="button"
          className="text-action"
          onClick={() => {
            setBubbles([]);
            setState(NO_STATE);
          }}
        >
          ↺ من البداية
        </button>
      </div>
      <div className="wa-preview-body" ref={body}>
        {bubbles.length === 0 && <p className="wa-preview-empty">اكتب «السلام عليكم» كأنك زبون جديد، ثم اختر بالأرقام.</p>}
        {bubbles.map((b, i) => (
          <div key={i} className={`wa-bubble wa-bubble-${b.from}`}>
            {b.text}
          </div>
        ))}
      </div>
      <div className="wa-quick">
        {["السلام عليكم", "1", "2", "3", "0", "رجوع", "موظف"].map((q) => (
          <button key={q} type="button" className="wa-chip" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="wa-input">
        <input className="search-input" aria-label="رسالة الزبون" placeholder="اكتب رسالة…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(text)} />
        <button type="button" className="dialog-primary" onClick={() => send(text)}>
          إرسال
        </button>
      </div>
    </div>
  );
}
