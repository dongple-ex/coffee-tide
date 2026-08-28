"use client";

import React from "react";
import { CopilotUserConfig, PERSONA_PRESETS, PersonaPreset } from "@/lib/ai/harness";
import { UiIcon } from "../UiIcon";
import styles from "../../page.module.css";

interface Props {
  config: CopilotUserConfig;
  onChangeConfig: (next: CopilotUserConfig) => void;
  followupHours?: number;
  onChangeFollowupHours?: (hours: number) => void;
}

export function CopilotCustomSection({
  config,
  onChangeConfig,
  followupHours = 24,
  onChangeFollowupHours,
}: Props) {
  const currentName = config.baristaName ?? "AI 바리스타";

  const handleSelectPreset = (preset: PersonaPreset) => {
    onChangeConfig({
      ...config,
      presetId: preset.id,
      baristaName: preset.baristaName,
      tone: preset.tone,
      customToneText: preset.customToneText ?? "",
      customInstructions: preset.customInstructions ?? config.customInstructions ?? "",
    });
  };

  const handleChangeName = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeConfig({ ...config, baristaName: e.target.value });
  };

  const handleChangeTone = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChangeConfig({
      ...config,
      tone: e.target.value as CopilotUserConfig["tone"],
    });
  };

  const handleChangeCustomToneText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeConfig({ ...config, customToneText: e.target.value });
  };

  const handleChangeInstructions = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeConfig({ ...config, customInstructions: e.target.value });
  };

  const handleToggleTimeEstimate = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeConfig({ ...config, includeTimeEstimate: e.target.checked });
  };

  // 실시간 말투 미리보기 생성
  const previewGreeting =
    currentName === "카리나"
      ? "안녕하세요! 오늘 일정과 중요 업무 싹 정리해 드릴게요 ✨"
      : currentName === "김부장" || config.tone === "formal"
      ? "안녕하십니까. 오늘 진행할 주요 업무와 일정 브리핑 보고드립니다."
      : currentName === "칼퇴봇" || config.tone === "concise"
      ? "사족 빼고 결론만 갑니다. 오늘 칼퇴를 위한 핵심 브리핑입니다."
      : currentName === "칼찌장인 채린이" || config.presetId === "chaerin"
      ? "훗, 내가 없으면 일이 안 돌아가지? 오늘 해야 할 거 딱 정리해 줄게 🃏"
      : config.tone === "custom" && config.customToneText
      ? `(${config.customToneText}) 오늘 업무 브리핑을 시작하겠습니다.`
      : "커피 한 잔과 함께 편안하게 오늘 하루를 시작해 보세요 ☕";

  const previewResponse =
    currentName === "카리나"
      ? "오전 중으로 결재 요청 2건 먼저 확인하시는 게 좋아요! 제가 초안도 미리 챙겨둘게요 🚀"
      : currentName === "김부장" || config.tone === "formal"
      ? "금일 14시 예정된 주요 회의 자료 검토가 최우선 과제입니다. 일정에 차질 없도록 확인 바랍니다."
      : currentName === "칼퇴봇" || config.tone === "concise"
      ? "• [칼퇴 필수 1] 오전 긴급 결재 2건 처리\n• [칼퇴 필수 2] 오후 2시 회의 30분 전 자료 최종 점검\n• [블로커] 미회신 메일 1건 빠른 확인 요망"
      : currentName === "칼찌장인 채린이" || config.presetId === "chaerin"
      ? "어휴, 이것도 아직 안 끝냈어? 결재 2건부터 후딱 치우고 오자고. 나머진 내가 봐둘 테니까! 🖤"
      : config.tone === "custom" && config.customToneText
      ? `사용자 지정 어조("${config.customToneText}")에 맞추어 맞춤형으로 브리핑합니다.`
      : "긴급한 메일 1건이 도착해 있어요. 따뜻한 커피 한 잔 드시면서 차근차근 확인해 드릴게요~";

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle}>AI 바리스타 & 페르소나 설정</div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim, #666)", marginBottom: "14px", lineHeight: "1.4" }}>
        안전한 기본 바운더리(날짜 추정 금지·출처 명시·보안 세이프가드) 내에서 말투와 브리핑 스타일을 자유롭게 맞춤 설정합니다.
      </p>

      {/* 🌟 원클릭 페르소나 프리셋 바 */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "8px" }}>
          페르소나 프리셋 선택
        </label>
        <div className={styles.personaPresetGrid}>
          {PERSONA_PRESETS.map((preset) => {
            const isSelected =
              config.presetId === preset.id ||
              (preset.id === "karina" && currentName === "카리나") ||
              (preset.id === "barista" && !config.presetId && currentName === "AI 바리스타" && config.tone === "friendly");

            return (
              <button
                key={preset.id}
                type="button"
                className={`${styles.personaPresetBtn} ${isSelected ? styles.personaPresetBtnActive : ""}`}
                onClick={() => handleSelectPreset(preset)}
                aria-pressed={isSelected}
              >
                <span className={styles.personaPresetBadge}>{preset.badge}</span>
                <span className={styles.personaPresetName}>{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* 💬 실시간 말투 미리보기 */}
        <div className={styles.personaPreviewCard}>
          <div className={styles.personaPreviewHeader}>
            <UiIcon name="assistant" size={15} />
            <span>{currentName} 실시간 응답 예시</span>
          </div>
          <div className={styles.personaPreviewBubble}>
            <b>{currentName}</b>: &ldquo;{previewGreeting}&rdquo;
          </div>
          <div className={styles.personaPreviewBubble} style={{ whiteSpace: "pre-line", marginBottom: 0 }}>
            {previewResponse}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            AI 호칭
          </label>
          <input
            className={styles.input}
            type="text"
            placeholder="AI 바리스타"
            value={currentName}
            onChange={handleChangeName}
            maxLength={30}
          />
        </div>

        {onChangeFollowupHours && (
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              팔로업 에스컬레이션 기준
            </label>
            <select
              className={styles.input}
              value={followupHours}
              onChange={(e) => onChangeFollowupHours(Number(e.target.value))}
              style={{ width: "100%", marginBottom: "4px" }}
              aria-label="팔로업 에스컬레이션 기준 시간"
            >
              <option value={12}>12시간 미응답 시 강조</option>
              <option value={24}>24시간 미응답 시 강조 (기본)</option>
              <option value={48}>48시간 미응답 시 강조</option>
            </select>
            <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", lineHeight: "1.4" }}>
              지정한 시간 동안 회신이나 처리가 없는 메일·일정을 AI 바리스타가 주의 항목으로 우선 브리핑합니다.
            </div>
          </div>
        )}

        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            어조 & 페르소나 스타일
          </label>
          <select
            className={styles.input}
            value={config.tone ?? "friendly"}
            onChange={handleChangeTone}
            style={{ width: "100%", marginBottom: "6px" }}
          >
            <option value="friendly">친근하고 따뜻한 개인 비서 (&quot;~해드릴게요&quot;)</option>
            <option value="formal">정중하고 격식 있는 수석 비서 (&quot;~하십시오&quot;)</option>
            <option value="concise">극도로 간결한 개조식 보고 (결론·핵심 위주)</option>
            <option value="custom">사용자 지정 말투 직접 작성</option>
          </select>

          {config.tone === "custom" && (
            <input
              className={styles.input}
              type="text"
              placeholder='예: "센스 있고 에너지 넘치는 톤. 이모지를 자연스럽게 곁들여 활기차게 응답"'
              value={config.customToneText ?? ""}
              onChange={handleChangeCustomToneText}
              maxLength={150}
            />
          )}
        </div>

        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            추가 응답 규칙 & 제약조건
          </label>
          <textarea
            className={styles.input}
            style={{ height: "60px", resize: "vertical", fontFamily: "inherit" }}
            placeholder='예: "전문용어 사용 시 한글 병기", "중요한 항목은 굵은 글씨 강조"'
            value={config.customInstructions ?? ""}
            onChange={handleChangeInstructions}
            maxLength={500}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <input
            type="checkbox"
            id="timeEstimateCheck"
            checked={!!config.includeTimeEstimate}
            onChange={handleToggleTimeEstimate}
          />
          <label htmlFor="timeEstimateCheck" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
            ⏱️ 각 할 일 항목에 예상 소요시간([예상 30분] 등) 추정치 표기
          </label>
        </div>
      </div>
    </section>
  );
}
