// 외부 공급자 키 판독을 한 곳으로 모은다.
//
// 공공데이터포털(data.go.kr)은 **계정당 일반 인증키 1개**를 활용신청한 모든 오픈API에 공통 적용한다.
// 기상청 단기예보 · TAGO(대중교통) · 한국도로공사가 모두 같은 키를 쓰므로, 채널마다 다른 이름의
// 환경변수를 두면 같은 값을 여러 번 적어야 한다.

/**
 * 공공데이터포털 공용 인증키.
 * `WEATHER_API_KEY`는 날씨만 쓰던 시절의 이름 — 기존 배포를 깨지 않도록 별칭으로 계속 인정한다.
 */
export function getDataGoKrServiceKey(): string | undefined {
  return process.env.DATA_GO_KR_SERVICE_KEY || process.env.WEATHER_API_KEY || undefined;
}

/**
 * OpenWeatherMap 전용 키(기상청 실패 시 폴백).
 *
 * `DATA_GO_KR_SERVICE_KEY`로 이미 마이그레이션한 환경에서는 포털 키를 OWM에 넘기지 않는다
 * (포털 키로 OWM을 호출하면 항상 401이라 폴백이 무의미해진다).
 * 아직 `WEATHER_API_KEY`만 쓰는 환경은 그 값이 OWM 키일 수도 있으므로 기존 동작을 유지한다.
 */
export function getOpenWeatherApiKey(): string | undefined {
  if (process.env.OPENWEATHER_API_KEY) return process.env.OPENWEATHER_API_KEY;
  if (process.env.DATA_GO_KR_SERVICE_KEY) return undefined;
  return process.env.WEATHER_API_KEY || undefined;
}
