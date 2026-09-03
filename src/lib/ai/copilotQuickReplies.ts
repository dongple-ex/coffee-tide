// 💬 코파일럿 티키타카 추천 답변 & 원클릭 액션 칩 생성 엔진 (Quick Replies Engine)
// 캐릭터의 성격, 현재 시간대, 업무 잔여 상태(긴급 건 등)에 맞춰 동적으로 최적의 선택지 칩을 제공합니다.

export interface QuickReplyChip {
  id: string;
  label: string;
  query: string;
  icon?: string;
  category: "productivity" | "roleplay" | "refresh" | "analysis";
}

interface ContextOptions {
  presetId?: string;
  baristaName?: string;
  hasUrgentTasks?: boolean;
  taskCount?: number;
  completedCount?: number;
  canvasEnabled?: boolean;
}

export function getQuickReplies({
  presetId = "karina",
  baristaName = "AI 바리스타",
  hasUrgentTasks = false,
  taskCount = 0,
  completedCount = 0,
  canvasEnabled = true,
}: ContextOptions): QuickReplyChip[] {
  const hour = new Date().getHours();
  const chips: QuickReplyChip[] = [];

  // 1. 업무 상태별 생산성 액션
  if (hasUrgentTasks) {
    chips.push({
      id: "urgent_focus",
      label: "긴급 마감 건 해결 단계 추천",
      query: "오늘 마감이 얼마 남지 않은 가장 긴급한 업무 1건에 대해 지금 당장 시작할 수 있는 구체적인 실행 단계를 3단계로 정리해줘.",
      category: "productivity",
    });
  } else if (taskCount > 0) {
    chips.push({
      id: "priority_recommend",
      label: "지금 바로 처리할 1순위 추천",
      query: "남은 업무 중에서 지금 가장 효율적으로 끝낼 수 있는 최우선 작업 1개와 예상 소요시간을 추천해줘.",
      category: "productivity",
    });
  } else {
    chips.push({
      id: "today_summary",
      label: "오늘 브리핑 3줄 요약",
      query: "오늘 전체 일정과 꼭 챙겨야 할 핵심 사항을 3줄로 알기 쉽게 요약해줘.",
      category: "productivity",
    });
  }

  // 2. 캐릭터별 맞춤형 티키타카 롤플레잉
  switch (presetId) {
    case "karina":
      chips.push({
        id: "karina_talk",
        label: "카리나에게 파이팅 응원 받기",
        query: `*카리나가 건네준 시그니처 럭키 라떼를 한 모금 마시며* "카리나 덕분에 오늘 업무 완전 럭키비키하게 끝낼 수 있을 것 같아! 응원 한마디 해줘 ✨"`,
        category: "roleplay",
      });
      break;

    case "kim":
      chips.push({
        id: "kim_talk",
        label: "김부장에게 칼퇴 비법 묻기",
        query: `*노란 맥심 다방커피를 정성스레 저으며* "부장님! 오늘 결재 싹 털고 6시 땡 칼퇴 가능하겠습니까? 부장님만의 칼퇴 비법 하나 전수해 주시죠!"`,
        category: "roleplay",
      });
      break;

    case "calm":
      chips.push({
        id: "calm_talk",
        label: "칼퇴봇에게 최적 경로 분석 요청",
        query: `*스마트워치 알람을 확인하며* "칼퇴봇, 18시 00분 퇴근을 위한 가장 효율적인 업무 스케줄링 알고리즘을 계산해줘."`,
        category: "roleplay",
      });
      break;

    case "ted":
      chips.push({
        id: "ted_talk",
        label: "테드에게 업무 병목 해결 팁 묻기",
        query: `*키보드를 두드리며* "테드 선배님, 오늘 처리할 업무 중에서 가장 병목(Bottleneck)이 될 만한 구간이 어딜까요? 선배님의 시니어 감각으로 짚어주세요."`,
        category: "roleplay",
      });
      break;

    case "poppy":
      chips.push({
        id: "poppy_talk",
        label: "뽀삐에게 격려와 응원 건네기",
        query: `*뽀삐의 머리를 부드럽게 쓰다듬으며* "우리 댕댕이 인턴 뽀삐야! 오늘 선배님이 멋지게 일 끝낼 테니까 간식 먹으면서 기다려! 멍멍!"`,
        category: "roleplay",
      });
      break;

    case "miya":
      chips.push({
        id: "miya_talk",
        label: "미야 점장에게 커피 맛 칭찬하기",
        query: `*조심스레 츄르를 테이블에 올려놓으며* "미야 점장님, 오늘 내린 캣닢 콜드브루 최고예요. 오늘 업무도 냥냥펀치로 다 부숴버릴까요?"`,
        category: "roleplay",
      });
      break;

    default:
      chips.push({
        id: "default_talk",
        label: `${baristaName}에게 감사 인사하기`,
        query: `*따뜻한 머그잔을 두 손으로 감싸 쥐며* "${baristaName}, 정성껏 내려준 커피 덕분에 오늘 일도 힘차게 해볼게! 오늘 하루 잘 부탁해!"`,
        category: "roleplay",
      });
      break;
  }

  // 3. 시간대별 리프레시 / 회고
  if (hour >= 17) {
    chips.push({
      id: "wrapup_handoff",
      label: "오늘 업무 회고 및 내일 할 일 정리",
      query: "오늘 처리 완료된 업무들을 바탕으로 깔끔한 '일일 업무 회고 및 내일 인수인계(Handoff) 리포트'를 작성해줘.",
      category: "analysis",
    });
  } else if (hour >= 13 && hour <= 16) {
    chips.push({
      id: "afternoon_refresh",
      label: "3분 졸음 퇴치 & 스트레칭 제안",
      query: "오후에 나른하고 집중력이 떨어질 때 3분 만에 뇌를 깨울 수 있는 간단한 스트레칭과 리프레시 조언을 해줘.",
      category: "refresh",
    });
  } else {
    chips.push({
      id: "focus_timer",
      label: "25분 뽀모도로 집중 가이드",
      query: "지금부터 25분 동안 완벽히 몰입해서 끝낼 수 있도록 핵심 태스크를 지정해 주고 집중 시작을 선언해줘!",
      category: "productivity",
    });
  }

  // 4. AI 캔버스 문서화 지원
  if (canvasEnabled) {
    chips.push({
      id: "canvas_action",
      label: "메모 및 일정을 표 형태로 정리",
      query: "오늘의 주요 메모와 일정들을 캔버스에 붙여넣기 좋게 '표(Table)' 및 체크리스트 형태로 깔끔하게 구조화해줘.",
      category: "analysis",
    });
  }

  return chips;
}
