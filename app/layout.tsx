import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FitTracker - Your Personal Fitness Companion",
  description: "Track workouts, nutrition, and progress with FitTracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FitTracker",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <NextTopLoader
          color="#22C55E"
          height={3}
          showSpinner={false}
          speed={200}
          shadow="0 0 10px #22C55E,0 0 5px #22C55E"
        />
        <Script
          src={`${basePath}/js/native-tab-navigation.js`}
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
