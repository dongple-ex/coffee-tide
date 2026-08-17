"use client";

import React, { useState } from "react";
import styles from "../QuickCapture.module.css";
import { UiIcon } from "../../UiIcon";
import CafeWait from "../../cafeWait";

export interface SpeakerMapping {
  label: string; // "A", "B", "C"
  displayName: string;
}

export interface MeetingAnalysisContext {
  topic: string;
  purpose: string;
  speakers: SpeakerMapping[];
  outputPreset: "standard" | "executive" | "decisions" | "actions";
}

interface MeetingAnalysisSheetProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: string;
  onAnalyze: (context: MeetingAnalysisContext) => Promise<void>;
  isAnalyzing: boolean;
}

export const MeetingAnalysisSheet: React.FC<MeetingAnalysisSheetProps> = ({
  isOpen,
  onClose,
  transcript,
  onAnalyze,
  isAnalyzing,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outputPreset, setOutputPreset] = useState<"standard" | "executive" | "decisions" | "actions">("standard");
  const [speakers, setSpeakers] = useState<SpeakerMapping[]>([
    { label: "A", displayName: "" },
    { label: "B", displayName: "" },
  ]);

  if (!isOpen) return null;

  const handleSpeakerChange = (index: number, val: string) => {
    const newSpeakers = [...speakers];
    newSpeakers[index].displayName = val;
    setSpeakers(newSpeakers);
  };

  const handleAddSpeaker = () => {
    const nextLabel = String.fromCharCode(65 + speakers.length); // C, D...
    setSpeakers([...speakers, { label: nextLabel, displayName: "" }]);
  };

  const handleNext = () => {
    if (!topic.trim()) return;
    setStep(2);
  };

  const handleExecute = async () => {
    await onAnalyze({
      topic,
      purpose,
      speakers: speakers.filter(s => s.displayName.trim() !== ""),
      outputPreset,
    });
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: 500, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
            {step === 1 ? "회의록 정리 (맥락 입력)" : "분석 직전 확인"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing}
            style={{ background: "transparent", border: "none", color: "#a1a1aa", fontSize: "1.2rem", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {step === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#a1a1aa", marginBottom: 6 }}>회의 주제 (필수)</label>
              <input
                type="text"
                className={styles.input}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: Q3 마케팅 캠페인 기획 회의"
                disabled={isAnalyzing}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#a1a1aa", marginBottom: 6 }}>회의 목적 (선택)</label>
              <input
                type="text"
                className={styles.input}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="예: 예산안 확정 및 매체 믹스 결정"
                disabled={isAnalyzing}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#a1a1aa", marginBottom: 6 }}>결과 형식</label>
              <select
                className={styles.input}
                value={outputPreset}
                onChange={(e) => setOutputPreset(e.target.value as any)}
                disabled={isAnalyzing}
                style={{ appearance: "auto" }}
              >
                <option value="standard">기본 회의록 (주제별 요약 및 할 일)</option>
                <option value="executive">경영진 요약 (핵심만 간결하게)</option>
                <option value="decisions">결정사항 중심</option>
                <option value="actions">할 일(Action Item) 중심</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#a1a1aa", marginBottom: 6 }}>화자 보정 (선택)</label>
              {speakers.map((sp, idx) => (
                <div key={sp.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: "0.85rem", color: "#71717a", width: 40 }}>화자 {sp.label}</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={sp.displayName}
                    onChange={(e) => handleSpeakerChange(idx, e.target.value)}
                    placeholder="실제 이름 입력 (예: 홍길동)"
                    disabled={isAnalyzing}
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddSpeaker}
                style={{ background: "transparent", border: "none", color: "#6366f1", fontSize: "0.85rem", cursor: "pointer", padding: 0 }}
                disabled={isAnalyzing}
              >
                + 화자 추가
              </button>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={handleNext}
                disabled={!topic.trim() || isAnalyzing}
                className={styles.submitButton}
                style={{ width: "100%", padding: 12 }}
              >
                다음 단계
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
            <div style={{ background: "var(--card-hover, rgba(255,255,255,0.03))", padding: 16, borderRadius: 8, border: "1px solid var(--border)" }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: "0.9rem" }}>전송 데이터 확인</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem", color: "#a1a1aa", lineHeight: 1.6 }}>
                <li><strong>회의 주제:</strong> {topic}</li>
                {purpose && <li><strong>회의 목적:</strong> {purpose}</li>}
                <li><strong>전사 텍스트:</strong> {transcript.length}자 (Gemini AI로 전송)</li>
                <li><strong>결과 저장 위치:</strong> CoffeeTide DB 및 개인 Google Drive</li>
              </ul>
              <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", borderRadius: 6, fontSize: "0.8rem", lineHeight: 1.5 }}>
                ⚠️ 무료 Gemini API를 사용하므로, 기밀/민감 정보가 포함되지 않았는지 주의해 주세요. (Google의 정책에 따라 제품 개선에 사용될 수 있습니다)
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isAnalyzing}
                className={styles.secondaryButton}
                style={{ flex: 1, padding: 12 }}
              >
                이전
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={isAnalyzing}
                className={styles.submitButton}
                style={{ flex: 2, padding: 12 }}
              >
                {isAnalyzing ? <CafeWait steps={["AI 분석 중..."]} interval={1000} /> : "명시적으로 AI 실행"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
