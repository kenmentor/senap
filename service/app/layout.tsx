import type { Metadata, Viewport } from "next";
import "./globals.css";
import "react-mockframe/styles/mockframe-iphones.css";
import "react-mockframe/styles/mockframe-android.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Senap: Meet the employee who gets things done",
  description:
    "Give your business an AI employee. Delegate work, manage customers and keep operations moving through natural conversation.",
  applicationName: "Senap",
  appleWebApp: {
    capable: true,
    title: "Senap",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-180.png",
  },
};

// edge-to-edge on notched phones; dashboard chrome handles the insets
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
