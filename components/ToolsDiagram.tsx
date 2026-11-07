"use client";

const nodes = ["WhatsApp", "Customers", "Inventory", "Orders", "Docs", "Reports"];

export default function ToolsDiagram() {
  return (
    <section id="product" className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-10 lg:px-[72px]">
      <p className="eyebrow">Connected tools</p>
      <h2 className="font-display mt-2 max-w-[620px] text-4xl font-bold md:text-5xl">One employee, many tools.</h2>
      <div className="panel mt-8 rounded-2xl p-6">
        <svg viewBox="0 0 600 260" className="w-full" role="img" aria-label="AI employee connected to business tools">
          <circle cx="300" cy="130" r="52" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <text x="300" y="126" textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700">Amaka</text>
          <text x="300" y="142" textAnchor="middle" fill="var(--text-2)" fontSize="10">employee</text>
          {nodes.map((n, i) => {
            const x = 80 + (i % 3) * 220;
            const y = i < 3 ? 40 : 220;
            return (
              <g key={n}>
                <line x1="300" y1="130" x2={x} y2={y} stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
                <rect x={x - 62} y={y - 16} width="124" height="32" rx="10" fill="#101216" stroke="rgba(255,255,255,0.12)" />
                <text x={x} y={y + 4} textAnchor="middle" fill="var(--text-2)" fontSize="11">{n}</text>
              </g>
            );
          })}
        </svg>
        <p className="mt-2 text-xs text-[var(--text-3)]">WhatsApp is a channel adapter. Records live in Postgres, not in chat history. Planned integrations labeled.</p>
      </div>
    </section>
  );
}
