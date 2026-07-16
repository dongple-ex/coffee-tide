import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 정본 한 줄 정의(doc/00-current-state.md §1)와 동일 문구 — landing 히어로·README와 함께 유지
  title: "coffeeTide — 커피 한 잔 하면서 오늘을 정리하는 AI 업무 비서",
  description:
    "연동이 없어도 직접 입력과 붙여넣기로 바로 시작하고, 연결되면 더 강력해지는 AI 업무 비서",
  appleWebApp: {
    capable: true,
    title: "coffeeTide",
    statusBarStyle: "black-translucent",
  },
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
