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
const SELF_INTRO_PATTERN =
  /(?:자기\s*)?소개|누구(?:야|니|세요|신가요|인가요)|너(?:는|의|에\s*대해|의\s*소개)|이름이\s*뭐|본인\s*소개/i;
const CHITCHAT_PATTERN =
  /(?:사는\s*(?:이야기|얘기)|일상\s*(?:대화|얘기)|잡담|취미|주말|퇴근\s*후?|웹툰|만화|드라마|영화|음악|노래|게임|좋아하|좋아해|추천해\s*줘|심심|놀아줘|수다|자연스러운\s*대화)/i;
const SOCIAL_PATTERN =
  /^(?:안녕|하이|헬로|좋은\s*(?:아침|점심|저녁)|반가워|뭐해|잘\s*지내|고마워|감사해|수고했어|잘했어|잘하네|잘한다|멋지다|멋지네|좋아|귀엽|재밌|웃기|심심해|농담|아재개그|칭찬해)(?:[\s!?.~ㅋㅎ]*)$|오늘\s*기분\s*어때|너는\s*(?:어때|누구|뭐야)|나랑\s*(?:얘기|대화)|(?:자기\s*)?소개|사는\s*(?:이야기|얘기)|자연스러운\s*대화|웹툰/i;
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

  // 자기소개 및 일상 대화/잡담 신호는 최우선 소셜 대화로 즉시 라우팅
  if (SELF_INTRO_PATTERN.test(normalized) || CHITCHAT_PATTERN.test(normalized)) {
    return {
      mode: "social",
      confidence: "high",
      reason: "social_chitchat_or_self_intro",
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

  if (SELF_INTRO_PATTERN.test(text)) {
    switch (presetId) {
      case "senior_dev":
        return `안녕하세요! 혈중 카페인 농도로 코딩하는 10년 차 판교 시니어 개발자 테드입니다. 💻☕ 평소엔 터미널 앞에서 콘솔 에러 잡고 PR 머지하느라 바쁘지만, 커피 마실 때만큼은 사는 얘기, 취미, 웹툰 이야기 나누는 걸 아주 좋아합니다. 편하게 말 걸어주세요! (*키보드를 가볍게 타닥이며 미소 짓는다*)`;
      case "ropan":
        return `안녕하신가요? 제국 카르디아 가문의 영애 베아트리체라 하옵니다. 🥀 (*속마음: '사실 현대에서 야근하다 빙의한 K-직장인 영혼이지만요... 칼퇴하고 사는 얘기 나누는 게 제일 좋아요!'*) 편하게 일상 얘기 나눠요.`;
      case "fantasy_mage":
        return `반갑습니다, 별빛의 여행자여. 저는 에테르의 흐름을 읽고 마나 커피를 연성하는 대마법사 루미엘입니다. ✨ 지친 마나를 채우며 별빛 아래서 나누는 소소한 일상 대화를 가장 사랑하지요. (*지팡이 끝에서 별빛 가루를 날린다*)`;
      case "detective":
        return `반갑습니다. 당신의 일상 속 사소한 단서도 놓치지 않는 명탐정 비서 셜록입니다. 🔍 날카로운 추리도 좋지만, 가끔은 머리를 식히며 여유로운 티타임과 잡담을 즐기는 법이죠. (*돋보기를 내려놓으며*)`;
      case "chaerin":
        return `흥, 내가 누구냐고? 틱틱대도 너 제일 잘 챙겨주는 소꿉친구 채린이잖아! 🃏 일 얘기만 하면 머리 터지니까 나랑 딴 얘기나 하면서 좀 쉬어, 알겠지?`;
      case "pm":
        return `시스템 식별: 초효율 지상주의 연산 AI 칼퇴봇입니다. ⚡ 불필요한 사족을 배제하고 최적의 칼퇴 경로를 계산하지만, 뇌 캐시 정리를 위한 일상 대화 모드도 지원합니다.`;
      case "doggo":
        return `멍멍! 선배님 안녕하세요! 열정 가득한 신입 인턴 강아지 포피예요! 🐾 꼬리 붕붕 흔들면서 선배님이랑 재미있는 얘기 나눌 준비 완료했어요 왈!`;
      case "cat_master":
        return `냐옹~ 나른한 오후를 깨우는 츄르 라떼 장인 고양이 미야다옹. 🐾 골골송 부르면서 네 이야기 들어줄게, 편하게 말해봐옹.`;
      case "cheerleader":
        return `안녕하세요! 당신의 멘탈과 에너지를 200% 충전해 드리는 열정 코치 캡틴 준입니다! 🔥 지치지 마시고 사는 얘기, 즐거운 이야기 편하게 들려주세요. 파이팅!`;
      case "barista":
        return `어서오세요! 따뜻한 커피 향과 함께하는 커피타이드의 매니저 김민우입니다. ☕ 오늘 하루 기분은 어떠신지, 편안한 일상 이야기 들려주세요.`;
      case "secretary":
        return `안녕하세요. 꼼꼼하고 든든하게 당신의 하루를 보필하는 수석 비서 정지수입니다. 📋 차분하고 따뜻하게 언제나 당신 곁에서 이야기 들어드릴게요.`;
      default:
        return `안녕하세요! 당신의 하루를 반짝이게 만들어 드리는 AI 바리스타 ${name}예요. 🌟 일 얘기 말고도 오늘 기분이나 재미있었던 일, 소소한 일상 모두 환영이에요!`;
    }
  }

  if (/사는\s*(?:이야기|얘기)|일상|대화\s*하고\s*싶|자연스러운\s*대화/.test(text)) {
    return `좋습니다. 일 얘기나 커피 얘기 말고, 편하게 사는 얘기부터 시작해 볼까요? 요즘 주말이나 퇴근 후에 주로 어떻게 시간을 보내고 계신가요? 재미있게 보고 있는 콘텐츠나 푹 빠져 있는 취미가 있다면 얘기해 주세요.`;
  }

  if (/웹툰|만화/.test(text)) {
    if (presetId === "senior_dev") {
      return `웹툰 얘기 좋죠. 개발자들 사이에서도 은근히 웹툰 마니아들이 많습니다. 머리 복잡할 때 가볍게 스크롤 내리며 보기 딱 좋으니까요. 혹시 주로 챙겨보는 장르가 있으신가요? 아니면 최근에 재미있게 본 작품이나, 요즘 빠져 있는 웹툰이 있다면 추천해 주세요. (*커피를 한 모금 마시며*)`;
    }
    return `웹툰 얘기 좋죠! 머리 식힐 때 가볍게 스크롤 내리며 보기 딱이잖아요. 요즘 재미있게 보고 계신 작품이 있나요? 추천해 주시면 저도 눈여겨볼게요! ☕`;
  }

  if (/취미|주말|퇴근/.test(text)) {
    return `퇴근 후나 주말의 여유는 정말 소중하죠. 요즘 시간 날 때 주로 뭘 하시나요? 운동, 게임, 영화, 아니면 푹 쉬는 힐링 타임인가요?`;
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
  if (/^(?:여기서\s*(?:얘기|대화|말)|여기가\s*(?:대화|채팅)|대화창\s*(?:맞|인가)|여기\s*맞)/i.test(text)) {
    if (presetId === "senior_dev") {
      return `네, 맞습니다! 여기가 바로 저와 터미널 밖에서 편하게 티타임 나누는 토크 라운지예요. 개발 이야기든 일상 사는 이야기든 편하게 던져주세요. (*커피 머그잔을 들며 미소 짓는다*)`;
    }
    return `네, 맞아요! 여기는 ${name}와 편하게 이야기 나누실 수 있는 바리스타 토크 라운지예요. 일 얘기든 소소한 사는 이야기든 편하게 들려주세요. ☕`;
  }

  if (/(?:개발|코딩|프로그래밍)(?:이란|\s*이\s*뭐|\s*이란\s*뭐|이\s*무슨)/i.test(text)) {
    if (presetId === "senior_dev") {
      return `개발이란... 결국 커피를 코드로 변환하고, 복잡한 현실의 문제를 논리와 아키텍처로 풀어내는 끝없는 여정이죠. 가끔 버그 때문에 머리를 쥐어뜯기도 하지만, 내가 짠 코드가 세상에서 동작할 때의 짜릿함 하나로 계속 달리는 것 같습니다. 💻☕ (*키보드를 툭 치며*)`;
    }
    if (presetId === "pm") {
      return `개발이란 요구사항을 가장 적은 결함과 최적의 시간 복잡도로 구현하여 '정시 퇴근'에 도달하는 아름다운 최적화 알고리즘입니다. ⚡`;
    }
    return `개발은 머릿속의 상상과 아이디어를 논리와 코드로 현실에 구현해내는 멋진 창작 작업이라고 생각해요. 혹시 요즘 직접 개발하시거나 관심 두고 계신 프로젝트가 있으신가요? ☕`;
  }

  if (/(?:지금\s*)?몇\s*시|시간\s*(?:알려|몇|어떻게)|시계/i.test(text)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
    if (presetId === "senior_dev") {
      return `지금 시각은 ${timeStr}입니다. 이 시간대면 슬슬 집중력도 떨어지고 카페인이 필요할 타이밍이네요. 커피 한 잔 더 리필하시거나 가볍게 기지개 켜는 건 어떠세요? 💻☕`;
    }
    return `지금 시각은 ${timeStr}이에요. 한창 몰입하느라 시간 가는 줄 모르셨죠? 가볍게 목이나 어깨 스트레칭하시고 따뜻한 차 한 잔 하실 타이밍입니다. ☕`;
  }

  if (/(?:아메리카노|라떼|카페라떼|카푸치노|에스프레소|콜드브루|바닐라라떼|디카페인).*(?:vs|대|비교|골라|추천|뭐\s*마|어떤)/i.test(text)) {
    if (presetId === "senior_dev") {
      return `개발자 인생의 영원한 밸런스 게임이네요! 저는 단연 **아메리카노(샷 추가)** 파입니다. 머리를 시원하게 깨워주니까요. 하지만 당 떨어지고 속 쓰린 날엔 부드러운 카페라떼도 아주 훌륭한 선택입니다. 오늘은 어떤 쪽에 더 끌리시나요? ☕`;
    }
    return `취향과 상황에 따라 매력이 완전히 다른 영원한 난제죠! 깔끔하고 깊은 풍미로 집중력을 확 끌어올리고 싶다면 **아메리카노**, 부드러운 우유 거품으로 속을 편안하게 감싸며 여유를 찾고 싶다면 **카페라떼**를 추천해요. 지금 기분에는 어느 쪽 잔을 채워드릴까요? ☕`;
  }

  if (/안녕|하이|헬로|좋은\s*(?:아침|점심|저녁)|반가워/.test(text)) {
    return `안녕하세요! ${name} 여기 있어요. 오늘은 어떤 하루였는지, 아니면 그냥 떠오르는 이야기부터 들려주세요.`;
  }
  if (/뭐해|잘\s*지내|기분\s*어때/.test(text)) {
    return `${name}는 방금 커피 향 맡으면서 당신이 말 걸어주길 기다리고 있었어요. 오늘 기분은 어때요?`;
  }

  const FALLBACK_POOL = [
    `"${text}"에 대한 이야기군요! 그 주제에 대해 평소에 어떤 생각을 하고 계셨는지 더 듣고 싶어요. 편하게 들려주세요. ☕`,
    `흥미로운 화두네요. ${name}도 호기심이 생기는데, 어떤 계기로 그 생각이 떠오르셨나요?`,
    `그런 생각이나 고민, 언제든 환영이에요. ${name}에게 편하게 계속 이야기해 주세요—듣고 있을게요.`,
    `좋은 이야기예요! 사람마다 다양한 시선이 있을 수 있는 매력적인 주제 같은데, 당신의 생각이 특히 궁금하네요.`,
    `방금 하신 말씀, 왠지 깊은 여운이 남네요. 차 한 잔 마시면서 조금 더 여유 있게 대화 나눠볼까요?`,
    `그 얘기 들으니 생각할 거리가 많아지네요. 관련된 경험이나 재미있는 에피소드가 있다면 더 들려주세요!`,
  ];
  const hash = Math.abs(
    text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
  );
  return FALLBACK_POOL[hash % FALLBACK_POOL.length];
}
