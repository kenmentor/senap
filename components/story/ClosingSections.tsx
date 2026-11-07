const SECTIONS = [
  {
    bg: "#0d151c",
    eyebrow: "Customer care",
    title: "Every conversation, handled.",
    accent: false
  },
  {
    bg: "#101a22",
    eyebrow: "Marketing · Inventory · Reports",
    title: "One employee. Whole shop.",
    accent: false
  },
  {
    bg: "#04241d",
    eyebrow: "Ready when you are",
    title: "Hire Amaka today.",
    accent: true,
    cta: true
  }
];

export default function ClosingSections() {
  return (
    <>
      {SECTIONS.map((s) => (
        <section
          key={s.title}
          className="flex min-h-[100svh] w-full flex-col items-center justify-center px-6 text-center"
          style={{ background: s.bg }}
        >
          <p className="text-sm font-bold uppercase" style={{ letterSpacing: "0.24em", color: "#00a884" }}>
            {s.eyebrow}
          </p>
          <p className="font-display mt-4 max-w-[900px] text-5xl font-extrabold md:text-7xl" style={{ color: s.accent ? "#00e69a" : "#e9edef" }}>
            {s.title}
          </p>
          {s.cta && (
            <a
              href="#story"
              className="mt-8 rounded-full px-8 py-3.5 text-base font-bold"
              style={{ background: "#00a884", color: "#04241d" }}
            >
              Get your employee
            </a>
          )}
        </section>
      ))}
    </>
  );
}
