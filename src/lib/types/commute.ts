import { LatLng } from "@/lib/mapLinks";

/** 설정에서 저장해 둔 정류소 — 폴링에는 좌표 대신 이 코드만 오간다 */
export interface CommuteStop {
  nodeId: string;
  cityCode: string;
  name: string;
  distanceM?: number;
}

export interface CommuteConfig {
  enabled: boolean;
  homeStation: string;
  workStation: string;
  transportType: "public" | "car"; // public: 대중교통, car: 자동차
  // 지도 앱 딥링크는 카카오·네이버 모두 좌표가 필수다(이름만으로는 앱이 열리지 않는다).
  // 설정의 "현재 위치로 지정"으로 채우며, 클라이언트에만 보관한다.
  homeCoords?: LatLng;
  workCoords?: LatLng;
  // 좌표 지정 시 함께 찾아 둔 근접 정류소 (TAGO 실시간 도착정보 조회용)
  homeStop?: CommuteStop;
  workStop?: CommuteStop;
}

/** 정류소 실시간 도착예정 1건 */
export interface CommuteArrival {
  routeNo: string;
  routeType?: string;
  /** 도착까지 남은 초 */
  arrivalSeconds: number;
  stopsAway?: number;
}

/**
 * 출퇴근 카드 데이터.
 *
 * 실측 가능한 것만 담는다 — 공공데이터포털에는 전국 단위 환승 경로탐색 API가 없어
 * "총 소요시간·최적 경로"는 지도 앱에 위임한다. 추정치를 만들어 넣지 않는다.
 */
export interface CommuteInfo {
  mode: "morning" | "evening"; // morning: 출근(집->회사), evening: 퇴근(회사->집)
  transportType: "public" | "car";
  origin: string;
  destination: string;
  /** 출발지 근처 정류소 (설정에 저장된 것) */
  stopName?: string;
  /** 실시간 도착예정 — 조회 실패·미설정 시 빈 배열 */
  arrivals: CommuteArrival[];
  /** 수치를 못 채운 이유 (UI 안내용) */
  notice?: string;
}
