"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { deleteProof, getProof } from "@/lib/paymentProofStore";
import { loadDeviceShots, removeDeviceShot, saveDeviceShots, type DeviceShot } from "@/lib/deviceShots";

function when(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 📎 A device's kept screenshots (from «📸 لقطة ذكية» in its browser), newest first - tap one for the whole screen. */
export function DeviceShotsSheet({ accountId, name, onClose }: { accountId: string; name: string; onClose: () => void }) {
  const [shots, setShots] = useState<DeviceShot[]>(() => loadDeviceShots()[accountId] ?? []);
  const [images, setImages] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all(shots.map(async (s) => [s.id, await getProof(s.id)] as const)).then((pairs) => {
      if (alive) setImages(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => Boolean(p[1]))));
    });
    return () => {
      alive = false;
    };
  }, [shots]);

  function remove(shot: DeviceShot) {
    if (!window.confirm("حذف هذه اللقطة؟")) return;
    const next = removeDeviceShot(loadDeviceShots(), accountId, shot.id);
    saveDeviceShots(next);
    void deleteProof(shot.id);
    setShots(next[accountId] ?? []);
  }

  return (
    <PartySheet title={`📎 لقطات ${name}`} onClose={onClose}>
      {shots.length === 0 ? (
        <p className="party-empty">لا لقطات - في متصفح الجهاز: 📸 ← «📎 احفظ في سجل الجهاز».</p>
      ) : (
        <ul className="device-shots-list">
          {shots.map((s) => (
            <li key={s.id} className="device-shots-item">
              <button type="button" className="device-shots-thumb" onClick={() => images[s.id] && setOpen(images[s.id]!)} aria-label="عرض اللقطة كاملة">
                {images[s.id] ? <img src={images[s.id]} alt={`لقطة ${when(s.at)}`} /> : <span>⏳</span>}
              </button>
              <div className="device-shots-meta">
                <bdi dir="ltr">{when(s.at)}</bdi>
                <button type="button" className="text-action" onClick={() => remove(s)}>
                  🗑️ حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="settings-hint">اللقطات محفوظة في هذا الهاتف (وفي النسخة الاحتياطية).</p>
      {open && (
        <div className="rep-receipt-viewer" role="dialog" aria-label="اللقطة" onClick={() => setOpen(null)}>
          <button type="button" className="rep-receipt-close" aria-label="إغلاق" onClick={() => setOpen(null)}>
            ✕
          </button>
          <img src={open} alt="اللقطة" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </PartySheet>
  );
}
