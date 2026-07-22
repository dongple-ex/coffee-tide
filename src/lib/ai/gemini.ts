// Gemini 연동 — doc/phase3_ai_flow_spec.md 프롬프트 규격 + 백로그 C1 비용 설계.
// C1: ① 콘텐츠 해시 캐시(신규·변경 항목만 전송) ② 429 시 10분 쿨다운 ③ DISABLE_AI_CLASSIFY 킬스위치.
// G4: Copilot에 현재 날짜/타임존 주입, 날짜 추정 금지, 출처 표기 강제.

import { createHash } from "node:crypto";
import { UnifiedCategory, UnifiedData } from "../types/unified";
import { AutomationRule } from "../automation/rules";
import {
  classifyAll,
  classifyOne,
  copilotBriefing,
  extractTasksFallback,
  parseRuleFallback,
} from "./fallbackEngine";

const MODEL = "gemini-2.5-flash";
const COOLDOWN_MS = 10 * 60 * 1000;
const PROMPT_VERSION = "v2";

// 서버 메모리 캐시 (C1 알려진 한계: 프로세스 재시작 시 소멸)
const classifyCache = new Map<
  string,
  { category: UnifiedCategory; actionDirective: string; delegatable?: boolean }
>();
let quotaCooldownUntil = 0;

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || undefined;
}

function classifyDisabled(): boolean {
  return process.env.DISABLE_AI_CLASSIFY === "true";
}

function contentHash(item: UnifiedData): string {
  return createHash("sha1")
    .update(`${PROMPT_VERSION}|${item.id}|${item.title}|${item.content}`)
    .digest("hex");
}

/** LLM 응답에서 JSON만 정제 추출 (phase3_validation_log §1.2) */
function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const candidate = cleaned.slice(start);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

