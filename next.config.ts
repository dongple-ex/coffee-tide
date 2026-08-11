import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js는 worker 모듈을 패키지 기준 상대 경로로 불러온다. 서버 번들에 넣으면
  // Turbopack 청크 경로를 기준으로 잘못 해석되므로 Node에서는 원본 패키지를 사용한다.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
