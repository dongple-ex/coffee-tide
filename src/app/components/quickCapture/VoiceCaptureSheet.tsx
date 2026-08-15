"use client";

import React, { useState } from "react";
import { useVoiceRecorder } from "@/app/hooks/useVoiceRecorder";
import type { UnifiedData } from "@/lib/types/unified";
import styles from "./QuickCapture.module.css";

interface VoiceCaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
  onStoredVoiceItem?: (item: UnifiedData, warnings: string[]) => void;
  targetMode: "task" | "note" | "expense";
}

export const VoiceCaptureSheet: React.FC<VoiceCaptureSheetProps> = ({
  isOpen,
  onClose,
  onTranscript,
  onStoredVoiceItem,
  targetMode,
}) => {
  const {
    isRecording,
    recordingTime,
    audioBlob,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  } = useVoiceRecorder();

  const [retainOriginal, setRetainOriginal] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStart = async () => {
    setErrorMessage(null);
    const ok = await startRecording();
    if (!ok) {
      setErrorMessage("마이크 권한을 허용해 주세요.");
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("mode", targetMode === "note" ? "meeting" : "dictation");
        formData.append("retainOriginal", String(retainOriginal));
        formData.append("durationSeconds", String(recordingTime));

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "음성 전사에 실패했습니다.");
      }

      const data = await res.json();
      if (data.transcript) {
        if (data.item && onStoredVoiceItem) {
          onStoredVoiceItem(data.item, Array.isArray(data.warnings) ? data.warnings : []);
        }
        onTranscript(data.transcript);
        reset();
        onClose();
      } else {
        setErrorMessage("인식된 음성 텍스트가 없습니다.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "전사 오류 발생");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleClose = () => {
    if (isRecording) {
      cancelRecording();
    }
    reset();
    onClose();
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text-main, #f4f4f5)" }}>
            음성으로 {targetMode === "task" ? "업무 추가" : targetMode === "note" ? "메모 작성" : "비용 입력"}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            style={{ background: "transparent", border: "none", color: "#a1a1aa", fontSize: "1.1rem", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        <div style={{ textAlign: "center", padding: "16px 0" }}>
          {isRecording && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#ef4444", fontFamily: "monospace" }}>
                {formatDuration(recordingTime)}
              </div>
              <p style={{ fontSize: "0.8rem", color: "#a1a1aa", marginTop: 4 }}>
                녹음 중입니다... 말씀해 주세요.
              </p>
            </div>
          )}

          {!isRecording && audioBlob && (
            <div style={{ marginBottom: 12 }}>
              <span className={`${styles.badge} ${styles.badgeInfo}`}>
                녹음 완료 ({formatDuration(recordingTime)})
              </span>
              <p style={{ fontSize: "0.8rem", color: "#a1a1aa", marginTop: 6 }}>
                AI가 음성을 텍스트로 변환합니다.
              </p>
            </div>
          )}

          {errorMessage && (
            <div style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: 10 }}>
              {errorMessage}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 10 }}>
            {!isRecording && !audioBlob && (
              <button
                type="button"
                onClick={handleStart}
                className={styles.submitButton}
                style={{ minWidth: 140 }}
              >
                🎤 녹음 시작
              </button>
            )}

            {isRecording && (
              <button
                type="button"
                onClick={() => void stopRecording()}
                className={styles.submitButton}
                style={{ background: "#dc2626", minWidth: 140 }}
              >
                ⏹ 녹음 완료
              </button>
            )}

            {!isRecording && audioBlob && (
              <>
                <button
                  type="button"
                  onClick={reset}
                  disabled={isTranscribing}
                  className={styles.secondaryButton}
                >
                  다시 녹음
                </button>
                <button
                  type="button"
                  onClick={handleTranscribe}
                  disabled={isTranscribing}
                  className={styles.submitButton}
                >
                  {isTranscribing ? "전사 중..." : "텍스트로 변환"}
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border-subtle, rgba(63, 63, 70, 0.4))", paddingTop: 10, marginTop: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: "0.72rem", lineHeight: 1.45, color: "#71717a" }}>
            텍스트 변환을 누르면 오디오가 Gemini에 전송됩니다. 원본 보관을 끄면 전사 후 CoffeeTide 저장소에 음성 파일이나 숨은 업무를 만들지 않습니다.
          </p>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={retainOriginal}
              onChange={(e) => setRetainOriginal(e.target.checked)}
              disabled={isTranscribing}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.78rem" }}>음성 원본 파일도 비공개 저장소에 보관</span>
          </label>
        </div>
      </div>
    </div>
  );
};
