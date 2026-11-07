"use client";

import { useEffect, useRef, useState } from "react";
import { MockFrame } from "react-mockframe";
import { motion } from "motion/react";
import ExactGroupScreen from "./ExactGroupScreen";

const PANELS = [
  {
    src: "/phones/updates-2026.html",
    eyebrow: "Customer care",
    title: "Every conversation, handled.",
    body: "Status, chats, groups — Amaka lives where your customers already are."
  },
  {
    src: "/phones/chat-2026.html",
    eyebrow: "Marketing · Inventory · Reports",
    title: "One employee. Whole shop.",
    body: "Products, promos, polls and support — one screen, zero switching."
  },
  {
    src: "/phones/group-2026.html",
    eyebrow: "Ready when you are",
    title: "Hire Amaka today.",
    body: "Give her the job in words. She starts immediately.",
    cta: true
  }
] as const;

export default function ClosingSections() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = Math.max(1, rect.height - vh);
      const done = Math.min(Math.max(-rect.top, 0), total);
      setP(Math.round((done / total) * 1000) / 1000);
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

  const active = Math.min(2, Math.floor(p * 3));
  // Physical travel: drops in from the hero phones above, docks, exits downward.
  const vhPx = typeof window === "undefined" ? 800 : Math.max(320, window.innerHeight || 800);
  const travelY =
    p < 0.15 ? -vhPx * 0.7 * (1 - p / 0.15) : p > 0.85 ? vhPx * 0.7 * ((p - 0.85) / 0.15) : (0.5 - p) * 50;

  return (
    <div ref={wrapRef} style={{ height: "320svh", background: "#000000" }}>
      <div className="flex h-[100svh] w-full items-center justify-center" style={{ position: "sticky", top: 0 }}>
        <div className="mx-auto flex w-full max-w-[1000px] flex-col items-center justify-center gap-8 px-6 md:flex-row md:gap-14">
          <motion.div
            className="shrink-0"
            initial={false}
            animate={{ x: 0, y: travelY, opacity: p < 0.22 ? 0 : 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ width: 230, pointerEvents: p < 0.22 ? "none" : "auto" }}
          >
            <div style={{ position: "relative", width: 230, height: 230 * 2.09 }}>
              {PANELS.map((s, i) => (
                <div
                  key={s.src}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: i === active ? 1 : 0,
                    transform: `scale(${i === active ? 1 : 0.95})`,
                    transition: "opacity 0.45s ease, transform 0.45s ease",
                    pointerEvents: i === active ? "auto" : "none"
                  }}
                >
                  <div style={{ width: 230, height: 230 * 2.09, overflow: "hidden" }}>
                    <div style={{ width: 385, transform: "scale(0.5974)", transformOrigin: "top left" }}>
                      <MockFrame device="Galaxy S25" color="blue-black">
                        <ExactGroupScreen src={s.src} />
                      </MockFrame>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
          <div className="w-full max-w-[420px] text-center md:text-left">
            {PANELS.map((s, i) => (
              <div key={s.src} style={{ display: i === active ? "block" : "none" }}>
                <p className="text-sm font-bold uppercase" style={{ letterSpacing: "0.24em", color: "#00a884" }}>
                  {s.eyebrow}
                </p>
                <p className="font-display mt-3 text-4xl font-extrabold md:text-5xl" style={{ color: "#e9edef" }}>
                  {s.title}
                </p>
                <p className="mt-3 text-lg" style={{ color: "var(--text-2)" }}>
                  {s.body}
                </p>
                {"cta" in s && s.cta && (
                  <a href="#story" className="mt-6 inline-block rounded-full px-7 py-3 text-base font-bold" style={{ background: "#00a884", color: "#04241d" }}>
                    Get your employee
                  </a>
                )}
              </div>
            ))}
            <div className="mt-6 flex justify-center gap-2 md:justify-start">
              {PANELS.map((s, i) => (
                <span key={s.src} className="h-1.5 rounded-full" style={{ width: i === active ? 28 : 8, background: i === active ? "#00a884" : "rgba(134,150,160,0.3)", transition: "all 0.3s" }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
