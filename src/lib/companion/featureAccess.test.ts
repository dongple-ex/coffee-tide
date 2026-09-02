import { describe, it, expect } from "vitest";
import {
  parseServerGrowthMode,
  isKillSwitchActive,
  isCompanionGrowthActive,
  getCompanionFeatureAccess,
  getCompanionFeatureStatus,
} from "./featureAccess";

describe("Companion Feature Access & Rollout Engine", () => {
  describe("환경변수 파싱 및 킬스위치", () => {
    it("환경변수가 없거나 잘못된 값이면 항상 'off'로 파싱된다", () => {
      expect(parseServerGrowthMode(undefined)).toBe("off");
      expect(parseServerGrowthMode(null)).toBe("off");
      expect(parseServerGrowthMode("")).toBe("off");
      expect(parseServerGrowthMode("invalid_mode")).toBe("off");
      expect(parseServerGrowthMode("pilot")).toBe("pilot");
      expect(parseServerGrowthMode("on")).toBe("on");
      expect(parseServerGrowthMode("shadow")).toBe("shadow");
    });

    it("DISABLE_COMPANION_GROWTH가 없으면 안전을 위해 기본 true (킬스위치 작동)이다", () => {
      expect(isKillSwitchActive(undefined)).toBe(true);
      expect(isKillSwitchActive(null)).toBe(true);
      expect(isKillSwitchActive("true")).toBe(true);
      expect(isKillSwitchActive("1")).toBe(true);
      expect(isKillSwitchActive("false")).toBe(false);
      expect(isKillSwitchActive("0")).toBe(false);
      expect(isKillSwitchActive("off")).toBe(false);
    });
  });

  describe("최종 활성화 판정 (isCompanionGrowthActive)", () => {
    it("킬스위치가 켜져 있으면 다른 조건과 무관하게 항상 false다", () => {
      expect(
        isCompanionGrowthActive({
          serverMode: "on",
          killSwitchActive: true,
          cohortEligible: true,
          userEnabled: true,
        })
      ).toBe(false);
    });

    it("serverMode가 'off' 또는 'shadow'이면 일반 사용자 기능은 비활성이다", () => {
      expect(
        isCompanionGrowthActive({
          serverMode: "off",
          killSwitchActive: false,
          cohortEligible: true,
          userEnabled: true,
        })
      ).toBe(false);

      expect(
        isCompanionGrowthActive({
          serverMode: "shadow",
          killSwitchActive: false,
          cohortEligible: true,
          userEnabled: true,
        })
      ).toBe(false);
    });

    it("pilot 모드에서 코호트 대상이 아니면 userEnabled=true여도 비활성이다", () => {
      expect(
        isCompanionGrowthActive({
          serverMode: "pilot",
          killSwitchActive: false,
          cohortEligible: false,
          userEnabled: true,
        })
      ).toBe(false);
    });

    it("모든 조건(킬스위치 해제, on 또는 pilot 코호트, userEnabled=true)이 만족될 때만 활성이다", () => {
      expect(
        isCompanionGrowthActive({
          serverMode: "on",
          killSwitchActive: false,
          cohortEligible: true,
          userEnabled: true,
        })
      ).toBe(true);

      expect(
        isCompanionGrowthActive({
          serverMode: "pilot",
          killSwitchActive: false,
          cohortEligible: true,
          userEnabled: true,
        })
      ).toBe(true);

      // 사용자가 토글을 껐으면 비활성
      expect(
        isCompanionGrowthActive({
          serverMode: "on",
          killSwitchActive: false,
          cohortEligible: true,
          userEnabled: false,
        })
      ).toBe(false);
    });
  });

  describe("Feature Status 생성", () => {
    it("킬스위치 상태일 때 UI 상태가 올바르게 생성된다", () => {
      const access = getCompanionFeatureAccess({
        envGrowthMode: "on",
        envKillSwitch: "true",
        userEnabled: true,
      });
      const status = getCompanionFeatureStatus(access);
      expect(status.available).toBe(false);
      expect(status.active).toBe(false);
      expect(status.reason).toBe("kill_switch");
      expect(status.canToggle).toBe(false);
    });

    it("정상 pilot 코호트에서 사용자가 토글을 껐을 때 available=true, active=false로 표시된다", () => {
      const access = getCompanionFeatureAccess({
        envGrowthMode: "pilot",
        envKillSwitch: "false",
        userCohort: "pilot_a",
        userEnabled: false,
      });
      const status = getCompanionFeatureStatus(access);
      expect(status.available).toBe(true);
      expect(status.active).toBe(false);
      expect(status.reason).toBe("user_disabled");
      expect(status.canToggle).toBe(true);
    });
  });
});
