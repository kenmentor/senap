"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "motion/react";
import { ChatBubble } from "@/components/ui/whatsapp/chat-bubble";
import { ChatHeader } from "@/components/ui/whatsapp/chat-header";
import { ImageBubble } from "@/components/ui/whatsapp/image-bubble";
import { TypingIndicator } from "@/components/ui/whatsapp/typing-indicator";
import type { MessageStatus } from "@/components/ui/whatsapp/message-status";

// ---------- script ----------
const M1 = "Amaka, we have twelve of the Tecno Spark 20 left at ₦155,000 each. Prepare a promotion, check our sales and create a report for Mr Chi.";
const M2 = "I'm here to help. I'll check the stock, prepare the promotion and put together the sales report. I'll ask you before publishing or sharing anything.";
const M3 = "Can you complete the whole task now?";
const M4 = "Yes. I'll handle the steps I can complete and bring anything that needs your approval to you.";

const PROMO_CAPTION = "Promo is LIVE. Tecno Spark 20 at ₦155,000, only 12 left. DM me to grab yours before Sunday.";
const PROMO_IMG = "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=60";
const PROMO_IMG_FALLBACK = "https://picsum.photos/seed/nala-phones/800/800";
const AMAKA_AVATAR = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=60";
const AMAKA_AVATAR_FALLBACK = "https://picsum.photos/seed/nala-amaka/200/200";
const Q1 = "Hello Amaka, is pickup available today please?";
const R1 = "Yes Adaeze. Pickup is available today until 6pm. I have reserved one phone for you.";
const MKT = "Evening fam, market update! BTC held support all day while alts bled a little. No panic. Volume is thin into the weekend. Drop your charts below.";
const POLL_Q = "Weekend pump pick";
const POLL_SUB = "Select one or more";
const POLL_OPTIONS = [
  { id: "btc", label: "BTC", votes: 3, faces: ["T", "A"] },
  { id: "eth", label: "ETH", votes: 1, faces: ["J"] },
  { id: "sol", label: "SOL", votes: 1, faces: ["M"] }
] as const;

// ---------- audio (unchanged behavior: pop = outgoing, notify = incoming) ----------
let audioCtx: AudioContext | null = null;
function pop() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  } catch {
    /* silent */
  }
}

let notificationAudio: HTMLAudioElement | null = null;
function notify() {
  try {
    if (!notificationAudio) notificationAudio = new Audio("/sounds/notification.mp3");
    notificationAudio.currentTime = 0;
    void notificationAudio.play().catch(() => {});
  } catch {
    /* silent until first tap (browser autoplay policy) */
  }
}

// ---------- scene windows (all in c space, 0 → 1) ----------
const W = {
  phaseB: 0.335,
  phaseC: 0.63,
  phaseD: 0.89
} as const;

