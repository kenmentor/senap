"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ChatWallpaper from "@/components/story/ChatWallpaper";

const field = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#e9edef"
} as const;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dark relative flex min-h-screen items-center justify-center p-4" style={{ background: "#000000", color: "#e9edef" }}>
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "#000000" }}>
        <ChatWallpaper opacity={0.38} image="/bg-chat-tile-dark.png" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.76)" }} />
      </div>
      <div className="relative z-10 flex w-full justify-center">
        <div className="w-full max-w-[400px] rounded-3xl p-7 sm:p-8" style={{ background: "rgba(17,26,33,0.85)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(18px)" }}>
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-extrabold" style={{ background: "#00a884", color: "#04241d" }}>S</span>
            <span className="font-display text-[17px] font-bold" style={{ color: "#e9edef" }}>Senap</span>
          </Link>
          <h1 className="font-display mt-6 text-[26px] font-bold" style={{ color: "#e9edef" }}>Get your employee</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: "#8a949b" }}>Create an account, link WhatsApp, done.</p>

          {error && (
            <p className="mt-4 rounded-xl p-3 text-[13px]" style={{ background: "rgba(230,106,106,0.1)", color: "#e66a6a", border: "1px solid rgba(230,106,106,0.35)" }}>
              {error}
            </p>
          )}

          <form className="mt-5 grid gap-3" onSubmit={submit}>
            <input value={name} onChange={(e) => setName(e.target.value)} type="text" autoComplete="name" placeholder="Your name" className="rounded-xl px-4 text-[14px] outline-none placeholder:text-[#4a545b]" style={{ ...field, height: 46 }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="Email" className="rounded-xl px-4 text-[14px] outline-none placeholder:text-[#4a545b]" style={{ ...field, height: 46 }} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} autoComplete="new-password" placeholder="Password (6+ characters)" className="rounded-xl px-4 text-[14px] outline-none placeholder:text-[#4a545b]" style={{ ...field, height: 46 }} />
            <button disabled={busy} className="rounded-xl text-[14px] font-bold disabled:opacity-50" style={{ background: "#00a884", color: "#04241d", height: 46 }}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px]" style={{ color: "#8a949b" }}>
            Have an account? <Link href="/signin" className="font-semibold" style={{ color: "#00a884" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
