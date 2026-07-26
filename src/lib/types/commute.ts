import { LatLng } from "@/lib/mapLinks";

export interface CommuteConfig {
  enabled: boolean;
  homeStation: string;
  workStation: string;
  transportType: "public" | "car"; // public: 대중교통, car: 자동차
  // 지도 앱 딥링크는 카카오·네이버 모두 좌표가 필수다(이름만으로는 앱이 열리지 않는다).
  // 설정의 "현재 위치로 지정"으로 채우며, 클라이언트에만 보관한다.
  homeCoords?: LatLng;
  workCoords?: LatLng;
}

export interface CommuteRouteOption {
  icon: string;
  category: string;
  name: string;
  duration: number;
  departureTime: string;
  arrivalTime: string;
  fare: string;
  badgeText: string;
  congestion: string;
}

export interface CommuteInfo {
  mode: "morning" | "evening"; // morning: 출근(집->회사), evening: 퇴근(회사->집)
  transportType: "public" | "car";
  origin: string;
  destination: string;
  durationMinutes: number;
  nextDepartureTime: string;
  expectedArrivalTime: string;
  nextSubsequentDepartureTime: string;
  congestionText: string;
  fareInfo: string;
  lineInfo: string;
  statusText: string;
  smartTip: string;
  routeOptions: CommuteRouteOption[];
  // 지도 링크는 서버가 만들지 않는다 — 좌표가 필요하고, 그 좌표는 클라이언트에만 있다.
  // CommuteCard가 buildMapLinks()로 직접 생성한다.
}
