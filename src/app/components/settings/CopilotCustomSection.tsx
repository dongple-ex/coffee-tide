"use client";

import React, { useState } from "react";
import { CopilotUserConfig, PERSONA_PRESETS, PersonaPreset } from "@/lib/ai/harness";
import { UiIcon } from "../UiIcon";
import { CompanionMemoryModal } from "@/app/components/companion/CompanionMemoryModal";
import { CompanionGrowthCard } from "@/app/components/companion/CompanionGrowthCard";
import styles from "../../page.module.css";

interface Props {
  config: CopilotUserConfig;
  onChangeConfig: (next: CopilotUserConfig) => void;
  followupHours?: number;
  onChangeFollowupHours?: (hours: number) => void;
}

type FilterCategory = "all" | "office" | "fantasy" | "daily" | "animal" | "special";

const CATEGORY_TABS: { id: FilterCategory; label: string; icon: string }[] = [
  { id: "all", label: "전체 캐릭터", icon: "✨" },
  { id: "office", label: "오피스 & 비서", icon: "💼" },
  { id: "fantasy", label: "판타지 & 서브컬처", icon: "🪄" },
  { id: "daily", label: "일상 & 츤데레", icon: "☕" },
  { id: "animal", label: "귀여운 동물", icon: "🐾" },
  { id: "special", label: "커스텀", icon: "✍️" },
];

