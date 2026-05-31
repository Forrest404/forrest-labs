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

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.noursystems.org'

export const metadata: Metadata = {
  applicationName: 'NOUR',
  title: {
    default: 'NOUR — Network for Operational Updates & Response',
    template: '%s · NOUR',
  },
  description: 'NOUR — Network for Operational Updates & Response. Civilian safety reporting, verified and mapped in real time. No app required.',
  openGraph: {
    title: 'NOUR — Network for Operational Updates & Response',
    description: 'Civilian safety reporting, verified and mapped in real time.',
    url: appUrl,
    siteName: 'NOUR',
    type: 'website',
    images: [{ url: `${appUrl}/api/og`, width: 1200, height: 630, alt: 'NOUR — Network for Operational Updates & Response' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NOUR — Network for Operational Updates & Response',
    description: 'Civilian safety reporting, verified and mapped in real time.',
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
