import { NextResponse } from "next/server";
import { CommuteInfo } from "@/lib/types/commute";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const homeStation = searchParams.get("home") || "서울역";
  const workStation = searchParams.get("work") || "수원역";

  const now = new Date();
  // KST 시간 계산 (UTC+9)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const hours = kst.getHours();
  const minutes = kst.getMinutes();

  const isMorning = hours >= 5 && hours < 12;
  const mode = isMorning ? "morning" : "evening";
  const origin = isMorning ? homeStation : workStation;
  const destination = isMorning ? workStation : homeStation;

  // 다음 열차 시각 모의 계산 (약 5~10분 후 출발)
  const nextMin = (minutes + 7) % 60;
  const nextHour = (hours + Math.floor((minutes + 7) / 60)) % 24;
  const formattedNextTime = `${String(nextHour).padStart(2, "0")}:${String(nextMin).padStart(2, "0")}`;

  // 대략적인 소요시간 및 노선 정보 생성 (기본 1호선/지하철 라인 기준 예시)
  const durationMinutes = 48;
  const lineInfo = "1호선 급행 / 무궁화호 추천";
  const statusText = isMorning
    ? `다음 ${destination}행 급행 열차가 약 7분 후 (${formattedNextTime}) 출발합니다.`
    : `퇴근길 ${destination}행 열차가 약 7분 후 (${formattedNextTime}) 출발합니다.`;

  const kakaoMapUrl = `https://map.kakao.com/?sName=${encodeURIComponent(origin)}&eName=${encodeURIComponent(destination)}`;
  const naverMapUrl = `https://m.map.naver.com/route/publicTransit.naver?sname=${encodeURIComponent(origin)}&ename=${encodeURIComponent(destination)}`;

  const commuteInfo: CommuteInfo = {
    mode,
    origin,
    destination,
    durationMinutes,
    nextDepartureTime: formattedNextTime,
    lineInfo,
    statusText,
    kakaoMapUrl,
    naverMapUrl,
  };

  return NextResponse.json({ success: true, commute: commuteInfo });
}
