"use client";

import React, { RefObject } from "react";
import { buildQaPairs, CopilotMessage } from "@/lib/copilotPairs";
import CafeWait from "../cafeWait";
import MarkdownLite from "../markdownLite";
import styles from "../../page.module.css";

interface Props {
  bodyRef: RefObject<HTMLDivElement | null>;
  messages: CopilotMessage[];
  busy: boolean;
  /** 대기 중 표시할 카페 연출 문구 */
  waitSteps: string[];
  /** 질문 없이 서버에서 수신한 최근 24시간 Spark 브리핑 */
  sparkBriefing?: string | null;
  /** 표시할 업무가 하나도 없을 때 안내 문구를 보강한다 */
  hasItems: boolean;
  expandedKeys: Set<string>;
  unreadKeys: Set<string>;
  onToggleExpand: (pairId: string) => void;
}

export function CopilotConversation({
  bodyRef,
  messages,
  busy,
  waitSteps,
  sparkBriefing,
  hasItems,
  expandedKeys,
  unreadKeys,
  onToggleExpand,
}: Props) {
  const pairs = buildQaPairs(messages);

  return (
    <div className={styles.copilotBody} ref={bodyRef}>
      {sparkBriefing && (
        <section className={styles.sparkAutonomousBriefing} aria-label="Gemini Spark 자율 수신 브리핑">
          <div className={styles.sparkAutonomousBadge}>⚡ Gemini Spark 자율 수신</div>
          <MarkdownLite text={sparkBriefing} />
        </section>
      )}
      {pairs.length === 0 ? (
        <div className={styles.msgHint}>
          “오늘 뭐 해야 해?”라고 주문하듯 편하게 물어보세요 ☕
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
                    <span style={{ fontSize: "0.95rem" }}>💬</span>
                    <span>{pair.userText}</span>
                  </div>
                  <div className={styles.headerRightControls}>
                    {isUnread && <span className={styles.blinkingBadge}>✨ 답변 완료</span>}
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
