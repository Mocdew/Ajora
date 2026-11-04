import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "Ajora · Save together",
    template: "%s · Ajora",
  },
  description:
    "Create an ajo savings circle, track contributions and manage payout turns together.",
  openGraph: {
    title: "Ajora · Save together",
    description:
      "Create an ajo savings circle, track contributions and manage payout turns together.",
    siteName: "Ajora",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Ajora · Save together",
    description:
      "Create an ajo savings circle, track contributions and manage payout turns together.",
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
