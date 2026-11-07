import type { Metadata } from "next";
import "./globals.css";
import "react-mockframe/styles/mockframe-iphones.css";
import "react-mockframe/styles/mockframe-android.css";

export const metadata: Metadata = {
  title: "Senap — Meet the employee who gets things done",
  description:
    "Give your business an AI employee. Delegate work, manage customers and keep operations moving through natural conversation."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
