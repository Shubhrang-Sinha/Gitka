import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gitka",
  description: "Pull request reviews, team chat, and codebase Q&A for Forgejo projects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
            <Link href="/" className="text-lg font-bold tracking-tight">Gitka</Link>
            <Link href="/projects" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">
              Projects
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
