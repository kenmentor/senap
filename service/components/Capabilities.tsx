import { MessageCircle, Megaphone, Headset, Package, BarChart3 } from "lucide-react";

const groups = [
  { icon: MessageCircle, title: "Sales", body: "Enquiries, recommendations, orders, follow-ups from real records." },
  { icon: Megaphone, title: "Marketing", body: "Drafts, status previews, approvals. Draft ≠ published." },
  { icon: Headset, title: "Support", body: "FAQs, order info, escalation to owner when unsure." },
  { icon: Package, title: "Operations", body: "Inventory, tasks, reminders, spreadsheets from fixtures." },
  { icon: BarChart3, title: "Intelligence", body: "Sales summaries, retention, stock position from seeded data." }
];

export default function Capabilities() {
  return (
    <section id="capabilities" className="mx-auto w-full max-w-[1240px] px-5 py-20 md:px-10 lg:px-[72px]">
      <p className="eyebrow">Capabilities</p>
      <h2 className="font-display mt-2 max-w-[620px] text-4xl font-bold md:text-5xl">More than answering messages.</h2>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="panel rounded-2xl p-5">
            <g.icon size={20} color="var(--accent)" />
            <p className="mt-3 font-semibold">{g.title}</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
