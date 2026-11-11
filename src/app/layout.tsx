import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// 게임 제목용 글꼴: 손글씨 Nothing You Could Do (SIL OFL, 저장소에 포함 — 인터넷 없이도 같은 모양)
const logoFont = localFont({
  src: "./fonts/NothingYouCouldDo-Regular.ttf",
  variable: "--font-logo",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Together",
  description: "웹 3D 격투 게임 프로토타입",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Together", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d17",
  // 폰에서 두 손가락 확대로 화면이 흔들리지 않게 (게임 버튼 연타 중 확대 방지)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${logoFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
