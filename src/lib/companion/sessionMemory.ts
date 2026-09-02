// 🧵 CoffeeTide 대화 세션 기억 관리자 (Phase 17-B 심층 구현)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §9.1

export interface SessionMessageTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface CompanionSessionState {
  sessionId: string;
  personaId: string;
  turns: SessionMessageTurn[];
  rollingSummary?: string;
  lastActiveAt: number;
}

const MAX_SESSION_TURNS = 10;
const ESTIMATED_MAX_CHARS = 3000; // 약 800 토큰 예산 가드

const inMemorySessions = new Map<string, CompanionSessionState>();

/** 세션 상태 조회 또는 생성 */
export function getOrCreateCompanionSession(
  sessionId: string,
  personaId = "karina"
): CompanionSessionState {
  let session = inMemorySessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      personaId,
      turns: [],
      lastActiveAt: Date.now(),
    };
    inMemorySessions.set(sessionId, session);
  }
  return session;
}

/**
 * 새 메시지 턴 추가 및 토큰 예산 관리
 * - 최대 10턴 유지, 초과 시 오래된 턴 정리
 * - 글자수 초과 시 오래된 턴부터 롤링 요약으로 압축
 */
export function appendSessionTurn(
  sessionId: string,
  turn: { role: "user" | "assistant"; content: string },
  personaId = "karina"
): CompanionSessionState {
  const session = getOrCreateCompanionSession(sessionId, personaId);

  const newTurn: SessionMessageTurn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: turn.role,
    content: turn.content.trim(),
    timestamp: Date.now(),
  };

  session.turns.push(newTurn);
  session.lastActiveAt = Date.now();

  // 1. 최대 턴 수 초과 관리
  if (session.turns.length > MAX_SESSION_TURNS) {
    const pruned = session.turns.splice(0, session.turns.length - MAX_SESSION_TURNS);
    const prunedSummary = pruned
      .map((t) => `${t.role === "user" ? "사용자" : "바리스타"}: ${t.content.slice(0, 50)}`)
      .join(" / ");
    session.rollingSummary = session.rollingSummary
      ? `${session.rollingSummary} | 이전: ${prunedSummary}`
      : `이전 대화 요약: ${prunedSummary}`;
  }

  // 2. 글자수(토큰 예산) 초과 가드
  let totalChars = session.turns.reduce((sum, t) => sum + t.content.length, 0);
  while (totalChars > ESTIMATED_MAX_CHARS && session.turns.length > 2) {
    const dropped = session.turns.shift();
    if (dropped) {
      totalChars -= dropped.content.length;
    }
  }

  return session;
}

/** 세션 핸드오프용 컨텍스트 문자열 생성 */
export function getSessionContextForPrompt(session: CompanionSessionState): string {
  const lines: string[] = [];
  if (session.rollingSummary) {
    lines.push(`[이전 세션 흐름 요약]\n${session.rollingSummary}`);
  }

  if (session.turns.length > 0) {
    lines.push(`[최근 대화 맥락 (최신 ${session.turns.length}턴)]`);
    session.turns.forEach((t) => {
      lines.push(`${t.role === "user" ? "사용자" : "AI 바리스타"}: ${t.content}`);
    });
  }

  return lines.join("\n");
}
