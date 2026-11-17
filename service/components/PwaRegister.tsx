"use client";

import { useEffect } from "react";

/** Registers the PWA service worker (production only — never cache dev). */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline-first is best-effort; the app works fine without it */
      });
    }
  }, []);
  return null;
}
