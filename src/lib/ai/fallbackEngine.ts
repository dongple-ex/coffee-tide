// 로컬 Fallback 엔진 — Gemini 불가(키 없음/쿼터/파싱 실패) 시 대체 (phase3_validation_log §1).
// AI 없이도 분류·브리핑·규칙 파싱·붙여넣기 추출이 동작해야 함 (00-current-state 원칙 4).

import { CATEGORY_LABELS, SOURCE_LABELS, UnifiedCategory, UnifiedData } from "../types/unified";
import { AutomationRule } from "../automation/rules";

export function classifyOne(title: string, content: string): {
  category: UnifiedCategory;
  actionDirective: string;
} {
  const text = `${title} ${content}`.toLowerCase();

  if (/(긴급|장애|다운|불가|즉시|출동|asap|urgent|outage|critical)/.test(text)) {
    return { category: "urgent", actionDirective: "즉시 확인하고 비상 대응을 시작하세요" };
  }
  if (/(결재|승인|컨펌|서명|approve|confirm|sign-?off)/.test(text)) {
    return { category: "approval_required", actionDirective: "내용 검토 후 승인 여부를 결정하세요" };
  }
  if (/(회의|미팅|일정|세미나|meeting|agenda|invite)/.test(text)) {
    return { category: "meeting", actionDirective: "일정을 확인하고 참석 여부를 회신하세요" };
  }
  if (/(광고|뉴스레터|구독|홍보|unsubscribe|newsletter|모니터링 성공)/.test(text)) {
    return { category: "ignore", actionDirective: "확인만 하고 넘어가도 됩니다" };
  }
  if (/(요청|제출|피드백|회신|보고|마감|todo|action|due|제출)/.test(text)) {
    return { category: "action_required", actionDirective: "오늘 중으로 처리하고 결과를 회신하세요" };
  }
  return { category: "reference", actionDirective: "참고용으로 보관하세요" };
}

export function classifyAll(items: UnifiedData[]): UnifiedData[] {
  return items.map((item) => {
    if (item.category && item.actionDirective) return item;
    const { category, actionDirective } = classifyOne(item.title, item.content);
    return { ...item, category: item.category ?? category, actionDirective };
  });
}

/** Copilot 브리핑 템플릿 — phase3_ai_flow_spec §3의 4개 섹션 + G4(기준일·출처 명시) */
export function copilotBriefing(
  items: UnifiedData[],
  dateLabel: string
): string {
  const active = items.filter((i) => i.status !== "completed" && i.status !== "dismissed");
  const byCat = (c: UnifiedCategory) => active.filter((i) => i.category === c);
  const cite = (i: UnifiedData) => `**${i.title}** (${SOURCE_LABELS[i.source]})`;

  const priority = [...byCat("urgent"), ...byCat("approval_required"), ...byCat("action_required")];
  const meetings = byCat("meeting");

  const lines: string[] = [];
  lines.push(`## 오늘의 브리핑 (기준일: ${dateLabel})`);
  lines.push("");
  lines.push(`### 1. 오늘 처리할 최우선 업무`);
  if (priority.length === 0) {
    lines.push(`- 처리 대기 중인 우선 업무가 없습니다. 아아 한 잔과 여유 있게 시작하세요 🥤`);
  } else {
    priority.slice(0, 5).forEach((i, n) => {
      lines.push(`${n + 1}. ${cite(i)} — ${CATEGORY_LABELS[i.category ?? "reference"]}`);
    });
  }
  lines.push("");
  lines.push(`### 2. 행동 지침 요약`);
  priority.slice(0, 3).forEach((i) => {
    lines.push(`- ${i.title}: ${i.actionDirective ?? "내용을 확인하세요"} (출처: ${SOURCE_LABELS[i.source]})`);
  });
  if (meetings.length > 0) {
    lines.push(`- 회의 ${meetings.length}건 일정 확인: ${meetings.map((m) => m.title).join(", ")}`);
  }
  if (priority.length === 0 && meetings.length === 0) {
    lines.push(`- 새 업무를 추가하거나 메모를 붙여넣어 주시면, 행동 지침을 바로 만들어 드릴게요.`);
  }
  lines.push("");
  lines.push(`### 3. 예상 소요 시간`);
  const estimate = priority.length * 25 + meetings.length * 45;
  lines.push(
    estimate > 0
      ? `- 대기 업무 ${priority.length}건 + 회의 ${meetings.length}건 ≈ 약 ${estimate}분 예상이에요.`
      : `- 오늘은 시간 계산할 일이 없네요. 자유 시간입니다!`
  );
  lines.push("");
  lines.push(`### 4. 잠재적 위험 요소`);
  const urgent = byCat("urgent");
  lines.push(
    urgent.length > 0
      ? urgent.map((i) => `- ⚠️ ${cite(i)} — 미루면 장애/마감 리스크가 있어요`).join("\n")
      : `- 위험 신호는 안 보여요. 순항 중입니다!`
  );
  lines.push("");
  lines.push(`> 오늘은 AI 없이 제 감(로컬 규칙)으로 정리했어요.`);
  return lines.join("\n");
}

