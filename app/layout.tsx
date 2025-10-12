import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
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
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    interactiveWidget: "overlays-content",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        {children}
      </body>
    </html>
  );
}
