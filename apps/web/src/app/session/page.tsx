"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { VncViewer } from "@/components/VncViewer";

// A query-param route (?accountId=...), not a [accountId] dynamic
// segment: `output: "export"` (used for the GitHub Pages preview and
// the Capacitor/Android build) has no server to resolve dynamic path
// segments at request time, and account IDs aren't known at build time
// for generateStaticParams - this works as a single static page either way.
function SessionContent() {
  const accountId = useSearchParams().get("accountId");

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المتصفح السحابي</h1>
      </div>
      {accountId ? (
        <VncViewer accountId={accountId} />
      ) : (
        <p className="empty-state">لم يتم تحديد الحساب.</p>
      )}
    </main>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<main className="home"><p className="empty-state">جارِ التحميل…</p></main>}>
      <SessionContent />
    </Suspense>
  );
}
