"use client";

/**
 * Full-bleed hero banner: real store product photos, 100% viewport width,
 * no side padding. Two counter-scrolling rows under a dark gradient with a
 * single restrained overlay line.
 */

const ROW_A = [
  "/products/jiji-01.jpg",
  "/products/jiji-02.jpg",
  "/products/jiji-03.jpg",
  "/products/jiji-04.jpg",
  "/products/jiji-05.jpg",
  "/products/jiji-06.jpg",
];

const ROW_B = [
  "/products/jiji-07.jpg",
  "/products/jiji-08.jpg",
  "/products/jiji-09.jpg",
  "/products/jiji-10.jpg",
  "/products/jiji-11.jpg",
  "/products/jiji-12.jpg",
];

function Strip({ images, reverse, duration }: { images: string[]; reverse?: boolean; duration: string }) {
  const doubled = [...images, ...images];
  return (
    <div className="flex w-max gap-3 pr-3" style={{ animation: `senap-marquee ${duration} linear infinite${reverse ? " reverse" : ""}` }}>
      {doubled.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          draggable={false}
          loading={i < 6 ? "eager" : "lazy"}
          className="h-36 w-36 shrink-0 rounded-2xl object-cover sm:h-44 sm:w-44"
        />
      ))}
    </div>
  );
}

export default function HeroBanner() {
  return (
    <section className="relative w-full overflow-hidden" aria-label="Real products sold through Senap shops">
      <style>{`@keyframes senap-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      <div className="flex flex-col gap-3 py-6" style={{ background: "rgba(0,0,0,0.35)" }}>
        <div className="overflow-hidden">
          <Strip images={ROW_A} duration="38s" />
        </div>
        <div className="overflow-hidden">
          <Strip images={ROW_B} reverse duration="46s" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.8) 100%)" }} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-5">
        <p className="rounded-full px-4 py-1.5 text-[11px] font-bold uppercase" style={{ background: "rgba(0,0,0,0.6)", color: "#00d19f", border: "1px solid rgba(0,168,132,0.45)", letterSpacing: "0.14em", backdropFilter: "blur(8px)" }}>
          Live from real Senap shops
        </p>
      </div>
    </section>
  );
}
