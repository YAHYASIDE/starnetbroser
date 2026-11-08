"use client";

import { useEffect, useRef, useState } from "react";
import { isChatImage, MAX_CHAT_TEXT } from "@/lib/chat";

/** A stroke or a text on the picture, in 0..1 of its width / height (so it survives the screen size). */
type Op =
  | { kind: "stroke"; color: string; width: number; points: { x: number; y: number }[] }
  | { kind: "text"; color: string; text: string; x: number; y: number; size: number };

interface Item {
  /** The picture as edited so far (rotations and crops are applied to it). */
  base: string;
  ops: Op[];
  caption: string;
}

const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ffffff", "#000000"];
const MAX_EDGE = 1600;
const MAX_PICTURES = 10;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** The picked file, at most 1600 px on its long side (memory). */
async function fileToBase(file: File): Promise<string> {
  const img = await loadImage(await fileToDataUrl(file));
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

/** Draws the picture and its strokes / texts on a canvas of the given size. */
function paint(ctx: CanvasRenderingContext2D, img: HTMLImageElement, ops: Op[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  for (const op of ops) {
    if (op.kind === "stroke") {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = Math.max(2, op.width * w);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h)));
      if (op.points.length === 1) ctx.lineTo(op.points[0]!.x * w + 0.1, op.points[0]!.y * h);
      ctx.stroke();
    } else {
      const size = Math.max(14, op.size * w);
      ctx.font = `bold ${size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, size / 8);
      ctx.strokeStyle = op.color === "#000000" ? "#ffffff" : "#000000";
      ctx.strokeText(op.text, op.x * w, op.y * h);
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x * w, op.y * h);
    }
  }
}

/** The finished picture as a JPEG small enough to travel (smaller / lighter until it fits). */
async function exportItem(item: Item): Promise<string | null> {
  const img = await loadImage(item.base);
  for (const edge of [1280, 1000, 800, 640]) {
    const scale = Math.min(1, edge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d")!, img, item.ops, w, h);
    for (const q of [0.72, 0.6, 0.5, 0.4]) {
      const url = c.toDataURL("image/jpeg", q);
      if (isChatImage(url)) return url;
    }
  }
  return null;
}

/** The picture with its marks baked in (before a rotation or a crop). */
async function flatten(item: Item): Promise<Item> {
  if (item.ops.length === 0) return item;
  const img = await loadImage(item.base);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  paint(c.getContext("2d")!, img, item.ops, img.width, img.height);
  return { ...item, base: c.toDataURL("image/jpeg", 0.9), ops: [] };
}

async function rotate(item: Item): Promise<Item> {
  const flat = await flatten(item);
  const img = await loadImage(flat.base);
  const c = document.createElement("canvas");
  c.width = img.height;
  c.height = img.width;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return { ...flat, base: c.toDataURL("image/jpeg", 0.9) };
}

async function crop(item: Item, r: { x: number; y: number; w: number; h: number }): Promise<Item> {
  const flat = await flatten(item);
  const img = await loadImage(flat.base);
  const sx = Math.round(r.x * img.width);
  const sy = Math.round(r.y * img.height);
  const sw = Math.max(8, Math.round(r.w * img.width));
  const sh = Math.max(8, Math.round(r.h * img.height));
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return { ...flat, base: c.toDataURL("image/jpeg", 0.9) };
}

type Mode = "view" | "draw" | "text" | "crop";

/**
 * 📷 Sending pictures, as in WhatsApp (his Nov 8 2026 choices: a big preview with a caption, crop and rotate, drawing
 * and writing on it, several pictures at once): each picture is edited on its own (⟳ تدوير, ✂ قص, ✏️ رسم, Aa نص,
 * ↶ تراجع), with its caption; «➤» sends them all, one message each.
 */
export function ChatImageEditor({ files, onSend, onClose }: { files: File[]; onSend: (pictures: { image: string; caption: string }[]) => void; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("view");
  const [color, setColor] = useState(COLORS[0]!);
  const [draftText, setDraftText] = useState("");
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drawing = useRef<Op | null>(null);
  const dragging = useRef<{ handle: string; x: number; y: number; start: typeof rect } | null>(null);
  const more = useRef<HTMLInputElement>(null);

  async function addFiles(list: File[]) {
    const room = MAX_PICTURES - items.length;
    const picked = list.filter((f) => f.type.startsWith("image/")).slice(0, room);
    const bases = await Promise.all(picked.map((f) => fileToBase(f).catch(() => null)));
    const fresh = bases.filter((b): b is string => Boolean(b)).map((base) => ({ base, ops: [], caption: "" }));
    if (fresh.length < picked.length) setError("تعذّر فتح بعض الصور");
    setItems((cur) => [...cur, ...fresh]);
  }

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // once (the effect may run twice)
    started.current = true;
    void addFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = items[index];

  function redraw() {
    const c = canvas.current;
    const img = image.current;
    if (!c || !img || !item) return;
    const ops = drawing.current ? [...item.ops, drawing.current] : item.ops;
    paint(c.getContext("2d")!, img, ops, c.width, c.height);
  }

  useEffect(() => {
    if (!item) return;
    let alive = true;
    void loadImage(item.base).then((img) => {
      if (!alive || !canvas.current) return;
      image.current = img;
      // the canvas keeps the picture's shape; CSS fits it on the screen
      const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
      canvas.current.width = Math.round(img.width * scale);
      canvas.current.height = Math.round(img.height * scale);
      redraw();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.base, item?.ops]);

  function update(next: Partial<Item>) {
    setItems((cur) => cur.map((it, i) => (i === index ? { ...it, ...next } : it)));
  }

  function point(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  function onDown(e: React.PointerEvent) {
    if (!item) return;
    if (mode === "draw") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drawing.current = { kind: "stroke", color, width: 0.008, points: [point(e)] };
      redraw();
    } else if (mode === "text" && draftText.trim()) {
      const p = point(e);
      update({ ops: [...item.ops, { kind: "text", color, text: draftText.trim().slice(0, 60), x: p.x, y: p.y, size: 0.06 }] });
      setDraftText("");
      setMode("view");
    }
  }

  function onMove(e: React.PointerEvent) {
    const op = drawing.current;
    if (mode === "draw" && op && op.kind === "stroke") {
      op.points.push(point(e));
      redraw();
    }
  }

  function onUp() {
    const op = drawing.current;
    drawing.current = null;
    if (op && item) update({ ops: [...item.ops, op] });
  }

  // ✂ the crop frame: drag a corner, or the middle to move it
  function cropDown(handle: string, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragging.current = { handle, x: e.clientX, y: e.clientY, start: rect };
  }

  function cropMove(e: React.PointerEvent) {
    const d = dragging.current;
    const c = canvas.current;
    if (!d || !c) return;
    const box = c.getBoundingClientRect();
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    const s = d.start;
    const min = 0.08;
    let { x, y, w, h } = s;
    if (d.handle === "move") {
      x = Math.min(1 - w, Math.max(0, s.x + dx));
      y = Math.min(1 - h, Math.max(0, s.y + dy));
    } else {
      if (d.handle.includes("l")) {
        x = Math.min(s.x + s.w - min, Math.max(0, s.x + dx));
        w = s.w + (s.x - x);
      }
      if (d.handle.includes("r")) w = Math.min(1 - s.x, Math.max(min, s.w + dx));
      if (d.handle.includes("t")) {
        y = Math.min(s.y + s.h - min, Math.max(0, s.y + dy));
        h = s.h + (s.y - y);
      }
      if (d.handle.includes("b")) h = Math.min(1 - s.y, Math.max(min, s.h + dy));
    }
    setRect({ x, y, w, h });
  }

  async function run(fn: (it: Item) => Promise<Item>) {
    if (!item || busy) return;
    setBusy(true);
    try {
      const next = await fn(item);
      update(next);
    } catch {
      setError("تعذّر تعديل الصورة");
    } finally {
      setBusy(false);
    }
  }

  async function sendAll() {
    if (busy || items.length === 0) return;
    setBusy(true);
    const out: { image: string; caption: string }[] = [];
    for (const it of items) {
      const url = await exportItem(it).catch(() => null);
      if (url) out.push({ image: url, caption: it.caption.trim().slice(0, MAX_CHAT_TEXT) });
    }
    setBusy(false);
    if (out.length === 0) {
      setError("تعذّر تجهيز الصور - جرّب صورة أخرى");
      return;
    }
    onSend(out);
  }

  return (
    <div className="img-editor" role="dialog" aria-label="تعديل الصورة">
      <div className="img-editor-bar">
        <button type="button" className="img-tool" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
        <span className="img-editor-gap" />
        {mode === "crop" ? (
          <>
            <button type="button" className="img-tool" onClick={() => setMode("view")}>
              إلغاء
            </button>
            <button
              type="button"
              className="img-tool img-tool-on"
              onClick={() => {
                const r = rect;
                setMode("view");
                void run((it) => crop(it, r));
              }}
            >
              ✓ قص
            </button>
          </>
        ) : (
          <>
            <button type="button" className="img-tool" onClick={() => item && update({ ops: item.ops.slice(0, -1) })} disabled={!item?.ops.length} aria-label="تراجع">
              ↶
            </button>
            <button type="button" className="img-tool" onClick={() => void run(rotate)} aria-label="تدوير">
              ⟳
            </button>
            <button
              type="button"
              className="img-tool"
              onClick={() => {
                setRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
                setMode("crop");
              }}
              aria-label="قص"
            >
              ✂
            </button>
            <button type="button" className={`img-tool${mode === "text" ? " img-tool-on" : ""}`} onClick={() => setMode(mode === "text" ? "view" : "text")} aria-label="كتابة على الصورة">
              Aa
            </button>
            <button type="button" className={`img-tool${mode === "draw" ? " img-tool-on" : ""}`} onClick={() => setMode(mode === "draw" ? "view" : "draw")} aria-label="رسم">
              ✏️
            </button>
          </>
        )}
      </div>
      {(mode === "draw" || mode === "text") && (
        <div className="img-colors" role="radiogroup" aria-label="اللون">
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} className={`img-color${color === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
      )}
      {mode === "text" && (
        <div className="img-text-row">
          <input className="msg-input" placeholder="اكتب ثم اضغط على مكانه في الصورة" value={draftText} maxLength={60} onChange={(e) => setDraftText(e.target.value)} autoFocus />
        </div>
      )}
      <div className="img-stage">
        {item ? (
          <div className="img-frame">
            <canvas
              ref={canvas}
              className={`img-canvas${mode === "draw" ? " is-drawing" : ""}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            {mode === "crop" && (
              <div className="img-crop-layer" onPointerMove={cropMove} onPointerUp={() => (dragging.current = null)}>
                <div
                  className="img-crop"
                  style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
                  onPointerDown={(e) => cropDown("move", e)}
                >
                  {["tl", "tr", "bl", "br"].map((h) => (
                    <span key={h} className={`img-crop-handle img-crop-${h}`} onPointerDown={(e) => cropDown(h, e)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="party-empty">⏳</p>
        )}
      </div>
      {error && <p className="img-error">{error}</p>}
      {items.length > 0 && (
        <div className="img-strip">
          {items.map((it, i) => (
            <button key={i} type="button" className={`img-thumb${i === index ? " is-on" : ""}`} onClick={() => setIndex(i)} aria-label={`الصورة ${i + 1}`}>
              <img src={it.base} alt="" />
              {items.length > 1 && i === index && (
                <span
                  className="img-thumb-remove"
                  role="button"
                  aria-label="إزالة"
                  onClick={(e) => {
                    e.stopPropagation();
                    setItems((cur) => cur.filter((_, j) => j !== i));
                    setIndex(0);
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          ))}
          {items.length < MAX_PICTURES && (
            <button type="button" className="img-thumb img-thumb-add" onClick={() => more.current?.click()} aria-label="إضافة صور">
              +
            </button>
          )}
          <input
            ref={more}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addFiles(list);
            }}
          />
        </div>
      )}
      <div className="img-send-row">
        <input className="img-caption" placeholder="أضف تعليقًا…" value={item?.caption ?? ""} maxLength={MAX_CHAT_TEXT} onChange={(e) => update({ caption: e.target.value })} />
        <button type="button" className="chat-send" onClick={() => void sendAll()} disabled={busy || items.length === 0} aria-label="إرسال">
          {busy ? "⏳" : "➤"}
        </button>
      </div>
    </div>
  );
}