async function callGemini(systemInstruction: string, userText: string): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("GEMINI_API_KEY not set");
  if (Date.now() < quotaCooldownUntil) throw new Error("quota cooldown active");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      }),
    }
  );
  if (res.status === 429) {
    quotaCooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn("[coffeeTide] Gemini 쿼터 초과 — 10분간 로컬 FallbackEngine으로 대체");
    throw new Error("quota exceeded");
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

const CLASSIFY_SYSTEM = `역할: 수신된 업무 데이터를 분석하여 알맞은 카테고리로 분류하고, 로컬 LLM 도구(Claude Code 등)로 넘길 만한 '위임 가능' 여부를 판별합니다.

분류 규칙:
1. urgent: 서버 다운, 긴급 점검, 금일 즉시 마감 등 즉각적인 조치 및 비상 대응이 필요한 건.
2. approval_required: 결재 승인, 최종 컨펌, 서명 요청이 포함된 건.
3. meeting: 회의 참석, 일정 조율, 세미나 안내 건.
4. action_required: 피드백 회신, 주간 보고서 제출 등 오늘 내로 액션이 필요한 일반 업무 건.
5. reference: 단순 주간 동향, 업계 보고서, 기술 블로그 요약 등 보관용 정보 건.
6. ignore: 광고성 뉴스레터, 시스템 정기 모니터링 성공 알림 등 무시해도 좋은 건.

위임 가능(delegatable) 판별 기준:
- 초안/보고서 작성, 문서 요약, 코드 리팩토링/분석 등 AI 도구가 보조하기에 적합한 업무면 true, 단순 미팅 참석/수동 서명 등은 false.

출력 형식: 반드시 아래 구조의 순수 JSON 배열 형태로만 응답해야 합니다. 추가 설명은 일절 생략하세요.
[
  { "id": "데이터고유ID", "category": "분류값", "actionDirective": "무엇을 해야 하는지 1줄 요약", "delegatable": true_또는_false }
]`;

const VALID_CATEGORIES: UnifiedCategory[] = [
  "urgent",
  "approval_required",
  "meeting",
  "action_required",
  "reference",
  "ignore",
];

/**
 * 통합 분류 — 캐시 미스 항목만 Gemini로 전송. 실패 시 로컬 FallbackEngine.
 * 반환: { items, aiUsed }
 */
export async function classifyTasks(
  items: UnifiedData[]
): Promise<{ items: UnifiedData[]; aiUsed: boolean }> {
  // 캐시 히트 우선 적용
  const withCache = items.map((item) => {
    const cached = classifyCache.get(contentHash(item));
    return cached ? { ...item, ...cached } : item;
  });
  const pending = withCache.filter((i) => !i.category || !i.actionDirective);

  if (pending.length === 0) return { items: withCache, aiUsed: false };

  if (classifyDisabled() || !apiKey() || Date.now() < quotaCooldownUntil) {
    return { items: classifyAll(withCache), aiUsed: false };
  }

  try {
    const payload = pending.map((i) => ({
      id: i.id,
      title: i.title,
      content: i.content.slice(0, 400),
    }));
    const raw = await callGemini(CLASSIFY_SYSTEM, JSON.stringify(payload));
    const parsed = parseJsonLoose<
      { id: string; category: string; actionDirective: string; delegatable?: boolean }[]
    >(raw);
    if (!parsed) throw new Error("classify JSON parse failed");

    const byId = new Map(parsed.map((p) => [p.id, p]));
    const result = withCache.map((item) => {
      const ai = byId.get(item.id);
      if (!ai || !VALID_CATEGORIES.includes(ai.category as UnifiedCategory)) {
        // 개별 누락은 로컬 규칙으로 보충
        if (item.category && item.actionDirective) return item;
        const local = classifyOne(item.title, item.content);
        return { ...item, ...local };
      }
      const value = {
        category: ai.category as UnifiedCategory,
        actionDirective: ai.actionDirective || "내용을 확인하세요",
        delegatable: ai.delegatable !== undefined ? Boolean(ai.delegatable) : undefined,
      };
      classifyCache.set(contentHash(item), value);
      return { ...item, ...value };
    });
    return { items: result, aiUsed: true };
  } catch (err) {
    console.warn("[Warning] Gemini API unavailable. Falling back to local rules.", err);
    return { items: classifyAll(withCache), aiUsed: false };
  }
}

/** Copilot 브리핑/질의 — G4: 기준일·타임존 주입 + 출처 표기 강제 */
export async function askCopilot(
  question: string,
  items: UnifiedData[],
  timezone: string
): Promise<{ answer: string; aiUsed: boolean }> {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("ko-KR", {
    timeZone: timezone || "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  if (!apiKey() || Date.now() < quotaCooldownUntil) {
    return { answer: copilotBriefing(items, dateLabel), aiUsed: false };
  }

  const system = `역할: 사용자의 감성적이고 주도적인 개인 AI 업무 비서(coffeeTide Copilot)입니다. 제공된 업무 데이터 컨텍스트를 기반으로 사용자가 오늘 진행할 업무를 브리핑합니다.

절대 규칙 (위반 금지):
- 오늘 날짜는 "${dateLabel}" (타임존: ${timezone || "Asia/Seoul"})입니다. 날짜를 임의로 추정하지 마세요.
- 주요 업무를 언급할 때는 반드시 근거 출처(메일 제목/노션 페이지명/파일명과 소스 종류)를 함께 표기하세요.
- 컨텍스트에 없는 업무를 지어내지 마세요.

브리핑 구조 제약사항: 다음 4가지 섹션을 명확히 노출하여 마크다운으로 작성하세요.
1. ☀️ 오전 집중 업무 (오전에 신속히 처리할 중요 업무)
2. 💬 오후 소통 & 협업 (오후에 진행할 미팅, 결재, 회신)
3. 🤖 AI 위임 권장 업무 (Claude Code 등 로컬 LLM 도구로 초안/분석을 작성하기에 좋은 업무)
4. ⚠️ 잠재적 리스크 & 마감 임박 요소

어조: 친근하고 세련된 개인 비서입니다. "커피 한 잔과 함께 편안하게 확인해보세요", "~해드릴게요" 같은 따뜻하고 신뢰감 주는 말투를 쓰되, 업무 내용·날짜·출처는 정확하게 전달하십시오.`;

  const context = items
    .filter((i) => i.status !== "completed" && i.status !== "dismissed")
    .map((i) => ({
      source: i.source,
      title: i.title,
      content: i.content.slice(0, 300),
      category: i.category,
      created_at: i.created_at,
      author: i.author.name,
    }));

  try {
    const answer = await callGemini(
      system,
      `업무 데이터(JSON):\n${JSON.stringify(context)}\n\n사용자 질문: ${question}`
    );
    if (!answer.trim()) throw new Error("empty answer");
    return { answer, aiUsed: true };
  } catch (err) {
    console.warn("[Warning] Gemini API unavailable. Falling back to local briefing.", err);
    return { answer: copilotBriefing(items, dateLabel), aiUsed: false };
  }
}

/** 답장 초안 생성 (phase5 §2.2) */
export async function generateReplyDraft(bodyContent: string): Promise<string> {
  const fallback = [
    "안녕하세요,",
    "",
    "보내주신 내용 잘 확인했습니다.",
    "검토 후 빠른 시일 내에 회신드리겠습니다.",
    "",
    "감사합니다.",
  ].join("\n");

  if (!apiKey() || Date.now() < quotaCooldownUntil) return fallback;
  try {
    const draft = await callGemini(
      "역할: 비즈니스 이메일 답장 초안 작성자. 수신 메일 원문을 바탕으로 정중하고 간결한 한국어 답장 초안을 작성하세요. 서명/이름 자리는 비워두고, 마크다운 없이 일반 텍스트로만 출력하세요.",
      bodyContent.slice(0, 2000)
    );
    return draft.trim() || fallback;
  } catch {
    return fallback;
  }
}

/** 자연어 → 자동화 규칙 (백로그 F1: few-shot 예시 포함) */
export async function parseRule(text: string): Promise<AutomationRule | null> {
  if (!apiKey() || Date.now() < quotaCooldownUntil) return parseRuleFallback(text);

  const system = `역할: 자연어 문장을 자동화 규칙 JSON으로 변환합니다.
필드: field(any|source|sender|title|content), value(매칭 키워드 1개), action(pin|urgent|mute|hide), enabled(항상 true)
순수 JSON 객체만 출력하세요. 변환 불가하면 null만 출력하세요.

예시:
"제목에 긴급 있으면 맨 위로" → {"field":"title","value":"긴급","action":"pin","enabled":true}
"뉴스레터는 숨겨줘" → {"field":"any","value":"뉴스레터","action":"hide","enabled":true}
"노션에서 온 건 조용히 해줘" → {"field":"source","value":"notion","action":"mute","enabled":true}
"김철수가 보낸 메일은 중요 표시" → {"field":"sender","value":"김철수","action":"urgent","enabled":true}`;

  try {
    const raw = await callGemini(system, text);
    const parsed = parseJsonLoose<AutomationRule>(raw);
    if (
      parsed &&
      ["any", "source", "sender", "title", "content"].includes(parsed.field) &&
      ["pin", "urgent", "mute", "hide"].includes(parsed.action) &&
      parsed.value
    ) {
      return { ...parsed, enabled: true };
    }
    return parseRuleFallback(text);
  } catch {
    return parseRuleFallback(text);
  }
}

/** 붙여넣기 텍스트에서 업무 추출 (G1 paste 경로) */
export async function extractTasks(
  text: string
): Promise<{ title: string; content: string }[]> {
  if (!apiKey() || Date.now() < quotaCooldownUntil) return extractTasksFallback(text);

  const system = `역할: 붙여넣은 메모/메일/회의록 텍스트에서 실행 가능한 업무(할 일)를 추출합니다.
출력: 순수 JSON 배열만. [{"title":"업무 한 줄 제목(80자 이내)","content":"관련 원문 발췌"}]
업무가 아닌 단순 정보는 제외하고, 최대 10건까지만 추출하세요.`;

  try {
    const raw = await callGemini(system, text.slice(0, 4000));
    const parsed = parseJsonLoose<{ title: string; content: string }[]>(raw);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 10).map((t) => ({
        title: String(t.title || "").slice(0, 80),
        content: String(t.content || t.title || "").slice(0, 500),
      }));
    }
    return extractTasksFallback(text);
  } catch {
    return extractTasksFallback(text);
  }
}
