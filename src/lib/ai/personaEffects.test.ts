import { describe, it, expect } from "vitest";
import {
  resolvePersonaKind,
  getPersonaEffect,
  getPersonaAvatar,
  PersonaKind,
} from "./personaEffects";

const ALL_KINDS: PersonaKind[] = ["karina", "barista", "secretary", "pm", "chaerin"];

describe("페르소나 효과 판별", () => {
  it("presetId를 이름보다 우선 기준으로 삼는다", () => {
    // 이름을 자유롭게 바꾸어도 프리셋을 고른 결과가 유지되어야 한다.
    expect(resolvePersonaKind("chaerin", "미나")).toBe("chaerin");
    expect(resolvePersonaKind("secretary", "이대리")).toBe("secretary");
    expect(resolvePersonaKind("pm", "커피요정")).toBe("pm");
    expect(resolvePersonaKind("karina", "우리 비서")).toBe("karina");
  });

  it("이름에 다른 페르소나 키워드가 섞여 있어도 presetId가 이긴다", () => {
    expect(resolvePersonaKind("karina", "칼찌장인 채린이")).toBe("karina");
    expect(resolvePersonaKind("barista", "김부장")).toBe("barista");
  });

  it("custom 프리셋이나 presetId가 없을 때만 이름으로 추정한다", () => {
    expect(resolvePersonaKind("custom", "칼찌장인 채린이")).toBe("chaerin");
    expect(resolvePersonaKind("custom", "김부장")).toBe("secretary");
    expect(resolvePersonaKind(undefined, "칼퇴봇")).toBe("pm");
    expect(resolvePersonaKind(undefined, "카리나")).toBe("karina");
  });

  it("알 수 없는 이름은 클래식 바리스타로 되돌린다", () => {
    expect(resolvePersonaKind("custom", "나만의 비서")).toBe("barista");
    expect(resolvePersonaKind(undefined, undefined)).toBe("barista");
  });
});

describe("페르소나별 효과 정의", () => {
  it("모든 페르소나가 서로 다른 파티클 연출을 갖는다", () => {
    const signatures = ALL_KINDS.map((kind) => {
      const effect = getPersonaEffect(kind);
      return `${effect.ambient.shape}:${effect.ambient.colors.join(",")}`;
    });

    // 다섯 페르소나의 연출이 하나도 겹치지 않아야 한다.
    expect(new Set(signatures).size).toBe(ALL_KINDS.length);
  });

  it("모든 페르소나가 고유한 메뉴와 강조색을 갖는다", () => {
    const menuIds = ALL_KINDS.map((kind) => getPersonaEffect(kind).menu[0].id);
    expect(new Set(menuIds).size).toBe(ALL_KINDS.length);

    const accents = ALL_KINDS.map((kind) => getPersonaEffect(kind).accent);
    expect(new Set(accents).size).toBe(ALL_KINDS.length);
  });

  it("벨 대사와 말풍선이 페르소나마다 채워져 있다", () => {
    for (const kind of ALL_KINDS) {
      const effect = getPersonaEffect(kind);
      expect(effect.brewingMessage("테스터", "아메리카노")).toContain("아메리카노");
      expect(effect.servedMessage("테스터", "아메리카노")).toContain("아메리카노");
      expect(effect.brewBubbles.length).toBeGreaterThanOrEqual(4);
      expect(effect.hoverBubble("테스터").length).toBeGreaterThan(0);
    }
  });

  it("컷인이 정의된 페르소나는 음료 이름을 자막에 반영한다", () => {
    for (const kind of ALL_KINDS) {
      const cutin = getPersonaEffect(kind).cutin;
      if (!cutin) continue;
      expect(cutin.subtitleTemplate.replace("{drink}", "레모네이드")).toContain("레모네이드");
      expect(cutin.durationMs).toBeGreaterThan(0);
    }
  });

  it("잔 장식이 반짝임이면 반짝일 문자가 함께 정의되어 있다", () => {
    for (const kind of ALL_KINDS) {
      const effect = getPersonaEffect(kind);
      if (effect.cupDecoration === "glint") {
        expect(effect.glintChars.length).toBeGreaterThan(0);
      }
    }
  });

  it("브루잉 상태에 따라 아바타 경로를 돌려준다", () => {
    const classic = getPersonaEffect("barista");
    expect(getPersonaAvatar(classic, true)).toBe(classic.avatarBrewing);
    expect(getPersonaAvatar(classic, false)).toBe(classic.avatarIdle);
  });
});
