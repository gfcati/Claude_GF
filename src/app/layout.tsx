import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
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
  title: "Mise",
  description:
    "Organize receitas e siga o modo de execução com cronograma e alertas de tempo.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Mise",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f5443",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ServiceWorkerRegistration />
        <header className="border-b border-border px-6 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 font-serif text-lg font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5.5 9.5V20h13V9.5" />
            </svg>
            Mise
          </Link>
        </header>
        {children}
        <footer className="px-6 py-3 text-center font-mono text-xs text-foreground/40">
          build {process.env.NEXT_PUBLIC_BUILD_SHA}
        </footer>
      </body>
    </html>
  );
}
