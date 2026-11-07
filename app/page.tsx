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
      </div>
    </main>
  );
}