export default function ScrollStory() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // null = not yet measured (first paint / SSR): show M1 so the frame is never empty.
  const [p, setP] = useState<number | null>(null);
  const sounded = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: {
          trigger: wrapRef.current,
          start: "top top",
          end: "+=600%",
          scrub: 1,
          pin: stageRef.current,
          pinSpacing: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => setP(Math.round(self.progress * 1000) / 1000)
        }
      });
    }, wrapRef);
    return () => ctx.revert();
  }, []);

  // --- script (fully reversible; content starts after the frame entrance 0→0.06) ---
  const c = p === null ? null : Math.min(1, Math.max(0, (p - 0.06) / 0.94));

  // Phase A: 1:1 instruction
  const m1 = c === null || c > 0;
  const m1Status: MessageStatus = c === null || c >= 0.06 ? "read" : c >= 0.03 ? "delivered" : "sent";
  const typing1 = c !== null && c >= 0.07 && c < 0.12;
  const m2 = c !== null && c >= 0.12;
  const m3 = c !== null && c >= 0.2;
  const m3Status: MessageStatus = c === null || c >= 0.26 ? "read" : c !== null && c >= 0.23 ? "delivered" : "sent";
  const typing2 = c !== null && c >= 0.25 && c < 0.295;
  const m4 = c !== null && c >= 0.295;

  // Phase B: VIP group — promo photos, customer question, reply
  const inB = c !== null && c >= W.phaseB && c < W.phaseC;
  const typingB1 = c !== null && c >= 0.35 && c < 0.4;
  const imgs = c !== null && c >= 0.4 && c < W.phaseC;
  const q1 = c !== null && c >= 0.48 && c < W.phaseC;
  const typingB2 = c !== null && c >= 0.52 && c < 0.57;
  const replyB = c !== null && c >= 0.57 && c < W.phaseC;

  // Phase C: crypto group — market update + live poll
  const inC = c !== null && c >= W.phaseC && c < W.phaseD;
  const typingC = c !== null && c >= 0.65 && c < 0.695;
  const mkt = c !== null && c >= 0.695 && c < W.phaseD;
  const poll = c !== null && c >= 0.75 && c < W.phaseD;
  const voteQ = c === null ? 0 : Math.min(1, Math.max(0, (c - 0.75) / 0.11));

  // Phase D: status — one big card, second status pops in
  const inD = c !== null && c >= W.phaseD;
  const st1 = c !== null && c >= 0.9;
  const st2 = c !== null && c >= 0.945;
  const seg1 = c === null ? 0 : Math.min(1, Math.max(0, (c - 0.9) / 0.045));
  const seg2 = c === null ? 0 : Math.min(1, Math.max(0, (c - 0.945) / 0.05));

  useEffect(() => {
    if (m1 && !sounded.current.has("m1")) { sounded.current.add("m1"); pop(); }
    if (m2 && !sounded.current.has("m2")) { sounded.current.add("m2"); notify(); }
    if (m3 && !sounded.current.has("m3")) { sounded.current.add("m3"); pop(); }
    if (m4 && !sounded.current.has("m4")) { sounded.current.add("m4"); notify(); }
    if (imgs && !sounded.current.has("imgs")) { sounded.current.add("imgs"); notify(); }
    if (q1 && !sounded.current.has("q1")) { sounded.current.add("q1"); pop(); }
    if (replyB && !sounded.current.has("replyB")) { sounded.current.add("replyB"); notify(); }
    if (mkt && !sounded.current.has("mkt")) { sounded.current.add("mkt"); notify(); }
    if (poll && !sounded.current.has("poll")) { sounded.current.add("poll"); notify(); }
    if (st1 && !sounded.current.has("st1")) { sounded.current.add("st1"); notify(); }
    if (st2 && !sounded.current.has("st2")) { sounded.current.add("st2"); notify(); }
  }, [m1, m2, m3, m4, imgs, q1, replyB, mkt, poll, st1, st2]);

  return (
    <section id="story" ref={wrapRef} style={{ height: "700svh" }}>
      <div ref={stageRef} className="flex h-screen w-full flex-col" style={{ position: "relative", zIndex: 20, height: "100svh" }}>
        {/* header crossfades per phase */}
        <div className="relative h-[59px] w-full shrink-0">
          <HeaderLayer show={c === null || c < W.phaseB}>
            <ChatHeader name="Nala Phones" status="Amaka · AI employee" isOnline />
          </HeaderLayer>
          <HeaderLayer show={inB}>
            <ChatHeader name="Nala Phones VIP" status="Amaka, Adaeze, +248" isOnline />
          </HeaderLayer>
          <HeaderLayer show={inC}>
            <ChatHeader name="Crypto Watch" status="Amaka, Tunde, +248" isOnline />
          </HeaderLayer>
          <HeaderLayer show={inD}>
            <ChatHeader name="Status" status="Amaka · 2 updates" isOnline />
          </HeaderLayer>
        </div>

        <motion.div
          className="relative mx-auto w-full max-w-[800px] flex-1 px-4 pb-12 md:px-6 md:pb-0"
          initial={false}
          animate={(() => {
            const t = p === null ? 1 : Math.min(p / 0.06, 1);
            return {
              opacity: t,
              y: `${(1 - t) * 70}svh`,
              scale: 0.92 + 0.08 * t
            };
          })()}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{ transformOrigin: "bottom center" }}
        >
          <Phase show={c === null || c < W.phaseB}>
            <div className="flex min-h-full flex-col justify-center py-3 [--wa-msg-max-width:82%] sm:[--wa-msg-max-width:70%] md:[--wa-msg-max-width:65%]">
              <Fade show={m1}>
                <ChatBubble variant="outgoing" showTail timestamp="19:42" status={m1Status}>
                  {M1}
                </ChatBubble>
              </Fade>
              {typing1 && !m2 && <TypingIndicator sender="Amaka" />}
              <Fade show={m2}>
                <ChatBubble variant="incoming" showTail timestamp="19:43">
                  {M2}
                </ChatBubble>
              </Fade>
              <Fade show={m3}>
                <ChatBubble variant="outgoing" showTail timestamp="19:44" status={m3Status}>
                  {M3}
                </ChatBubble>
              </Fade>
              {typing2 && !m4 && <TypingIndicator sender="Amaka" />}
              <Fade show={m4} last>
                <ChatBubble variant="incoming" showTail timestamp="19:44">
                  {M4}
                </ChatBubble>
              </Fade>
            </div>
          </Phase>

          <Phase show={inB}>
            <div className="flex min-h-full flex-col justify-center py-3 [--wa-msg-max-width:82%] sm:[--wa-msg-max-width:70%] md:[--wa-msg-max-width:65%]">
              {typingB1 && !imgs && <TypingIndicator sender="Amaka" senderColor="#00a884" />}
              <Fade show={imgs}>
                <div className="[&_img]:max-h-[200px] sm:[&_img]:max-h-[330px]">
                  <ImageBubble variant="incoming" showTail src={PROMO_IMG} fallbackSrc={PROMO_IMG_FALLBACK} caption={PROMO_CAPTION} timestamp="19:51" />
                </div>
              </Fade>
              <Fade show={q1}>
                <ChatBubble variant="incoming" showTail isGroupChat sender="Adaeze" senderColor="#e67e22" timestamp="19:53">
                  {Q1}
                </ChatBubble>
              </Fade>
              {typingB2 && !replyB && <TypingIndicator sender="Amaka" senderColor="#00a884" />}
              <Fade show={replyB} last>
                <ChatBubble variant="incoming" showTail isGroupChat sender="Amaka" senderColor="#00a884" timestamp="19:54">
                  {R1}
                </ChatBubble>
              </Fade>
            </div>
          </Phase>

          <Phase show={inC}>
            <div className="flex min-h-full flex-col justify-center py-3 [--wa-msg-max-width:82%] sm:[--wa-msg-max-width:70%] md:[--wa-msg-max-width:65%]">
              {typingC && !mkt && <TypingIndicator sender="Amaka" senderColor="#00a884" />}
              <Fade show={mkt}>
                <ChatBubble variant="incoming" showTail isGroupChat sender="Amaka" senderColor="#00a884" timestamp="20:12">
                  {MKT}
                </ChatBubble>
              </Fade>
              <Fade show={poll} last>
                <PollBubble question={POLL_Q} sub={POLL_SUB} progress={voteQ} timestamp="9:00 PM" />
              </Fade>
            </div>
          </Phase>

          <Phase show={inD}>
            <div className="relative flex h-full flex-col items-center justify-center py-3">
              <motion.div
                className="h-[56svh] md:h-[64svh]"
                initial={false}
                animate={st2 ? { scale: [1, 1.045, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <StatusCard seg1={seg1} seg2={seg2} second={st2} />
              </motion.div>
            </div>
          </Phase>
        </motion.div>
        <div className="mx-auto mb-4 h-1 w-full max-w-[480px] overflow-hidden rounded-full px-6" style={{ background: "rgba(134,150,160,0.2)" }}>
          <div className="h-full rounded-full" style={{ width: `${(p ?? 0) * 100}%`, background: "var(--accent)" }} />
        </div>
      </div>
    </section>
  );
}

function HeaderLayer({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: show ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: show ? "auto" : "none"
      }}
    >
      {children}
    </div>
  );
}

