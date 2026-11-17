import Link from "next/link";

/** Branded 404 for unknown store addresses. */
export default function StoreNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center" style={{ background: "#000000", color: "#e9edef" }}>
      <span className="flex h-16 w-16 items-center justify-center rounded-full text-[26px] font-extrabold" style={{ background: "#00a884", color: "#04241d" }}>
        S
      </span>
      <h1 className="mt-4 text-[20px] font-bold">This store doesn&apos;t exist</h1>
      <p className="mt-1.5 max-w-[300px] text-[13.5px] leading-relaxed" style={{ color: "#8a949b" }}>
        The link may be old or mistyped. Ask the seller for their latest store link.
      </p>
      <Link
        href="/"
        className="mt-6 flex min-h-[48px] items-center rounded-xl px-6 text-[14px] font-bold"
        style={{ background: "#00a884", color: "#04241d" }}
      >
        Senap home
      </Link>
    </main>
  );
}
