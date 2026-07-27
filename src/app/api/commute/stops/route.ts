// 좌표 → 근접 정류소 조회 (설정에서 "현재 위치를 집/회사로" 누를 때 1회 호출).
//
// 이후 출퇴근 카드 폴링에는 여기서 얻은 정류소 코드만 오간다 — 집·회사 좌표를
// 30초마다 서버로 보내지 않기 위한 구조다. 좌표는 저장하지 않는다.

import { NextResponse } from "next/server";
import { fetchNearbyStops } from "@/lib/adapters/commute";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { getDataGoKrServiceKey } from "@/lib/env";

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json({ success: false, reason: "Invalid lat/lng" }, { status: 400 });
  }

  if (!getDataGoKrServiceKey()) {
    return NextResponse.json({
      success: false,
      reason: "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다",
    });
  }

  try {
    const stops = await fetchNearbyStops(lat, lng);
    return NextResponse.json({ success: true, stops });
  } catch (err) {
    console.warn("[coffeeTide] 근접 정류소 조회 실패:", err);
    return NextResponse.json({
      success: false,
      reason: err instanceof Error ? err.message : "근접 정류소를 찾지 못했습니다",
    });
  }
}