/** 자연어 → 자동화 규칙 휴리스틱 (백로그 F1: 대표 문형 위주) */
export function parseRuleFallback(text: string): AutomationRule | null {
  const t = text.trim();

  let action: AutomationRule["action"] | null = null;
  if (/(숨겨|숨김|안 ?보이|제거|지워)/.test(t)) action = "hide";
  else if (/(음소거|무시|조용히|알림 ?꺼)/.test(t)) action = "mute";
  else if (/(고정|맨 ?위|상단|핀)/.test(t)) action = "pin";
  else if (/(긴급|중요|urgent)/.test(t)) action = "urgent";
  if (!action) return null;

  let field: AutomationRule["field"] = "any";
  if (/(제목|title)/.test(t)) field = "title";
  else if (/(본문|내용|content)/.test(t)) field = "content";
  else if (/(보낸|발신|from|sender)/.test(t)) field = "sender";
  else if (/(노션|notion|아웃룩|outlook|지메일|gmail|옵시디언|obsidian)/i.test(t)) field = "source";

  let value = "";
  const quoted = t.match(/["'“”]([^"'“”]+)["'“”]/);
  if (quoted) {
    value = quoted[1];
  } else if (field === "source") {
    const src = t.match(/(노션|notion|아웃룩|outlook|지메일|gmail|옵시디언|obsidian)/i)?.[1] ?? "";
    value =
      { 노션: "notion", 아웃룩: "outlook", 지메일: "gmail", 옵시디언: "obsidian" }[src] ||
      src.toLowerCase();
  } else {
    // "제목에 X 있으면/포함되면" 문형에서 키워드 추출
    const kw = t.match(/(?:제목|본문|내용)?에?\s*['"]?([\w가-힣]+)['"]?\s*(?:이|가)?\s*(?:있|포함|들어)/);
    value = kw?.[1] ?? "";
  }
  if (!value) return null;

  return { field, value, action, enabled: true };
}

/** 붙여넣기 텍스트에서 업무 추출 휴리스틱 (G1: 로컬 추출 경로) */
export function extractTasksFallback(text: string): { title: string; content: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tasks: { title: string; content: string }[] = [];

  for (const line of lines) {
    const bullet = line.match(/^(?:[-*•▪·]|\d+[.)]|\[ \])\s*(.+)$/);
    const askish = /(해야|필요|요청|부탁|까지|마감|검토|확인|제출|회신|준비)/.test(line);
    if (bullet) {
      tasks.push({ title: bullet[1].slice(0, 80), content: bullet[1] });
    } else if (askish && line.length >= 8) {
      tasks.push({ title: line.slice(0, 80), content: line });
    }
    if (tasks.length >= 10) break;
  }

  // 아무것도 못 찾으면 전체를 1건으로
  if (tasks.length === 0 && text.trim().length > 0) {
    tasks.push({ title: text.trim().slice(0, 80), content: text.trim().slice(0, 500) });
  }
  return tasks;
}
