"use client";

import React, { useState, useEffect, useRef } from "react";
import type {
  CanvasDocument,
  CanvasDocType,
  CanvasAiAction,
  CanvasExtractedTask,
} from "@/lib/canvas/types";
import { transformCanvasContentClient } from "@/lib/ai/canvasAi";
import { checkChromeCanaryAiStatus, ChromeCanaryAiStatus } from "@/lib/ai/chromeCanaryAi";
import MarkdownLite from "../markdownLite";
import { HtmlInCanvasView } from "./HtmlInCanvasView";
import { UiIcon } from "../UiIcon";
import styles from "../../page.module.css";

interface Props {
  document: CanvasDocument;
  onChangeDocument: (doc: CanvasDocument) => void;
  onClose: () => void;
  onRegisterTasks?: (tasks: CanvasExtractedTask[]) => void;
  personaName?: string;
  /** 편집기와 미리보기를 좌우가 아니라 상하로 배치한다 (모바일/축소 모드) */
  stacked?: boolean;
  /** 브라우저의 별도 창에서 단독으로 표시되는 상태 */
  popout?: boolean;
  /** 별도 창과 현재 창을 오가는 전환 (지원되지 않는 환경에서는 생략) */
  onTogglePopout?: () => void;
}

type ViewMode = "edit" | "preview" | "split" | "3d";

const DOC_TYPE_LABELS: Record<CanvasDocType, string> = {
  doc: "📄 일반 문서",
  report: "📊 보고서",
  email: "✉️ 이메일",
  meeting_note: "📝 회의록",
  checklist: "✅ 체크리스트",
  code: "💻 코드/스크립트",
};

