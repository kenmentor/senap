"use client";

import { useEffect, useRef, useState } from "react";

const TASKS = [
  "Check product inventory",
  "Prepare product promotion",
  "Review sales records",
  "Create sales report"
];

export default function NextSection() {
  const ref = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setFull(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setFull(entry.intersectionRatio >= 0.25),
      { threshold: [0, 0.25, 0.5] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const item = (i: number): React.CSSProperties => ({
    opacity: full ? 1 : 0,
    transform: full ? "translateY(0)" : "translateY(28px)",
    transition: "opacity 0.6s ease, transform 0.6s ease",
    transitionDelay: full ? `${i * 120}ms` : "0ms",
    pointerEvents: full ? "auto" : "none"
  });

  return (
    <section ref={ref} className="flex min-h-[100svh] w-full flex-col items-center justify-center px-6 py-8" style={{ background: "#04241d" }}>
      <p className="text-sm font-bold uppercase" style={{ ...item(0), letterSpacing: "0.24em", color: "#00a884" }}>
        Next · Amaka gets to work
      </p>
      <p className="font-display mt-3 max-w-[900px] text-center text-4xl font-extrabold md:text-5xl" style={{ ...item(1), color: "#e9edef" }}>
        One message becomes a plan.
      </p>
      <div className="mt-8 flex w-full max-w-[600px] flex-col gap-3">
        {TASKS.map((task, i) => (
          <div
            key={task}
            className="rounded-2xl px-6 py-4 text-center text-xl font-extrabold md:text-2xl"
            style={{
              border: "1px solid rgba(0,168,132,0.35)",
              background: "rgba(0,0,0,0.35)",
              color: "#e9edef",
              ...item(2 + i)
            }}
          >
            <span style={{ color: "#00a884" }}>0{i + 1} · </span>
            {task}
          </div>
        ))}
      </div>
    </section>
  );
}
