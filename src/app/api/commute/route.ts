// 출퇴근 카드 데이터 (K2 실연동).
//
// 하드코딩 예시 값을 전부 걷어내고, 실측 가능한 것만 돌려준다.
//  - 대중교통: 출발지 근처 정류소의 **실시간 버스 도착예정** (TAGO)
//  - 자차: 공공데이터포털로는 특정 경로의 소요시간을 알 수 없다 → 수치 없이 지도 앱에 위임
//
// 좌표는 받지 않는다. 클라이언트가 설정 시 찾아 둔 정류소 코드(nodeId/cityCode)만 넘긴다.

import { NextResponse } from "next/server";
import { fetchBusArrivals } from "@/lib/adapters/commute";
import { CommuteArrival, CommuteInfo } from "@/lib/types/commute";
import { getDataGoKrServiceKey } from "@/lib/env";

interface CacheEntry {
  timestamp: number;
  arrivals: CommuteArrival[];
}

// 실시간 도착정보는 금방 낡지만, 30초 폴링 × 일 1,000건 기본 쿼터라 캐시가 필수다.
const arrivalCache = new Map<string, CacheEntry>();
const ARRIVAL_TTL_MS = 45 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const homeStation = searchParams.get("home") || "집";
  const workStation = searchParams.get("work") || "회사";
  const transportType = searchParams.get("type") === "car" ? "car" : "public";
  const nodeId = searchParams.get("nodeId");
  const cityCode = searchParams.get("cityCode");
  const stopName = searchParams.get("stopName") ?? undefined;

  const now = new Date();
  const kst = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  const isMorning = kst.getHours() >= 5 && kst.getHours() < 12;

  const info: CommuteInfo = {
    mode: isMorning ? "morning" : "evening",
    transportType,
    origin: isMorning ? homeStation : workStation,
    destination: isMorning ? workStation : homeStation,
    stopName,
    arrivals: [],
  };

  if (transportType === "car") {
    info.notice =
      "자차 실시간 소요시간은 공공데이터포털에서 제공하지 않아요. 아래 지도 앱에서 확인해 주세요.";
    return NextResponse.json({ success: true, commute: info });
  }

  if (!getDataGoKrServiceKey()) {
    info.notice = "실시간 버스 도착정보를 보려면 DATA_GO_KR_SERVICE_KEY 설정이 필요해요.";
    return NextResponse.json({ success: true, commute: info });
  }

  if (!nodeId || !cityCode) {
    info.notice = "설정에서 집·회사 위치를 지정하면 가까운 정류소의 실시간 도착정보를 보여드려요.";
    return NextResponse.json({ success: true, commute: info });
  }

  const cacheKey = `${cityCode}:${nodeId}`;
  const cached = arrivalCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ARRIVAL_TTL_MS) {
    info.arrivals = cached.arrivals;
    if (info.arrivals.length === 0) info.notice = "지금은 도착 예정인 버스가 없어요.";
    return NextResponse.json({ success: true, commute: info, cached: true });
  }

  try {
    const arrivals = await fetchBusArrivals(cityCode, nodeId);
    arrivalCache.set(cacheKey, { timestamp: Date.now(), arrivals });
    info.arrivals = arrivals;
    if (arrivals.length === 0) info.notice = "지금은 도착 예정인 버스가 없어요.";
    return NextResponse.json({ success: true, commute: info, cached: false });
  } catch (err) {
    // 원칙 4(부분 실패 허용): 조회가 실패해도 카드와 길찾기 버튼은 살아 있어야 한다
    console.warn("[coffeeTide] 버스 도착정보 조회 실패:", err);
    info.notice = "실시간 도착정보를 불러오지 못했어요. 아래 지도 앱에서 확인해 주세요.";
    return NextResponse.json({ success: true, commute: info });
  }
}