export function AiCanvasPanel({
  document,
  onChangeDocument,
  onClose,
  onRegisterTasks,
  personaName = "AI 바리스타",
  stacked = false,
  popout = false,
  onTogglePopout,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  /** 사용자가 토글하는 분할 뷰 레이아웃 방향 (true = 상하, false = 좌우 나란히) */
  const [splitStacked, setSplitStacked] = useState(stacked);
  const [canaryStatus, setCanaryStatus] = useState<ChromeCanaryAiStatus | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [extractedTasks, setExtractedTasks] = useState<CanvasExtractedTask[] | null>(null);
  const [copyNotice, setCopyNotice] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. 크롬 카나리 Built-in AI 지원 여부 진단
  useEffect(() => {
    void checkChromeCanaryAiStatus().then(setCanaryStatus);
  }, []);

  // 2. 실행 취소 / 다시 실행 히스토리 관리
  const updateContentWithHistory = (newContent: string) => {
    const history = document.history || [document.content];
    const currentIndex = document.historyIndex ?? history.length - 1;
    const nextHistory = [...history.slice(0, currentIndex + 1), newContent];

    onChangeDocument({
      ...document,
      content: newContent,
      updatedAt: new Date().toISOString(),
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
    });
  };

  const handleUndo = () => {
    const history = document.history || [];
    const currentIndex = document.historyIndex ?? history.length - 1;
    if (currentIndex > 0) {
      const nextIndex = currentIndex - 1;
      onChangeDocument({
        ...document,
        content: history[nextIndex],
        historyIndex: nextIndex,
      });
    }
  };

  const handleRedo = () => {
    const history = document.history || [];
    const currentIndex = document.historyIndex ?? history.length - 1;
    if (currentIndex < history.length - 1) {
      const nextIndex = currentIndex + 1;
      onChangeDocument({
        ...document,
        content: history[nextIndex],
        historyIndex: nextIndex,
      });
    }
  };

  const canUndo = (document.historyIndex ?? 0) > 0;
  const canRedo =
    document.history &&
    (document.historyIndex ?? 0) < document.history.length - 1;

  // 3. AI 빠른 다듬기 액션 실행
  const handleRunAiAction = async (action: CanvasAiAction, promptOverride?: string) => {
    if (aiBusy) return;
    setAiBusy(true);

    try {
      const result = await transformCanvasContentClient({
        content: document.content,
        action,
        customPrompt: promptOverride || customPrompt,
        docTitle: document.title,
        docType: document.type,
        personaName,
      });

      if (action === "extract_tasks" && result.extractedTasks && result.extractedTasks.length > 0) {
        setExtractedTasks(result.extractedTasks);
      } else if (result.content && result.content !== document.content) {
        updateContentWithHistory(result.content);
      }
    } catch (e) {
      console.error("[AiCanvas] Transform error:", e);
    } finally {
      setAiBusy(false);
      setCustomPrompt("");
    }
  };

  // 4. 통계 계산 (글자수, 단어수, 읽는 시간)
  const charCount = document.content.length;
  const wordCount = document.content.trim() ? document.content.trim().split(/\s+/).length : 0;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 180));

  // 5. 내보내기 (클립보드 복사 & 마크다운 파일 다운로드)
  const handleCopy = () => {
    navigator.clipboard.writeText(document.content);
    setCopyNotice(true);
    setTimeout(() => setCopyNotice(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([document.content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.title.replace(/[\\/:*?"<>|]/g, "_") || "canvas_document"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDocTypeChange = (type: CanvasDocType) => {
    onChangeDocument({ ...document, type });
  };

  return (
    <div className={`${styles.canvasContainer} ${popout ? styles.canvasContainerPopout : ""}`}>
      {/* 캔버스 상단 헤더 */}
      <header className={styles.canvasHeader}>
        <div className={styles.canvasHeaderLeft}>
          <div className={styles.canvasIconBadge}>
            <UiIcon name="assistant" size={17} />
          </div>
          <input
            className={styles.canvasTitleInput}
            value={document.title}
            onChange={(e) => onChangeDocument({ ...document, title: e.target.value })}
            placeholder="문서 제목을 입력하세요"
            aria-label="캔버스 문서 제목"
          />
          <select
            className={styles.canvasTypeSelect}
            value={document.type}
            onChange={(e) => handleDocTypeChange(e.target.value as CanvasDocType)}
            aria-label="문서 종류"
          >
            <option value="report">📊 보고서</option>
            <option value="doc">📄 일반 문서</option>
            <option value="email">✉️ 이메일 초안</option>
            <option value="meeting_note">📝 회의록</option>
            <option value="checklist">✅ 체크리스트</option>
            <option value="code">💻 코드/스크립트</option>
          </select>
        </div>

        <div className={styles.canvasHeaderRight}>
          {/* Chrome Canary On-Device AI 감지 뱃지 */}
          <div
            className={`${styles.canaryBadge} ${
              canaryStatus?.supported && canaryStatus.status === "ready"
                ? styles.canaryBadgeActive
                : styles.canaryBadgeCloud
            }`}
            title={canaryStatus?.message || "AI 엔진 상태"}
          >
            <span className={styles.canaryDot} />
            {canaryStatus?.supported && canaryStatus.status === "ready"
              ? "Chrome Canary 온디바이스 (0ms Nano)"
              : "Gemini Cloud AI"}
          </div>

          {/* 실행 취소 / 다시 실행 */}
          <div className={styles.canvasUndoGroup}>
            <button
              type="button"
              className={styles.canvasToolBtn}
              onClick={handleUndo}
              disabled={!canUndo || aiBusy}
              title="실행 취소 (Ctrl+Z)"
              aria-label="실행 취소"
            >
              ↩
            </button>
            <button
              type="button"
              className={styles.canvasToolBtn}
              onClick={handleRedo}
              disabled={!canRedo || aiBusy}
              title="다시 실행 (Ctrl+Y)"
              aria-label="다시 실행"
            >
              ↪
            </button>
          </div>

          {/* 뷰 모드 전환 버튼 */}
          <div className={styles.canvasModeGroup} role="group" aria-label="캔버스 보기 모드">
            <button
              type="button"
              className={`${styles.canvasModeBtn} ${viewMode === "edit" ? styles.canvasModeBtnActive : ""}`}
              onClick={() => setViewMode("edit")}
              title="편집 전용 모드"
            >
              편집
            </button>
            <button
              type="button"
              className={`${styles.canvasModeBtn} ${viewMode === "split" ? styles.canvasModeBtnActive : ""}`}
              onClick={() => {
                if (viewMode === "split") {
                  setSplitStacked((prev) => !prev);
                } else {
                  setViewMode("split");
                }
              }}
              title={splitStacked ? "상하 분할 보기 (클릭하면 나란히로 전환)" : "나란히 보기 (클릭하면 상하로 전환)"}
            >
              {splitStacked ? "상하" : "나란히"}
            </button>
            <button
              type="button"
              className={`${styles.canvasModeBtn} ${viewMode === "preview" ? styles.canvasModeBtnActive : ""}`}
              onClick={() => setViewMode("preview")}
              title="미리보기 모드"
            >
              미리보기
            </button>
            <button
              type="button"
              className={`${styles.canvasModeBtn} ${viewMode === "3d" ? styles.canvasModeBtnActive : ""}`}
              onClick={() => setViewMode("3d")}
              title="HTML in Canvas 3D 인터랙티브 뷰"
            >
              🎨 3D 인터랙티브
            </button>
          </div>

          {/* 복사 & 다운로드 & 닫기 */}
          <button
            type="button"
            className={styles.canvasToolBtn}
            onClick={handleCopy}
            title="본문 복사"
            aria-label="본문 클립보드 복사"
          >
            {copyNotice ? "✓ 복사됨" : "📋 복사"}
          </button>
          <button
            type="button"
            className={styles.canvasToolBtn}
            onClick={handleDownload}
            title="마크다운 다운로드 (.md)"
            aria-label="마크다운 파일 다운로드"
          >
            💾 저장
          </button>
          <div className={styles.canvasWindowActions}>
            {onTogglePopout && (
              <button
                type="button"
                className={styles.canvasActionIconBtn}
                onClick={onTogglePopout}
                title={popout ? "원래 화면으로 되돌리기 (창 합치기)" : "별도 브라우저 창 팝업"}
                aria-label={popout ? "원래 화면으로 되돌리기 (창 합치기)" : "별도 브라우저 창 팝업"}
                data-tooltip={popout ? "창 합치기" : "별도 창 팝업"}
              >
                <UiIcon name="popup" size={16} />
              </button>
            )}
            <button
              type="button"
              className={styles.canvasCloseBtn}
              onClick={onClose}
              title={popout ? "캔버스 창 닫기" : "캔버스 닫기"}
              aria-label={popout ? "캔버스 창 닫기" : "캔버스 닫기"}
              data-tooltip="캔버스 닫기"
            >
              <UiIcon name="close" size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 통계 바 */}
      <div className={styles.canvasStatsBar}>
        <span>{charCount.toLocaleString()} 글자</span>
        <span>·</span>
        <span>{wordCount.toLocaleString()} 단어</span>
        <span>·</span>
        <span>예상 읽기 시간 약 {readTimeMinutes}분</span>
        {aiBusy && (
          <span className={styles.canvasAiStatusTag}>
            ⚡ {personaName}가 문서를 다듬고 있습니다…
          </span>
        )}
      </div>

      {/* 메인 에디터 및 미리보기 영역 */}
      <div className={`${styles.canvasWorkspaceBody} ${splitStacked ? styles.canvasWorkspaceBodyStacked : ""}`}>
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            className={`${styles.canvasEditorPane} ${
              viewMode === "split" ? (splitStacked ? styles.canvasPaneSplitStacked : styles.canvasPaneSplit) : ""
            }`}
          >
            <textarea
              ref={textareaRef}
              className={styles.canvasTextarea}
              value={document.content}
              onChange={(e) => updateContentWithHistory(e.target.value)}
              placeholder="마크다운 형식으로 자유롭게 문서를 작성하거나 AI에게 다듬기를 요청하세요..."
              disabled={aiBusy}
              aria-label="캔버스 마크다운 편집기"
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div
            className={`${styles.canvasPreviewPane} ${
              viewMode === "split" ? (splitStacked ? styles.canvasPaneSplitStacked : styles.canvasPaneSplit) : ""
            }`}
            aria-label="캔버스 실시간 마크다운 미리보기"
          >
            {document.content.trim() ? (
              <MarkdownLite text={document.content} />
            ) : (
              <div className={styles.canvasEmptyPreview}>
                작성된 내용이 여기에 실시간 마크다운으로 렌더링됩니다.
              </div>
            )}
          </div>
        )}

        {viewMode === "3d" && (
          <HtmlInCanvasView
            content={document.content}
            title={document.title}
            docType={DOC_TYPE_LABELS[document.type] || "문서"}
          />
        )}
      </div>

      {/* 🪄 AI 빠른 다듬기 플로팅 툴바 */}
      <footer className={styles.canvasAiFooter}>
        <div className={styles.canvasAiActionGroup}>
          <span className={styles.canvasAiActionLabel}>🪄 AI 다듬기</span>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("shorten")}
            disabled={aiBusy || !document.content.trim()}
          >
            ✂️ 압축/축약
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("expand")}
            disabled={aiBusy || !document.content.trim()}
          >
            ➕ 상세 확장
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("tone_karina")}
            disabled={aiBusy || !document.content.trim()}
          >
            🌟 카리나 톤
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("tone_kim")}
            disabled={aiBusy || !document.content.trim()}
          >
            💼 김부장 톤
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("tone_ontime")}
            disabled={aiBusy || !document.content.trim()}
          >
            ⚡ 칼퇴봇 톤
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("tone_chaerin" as any)}
            disabled={aiBusy || !document.content.trim()}
          >
            🃏 채린이 톤
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("fix_grammar")}
            disabled={aiBusy || !document.content.trim()}
          >
            📝 맞춤법 교정
          </button>
          <button
            type="button"
            className={styles.canvasAiChip}
            onClick={() => handleRunAiAction("to_table")}
            disabled={aiBusy || !document.content.trim()}
          >
            📊 표 변환
          </button>
          <button
            type="button"
            className={`${styles.canvasAiChip} ${styles.canvasAiChipHighlight}`}
            onClick={() => handleRunAiAction("extract_tasks")}
            disabled={aiBusy || !document.content.trim()}
          >
            ✅ 할 일 추출
          </button>
        </div>

        {/* 직접 AI 지시 입력 바 */}
        <form
          className={styles.canvasPromptForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (customPrompt.trim()) {
              void handleRunAiAction("custom", customPrompt.trim());
            }
          }}
        >
          <input
            className={styles.canvasPromptInput}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder='AI에게 직접 지시 (예: "결론 부분을 3줄 요약으로 강조해줘")'
            disabled={aiBusy}
            aria-label="AI 캔버스 커스텀 프롬프트"
          />
          <button
            type="submit"
            className={styles.canvasPromptSubmitBtn}
            disabled={aiBusy || !customPrompt.trim()}
          >
            적용
          </button>
        </form>
      </footer>

      {/* 할 일 추출 결과 오버레이 모달 */}
      {extractedTasks && (
        <div className={styles.canvasModalBackdrop} onClick={() => setExtractedTasks(null)}>
          <div className={styles.canvasModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.canvasModalHeader}>
              <h3>✅ 추출된 액션 아이템 ({extractedTasks.length}건)</h3>
              <button
                type="button"
                className={styles.canvasModalCloseBtn}
                onClick={() => setExtractedTasks(null)}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: "0.83rem", color: "var(--text-dim)", margin: "4px 0 12px" }}>
              본문에서 추출된 할 일들을 선택하여 메인 대시보드 <b>오늘의 행동 지침</b>에 바로 등록합니다.
            </p>
            <div className={styles.canvasTaskList}>
              {extractedTasks.map((t, idx) => (
                <label key={t.id || idx} className={styles.canvasTaskItem}>
                  <input
                    type="checkbox"
                    checked={t.selected !== false}
                    onChange={(e) => {
                      const next = extractedTasks.map((item, i) =>
                        i === idx ? { ...item, selected: e.target.checked } : item
                      );
                      setExtractedTasks(next);
                    }}
                  />
                  <div className={styles.canvasTaskContent}>
                    <span className={styles.canvasTaskTitle}>{t.title}</span>
                    <span className={styles.canvasTaskMeta}>
                      ⏱️ 예상 {t.estimatedMinutes || 30}분 · {t.category === "urgent" ? "긴급" : "일반 업무"}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className={styles.canvasModalFooter}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setExtractedTasks(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  const selectedTasks = extractedTasks.filter((t) => t.selected !== false);
                  if (onRegisterTasks && selectedTasks.length > 0) {
                    onRegisterTasks(selectedTasks);
                  }
                  setExtractedTasks(null);
                }}
              >
                선택한 {extractedTasks.filter((t) => t.selected !== false).length}건 오늘 업무에 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
