import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "NEXUS | Automation Hub",
    template: "%s · NEXUS Automation Hub",
  },
  description:
    "Cloud control plane for local Windows automation execution. Queue jobs from anywhere, execute securely on your registered runner PCs.",
  applicationName: "NEXUS Automation Hub",
};

export const viewport: Viewport = {
  themeColor: "#04060c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
