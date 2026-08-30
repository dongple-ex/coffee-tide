// 🎨 페르소나별 시각 효과 정의 — 아바타, 파티클, 메뉴, 벨 대사, 액션 컷인을 한곳에서 관리한다.
//
// 기존에는 CafeBaristaScene, BaristaBrewing, InteractiveBarista3D가 각자
// `presetId === "chaerin" || baristaName.includes("채린")` 형태의 판별을 중복으로 갖고 있었다.
// 그 탓에 이름을 바꾸면 컴포넌트마다 효과가 어긋났고, 실질적인 효과도 채린이 여부 하나로만 갈렸다.
// 이 모듈이 판별과 효과를 모두 책임지므로 세 컴포넌트는 결과만 받아 쓰면 된다.

export type PersonaKind = "karina" | "barista" | "secretary" | "pm" | "chaerin";

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
  /** 방출 간격 (밀리초). 값이 작을수록 촘촘하게 뿜어져 나온다 */
  spawnIntervalMs: number;
  /** 방출 지점을 기준으로 좌우/상하로 흩뿌리는 정도 (아바타 크기 대비 비율) */
  spreadX: number;
  spreadY: number;
  /** 초기 상승 속도 범위 (픽셀/프레임, 음수가 위쪽) */
  riseSpeed: [number, number];
  /** 초기 크기 범위 */
  sizeRange: [number, number];
  /** 프레임마다 커지는 정도 (연기가 퍼지는 표현) */
  growth: number;
  /** 프레임마다 줄어드는 투명도 */
  fade: number;
  /** 프레임마다 더해지는 아래 방향 가속도 */
  gravity: number;
  /** 회전 속도 범위 */
  spin: [number, number];
}

/** 아바타를 클릭했을 때 한 번에 터지는 파티클 */
export interface BurstParticleSpec {
  shape: ParticleShape;
  colors: string[];
  /** 한 번에 터뜨릴 개수 */
  count: number;
  /** 퍼져 나가는 속도 범위 */
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
  /** 선택한 음료 이름이 들어갈 자리를 {drink}로 표시한다 */
  subtitleTemplate: string;
  /** 컷인 배너에 띄울 이미지. 전용 이미지가 없으면 생략한다 */
  image?: string;
  /** 컷인 배색 (테두리/발광) */
  colorA: string;
  colorB: string;
  durationMs: number;
}

