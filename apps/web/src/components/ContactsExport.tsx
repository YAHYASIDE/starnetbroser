"use client";

import { useMemo, useState } from "react";
import { PartySheet } from "@/components/AccountsSection";
import { listClients, type ClientStore } from "@/lib/clientStore";
import { buildCards, toVcf, vcfDataUrl } from "@/lib/contactsExport";
import { saveChatMedia } from "@/lib/localBrowser";

/**
 * 📇 «احفظ الزبائن في جهات اتصالي» (his Nov 27 2026): one .vcf with the customers' names and numbers; opening it imports
 * them into the phone's contacts, so WhatsApp / WhatsApp Business (and the devices linked to it) show names instead of
 * bare numbers. lib/contactsExport.ts.
 */
export function ContactsExport({ clientStore, devices }: { clientStore: ClientStore; devices: { clientId?: string }[] }) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [onlyWithDevices, setOnlyWithDevices] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const build = useMemo(() => buildCards(listClients(clientStore), devices, { prefix, onlyWithDevices }), [clientStore, devices, prefix, onlyWithDevices]);

  async function save() {
    const message = await saveChatMedia(vcfDataUrl(toVcf(build.cards)), "STAR-NET-contacts.vcf", true);
    setNote(`${message} - في النافذة التي تظهر اختر «جهات الاتصال» (Contacts) ثم «استيراد / Import».`);
  }

  return (
    <>
      <button type="button" className="dialog-secondary" onClick={() => setOpen(true)}>
        📇 احفظ الزبائن في جهات اتصالي
      </button>
      {open && (
        <PartySheet title="📇 الزبائن كجهات اتصال" onClose={() => setOpen(false)}>
          <p className="settings-hint">
            يصنع ملفاً واحداً بأسماء الزبائن وأرقامهم. تفتحه في هاتفك فتدخل كلها دفعة واحدة إلى جهات الاتصال، فتظهر الأسماء في واتساب وواتساب
            الأعمال وفي الأجهزة المرتبطة بهما بدل الأرقام.
          </p>
          <label className="add-field-label" htmlFor="contacts-prefix">
            علامة قبل كل اسم (اختياري، مثل: ستارلينك -)
          </label>
          <input id="contacts-prefix" className="search-input" style={{ height: 44, minHeight: 0, flex: "none" }} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="بدون علامة" />
          <label className="toggle-switch-row">
            <span>الزبائن الذين عندهم جهاز فقط</span>
            <input type="checkbox" checked={onlyWithDevices} onChange={(e) => setOnlyWithDevices(e.target.checked)} />
          </label>
          <p className="settings-hint">
            سيُحفظ <bdi dir="ltr">{build.cards.length}</bdi> زبون.
            {build.skippedNoPhone > 0 && <> بلا رقم: <bdi dir="ltr">{build.skippedNoPhone}</bdi>.</>}
            {build.skippedNoName > 0 && <> مضافون برقمهم فقط (لا اسم): <bdi dir="ltr">{build.skippedNoName}</bdi>.</>}
            {build.duplicates > 0 && <> أرقام مكررة: <bdi dir="ltr">{build.duplicates}</bdi>.</>}
            {" "}الرقم من ثمانية أرقام بلا مفتاح دولة يُعدّ موريتانياً (+222).
          </p>
          <button type="button" className="dialog-primary" disabled={build.cards.length === 0} onClick={() => void save()}>
            📇 احفظ وافتح ملف جهات الاتصال
          </button>
          {note && <p className="settings-hint">{note}</p>}
        </PartySheet>
      )}
    </>
  );
}
