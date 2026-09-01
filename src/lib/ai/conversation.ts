import type { CopilotUserConfig } from "./harness";

export type ConversationTurnMode =
  | "social"
  | "repair"
  | "supportive"
  | "clarify"
  | "mixed"
  | "work"
  | "command";

export type ConversationExplicitMode = "auto" | "talk" | "work";

export interface ConversationHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ConversationRoute {
  mode: ConversationTurnMode;
  confidence: "high" | "medium" | "low";
  reason: string;
  needsWorkContext: boolean;
  allowCloudTools: boolean;
}

export interface RouteConversationInput {
  text: string;
  explicitMode?: ConversationExplicitMode;
}

const REPAIR_PATTERN =
  /(?:일|업무|할\s*일|브리핑)\s*(?:얘기|말)?\s*(?:그만|말고|하지\s*마|빼)|(?:소통|대화|말)\s*(?:을|이|은|는)?\s*(?:안|못|없)|왜\s*(?:자꾸|계속)?\s*(?:일|업무|브리핑)|일처리만|업무만\s*(?:말|답)/i;
const SUPPORT_PATTERN =
  /지쳤|지쳐|피곤|힘들|답답|벅차|의욕\s*(?:이\s*)?없|번아웃|쉬고\s*싶|우울|속상|짜증|불안|걱정돼|망한\s*것\s*같/i;
const SOCIAL_PATTERN =
  /^(?:안녕|하이|헬로|좋은\s*(?:아침|점심|저녁)|반가워|뭐해|잘\s*지내|고마워|감사해|수고했어|잘했어|잘하네|잘한다|멋지다|멋지네|좋아|귀엽|재밌|웃기|심심해|농담|아재개그|칭찬해)(?:[\s!?.~ㅋㅎ]*)$|오늘\s*기분\s*어때|너는\s*(?:어때|누구|뭐야)|나랑\s*(?:얘기|대화)/i;
const WORK_OBJECT_PATTERN =
  /업무|할\s*일|일정|메일|회의|문서|보고서|결재|마감|프로젝트|태스크|캘린더|노션|자료|파일|브리핑|우선순위|진행\s*상황|티켓|이슈|배포|코드|서버|오늘\s*일|오늘\s*(?:뭐|무엇)/i;
const WORK_ACTION_PATTERN =
  /보여|알려|정리|찾아|분석|작성|만들|추천|확인|처리|준비|등록|보내|예약|추가|수정|완료|삭제|열어|요약|브리핑|계획|점검|검토/i;
const WORK_QUERY_PATTERN = /해야|할까|있어|왔어|언제|몇\s*개|뭐야|어때|먼저/i;
const COMMAND_PATTERN =
  /(?:등록|추가|삭제|저장|수정|완료\s*처리|보내|전송|예약|실행|열어)\s*(?:해|해줘|줘|주세요|시켜)|(?:캘린더|일정|메일|앱|프로그램).*?(?:등록|추가|삭제|보내|실행|열어)/i;
const CLARIFY_PATTERN =
  /^(?:그거|이거|저거)?\s*(?:해줘|도와줘|처리해줘|어떻게\s*해|뭘\s*하면\s*돼)[\s!?.~]*$/i;

export function isConversationOnlyMode(mode?: ConversationTurnMode): boolean {
  return mode === "social" || mode === "repair" || mode === "supportive" || mode === "clarify";
}

