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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:2003"),
  title: "HarborOS — Maritime Intelligence Platform",
  description: "Live AIS, satellite fusion, and behavioral detection across nine contested waterways. Built for maritime operators.",
  twitter: {
    card: "summary_large_image",
    title: "HarborOS — Maritime intelligence, for every horizon.",
    description: "Live AIS, satellite fusion, and behavioral detection across nine contested waterways.",
  },
  openGraph: {
    type: "website",
    title: "HarborOS — Maritime intelligence, for every horizon.",
    description: "Live AIS, satellite fusion, and behavioral detection across nine contested waterways.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#080b14] text-slate-200 relative">
        <div aria-hidden className="ambient-glow" />
        {children}
      </body>
    </html>
  );
}
