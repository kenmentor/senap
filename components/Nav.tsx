"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#pricing", label: "Pricing" }
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-200"
      style={{
        height: 76,
        background: scrolled ? "rgba(9,10,12,0.92)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        backdropFilter: scrolled ? "blur(8px)" : "none"
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[1240px] items-center justify-between px-5 md:px-10 lg:px-[72px]">
        <a href="#top" className="flex items-center gap-2" aria-label="Senap home">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
            style={{ background: "var(--accent)", color: "#090A0C" }}
          >
            S
          </span>
          <span className="font-display text-lg font-semibold">Senap</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-[var(--text-2)] hover:text-[var(--text)]">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-4 md:flex">
          <a href="#cta" className="text-sm text-[var(--text-2)] hover:text-[var(--text)]">
            Sign in
          </a>
          <a
            href="#cta"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-transform duration-160 hover:scale-[1.02]"
            style={{ background: "var(--accent)", color: "#090A0C" }}
          >
            Hire an employee
          </a>
        </div>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg md:hidden"
          style={{ border: "1px solid var(--border)" }}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div
          className="mx-5 rounded-xl p-4 md:hidden"
          style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-base text-[var(--text)]"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#cta"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-lg px-3 py-3 text-center font-semibold"
            style={{ background: "var(--accent)", color: "#090A0C" }}
          >
            Hire an employee
          </a>
        </div>
      )}
    </header>
  );
}
