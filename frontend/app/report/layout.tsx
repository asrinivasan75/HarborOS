import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Incident Report — HarborOS",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
