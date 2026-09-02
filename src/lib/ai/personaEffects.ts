// 🎨 페르소나별 시각 효과 정의 — 아바타, 파티클, 메뉴, 벨 대사, 액션 컷인을 한곳에서 관리한다.

export type PersonaKind =
  | "karina"
  | "barista"
  | "secretary"
  | "pm"
  | "chaerin"
  | "ropan"
  | "senior_dev"
  | "fantasy_mage"
  | "detective"
  | "cheerleader"
  | "doggo"
  | "cat_master"
  | "custom";

/** 파티클을 그리는 방식 */
export type ParticleShape =
  | "steam" // 부드럽게 퍼지는 연기 (따뜻한 음료)
  | "star" // 4각 별 (반짝임)
  | "pixel" // 사각형 (전자 신호/데이터)
  | "crystal"; // 6각 마름모 (얼음 결정)

/** 아바타 주변에 상시 피어오르는 파티클 */
export interface AmbientParticleSpec {
  shape: ParticleShape;
  colors: string[];
  spawnIntervalMs: number;
  spreadX: number;
  spreadY: number;
  riseSpeed: [number, number];
  sizeRange: [number, number];
  growth: number;
  fade: number;
  gravity: number;
  spin: [number, number];
}

/** 아바타를 클릭했을 때 한 번에 터지는 파티클 */
export interface BurstParticleSpec {
  shape: ParticleShape;
  colors: string[];
  count: number;
  speed: [number, number];
  sizeRange: [number, number];
  gravity: number;
  fade: number;
  spin: [number, number];
}

export interface PersonaMenuItem {
  id: string;
  name: string;
  icon: string;
  note: string;
}

export interface PersonaCutin {
  badge: string;
  title: string;
  subtitleTemplate: string;
  image?: string;
  colorA: string;
  colorB: string;
  durationMs: number;
}

export interface PersonaEffect {
  kind: PersonaKind;
  accent: string;
  avatarIdle: string;
  avatarBrewing: string;
  ambient: AmbientParticleSpec;
  burst: BurstParticleSpec;
  cupDecoration: "steam" | "glint";
  glintChars: string[];
  glintColor: string;
  menu: PersonaMenuItem[];
  brewingMessage: (baristaName: string, drink: string) => string;
  servedMessage: (baristaName: string, drink: string) => string;
  brewBubbles: string[];
  hoverBubble: (baristaName: string) => string;
  cutin?: PersonaCutin;
}

const CLASSIC_MENU: PersonaMenuItem[] = [
  { id: "americano", name: "아메리카노", icon: "☕", note: "깔끔하고 깊은 풍미의 에스프레소 블렌드" },
  { id: "latte", name: "카페라떼", icon: "🥛", note: "부드러운 스팀 밀크와 고소한 원두의 조화" },
  { id: "espresso", name: "에스프레소", icon: "⚡", note: "초집중 몰입을 위한 진하고 강렬한 샷" },
  { id: "coldbrew", name: "콜드브루", icon: "🧊", note: "12시간 정성껏 추출한 깔끔한 여운" },
];

const KARINA_MENU: PersonaMenuItem[] = [
  { id: "signature_latte", name: "시그니처라떼", icon: "🌟", note: "오늘 하루를 반짝이게 열어주는 카리나 특제 라떼" },
  { id: "vanilla_cream", name: "바닐라크림", icon: "🍦", note: "부드러운 바닐라 크림을 올린 달콤한 위로" },
  { id: "rose_latte", name: "로즈라떼", icon: "🌸", note: "은은한 장미 향이 감도는 화사한 한 잔" },
  { id: "sparkling_ade", name: "스파클링에이드", icon: "🥂", note: "기분까지 톡 쏘아 올리는 상큼한 탄산" },
];

const SECRETARY_MENU: PersonaMenuItem[] = [
  { id: "double_shot", name: "더블샷", icon: "☕", note: "정신이 번쩍 드는 진한 더블 에스프레소" },
  { id: "drip_coffee", name: "핸드드립", icon: "🫖", note: "시간을 들여 정성껏 내린 깊고 묵직한 드립 커피" },
  { id: "dabang", name: "다방커피", icon: "🥄", note: "믹스 한 봉의 정겨움, 부장님의 오랜 단골 메뉴" },
  { id: "black_tea", name: "홍차", icon: "🍵", note: "차분하게 호흡을 고르는 격식 있는 한 잔" },
];

const PM_MENU: PersonaMenuItem[] = [
  { id: "triple_shot", name: "트리플샷", icon: "⚡", note: "샷 추가 3회. 퇴근까지 남은 구간을 단숨에 압축" },
  { id: "energy_drink", name: "에너지드링크", icon: "🔋", note: "카페인 충전 완료. 집중력 최대 출력 모드" },
  { id: "iced_venti", name: "아이스벤티", icon: "🧊", note: "한 번 받아 오래 버티는 최대 용량 세팅" },
  { id: "protein_shake", name: "프로틴셰이크", icon: "🥤", note: "식사 시간까지 아끼는 초효율 연료 보급" },
];