export function routeConversation({
  text,
  explicitMode = "auto",
}: RouteConversationInput): ConversationRoute {
  const normalized = text.trim().slice(0, 2_000);

  if (normalized.startsWith("/")) {
    return {
      mode: "command",
      confidence: "high",
      reason: "slash_command",
      needsWorkContext: true,
      allowCloudTools: true,
    };
  }

  if (explicitMode === "talk") {
    return {
      mode: "social",
      confidence: "high",
      reason: "explicit_talk_mode",
      needsWorkContext: false,
      allowCloudTools: false,
    };
  }

  if (explicitMode === "work") {
    return {
      mode: COMMAND_PATTERN.test(normalized) ? "command" : "work",
      confidence: "high",
      reason: "explicit_work_mode",
      needsWorkContext: true,
      allowCloudTools: true,
    };
  }

  // 사용자가 업무 일변도의 응답을 지적한 경우에는 업무 단어가 있어도 복구 대화를 우선한다.
  if (REPAIR_PATTERN.test(normalized)) {
    return {
      mode: "repair",
      confidence: "high",
      reason: "conversation_repair",
      needsWorkContext: false,
      allowCloudTools: false,
    };
  }

  const supportive = SUPPORT_PATTERN.test(normalized);
  const social = SOCIAL_PATTERN.test(normalized);
  const work =
    WORK_OBJECT_PATTERN.test(normalized) &&
    (WORK_ACTION_PATTERN.test(normalized) || WORK_QUERY_PATTERN.test(normalized));

  if (supportive && work) {
    return {
      mode: "mixed",
      confidence: "high",
      reason: "emotion_and_work",
      needsWorkContext: true,
      allowCloudTools: false,
    };
  }

  if (supportive) {
    return {
      mode: "supportive",
      confidence: "high",
      reason: "support_signal",
      needsWorkContext: false,
      allowCloudTools: false,
    };
  }

  if (social) {
    return {
      mode: "social",
      confidence: "high",
      reason: "social_signal",
      needsWorkContext: false,
      allowCloudTools: false,
    };
  }

  if (CLARIFY_PATTERN.test(normalized)) {
    return {
      mode: "clarify",
      confidence: "medium",
      reason: "missing_target",
      needsWorkContext: false,
      allowCloudTools: false,
    };
  }

  if (work) {
    const command = COMMAND_PATTERN.test(normalized);
    return {
      mode: command ? "command" : "work",
      confidence: "high",
      reason: command ? "work_command" : "work_request",
      needsWorkContext: true,
      allowCloudTools: command,
    };
  }

  return {
    mode: "social",
    confidence: "low",
    reason: "conversation_default",
    needsWorkContext: false,
    allowCloudTools: false,
  };
}

function personaName(config?: CopilotUserConfig): string {
  return (config?.baristaName || "AI 바리스타").trim().slice(0, 30) || "AI 바리스타";
}

/** Gemini가 없거나 실패해도 업무 브리핑으로 되돌아가지 않는 로컬 대화 응답. */
export function conversationFallback(
  question: string,
  mode: ConversationTurnMode,
  config?: CopilotUserConfig
): string {
  const name = personaName(config);
  const text = question.trim();
  const presetId = config?.presetId;

  if (mode === "repair") {
    return `맞아요. 제가 자꾸 일부터 꺼내서 대화가 딱딱해졌네요. 지금은 업무 브리핑 없이 그냥 편하게 이야기할게요—${name}에게 하고 싶은 말부터 해주세요.`;
  }

  if (mode === "supportive") {
    return `많이 버거웠겠어요. 지금 당장 해결책부터 꺼내지 않을게요. 잠깐 숨 돌리면서, 어떤 부분이 가장 힘든지 편하게 말해줘도 괜찮아요.`;
  }

  if (mode === "clarify") {
    return `물론이죠. 다만 무엇을 도와드리면 될지 한 가지만 더 알려주세요—그냥 이야기하고 싶은 건지, 특정 일을 함께 처리하고 싶은 건지도요.`;
  }

  if (/고마|감사/.test(text)) {
    return `천만에요. 그렇게 말해주니 ${name}도 기분 좋네요. 필요할 때 일 얘기든 잡담이든 편하게 불러주세요.`;
  }
  if (/잘하|멋지|좋아|귀엽|재밌|웃기|칭찬/.test(text)) {
    if (presetId === "senior_dev") {
      return `인정받았으니 오늘 빌드는 성공입니다. 😎 커피 한 샷 더 올리고, 이번엔 일 말고 무슨 얘기든 받아보죠.`;
    }
    return `오, 그 말 은근히 힘 나는데요? ☕ ${name}도 일만 잘하는 비서 말고, 말 통하는 단골 친구가 되어볼게요.`;
  }
  if (/농담|아재개그/.test(text)) {
    return `커피가 식으면 왜 슬픈지 아세요? 마음이 ‘디카페인’해져서요. ...방금 건 ${name}의 서비스 샷으로 쳐주세요. ☕`;
  }
  if (/안녕|하이|헬로|좋은\s*(?:아침|점심|저녁)|반가워/.test(text)) {
    return `안녕하세요! ${name} 여기 있어요. 오늘은 어떤 하루였는지, 아니면 그냥 떠오르는 이야기부터 들려주세요.`;
  }
  if (/뭐해|잘\s*지내|기분\s*어때/.test(text)) {
    return `${name}는 방금 커피 향 맡으면서 당신이 말 걸어주길 기다리고 있었어요. 오늘 기분은 어때요?`;
  }

  return `그 얘기, 조금 더 듣고 싶어요. ${name}에게 편하게 이어서 말해주세요—지금은 굳이 업무 이야기로 돌리지 않을게요.`;
}