export function CopilotCustomSection({
  config,
  onChangeConfig,
  followupHours = 24,
  onChangeFollowupHours,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("all");
  const [showMemoryModal, setShowMemoryModal] = useState(false);
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

  const filteredPresets =
    activeCategory === "all"
      ? PERSONA_PRESETS
      : PERSONA_PRESETS.filter((p) => p.category === activeCategory);

  const selectedPreset =
    PERSONA_PRESETS.find((p) => p.id === config.presetId) ||
    PERSONA_PRESETS.find((p) => p.baristaName === currentName) ||
    PERSONA_PRESETS[0];

  const previewGreeting = selectedPreset.previewGreeting;
  const previewResponse = selectedPreset.previewResponse;

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle} style={{ marginBottom: "12px" }}>
        🎭 AI 캐릭터 & 페르소나 설정
      </div>

      {/* 🏷️ 카테고리 필터 탭 */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "8px", marginBottom: "12px" }}>
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCategory(tab.id)}
            style={{
              padding: "6px 12px",
              borderRadius: "20px",
              fontSize: "0.8rem",
              fontWeight: activeCategory === tab.id ? 700 : 500,
              backgroundColor: activeCategory === tab.id ? "var(--accent, #38bdf8)" : "rgba(255, 255, 255, 0.06)",
              color: activeCategory === tab.id ? "#000" : "var(--text, #eee)",
              border: "1px solid " + (activeCategory === tab.id ? "var(--accent, #38bdf8)" : "rgba(255, 255, 255, 0.1)"),
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ marginRight: "4px" }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 🌟 뤼튼 크랙 감성 캐릭터 카드 갤러리 */}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "10px",
            maxHeight: "320px",
            overflowY: "auto",
            padding: "4px",
            borderRadius: "8px",
          }}
        >
          {filteredPresets.map((preset) => {
            const isSelected =
              config.presetId === preset.id ||
              (!config.presetId && preset.id === "karina" && currentName === "카리나") ||
              (!config.presetId && preset.id === "barista" && currentName === "AI 바리스타");

            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  backgroundColor: isSelected ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.03)",
                  border: isSelected ? "2px solid var(--accent, #38bdf8)" : "1px solid rgba(255, 255, 255, 0.08)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 0 12px rgba(56, 189, 248, 0.25)" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", padding: "2px 6px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.08)", color: "var(--text-dim, #aaa)" }}>
                    {preset.badge}
                  </span>
                  {isSelected && (
                    <span style={{ fontSize: "0.75rem", color: "var(--accent, #38bdf8)", fontWeight: 700 }}>
                      선택됨 ✓
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text, #fff)" }}>
                  {preset.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim, #888)", lineHeight: "1.3", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {preset.tagline}
                </div>
              </div>
            );
          })}
        </div>

        {/* 💬 실시간 캐릭터 대화 & 행동 지문 미리보기 */}
        <div className={styles.personaPreviewCard} style={{ marginTop: "12px" }}>
          <div className={styles.personaPreviewHeader} style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <UiIcon name="assistant" size={15} />
              <span><b>{selectedPreset.name}</b>의 세계관 대화 예시</span>
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim, #888)" }}>{selectedPreset.badge}</span>
          </div>
          <div className={styles.personaPreviewBubble}>
            <b>{selectedPreset.baristaName}</b>: &ldquo;{previewGreeting}&rdquo;
          </div>
          <div className={styles.personaPreviewBubble} style={{ whiteSpace: "pre-line", marginBottom: 0 }}>
            {previewResponse}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            캐릭터 호칭 커스텀
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
              <option value={72}>72시간 미응답 시 강조</option>
            </select>
          </div>
        )}

        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            어조 기본 모드
          </label>
          <select
            className={styles.input}
            value={config.tone ?? "friendly"}
            onChange={handleChangeTone}
            style={{ width: "100%", marginBottom: "4px" }}
            aria-label="AI 바리스타 기본 어조"
          >
            <option value="friendly">친근한 톤 (자연스러운 지원)</option>
            <option value="formal">정중/격식 톤 (~하십시오, ~바랍니다)</option>
            <option value="concise">초간결 개조식 톤 (핵심만 신속 전달)</option>
            <option value="custom">캐릭터 고유 맞춤 톤 (프리셋/사용자 지정)</option>
          </select>
        </div>

        {config.tone === "custom" && (
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              커스텀 어조 설명
            </label>
            <input
              className={styles.input}
              type="text"
              placeholder="예: 발랄하고 장난기 넘치며, 럭키비키 밈을 자연스럽게 섞는 톤"
              value={config.customToneText ?? ""}
              onChange={handleChangeCustomToneText}
              maxLength={120}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            추가 제약 조건 / 응답 규칙 (선택)
          </label>
          <textarea
            className={styles.input}
            rows={3}
            placeholder="예: 회의 준비 사항을 항상 맨 앞에 강조해줘 / 답변 끝에 3초 스트레칭 제안을 붙여줘"
            value={config.customInstructions ?? ""}
            onChange={handleChangeInstructions}
            maxLength={500}
            style={{ resize: "vertical", width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <input
            id="chk-time-estimate"
            type="checkbox"
            checked={config.includeTimeEstimate ?? false}
            onChange={handleToggleTimeEstimate}
          />
          <label htmlFor="chk-time-estimate" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
            주요 업무 브리핑 시 합리적인 예상 소요시간([예상 30분]) 함께 표시
          </label>
        </div>

        {/* 💖 Phase 17: AI 컴패니언 관계·성장·기억 설정 */}
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            background: "rgba(244, 63, 94, 0.05)",
            border: "1px solid rgba(244, 63, 94, 0.15)",
          }}
        >
          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fda4af", marginBottom: "6px" }}>
            💖 AI 컴패니언 관계성 & 기억 관리 (Phase 17)
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--muted, #94a3b8)", marginBottom: "10px", lineHeight: 1.4 }}>
            캐릭터별 호감도와 계정 공통 업무 성장 분석을 활성화합니다. 선호 기억은 언제든 확인·수정·삭제할 수 있습니다.
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                id="chk-companion-growth"
                type="checkbox"
                defaultChecked={true}
                onChange={(e) => {
                  void fetch("/api/companion/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: e.target.checked }),
                  });
                }}
              />
              <label htmlFor="chk-companion-growth" style={{ fontSize: "0.82rem", cursor: "pointer" }}>
                컴패니언 관계성 & 업무 성장 기억 기능 켜기
              </label>
            </div>
            <button
              type="button"
              onClick={() => setShowMemoryModal(true)}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                background: "rgba(244, 63, 94, 0.15)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "#fda4af",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🧠 장기 기억 관리
            </button>
          </div>

          {/* 4축 주간 성장 리포트 카드 */}
          <div style={{ marginTop: "14px" }}>
            <CompanionGrowthCard personaId={config.presetId || "karina"} />
          </div>
        </div>

        {/* 장기 기억 관리 모달 */}
        <CompanionMemoryModal
          isOpen={showMemoryModal}
          onClose={() => setShowMemoryModal(false)}
        />
      </div>
    </section>
  );
}
