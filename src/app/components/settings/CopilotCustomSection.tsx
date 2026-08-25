"use client";

import React from "react";
import { CopilotUserConfig } from "@/lib/ai/harness";
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

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle}>AI 바리스타 설정</div>
      <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "12px", lineHeight: "1.4" }}>
        안전한 기본 바운더리(날짜 추정 금지·출처 명시·보안 세이프가드) 내에서 말투와 브리핑 스타일을 자유롭게 맞춤 설정합니다.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            AI 호칭
          </label>
          <input
            className={styles.input}
            type="text"
            placeholder="AI 바리스타"
            value={config.baristaName ?? "AI 바리스타"}
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
            어조 & 페르소나
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
              placeholder='예: "너는 톡톡 튀는 카페 사장님이야. 유쾌한 반말로 브리핑해줘"'
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
