import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell">
      <div className="phone-frame">
        <section className="screen-section center-screen">
          <div className="done-label">404</div>
          <h1>このページは見つかりません</h1>
          <Link className="primary-button huge" href="/">
            SETLOGへ戻る
          </Link>
        </section>
      </div>
    </main>
  );
}
