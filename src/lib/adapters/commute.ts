// 출퇴근 실시간 정보 — 국토교통부 TAGO (공공데이터포털) 어댑터.
//
//  - 좌표기반 근접 정류소: BusSttnInfoInqireService/getCrdntPrxmtSttnList
//  - 정류소별 도착예정:    ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList
//
// 인증키는 포털 공용 키(getDataGoKrServiceKey)를 쓴다. 활용신청은 서비스별로 필요하다.
//
// 설계 메모:
//  - 좌표는 **설정 시 1회** 근접 정류소를 찾을 때만 쓰고, 이후 폴링에는 정류소 코드만 오간다.
//    집·회사 좌표를 30초마다 서버로 보내지 않기 위한 구조다.
//  - 포털 응답은 items가 배열/단일 객체/빈 문자열 셋 다 나올 수 있어 normalizeItems로 흡수한다.
//  - 지하철 시간표는 상·하행 방향을 출발지-목적지만으로 판별할 수 없어 1차 범위에서 제외한다.

import { getDataGoKrServiceKey } from "@/lib/env";

const TAGO_BASE = "https://apis.data.go.kr/1613000";

export interface NearbyStop {
  nodeId: string;
  cityCode: string;
  name: string;
  /** 조회 좌표 기준 직선 거리(m) — 포털이 gpslati/gpslong을 주면 계산한다 */
  distanceM?: number;
}

export interface BusArrival {
  routeNo: string;
  /** 간선/지선/광역 등 */
  routeType?: string;
  /** 도착까지 남은 초 */
  arrivalSeconds: number;
  /** 남은 정류장 수 */
  stopsAway?: number;
}

/** 공공데이터포털 공통 응답 봉투에서 item 목록을 꺼낸다 */
function normalizeItems(json: unknown): Record<string, unknown>[] {
  const body = (json as { response?: { body?: { items?: unknown } } })?.response?.body;
  const items = body?.items;
  if (!items || typeof items === "string") return []; // 결과 없음이면 빈 문자열로 온다
  const item = (items as { item?: unknown }).item;
  if (!item) return [];
  return Array.isArray(item) ? (item as Record<string, unknown>[]) : [item as Record<string, unknown>];
}

/** 포털은 필드명을 소문자로 주지만, 문서/샘플에 camelCase가 섞여 있어 둘 다 받는다 */
function pick(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key] ?? row[key.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** 두 좌표 간 직선 거리(m) — 근접 정류소 정렬 표시용 */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function callTago(path: string, params: Record<string, string>): Promise<unknown> {
  const serviceKey = getDataGoKrServiceKey();
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다");

  // 서비스키 이중 인코딩 방지 (Decoding/Encoding 키 어느 쪽이든 안전하게)
  const encodedKey = encodeURIComponent(decodeURIComponent(serviceKey));
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(`${TAGO_BASE}/${path}?serviceKey=${encodedKey}&_type=json&${query}`, {
    // 도착정보는 실시간성이 중요해 캐시하지 않는다 (호출 측에서 메모리 캐시)
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TAGO ${path} HTTP ${res.status}`);

  const text = await res.text();
  // 인증 실패·활용신청 미승인은 200 OK + XML 에러 문서로 돌아온다
  if (text.trimStart().startsWith("<")) {
    const reason =
      /<returnAuthMsg>(.*?)<\/returnAuthMsg>/.exec(text)?.[1] ??
      /<errMsg>(.*?)<\/errMsg>/.exec(text)?.[1] ??
      "인증 또는 활용신청 오류";
    throw new Error(`TAGO ${path}: ${reason}`);
  }

  const json = JSON.parse(text) as unknown;

  // JSON으로 와도 헤더에 오류 코드가 실릴 수 있다 (00 = 정상)
  const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })
    ?.response?.header;
  if (header?.resultCode && header.resultCode !== "00") {
    throw new Error(`TAGO ${path}: ${header.resultMsg ?? header.resultCode}`);
  }

  return json;
}

/** 좌표 근처 정류소 목록 (가까운 순) */
export async function fetchNearbyStops(lat: number, lng: number, limit = 5): Promise<NearbyStop[]> {
  const json = await callTago("BusSttnInfoInqireService/getCrdntPrxmtSttnList", {
    gpsLati: String(lat),
    gpsLong: String(lng),
    numOfRows: String(Math.max(limit, 10)),
    pageNo: "1",
  });

  const stops: NearbyStop[] = normalizeItems(json).flatMap((row) => {
    const nodeId = pick(row, "nodeid", "nodeId");
    const name = pick(row, "nodenm", "nodeNm");
    const cityCode = pick(row, "citycode", "cityCode");
    if (!nodeId || !name || !cityCode) return [];

    const stopLat = toNumber(pick(row, "gpslati", "gpsLati"));
    const stopLng = toNumber(pick(row, "gpslong", "gpsLong"));
    const stop: NearbyStop = { nodeId, cityCode, name };
    if (stopLat !== undefined && stopLng !== undefined) {
      stop.distanceM = haversineM(lat, lng, stopLat, stopLng);
    }
    return [stop];
  });

  stops.sort((a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER));
  return stops.slice(0, limit);
}

/** 정류소별 실시간 도착예정 (도착 임박 순) */
export async function fetchBusArrivals(
  cityCode: string,
  nodeId: string,
  limit = 5
): Promise<BusArrival[]> {
  const json = await callTago("ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList", {
    cityCode,
    nodeId,
    numOfRows: "30",
    pageNo: "1",
  });

  const arrivals: BusArrival[] = normalizeItems(json).flatMap((row) => {
    const routeNo = pick(row, "routeno", "routeNo");
    const arrivalSeconds = toNumber(pick(row, "arrtime", "arrTime"));
    if (!routeNo || arrivalSeconds === undefined) return [];

    const arrival: BusArrival = { routeNo, arrivalSeconds };
    const routeType = pick(row, "routetp", "routeTp");
    if (routeType) arrival.routeType = routeType;
    const stopsAway = toNumber(pick(row, "arrprevstationcnt", "arrPrevStationCnt"));
    if (stopsAway !== undefined) arrival.stopsAway = stopsAway;
    return [arrival];
  });

  arrivals.sort((a, b) => a.arrivalSeconds - b.arrivalSeconds);
  return arrivals.slice(0, limit);
}
