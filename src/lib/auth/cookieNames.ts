// 쿠키 이름 단일 정의처 — Edge 런타임(proxy.ts)과 Node(session.ts) 양쪽에서 import.
// 이 파일에는 어떤 의존성도 추가하지 말 것 (proxy.ts가 Edge 번들에 포함함).
//
// NOTE: "tp_" 접두사는 리브랜딩(TimePilot → coffeeTide) 이전 잔재지만 의도적으로 유지한다.
// 이 쿠키는 세션 ID가 아니라 OAuth 토큰(Google/Outlook/Notion)을 담은 암호화 페이로드
// 자체(서버 DB 없음)라, 이름을 바꾸면 전 사용자 로그아웃 + 모든 연동 재연결이 발생한다.
// 바꾸려면 (1) 두 쿠키를 반드시 한 쌍으로 변경, (2) 구쿠키 → 신쿠키 이중 판독 폴백을
// 쿠키 수명(7일) 이상 운영해야 한다. 단독 변경 금지.
export const SESSION_COOKIE = "tp_session";
export const SESSION_EXPIRY_COOKIE = "tp_session_expiry";

// OAuth CSRF state — 수명 10분 일회성 쿠키라 리네이밍 안전 (구 tp_oauth_state)
export const OAUTH_STATE_COOKIE = "ct_oauth_state";
