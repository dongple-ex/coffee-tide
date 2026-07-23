import { NextResponse } from "next/server";
import { CommuteInfo, CommuteRouteOption } from "@/lib/types/commute";

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

  // 출발 7분 후
  const depTime = new Date(kst.getTime() + 7 * 60000);
  const formattedNextTime = `${String(depTime.getHours()).padStart(2, "0")}:${String(
    depTime.getMinutes()
  ).padStart(2, "0")}`;

  // 다다음 20분 후
  const subDepTime = new Date(kst.getTime() + 20 * 60000);
  const formattedSubTime = `${String(subDepTime.getHours()).padStart(2, "0")}:${String(
    subDepTime.getMinutes()
  ).padStart(2, "0")} (13분 후)`;

  const isCar = transportType === "car";
  const durationMinutes = isCar ? 38 : 48;

  // 예상 도착 시각 (출발 7분후 + 소요시간)
  const arrTime = new Date(depTime.getTime() + durationMinutes * 60000);
  const expectedArrivalTime = `${String(arrTime.getHours()).padStart(2, "0")}:${String(
    arrTime.getMinutes()
  ).padStart(2, "0")}`;

  const lineInfo = isCar
    ? "경부고속도로 / 용인서울고속도로 추천"
    : "1호선 급행 / 무궁화호·ITX 추천";

  const statusText = isCar
    ? isMorning
      ? `현재 주요 구간 원활 🚗 ${destination} 방면 약 38분 소요 예정`
      : `퇴근 서행 구간 일부 있음 🚗 ${destination} 방면 약 42분 소요 예정`
    : isMorning
    ? `출근길 ${destination}행 급행 열차가 약 7분 후 (${formattedNextTime}) 도착합니다.`
    : `퇴근길 ${destination}행 열차가 약 7분 후 (${formattedNextTime}) 출발합니다.`;

  const congestionText = isCar
    ? isMorning
      ? "🟢 원활 (평균 속도 72km/h)"
      : "🟡 서행 (양재~판교 25km/h 정체)"
    : isMorning
    ? "🔴 혼잡 (좌석 만석, 입석 여유)"
    : "🟡 보통 (좌석 일부 여유)";

  const fareInfo = isCar ? "통행료 약 2,100원 (유류비 ~3,400원)" : "1,850원 (교통카드 기준)";

  const routeOptions: CommuteRouteOption[] = isCar
    ? [
        { name: "경부고속도로 경로", duration: 38, type: "고속도로", badgeText: "추천 ⚡", fare: "통행료 2,100원" },
        { name: "용인서울고속도로 경로", duration: 42, type: "고속도로", badgeText: "우회 경로", fare: "통행료 2,800원" },
        { name: "국도 우회 (1번 국도)", duration: 53, type: "일반도로", badgeText: "무료 도로", fare: "통행료 0원" },
      ]
    : [
        { name: "1호선 급행", duration: 48, type: "전철", badgeText: "추천 ⭐", fare: "1,850원" },
        { name: "무궁화 / ITX-마음", duration: 34, type: "기차", badgeText: "최속 ⚡", fare: "3,400원" },
        { name: "광역버스 3000번대", duration: 52, type: "직행버스", badgeText: "좌석보장 👺", fare: "2,800원" },
      ];

  const smartTip = isCar
    ? "💡 **바리스타 꿀팁**: 한남대교 하류 구간을 피하려면 용인서울고속도로 서판교 IC 방면 진입을 추천해 드려요."
    : isMorning
    ? `💡 **바리스타 꿀팁**: ${origin} 기준 **1호선 4-2번 칸**에 탑승하시면 ${destination} 하차 후 환승 계단이 바로 앞입니다!`
    : `💡 **바리스타 꿀팁**: 퇴근시간대 19:52 출발 열차는 **3-1번 칸**이 가장 쾌적하며, 무궁화호 승차권 앱(코레일톡) 예매 시 편안하게 앉아 가실 수 있어요.`;

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
    expectedArrivalTime,
    nextSubsequentDepartureTime: formattedSubTime,
    congestionText,
    fareInfo,
    lineInfo,
    statusText,
    smartTip,
    routeOptions,
    kakaoMapUrl,
    naverMapUrl,
    kakaoAppScheme,
    naverAppScheme,
  };

  return NextResponse.json({ success: true, commute: commuteInfo });
}
