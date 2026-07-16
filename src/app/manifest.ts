// PWA 매니페스트 — 홈 화면 추가(iOS 푸시 전제 조건, 8-mobile_strategy M2)와 설치형 브랜드 표면.
// 아이콘은 src/app/icon.svg에서 래스터화한 PNG (scratchpad gen-icons 스크립트 산출물).

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "coffeeTide — 커피 한 잔 하면서 오늘을 정리하는 AI 업무 비서",
    short_name: "coffeeTide",
    description:
      "연동이 없어도 직접 입력과 붙여넣기로 바로 시작하고, 연결되면 더 강력해지는 AI 업무 비서",
    start_url: "/",
    display: "standalone",
    // 기본 다크 테마(globals.css :root)와 일치 — 첫 페인트 플래시 방지
    background_color: "#0a0e17",
    theme_color: "#0a0e17",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