function Phase({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-center overflow-hidden"
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 40, scale: show ? 1 : 0.97 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: show ? "auto" : "none", transformOrigin: "bottom center" }}
    >
      {children}
    </motion.div>
  );
}

function Fade({ show, last, children }: { show: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      aria-hidden={!show}
      className="overflow-hidden"
      initial={false}
      animate={{
        opacity: show ? 1 : 0,
        y: show ? 0 : 48,
        scale: show ? 1 : 0.94,
        height: show ? "auto" : 0,
        marginBottom: show && !last ? 8 : 0
      }}
      whileTap={show ? { scale: 1.04, y: -8 } : undefined}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: show ? "auto" : "none", transformOrigin: "bottom center" }}
    >
      {children}
    </motion.div>
  );
}

function PollBubble({ question, sub, progress, timestamp }: { question: string; sub: string; progress: number; timestamp: string }) {
  const max = Math.max(...POLL_OPTIONS.map((o) => o.votes));
  return (
    <div className="flex w-full justify-start">
      <div className="font-wa relative w-full max-w-[336px] rounded-lg rounded-bl-none bg-wa-bubble-incoming px-3 pb-[7px] pt-[10px]">
        <svg viewBox="0 0 8 13" width="8" height="13" className="absolute bottom-0 -left-[8px]">
          <path d="M2.812 12H8V0.807L1.533 9.432C0.474 10.844 1.042 12 2.812 12z" className="fill-wa-always-black" opacity={0.13} />
          <path d="M2.812 13H8V1.807L1.533 10.432C0.474 11.844 1.042 13 2.812 13z" className="fill-wa-bubble-incoming" />
        </svg>
        <p className="text-[15px] font-bold leading-[20px] text-wa-text-primary">{question}</p>
        <div className="mt-1 flex items-center gap-[6px]">
          <span className="flex h-[14px] w-[14px] items-center justify-center rounded-full" style={{ background: "rgba(0,168,132,0.9)" }}>
            <svg viewBox="0 0 10 8" width="8" height="6" fill="none" stroke="#fff" strokeWidth="1.6">
              <path d="M1 4l2.5 2.5L9 1" />
            </svg>
          </span>
          <span className="text-[12px] leading-[16px] text-wa-text-secondary">{sub}</span>
        </div>
        <div className="mt-2 flex flex-col">
          {POLL_OPTIONS.map((o) => {
            const count = Math.round(o.votes * progress);
            const barW = (o.votes / max) * 100 * progress;
            return (
              <div key={o.id} className="py-[7px]">
                <div className="flex items-center gap-2">
                  <span className="h-[15px] w-[15px] shrink-0 rounded-full" style={{ border: "1.5px solid var(--wa-text-secondary)" }} />
                  <span className="text-[14px] font-medium leading-[18px] text-wa-text-primary">{o.label}</span>
                  <span className="ml-auto flex items-center">
                    {o.faces.map((f, fi) => (
                      <span
                        key={fi}
                        className="-ml-[6px] flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white first:ml-0"
                        style={{ background: ["#008069", "#00a884", "#53bdeb"][fi % 3], border: "1.5px solid var(--wa-bubble-incoming)" }}
                      >
                        {f}
                      </span>
                    ))}
                    <span className="ml-1 min-w-[14px] text-right text-[12px] leading-[16px] text-wa-text-secondary">{count}</span>
                  </span>
                </div>
                <div className="mt-[6px] h-[6px] w-full overflow-hidden rounded-full" style={{ background: "rgba(134,150,160,0.22)" }}>
                  <div className="h-full rounded-full" style={{ width: `${barW}%`, background: "#00a884", transition: "width 0.15s linear" }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-center text-[13px] font-bold leading-[18px]" style={{ color: "#53bdeb" }}>
          View votes
        </p>
        <div className="mt-[2px] flex items-center justify-end gap-[3px]">
          <span className="text-[11px] leading-[15px] text-wa-bubble-meta">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}

// One big status-viewer card (mirrors the Updates template cards):
// photo, viewer progress segments, Amaka header, second status swaps in.
const STATUS_IMGS = [
  "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=700&q=60",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=60"
] as const;
const STATUS_FALLBACKS = ["https://picsum.photos/seed/nala-drop/700/1200", "https://picsum.photos/seed/nala-promo/700/1200"] as const;

function StatusCard({ seg1, seg2, second }: { seg1: number; seg2: number; second: boolean }) {
  return (
    <div
      className="relative aspect-[9/16] h-full overflow-hidden"
      style={{ borderRadius: 28, background: "#202c33", boxShadow: "0 18px 60px rgba(0,0,0,0.5)" }}
    >
      {STATUS_IMGS.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? "New drop status" : "Promo week status"}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: second && i === 1 ? 1 : !second && i === 0 ? 1 : 0, transition: "opacity 0.4s ease" }}
          onError={(e) => {
            const t = e.currentTarget;
            if (!t.dataset.fb) {
              t.dataset.fb = "1";
              t.src = STATUS_FALLBACKS[i];
            }
          }}
        />
      ))}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)" }} />
      <div className="absolute inset-x-0 top-0 flex gap-[6px] px-3 pt-3">
        {[seg1, seg2].map((s, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.35)" }}>
            <div className="h-full rounded-full bg-white" style={{ width: `${s * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-6">
        <span className="rounded-full" style={{ padding: 2, background: "#00a884" }}>
          <img
            src={AMAKA_AVATAR}
            alt="Amaka"
            className="block h-9 w-9 rounded-full object-cover"
            style={{ background: "#202c33" }}
            onError={(e) => {
              const t = e.currentTarget;
              if (!t.dataset.fb) {
                t.dataset.fb = "1";
                t.src = AMAKA_AVATAR_FALLBACK;
              }
            }}
          />
        </span>
        <span className="flex flex-col">
          <span className="text-[14px] font-bold leading-[18px] text-white">Amaka</span>
          <span className="text-[12px] leading-[16px] text-white/70">Just now</span>
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-5">
        <p className="text-[30px] font-extrabold leading-[34px] text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.55)" }}>
          {second ? "Promo week" : "New drop"}
        </p>
        <p className="mt-1 text-[14px] leading-[18px] text-white/85">
          {second ? "10% off ends Sunday" : "Tecno Spark 20 at ₦155,000"}
        </p>
      </div>
    </div>
  );
}
