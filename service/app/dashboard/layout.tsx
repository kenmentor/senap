import ChatWallpaper from "@/components/story/ChatWallpaper";
import Sidebar from "@/components/dashboard/Sidebar";
import MobileChrome from "@/components/dashboard/MobileChrome";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="dark relative min-h-screen" style={{ background: "#000000", color: "#e9edef" }}>
      {/* Same dark ground + art as landing */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "#000000" }}>
        <ChatWallpaper opacity={0.38} image="/bg-chat-tile-dark.png" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.76)" }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile gets the native top bar from MobileChrome; desktop keeps the spacer */}
          <MobileChrome />
          <header className="sticky top-0 z-20 hidden border-b md:block" style={{ borderColor: "rgba(134,150,160,0.15)", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)" }}>
            <div className="h-16 w-full px-5" />
          </header>
          <div className="min-w-0 flex-1 px-4 pb-32 pt-4 sm:px-5 md:px-8 md:pb-8 md:pt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
