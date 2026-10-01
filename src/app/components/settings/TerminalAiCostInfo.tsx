import React from "react";
import type { TerminalAiModelCatalog, TerminalAiProvider, TerminalAiStatus } from "@/lib/ai/desktopAi";
import styles from "./terminalAiSection.module.css";

export function TerminalAiCostInfo({ provider, model, customModel, catalog, status }: {
  provider: TerminalAiProvider;
  model: string;
  customModel: boolean;
  catalog: TerminalAiModelCatalog | null;
  status: TerminalAiStatus | null;
}) {
  const selected = catalog?.models.find(item => item.value === model.trim());
  const reference = !model && !customModel ? catalog?.models.find(item => provider === "codex_cli" ? item.isDefault : item.value === "default") : undefined;
  const info = selected || reference;
  const account = status?.account;
  const auth = account?.loggedIn ? account.authMethod : undefined;
  const subscription = auth === "Claude 구독" || auth === "ChatGPT";
  return <section className={styles.account} aria-label="추론 수준과 비용 안내" aria-live="polite">
    <strong>추론 수준 · 비용</strong>
    <span>추론 설정: 자동 · 앱에서 별도 지정하지 않음</span>
    <span>실제 적용 수준: 미확인</span>
    <small>현재 연결은 실행 시 적용된 추론 수준을 보고하지 않습니다. 아래 지원 단계와 권장값은 실제 적용값이 아닙니다.</small>
    <span>{reference ? "목록 기본 모델(참고)" : "선택한 모델"}: {info?.label || model || (customModel ? "직접 입력 대기" : "자동 · 실행 모델 미확인")}</span>
    <span>지원 단계: {info?.reasoningEfforts.length ? info.reasoningEfforts.join(" · ") : "정보 없음 · 미지원 여부도 확인되지 않음"}</span>
    <span>목록의 권장 기본값: {info?.defaultReasoningEffort || "제공되지 않음"}</span>
    <small>{reference ? "자동 선택 시 사용할 모델은 CLI 설정에 따라 달라질 수 있습니다. " : "선택 내용은 저장 후 다음 질문부터 적용됩니다. "}{provider === "codex_cli" ? "바리스타는 개인 config.toml의 모델·추론 설정을 적용하지 않습니다." : "Claude CLI 설정·환경 변수·조직 정책에 따라 실제 추론 수준이 달라질 수 있습니다."}</small>
    <p>같은 모델에서는 높은 추론 수준일수록 대체로 응답 시간과 토큰 사용량이 늘어납니다. 낮은 수준도 사용량을 소모하며, 서로 다른 모델의 같은 단계가 같은 비용을 뜻하지는 않습니다.</p>
    <span>인증 방식: {auth || "미확인"}{account?.plan ? ` · ${account.plan}` : ""}</span>
    <p>{auth === "API 키" ? "API 사용량에 따라 과금됩니다. 모델별 단가와 입력·출력·캐시 토큰에 따라 요금이 달라집니다." : subscription ? "구독 계정의 사용 한도·크레딧을 이용합니다. 추가 사용량 결제 여부는 모델·요금제·계정 설정에 따라 달라집니다." : "현재 인증 정보로는 과금 방식을 확정할 수 없습니다. 제공업체의 사용량·결제 메뉴에서 확인해 주세요."}</p>
    {provider === "claude_cli" && <p>Claude의 일부 모델은 구독 중에도 별도 사용 크레딧을 쓸 수 있습니다. 바리스타의 자동 응답에서는 별도 결제 확인 없이 크레딧이 사용될 수 있으니 공식 사용량 메뉴에서 사용 설정과 지출 한도를 확인하세요.</p>}
    <span>예상 요금 · 잔여 한도: 현재 연결에서 제공하지 않음</span>
    <small>추론 단계만으로 금액을 계산할 수 없습니다. 캐릭터 지침·최근 대화도 입력에 포함되고, 답변 길이에 따라 사용량이 달라집니다. CLI의 토큰 환산 추정액은 실제 청구액이나 구독 잔여량과 다를 수 있습니다.</small>
    <a href={provider === "claude_cli" ? "https://code.claude.com/docs/en/costs" : "https://learn.chatgpt.com/docs/pricing"} target="_blank" rel="noopener noreferrer">공식 비용·한도 안내 ↗</a>
    {status?.usage && <a href={status.usage.url} target="_blank" rel="noopener noreferrer">이 계정의 사용량 확인 ↗</a>}
  </section>;
}
