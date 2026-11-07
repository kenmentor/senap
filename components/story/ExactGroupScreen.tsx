"use client";

import { useEffect, useRef, useState } from "react";

const W = 1080;
const H = 2340;

export default function ExactGroupScreen({ src }: { src: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (el) setScale(el.clientWidth / W);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden" style={{ background: "#000", borderRadius: 36, height: H * scale }}>
      <iframe
        title="WhatsApp 2026 — exact group screen"
        src={src}
        scrolling="no"
        style={{
          width: W,
          height: H,
          border: 0,
          display: "block",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none"
        }}
      />
    </div>
  );
}
