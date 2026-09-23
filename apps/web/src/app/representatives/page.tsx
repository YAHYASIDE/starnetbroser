import Link from "next/link";

export default function RepresentativesPage() {
  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المندوبون</h1>
      </div>

      <section className="section">
        <div className="coming-soon-card">
          <span className="coming-soon-icon" aria-hidden="true">🤝</span>
          <p>قريبًا</p>
          <p className="settings-hint">هذه الميزة قيد الإعداد وسيتم شرحها لاحقًا.</p>
        </div>
      </section>
    </main>
  );
}
