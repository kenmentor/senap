"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "motion/react";
import { ChatBubble } from "@/components/ui/whatsapp/chat-bubble";
import { ChatHeader } from "@/components/ui/whatsapp/chat-header";
import { TypingIndicator } from "@/components/ui/whatsapp/typing-indicator";
import type { MessageStatus } from "@/components/ui/whatsapp/message-status";

const M1 = "Amaka, we have five of these bags left at ₦4,000 each. Prepare a promotion, check our sales and create a report for Mr Chi.";
const M2 = "I'm here to help. I'll check the stock, prepare the promotion and put together the sales report. I'll ask you before publishing or sharing anything.";
const M3 = "Can you complete the whole task now?";
const M4 = "Yes. I'll handle the steps I can complete and bring anything that needs your approval to you.";

// Outgoing send blip (synth, best effort — browsers need a tap first).
let audioCtx: AudioContext | null = null;
function pop() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

// Incoming notification tone (whatsapp-notification-sound, ISC).
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
          end: "+=250%",
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

  // --- script (fully reversible; content starts after the frame entrance 0→0.12) ---
  const c = p === null ? null : Math.min(1, Math.max(0, (p - 0.12) / 0.88));
  const m1 = c === null || c > 0;
  const m1Status: MessageStatus = c === null || c >= 0.14 ? "read" : c >= 0.09 ? "delivered" : "sent";
  const typing1 = c !== null && c >= 0.17 && c < 0.3;
  const m2 = c !== null && c >= 0.3;
  const m3 = c !== null && c >= 0.5;
  const m3Status: MessageStatus = c === null || c >= 0.6 ? "read" : c !== null && c >= 0.55 ? "delivered" : "sent";
  const typing2 = c !== null && c >= 0.63 && c < 0.76;
  const m4 = c !== null && c >= 0.76;

  useEffect(() => {
    if (m1 && !sounded.current.has("m1")) { sounded.current.add("m1"); pop(); }
    if (m2 && !sounded.current.has("m2")) { sounded.current.add("m2"); notify(); }
    if (m3 && !sounded.current.has("m3")) { sounded.current.add("m3"); pop(); }
    if (m4 && !sounded.current.has("m4")) { sounded.current.add("m4"); notify(); }
  }, [m1, m2, m3, m4]);

  return (
    <section id="story" ref={wrapRef} style={{ height: "350svh" }}>
      <div ref={stageRef} className="flex h-[100svh] w-full flex-col" style={{ position: "relative", zIndex: 20 }}>
        <ChatHeader name="Nala Bags" status="Amaka · AI employee" isOnline />
        <motion.div
          className="mx-auto flex w-full max-w-[800px] flex-1 flex-col justify-center px-4 md:px-6"
          initial={false}
          animate={(() => {
            const t = p === null ? 1 : Math.min(p / 0.12, 1);
            return {
              opacity: t,
              y: `${(1 - t) * 70}svh`,
              scale: 0.92 + 0.08 * t
            };
          })()}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{ transformOrigin: "bottom center" }}
        >
          <div className="flex min-h-[30svh] flex-col justify-center py-3">
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
          </motion.div>
          <div className="mx-auto mb-4 h-1 w-full max-w-[480px] overflow-hidden rounded-full px-6" style={{ background: "rgba(134,150,160,0.2)" }}>
            <div className="h-full rounded-full" style={{ width: `${(p ?? 0) * 100}%`, background: "var(--accent)" }} />
          </div>
        </div>
    </section>
  );
}

function Fade({ show, last, children }: { show: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      aria-hidden={!show}
      className="overflow-hidden [&_div]:!text-[17px] md:[&_div]:!text-[19px] [&_div]:!leading-[26px]"
      initial={false}
      animate={{
        opacity: show ? 1 : 0,
        y: show ? 0 : 72,
        scale: show ? 1 : 0.9,
        height: show ? "auto" : 0,
        marginBottom: show && !last ? 20 : 0
      }}
      whileTap={show ? { scale: 1.04, y: -8 } : undefined}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: show ? "auto" : "none", transformOrigin: "bottom center" }}
    >
      {children}
    </motion.div>
  );
}
