import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 대시보드가 단일 대형 클라이언트 컴포넌트(useState 97개)라 수동 메모이제이션 대신
  // React Compiler의 자동 메모이제이션으로 리렌더링 비용을 줄인다.
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  // PDF.js는 worker 모듈을 패키지 기준 상대 경로로 불러온다. 서버 번들에 넣으면
  // Turbopack 청크 경로를 기준으로 잘못 해석되므로 Node에서는 원본 패키지를 사용한다.
  serverExternalPackages: ["pdfjs-dist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
};

export default nextConfig;