export interface PersonaEffect {
  kind: PersonaKind;
  /** 씬 강조 색 (메뉴 칩, 배지 등) */
  accent: string;
  avatarIdle: string;
  avatarBrewing: string;
  ambient: AmbientParticleSpec;
  burst: BurstParticleSpec;
  /** 카운터 잔 위에 띄우는 장식: 스팀 기둥 또는 반짝이는 별 */
  cupDecoration: "steam" | "glint";
  /** 카운터 잔 위 반짝임에 쓸 문자 (cupDecoration이 glint일 때만 사용) */
  glintChars: string[];
  glintColor: string;
  menu: PersonaMenuItem[];
  /** 벨을 눌러 음료를 내리는 중일 때의 문구 */
  brewingMessage: (baristaName: string, drink: string) => string;
  /** 음료가 완성되었을 때의 문구 */
  servedMessage: (baristaName: string, drink: string) => string;
  /** 브루잉 카드에서 클릭했을 때 띄우는 말풍선 문구 후보 */
  brewBubbles: string[];
  /** 브루잉 카드에서 마우스를 올렸을 때의 안내 문구 */
  hoverBubble: (baristaName: string) => string;
  /** 페르소나 전용 액션 컷인. 컷인이 없는 페르소나는 undefined */
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

const PERSONA_EFFECTS: Record<PersonaKind, PersonaEffect> = {
  // 🌟 카리나 — 별빛이 우아하게 떠오르는 화사한 연출
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

  // ☕ 클래식 바리스타 — 따뜻하고 부드러운 스팀
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
      "🛎️ 주문하신 부드러운 카푸치노 나왔습니다! ☁️ 여유롭고 깔끔한 하루 보내세요.",
    ],
    hoverBubble: (name) => `${name}가 커피를 내리는 중이에요 ☕`,
    brewingMessage: (name, drink) => `🛎️ ${name}가 신선한 ${drink}를 내리는 중입니다! ☕`,
    servedMessage: (_name, drink) => `✨ 주문하신 ${drink} 나왔습니다! 맛있게 드세요.`,
  },

  // 💼 김부장 — 묵직하고 느리게 피어오르는 짙은 김
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
      riseSpeed: [-0.75, -0.4],
      sizeRange: [6, 10],
      growth: 0.24,
      fade: 0.009,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "star",
      colors: ["#d97706", "#b45309", "#fbbf24", "#78350f"],
      count: 14,
      speed: [1, 2.6],
      sizeRange: [3.5, 7.5],
      gravity: 0.14,
      fade: 0.019,
      spin: [-0.07, 0.07],
    },
    cupDecoration: "steam",
    glintChars: [],
    glintColor: "#fde68a",
    menu: SECRETARY_MENU,
    brewBubbles: [
      "🛎️ 진한 더블샷 한 잔 받게. ☕ 오전 결재부터 차분히 정리해 보지.",
      "🛎️ 손수 내린 핸드드립일세. 🫖 급할수록 한 박자 쉬어 가는 법이야.",
      "🛎️ 자네도 다방커피 한 잔 하겠나? 🥄 옛날엔 이거 하나로 하루를 버텼지.",
      "🛎️ 홍차 한 잔 내왔네. 🍵 숨 고르고 다시 시작하게.",
    ],
    hoverBubble: (name) => `${name}이 커피를 손수 내리는 중이네`,
    brewingMessage: (name, drink) => `🛎️ ${name}이 ${drink} 손수 내리는 중이네. 잠깐 기다리게.`,
    servedMessage: (_name, drink) => `☕ 자, ${drink} 나왔네. 식기 전에 한 모금 하고 하게나.`,
    cutin: {
      badge: "📋 결재 라인 가동",
      title: "커피는 내가 낼 테니, 자네는 일하게",
      subtitleTemplate: "{drink} 준비 지시 완료",
      colorA: "#f59e0b",
      colorB: "#78350f",
      durationMs: 1500,
    },
  },

  // ⚡ 칼퇴봇 — 빠르게 솟구치는 전자 신호 데이터 픽셀
  pm: {
    kind: "pm",
    accent: "#4ade80",
    avatarIdle: "/barista/barista_robot_3d.png",
    avatarBrewing: "/barista/barista_robot_3d.png",
    ambient: {
      shape: "pixel",
      colors: ["#22d3ee", "#4ade80", "#a3e635", "#ffffff"],
      spawnIntervalMs: 60,
      spreadX: 0.42,
      spreadY: 0.3,
      riseSpeed: [-2.2, -1.3],
      sizeRange: [1.6, 3.2],
      growth: 0,
      fade: 0.024,
      gravity: 0,
      spin: [0, 0],
    },
    burst: {
      shape: "pixel",
      colors: ["#22d3ee", "#4ade80", "#a3e635", "#ffffff", "#67e8f9"],
      count: 24,
      speed: [2.2, 5],
      sizeRange: [1.8, 4],
      gravity: 0.01,
      fade: 0.03,
      spin: [0, 0],
    },
    cupDecoration: "glint",
    glintChars: ["✦", "▫", "▪"],
    glintColor: "#4ade80",
    menu: PM_MENU,
    brewBubbles: [
      "🛎️ [완료] 트리플샷 제공. ⚡ 잔여 업무 처리 속도 상승 예상.",
      "🛎️ [완료] 에너지드링크 제공. 🔋 집중력 최대 출력 모드 진입.",
      "🛎️ [완료] 아이스벤티 제공. 🧊 재방문 없이 오래 사용 가능.",
      "🛎️ [완료] 프로틴셰이크 제공. 🥤 식사 시간 절약분 12분.",
    ],
    hoverBubble: () => "[대기 중] 음료 추출 준비 완료. 클릭 시 즉시 제공.",
    brewingMessage: (_name, drink) => `[처리 중] ${drink} 추출 진행. 예상 소요 3초.`,
    servedMessage: (_name, drink) => `[완료] ${drink} 제공. 다음 작업으로 복귀하십시오.`,
    cutin: {
      badge: "⚡ FAST TRACK MODE",
      title: "군더더기 제거. 정시 퇴근 경로 확보.",
      subtitleTemplate: "{drink} 처리 완료 · 대기 시간 0초",
      colorA: "#22d3ee",
      colorB: "#4ade80",
      durationMs: 1400,
    },
  },

  // 🃏 칼찌장인 채린이 — 차갑게 빛나는 얼음 결정 섬광
  chaerin: {
    kind: "chaerin",
    accent: "#67e8f9",
    avatarIdle: "/barista/barista_chaerin_3d.png",
    avatarBrewing: "/barista/barista_chaerin_3d.png",
    ambient: {
      shape: "crystal",
      colors: ["#67e8f9", "#ffffff", "#c084fc", "#f472b6", "#a5f3fc"],
      spawnIntervalMs: 90,
      spreadX: 0.5,
      spreadY: 0.3,
      riseSpeed: [-0.8, -0.35],
      sizeRange: [2.2, 5.4],
      growth: 0,
      fade: 0.016,
      gravity: 0.01,
      spin: [-0.075, 0.075],
    },
    burst: {
      shape: "crystal",
      colors: ["#67e8f9", "#ffffff", "#c084fc", "#f472b6", "#a5f3fc"],
      count: 20,
      speed: [1.8, 4.5],
      sizeRange: [3, 6.5],
      gravity: 0.05,
      fade: 0.024,
      spin: [-0.2, 0.2],
    },
    cupDecoration: "glint",
    glintChars: ["✨", "✦", "✧"],
    glintColor: "#a5f3fc",
    menu: CHAERIN_MENU,
    brewBubbles: [
      "🛎️ 주문하신 달콤상큼 복숭아아이스티 나왔거든? 🍑 시원하게 당 충전하고 기운 차려!",
      "🛎️ 톡 쏘는 청량한 레모네이드 한 잔! 🍋 정신이 번쩍 들지? 훗~",
      "🛎️ 진하고 달콤한 시원한 아이스초코 완성! 🍫 이거 마시고 더 힘내보든가!",
      "🛎️ 시원한 과일프라페 대령이요! 🍧 내가 특별히 맛있게 만들었지!",
    ],
    hoverBubble: (name) => `${name}가 시원한 아이스 음료를 내리는 중이에요 🍧`,
    brewingMessage: (name, drink) => `⚔️ 슉. 슈슉. ${name}가 번개처럼 ${drink} 제조 중! 🗡️✨`,
    servedMessage: (_name, drink) => `🛎️ 훗! 특제 ${drink} 완성! 시원하게 마시든가! 🍑`,
    cutin: {
      badge: "⚡ SPECIAL ACTION CUT-IN",
      title: "슉. 슈슉. 칼찌 제조 중!",
      subtitleTemplate: "{drink} 주문 접수 완료 🗡️",
      image: "/barista/barista_chaerin_action.png",
      colorA: "#f472b6",
      colorB: "#38bdf8",
      durationMs: 1600,
    },
  },
};

