import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "Ajora · Your true cashflow",
    template: "%s · Ajora",
  },
  description:
    "A consent-first, multi-bank financial insights platform for Nigeria. One honest view across every bank and wallet.",
  openGraph: {
    title: "Ajora · Your true cashflow",
    description:
      "One honest view across every bank and wallet, with the phantom self-transfers removed.",
    siteName: "Ajora",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Ajora · Your true cashflow",
    description:
      "One honest view across every bank and wallet, with the phantom self-transfers removed.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F4" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Dark first: `.dark` ships in the HTML; the inline script swaps it before
    // first paint only when the viewer picked light (or system resolves light).
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
