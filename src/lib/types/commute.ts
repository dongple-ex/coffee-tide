export interface CommuteConfig {
  enabled: boolean;
  homeStation: string;
  workStation: string;
}

export interface CommuteInfo {
  mode: "morning" | "evening"; // morning: 출근(집->회사), evening: 퇴근(회사->집)
  origin: string;
  destination: string;
  durationMinutes: number;
  nextDepartureTime: string;
  lineInfo: string;
  statusText: string;
  kakaoMapUrl: string;
  naverMapUrl: string;
}
