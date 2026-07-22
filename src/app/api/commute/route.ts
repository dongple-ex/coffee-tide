import { NextResponse } from "next/server";
import { CommuteInfo } from "@/lib/types/commute";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const homeStation = searchParams.get("home") || "서울역";
  const workStation = searchParams.get("work") || "수원역";
  const transportType = (searchParams.get("type") as "public" | "car") || "public";

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const hours = kst.getHours();
  const minutes = kst.getMinutes();

  const isMorning = hours >= 5 && hours < 12;
  const mode = isMorning ? "morning" : "evening";
  const origin = isMorning ? homeStation : workStation;
  const destination = isMorning ? workStation : homeStation;

  const nextMin = (minutes + 7) % 60;
  const nextHour = (hours + Math.floor((minutes + 7) / 60)) % 24;
  const formattedNextTime = `${String(nextHour).padStart(2, "0")}:${String(nextMin).padStart(2, "0")}`;

  const isCar = transportType === "car";
  const durationMinutes = isCar ? 38 : 48;
  const lineInfo = isCar ? "경부고속도로 / 용인서울고속도로 추천" : "1호선 급행 / 무궁화호 추천";
  const statusText = isCar
    ? isMorning
      ? `현재 원활 🚗 ${destination} 방면 자차 이용 시 약 38분 소요됩니다.`
      : `퇴근길 🚗 ${destination} 방면 서행 구간 있음 (약 42분 소요 예상).`
    : isMorning
    ? `다음 ${destination}행 급행 열차가 약 7분 후 (${formattedNextTime}) 출발합니다.`
    : `퇴근길 ${destination}행 열차가 약 7분 후 (${formattedNextTime}) 출발합니다.`;

  const kakaoMapUrl = `https://map.kakao.com/?sName=${encodeURIComponent(origin)}&eName=${encodeURIComponent(destination)}`;
  const naverMapUrl = isCar
    ? `https://m.map.naver.com/route/carset.naver?sname=${encodeURIComponent(origin)}&ename=${encodeURIComponent(destination)}`
    : `https://m.map.naver.com/route/publicTransit.naver?sname=${encodeURIComponent(origin)}&ename=${encodeURIComponent(destination)}`;

  const kakaoAppScheme = isCar
    ? `kakaomap://route?sp=${encodeURIComponent(origin)}&ep=${encodeURIComponent(destination)}&by=CAR`
    : `kakaomap://route?sp=${encodeURIComponent(origin)}&ep=${encodeURIComponent(destination)}&by=PUBLICTRANSIT`;

  const naverAppScheme = isCar
    ? `nmap://route/carset?sname=${encodeURIComponent(origin)}&dname=${encodeURIComponent(destination)}&appname=coffeetide`
    : `nmap://route/public?sname=${encodeURIComponent(origin)}&dname=${encodeURIComponent(destination)}&appname=coffeetide`;

  const commuteInfo: CommuteInfo = {
    mode,
    transportType,
    origin,
    destination,
    durationMinutes,
    nextDepartureTime: formattedNextTime,
    lineInfo,
    statusText,
    kakaoMapUrl,
    naverMapUrl,
    kakaoAppScheme,
    naverAppScheme,
  };

  return NextResponse.json({ success: true, commute: commuteInfo });
}
