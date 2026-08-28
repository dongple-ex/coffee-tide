import type {
  CanvasAiAction,
  CanvasDocument,
  CanvasExtractedTask,
  CanvasTransformResult,
} from "../canvas/types";
import { checkChromeCanaryAiStatus, runChromeCanaryPrompt } from "./chromeCanaryAi";
import { generateId } from "../ids";

const LS_CANVAS_DOCS = "ct_canvas_documents";
const LS_ACTIVE_CANVAS_ID = "ct_active_canvas_id";

/**
 * 캔버스 AI 변환 클라이언트 오케스트레이터
 * 1. 크롬 카나리 Built-in AI(Gemini Nano) 활성 시: 0ms 온디바이스 로컬 실행
 * 2. 미지원/비활성 시: Next.js API (/api/copilot/canvas)를 통한 Gemini 2.5 Flash 클라우드 호출
 * 3. 오프라인/에러 시: 로컬 텍스트 변환 룰 자동 폴백
 */
export async function transformCanvasContentClient(params: {
  content: string;
  action: CanvasAiAction;
  customPrompt?: string;
  docTitle?: string;
  docType?: string;
  personaName?: string;
}): Promise<CanvasTransformResult> {
  const { content, action, customPrompt, docTitle, docType, personaName } = params;

  // 1. 크롬 카나리 온디바이스 AI 확인
  try {
    const canaryStatus = await checkChromeCanaryAiStatus();
    if (canaryStatus.supported && canaryStatus.status === "ready") {
      let promptInstruction = "";
      let isExtractTasks = false;

      switch (action) {
        case "shorten":
          promptInstruction = "핵심 의미는 보존하고 30~50% 압축하여 간결한 마크다운으로 재작성하세요.";
          break;
        case "expand":
          promptInstruction = "상세한 배경과 실행 방안, 주의사항을 풍부하게 보강하여 완성도 높은 마크다운으로 확장하세요.";
          break;
        case "tone_karina":
          promptInstruction = "카리나 스타일(활기차고 센스 있는 친근한 어조, 이모지 활용, 동기부여)로 재작성하세요.";
          break;
        case "tone_kim":
          promptInstruction = "김부장 스타일(정중하고 격식 있는 신뢰감 넘치는 비즈니스 문체 ~하십시오, ~바랍니다)로 재작성하세요.";
          break;
        case "tone_ontime":
          promptInstruction = "칼퇴봇 스타일(사족 없는 초간결 개조식, [우선순위], [필수 액션], [블로커])로 재작성하세요.";
          break;
        case "tone_chaerin":
          promptInstruction = "칼찌장인 채린이 스타일(시니컬하면서도 자신감 넘치는 개구쟁이 톤, 촌철살인 핵심 지적과 위트 있는 반전 매력)로 재작성하세요.";
          break;
        case "fix_grammar":
          promptInstruction = "오탈자, 띄어쓰기, 어색한 문맥을 표준 한국어에 맞게 정밀 교정하세요.";
          break;
        case "to_table":
          promptInstruction = "본문의 비교 데이터와 항목들을 읽기 쉬운 Markdown Table(표)로 변환하세요.";
          break;
        case "extract_tasks":
          isExtractTasks = true;
          promptInstruction = '본문에서 즉시 실행할 할 일 목록을 추출하여 JSON 배열로 반환하세요. 예: [{"title": "...", "category": "action_required", "estimatedMinutes": 30}]';
          break;
        case "custom":
        default:
          promptInstruction = customPrompt || "지침에 따라 문서를 다듬어주세요.";
          break;
      }

      const systemPrompt = `당신은 Chrome Canary 온디바이스 Gemini Nano 캔버스 어시스턴트(${personaName || "AI 바리스타"})입니다. 순수 결과물 마크다운만 출력하세요.`;
      const userPrompt = `[문서 제목]: ${docTitle || "무제"}\n[지시사항]: ${promptInstruction}\n\n[본문]:\n${content}`;

      const response = await runChromeCanaryPrompt(systemPrompt, userPrompt);
      if (response && response.trim()) {
        if (isExtractTasks) {
          try {
            const match = response.match(/\[[\s\S]*\]/);
            const jsonStr = match ? match[0] : response;
            const parsed = JSON.parse(jsonStr) as Array<{ title: string; category?: string; estimatedMinutes?: number }>;
            const extractedTasks: CanvasExtractedTask[] = parsed.map((item) => ({
              id: generateId("ctask"),
              title: item.title || "추출된 할 일",
              category: (item.category as CanvasExtractedTask["category"]) || "action_required",
              estimatedMinutes: item.estimatedMinutes || 30,
              selected: true,
            }));
            return {
              content,
              extractedTasks,
              providerUsed: "chrome_canary_nano",
            };
          } catch {
            // JSON 파싱 실패 시 일반 텍스트 라인 파싱 폴백
          }
        }
        return {
          content: response.trim(),
          providerUsed: "chrome_canary_nano",
        };
      }
    }
  } catch (err) {
    console.info("[CanvasAI] Chrome Canary AI unavailable or skipped. Falling back to server API.", err);
  }

  // 2. 서버 사이드 Gemini 2.5 Flash API 호출
  try {
    const res = await fetch("/api/copilot/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        action,
        customPrompt,
        docTitle,
        docType,
        personaName,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        content: string;
        extractedTasks?: CanvasExtractedTask[];
        providerUsed?: "gemini_cloud" | "local_rules";
      };
      return {
        content: data.content,
        extractedTasks: data.extractedTasks,
        providerUsed: data.providerUsed || "gemini_cloud",
      };
    }
  } catch (err) {
    console.warn("[CanvasAI] Server API call failed. Using local fallback.", err);
  }

  // 3. 로컬 규칙 폴백
  if (action === "extract_tasks") {
    const lines = content
      .split("\n")
      .map((l) => l.trim().replace(/^[-*•\d.]+\s*/, ""))
      .filter((l) => l.length > 2 && !l.startsWith("#"));
    const extractedTasks: CanvasExtractedTask[] = lines.slice(0, 6).map((title) => ({
      id: generateId("ctask"),
      title,
      category: "action_required",
      estimatedMinutes: 30,
      selected: true,
    }));
    return {
      content,
      extractedTasks,
      providerUsed: "local_rules",
    };
  }

  return {
    content: content,
    providerUsed: "local_rules",
  };
}

/**
 * 캔버스 문서 로컬 저장소 유틸
 */
export function saveCanvasDocsToLS(docs: CanvasDocument[], activeId?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_CANVAS_DOCS, JSON.stringify(docs));
    if (activeId) {
      localStorage.setItem(LS_ACTIVE_CANVAS_ID, activeId);
    }
  } catch (e) {
    console.warn("[CanvasLS] Failed to save canvas documents:", e);
  }
}

export function loadCanvasDocsFromLS(): { docs: CanvasDocument[]; activeId: string | null } {
  if (typeof window === "undefined") return { docs: [], activeId: null };
  try {
    const raw = localStorage.getItem(LS_CANVAS_DOCS);
    const activeId = localStorage.getItem(LS_ACTIVE_CANVAS_ID);
    if (!raw) return { docs: [], activeId: null };
    const docs = JSON.parse(raw) as CanvasDocument[];
    return { docs, activeId };
  } catch {
    return { docs: [], activeId: null };
  }
}
