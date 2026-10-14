"use client";

import type { StarlinkAccountSummary } from "@starnet/shared";

interface Props {
  devices: StarlinkAccountSummary[];
  onOpen: (account: StarlinkAccountSummary) => void;
  onDismiss: () => void;
}

/** 🚨 Full-screen alarm: Starlink's "وضع المحيط" is ON for these devices. */
export function OceanModeAlarm({ devices, onOpen, onDismiss }: Props) {
  return (
    <div className="ocean-alarm" role="alertdialog" aria-modal="true" aria-labelledby="ocean-alarm-title">
      <div className="ocean-alarm-box">
        <div className="ocean-alarm-icon" aria-hidden="true">🚨</div>
        <h2 id="ocean-alarm-title">تحذير خطير: وضع المحيط مفعّل!</h2>
        <p className="ocean-alarm-text">
          وضع المحيط يحسب كل جيجابايت بسعر بحري (<bdi dir="ltr">$2 - $6</bdi> لكل جيجا)، وقد تصل الفاتورة إلى آلاف الدولارات. أوقفه فوراً.
        </p>
        <ul className="ocean-alarm-list">
          {devices.map((device) => (
            <li key={device.id}>
              <span>🌊 {device.name}</span>
              <button type="button" onClick={() => onOpen(device)}>فتح الحساب لإيقافه ↗</button>
            </li>
          ))}
        </ul>
        <p className="ocean-alarm-steps">
          للإيقاف: الاشتراك ← البيانات ← <strong>وضع المحيط</strong> ← أطفئ المفتاح. ثم اضغط «تحديث من STARLINK» ليختفي هذا التحذير.
        </p>
        <button type="button" className="ocean-alarm-dismiss" onClick={onDismiss}>
          فهمت - سأوقفه الآن
        </button>
      </div>
    </div>
  );
}
