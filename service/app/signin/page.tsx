"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ChatWallpaper from "@/components/story/ChatWallpaper";

const field = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e9edef"
} as const;

function SigninForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signin" | "demo" | null>(null);

  const go = async (url: string, body?: unknown, kind: "signin" | "demo" = "signin") => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" });
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
      <h1 className="font-display mt-6 text-[26px] font-bold" style={{ color: "#e9edef" }}>Welcome back</h1>
      <p className="mt-1 text-[13.5px]" style={{ color: "#8a949b" }}>Sign in to manage your employee.</p>

      {error && (
        <p className="mt-4 rounded-xl p-3 text-[13px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.35)" }}>
          {error}
        </p>
      )}

      <form
        className="mt-5 grid gap-3"
        onSubmit={(e) => { e.preventDefault(); go("/api/auth/signin", { email, password }); }}
      >
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="Email" className="rounded-xl px-4 text-[14px] outline-none placeholder:text-[#4a545b]" style={{ ...field, height: 46 }} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" placeholder="Password" className="rounded-xl px-4 text-[14px] outline-none placeholder:text-[#4a545b]" style={{ ...field, height: 46 }} />
        <button disabled={busy !== null} className="rounded-xl text-[14px] font-bold disabled:opacity-50" style={{ background: "#00a884", color: "#04241d", height: 46 }}>
          {busy === "signin" ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button
        onClick={() => go("/api/auth/demo", undefined, "demo")}
        disabled={busy !== null}
        className="mt-2.5 w-full rounded-xl text-[13.5px] font-semibold transition hover:bg-white/10 disabled:opacity-50"
        style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#e9edef", height: 46 }}
      >
        {busy === "demo" ? "Preparing demo…" : "Try the demo account"}
      </button>

      <p className="mt-5 text-center text-[13px]" style={{ color: "#8a949b" }}>
        New here? <Link href="/signup" className="font-semibold" style={{ color: "#00a884" }}>Create an account</Link>
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
