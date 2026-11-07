import ChatWallpaper from "@/components/story/ChatWallpaper";
import ScrollStory from "@/components/story/ScrollStory";
import NextSection from "@/components/story/NextSection";
import IntroSections from "@/components/story/IntroSections";
import { MessageCircle } from "lucide-react";

export default function Page() {
  return (
    <main className="dark relative min-h-screen" style={{ background: "#000000" }}>
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "#000000" }}>
        <ChatWallpaper opacity={0.38} image="/bg-chat-tile-dark.png" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.76)" }} />
      </div>
      <div className="relative z-10">
        <header className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center justify-between px-5 md:px-10">
          <span className="font-display text-lg font-semibold" style={{ color: "var(--text)" }}>
            Senap
          </span>
          <div className="flex items-center gap-5">
            <span className="hidden text-sm sm:inline" style={{ color: "var(--text-2)" }}>
              Assistant
            </span>
            <a
              href="#story"
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#04241d" }}
            >
              <MessageCircle size={17} strokeWidth={2} />
              Get employee
            </a>
          </div>
        </header>
        <IntroSections />
        <ScrollStory />
        <NextSection />
        <section className="flex min-h-[100svh] w-full flex-col items-center justify-center px-6 py-24 text-center">
          <p className="text-sm font-bold uppercase" style={{ letterSpacing: "0.24em", color: "#00a884" }}>
            Ready when you are
          </p>
          <p className="font-display mt-4 max-w-[900px] text-5xl font-extrabold md:text-7xl" style={{ color: "#e9edef" }}>
            Hire an assistant.
          </p>
          <p className="mt-4 max-w-[560px] text-lg" style={{ color: "var(--text-2)" }}>
            Give Amaka the job in words. She starts immediately.
          </p>
          <a
            href="#story"
            className="mt-10 inline-flex items-center gap-3 rounded-full px-14 py-7 text-2xl font-extrabold md:px-20 md:py-8 md:text-3xl"
            style={{ background: "#00a884", color: "#04241d" }}
          >
            <MessageCircle size={30} strokeWidth={2.5} />
            Get your employee
          </a>
        </section>
      </div>
    </main>
  );
}