/** presetId가 곧바로 페르소나 종류가 되는 경우의 대응표 */
const PRESET_TO_KIND: Record<string, PersonaKind> = {
  karina: "karina",
  barista: "barista",
  secretary: "secretary",
  pm: "pm",
  chaerin: "chaerin",
};

/** 이름만으로 페르소나를 추정해야 할 때 사용하는 키워드 (custom 프리셋 대응) */
const NAME_HINTS: { kind: PersonaKind; keywords: string[] }[] = [
  { kind: "chaerin", keywords: ["채린", "채스터", "칼찌"] },
  { kind: "pm", keywords: ["칼퇴", "봇", "로봇"] },
  { kind: "secretary", keywords: ["부장", "차장", "과장"] },
  { kind: "karina", keywords: ["카리나"] },
];

/**
 * 페르소나 종류를 판별한다.
 * presetId를 우선 기준으로 삼고, custom이거나 알 수 없는 값일 때만 이름으로 추정한다.
 * 따라서 프리셋을 고른 뒤 이름을 자유롭게 바꾸어도 효과가 어긋나지 않는다.
 */
export function resolvePersonaKind(presetId?: string, baristaName?: string): PersonaKind {
  if (presetId && PRESET_TO_KIND[presetId]) return PRESET_TO_KIND[presetId];

  const name = baristaName || "";
  for (const hint of NAME_HINTS) {
    if (hint.keywords.some((keyword) => name.includes(keyword))) return hint.kind;
  }

  return "barista";
}

/** 페르소나 종류에 해당하는 효과 묶음을 돌려준다 */
export function getPersonaEffect(presetId?: string, baristaName?: string): PersonaEffect {
  return PERSONA_EFFECTS[resolvePersonaKind(presetId, baristaName)];
}

/** 브루잉 상태에 맞는 아바타 이미지 경로를 돌려준다 */
export function getPersonaAvatar(effect: PersonaEffect, isBrewing: boolean): string {
  return isBrewing ? effect.avatarBrewing : effect.avatarIdle;
}
