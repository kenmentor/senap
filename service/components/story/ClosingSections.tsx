"use client";

import { useEffect, useRef, useState } from "react";
import { MockFrame } from "react-mockframe";
import ExactGroupScreen from "./ExactGroupScreen";

const PANELS = [
  {
    src: "/phones/updates-2026.html",
    eyebrow: "Customer care",
    title: "Every conversation, handled.",
    body: "Status, chats, groups. Amaka lives where your customers already are."
  },
  {
    src: "/phones/chat-2026.html",
    eyebrow: "Marketing · Inventory · Reports",
    title: "One employee. Whole shop.",
    body: "Products, promos, polls and support. One screen, zero switching."
  },
  {
    src: "/phones/group-2026.html",
    eyebrow: "Ready when you are",
    title: "Hire Amaka today.",
    body: "Give her the job in words. She starts immediately.",
    cta: true
  }
] as const;

const PHONE_W = 230;
const PHONE_H = PHONE_W * 2.09;
const N = PANELS.length;

function PhoneStack({ progress }: { progress: number }) {
  return (
    <div style={{ position: "relative", width: PHONE_W, height: PHONE_H }}>
      {PANELS.map((s, i) => {
        // Each screen is centered on its section; neighboring screens
        // dissolve + slide through each other as the phone travels.
        const center = i + 0.5;
        const d = Math.abs(progress - center);
        const opacity = Math.max(0, 1 - d * 1.5);
        const scale = 1 - Math.min(1, d) * 0.06;
        const y = (progress - center) * -46;
        return (
          <div
            key={s.src}
            style={{
              position: "absolute",
              inset: 0,
              opacity,
              transform: `translateY(${y}px) scale(${scale})`,
              pointerEvents: opacity > 0.5 ? "auto" : "none",
              willChange: "transform, opacity"
            }}
          >
            <div style={{ width: PHONE_W, height: PHONE_H, overflow: "hidden" }}>
              <div style={{ width: 385, transform: "scale(0.5974)", transformOrigin: "top left" }}>
                <MockFrame device="Galaxy S25" color="blue-black">
                  <ExactGroupScreen src={s.src} />
                </MockFrame>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ClosingSections() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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

  // Continuous scroll position across the 3 sections (0 → 3).
  const progress = Math.min(N - 0.001, Math.max(0, p * N));
  const active = Math.min(N - 1, Math.floor(progress));

  // The phone glides down 1:1 with the scroll: no steps, no snapping.
  // Bound directly via style so it tracks the finger like a scrub.
  // Smaller descent on mobile so the phone stays in its top slot.
  const TRAVEL = compact ? 130 : 300;
  const phoneY = -TRAVEL / 2 + p * TRAVEL;

  // Only after the third section is fully past does the phone sink + fade.
  // While any text section is on screen the phone stays fully visible.
  const fadeStart = 0.95;
  const fade = p > fadeStart ? Math.min(1, (p - fadeStart) / (1 - fadeStart)) : 0;
  const opacity = 1 - fade;
  const exitY = phoneY + fade * 120;
  const scale = 1 - fade * 0.12;

  return (
    <div
      ref={wrapRef}
      style={{
        background:
          "radial-gradient(55% 42% at 28% 32%, rgba(0,168,132,0.12), transparent 70%), radial-gradient(45% 40% at 75% 75%, rgba(0,168,132,0.07), transparent 70%), #000000"
      }}
    >
      <div className="mx-auto grid w-full max-w-[1000px] grid-cols-1 px-6 md:grid-cols-2 md:gap-14">
        {/* One phone: sticky, glides down with the scroll, fades after #3.
            On mobile it hugs the top with a little padding, sitting above the text. */}
        <div className="sticky top-0 z-10 flex h-[52svh] items-start justify-center pt-4 md:h-[100svh] md:items-center md:pt-0">
          <div className="origin-center scale-[0.62] sm:scale-[0.8] md:scale-100">
            <div
              style={{
                transform: `translateY(${exitY}px) scale(${scale})`,
                opacity,
                pointerEvents: opacity < 0.5 ? "none" : "auto",
                willChange: "transform, opacity"
              }}
            >
              <PhoneStack progress={progress} />
            </div>
          </div>
        </div>

        {/* 3 consecutive sections */}
        <div>
          {PANELS.map((s, i) => {
            // Text brightens as its section reaches viewport center,
            // dims as it leaves, same continuous curve as the phone.
            const center = (i + 0.5) / N;
            const dist = Math.abs(p - center);
            const tOpacity = 1 - Math.min(0.7, dist * 3);
            const tY = (p - center) * -70;
            return (
              <section key={s.src} className="flex min-h-[100svh] flex-col justify-end pb-16 pt-8 md:justify-center md:py-16">
                <div style={{ opacity: tOpacity, transform: `translateY(${tY}px)`, willChange: "transform, opacity" }}>
                  <p className="text-sm font-bold uppercase" style={{ letterSpacing: "0.24em", color: "#00a884" }}>
                    {s.eyebrow} · {i + 1}/3
                  </p>
                  <p className="font-display mt-3 text-4xl font-extrabold md:text-5xl" style={{ color: "#e9edef" }}>
                    {s.title}
                  </p>
                  <p className="mt-3 text-lg" style={{ color: "var(--text-2)" }}>
                    {s.body}
                  </p>
                  {"cta" in s && s.cta && (
                    <a
                      href="/signup"
                      className="mt-6 inline-block rounded-full px-7 py-3 text-base font-bold"
                      style={{ background: "#00a884", color: "#04241d" }}
                    >
                      Get your employee
                    </a>
                  )}
                </div>
                <div className="mt-6 flex gap-2">
                  {PANELS.map((d, j) => (
                    <span
                      key={d.src}
                      className="h-1.5 rounded-full"
                      style={{
                        width: j === i ? 28 : 8,
                        background: j === i ? "#00a884" : "rgba(134,150,160,0.3)",
                        transition: "all 0.3s"
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {/* scroll room so the phone can sink + fade after section 3 */}
          <div className="h-[70svh]" aria-hidden />
        </div>
      </div>
    </div>
  );
}
