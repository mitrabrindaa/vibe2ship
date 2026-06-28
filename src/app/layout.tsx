import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last-Minute Life Saver — AI Scheduling Assistant",
  description:
    "AI-powered CRM scheduling assistant. Sync your tasks and get a stress-free 48-hour focus schedule — powered by Gemini 2.5 Flash.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className="h-full overflow-hidden">{children}</body>
      </html>
    </ClerkProvider>
  );
}
