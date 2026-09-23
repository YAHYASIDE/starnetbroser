import Link from "next/link";

export default function StorePage() {
  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المتجر</h1>
      </div>

      <section className="section">
        <div className="coming-soon-card">
          <span className="coming-soon-icon" aria-hidden="true">🛰️</span>
          <p>قريبًا</p>
          <p className="settings-hint">سيتضمن المتجر الأجهزة والاكسسوارات - قيد الإعداد.</p>
        </div>
      </section>
    </main>
  );
}
