export default function MemoryTrust() {
  return (
    <>
      <section id="how" className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-10 lg:px-[72px]">
        <p className="eyebrow">Memory & understanding</p>
        <h2 className="font-display mt-2 max-w-[620px] text-4xl font-bold md:text-5xl">She remembers the business.</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          {[
            ["Business", "Name, hours, policies, prices"],
            ["Products", "Everyday Tote · 5 @ ₦4,000"],
            ["Customers", "Eligible vs opted-out, history"],
            ["Decisions", "Approvals, tasks, outcomes"]
          ].map(([t, b]) => (
            <div key={t} className="panel rounded-2xl p-5">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-3)]">Facts stay facts. Assumptions stay drafts until you confirm.</p>
      </section>
      <section className="mx-auto w-full max-w-[1240px] px-5 pb-20 md:px-10 lg:px-[72px]">
        <p className="eyebrow">Control & trust</p>
        <h2 className="font-display mt-2 max-w-[620px] text-4xl font-bold md:text-5xl">You stay in charge.</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <div className="panel rounded-2xl p-5" style={{ borderColor: "rgba(54,201,143,0.4)" }}>
            <p className="font-semibold" style={{ color: "var(--success)" }}>Independent</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">Read records, draft replies, check stock, prepare reports.</p>
          </div>
          <div className="panel rounded-2xl p-5" style={{ borderColor: "rgba(232,181,91,0.4)" }}>
            <p className="font-semibold" style={{ color: "var(--warning)" }}>Needs approval</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">Publish status, start campaign, share customer data externally.</p>
          </div>
          <div className="panel rounded-2xl p-5" style={{ borderColor: "rgba(230,106,106,0.4)" }}>
            <p className="font-semibold" style={{ color: "var(--error)" }}>Never</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">Guess prices, message opt-outs, bypass permissions, delete data.</p>
          </div>
        </div>
      </section>
    </>
  );
}
