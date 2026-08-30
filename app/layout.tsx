import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { PWARegister } from "./_components/PWARegister";
import { InstallPrompt } from "./_components/InstallPrompt";
import { NavigationFeedback } from "./_components/NavigationFeedback";
import { Suspense } from "react";

const TITLE = "Football Insight — zápasy, analýzy a fotbalové statistiky";
const DESCRIPTION =
  "Fotbalový program, výsledky, živé skóre a srozumitelné analýzy klubů i reprezentací na jednom místě.";

export const metadata: Metadata = {
  // Základ pro absolutní URL OG/twitter obrázků (prod doména, fallback z AUTH_URL).
  metadataBase: new URL(
    process.env.AUTH_URL ?? "https://vs-predict-app.vercel.app"
  ),
  title: {
    default: TITLE,
    template: "%s | Football Insight",
  },
  description: DESCRIPTION,
  applicationName: "Football Insight",
  category: "sports",
  keywords: [
    "fotbalové zápasy",
    "fotbalové statistiky",
    "výsledky fotbalu",
    "porovnání týmů",
    "fotbalové analýzy",
  ],
  // iOS: chování instalované PWA (fullscreen, název na ploše, status bar).
  appleWebApp: {
    capable: true,
    title: "Football Insight",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Náhled při sdílení odkazu (Messenger, Discord, X…). Statický – dynamický
  // titulek „Tým A vs Tým B" by vyžadoval serverový lookup názvů (backlog).
  openGraph: {
    type: "website",
    siteName: "Football Insight",
    title: TITLE,
    description: DESCRIPTION,
    locale: "cs_CZ",
    url: "/",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Football Insight" }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f7f4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <PWARegister />
        <Suspense fallback={null}><NavigationFeedback /></Suspense>
        <InstallPrompt />
        <Analytics />
      </body>
    </html>
  );
}
