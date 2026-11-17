import Link from "next/link";

/** Branded 404 for unknown store slugs. */
export default function StoreNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#eef2f1] p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00a884] text-[26px] font-extrabold text-[#04241d]">
        S
      </span>
      <h1 className="mt-4 text-[20px] font-bold text-[#0b141a]">This store doesn&apos;t exist</h1>
      <p className="mt-1.5 max-w-[300px] text-[13.5px] leading-relaxed text-[#5b6b72]">
        The link may be old or mistyped. Ask the seller for their latest store link.
      </p>
      <Link
        href="/"
        className="mt-6 flex min-h-[48px] items-center rounded-xl px-6 text-[14px] font-bold text-[#04241d]"
        style={{ background: "#00a884" }}
      >
        Senap home
      </Link>
    </main>
  );
}