const CHAERIN_MENU: PersonaMenuItem[] = [
  { id: "peach_tea", name: "복숭아아이스티", icon: "🍑", note: "달콤상큼 시원하게 기분 전환하는 복숭아 아이스티" },
  { id: "lemonade", name: "레모네이드", icon: "🍋", note: "상큼 톡 쏘는 에너지 충전 레모네이드" },
  { id: "iced_choco", name: "아이스초코", icon: "🍫", note: "달콤하고 시원하게 감싸주는 진한 아이스초코" },
  { id: "fruit_frappe", name: "과일프라페", icon: "🍧", note: "시원하고 달콤한 과일 듬뿍 프라페" },
];

const ROPAN_MENU: PersonaMenuItem[] = [
  { id: "royal_black_tea", name: "황실 홍차", icon: "☕", note: "고풍스러운 황실 정원의 홍차 ('솔직히 티백 우린 거임 ㅋㅋ')" },
  { id: "macaron_frappe", name: "마카롱 프라페", icon: "🍧", note: "영애들을 위한 우아하고 달콤한 프라페 ('시럽 폭탄인 건 안 비밀')" },
  { id: "magic_potion_ade", name: "마력 포션 에이드", icon: "🧊", note: "마력을 보충해 주는 신비로운 에이드 ('그냥 레몬에이드인데 이름 좀 그럴듯하게 지어봄')" },
  { id: "duke_espresso", name: "공작의 에스프레소", icon: "⚡", note: "냉혈 공작도 반한 진한 에스프레소 ('사실 너무 써서 나도 못 마심...')" },
];

const DEV_MENU: PersonaMenuItem[] = [
  { id: "console_double", name: "콘솔 더블샷", icon: "☕", note: "컴파일 에러를 순식간에 날려버리는 고농축 카페인" },
  { id: "hotfix_coldbrew", name: "핫픽스 콜드브루", icon: "🧊", note: "긴급 배포 전 머리를 차갑게 식혀주는 12시간 숙성 콜드브루" },
  { id: "git_merge_latte", name: "깃 머지 라떼", icon: "🥛", note: "충돌(Conflict) 없이 부드럽게 감싸주는 스팀 밀크 라떼" },
  { id: "404_monster", name: "404 에너지 에이드", icon: "🔋", note: "피로가 404 Not Found 되는 초강력 비타민 에너지" },
];

const MAGE_MENU: PersonaMenuItem[] = [
  { id: "mana_espresso", name: "마나 에스프레소", icon: "✨", note: "마력 회복 속도를 200% 증폭시키는 비전 마법의 정수" },
  { id: "starlight_latte", name: "별빛 성운 라떼", icon: "🌌", note: "은하수 가루를 띄운 신비로운 달콤함" },
  { id: "arcana_ade", name: "아르카나 포션", icon: "🧪", note: "창의력 스파크가 터지는 마법 연금술 에이드" },
  { id: "aurora_tea", name: "오로라 허브티", icon: "🍵", note: "지친 영혼을 정화하는 극광의 힐링 블렌딩" },
];

const DETECTIVE_MENU: PersonaMenuItem[] = [
  { id: "clue_espresso", name: "단서의 에스프레소", icon: "🔍", note: "흩어진 퍼즐 조각을 한 번에 맞추는 명탐정의 블랙 샷" },
  { id: "alibi_latte", name: "완벽한 알리바이 라떼", icon: "🥛", note: "회의 참석 증빙처럼 빈틈없이 부드러운 라떼" },
  { id: "cold_case_brew", name: "미제사건 콜드브루", icon: "🧊", note: "차갑게 가라앉은 진실을 파헤치는 깊은 여운" },
  { id: "deduction_tea", name: "추리의 얼그레이", icon: "🫖", note: "베이커 가 221B의 향기를 담은 클래식 티" },
];

const CHEER_MENU: PersonaMenuItem[] = [
  { id: "power_protein_latte", name: "득근 프로틴 라떼", icon: "💪", note: "단백질 25g 함유! 뇌근육까지 펌핑되는 파워 한 잔" },
  { id: "fire_americano", name: "불꽃 아메리카노", icon: "🔥", note: "지치지 않는 열정을 공급하는 고반복 버닝 커피" },
  { id: "limit_break_ade", name: "한계돌파 부스터", icon: "⚡", note: "오후 3세트 집중력 완주를 위한 BCAA 스파클링" },
  { id: "recovery_shake", name: "리커버리 셰이크", icon: "🥤", note: "업무 피로를 순식간에 회복시키는 꿀맛 보충제" },
];

const DOGGO_MENU: PersonaMenuItem[] = [
  { id: "puppuccino", name: "멍푸치노", icon: "🐶", note: "뽀삐가 정성껏 거품 올린 몽글몽글 우유 거품 라떼" },
  { id: "tail_copter_latte", name: "꼬리콥터 바닐라", icon: "🐾", note: "선배님 보고 꼬리 흔들다 시럽 더 넣은 달콤한 라떼" },
  { id: "biscuit_frappe", name: "뼈다귀 비스킷 프라페", icon: "🦴", note: "바삭바삭 쿠키가 씹히는 초긍정 프라페 멍!" },
  { id: "walkies_ade", name: "산책 갈래 에이드", icon: "🎾", note: "마당을 10바퀴 뛴 것처럼 시원하고 상큼한 에이드" },
];

