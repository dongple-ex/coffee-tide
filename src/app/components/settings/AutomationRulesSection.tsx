"use client";

import React from "react";
import { AutomationRule } from "@/lib/automation/rules";
import { ACTION_LABEL, FIELD_LABEL } from "@/lib/labels";
import styles from "../../page.module.css";

interface Props {
  rules: AutomationRule[];
  onChangeRules: (next: AutomationRule[]) => void;
  ruleInput: string;
  onChangeRuleInput: (value: string) => void;
  ruleBusy: boolean;
  onAddRule: () => void;
}

export function AutomationRulesSection({
  rules,
  onChangeRules,
  ruleInput,
  onChangeRuleInput,
  ruleBusy,
  onAddRule,
}: Props) {
  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle}>자동화 규칙</div>
      <div className={styles.formRow}>
        <input
          className={styles.input}
          placeholder='예: "제목에 긴급 있으면 맨 위로"'
          value={ruleInput}
          onChange={(e) => onChangeRuleInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAddRule()}
          aria-label="자연어 규칙 입력"
        />
        <button className={styles.btn} disabled={ruleBusy} onClick={onAddRule}>
          {ruleBusy ? "레시피 적는 중…" : "추가"}
        </button>
      </div>
      <div className={styles.list}>
        {rules.length === 0 && (
          <p className={styles.connNote}>
            “뉴스레터는 숨겨줘”처럼 말씀만 하세요 — 제가 규칙으로 만들어 적용할게요.
            (고정·긴급·음소거·숨김)
          </p>
        )}
        {rules.map((rule, i) => (
          <div key={i} className={styles.ruleRow}>
            <button
              className={styles.iconBtn}
              onClick={() =>
                onChangeRules(rules.map((r, j) => (j === i ? { ...r, enabled: !r.enabled } : r)))
              }
              aria-label={rule.enabled ? "규칙 끄기" : "규칙 켜기"}
              title={rule.enabled ? "켜짐" : "꺼짐"}
            >
              {rule.enabled ? "●" : "○"}
            </button>
            <span className={styles.ruleText}>
              <b>{FIELD_LABEL[rule.field]}</b>에 &lsquo;{rule.value}&rsquo; →{" "}
              <b>{ACTION_LABEL[rule.action]}</b>
            </span>
            <button
              className={styles.iconBtn}
              onClick={() => onChangeRules(rules.filter((_, j) => j !== i))}
              aria-label="규칙 삭제"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
