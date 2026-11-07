"use client";

import { useEffect, useRef, useState } from "react";
import Showcase from "./Showcase";
import ClosingSections from "./ClosingSections";

const SECTIONS = [
  { bg: "transparent", eyebrow: "Senap · AI business employee", title: "Meet Amaka.", accent: false },
  { bg: "#060c11", eyebrow: "Not a chatbot", title: "Hire her with words.", accent: false },
  { bg: "#0b141a", eyebrow: "Delegate anything", title: "She plans. She asks.", accent: false },
  { bg: "#0d1a15", eyebrow: "She does the work", title: "She delivers.", accent: true },
  { bg: "#07332a", eyebrow: "Live demonstration", title: "Scroll. Watch her work.", accent: true }
];

function IntroBlock({ bg, eyebrow, title, accent, extra }: { bg: string; eyebrow: string; title: string; accent: boolean; extra?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when section top hits viewport bottom, 1 when it reaches viewport top
      const raw = 1 - rect.top / vh;
      setT(Math.min(1, Math.max(0, raw)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={ref} className="flex min-h-[100svh] w-full flex-col items-center justify-center px-6 text-center" style={{ background: bg, overflow: "visible" }}>
      <div
        style={{
          opacity: t,
          transform: `translateY(${(1 - t) * 90}px) scale(${0.88 + 0.12 * t})`,
          transformOrigin: "center bottom"
        }}
      >
        <p className="text-sm font-bold uppercase" style={{ letterSpacing: "0.24em", color: "#00a884" }}>
          {eyebrow}
        </p>
        <p className="font-display mt-4 max-w-[900px] text-5xl font-extrabold md:text-7xl" style={{ color: accent ? "#00e69a" : "#e9edef" }}>
          {title}
        </p>
      </div>
      {extra && <Showcase />}
    </section>
  );
}

export default function IntroSections() {
  return (
    <>
      <IntroBlock {...SECTIONS[0]} extra />
      <ClosingSections />
      {SECTIONS.slice(1).map((s) => (
        <IntroBlock key={s.title} {...s} />
      ))}
    </>
  );
}
