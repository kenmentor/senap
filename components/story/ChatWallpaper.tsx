"use client";

export default function ChatWallpaper({
  opacity = 0.35,
  image
}: {
  opacity?: number;
  cell?: number;
  icon?: number;
  count?: number;
  image?: string;
}) {
  if (!image) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity,
        backgroundImage: `url(/wa-bg.png), url(${image})`,
        backgroundSize: "cover, auto",
        backgroundRepeat: "no-repeat, repeat",
        backgroundPosition: "center, top left"
      }}
    />
  );
}
