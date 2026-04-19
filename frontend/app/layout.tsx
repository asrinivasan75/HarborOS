import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:2003";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003/api";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "HarborOS — Maritime Intelligence Platform",
  description:
    "Live AIS, satellite fusion, and behavioral detection across nine contested waterways. Built for maritime operators.",
  alternates: { canonical: "/" },
  twitter: {
    card: "summary_large_image",
    title: "HarborOS — Maritime intelligence, for every horizon.",
    description:
      "Live AIS, satellite fusion, and behavioral detection across nine contested waterways.",
  },
  openGraph: {
    type: "website",
    title: "HarborOS — Maritime intelligence, for every horizon.",
    description:
      "Live AIS, satellite fusion, and behavioral detection across nine contested waterways.",
  },
};

const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "HarborOS",
  description:
    "Maritime intelligence platform for contested littoral defense. Live AIS, satellite fusion, and behavioral detection across nine contested waterways.",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: SITE_URL,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Derive API origin for preconnect (strip /api suffix + path).
  let apiOrigin: string | null = null;
  try {
    apiOrigin = new URL(API_URL).origin;
  } catch {}

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <head>
        {apiOrigin && <link rel="preconnect" href={apiOrigin} crossOrigin="anonymous" />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_SCHEMA) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#080b14] text-slate-200 relative">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-2 focus:rounded-md focus:bg-[rgba(18,22,36,0.95)] focus:text-slate-100 focus:border focus:border-white/20 focus:backdrop-blur-xl focus:text-[13px] focus:font-semibold"
        >
          Skip to main content
        </a>
        <div aria-hidden className="ambient-glow" />
        {children}
      </body>
    </html>
  );
}