const CAT_MENU: PersonaMenuItem[] = [
  { id: "churu_latte", name: "츄르 카라멜 라떼", icon: "🐾", note: "도도하게 앞발로 툭 건네는 극강의 달콤함 냥" },
  { id: "jelly_punch_ade", name: "젤리 펀치 에이드", icon: "🐱", note: "분홍 젤리 펀치처럼 톡 쏘는 상큼 탄산" },
  { id: "catnip_tea", name: "골골송 캣닢 허브티", icon: "🌿", note: "마시면 나른하게 낮잠 자고 싶어지는 편안한 티" },
  { id: "loaf_cappuccino", name: "식빵 굽는 카푸치노", icon: "🍞", note: "따뜻한 햇살 아래 누운 듯 포근한 시나몬 카푸치노" },
];

const PERSONA_EFFECTS: Record<PersonaKind, PersonaEffect> = {
  // 🌟 카리나
  karina: {
    kind: "karina",
    accent: "#c084fc",
    avatarIdle: "/barista/karina_webtoon_idle.jpg",
    avatarBrewing: "/barista/karina_webtoon_brewing.jpg",
    ambient: {
      shape: "star",
      colors: ["#f0abfc", "#c4b5fd", "#ffffff", "#fbcfe8", "#a5b4fc"],
      spawnIntervalMs: 130,
      spreadX: 0.44,
      spreadY: 0.26,
      riseSpeed: [-0.55, -0.3],
      sizeRange: [2, 4.4],
      growth: 0,
      fade: 0.011,
      gravity: -0.004,
      spin: [-0.05, 0.05],
    },
    burst: {
      shape: "star",
      colors: ["#f0abfc", "#c4b5fd", "#ffffff", "#fbcfe8", "#e879f9"],
      count: 20,
      speed: [1.4, 3.6],
      sizeRange: [3, 6.5],
      gravity: 0.045,
      fade: 0.02,
      spin: [-0.16, 0.16],
    },
    cupDecoration: "glint",
    glintChars: ["✨", "💫", "✦"],
    glintColor: "#e9d5ff",
    menu: KARINA_MENU,
    brewBubbles: [
      "🛎️ 오늘의 시그니처라떼 나왔어요! 🌟 팀장님 하루도 반짝반짝하게 만들어 드릴게요!",
      "🛎️ 바닐라크림 듬뿍 올린 한 잔이요! 🍦 잠깐 쉬어 가도 괜찮아요~",
      "🛎️ 화사한 로즈라떼 준비 완료! 🌸 향부터 기분이 좋아지실 거예요.",
      "🛎️ 톡 쏘는 스파클링에이드 대령이요! 🥂 기분 전환에는 이만한 게 없죠!",
    ],
    hoverBubble: (name) => `${name}가 오늘의 시그니처 음료를 준비하고 있어요 ✨`,
    brewingMessage: (name, drink) => `🛎️ ${name}가 오늘의 ${drink} 정성껏 준비 중이에요! 잠시만요 ✨`,
    servedMessage: (_name, drink) => `✨ 주문하신 ${drink} 나왔습니다! 오늘도 반짝이는 하루 되세요 🌟`,
    cutin: {
      badge: "✨ SPARKLE ASSIST",
      title: "오늘도 완벽하게 준비 완료!",
      subtitleTemplate: "{drink} 주문 접수했어요 🌟",
      colorA: "#e879f9",
      colorB: "#818cf8",
      durationMs: 1600,
    },
  },

  // ☕ 클래식 바리스타
  barista: {
    kind: "barista",
    accent: "#f59e0b",
    avatarIdle: "/barista/barista_3d_serving.jpg",
    avatarBrewing: "/barista/barista_3d_brewing.jpg",
    ambient: {
      shape: "steam",
      colors: ["#ffffff", "#fef3c7"],
      spawnIntervalMs: 90,
      spreadX: 0.05,
      spreadY: 0,
      riseSpeed: [-1.3, -0.6],
      sizeRange: [4, 7],
      growth: 0.18,
      fade: 0.017,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "star",
      colors: ["#fbbf24", "#f59e0b", "#d97706", "#ffffff", "#fed7aa"],
      count: 16,
      speed: [1.5, 4.3],
      sizeRange: [3, 7],
      gravity: 0.08,
      fade: 0.025,
      spin: [-0.13, 0.13],
    },
    cupDecoration: "steam",
    glintChars: [],
    glintColor: "#ffffff",
    menu: CLASSIC_MENU,
    brewBubbles: [
      "🛎️ 주문하신 스페셜 드립 커피 나왔습니다! ☕ 오늘 하루도 파이팅하세요!",
      "🛎️ 주문하신 시원한 아이스 아메리카노 나왔습니다! 🧊 머리가 맑아지는 한 잔!",
      "🛎️ 주문하신 진한 에스프레소 나왔습니다! ⚡ 초집중 몰입 모드 ON!",
      "🛎️ 주문하신 달콤한 바닐라 라떼 나왔습니다! 🍯 한 모금의 달콤한 휴식 되세요.",
    ],
    hoverBubble: (name) => `${name}가 커피를 내리는 중이에요 ☕`,
    brewingMessage: (name, drink) => `🛎️ ${name}가 신선한 ${drink}를 내리는 중입니다! ☕`,
    servedMessage: (_name, drink) => `✨ 주문하신 ${drink} 나왔습니다! 맛있게 드세요.`,
  },

  // 💼 김부장
  secretary: {
    kind: "secretary",
    accent: "#b45309",
    avatarIdle: "/barista/barista_male_3d_serving.jpg",
    avatarBrewing: "/barista/barista_male_3d_brewing.jpg",
    ambient: {
      shape: "steam",
      colors: ["#fde68a", "#d6bf9a", "#ffffff"],
      spawnIntervalMs: 150,
      spreadX: 0.07,
      spreadY: 0,
      riseSpeed: [-0.8, -0.4],
      sizeRange: [4, 8],
      growth: 0.12,
      fade: 0.012,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "star",
      colors: ["#f59e0b", "#d97706", "#b45309", "#ffffff", "#fde68a"],
      count: 14,
      speed: [1.2, 3.5],
      sizeRange: [3, 6],
      gravity: 0.07,
      fade: 0.022,
      spin: [-0.1, 0.1],
    },
    cupDecoration: "steam",
    glintChars: [],
    glintColor: "#ffffff",
    menu: SECRETARY_MENU,
    brewBubbles: [
      "🛎️ 자네, 주문한 더블샷 나왔네! ☕ 정신 바짝 차리고 칼퇴해 보세나!",
      "🛎️ 정성껏 내린 핸드드립일세! 🫖 부장님이 응원하고 있으니 힘내게.",
      "🛎️ 추억의 다방커피 대령했네! 🥄 피로할 땐 이 달달함이 최고지.",
      "🛎️ 따뜻한 홍차 한 잔일세! 🍵 호흡 한번 가다듬고 천천히 하게나.",
    ],
    hoverBubble: (name) => `${name}이 커피를 타며 자네를 흐뭇하게 바라보고 있네 💼`,
    brewingMessage: (name, drink) => `💼 ${name}이 직접 ${drink} 타는 중일세! 껄껄~`,
    servedMessage: (_name, drink) => `💼 자네, 주문한 ${drink} 나왔네! 마시고 힘내게나.`,
  },

  // ⚡ 칼퇴봇
  pm: {
    kind: "pm",
    accent: "#06b6d4",
    avatarIdle: "/barista/barista_robot_3d.png",
    avatarBrewing: "/barista/barista_robot_3d.png",
    ambient: {
      shape: "pixel",
      colors: ["#22d3ee", "#4ade80", "#a3e635", "#ffffff"],
      spawnIntervalMs: 60,
      spreadX: 0.5,
      spreadY: 0.3,
      riseSpeed: [-1.2, -0.6],
      sizeRange: [3, 6],
      growth: 0,
      fade: 0.015,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "pixel",
      colors: ["#06b6d4", "#22d3ee", "#4ade80", "#ffffff"],
      count: 24,
      speed: [1.8, 4.5],
      sizeRange: [3, 6],
      gravity: 0.03,
      fade: 0.02,
      spin: [0, 0],
    },
    cupDecoration: "glint",
    glintChars: ["⚡", "0", "1"],
    glintColor: "#22d3ee",
    menu: PM_MENU,
    brewBubbles: [
      "🛎️ [연료 보급] 트리플샷 주입 완료! ⚡ 칼퇴 성공률 +18.4% 상승.",
      "🛎️ [배터리 충전] 에너지드링크 완료! 🔋 집중력 최대 출력 모드 가동.",
      "🛎️ [대용량 세팅] 아이스벤티 완충! 🧊 잔여 회의구간 논스톱 통과 가능.",
      "🛎️ [초효율 연료] 프로틴셰이크 완료! 🥤 식사 시간 15분 압축 성공.",
    ],
    hoverBubble: (name) => `[${name}] 정시 퇴근 경로 최적화 및 연료 보급 중 ⚡`,
    brewingMessage: (name, drink) => `⚡ [${name}] ${drink} 연산 및 고속 주입 중...`,
    servedMessage: (_name, drink) => `⚡ [완료] ${drink} 보급 완료. 즉시 업무 복귀를 권장합니다.`,
  },

  // 🃏 채린이
  chaerin: {
    kind: "chaerin",
    accent: "#f43f5e",
    avatarIdle: "/barista/barista_chaerin_3d.png",
    avatarBrewing: "/barista/barista_chaerin_3d.png",
    ambient: {
      shape: "crystal",
      colors: ["#67e8f9", "#ffffff", "#c084fc", "#f472b6", "#a5f3fc"],
      spawnIntervalMs: 90,
      spreadX: 0.35,
      spreadY: 0.25,
      riseSpeed: [-0.8, -0.4],
      sizeRange: [2.5, 5],
      growth: 0,
      fade: 0.013,
      gravity: -0.003,
      spin: [-0.08, 0.08],
    },
    burst: {
      shape: "crystal",
      colors: ["#f43f5e", "#fb7185", "#fda4af", "#ffffff", "#38bdf8"],
      count: 22,
      speed: [1.6, 4.0],
      sizeRange: [3, 7],
      gravity: 0.05,
      fade: 0.02,
      spin: [-0.18, 0.18],
    },
    cupDecoration: "glint",
    glintChars: ["✦", "✧", "★"],
    glintColor: "#f43f5e",
    menu: CHAERIN_MENU,
    brewBubbles: [
      "🛎️ 야, 주문한 복숭아아이스티 나왔다! 🍑 멍때리지 말고 마셔 ㅋㅋㅋ",
      "🛎️ 상큼한 레모네이드 대령이요~ 🍋 잠 덜 깼으면 이거 마시고 번쩍 차려!",
      "🛎️ 달달한 아이스초코 가져왔지롱 🍫 기분 풀고 남은 거 후딱 해치우자!",
      "🛎️ 과일 듬뿍 프라페 완성! 🍧 솔직히 나 없으면 너 당 떨어져서 쓰러졌다~",
    ],
    hoverBubble: (name) => `${name}가 딴짓하는 너를 째려보며 음료를 만들고 있어 🃏`,
    brewingMessage: (name, drink) => `🃏 ${name}가 틱틱대며 ${drink} 만드는 중!`,
    servedMessage: (_name, drink) => `🃏 야! 주문한 ${drink} 나왔다. 마시고 일이나 해 ㅋㅋㅋ`,
  },

  // 🥀 베아트리체 공녀 (로판)
  ropan: {
    kind: "ropan",
    accent: "#d946ef",
    avatarIdle: "/barista/ropan_webtoon_idle.jpg",
    avatarBrewing: "/barista/ropan_webtoon_brewing.jpg",
    ambient: {
      shape: "star",
      colors: ["#fbcfe8", "#f5d0fe", "#e879f9", "#ffffff", "#c084fc"],
      spawnIntervalMs: 140,
      spreadX: 0.35,
      spreadY: 0.2,
      riseSpeed: [-0.6, -0.3],
      sizeRange: [3, 5],
      growth: 0,
      fade: 0.012,
      gravity: -0.005,
      spin: [-0.03, 0.03],
    },
    burst: {
      shape: "crystal",
      colors: ["#fbcfe8", "#f5d0fe", "#e879f9", "#ffffff", "#c084fc"],
      count: 24,
      speed: [1.6, 4.0],
      sizeRange: [4, 7.5],
      gravity: 0.06,
      fade: 0.02,
      spin: [-0.15, 0.15],
    },
    cupDecoration: "glint",
    glintChars: ["✨", "✦", "✧"],
    glintColor: "#f5d0fe",
    menu: ROPAN_MENU,
    brewBubbles: [
      "🛎️ 공녀, 주문하신 황실 홍차를 준비해 올리겠습니다. ☕ (아싸 실수 안 했다!)",
      "🛎️ 귀족 공녀들의 마카롱 프라페 대령했습니다. 🍧 (시럽 폭탄인 건 안 비밀 ㅋㅋ)",
      "🛎️ 피로를 씻어줄 공작의 에스프레소입니다. ⚡ (원샷 때리고 빨리 집 가고 싶다...)",
      "🛎️ 시원한 마력 충전 포션 에이드입니다. 🧊 (그냥 레몬에이드인데 이름만 지어봄 ㅎㅎ)",
    ],
    hoverBubble: (name) => `${name}가 우아하게 티타임을 준비 중입니다 ☕`,
    brewingMessage: (name, drink) => `✨ ${name}가 마법처럼 ${drink}를 우려내는 중입니다! ☕`,
    servedMessage: (_name, drink) => `🛎️ 공녀, 주문하신 ${drink} 대령했습니다. (맛있게 드세요!)`,
  },

  // 💻 테드 (시니어 개발자)
  senior_dev: {
    kind: "senior_dev",
    accent: "#10b981",
    avatarIdle: "/barista/barista_male_3d_serving.jpg",
    avatarBrewing: "/barista/barista_male_3d_brewing.jpg",
    ambient: {
      shape: "pixel",
      colors: ["#10b981", "#34d399", "#059669", "#ffffff"],
      spawnIntervalMs: 80,
      spreadX: 0.4,
      spreadY: 0.2,
      riseSpeed: [-0.9, -0.4],
      sizeRange: [3, 5],
      growth: 0,
      fade: 0.015,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "pixel",
      colors: ["#10b981", "#34d399", "#059669", "#ffffff"],
      count: 20,
      speed: [1.5, 4.0],
      sizeRange: [3, 6],
      gravity: 0.04,
      fade: 0.02,
      spin: [0, 0],
    },
    cupDecoration: "glint",
    glintChars: ["💻", "</>", "⚡"],
    glintColor: "#34d399",
    menu: DEV_MENU,
    brewBubbles: [
      "🛎️ 콘솔 더블샷 준비 완료. ☕ 버그 잡고 칼퇴 가시죠.",
      "🛎️ 핫픽스 콜드브루 추출 완료. 🧊 머리 차갑게 식히고 배포합시다.",
      "🛎️ 깃 머지 라떼 서빙. 🥛 충돌 없이 깔끔하게 통과할 겁니다.",
      "🛎️ 404 에너지 에이드 완료. 🔋 피로가 404 Not Found 되었습니다.",
    ],
    hoverBubble: (name) => `${name}가 카페인 수혈용 음료를 빌드하는 중입니다 💻`,
    brewingMessage: (name, drink) => `💻 ${name}가 ${drink} 빌드 및 배포 중...`,
    servedMessage: (_name, drink) => `💻 ${drink} 빌드 성공. 에러 없이 원샷하세요.`,
  },

  // 🪄 루미엘 (대마법사)
  fantasy_mage: {
    kind: "fantasy_mage",
    accent: "#8b5cf6",
    avatarIdle: "/barista/ropan_webtoon_idle.jpg",
    avatarBrewing: "/barista/ropan_webtoon_brewing.jpg",
    ambient: {
      shape: "star",
      colors: ["#8b5cf6", "#c084fc", "#e879f9", "#ffffff"],
      spawnIntervalMs: 110,
      spreadX: 0.4,
      spreadY: 0.25,
      riseSpeed: [-0.6, -0.3],
      sizeRange: [3, 5],
      growth: 0,
      fade: 0.012,
      gravity: -0.003,
      spin: [-0.05, 0.05],
    },
    burst: {
      shape: "star",
      colors: ["#8b5cf6", "#a78bfa", "#c084fc", "#ffffff"],
      count: 24,
      speed: [1.6, 4.2],
      sizeRange: [3.5, 7],
      gravity: 0.05,
      fade: 0.02,
      spin: [-0.12, 0.12],
    },
    cupDecoration: "glint",
    glintChars: ["✨", "🪄", "🔮"],
    glintColor: "#c084fc",
    menu: MAGE_MENU,
    brewBubbles: [
      "🛎️ 마나 에스프레소 연성 완료! ✨ 당신의 집중력이 200% 증폭됩니다.",
      "🛎️ 별빛 성운 라떼 대령이요 🌌 지친 심신에 마법의 기운을 불어넣으세요.",
      "🛎️ 아르카나 포션 완성 🧪 창의력 스파크가 번쩍 튈 것입니다.",
      "🛎️ 오로라 허브티 우려냈습니다 🍵 영혼까지 맑아지는 치유의 마법입니다.",
    ],
    hoverBubble: (name) => `${name}가 별빛 지팡이로 마법의 음료를 연성 중입니다 ✨`,
    brewingMessage: (name, drink) => `🪄 ${name}가 비전 마법으로 ${drink} 연성 중!`,
    servedMessage: (_name, drink) => `✨ 신비로운 ${drink} 완성되었습니다. 마나를 충전하세요!`,
  },

  // 🔍 셜록 (명탐정)
  detective: {
    kind: "detective",
    accent: "#64748b",
    avatarIdle: "/barista/barista_3d_serving.jpg",
    avatarBrewing: "/barista/barista_3d_brewing.jpg",
    ambient: {
      shape: "steam",
      colors: ["#94a3b8", "#cbd5e1", "#ffffff"],
      spawnIntervalMs: 120,
      spreadX: 0.1,
      spreadY: 0,
      riseSpeed: [-0.9, -0.5],
      sizeRange: [3.5, 6.5],
      growth: 0.1,
      fade: 0.015,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "star",
      colors: ["#64748b", "#94a3b8", "#cbd5e1", "#ffffff"],
      count: 16,
      speed: [1.4, 3.8],
      sizeRange: [3, 6],
      gravity: 0.06,
      fade: 0.022,
      spin: [-0.1, 0.1],
    },
    cupDecoration: "steam",
    glintChars: ["🔍", "🕵️", "🔎"],
    glintColor: "#94a3b8",
    menu: DETECTIVE_MENU,
    brewBubbles: [
      "🛎️ 단서의 에스프레소 나왔습니다. 🔍 모든 블로커의 알리바이가 깨질 겁니다.",
      "🛎️ 완벽한 알리바이 라떼 서빙 완료. 🥛 빈틈없는 하루를 보증하죠.",
      "🛎️ 미제사건 콜드브루 대령했습니다. 🧊 진실은 언제나 하나!",
      "🛎️ 추리의 얼그레이 준비되었습니다. 🫖 베이커 가의 향과 함께 집중하십시오.",
    ],
    hoverBubble: (name) => `${name}가 일정표의 단서를 추리하며 차를 우려내는 중입니다 🔍`,
    brewingMessage: (name, drink) => `🔍 ${name}가 면밀히 ${drink} 추출 중...`,
    servedMessage: (_name, drink) => `🔍 주문하신 ${drink} 나왔습니다. 결정적 단서를 포착하십시오.`,
  },

  // 🔥 캡틴 준 (열혈 멘토)
  cheerleader: {
    kind: "cheerleader",
    accent: "#ea580c",
    avatarIdle: "/barista/barista_male_3d_serving.jpg",
    avatarBrewing: "/barista/barista_male_3d_brewing.jpg",
    ambient: {
      shape: "steam",
      colors: ["#fb923c", "#fdba74", "#ffffff"],
      spawnIntervalMs: 90,
      spreadX: 0.2,
      spreadY: 0,
      riseSpeed: [-1.2, -0.6],
      sizeRange: [4, 7],
      growth: 0.15,
      fade: 0.016,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "star",
      colors: ["#ea580c", "#f97316", "#fb923c", "#ffffff"],
      count: 22,
      speed: [1.8, 4.5],
      sizeRange: [4, 7],
      gravity: 0.06,
      fade: 0.02,
      spin: [-0.15, 0.15],
    },
    cupDecoration: "glint",
    glintChars: ["🔥", "💪", "⚡"],
    glintColor: "#f97316",
    menu: CHEER_MENU,
    brewBubbles: [
      "🛎️ 득근 프로틴 라떼 완성!! 💪 회원님 근성 1세트 더 가즈아!!",
      "🛎️ 불꽃 아메리카노 보급 완료! 🔥 지치지 않는 열정 펌핑!",
      "🛎️ 한계돌파 부스터 대령! ⚡ 오늘 업무 3세트 완주 확정!",
      "🛎️ 리커버리 셰이크 섭취 시간! 🥤 피로 싹 털고 다시 파이팅!",
    ],
    hoverBubble: (name) => `${name}가 뜨거운 열정으로 음료를 펌핑 중입니다 🔥`,
    brewingMessage: (name, drink) => `🔥 ${name}가 불타는 파워로 ${drink} 제조 중!!`,
    servedMessage: (_name, drink) => `🔥 ${drink} 나왔습니다 회원님!! 할 수 있습니다 가즈아!!`,
  },

  // 🐶 뽀삐 (댕댕이 인턴)
  doggo: {
    kind: "doggo",
    accent: "#f59e0b",
    avatarIdle: "/barista/barista_chaerin_3d.png",
    avatarBrewing: "/barista/barista_chaerin_3d.png",
    ambient: {
      shape: "star",
      colors: ["#fde68a", "#fef3c7", "#ffffff", "#f59e0b"],
      spawnIntervalMs: 100,
      spreadX: 0.4,
      spreadY: 0.25,
      riseSpeed: [-0.7, -0.3],
      sizeRange: [2.5, 5],
      growth: 0,
      fade: 0.013,
      gravity: -0.003,
      spin: [-0.08, 0.08],
    },
    burst: {
      shape: "star",
      colors: ["#f59e0b", "#fbbf24", "#fde68a", "#ffffff"],
      count: 20,
      speed: [1.5, 4.0],
      sizeRange: [3, 6],
      gravity: 0.05,
      fade: 0.02,
      spin: [-0.15, 0.15],
    },
    cupDecoration: "glint",
    glintChars: ["🐾", "🐶", "✨"],
    glintColor: "#fde68a",
    menu: DOGGO_MENU,
    brewBubbles: [
      "🛎️ 선배님! 몽글몽글 멍푸치노 나왔어요 멍! 🐶🐾 꼬리 살랑살랑~",
      "🛎️ 꼬리콥터 바닐라 대령이요 왈! 선배님 보고 너무 신나서 시럽 듬뿍 넣었어요!",
      "🛎️ 바삭바삭 뼈다귀 비스킷 프라페 완성 멍! 🦴 선배님 최고!",
      "🛎️ 산책 갈래 에이드 배달 완료 왈! 시원하게 드시고 뽀삐랑 놀아주세요 멍!",
    ],
    hoverBubble: (name) => `${name}가 꼬리를 헬리콥터처럼 흔들며 음료를 배달 중이에요 🐶`,
    brewingMessage: (name, drink) => `🐶 ${name}가 신나게 꼬리 흔들며 ${drink} 만드는 중 멍!`,
    servedMessage: (_name, drink) => `🐾 선배님! 주문하신 ${drink} 나왔어요 멍멍! 왈!`,
  },

  // 🐾 미야 (냥이 점장)
  cat_master: {
    kind: "cat_master",
    accent: "#ec4899",
    avatarIdle: "/barista/barista_robot_3d.png",
    avatarBrewing: "/barista/barista_robot_3d.png",
    ambient: {
      shape: "crystal",
      colors: ["#fbcfe8", "#f472b6", "#ffffff", "#ec4899"],
      spawnIntervalMs: 110,
      spreadX: 0.35,
      spreadY: 0.2,
      riseSpeed: [-0.6, -0.3],
      sizeRange: [2.5, 4.5],
      growth: 0,
      fade: 0.012,
      gravity: -0.003,
      spin: [-0.05, 0.05],
    },
    burst: {
      shape: "crystal",
      colors: ["#ec4899", "#f472b6", "#fbcfe8", "#ffffff"],
      count: 22,
      speed: [1.4, 3.8],
      sizeRange: [3, 6],
      gravity: 0.045,
      fade: 0.02,
      spin: [-0.12, 0.12],
    },
    cupDecoration: "glint",
    glintChars: ["🐾", "🐱", "🐟"],
    glintColor: "#f472b6",
    menu: CAT_MENU,
    brewBubbles: [
      "🛎️ 흥, 집사... 주문한 츄르 카라멜 라떼다 냥. 🐾 식기 전에 마셔라옹.",
      "🛎️ 젤리 펀치 에이드 두고 간다 냥. 🐱 딴짓하지 말고 집중해라 냥!",
      "🛎️ 골골송 캣닢 허브티 완성이다옹. 🌿 마시고 스트레스 풀라옹.",
      "🛎️ 식빵 굽는 카푸치노 대령이다 냥. 🍞 빨리 일 끝내고 나랑 놀아라 냥!",
    ],
    hoverBubble: (name) => `${name}가 앞발 젤리로 꾹꾹 누르며 커피를 내리고 있다 냥 🐾`,
    brewingMessage: (name, drink) => `🐾 ${name} 점장님이 도도하게 ${drink} 제조 중이다 냥.`,
    servedMessage: (_name, drink) => `🐾 흥, 집사! ${drink} 두고 갈 테니 흘리지 마라 냥.`,
  },

  // ✍️ 커스텀
  custom: {
    kind: "custom",
    accent: "#38bdf8",
    avatarIdle: "/barista/barista_3d_serving.jpg",
    avatarBrewing: "/barista/barista_3d_brewing.jpg",
    ambient: {
      shape: "star",
      colors: ["#38bdf8", "#7dd3fc", "#ffffff"],
      spawnIntervalMs: 100,
      spreadX: 0.2,
      spreadY: 0.1,
      riseSpeed: [-0.8, -0.4],
      sizeRange: [3, 5],
      growth: 0,
      fade: 0.015,
      gravity: 0,
      spin: [-0.05, 0.05],
    },
    burst: {
      shape: "star",
      colors: ["#38bdf8", "#0ea5e9", "#ffffff"],
      count: 18,
      speed: [1.5, 4.0],
      sizeRange: [3, 6],
      gravity: 0.05,
      fade: 0.02,
      spin: [-0.1, 0.1],
    },
    cupDecoration: "glint",
    glintChars: ["✨", "💫"],
    glintColor: "#7dd3fc",
    menu: CLASSIC_MENU,
    brewBubbles: [
      "🛎️ 맞춤형 스페셜 음료가 준비되었습니다! ☕ 오늘도 힘내세요.",
      "🛎️ 달콤하고 신선한 한 잔을 전해드립니다! ✨ 기분 좋은 하루 되세요.",
    ],
    hoverBubble: (name) => `${name}가 맞춤 음료를 준비하고 있습니다 ✨`,
    brewingMessage: (name, drink) => `✨ ${name}가 ${drink}를 정성껏 준비 중입니다.`,
    servedMessage: (_name, drink) => `✨ 주문하신 ${drink} 나왔습니다. 즐거운 시간 되세요!`,
  },
};

