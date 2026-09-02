// 🔒 CoffeeTide AI 컴패니언 기능 활성화 & 롤아웃 권한 판정 모듈 (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §14

import {
  CompanionGrowthMode,
  CompanionFeatureAccess,
  CompanionFeatureStatus,
} from "./contracts";

/** 서버 환경변수로부터 COMPANION_GROWTH_MODE 파싱 (기본값: 'off', 유효하지 않은 값: 'off') */
export function parseServerGrowthMode(rawMode?: string | null): CompanionGrowthMode {
  const mode = (rawMode || "").trim().toLowerCase();
  if (mode === "on" || mode === "pilot" || mode === "shadow") {
    return mode as CompanionGrowthMode;
  }
  return "off";
}

/** 킬스위치 활성화 여부 판정 (DISABLE_COMPANION_GROWTH=true가 항상 최우선, 기본값: true) */
export function isKillSwitchActive(rawKillSwitch?: string | null): boolean {
  if (rawKillSwitch === undefined || rawKillSwitch === null) {
    // 환경변수가 명시되지 않으면 안전을 위해 기본 true (킬스위치 켜짐)
    return true;
  }
  const normalized = rawKillSwitch.trim().toLowerCase();
  // "false", "0", "off" 만 킬스위치 해제로 판정
  return !(normalized === "false" || normalized === "0" || normalized === "off");
}

/**
 * 최종 기능 활성화 여부 판정 (단일 정본 판정 함수)
 * - 킬스위치가 켜져 있으면 무조건 비활성 (false)
 * - serverMode가 'off' 또는 'shadow'이면 일반 기능 비활성 (false)
 * - serverMode가 'pilot'인데 사용자가 코호트 대상이 아니면 비활성 (false)
 * - 최종적으로 사용자의 활성화 토글(userEnabled)이 true여야 활성 (true)
 */
export function isCompanionGrowthActive(access: CompanionFeatureAccess): boolean {
  if (access.killSwitchActive) return false;
  if (access.serverMode === "off" || access.serverMode === "shadow") return false;
  if (access.serverMode === "pilot" && !access.cohortEligible) return false;
  return access.userEnabled;
}

/** 사용자와 서버 환경으로부터 Access 컨텍스트 조립 */
export function getCompanionFeatureAccess(options?: {
  envGrowthMode?: string;
  envKillSwitch?: string;
  userCohort?: string | null;
  userEnabled?: boolean;
}): CompanionFeatureAccess {
  const serverMode = parseServerGrowthMode(
    options?.envGrowthMode ?? process.env.COMPANION_GROWTH_MODE
  );
  const killSwitchActive = isKillSwitchActive(
    options?.envKillSwitch ?? process.env.DISABLE_COMPANION_GROWTH
  );

  // pilot 모드 코호트 자격: internal 또는 pilot_* 코호트
  const cohort = options?.userCohort || null;
  const cohortEligible =
    serverMode === "on" ||
    (serverMode === "pilot" &&
      (cohort === "internal" ||
        cohort?.startsWith("pilot_") ||
        process.env.NODE_ENV === "development"));

  const userEnabled = Boolean(options?.userEnabled);

  return {
    serverMode,
    killSwitchActive,
    cohortEligible,
    userEnabled,
  };
}

/** 클라이언트 UI가 소비할 상태(Status) 객체 생성 */
export function getCompanionFeatureStatus(access: CompanionFeatureAccess): CompanionFeatureStatus {
  const active = isCompanionGrowthActive(access);

  if (access.killSwitchActive) {
    return {
      available: false,
      active: false,
      mode: access.serverMode,
      reason: "kill_switch",
      canToggle: false,
    };
  }

  if (access.serverMode === "off") {
    return {
      available: false,
      active: false,
      mode: "off",
      reason: "server_off",
      canToggle: false,
    };
  }

  if (access.serverMode === "shadow") {
    return {
      available: false,
      active: false,
      mode: "shadow",
      reason: "shadow_mode",
      canToggle: false,
    };
  }

  if (access.serverMode === "pilot" && !access.cohortEligible) {
    return {
      available: false,
      active: false,
      mode: "pilot",
      reason: "not_in_cohort",
      canToggle: false,
    };
  }

  return {
    available: true,
    active,
    mode: access.serverMode,
    reason: active ? undefined : "user_disabled",
    canToggle: true,
  };
}
