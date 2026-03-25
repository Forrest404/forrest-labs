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

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://forrest-labsorg.vercel.app'

export const metadata: Metadata = {
  title: 'Forrest Labs — Civilian Safety Reporting',
  description: 'Real-time civilian incident reporting for conflict zones. Report what you see or hear. AI verifies. Aid responds. No app required.',
  openGraph: {
    title: 'Forrest Labs — Civilian Safety Reporting',
    description: 'Real-time civilian incident reporting for conflict zones.',
    url: appUrl,
    siteName: 'Forrest Labs',
    type: 'website',
    images: [{ url: `${appUrl}/api/og`, width: 1200, height: 630, alt: 'Forrest Labs — Civilian Safety Reporting' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forrest Labs',
    description: 'Real-time civilian incident reporting for conflict zones.',
    images: [`${appUrl}/api/og`],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
