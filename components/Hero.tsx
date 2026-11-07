import { ArrowRight, Play } from "lucide-react";
import { ownerMessage } from "@/lib/demo/tasks";

export default function Hero() {
  return (
    <section id="top" className="mx-auto w-full max-w-[1240px] px-5 pt-[100px] md:px-10 lg:px-[72px]" style={{ minHeight: 680 }}>
      <div className="mx-auto max-w-[900px] text-center">
        <p className="eyebrow">Your business, with an extra employee</p>
        <h1 className="font-display mt-4 text-5xl font-bold leading-[1.05] md:text-[72px]">
          Meet the employee
          <br />
          <span style={{ color: "var(--accent)" }}>who gets things done.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[620px] text-base text-[var(--text-2)] md:text-lg">
          Give your business an AI employee. Delegate work, manage customers and keep operations moving through natural
          conversation.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#story"
            className="flex items-center gap-2 rounded-xl px-6 py-3 font-semibold"
            style={{ background: "var(--accent)", color: "#090A0C" }}
          >
            Meet your employee <ArrowRight size={18} />
          </a>
          <a
            href="#story"
            className="flex items-center gap-2 rounded-xl px-6 py-3 font-semibold"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <Play size={18} /> See how it works
          </a>
        </div>
        <p className="mt-6 text-sm text-[var(--text-3)]">Your instructions. Your business rules. Your control.</p>
      </div>
      <div className="mx-auto mt-10 max-w-[760px]">
        <div className="panel rounded-2xl p-5 text-left">
          <p className="text-xs uppercase tracking-widest text-[var(--text-3)]">Preview · Sample business data</p>
          <div className="mt-3 flex justify-end">
            <div
              className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm"
              style={{ background: "var(--accent)", color: "#090A0C" }}
            >
              {ownerMessage}
            </div>
          </div>
          <div className="mt-3 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-sm" style={{ background: "#22262e", color: "var(--text)" }}>
              I&apos;m here to help. I&apos;ll check the stock, prepare the promotion and put together the sales report.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
