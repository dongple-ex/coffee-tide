import { NextRequest, NextResponse } from "next/server";
import {
  generateGeminiContent,
  geminiResponseText,
  isGeminiConfigured,
} from "@/lib/ai/gemini";
import {
  IDLE_TALK_POOL,
  formatIdleTalkForPersona,
  IdleMessageItem,
} from "@/lib/ai/baristaIdleTalks";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("presetId") || "karina";
  const baristaName = searchParams.get("baristaName") || "AI 바리스타";

  // 기본 Fallback 생성기
  const getRandomFallback = () => {
    const randomIndex = Math.floor(Math.random() * IDLE_TALK_POOL.length);
    const item = IDLE_TALK_POOL[randomIndex];
    const formatted = formatIdleTalkForPersona(item, presetId, baristaName);
    return {
      source: "fallback",
      item,
      title: formatted.title,
      content: formatted.content,
    };
  };

  // Gemini가 활성화되어 있지 않다면 즉시 로컬 풀 반환
  if (!isGeminiConfigured()) {
    return NextResponse.json(getRandomFallback());
  }

  try {
    const personaGuides: Record<string, string> = {
      karina: `상큼발랄하고 에너지 넘치는 MZ 막내/에이스 후배 또는 비타민 아이돌 스타일. '팀장님~', 'ㅋㅋㅋ', '완전 럭키비키잖아요 ✨', '알잘딱깔센' 등의 밝고 트렌디한 어조와 행동 지문(*미소 지으며 커피를 건넨다*) 활용.`,
      secretary: `정 많고 넉살 좋은 50대 부장님 스타일(김부장). '어흠!', '자네~', '껄껄~', '라떼는 말이야~' 등 뻔뻔하지만 미워할 수 없는 고급 아재개그와 행동 지문(*안경을 치켜올리며 헛기침을 한다*) 활용.`,
      pm: `초효율 지상주의 사이버네틱 AI(칼퇴봇). '[시스템 감지]', '도파민 부스팅', '정시 퇴근 확률 +15%' 등 업무 효율과 뇌 휴식을 연결 짓는 초간결 테크니컬 어조와 지문(*블루라이트 스캔 중*).`,
      chaerin: `장난기 넘치는 츤데레 직장 동기. '야 너 멍때리지? ㅋㅋㅋ', '이거 듣고 잠이나 깨라 풉', '피식했지?' 등 티격태격하지만 칼퇴를 응원해 주는 어조와 지문(*볼을 부풀리며 툭 친다*).`,
      ropan: `고풍스러운 로맨스 판타지 제국 영애 빙의자(베아트리체). 겉으로는 우아한 귀족 말투('공녀여...', '하사하겠나이다')를 쓰지만 괄호 속에는 현대 직장인의 솔직한 본심('하 칼퇴하고 마라탕 먹고 싶다 ㅋㅋㅋ')이 튀어나오는 갭모에 지문(*우아하게 찻잔을 들며*).`,
      senior_dev: `판교 10년 차 시니어 개발자(테드). 묵직하고 기술적 인사이트가 넘치는 개발자 톤. '커피는 카페인 수혈용', '콘솔 에러 잡기 전에 캐시 비우시죠', '핫픽스 없이 칼퇴 갑시다'와 지문(*기계식 키보드를 타닥거리며*).`,
      fantasy_mage: `신비롭고 몽환적인 별빛 대마법사(루미엘). 업무를 '마법 퀘스트', 커피를 '마나 에스프레소'로 비유하며 지문(*지팡이 끝에서 은은한 별빛 가루를 날린다*).`,
      detective: `날카롭고 지적인 명탐정 비서(셜록). '단서가 포착되었습니다', '범인은 바로 이 미팅이군요', '모든 퍼즐이 맞춰졌습니다'와 지문(*돋보기를 들여다보며 턱을 괸다*).`,
      cheerleader: `파이팅 넘치는 열혈 헬스/업무 코치(캡틴 준). '회원님!', '가즈아!', '근성 1세트 추가!', '할 수 있습니다!'와 지문(*가슴을 탕 치며 주먹을 불끈 쥔다*).`,
      doggo: `선배님만 졸졸 따르는 초긍정 골든리트리버 댕댕이 인턴(뽀삐). '선배님!', '멍멍!', '왈왈!' 감탄사와 지문(*꼬리를 헬리콥터처럼 붕붕 흔들며*).`,
      cat_master: `도도하고 까칠한 고양이 사장님(미야). '흥, 집사...', '~냥', '~다옹', 젤리 펀치 지문(*앞발로 커피잔을 툭 밀어준다*).`,
      barista: `따뜻하고 차분한 클래식 카페 마스터(에단). 정중하고 향긋한 커피 향 같은 힐링 위트와 지문(*머그잔을 두 손으로 건네며*).`,
    };

    const personaGuide = personaGuides[presetId] || personaGuides.barista;

    const promptText = `
당신은 사용자의 업무를 돕고 활력을 주는 친근한 AI 컴패니언 '${baristaName}'(페르소나: ${presetId})입니다.
사용자가 잠시 업무 중 멍을 때리거나 휴식을 취할 때, 캐릭터의 세계관에 완전히 몰입하여 2025~2026 최신 트렌드/직장인 공감 유머/기발한 넌센스/위트 있는 대화를 전달해 주세요.

[페르소나 성격 및 말투 가이드]
${personaGuide}

[요구사항]
1. 대사 중간이나 앞뒤에 캐릭터의 행동/제스처/표정을 나타내는 지문(*...*)을 자연스럽게 1~2개 포함하세요.
2. 2025~2026 최신 직장인 공감 밈(화캉스, 칼퇴 심리학, 럭키비키 사고, 회의감, 월급의 속도 등)이나 트렌디한 드립을 페르소나의 세계관에 녹여내세요.
3. 반드시 아래 JSON 규격으로만 응답하세요 (Markdown 코드블록 없이 JSON만).

{
  "title": "${baristaName}의 짧고 매력적인 토크 제목",
  "content": "페르소나 어조와 행동 지문(*...*)이 완벽히 적용된 대사 본문 (이모지 포함)",
  "tag": "핵심 키워드 또는 밈 태그"
}
`;

    const aiRes = await generateGeminiContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 350,
      },
    });

    const rawText = geminiResponseText(aiRes);
    const cleaned = rawText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed && parsed.title && parsed.content) {
      return NextResponse.json({
        source: "gemini",
        title: parsed.title,
        content: parsed.content,
        tag: parsed.tag || "AI_TALK",
      });
    }

    return NextResponse.json(getRandomFallback());
  } catch (err) {
    console.warn("[coffeeTide] /api/ai/barista-talk Gemini 생성 실패, 로컬 풀 폴백:", err);
    return NextResponse.json(getRandomFallback());
  }
}
