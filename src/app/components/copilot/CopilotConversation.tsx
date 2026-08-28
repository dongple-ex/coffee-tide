"use client";

import React, { RefObject } from "react";
import { buildQaPairs, CopilotMessage } from "@/lib/copilotPairs";
import CafeWait from "../cafeWait";
import MarkdownLite from "../markdownLite";
import { EvidencePanel } from "./EvidencePanel";
import { UiIcon } from "../UiIcon";
import styles from "../../page.module.css";

interface Props {
  bodyRef: RefObject<HTMLDivElement | null>;
  messages: CopilotMessage[];
  busy: boolean;
  /** 대기 중 표시할 카페 연출 문구 */
  waitSteps: string[];
  /** 설정에서 Gemini Spark 자율 수신을 활성화했는지 여부 */
  sparkEnabled: boolean;
  /** 최신 Spark 브리핑을 서버에서 확인 중인지 여부 */
  sparkLoading: boolean;
  /** 질문 없이 서버에서 수신한 최근 24시간 Spark 브리핑 */
  sparkBriefing?: string | null;
  /** 표시할 업무가 하나도 없을 때 안내 문구를 보강한다 */
  hasItems: boolean;
  /** AI 호칭/페르소나 이름 */
  baristaName?: string;
  expandedKeys: Set<string>;
  unreadKeys: Set<string>;
  onToggleExpand: (pairId: string) => void;
  onCompleteItem: (id: string) => void;
}

export function CopilotConversation({
  bodyRef,
  messages,
  busy,
  waitSteps,
  sparkEnabled,
  sparkLoading,
  sparkBriefing,
  hasItems,
  baristaName = "AI 바리스타",
  expandedKeys,
  unreadKeys,
  onToggleExpand,
  onCompleteItem,
}: Props) {
  const pairs = buildQaPairs(messages);

  return (
    <div className={styles.copilotBody} ref={bodyRef}>
      {sparkEnabled && (
        <section className={styles.sparkAutonomousBriefing} aria-label="Gemini Spark 자율 수신 브리핑">
          <div className={styles.sparkAutonomousBadge}><UiIcon name="spark" size={15} />Gemini Spark 24시간 자율 비서</div>
          {sparkLoading ? (
            <p className={styles.sparkAutonomousEmpty}>최신 Gemini Spark 브리핑을 확인하고 있습니다…</p>
          ) : sparkBriefing ? (
            <MarkdownLite text={sparkBriefing} />
          ) : (
            <p className={styles.sparkAutonomousEmpty}>
              최근 24시간 동안 수신된 Gemini Spark 브리핑이 없습니다.
            </p>
          )}
        </section>
      )}
      {pairs.length === 0 ? (
        <div className={styles.msgHint}>
          “오늘 뭐 해야 해?”라고 {baristaName}에게 편하게 물어보세요.
          {!hasItems &&
            " 아직 아는 업무가 없어서 브리핑이 좀 심심할 거예요 — 위에서 몇 개만 알려주세요!"}
        </div>
      ) : (
        pairs.map((pair) => {
          const isExpanded = expandedKeys.has(pair.id);
          const isUnread = unreadKeys.has(pair.id) && !isExpanded;

          return (
            <div
              key={pair.id}
              className={`${styles.chatQaGroup} ${isUnread ? styles.chatQaGroupUnread : ""}`}
            >
              {pair.userText && (
                <div
                  className={`${styles.chatQuestionHeader} ${isUnread ? styles.headerBlinking : ""}`}
                  onClick={() => onToggleExpand(pair.id)}
                >
                  <div className={styles.chatQuestionTitle}>
                    <UiIcon name="assistant" size={16} />
                    <span>{pair.userText}</span>
                  </div>
                  <div className={styles.headerRightControls}>
                    {isUnread && <span className={styles.blinkingBadge}>답변 완료</span>}
                    <button
                      type="button"
                      className={styles.chatQaToggleBtn}
                      aria-label={isExpanded ? "응답 접기" : "응답 펼치기"}
                      title={isExpanded ? "응답 접기" : "응답 펼치기"}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s ease",
                        }}
                      >
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              {isExpanded && pair.aiText && (
                <div className={styles.chatAnswerScroll}>
                  <MarkdownLite text={pair.aiText} />
                  <EvidencePanel evidences={pair.evidences} onCompleteItem={onCompleteItem} />
                </div>
              )}
            </div>
          );
        })
      )}
      {busy && (
        <div className={styles.msgHint}>
          <CafeWait steps={waitSteps} interval={1200} />
        </div>
      )}
    </div>
  );
}
