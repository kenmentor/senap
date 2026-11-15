export default function Closing() {
  return (
    <>
      <section id="pricing" className="mx-auto w-full max-w-[1240px] px-5 pb-20 md:px-10 lg:px-[72px]">
        <p className="eyebrow">Pricing</p>
        <h2 className="font-display mt-2 text-4xl font-bold md:text-5xl">Start with one employee.</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {["Starter", "Business", "Professional"].map((p, i) => (
            <div key={p} className="panel rounded-2xl p-5">
              <p className="font-semibold">{p}</p>
              <p className="font-display mt-2 text-3xl font-bold">TBD</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">Placeholder. Pricing to be configured. WhatsApp platform fees separate.</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto w-full max-w-[1240px] px-5 pb-20 md:px-10 lg:px-[72px]">
        <p className="eyebrow">FAQ</p>
        <div className="mt-4 space-y-2">
          {[
            ["What is an AI employee?", "Someone you delegate to in words. It plans, prepares work, asks for approval, and reports results."],
            ["Can I approve its actions?", "Yes. Publishing, campaigns, and external sharing wait for your YES."],
            ["Can it message customers?", "It drafts and responds within permissions and consent. Opt-outs are always skipped."],
            ["What if WhatsApp disconnects?", "Work queues. Amaka keeps memory and tasks in the dashboard until reconnected."]
          ].map(([q, a]) => (
            <details key={q} className="panel rounded-xl px-4 py-3">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-1 text-sm text-[var(--text-2)]">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section id="cta" className="mx-auto w-full max-w-[1240px] px-5 pb-24 md:px-10 lg:px-[72px]">
        <div className="panel rounded-3xl p-10 text-center">
          <h2 className="font-display text-4xl font-bold md:text-5xl">Your next employee could be AI.</h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[var(--text-2)]">Describe the work. Set the rules. Let your employee get started.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#story" className="rounded-xl px-6 py-3 font-semibold" style={{ background: "var(--accent)", color: "#090A0C" }}>
              Hire your first employee
            </a>
            <a href="#product" className="rounded-xl px-6 py-3" style={{ border: "1px solid var(--border)" }}>
              Explore the product
            </a>
          </div>
        </div>
        <footer className="mt-10 flex flex-col items-center justify-between gap-3 text-xs text-[var(--text-3)] md:flex-row">
          <p>Senap · AI Business Employee · Sample demo data only</p>
          <p>Privacy · Terms · Contact · Docs (placeholders)</p>
        </footer>
      </section>
    </>
  );
}
