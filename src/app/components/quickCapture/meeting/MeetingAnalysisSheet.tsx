"use client";

import React, { useState } from "react";
import styles from "../QuickCapture.module.css";
import CafeWait from "../../cafeWait";

import { ActionItem, SaveTasksResult } from "./meetingTasks";
import { generateId } from "@/lib/ids";

export interface SpeakerMapping {
  label: string; // "A", "B", "C"
  displayName: string;
}

export type { ActionItem, SaveTasksResult };

export interface MeetingAnalysisResult {
  overview: string;
  topicSummaries: { topic: string; summary: string }[];
  decisions: { decision: string; reason: string }[];
  actionItems: ActionItem[];
  unresolvedQuestions: string[];
}

export interface MeetingAnalysisContext {
  topic: string;
  purpose: string;
  speakers: SpeakerMapping[];
  references: string[];
}

interface MeetingAnalysisSheetProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: string;
  onAnalyze: (context: MeetingAnalysisContext) => Promise<MeetingAnalysisResult | null>;
  onSaveToDrive: (context: MeetingAnalysisContext, result: MeetingAnalysisResult) => Promise<boolean>;
  onSaveTasks: (tasks: ActionItem[]) => Promise<SaveTasksResult>;
  isAnalyzing: boolean;
}

export const MeetingAnalysisSheet: React.FC<MeetingAnalysisSheetProps> = ({
  isOpen,
  onClose,
  transcript,
  onAnalyze,
  onSaveToDrive,
  onSaveTasks,
  isAnalyzing,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState("");
  const [purpose, setPurpose] = useState("");
  const [speakers, setSpeakers] = useState<SpeakerMapping[]>([
    { label: "A", displayName: "" },
    { label: "B", displayName: "" },
  ]);
  const [references, setReferences] = useState<string[]>([]);

  // Consent
  const [consentGemini, setConsentGemini] = useState(false);
  const [consentDrive, setConsentDrive] = useState(false);

  // Result
  const [result, setResult] = useState<MeetingAnalysisResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (!consentGemini || !consentDrive) return;
    const res = await onAnalyze({
      topic,
      purpose,
      speakers: speakers.filter(s => s.displayName.trim() !== ""),
      references,
    });
    if (res) {
      // 초기 선택 상태 및 고유 clientId 1회 부여
      res.actionItems = (res.actionItems || []).map(a => ({
        ...a,
        clientId: a.clientId || generateId("item"),
        selected: true,
        saved: false,
      }));
      setResult(res);
      setStep(3);
    }
  };

  const handleFinalSave = async () => {
    if (!result) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const context = {
        topic,
        purpose,
        speakers: speakers.filter(s => s.displayName.trim() !== ""),
        references,
      };

      const savedToDrive = await onSaveToDrive(context, result);
      if (!savedToDrive) {
        setSaveError("Google Drive 저장에 실패했습니다. (인증이 필요할 수 있습니다)");
        setIsSaving(false);
        return;
      }

      // 이미 저장 완료된 항목은 제외하고 선택된 항목만 저장 (재시도 시 중복 방지)
      const tasksToSave = (result.actionItems || []).filter(a => a.selected && !a.saved);
      if (tasksToSave.length > 0) {
        const taskSaveResult = await onSaveTasks(tasksToSave);

        // 개별 할 일 상태 갱신 (clientId 기준)
        const updatedActionItems = (result.actionItems || []).map(item => {
          if (taskSaveResult.saved.some(s => s.clientId === item.clientId)) {
            return { ...item, saved: true, error: undefined, selected: false };
          }
          const failInfo = taskSaveResult.failed.find(f => f.clientId === item.clientId);
          if (failInfo) {
            return { ...item, saved: false, error: failInfo.error, selected: true };
          }
          return item;
        });

        setResult({ ...result, actionItems: updatedActionItems });

        if (taskSaveResult.failed.length > 0) {
          const failedSummary = taskSaveResult.failed.map(f => `"${f.task}" (${f.error})`).join(", ");
          if (taskSaveResult.saved.length > 0) {
            setSaveError(`일부 업무 저장에 실패했습니다: ${failedSummary}`);
          } else {
            setSaveError(`업무 저장에 실패했습니다: ${failedSummary}`);
          }
          setIsSaving(false);
          return; // 실패 항목이 있으면 화면 유지
        }
      }

      // 모든 항목 저장 성공 시에만 닫기 및 초기화
      setStep(1);
      setResult(null);
      setConsentGemini(false);
      setConsentDrive(false);
      setTopic("");
      setPurpose("");
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: 600, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
            {step === 1 ? "회의록 정리 (맥락 입력)" : step === 2 ? "분석 직전 확인" : "AI 분석 결과 검토"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing || isSaving}
            style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: "1.2rem", cursor: "pointer", padding: "4px 8px" }}
          >
            ✕
          </button>
        </div>

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>회의 주제 (필수)</label>
              <input
                type="text"
                className={styles.textInput}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: Q3 마케팅 캠페인 기획 회의"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>회의 목적 (선택)</label>
              <input
                type="text"
                className={styles.textInput}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="예: 예산안 확정 및 매체 믹스 결정"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>화자 보정 (선택)</label>
              {speakers.map((sp, idx) => (
                <div key={sp.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", width: 48, fontWeight: 600, flexShrink: 0 }}>화자 {sp.label}</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={sp.displayName}
                    onChange={(e) => handleSpeakerChange(idx, e.target.value)}
                    placeholder="실제 이름 입력 (예: 홍길동)"
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddSpeaker}
                style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", padding: "4px 0" }}
              >
                + 화자 추가
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>참고자료</label>
              <textarea
                className={styles.textArea}
                value={references.join("\n\n")}
                onChange={(e) => setReferences(e.target.value.split("\n\n").filter(Boolean))}
                placeholder="참고할 회의 자료 텍스트를 붙여넣으세요 (Google Drive 파일 선택 연동 예정)"
                style={{ minHeight: 90 }}
              />
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={handleNext}
                disabled={!topic.trim()}
                className={styles.submitButton}
                style={{ width: "100%", padding: 12 }}
              >
                다음 단계
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
            <div style={{ background: "var(--card-hover, var(--bg))", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: "0.9rem", color: "var(--text)" }}>전송 데이터 및 저장 위치 확인</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
                <li><strong style={{ color: "var(--text)" }}>회의 주제:</strong> {topic}</li>
                <li><strong style={{ color: "var(--text)" }}>전사 텍스트:</strong> {transcript.length}자</li>
                <li><strong style={{ color: "var(--text)" }}>참고자료:</strong> {references.length}건</li>
              </ul>

              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: "0.85rem", color: "var(--text)" }}>
                  <input type="checkbox" checked={consentGemini} onChange={e => setConsentGemini(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>[필수] 구글 Gemini API로 전사 및 참고자료를 전송하여 회의록을 분석하는 것에 동의합니다.</span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: "0.85rem", color: "var(--text)" }}>
                  <input type="checkbox" checked={consentDrive} onChange={e => setConsentDrive(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>[필수] 분석된 회의록 원본과 오디오는 CoffeeTide 서버가 아닌 내 개인 Google Drive에만 저장되는 것을 이해합니다.</span>
                </label>
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
                disabled={isAnalyzing || !consentGemini || !consentDrive}
                className={styles.submitButton}
                style={{ flex: 2, padding: 12 }}
              >
                {isAnalyzing ? <CafeWait steps={["AI 분석 중..."]} interval={1000} /> : "AI 분석 실행"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
            <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-hover, var(--bg))" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: "var(--text)" }}>개요</h4>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                {result.overview}
              </p>
            </div>

            {result.decisions && result.decisions.length > 0 && (
              <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-hover, var(--bg))" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: "var(--text)" }}>결정사항</h4>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem", color: "var(--text-dim)" }}>
                  {result.decisions.map((d, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong style={{ color: "var(--text)" }}>{d.decision}</strong> <span style={{ color: "var(--text-dim)" }}>- {d.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.actionItems && result.actionItems.length > 0 && (
              <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-hover, var(--bg))" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: "var(--text)" }}>할 일 후보 (등록할 항목 선택)</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.actionItems.map((a, i) => (
                    <div key={a.clientId || i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          cursor: a.saved ? "default" : "pointer",
                          fontSize: "0.85rem",
                          color: a.saved ? "var(--text-dim)" : "var(--text)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={a.saved ? false : Boolean(a.selected)}
                          disabled={a.saved || isSaving}
                          onChange={(e) => {
                            if (a.saved) return;
                            const newResult = { ...result };
                            newResult.actionItems[i].selected = e.target.checked;
                            setResult(newResult);
                          }}
                          style={{ marginTop: 2 }}
                        />
                        <div style={{ flex: 1 }}>
                          <span style={{ textDecoration: a.saved ? "line-through" : "none" }}>
                            <strong>{a.task}</strong> (담당: {a.assignee || "미지정"}, 기한: {a.dueDate || "미지정"})
                          </span>
                          {a.saved && (
                            <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--ok, #22c55e)", fontWeight: 600 }}>
                              ✓ 등록 완료
                            </span>
                          )}
                        </div>
                      </label>
                      {a.error && !a.saved && (
                        <div style={{ marginLeft: 24, fontSize: "0.78rem", color: "var(--danger, #ef4444)" }}>
                          저장 실패: {a.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {saveError && (
              <div
                style={{
                  color: "var(--danger, #ef4444)",
                  fontSize: "0.85rem",
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  lineHeight: 1.4,
                }}
              >
                {saveError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleFinalSave}
                disabled={isSaving}
                className={styles.submitButton}
                style={{ width: "100%", padding: 12 }}
              >
                {isSaving ? (
                  <CafeWait steps={["저장 진행 중..."]} interval={1000} />
                ) : result.actionItems?.some((a) => a.error && !a.saved) ? (
                  "실패 항목 재시도"
                ) : (
                  "최종 확정 (Drive 저장 및 업무 등록)"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
