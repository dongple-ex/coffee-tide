export interface IdleMessageItem {
  id: string;
  category: "joke" | "coffee_trivia" | "stretch" | "cheer" | "snack";
  text: string;
  emoji: string;
}

export const IDLE_TALK_POOL: IdleMessageItem[] = [
  // 1. 유머 & 농담
  {
    id: "joke_1",
    category: "joke",
    text: "커피와 프로그래밍의 공통점이 뭔지 아세요? 둘 다 버그(Bug)를 잡기 위해 밤을 새운다는 점이죠! ☕🐛",
    emoji: "😆",
  },
  {
    id: "joke_2",
    category: "joke",
    text: "바리스타가 가장 좋아하는 악기는? 바로... '에스프레소'입니다! (바이올린 사촌이에요 🎻)",
    emoji: "🥁",
  },
  {
    id: "joke_3",
    category: "joke",
    text: "오늘 할 일을 내일로 미루면? 내일의 내가 아주 바빠집니다. 하지만 지금 커피를 마시면 내일의 내가 덜 억울하죠! ☕",
    emoji: "💡",
  },
  {
    id: "joke_4",
    category: "joke",
    text: "자판기 커피가 왜 항상 뜨거울까요? 자판기 안에서 열일하느라 열이 받아서 그렇습니다. 🔥",
    emoji: "🤣",
  },

  // 2. 커피 상식
  {
    id: "trivia_1",
    category: "coffee_trivia",
    text: "오후 2시~3시 사이에 마시는 커피가 코르티솔 분비 주기상 가장 집중력 부스터 효과가 크다고 해요!",
    emoji: "☕",
  },
  {
    id: "trivia_2",
    category: "coffee_trivia",
    text: "아이스 아메리카노는 물을 먼저 붓고 샷을 넣어야 크레마가 살아있다는 사실, 알고 계셨나요? 🧊",
    emoji: "🌿",
  },
  {
    id: "trivia_3",
    category: "coffee_trivia",
    text: "커피 원두는 사실 콩(Bean)이 아니라 '커피 체리'라는 과일의 씨앗이랍니다. 과일 주스인 셈이죠! 🍒",
    emoji: "🍒",
  },

  // 3. 스트레칭 & 건강
  {
    id: "stretch_1",
    category: "stretch",
    text: "잠깐 화면에서 눈을 떼고 먼 곳을 5초만 바라봐 주세요. 눈 근육이 시원해집니다! 👁️✨",
    emoji: "🙆‍♂️",
  },
  {
    id: "stretch_2",
    category: "stretch",
    text: "어깨 으쓱으쓱 3번! 기지개 한번 시원하게 쭉 펴고 가실게요~ 🧘",
    emoji: "🧘",
  },
  {
    id: "stretch_3",
    category: "stretch",
    text: "물 한 모금 꿀꺽 마셔주세요. 수분 충전이 뇌 회전을 15% 빠르게 해준대요! 💧",
    emoji: "💧",
  },

  // 4. 응원 & 힐링
  {
    id: "cheer_1",
    category: "cheer",
    text: "오늘 오전부터 지금까지 정말 잘해오고 계십니다. 스스로에게 작은 칭찬 한마디 어떠세요? 👏",
    emoji: "🌟",
  },
  {
    id: "cheer_2",
    category: "cheer",
    text: "조금 막힐 때는 5분간 멍때리는 '디폴트 모드 네트워크'가 뇌의 창의력을 깨워준다고 해요. 멍타임 찬성! 💭",
    emoji: "☕",
  },
];

/**
 * 사용자 페르소나(카리나, 김부장, 칼퇴봇 등)의 말투로 변환
 */
export function formatIdleTalkForPersona(
  item: IdleMessageItem,
  presetId = "karina",
  baristaName = "AI 바리스타"
): { title: string; content: string } {
  switch (presetId) {
    case "karina":
      return {
        title: `✨ ${baristaName}의 깜짝 톡!`,
        content: `팀장님~ 혹시 잠깐 멍타임 중이신가요? ㅋㅋㅋ\n${item.emoji} ${item.text}`,
      };

    case "secretary":
      return {
        title: `💼 ${baristaName}의 한마디`,
        content: `음... 자네, 잠깐 숨 고르는 중인가 보군.\n${item.emoji} "${item.text}"\n커피 식기 전에 한 모금 마시고 하게나.`,
      };

    case "pm":
      return {
        title: `⚡ ${baristaName} 휴식 감지`,
        content: `[유휴 상태 감지]\n${item.emoji} ${item.text}\n적절한 리프레시는 정시 퇴근 효율을 높입니다.`,
      };

    case "chaerin":
      return {
        title: `🃏 ${baristaName}의 도발(?) 톡`,
        content: `멍때리고 있을 시간 있나? ㅋㅋㅋ\n${item.emoji} "${item.text}"\n훗, 머리 식혔으면 어서 다음 거 치우러 가자고!`,
      };

    case "ropan":
      return {
        title: `🥀 ${baristaName}의 우아한(?) 톡`,
        content: `공녀, 잠시 휴식을 취하고 계시는군요.\n${item.emoji} "${item.text}"\n('휴, 나도 좀 쉬고 싶다... 같이 멍때릴까? ㅋㅋ')`,
      };

    case "barista":
    case "custom":
    default:
      return {
        title: `☕ ${baristaName}의 작은 쉼표`,
        content: `${item.emoji} ${item.text}`,
      };
  }
}
