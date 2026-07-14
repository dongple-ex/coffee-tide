import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "coffeeTide — 커피 한 잔 하면서 오늘을 정리하는 AI 비서",
  description:
    "연동이 없어도 manual/paste로 바로 시작할 수 있는, 연결되면 더 강력해지는 시간 관리 비서",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// 첫 페인트 전에 저장된 테마를 적용 (다크 플래시 방지)
const THEME_INIT = `try{var t=JSON.parse(localStorage.getItem("ct_theme"));if(t==="light"||t==="coffee"||t==="mega"||t==="kustom"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
