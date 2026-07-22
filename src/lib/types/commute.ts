export interface CommuteConfig {
  enabled: boolean;
  homeStation: string;
  workStation: string;
  transportType: "public" | "car"; // public: 대중교통, car: 자동차
}

export interface CommuteInfo {
  mode: "morning" | "evening"; // morning: 출근(집->회사), evening: 퇴근(회사->집)
  transportType: "public" | "car";
  origin: string;
  destination: string;
  durationMinutes: number;
  nextDepartureTime: string;
  lineInfo: string;
  statusText: string;
  kakaoMapUrl: string;
  naverMapUrl: string;
  kakaoAppScheme: string;
  naverAppScheme: string;
}
