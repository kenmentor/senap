"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import ChatWallpaper from "@/components/story/ChatWallpaper";
import {
  firebaseConfigured,
  missingFirebaseKeys,
  beginGoogleSignIn,
  awaitRedirectResult,
  subscribeGoogleUser,
} from "@/lib/firebase-client";

function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.6 2.8c2.2-2 3.8-5 3.8-8.5z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-3.6 2.8C3.5 21.3 7.5 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4L1.6 6.9C.6 8.6 0 10.2 0 12s.6 3.4 1.6 4.9l3.6-2.5z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.6 6.9l3.6 2.8c1-2.9 3.7-5 6.8-5z"
      />
    </svg>
  );
}

function SigninForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [stage, setStage] = useState<"idle" | "redirecting" | "completing">("idle");
  const [error, setError] = useState<string | null>(null);
  const redirectTimer = useRef<number | null>(null);

  // Safety net: if Google neither opens nor returns within 12s, hand the
  // button back with a plain message instead of hanging on a spinner.
  useEffect(() => {
    if (stage !== "redirecting") return;
    redirectTimer.current = window.setTimeout(() => {
      setStage((s) => {
        if (s === "redirecting") {
          setError("Google didn't open — allow popups and try again, or use Chrome.");
        }
        return s === "redirecting" ? "idle" : s;
      });
    }, 12000);
    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
        redirectTimer.current = null;
      }
    };
  }, [stage]);

  useEffect(() => {
    setMissingKeys(missingFirebaseKeys());
    fetch("/api/auth/firebase")
      .then((r) => r.json())
      .then((d) => setServerReady(typeof d.configured === "boolean" ? d.configured : null))
      .catch(() => setServerReady(null));
    let done = false;
    const finish = async (idToken: string, to: string) => {
      if (done) return;
      done = true;
      setStage("completing");
      try {
        const res = await fetch("/api/auth/firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        router.push(to);
        router.refresh();
      } catch (e) {
        done = false;
        setStage("idle");
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    };
    // 1) Redirect errors surface here (account-exists, unauthorized domain…).
    awaitRedirectResult()
      .then((r) => {
        if (r) void finish(r.idToken, r.next);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Google sign-in failed — try again."));
    // 2) Observer catches the user even when the redirect handshake yields
    // null (localhost quirk, partitioned storage) — and forwards anyone
    // already signed in straight to the app.
    const unsub = subscribeGoogleUser((user) => {
      user
        .getIdToken()
        .then((t) => {
          let to = dest;
          try {
            const raw = window.sessionStorage.getItem("senap-next");
            if (raw && raw.startsWith("/") && !raw.startsWith("//")) to = raw;
          } catch {
            /* ignore */
          }
          void finish(t, to);
        })
        .catch(() => {
          /* token unreadable — stay on sign in */
        });
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async () => {
    if (!firebaseConfigured()) {
      setError("Google sign-in isn't set up yet.");
      return;
    }
    setError(null);
    setStage("redirecting");
    try {
      const started = await beginGoogleSignIn(dest);
      if ("idToken" in started) {
        // Popup path resolves right here — no redirect involved.
        setStage("completing");
        const res = await fetch("/api/auth/firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: started.idToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        router.push(started.next);
        router.refresh();
        return;
      }
      // Redirect path: the page navigates away. If we're still here the
      // redirect was blocked — say so instead of hanging.
      setStage("idle");
      setError("The Google window was blocked — allow popups/redirects and try again.");
    } catch (e) {
      setStage("idle");
      setError(e instanceof Error ? e.message : "Google sign-in failed — try again.");
    }
  };

  return (
    <div className="w-full max-w-[400px] rounded-3xl p-7 sm:p-8" style={{ background: "rgba(17,26,33,0.85)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(18px)" }}>
      <Link href="/" className="flex items-center gap-3" aria-label="Senap home">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[19px] font-extrabold"
          style={{ background: "#00a884", color: "#04241d" }}
          aria-hidden
        >
          S
        </span>
        <span className="font-display block text-[19px] font-bold leading-tight" style={{ color: "#e9edef" }}>Senap</span>
      </Link>

      <h1 className="font-display mt-6 text-[26px] font-bold" style={{ color: "#e9edef" }}>Sign in</h1>
      <p className="mt-1 text-[13.5px]" style={{ color: "#8a949b" }}>Continue with your Google account.</p>

      {missingKeys.length > 0 && (
        <p className="mt-3 rounded-xl p-3 text-[12px]" style={{ background: "rgba(232,180,91,0.08)", color: "#e8b45b", border: "1px solid rgba(232,180,91,0.3)" }}>
          Google sign-in is unavailable: missing {missingKeys.join(", ")}.
        </p>
      )}

      {missingKeys.length === 0 && serverReady === false && (
        <p className="mt-3 rounded-xl p-3 text-[12px]" style={{ background: "rgba(232,180,91,0.08)", color: "#e8b45b", border: "1px solid rgba(232,180,91,0.3)" }}>
          App keys are fine — the server still needs its service key. Local: paste it into .env.local and restart. Live site: add it in Render and redeploy.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl p-3 text-[13px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.35)" }}>
          {error}
        </p>
      )}

      <button
        onClick={go}
        disabled={stage !== "idle"}
        className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-70"
        style={{ background: "#ffffff", color: "#1f1f1f" }}
      >
        {stage === "idle" ? (
          <>
            <GoogleMark size={20} /> <span>Sign in with Google</span>
          </>
        ) : (
          <>
            <Loader2 size={18} className="animate-spin" /> {stage === "completing" ? "Signing you in…" : "Opening Google…"}
          </>
        )}
      </button>
      <p className="mt-4 text-center text-[11.5px] leading-relaxed" style={{ color: "#636c73" }}>
        New here? Signing in creates your workspace automatically.
      </p>
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