const PRESET_TO_KIND: Record<string, PersonaKind> = {
  karina: "karina",
  barista: "barista",
  secretary: "secretary",
  pm: "pm",
  chaerin: "chaerin",
  ropan: "ropan",
  senior_dev: "senior_dev",
  fantasy_mage: "fantasy_mage",
  detective: "detective",
  cheerleader: "cheerleader",
  doggo: "doggo",
  cat_master: "cat_master",
};

const NAME_HINTS: { kind: PersonaKind; keywords: string[] }[] = [
  { kind: "ropan", keywords: ["로판", "영애", "만찢녀", "세리아", "공녀", "베아트리체"] },
  { kind: "chaerin", keywords: ["채린", "채스터", "칼찌"] },
  { kind: "pm", keywords: ["칼퇴", "봇", "로봇"] },
  { kind: "secretary", keywords: ["부장", "차장", "과장", "김부장"] },
  { kind: "senior_dev", keywords: ["테드", "개발자", "시니어", "판교"] },
  { kind: "fantasy_mage", keywords: ["마법", "루미엘", "메이지", "위자드"] },
  { kind: "detective", keywords: ["탐정", "셜록", "추리"] },
  { kind: "cheerleader", keywords: ["캡틴", "열혈", "코치", "트레이너"] },
  { kind: "doggo", keywords: ["뽀삐", "댕댕", "강아지", "리트리버"] },
  { kind: "cat_master", keywords: ["미야", "고양이", "냥이", "점장"] },
  { kind: "karina", keywords: ["카리나"] },
];

export function resolvePersonaKind(presetId?: string, baristaName?: string): PersonaKind {
  if (presetId && PRESET_TO_KIND[presetId]) return PRESET_TO_KIND[presetId];

  const name = baristaName || "";
  for (const hint of NAME_HINTS) {
    if (hint.keywords.some((keyword) => name.includes(keyword))) return hint.kind;
  }

  return "barista";
}

export function getPersonaEffect(presetId?: string, baristaName?: string): PersonaEffect {
  return PERSONA_EFFECTS[resolvePersonaKind(presetId, baristaName)] || PERSONA_EFFECTS.barista;
}

export function getPersonaAvatar(effect: PersonaEffect, isBrewing: boolean): string {
  return isBrewing ? effect.avatarBrewing : effect.avatarIdle;
}
