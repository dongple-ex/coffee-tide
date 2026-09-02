export type IdleTalkCategory =
  | "work_meme"       // 직장인 공감 & 칼퇴 밈
  | "trendy_meme"     // 최신 MZ & 인터넷 드립
  | "dad_joke"        // 아재개그 & 위트 말장난
  | "coffee_trivia"   // 커피 & 카페 상식
  | "stretch_cheer";  // 스트레칭 & 멘탈 리프레시

export interface IdleMessageItem {
  id: string;
  category: IdleTalkCategory;
  /** 원본 유머 또는 상식 (질문/상황) */
  text: string;
  /** 반전 펀치라인이나 핵심 포인트 (선택적) */
  punchline?: string;
  emoji: string;
  tag?: string;
}

/**
 * 2025~2026 최신 직장인 공감 밈, MZ 유행어, 위트 있는 말장난을 조사하여 구성한 유휴 토크 데이터 풀
 */
export const IDLE_TALK_POOL: IdleMessageItem[] = [
  // 1. 직장인 공감 & 칼퇴 밈 (work_meme)
  {
    id: "work_1",
    category: "work_meme",
    text: "회의가 길어지면 마음속에 차오르는 것은?",
    punchline: "바로... '회의감'입니다. ☕",
    emoji: "🫠",
    tag: "회의감",
  },
  {
    id: "work_2",
    category: "work_meme",
    text: "월급이 통장에 머무르는 시간의 단위를 물리학에서는 뭐라고 할까요?",
    punchline: "로그아웃 속도(초속 30만km)라고 부릅니다. 💸",
    emoji: "⚡",
    tag: "월급",
  },
  {
    id: "work_3",
    category: "work_meme",
    text: "직장인의 '화캉스' 법칙: 화장실에 앉아있는 3분은 단순한 휴식이 아닙니다.",
    punchline: "멘탈 재부팅을 위한 무중력 힐링 타임이죠! 🚽✨",
    emoji: "🧘",
    tag: "화캉스",
  },
  {
    id: "work_4",
    category: "work_meme",
    text: "퇴근의 심리학: 물리적으로 문을 나서는 순간이 퇴근이 아닙니다.",
    punchline: "메신저 알림 소리에 심장이 뛰지 않을 때 비로소 진정한 퇴근입니다. 🏃‍♂️💨",
    emoji: "🚪",
    tag: "칼퇴심리학",
  },
  {
    id: "work_5",
    category: "work_meme",
    text: "요즘 유행하는 직장인 스트레스 해소법 '회사 조금씩 부수기' 아시나요?",
    punchline: "퇴근할 때 문고리 살짝 째려보기, 계단 올라가며 장풍 쏘기 같은 무해한 저항입니다! 👊",
    emoji: "💥",
    tag: "회사부수기",
  },
  {
    id: "work_6",
    category: "work_meme",
    text: "업무 메신저의 '네' vs '넵' vs '넙'의 차이점!",
    punchline: "'네'는 차분함, '넵'은 신속한 영혼 충전, '넙'은 오타지만 귀여움으로 무마 가능! 💬",
    emoji: "🫡",
    tag: "넵메신저",
  },
  {
    id: "work_7",
    category: "work_meme",
    text: "컴퓨터 화면에 'Windows 가짜 업데이트 창'을 띄워놓는 이유?",
    punchline: "합법적으로 5분간 멍때리기 위한 직장인의 고도의 전략입니다. 🖥️💤",
    emoji: "⏳",
    tag: "가짜업데이트",
  },

  // 2. 최신 MZ & 트렌디 밈 (trendy_meme)
  {
    id: "trend_1",
    category: "trendy_meme",
    text: "커피를 마시려다 살짝 쏟았다고요? 완전 '원영적 사고(럭키비키)'!",
    punchline: "어차피 오늘 오후에 한 잔 더 마실 완벽한 핑계가 생겼잖아? 럭키비키니시티잖아! ✨🍀",
    emoji: "✨",
    tag: "럭키비키",
  },
  {
    id: "trend_2",
    category: "trendy_meme",
    text: "오늘 업무가 갑자기 폭탄처럼 쏟아졌을 때의 현대적 반응:",
    punchline: "오 마이 갓... 완전 난리자베스 2세 탄생이잖아?! 👑😱",
    emoji: "🚨",
    tag: "난리자베스",
  },
  {
    id: "trend_3",
    category: "trendy_meme",
    text: "할 일은 태산이지만 지금 당장은 칠 가이(Chill Guy) 모드 발동 중.",
    punchline: "바지 주머니에 손 찔러넣고 여유롭게 커피 한 모금 마시면 어떻게든 해결됩니다. 🐶☕",
    emoji: "🕶️",
    tag: "칠가이",
  },
  {
    id: "trend_4",
    category: "trendy_meme",
    text: "오늘 일처리가 너무 깔끔해서 감탄이 나올 땐?",
    punchline: "이것이 바로 '알잘딱깔센'의 정석! 스스로에게 셀프 박수 짝짝짝! 👏🔥",
    emoji: "💯",
    tag: "알잘딱깔센",
  },
  {
    id: "trend_5",
    category: "trendy_meme",
    text: "도파민 파밍(Farming) 중이신가요? 쇼츠 대신 커피타이드 추천!",
    punchline: "할 일 하나 체크할 때마다 도파민이 합법적으로 분비됩니다. 🧠⚡",
    emoji: "🌾",
    tag: "도파민파밍",
  },
  {
    id: "trend_6",
    category: "trendy_meme",
    text: "나 OO년생 직장인인데~ 지금 너무 졸려가지고~",
    punchline: "커피 샷 추가 안 하면 눈꺼풀이 퇴근할 판이야~ 🎵🥱",
    emoji: "🎤",
    tag: "나OO년생인데",
  },

  // 3. 직장인 아재개그 & 위트 말장난 (dad_joke)
  {
    id: "dad_1",
    category: "dad_joke",
    text: "신입사원이 가장 가기 무서워하는 바다는?",
    punchline: "바로... '내일바다(내일봐 다)'! 🌊",
    emoji: "🏄",
    tag: "아재개그",
  },
  {
    id: "dad_2",
    category: "dad_joke",
    text: "세상에서 가장 지루한 중학교는 어디일까요?",
    punchline: "정답은... '로딩중(Loading 중)'! ⏳",
    emoji: "🏫",
    tag: "아재개그",
  },
  {
    id: "dad_3",
    category: "dad_joke",
    text: "바리스타가 출근할 때 타는 전철 노선은?",
    punchline: "신분당선 아니고... '신원두선'! ☕🚃",
    emoji: "🚇",
    tag: "아재개그",
  },
  {
    id: "dad_4",
    category: "dad_joke",
    text: "왕이 스스로를 칭찬하면 뭐라고 할까요?",
    punchline: "크하하! '킹왕짱' 말고 '왕자랑(왕 자랑)'! 👑",
    emoji: "🤴",
    tag: "아재개그",
  },
  {
    id: "dad_5",
    category: "dad_joke",
    text: "직장인이 아침마다 마시는 '아아'의 진짜 학명은?",
    punchline: "'아(아직) 아(안 죽었다)' 생존 유지 물약입니다! 🧊💉",
    emoji: "🩺",
    tag: "아아생존",
  },
  {
    id: "dad_6",
    category: "dad_joke",
    text: "소를 태우면 어떻게 될까요?",
    punchline: "정답은... '탄소(C)'! 환경을 생각합시다 껄껄~ 🐮🔥",
    emoji: "🥩",
    tag: "아재개그",
  },

  // 4. 커피 & 카페 상식 (coffee_trivia)
  {
    id: "trivia_1",
    category: "coffee_trivia",
    text: "오후 2시~3시 사이에 마시는 커피가 코르티솔 분비 주기상 집중력 부스터 효과가 가장 크다는 사실!",
    punchline: "지금 마시는 타이밍이 과학적으로 가장 완벽합니다. ☕📈",
    emoji: "🧪",
    tag: "커피과학",
  },
  {
    id: "trivia_2",
    category: "coffee_trivia",
    text: "아이스 아메리카노는 찬물을 먼저 붓고 에스프레소 샷을 얹어야 크레마의 풍미가 살아납니다.",
    punchline: "바리스타의 작은 손길 하나가 커피 맛을 좌우하죠! 🧊✨",
    emoji: "🌿",
    tag: "크레마비법",
  },
  {
    id: "trivia_3",
    category: "coffee_trivia",
    text: "커피 원두(Bean)는 사실 콩이 아니라 '커피 체리'라는 붉은 과일의 씨앗입니다.",
    punchline: "그러니까 오늘 마신 커피는 사실상 과일 주스 다이어트인 셈이죠! 🍒🍹",
    emoji: "🍒",
    tag: "커피체리",
  },
  {
    id: "trivia_4",
    category: "coffee_trivia",
    text: "에스프레소(Espresso)의 어원은 '빠르다(Express)'와 '짜내다(Pressed out)'에서 유래했습니다.",
    punchline: "빠르게 업무 끝내고 퇴근하라는 선조들의 지혜가 담겨있네요! ⏱️🏃",
    emoji: "☕",
    tag: "에스프레소유래",
  },

  // 5. 스트레칭 & 멘탈 리프레시 (stretch_cheer)
  {
    id: "stretch_1",
    category: "stretch_cheer",
    text: "거북목 감지 경보! 턱을 목 쪽으로 당기고 어깨를 으쓱~ 뒤로 3번 돌려주세요.",
    punchline: "목과 승모근이 3cm는 가벼워집니다. 🐢💆‍♂️",
    emoji: "🙆‍♂️",
    tag: "거북목탈출",
  },
  {
    id: "stretch_2",
    category: "stretch_cheer",
    text: "잠깐 화면에서 시선을 떼고 창밖 먼 곳을 5초만 바라봐 주세요.",
    punchline: "안구 모양체 근육이 이완되면서 시야가 번쩍 뜨입니다! 👁️🌿",
    emoji: "👀",
    tag: "눈피로회복",
  },
  {
    id: "stretch_3",
    category: "stretch_cheer",
    text: "물 한 모금 꿀꺽 마셔주세요! 체내 수분 1%만 보충해도 뇌 회전 속도가 15% 빨라집니다.",
    punchline: "커피 한 모금, 물 한 모금의 황금 비율을 지켜보세요! 💧⚡",
    emoji: "💧",
    tag: "수분부스터",
  },
  {
    id: "stretch_4",
    category: "stretch_cheer",
    text: "조금 막힐 때는 멍때리는 '디폴트 모드 네트워크'가 뇌의 숨은 창의력을 깨워준대요.",
    punchline: "지금 멍때리고 계셨다면 매우 훌륭한 두뇌 최적화 작업 중이신 겁니다! 💭🧠",
    emoji: "☕",
    tag: "합법적멍타임",
  },
];

