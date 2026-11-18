"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, MailOpen } from "lucide-react";
import ChatWallpaper from "@/components/story/ChatWallpaper";
import {
  firebaseConfigured,
  sendEmailLink,
  isEmailLinkCallback,
  completeEmailLink,
} from "@/lib/firebase-client";

const field = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e9edef"
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function SigninForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"form" | "sent" | "completing">("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"link" | "demo" | "exchange" | null>(null);

  // Incoming Firebase email-link callback: verify → mint session → go.
  useEffect(() => {
    if (!isEmailLinkCallback()) return;
    setStage("completing");
    (async () => {
      try {
        const idToken = await completeEmailLink();
        const res = await fetch("/api/auth/firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        router.push(dest);
        router.refresh();
      } catch (e) {
        setStage("form");
        setError(e instanceof Error ? e.message : "That link didn't work — request a fresh one.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (!firebaseConfigured()) {
      setError("Email sign-in isn't set up yet — try the demo account below.");
      return;
    }
    setBusy("link");
    setError(null);
    try {
      await sendEmailLink(clean);
      setEmail(clean);
      setStage("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const demo = async () => {
    setBusy("demo");
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      router.push(dest);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full max-w-[400px] rounded-3xl p-7 sm:p-8" style={{ background: "rgba(17,26,33,0.85)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(18px)" }}>
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-extrabold" style={{ background: "#00a884", color: "#04241d" }}>S</span>
        <span className="font-display text-[17px] font-bold" style={{ color: "#e9edef" }}>Senap</span>
      </Link>

      {stage === "completing" ? (
        <>
          <h1 className="font-display mt-6 text-[26px] font-bold" style={{ color: "#e9edef" }}>Signing you in…</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: "#8a949b" }}>Verifying your email link.</p>
        </>
      ) : stage === "sent" ? (
        <>
          <div className="mt-6 flex flex-col items-center rounded-2xl py-6" style={{ background: "rgba(0,168,132,0.07)", border: "1px solid rgba(0,168,132,0.3)" }}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(0,168,132,0.16)", color: "#00d19f" }}>
              <MailOpen size={26} strokeWidth={1.75} />
            </span>
            <p className="mt-3 text-[14px] font-semibold" style={{ color: "#e9edef" }}>Check your inbox</p>
            <p className="mt-1 break-all px-4 text-center text-[13px]" style={{ color: "#8a949b" }}>
              Tap the link we sent to <span style={{ color: "#e9edef" }}>{email}</span> — it signs you in instantly.
            </p>
          </div>

          {error && (
            <p className="mt-4 rounded-xl p-3 text-[13px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.35)" }}>
              {error}
            </p>
          )}

          <button
            onClick={() => send()}
            disabled={busy !== null}
            className="mt-4 min-h-[48px] w-full rounded-xl text-[13.5px] font-semibold transition active:bg-white/10 disabled:opacity-50"
            style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#e9edef" }}
          >
            {busy === "link" ? "Resending…" : "Resend link"}
          </button>
          <button
            onClick={() => { setStage("form"); setError(null); }}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 text-[13px] font-medium transition active:opacity-70"
            style={{ color: "#8a949b" }}
          >
            <ArrowLeft size={15} /> Use a different email
          </button>
        </>
      ) : (
        <>
          <h1 className="font-display mt-6 text-[26px] font-bold" style={{ color: "#e9edef" }}>Sign in</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: "#8a949b" }}>Enter your email — we&apos;ll send a one-tap sign-in link.</p>

          {error && (
            <p className="mt-4 rounded-xl p-3 text-[13px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.35)" }}>
              {error}
            </p>
          )}

          <form className="mt-5 grid gap-3" onSubmit={send}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@business.com"
              className="rounded-xl px-4 text-[16px] outline-none placeholder:text-[#4a545b]"
              style={{ ...field, height: 48 }}
            />
            <button disabled={busy !== null} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition active:scale-[0.99] disabled:opacity-50" style={{ background: "#00a884", color: "#04241d" }}>
              {busy === "link" ? "Sending link…" : (<>Send sign-in link <ArrowRight size={16} strokeWidth={2.5} /></>)}
            </button>
          </form>

          <button
            onClick={demo}
            disabled={busy !== null}
            className="mt-2.5 min-h-[48px] w-full rounded-xl text-[13.5px] font-semibold transition active:bg-white/10 disabled:opacity-50"
            style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#e9edef" }}
          >
            {busy === "demo" ? "Preparing demo…" : "Try the demo account"}
          </button>
          <p className="mt-3 text-center text-[11.5px] leading-relaxed" style={{ color: "#636c73" }}>
            New here? The link creates your account instantly — same email, same account, every time.
          </p>
        </>
      )}

      {stage === "form" && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11.5px]" style={{ color: "#636c73" }}>
          <Check size={13} strokeWidth={3} style={{ color: "#00a884" }} /> Verified by email — only you can enter your account.
        </p>
      )}
    </div>
  );
}

export default function SigninPage() {
  return (
    <main className="dark relative flex min-h-screen items-center justify-center p-4" style={{ background: "#000000", color: "#e9edef" }}>
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "#000000" }}>
        <ChatWallpaper opacity={0.38} image="/bg-chat-tile-dark.png" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.76)" }} />
      </div>
      <div className="relative z-10 flex w-full justify-center">
        <Suspense>
          <SigninForm />
        </Suspense>
      </div>
    </main>
  );
}
