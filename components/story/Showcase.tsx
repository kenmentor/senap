"use client";

import { useEffect, useRef, useState } from "react";
import { MockFrame } from "react-mockframe";
import { motion } from "motion/react";
import ExactGroupScreen from "./ExactGroupScreen";

const TABS = ["Status", "Chat", "Group"] as const;
type Tab = (typeof TABS)[number];

const PHONES = [
  { id: "Status", src: "/phones/updates-2026.html", label: "Status" },
  { id: "Chat", src: "/phones/chat-2026.html", label: "Chat" },
  { id: "Group", src: "/phones/group-2026.html", label: "Group" }
] as const;

const FRAME_W = 385;
const FRAME_H = 805;

function renderPhone(ph: (typeof PHONES)[number]) {
  return (
    <MockFrame device="Galaxy S25" color="blue-black">
      <ExactGroupScreen src={ph.src} />
    </MockFrame>
  );
}

export default function Showcase() {
  const [tab, setTab] = useState<Tab>("Status");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(800);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vhNow = window.innerHeight;
      // 0 when the row is a half-screen below center, 1 when a half-screen above.
      // The animation plays through while the row is actually visible.
      const e = 0.5 + (vhNow / 2 - (rect.top + rect.height / 2)) / vhNow;
      setP(Math.round(Math.min(1, Math.max(0, e)) * 1000) / 1000);
      // Fade the whole row out as its bottom edge leaves through the top.
      const exit = (rect.bottom - vhNow * 0.1) / (vhNow * 0.6);
      setOut(Math.round(Math.min(1, Math.max(0, exit)) * 1000) / 1000);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      onScroll();
    };
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const others = PHONES.filter((x) => x.id !== tab);
  const active = PHONES.find((x) => x.id === tab) ?? PHONES[0];
  const ordered = [others[0], active, others[1]];

  let h = Math.max(320, vh - 250);
  let w = (h * FRAME_W) / FRAME_H;
  const maxW = Math.min(230, vw * 0.3);
  if (w > maxW) {
    w = maxW;
    h = (w * FRAME_H) / FRAME_W;
  }
  const spread = 1 - p;
  const pitch = w * 0.48 + 110 * spread;
  const inset = w - pitch;
  const tilt = 4 + 12 * spread;
  // Fan exit: 1 while the row is in view, →0 as it scrolls past the top.
  const [out, setOut] = useState(1);

  return (
    <div ref={wrapRef} className="flex w-full flex-col items-center justify-center py-16" style={{ paddingBottom: 150 }}>
      <div className="flex gap-2 rounded-full p-1.5" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(134,150,160,0.2)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-full px-5 py-2 text-sm font-semibold"
            style={{
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "#04241d" : "var(--text-2)"
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6 flex w-full items-end justify-center" style={{ gap: 0, opacity: out, pointerEvents: out < 0.5 ? "none" : "auto" }}>
        {ordered.map((ph, i) => {
          const isCenter = ph.id === tab;
          const x = i === 0 ? inset : i === 2 ? -inset : 0;
          const rotate = i === 0 ? -tilt : i === 2 ? tilt : 0;
          return (
            <motion.div
              key={ph.id}
              initial={false}
              animate={{
                opacity: 1,
                x,
                y: isCenter ? -30 + p * 150 : 10 - p * 30,
                rotate
              }}
              transition={{ type: "spring", stiffness: 260, damping: 34, mass: 0.9 }}
              className="flex shrink-0 flex-col items-center"
              style={{ zIndex: isCenter ? 3 : 1, transformOrigin: "bottom center", width: w }}
            >
              <p className="mb-2 text-center text-[11px] font-bold uppercase" style={{ letterSpacing: "0.18em", color: "#00a884" }}>
                {ph.label}
              </p>
              <div style={{ width: w, height: h }}>
                <div style={{ width: FRAME_W, transform: `scale(${w / FRAME_W})`, transformOrigin: "top left" }}>
                  {renderPhone(ph)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