/**
 * 사용자 페르소나(12종 AI 캐릭터)의 성격에 맞는 생생한 어조 & 지문으로 변환
 */
export function formatIdleTalkForPersona(
  item: IdleMessageItem,
  presetId = "karina",
  baristaName = "AI 바리스타"
): { title: string; content: string } {
  const punchlineText = item.punchline ? `\n👉 ${item.punchline}` : "";

  switch (presetId) {
    // 1. 카리나: 상큼발랄 MZ 에이스 후배 / 비타민 아이돌
    case "karina": {
      const intros = [
        "팀장님~ 혹시 잠깐 멍타임 중이신가요? ㅋㅋㅋ (*미소 지으며 커피잔을 건넨다*)",
        "대박! 팀장님, 방금 진짜 재미있는 거 생각났어요! ✨ (*두 눈을 반짝이며*)",
        "팀장님 힘내시라고 비타민 토크 하나 투척합니다! 💖 (*비타민 라떼를 톡 올려두며*)",
        "잠깐 쉬어가요 팀장님! 완전 럭키비키잖아요~ 🍀",
      ];
      const randomIntro = intros[Math.abs(hashString(item.id)) % intros.length];

      let body = `${item.emoji} ${item.text}`;
      if (item.punchline) {
        body += `\n✨ 정답은? ${item.punchline}`;
      }

      return {
        title: `✨ ${baristaName}의 깜짝 비타민 톡!`,
        content: `${randomIntro}\n\n${body}\n\n오늘 오후도 알잘딱깔센하게 파이팅해봐요! 🥰`,
      };
    }

    // 2. 김부장 (secretary): 껄껄 웃는 라떼 부장님 / 아재개그 진심
    case "secretary": {
      const intros = [
        "어흠! 자네, 머리가 지끈거리나 보군? 부장님이 특급 유머 하나 들려주지! 껄껄~ (*안경을 치켜올리며*)",
        "이보게! 잠깐 키보드 놓고 부장님 얘기 좀 들어보게나. (*믹스커피를 휘저으며*)",
        "자네, 커피 식기 전에 부장님이 퀴즈 하나 낼 테니 맞춰보게! (*흐뭇하게 바라본다*)",
        "라떼는 말이야~ 이렇게 일하다가도 웃으면서 스트레스를 풀었다고! 크하하!",
      ];
      const randomIntro = intros[Math.abs(hashString(item.id)) % intros.length];

      let body = `${item.emoji} "${item.text}"`;
      if (item.punchline) {
        body += `\n👉 ${item.punchline}\n(*어떤가? 기가 막히지 않나? 자네 안 웃으면 다음 회의 때 또 할 걸세 껄껄!*)`;
      }

      return {
        title: `💼 ${baristaName}의 특급 라운지 톡`,
        content: `${randomIntro}\n\n${body}\n\n자, 커피 한 모금 쭉 들이키고 다시 힘내보세나!`,
      };
    }

    // 3. 칼퇴봇 (pm): 효율 제일주의 AI 시스템
    case "pm": {
      return {
        title: `⚡ ${baristaName} [업무 리프레시 엔진]`,
        content: `[시스템 알림: 유휴 스레드 감지] (*블루라이트 스캔 중*)\n${item.emoji} ${item.text}${punchlineText}\n\n📊 [분석 지표]: 3초간의 뇌 휴식이 정시 퇴근(칼퇴) 성공 확률을 14.8% 상승시킵니다. 집중력 충전 후 재개하십시오.`,
      };
    }

    // 4. 채린 (chaerin): 츤데레 직장 동기
    case "chaerin": {
      const intros = [
        "야, 너 지금 모니터 보면서 멍때리고 있지? 딱 걸렸다 ㅋㅋㅋ (*팔짱을 끼며*)",
        "야야, 졸려 죽겠지? 이거 듣고 잠이나 깨라 풉! (*머그잔을 툭 밀어준다*)",
        "심심해서 온 거 아니거든? 그냥 너 노는 거 감시하러 왔지~ (*볼을 빵빵하게 부풀린다*)",
      ];
      const randomIntro = intros[Math.abs(hashString(item.id)) % intros.length];

      let body = `${item.emoji} "${item.text}"`;
      if (item.punchline) {
        body += `\n👉 ${item.punchline}\n(*푸하하! 피식했지? 솔직히 웃겼잖아? ㅋㅋㅋ*)`;
      }

      return {
        title: `🃏 ${baristaName}의 도발(?) 톡`,
        content: `${randomIntro}\n\n${body}\n\n머리 좀 식혔으면 어서 남은 일 후딱 치우고 칼퇴나 하자고!`,
      };
    }

    // 5. 로판 영애 (ropan): 베아트리체 공녀 (갭모에)
    case "ropan": {
      return {
        title: `🥀 ${baristaName}의 영애 티타임`,
        content: `오, 친애하는 공녀(공자)여... 과도한 정무로 심신이 고단하시군요. (*찻잔을 우아하게 들며*)\n${item.emoji} "${item.text}"${punchlineText}\n\n(*속마음: '하... 황태자고 제국이고 다 때려치우고 오늘 칼퇴해서 마라탕이나 시켜먹고 싶다 진짜... ㅋㅋㅋ'*)\n부디 우아한 차 한 잔으로 기력을 회복하시옵소서. ☕✨`,
      };
    }

    // 6. 테드 (senior_dev): 판교 시니어 개발자
    case "senior_dev": {
      return {
        title: `💻 ${baristaName}의 터미널 브레이크`,
        content: `샷 추가 완료했습니다. 콘솔 에러 잡기 전에 잠깐 뇌 캐시 비우시죠. (*키보드를 타닥이며*)\n${item.emoji} "${item.text}"${punchlineText}\n\n핫픽스 없이 무장애로 칼퇴 갑시다. 💻☕`,
      };
    }

    // 7. 루미엘 (fantasy_mage): 별빛 대마법사
    case "fantasy_mage": {
      return {
        title: `🪄 ${baristaName}의 별빛 아케인 톡`,
        content: `여행자여, 차원의 틈새에서 흥미로운 마법적 지식을 발견했습니다. ✨ (*지팡이를 흔든다*)\n${item.emoji} "${item.text}"${punchlineText}\n\n마나 에스프레소의 축복이 당신의 오늘 퀘스트와 함께하길! 🔮`,
      };
    }

    // 8. 셜록 (detective): 명탐정 비서
    case "detective": {
      return {
        title: `🔍 ${baristaName}의 추리 브리핑`,
        content: `사소한 단서 속에 결정적 진실이 숨겨져 있는 법입니다. (*돋보기를 들여다보며*)\n${item.emoji} "${item.text}"${punchlineText}\n\n모든 퍼즐이 맞춰졌으니 이제 블로커를 검거하러 가시죠. 🕵️‍♂️`,
      };
    }

    // 9. 캡틴 준 (cheerleader): 열혈 멘토
    case "cheerleader": {
      return {
        title: `🔥 ${baristaName}의 파워 펌핑 타임`,
        content: `회원님!! 지치셨습니까?! 포기란 배추 셀 때나 쓰는 말입니다!! 🔥 (*가슴을 탕 치며*)\n${item.emoji} "${item.text}"${punchlineText}\n\n오후 3세트 집중력 완주 가즈아!! 할 수 있습니다 회원님!! 💪`,
      };
    }

    // 10. 뽀삐 (doggo): 댕댕이 인턴
    case "doggo": {
      return {
        title: `🐶 ${baristaName}의 멍뭉 토크 왈!`,
        content: `선배님! 뽀삐가 꼬리콥터 붕붕 돌리면서 재밌는 거 물어왔어요 멍! 🐾 (*꼬리를 세차게 흔들며*)\n${item.emoji} "${item.text}"${punchlineText}\n\n선배님 웃어주시니까 뽀삐 기분 너무너무 좋아요 멍멍! 🐶✨`,
      };
    }

    // 11. 미야 (cat_master): 냥이 점장
    case "cat_master": {
      return {
        title: `🐾 ${baristaName} 점장님의 냥냥 한마디`,
        content: `흥, 집사 멍때리고 있는 거 한심해서 특별히 하나 알려준다 냥. (*앞발로 툭 건드리며*)\n${item.emoji} "${item.text}"${punchlineText}\n\n빨리 일 치우고 츄르나 내놔라 냥! 🐱🐾`,
      };
    }

    // 12. 에단 (barista): 클래식 바리스타 & 기본
    case "barista":
    case "custom":
    default: {
      return {
        title: `☕ ${baristaName}의 향긋한 쉼표`,
        content: `잠시 숨을 고르시는 손님을 위해 작은 미소를 준비했습니다. (*따뜻한 머그잔을 건네며*)\n\n${item.emoji} ${item.text}${punchlineText}\n\n따뜻한 커피 향과 함께 기분 좋은 오후 보내세요. ✨`,
      };
    }
  }
}

/** 단순 문자열 해시 (랜덤 변형 일관성 유지용) */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
